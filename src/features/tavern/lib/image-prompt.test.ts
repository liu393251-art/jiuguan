import { describe, expect, it } from 'vitest'

import type { ChatGenerationContext } from '../types'
import {
  buildImagePromptMessages,
  cleanGeneratedImagePrompt,
  cleanImageSourceText,
  imagePromptModeHint,
} from './image-prompt'

function context(): ChatGenerationContext {
  return {
    session: {
      id: 'session-1',
      title: '雨夜车站',
      loadoutId: null,
      characterId: 'character-1',
      apiProfileId: 'profile-1',
      presetId: null,
      worldBookIds: [],
      regexRuleIds: [],
      memoryProfileId: null,
      memoryMode: 'recent',
      memorySummary: '',
      generation: {
        temperature: 0.8,
        topP: 0.9,
        maxTokens: 900,
        presencePenalty: 0,
        frequencyPenalty: 0,
      },
      fontSize: 15,
      lastMessagePreview: '',
      messageCount: 4,
      createdAt: '2026-11-25T00:00:00.000Z',
      updatedAt: '2026-11-25T00:00:00.000Z',
    },
    character: {
      id: 'character-1',
      name: '测试旅人',
      tagline: '在雨夜等待列车的人',
      description: '黑色长发，米色风衣，手里拿着一把透明伞。',
      personality: '安静，观察力强。',
      scenario: '旧车站的末班车停运后，雨越下越大。',
      firstMessage: '你也在等车吗？',
      exampleDialogue: '',
      tags: ['雨夜', '旅人'],
      avatarTone: 1,
      source: 'seed',
      createdAt: '2026-11-25T00:00:00.000Z',
      updatedAt: '2026-11-25T00:00:00.000Z',
    },
    preset: null,
    worldBooks: [],
    regexRules: [],
    identity: {
      displayName: '林澈',
      persona: '穿深色校服的高二学生，肩上背着旧帆布包。',
    },
    memoryProfile: {
      id: 'memory-1',
      name: '最近消息',
      description: '',
      mode: 'recent',
      summaryPrompt: '',
      maxMessages: 24,
      apiProfileId: null,
    },
    messages: [
      {
        id: 'message-1',
        sessionId: 'session-1',
        role: 'user',
        content: '今晚的车还会来吗？',
        status: 'complete',
        createdAt: '2026-11-25T00:01:00.000Z',
      },
      {
        id: 'message-2',
        sessionId: 'session-1',
        role: 'assistant',
        content: '她抬头看了看站台的钟，雨水顺着玻璃往下淌。',
        status: 'complete',
        createdAt: '2026-11-25T00:02:00.000Z',
      },
      {
        id: 'message-3',
        sessionId: 'session-1',
        role: 'assistant',
        content: '这张图不应进入上下文',
        status: 'complete',
        createdAt: '2026-11-25T00:03:00.000Z',
        kind: 'image',
        image: {
          id: 'image-1',
          prompt: '旧图',
          revisedPrompt: null,
          model: 'image-model',
          size: '1024x1024',
          mimeType: 'image/png',
        },
      },
    ],
    memoryRecall: '',
  }
}

describe('image prompt generation', () => {
  it('builds a character prompt from the card and recent chat', () => {
    const messages = buildImagePromptMessages(context(), 'character')
    const combined = messages.map((message) => message.content).join('\n')

    expect(messages[0]?.role).toBe('system')
    expect(combined).toContain('full-body character portrait')
    expect(combined).toContain('测试旅人')
    expect(combined).toContain('米色风衣')
    expect(combined).toContain('今晚的车还会来吗')
    expect(combined).not.toContain('这张图不应进入上下文')
  })

  it('uses only the latest text message for last-message mode', () => {
    const messages = buildImagePromptMessages(context(), 'last')
    const combined = messages.map((message) => message.content).join('\n')

    expect(combined).toContain('LATEST MESSAGE')
    expect(combined).toContain('她抬头看了看站台的钟')
    expect(combined).not.toContain('今晚的车还会来吗')
  })

  it('includes the user persona for persona mode', () => {
    const combined = buildImagePromptMessages(context(), 'persona')
      .map((message) => message.content)
      .join('\n')

    expect(combined).toContain('USER PERSONA')
    expect(combined).toContain('深色校服')
  })

  it('cleans chat formatting from raw message sources', () => {
    expect(cleanImageSourceText('  「雨下大了。」\n')).toBe('「雨下大了。」')
  })

  it('removes state cards from raw message sources', () => {
    expect(
      cleanImageSourceText(
        '雨水顺着屋檐落下。\n\n[[状态]]\n测试旅人｜女｜27｜临时旅伴\n好感度：42\n[[/状态]]',
      ),
    ).toBe('雨水顺着屋檐落下。')
  })

  it('cleans fenced, labelled, and JSON prompts', () => {
    expect(cleanGeneratedImagePrompt('```text\nrainy station, warm lamp\n```')).toBe(
      'rainy station, warm lamp',
    )
    expect(cleanGeneratedImagePrompt('Prompt: "cinematic portrait, soft light"')).toBe(
      'cinematic portrait, soft light',
    )
    expect(cleanGeneratedImagePrompt('{"prompt":"wide shot, old station, rain"}')).toBe(
      'wide shot, old station, rain',
    )
  })

  it('describes modes that read chat context', () => {
    expect(imagePromptModeHint('story')).toContain('最近剧情')
    expect(imagePromptModeHint('message')).toContain('原文')
  })
})
