import { externalFetch } from '@/services/external-http'

import type { ImageGenerationSettings, ImageQuality, ImageSize } from '../types'
import { extractApiErrorMessage } from './chat-completion'

const IMAGE_REQUEST_TIMEOUT_MS = 180_000

type ImageGenerationRequest = {
  prompt: string
  size?: ImageSize
  quality?: ImageQuality
  signal?: AbortSignal
}

export type GeneratedImage = {
  blob: Blob
  mimeType: string
  model: string
  size: string
  revisedPrompt: string | null
}

type ImagePayload = {
  base64: string
  revisedPrompt: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function imageGenerationUrl(baseUrl: string) {
  const normalized = baseUrl.trim().replace(/\/$/, '')
  if (normalized.endsWith('/images/generations')) return normalized
  if (normalized.endsWith('/images/edits')) {
    return normalized.replace(/\/images\/edits$/, '/images/generations')
  }
  if (normalized.endsWith('/chat/completions')) {
    return normalized.replace(/\/chat\/completions$/, '/images/generations')
  }
  if (normalized.endsWith('/models')) {
    return normalized.replace(/\/models$/, '/images/generations')
  }
  return `${normalized}/images/generations`
}

function imageDatum(payload: unknown) {
  if (!isRecord(payload)) return null
  const collection =
    Array.isArray(payload.data) && payload.data.length > 0
      ? payload.data
      : Array.isArray(payload.images) && payload.images.length > 0
        ? payload.images
        : null
  const item = collection?.[0]
  return isRecord(item) ? item : null
}

function extractImagePayload(payload: unknown): ImagePayload | null {
  const item = imageDatum(payload)
  if (!item) return null
  const base64 =
    typeof item.b64_json === 'string'
      ? item.b64_json
      : typeof item.base64 === 'string'
        ? item.base64
        : typeof item.image === 'string' && !/^https?:\/\//i.test(item.image)
          ? item.image
          : ''
  if (!base64) return null
  return {
    base64,
    revisedPrompt: typeof item.revised_prompt === 'string' ? item.revised_prompt : null,
  }
}

function extractImageUrl(payload: unknown) {
  const item = imageDatum(payload)
  if (!item) return null
  if (typeof item.url === 'string' && item.url.trim()) return item.url.trim()
  if (typeof item.image === 'string' && /^https?:\/\//i.test(item.image)) return item.image
  return null
}

function sniffImageMime(bytes: Uint8Array) {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'image/png'
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) {
    return 'image/webp'
  }
  if (bytes.length >= 6 && String.fromCharCode(...bytes.slice(0, 3)) === 'GIF') {
    return 'image/gif'
  }
  return 'image/png'
}

function base64Blob(value: string) {
  const comma = value.indexOf(',')
  const encoded = value.startsWith('data:') && comma >= 0 ? value.slice(comma + 1) : value
  const binary = atob(encoded.replace(/\s+/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], { type: sniffImageMime(bytes) })
}

async function responseError(response: Response) {
  const text = await response.text().catch(() => '')
  let payload: unknown = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      // The provider may return plain text instead of JSON.
    }
  }
  const detail = extractApiErrorMessage(payload) || text.trim().slice(0, 240)
  if (response.status === 401 || response.status === 403) {
    return `生图 API 拒绝了请求${detail ? `：${detail}` : '，请检查 API Key。'}`
  }
  if (response.status === 404) {
    return `没有找到生图接口${detail ? `：${detail}` : '，请确认 Base URL 是否包含 /v1。'}`
  }
  if (response.status === 429) {
    return `生图请求过于频繁或额度不足${detail ? `：${detail}` : '（HTTP 429）。'}`
  }
  if (response.status >= 500) {
    return `生图 API 服务器错误${detail ? `：${detail}` : `（HTTP ${response.status}）。`}`
  }
  return detail || `生图接口返回 HTTP ${response.status}。`
}

function resolveImageUrl(value: string, baseUrl: string) {
  try {
    return new URL(value, `${baseUrl.trim().replace(/\/$/, '')}/`).toString()
  } catch {
    return value
  }
}

async function downloadImage(url: string, baseUrl: string, signal: AbortSignal) {
  const response = await externalFetch(resolveImageUrl(url, baseUrl), {
    method: 'GET',
    headers: { Accept: 'image/*' },
    signal,
  })
  if (!response.ok) throw new Error(await responseError(response))
  const blob = await response.blob()
  if (!blob.size) throw new Error('生图接口返回了空图片。')
  return blob.type.startsWith('image/')
    ? blob
    : new Blob([blob], { type: sniffImageMime(new Uint8Array(await blob.arrayBuffer())) })
}

export async function generateImage(
  config: ImageGenerationSettings,
  request: ImageGenerationRequest,
): Promise<GeneratedImage> {
  const baseUrl = config.baseUrl.trim()
  const model = config.model.trim()
  const prompt = request.prompt.trim()
  const size = request.size ?? config.size
  const quality = request.quality ?? config.quality
  if (!baseUrl) throw new Error('生图 API 还没有填写 Base URL。')
  if (!model) throw new Error('生图 API 还没有填写模型。')
  if (!prompt) throw new Error('请先填写画面描述。')
  try {
    const parsed = new URL(baseUrl)
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error()
  } catch {
    throw new Error('生图 API 的 Base URL 格式不正确，请填写以 http:// 或 https:// 开头的地址。')
  }

  const controller = new AbortController()
  const abortFromCaller = () => controller.abort()
  if (request.signal?.aborted) controller.abort()
  request.signal?.addEventListener('abort', abortFromCaller, { once: true })
  const timeout = globalThis.setTimeout(() => controller.abort(), IMAGE_REQUEST_TIMEOUT_MS)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, image/*',
  }
  if (config.apiKey.trim()) headers.Authorization = `Bearer ${config.apiKey.trim()}`

  try {
    const response = await externalFetch(imageGenerationUrl(baseUrl), {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model,
        prompt,
        n: 1,
        ...(size !== 'auto' ? { size } : {}),
        ...(quality !== 'auto' ? { quality } : {}),
      }),
    })
    if (!response.ok) throw new Error(await responseError(response))

    const contentType = response.headers.get('content-type') ?? ''
    if (contentType.startsWith('image/')) {
      const blob = await response.blob()
      if (!blob.size) throw new Error('生图接口返回了空图片。')
      return { blob, mimeType: blob.type || 'image/png', model, size, revisedPrompt: null }
    }

    const payload: unknown = await response.json().catch(() => null)
    const imagePayload = extractImagePayload(payload)
    if (imagePayload) {
      const blob = base64Blob(imagePayload.base64)
      return {
        blob,
        mimeType: blob.type,
        model,
        size,
        revisedPrompt: imagePayload.revisedPrompt,
      }
    }

    const imageUrl = extractImageUrl(payload)
    if (imageUrl) {
      const blob = await downloadImage(imageUrl, baseUrl, controller.signal)
      return { blob, mimeType: blob.type || 'image/png', model, size, revisedPrompt: null }
    }

    const apiError = extractApiErrorMessage(payload)
    throw new Error(apiError || '生图接口返回成功，但没有图片数据。')
  } catch (error) {
    if (controller.signal.aborted && !request.signal?.aborted) {
      throw new Error('生图请求超时（3 分钟），请稍后再试。', { cause: error })
    }
    throw error instanceof Error ? error : new Error('生图请求失败。', { cause: error })
  } finally {
    globalThis.clearTimeout(timeout)
    request.signal?.removeEventListener('abort', abortFromCaller)
  }
}
