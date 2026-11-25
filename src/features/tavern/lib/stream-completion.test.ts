import { describe, expect, it } from 'vitest'

import {
  assessCompletion,
  canContinueCompletion,
  mergeContinuation,
  repairIncompleteMessage,
  stripIncompleteSpeakerTag,
} from './stream-completion'

const sample =
  '她终于回过头，碧绿色的眼睛在昏暗的光线下显得格外清亮，睫毛上还挂着一点未干的水光，却没有半分动摇。\n\n【'

describe('stream completion integrity', () => {
  it('removes a dangling speaker tag before saving', () => {
    expect(stripIncompleteSpeakerTag(sample)).toBe(
      '她终于回过头，碧绿色的眼睛在昏暗的光线下显得格外清亮，睫毛上还挂着一点未干的水光，却没有半分动摇。',
    )
  })

  it('marks a token-limited response as incomplete', () => {
    const result = assessCompletion(sample, {
      transport: 'sse',
      finishReason: 'length',
      sawDone: false,
      invalidData: false,
    })

    expect(result.content).not.toMatch(/【$/)
    expect(result.complete).toBe(false)
    expect(result.warning).toContain('token 上限')
    expect(canContinueCompletion(result)).toBe(true)
  })

  it('marks a stream that ended without a terminal signal as incomplete', () => {
    const result = assessCompletion('她看向门口。', {
      transport: 'sse',
      finishReason: null,
      sawDone: false,
      invalidData: false,
    })

    expect(result.complete).toBe(false)
    expect(result.warning).toContain('正常结束信号前断开')
  })

  it('accepts a normal stop even when the provider omits [DONE]', () => {
    const result = assessCompletion('「今晚就到这里。」', {
      transport: 'sse',
      finishReason: 'stop',
      sawDone: false,
      invalidData: false,
    })

    expect(result.complete).toBe(true)
    expect(result.warning).toBeNull()
  })

  it('treats a dangling tag as incomplete even if the provider reports stop', () => {
    const result = assessCompletion(sample, {
      transport: 'sse',
      finishReason: 'stop',
      sawDone: true,
      invalidData: false,
    })

    expect(result.content).not.toMatch(/【$/)
    expect(result.complete).toBe(false)
    expect(result.warning).toContain('发言标签')
  })

  it('continues a dangling tag when the stream saw DONE without a finish reason', () => {
    const result = assessCompletion(sample, {
      transport: 'sse',
      finishReason: null,
      sawDone: true,
      invalidData: false,
    })

    expect(result.content).not.toMatch(/【$/)
    expect(result.complete).toBe(false)
    expect(result.issue).toBe('incomplete-tag')
    expect(canContinueCompletion(result)).toBe(true)
  })

  it('repairs a legacy truncated message when the session is loaded', () => {
    const message = {
      role: 'assistant' as const,
      content: sample,
      status: 'complete' as const,
    }

    expect(repairIncompleteMessage(message)).toBe(true)
    expect(message.content).not.toMatch(/【$/)
    expect(message.status).toBe('stopped')
  })

  it('joins a continuation without duplicating a partial speaker tag', () => {
    expect(mergeContinuation(sample, '佐伯翼】\n「今晚就到这里。」')).toBe(
      `${sample}佐伯翼】\n「今晚就到这里。」`,
    )
    expect(mergeContinuation(sample, '【佐伯翼】\n「今晚就到这里。」')).toBe(
      `${sample}佐伯翼】\n「今晚就到这里。」`,
    )
  })

  it('removes a repeated sentence at the continuation seam', () => {
    const existing = '她把门推开。\n走廊里没有开灯。'
    const continuation = '走廊里没有开灯。\n只有窗外的雨声。'

    expect(mergeContinuation(existing, continuation)).toBe(
      '她把门推开。\n走廊里没有开灯。\n只有窗外的雨声。',
    )
  })
})
