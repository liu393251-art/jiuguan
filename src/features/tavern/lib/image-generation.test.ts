import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ImageGenerationSettings } from '../types'
import { generateImage, imageGenerationUrl } from './image-generation'

const config: ImageGenerationSettings = {
  baseUrl: 'https://images.example.test/v1',
  apiKey: 'sk-image',
  model: 'gpt-image-1',
  size: '1024x1536',
  quality: 'high',
}

const onePixelPng =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2n1EAAAAASUVORK5CYII='

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('image generation API', () => {
  it('normalizes common base URLs to the images endpoint', () => {
    expect(imageGenerationUrl('https://example.test/v1')).toBe(
      'https://example.test/v1/images/generations',
    )
    expect(imageGenerationUrl('https://example.test/v1/chat/completions')).toBe(
      'https://example.test/v1/images/generations',
    )
    expect(imageGenerationUrl('https://example.test/v1/images/generations')).toBe(
      'https://example.test/v1/images/generations',
    )
  })

  it('requests the image API and decodes a b64_json response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ b64_json: onePixelPng, revised_prompt: '雨夜车站插画' }],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await generateImage(config, { prompt: '雨夜车站，电影感构图' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(init.body)) as Record<string, unknown>

    expect(url).toBe('https://images.example.test/v1/images/generations')
    expect(init.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer sk-image' }))
    expect(body).toEqual({
      model: 'gpt-image-1',
      prompt: '雨夜车站，电影感构图',
      n: 1,
      size: '1024x1536',
      quality: 'high',
    })
    expect(result.mimeType).toBe('image/png')
    expect(result.revisedPrompt).toBe('雨夜车站插画')
    expect(result.blob.size).toBeGreaterThan(0)
  })

  it('downloads an image when the provider returns a temporary URL', async () => {
    const pngBytes = Uint8Array.from(atob(onePixelPng), (character) => character.charCodeAt(0))
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ url: 'https://cdn.example.test/a.png' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(pngBytes, {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const result = await generateImage(config, { prompt: '站台灯光' })

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://cdn.example.test/a.png',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(result.blob.type).toBe('image/png')
    expect(result.revisedPrompt).toBeNull()
  })

  it('accepts providers that return raw image bytes', async () => {
    const pngBytes = Uint8Array.from(atob(onePixelPng), (character) => character.charCodeAt(0))
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(pngBytes, {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        }),
      ),
    )

    const result = await generateImage(config, { prompt: '铜铃', size: '1024x1024' })

    expect(result.mimeType).toBe('image/png')
    expect(result.size).toBe('1024x1024')
  })

  it('surfaces provider error messages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'model not found' } }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    await expect(generateImage(config, { prompt: '测试' })).rejects.toThrow(
      '没有找到生图接口：model not found',
    )
  })

  it('rejects a non-http base URL before making a request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      generateImage({ ...config, baseUrl: 'javascript:alert(1)' }, { prompt: '测试' }),
    ).rejects.toThrow('Base URL 格式不正确')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
