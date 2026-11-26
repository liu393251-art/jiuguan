import { describe, expect, it } from 'vitest'

import type { ChatMessage } from '../types'
import {
  DEFAULT_MEMORY_PROMPT,
  MEMORY_COMPRESSION_CHUNK_CHARS,
  MEMORY_COMPRESSION_MAX_SUMMARY_CHARS,
  MEMORY_REFRESH_FORCE_CHARS,
  MEMORY_REFRESH_MIN_CHARS,
  MEMORY_WRITE_CHUNK_CHARS,
  MEMORY_WRITE_MAX_ATTEMPTS,
  MEMORY_WRITE_TIMEOUT_MS,
  buildCompressionChunkPrompt,
  buildCompressionMergeSystemPrompt,
  buildCompressionSystemPrompt,
  buildMemoryWriteMessages,
  buildMemoryWriteSystemPrompt,
  buildSummarySystemPrompt,
  chunkCompressionTranscript,
  collectCompressionTurns,
  countCompletedMessages,
  formatCompressionTurns,
  isRetryableMemoryWriteError,
  isValidMemoryEntryFormat,
  normalizeCompressedMemory,
  planMemoryRefresh,
  readMemoryCompletion,
  selectTurnsForMemoryWrite,
} from './memory-compression'

function message(
  role: ChatMessage['role'],
  content: string,
  status: ChatMessage['status'] = 'complete',
): ChatMessage {
  return {
    id: `${role}-${content.slice(0, 4)}`,
    sessionId: 'session-1',
    role,
    content,
    status,
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('memory compression helpers', () => {
  it('keeps only complete user and assistant turns with clean text', () => {
    const turns = collectCompressionTurns(
      [
        message('system', '系统提示'),
        message('user', '[[bubble]]你好，{{char}}。[[/bubble]]'),
        message('assistant', '「你来了。」[[narration]]她轻轻点头。[[/narration]]'),
        message('assistant', '写到一半', 'streaming'),
        message('user', '失败的请求', 'error'),
        message('user', '   '),
      ],
      '小白',
      '阿远',
    )

    expect(turns).toEqual([
      { role: 'user', content: '你好，小白。' },
      { role: 'assistant', content: '「你来了。」她轻轻点头。' },
    ])
    expect(formatCompressionTurns(turns, '小白', '阿远')).toEqual([
      '阿远：你好，小白。',
      '小白：「你来了。」她轻轻点头。',
    ])
  })

  it('chunks long transcripts without losing any line', () => {
    const lines = ['a'.repeat(700), 'b'.repeat(700), '短句']
    const chunks = chunkCompressionTranscript(lines, 1_000)
    const joined = chunks.join('\n')

    expect(chunks.length).toBe(2)
    expect(chunks.every((chunk) => chunk.length <= 1_000)).toBe(true)
    expect(joined).toContain('a'.repeat(700))
    expect(joined).toContain('b'.repeat(700))
    expect(joined).toContain('短句')
  })

  it('carries the custom instruction and previous memory into the prompt', () => {
    const system = buildCompressionSystemPrompt('保留未完成的约定。')
    const prompt = buildCompressionChunkPrompt({
      chunk: '阿远：明晚见。',
      index: 1,
      total: 2,
      previousMemory: '两人约好在酒馆见面。',
    })

    expect(system).toContain('保留未完成的约定。')
    expect(system).toContain('记忆条目')
    expect(prompt).toContain('第 1/2 段')
    expect(prompt).toContain('两人约好在酒馆见面。')
    expect(prompt).toContain('阿远：明晚见。')
  })

  it('removes code fences and caps the stored summary', () => {
    expect(normalizeCompressedMemory('```text\n长期记忆\n```')).toBe('长期记忆')
    expect(normalizeCompressedMemory('字'.repeat(20_000))).toHaveLength(
      MEMORY_COMPRESSION_MAX_SUMMARY_CHARS,
    )
  })

  it('uses the configured prompt for both compress and merge requests', () => {
    const prompt = '重点保留两个人的称呼变化和没说完的话。'
    const merge = buildCompressionMergeSystemPrompt(prompt)

    expect(merge).toContain(prompt)
    expect(merge).toContain('把多段记忆合并成一份')
    expect(buildCompressionMergeSystemPrompt('')).not.toContain('用户指定的记忆要求')
  })

  it('builds a summary prompt that is separate from the compression rules', () => {
    const system = buildSummarySystemPrompt('只记关系变化。')

    expect(system).toContain('只记关系变化。')
    expect(system).toContain('只输出摘要正文')
    expect(system).toContain('600 字以内')
    expect(system).not.toContain('记忆压缩器')
    expect(buildSummarySystemPrompt('')).toContain('长期记忆摘要器')
  })

  it('keeps a default memory prompt for empty settings', () => {
    expect(DEFAULT_MEMORY_PROMPT).toContain('承诺')
    expect(DEFAULT_MEMORY_PROMPT).toContain('时间线')
  })

  it('routes the memory prompt into both write modes', () => {
    const prompt = '记住她左手无名指的浅疤。'

    expect(buildMemoryWriteSystemPrompt('compressed', prompt)).toContain(prompt)
    expect(buildMemoryWriteSystemPrompt('summary', prompt)).toContain(prompt)
    expect(buildMemoryWriteSystemPrompt('compressed', '')).not.toContain('用户指定的记忆要求')
  })

  it('sends the prompt and the transcript in the same request', () => {
    const prompt = '重点写清楚两人对彼此的称呼怎么变的。'
    const messages = buildMemoryWriteMessages({
      kind: 'compressed',
      customPrompt: prompt,
      chunk: '沈昭宁：今晚几点关。\n苏念：平时十点半。',
      index: 2,
      total: 3,
      previousMemory: '两人在书店里第一次单独说话。',
    })

    expect(messages.system).toContain(prompt)
    expect(messages.system).toContain('记忆条目')
    expect(messages.user).toContain('第 2/3 段')
    expect(messages.user).toContain('沈昭宁：今晚几点关。')
    expect(messages.user).toContain('两人在书店里第一次单独说话。')
  })

  it('only refreshes the memory after enough new content', () => {
    const longChat = Array.from({ length: 30 }, (_, index) =>
      message(index % 2 === 0 ? 'user' : 'assistant', '字'.repeat(400)),
    )

    const firstRun = planMemoryRefresh(longChat, 0)
    expect(firstRun.coveredMessages).toBe(30)
    expect(firstRun.pendingMessages).toBe(30)
    expect(firstRun.needed).toBe(true)

    const afterRefresh = planMemoryRefresh(longChat, 22)
    expect(afterRefresh.pendingMessages).toBe(8)
    expect(afterRefresh.pendingChars).toBe(3_200)
    expect(afterRefresh.needed).toBe(false)

    const shortChat = planMemoryRefresh(longChat.slice(0, 4), 0)
    expect(shortChat.needed).toBe(false)

    const hugeMessage = planMemoryRefresh(
      [message('user', '字'.repeat(MEMORY_REFRESH_FORCE_CHARS + 200))],
      0,
    )
    expect(hugeMessage.needed).toBe(true)
  })

  it('ignores unfinished or empty messages when planning', () => {
    const messages = [
      message('system', '系统提示'),
      message('user', ''),
      message('assistant', '写到一半', 'streaming'),
      message('user', '失败的请求', 'error'),
      message('user', '字'.repeat(MEMORY_REFRESH_MIN_CHARS / 10)),
    ]

    const plan = planMemoryRefresh(messages, 0)

    expect(countCompletedMessages(messages)).toBe(1)
    expect(plan.coveredMessages).toBe(1)
    expect(plan.needed).toBe(false)
  })

  it('only sends the messages that are not in the memory yet', () => {
    const turns = ['一', '二', '三', '四', '五']

    expect(selectTurnsForMemoryWrite(turns, 0)).toEqual(turns)
    expect(selectTurnsForMemoryWrite(turns, 2)).toEqual(['三', '四', '五'])
    expect(selectTurnsForMemoryWrite(turns, 5)).toEqual(turns)
    expect(selectTurnsForMemoryWrite(turns, 99)).toEqual(turns)
  })

  it('reads non-stream memory responses and explains empty ones', () => {
    const ok = readMemoryCompletion({
      choices: [{ message: { content: '两人约好周四去看雨。' }, finish_reason: 'stop' }],
    })
    expect(ok.content).toBe('两人约好周四去看雨。')
    expect(ok.finishReason).toBe('stop')

    expect(() =>
      readMemoryCompletion({
        choices: [
          {
            message: { content: '', reasoning_content: '我想了很久……' },
            finish_reason: 'stop',
          },
        ],
      }),
    ).toThrow(/思考/)

    expect(() =>
      readMemoryCompletion({
        choices: [{ message: { content: '' }, finish_reason: 'stop' }],
      }),
    ).toThrow(/没有生成记忆正文/)
  })

  it('rejects truncated memory output instead of storing half a sentence', () => {
    expect(() =>
      readMemoryCompletion({
        choices: [
          {
            message: { content: '【人物】\n· 苏念｜20 岁｜新闻系大二\n· 陆晚｜21 岁｜新闻系大三，苏念室友\n【事实】\n· 陆晚在' },
            finish_reason: 'length',
          },
        ],
      }),
    ).toThrow(/截断/)
  })

  it('caps memory at a line boundary', () => {
    const long = Array.from({ length: 200 }, (_, index) => `· 第 ${index + 1} 条事实，写得很长很长很长。`).join('\n')
    const normalized = normalizeCompressedMemory(long)

    expect(normalized.length).toBeLessThanOrEqual(MEMORY_COMPRESSION_MAX_SUMMARY_CHARS)
    expect(normalized.endsWith('。')).toBe(true)
  })

  it('tells retold stories apart from memory entries', () => {
    expect(
      isValidMemoryEntryFormat('【人物】\n· 苏念｜20 岁｜新闻系大二\n【约定】\n· 次日七点半见'),
    ).toBe(true)
    expect(isValidMemoryEntryFormat('· 一号事实\n· 二号事实\n· 三号事实')).toBe(true)
    expect(
      isValidMemoryEntryFormat(
        '雨夜十一点半，苏念下晚班后手机没电，站在便利店门口。江小白替她付了关东煮的钱，然后两人一起上车。',
      ),
    ).toBe(false)
  })

  it('retries network and empty responses but not auth errors', () => {
    expect(isRetryableMemoryWriteError(new Error('记忆请求超过 180 秒没有返回。'))).toBe(true)
    expect(isRetryableMemoryWriteError(new Error('接口返回成功，但没有生成记忆正文。'))).toBe(true)
    expect(isRetryableMemoryWriteError(new Error('接口返回 HTTP 502。'))).toBe(true)
    expect(isRetryableMemoryWriteError(new Error('接口返回 HTTP 401。'))).toBe(false)
    expect(isRetryableMemoryWriteError(new Error('invalid api key'))).toBe(false)
    expect(isRetryableMemoryWriteError(new Error('model_not_found'))).toBe(false)
  })

  it('keeps memory chunks small enough for mobile requests', () => {
    expect(MEMORY_WRITE_CHUNK_CHARS).toBeLessThan(MEMORY_COMPRESSION_CHUNK_CHARS)
    expect(MEMORY_WRITE_TIMEOUT_MS).toBeGreaterThanOrEqual(120_000)
    expect(MEMORY_WRITE_MAX_ATTEMPTS).toBeGreaterThanOrEqual(2)
  })
})
