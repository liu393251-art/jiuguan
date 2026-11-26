import { describe, expect, it } from 'vitest'

import type { ChatGenerationContext, ChatMessage, UserIdentity } from '../types'
import {
  buildContinuationMessages,
  buildPromptMessages,
  buildUserTurnStopSequences,
  extractCompletionFinishReason,
} from './chat-completion'

function message(
  id: string,
  role: ChatMessage['role'],
  content: string,
  status: ChatMessage['status'] = 'complete',
): ChatMessage {
  return {
    id,
    sessionId: 'session-1',
    role,
    content,
    status,
    createdAt: '2025-09-14T13:00:00.000Z',
  }
}

function context(
  identity: UserIdentity = { displayName: '林澈', persona: '高二学生，和角色同班。' },
  messages: ChatMessage[] = [message('m-1', 'user', '放学后见。')],
): ChatGenerationContext {
  return {
    session: {
      id: 'session-1',
      title: '测试对话',
      loadoutId: null,
      characterId: 'char-1',
      apiProfileId: 'api-1',
      presetId: null,
      worldBookIds: [],
      regexRuleIds: [],
      memoryProfileId: null,
      memoryMode: 'recent',
      memorySummary: '',
      memorySummaryCursor: 0,
      generation: {
        temperature: 0.8,
        topP: 0.9,
        maxTokens: 900,
        presencePenalty: 0,
        frequencyPenalty: 0,
      },
      fontSize: 15,
      lastMessagePreview: '',
      messageCount: messages.length,
      createdAt: '2025-09-14T12:00:00.000Z',
      updatedAt: '2025-09-14T13:00:00.000Z',
    },
    character: {
      id: 'char-1',
      name: '沈砚',
      tagline: '同班同学。',
      description: '午休时总在{{user}}旁边看书。',
      personality: '克制，偶尔揶揄人。',
      scenario: '放学后的教室。',
      firstMessage: '{{user}}，你又迟到了。',
      exampleDialogue: '<char>：<user>，走吗？',
      tags: [],
      avatarTone: 0,
      source: 'user',
      createdAt: '2025-09-14T12:00:00.000Z',
      updatedAt: '2025-09-14T12:00:00.000Z',
    },
    preset: null,
    worldBooks: [],
    regexRules: [],
    identity,
    memoryProfile: {
      id: 'memory-1',
      name: '最近消息',
      description: '',
      mode: 'recent',
      summaryPrompt: '',
      maxMessages: 20,
      apiProfileId: null,
    },
    messages,
    memoryRecall: '',
  }
}

