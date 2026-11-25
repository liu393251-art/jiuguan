import { afterEach, describe, expect, it, vi } from 'vitest'

import { continueChatCompletion, fetchApiModels, streamChatCompletion } from './api'
import type { PreparedChatGeneration } from './lib/chat-completion'
import type { ApiProfile } from './types'

const profile: ApiProfile = {
  id: 'api-1',
  name: 'test',
  provider: 'openai-compatible',
  baseUrl: 'https://example.test/v1',
  model: 'test-model',
  apiKey: 'test-key',
}

function prepared(): PreparedChatGeneration & { profile: ApiProfile } {
  return {
    profile,
    messages: [{ role: 'user', content: '继续。' }],
    generation: {
      temperature: 0.8,
      topP: 0.9,
      maxTokens: 900,
      presencePenalty: 0,
      frequencyPenalty: 0,
    },
    memoryMode: 'recent',
    outputRules: [],
    stop: [],
  }
}

function sseResponse(body: string) {
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('stream chat completion', () => {
  it('captures the finish reason and normal done signal', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          sseResponse(
            [
              'data: {"choices":[{"delta":{"content":"她回过头。"},"finish_reason":null}]}',
              '',
              'data: {"choices":[{"delta":{},"finish_reason":"length"}]}',
              '',
              'data: [DONE]',
              '',
            ].join('\n'),
          ),
        ),
    )

    const deltas: string[] = []
    const result = await streamChatCompletion(prepared(), (delta) => deltas.push(delta))

    expect(deltas).toEqual(['她回过头。'])
    expect(result).toEqual({
      content: '她回过头。',
      finishReason: 'length',
      sawDone: true,
      invalidData: false,
      transport: 'sse',
    })
  })

  it('reports a stream that closes without [DONE] or a finish reason', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          sseResponse(
            'data: {"choices":[{"delta":{"content":"她回头"},"finish_reason":null}]}\n\n',
          ),
        ),
    )

    const result = await streamChatCompletion(prepared(), () => {})

    expect(result.content).toBe('她回头')
    expect(result.finishReason).toBeNull()
    expect(result.sawDone).toBe(false)
    expect(result.invalidData).toBe(false)
  })

  it('keeps non-stream JSON responses compatible', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '她回头。' }, finish_reason: 'stop' }],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      ),
    )

    const result = await streamChatCompletion(prepared(), () => {})

    expect(result).toEqual({
      content: '她回头。',
      finishReason: 'stop',
      sawDone: false,
      invalidData: false,
      transport: 'json',
    })
  })

  it('does not silently accept a malformed SSE event', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          sseResponse(
            [
              'data: {"choices":[{"delta":{"content":"她回头"},"finish_reason":null}]}',
              '',
              'data: {"choices":[',
              '',
              'data: [DONE]',
              '',
            ].join('\n'),
          ),
        ),
    )

    const result = await streamChatCompletion(prepared(), () => {})

    expect(result.invalidData).toBe(true)
  })

  it('requests the missing continuation from the last assistant fragment', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        sseResponse(
          [
            'data: {"choices":[{"delta":{"content":"佐伯翼】\\n「那就继续吧。」"},"finish_reason":null}]}',
            '',
            'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
            '',
            'data: [DONE]',
            '',
          ].join('\n'),
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    const result = await continueChatCompletion(prepared(), '她回过头。\n\n【', () => {})
    const request = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as {
      max_tokens: number
      messages: { role: string; content: string }[]
    }

    expect(request.messages.at(-2)).toEqual({
      role: 'assistant',
      content: '她回过头。\n\n【',
    })
    expect(request.messages.at(-1)?.role).toBe('user')
    expect(request.messages.at(-1)?.content).toContain('不要重复')
    expect(request.max_tokens).toBe(1800)
    expect(result.content).toContain('「那就继续吧。」')
  })
})

describe('fetch API models', () => {
  it('requests the models endpoint with an explicit port', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: 'model-b' }, { id: 'model-a' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const models = await fetchApiModels({
      baseUrl: 'https://www.jkai.asia:3003/v1',
      apiKey: 'sk-test',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.jkai.asia:3003/v1/models',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(models).toEqual(['model-a', 'model-b'])
  })

  it('shows the API error returned for an invalid token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'Invalid token' } }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    await expect(
      fetchApiModels({ baseUrl: 'https://example.test/v1', apiKey: 'bad-key' }),
    ).rejects.toThrow('API Key 无效或未填写：Invalid token')
  })

  it('keeps a native network reason instead of replacing it with a generic error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue('dns error: failed to lookup address information'),
    )

    await expect(
      fetchApiModels({ baseUrl: 'https://missing.example/v1', apiKey: '' }),
    ).rejects.toThrow('无法解析 missing.example 的域名')
  })
})
