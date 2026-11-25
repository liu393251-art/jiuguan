import { describe, expect, it } from 'vitest'

import type { ChatMessage } from '../types'
import {
  MEMORY_COMPRESSION_MAX_SUMMARY_CHARS,
  buildCompressionChunkPrompt,
  buildCompressionSystemPrompt,
  chunkCompressionTranscript,
  collectCompressionTurns,
  formatCompressionTurns,
  normalizeCompressedMemory,
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
    expect(system).toContain('只输出记忆正文')
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
})