describe('chat completion prompt', () => {
  it('reads the upstream finish reason', () => {
    expect(
      extractCompletionFinishReason({
        choices: [{ delta: {}, finish_reason: 'length' }],
      }),
    ).toBe('length')
    expect(extractCompletionFinishReason({ choices: [{ delta: {} }] })).toBeNull()
    expect(extractCompletionFinishReason({ error: { message: 'bad request' } })).toBeNull()
  })

  it('binds the configured user identity to the character prompt', () => {
    const [system] = buildPromptMessages(context())

    expect(system.role).toBe('system')
    expect(system.content).toContain('你正在扮演「沈砚」')
    expect(system.content).toContain('与「林澈」进行中文角色扮演')
    expect(system.content).toContain('优先使用这个名字')
    expect(system.content).toContain('不要输出 JSON、状态补丁')
    expect(system.content).toContain('真正说出口的台词必须用「」包裹')
    expect(system.content).toContain('写成不带引号的叙述段落')
    expect(system.content).toContain('林澈，你又迟到了。')
    expect(system.content).toContain('沈砚：林澈，走吗？')
    expect(system.content).not.toContain('{{user}}')
    expect(system.content).not.toContain('<char>')
    expect(system.content).not.toContain('<user>')
  })

  it('names speakers in history and removes assistant state patches', () => {
    const prompt = buildPromptMessages(
      context(undefined, [
        message('m-1', 'user', '我是{{user}}，一起走吗？'),
        message(
          'm-2',
          'assistant',
          '好，<user>。\n[{"op":"replace","path":"/世界/当前时间","value":"放学后"}]',
        ),
        message('m-3', 'assistant', '这条失败消息不应进入上下文。', 'error'),
      ]),
    )

    expect(prompt).toHaveLength(3)
    expect(prompt[1]).toEqual({ role: 'user', content: '我是林澈，一起走吗？' })
    expect(prompt[2]).toEqual({ role: 'assistant', content: '好，林澈。' })
  })

  it('keeps layout tags out of model history and continuation prompts', () => {
    const prompt = buildPromptMessages(
      context(undefined, [
        message('m-1', 'user', '[[bubble]]放学后见。[[/bubble]]'),
        message('m-2', 'assistant', '[[narration]]她点了点头。[[/narration]]'),
      ]),
    )

    expect(prompt[1]).toEqual({ role: 'user', content: '放学后见。' })
    expect(prompt[2]).toEqual({ role: 'assistant', content: '她点了点头。' })
    expect(buildContinuationMessages([], '[[bubble]]我先走。[[/bubble]]')[0]).toEqual({
      role: 'assistant',
      content: '我先走。',
    })
  })

  it('stops before a generated user turn', () => {
    expect(buildUserTurnStopSequences('林澈')).toEqual([
      '\n【林澈】',
      '\n林澈：',
      '\n【你】',
      '\n你：',
    ])
    expect(buildUserTurnStopSequences('')).toEqual(['\n【你】', '\n你：', '\n【用户】', '\n用户：'])
  })

  it('adds a continuation instruction after the partial assistant reply', () => {
    const messages = buildContinuationMessages(
      [
        { role: 'system', content: '角色设定' },
        { role: 'user', content: '继续那件事。' },
      ],
      '她回过头。\n\n【',
    )

    expect(messages.slice(-2)).toEqual([
      { role: 'assistant', content: '她回过头。\n\n【' },
      expect.objectContaining({ role: 'user', content: expect.stringContaining('不要重复') }),
    ])
  })

  it('keeps the complete conversation in vector mode without the recent-message cap', () => {
    const messages = Array.from({ length: 96 }, (_, index) =>
      message(
        `m-${index}`,
        index % 2 === 0 ? 'user' : 'assistant',
        `第 ${index + 1} 条对话，记录着当天发生的事。`,
      ),
    )
    const vectorContext = context(undefined, messages)
    vectorContext.session.memoryMode = 'vector'
    vectorContext.session.memorySummary = '这是一段旧摘要，不应代替完整历史。'
    vectorContext.memoryProfile.mode = 'vector'
    vectorContext.memoryProfile.maxMessages = 20
    vectorContext.memoryProfile.summaryPrompt = '只总结最近二十条。'

    const prompt = buildPromptMessages(vectorContext)

    expect(prompt).toHaveLength(messages.length + 1)
    expect(prompt[1]?.content).toContain('第 1 条对话')
    expect(prompt.at(-1)?.content).toContain('第 96 条对话')
    expect(prompt[0]?.content).not.toContain('旧摘要')
    expect(prompt[0]?.content).not.toContain('只总结最近二十条')
  })

  it('still limits recent mode to the configured message count', () => {
    const messages = Array.from({ length: 30 }, (_, index) =>
      message(`m-${index}`, index % 2 === 0 ? 'user' : 'assistant', `第 ${index + 1} 条。`),
    )
    const recentContext = context(undefined, messages)
    recentContext.memoryProfile.maxMessages = 20

    expect(buildPromptMessages(recentContext)).toHaveLength(21)
  })

  it('uses compressed memory plus the recent window in compressed mode', () => {
    const messages = Array.from({ length: 30 }, (_, index) =>
      message(`m-${index}`, index % 2 === 0 ? 'user' : 'assistant', `第 ${index + 1} 条。`),
    )
    const compressedContext = context(undefined, messages)
    compressedContext.session.memoryMode = 'compressed'
    compressedContext.session.memorySummary = '两人约好周五在旧书店碰面。'
    compressedContext.memoryRecall = '这段召回不应进入压缩模式。'
    compressedContext.memoryProfile.summaryPrompt = '这段提示词不应变成记忆正文。'
    compressedContext.memoryProfile.maxMessages = 20

    const prompt = buildPromptMessages(compressedContext)

    expect(prompt).toHaveLength(21)
    expect(prompt[0]?.content).toContain('两人约好周五在旧书店碰面。')
    expect(prompt[0]?.content).not.toContain('这段召回不应进入压缩模式。')
    expect(prompt[0]?.content).not.toContain('这段提示词不应变成记忆正文。')
    expect(prompt.at(-1)?.content).toContain('第 30 条。')
  })

  it('feeds the generated summary in summary mode without leaking the prompt', () => {
    const messages = Array.from({ length: 30 }, (_, index) =>
      message(`m-${index}`, index % 2 === 0 ? 'user' : 'assistant', `第 ${index + 1} 条。`),
    )
    const summaryContext = context(undefined, messages)
    summaryContext.session.memoryMode = 'summary'
    summaryContext.session.memorySummary = '两人把周五的约改到了周四。'
    summaryContext.memoryProfile.summaryPrompt = '这段提示词只用于生成摘要。'
    summaryContext.memoryProfile.maxMessages = 20

    const prompt = buildPromptMessages(summaryContext)

    expect(prompt).toHaveLength(21)
    expect(prompt[0]?.content).toContain('两人把周五的约改到了周四。')
    expect(prompt[0]?.content).not.toContain('这段提示词只用于生成摘要。')
  })

  it('keeps only the latest turn when memory is off', () => {
    const messages = Array.from({ length: 12 }, (_, index) =>
      message(`m-${index}`, index % 2 === 0 ? 'user' : 'assistant', `第 ${index + 1} 条。`),
    )
    const offContext = context(undefined, messages)
    offContext.session.memoryMode = 'off'

    const prompt = buildPromptMessages(offContext)

    expect(prompt).toHaveLength(2)
    expect(prompt[0]?.content).not.toContain('长期记忆')
    expect(prompt.at(-1)?.content).toContain('第 12 条。')
  })

  it('does not inject the summary prompt in recent mode', () => {
    const recentContext = context()
    recentContext.memoryProfile.summaryPrompt = '这段话只用于生成摘要。'

    const prompt = buildPromptMessages(recentContext)

    expect(prompt[0]?.content).not.toContain('这段话只用于生成摘要。')
    expect(prompt[0]?.content).not.toContain('长期记忆')
  })
})
