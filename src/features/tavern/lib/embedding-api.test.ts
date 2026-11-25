import { describe, expect, it, vi } from 'vitest'

const { externalFetchMock } = vi.hoisted(() => ({
  externalFetchMock: vi.fn(),
}))

vi.mock('@/services/external-http', () => ({
  externalFetch: externalFetchMock,
}))

import { requestApiEmbeddings } from './embedding-api'

describe('embedding API', () => {
  it('requests the selected OpenAI-compatible embeddings endpoint', async () => {
    externalFetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [
            { index: 1, embedding: [0.3, 0.4] },
            { index: 0, embedding: [0.1, 0.2] },
          ],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )

    const vectors = await requestApiEmbeddings(
      {
        baseUrl: 'https://example.com/v1/chat/completions',
        apiKey: 'test-key',
        model: 'embedding-model',
      },
      ['第一条', '第二条'],
    )

    expect(vectors).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ])
    expect(externalFetchMock).toHaveBeenCalledWith(
      'https://example.com/v1/embeddings',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
      }),
    )
    const request = externalFetchMock.mock.calls[0]?.[1] as RequestInit
    expect(JSON.parse(String(request.body))).toEqual({
      model: 'embedding-model',
      input: ['第一条', '第二条'],
    })
  })

  it('rejects an incomplete embeddings response', async () => {
    externalFetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ index: 0, embedding: [0.1, 0.2] }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(
      requestApiEmbeddings(
        {
          baseUrl: 'http://127.0.0.1:11434/v1',
          apiKey: '',
          model: 'bge-m3',
        },
        ['第一条', '第二条'],
      ),
    ).rejects.toThrow('没有返回完整')
  })
})
