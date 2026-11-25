import { externalFetch } from '@/services/external-http'

import type { ApiProfile } from '../types'
import { extractApiErrorMessage } from './chat-completion'

const EMBEDDING_BATCH_SIZE = 16
const EMBEDDING_TIMEOUT_MS = 12_000

type EmbeddingProfile = Pick<ApiProfile, 'baseUrl' | 'apiKey' | 'model'>

function embeddingsUrl(baseUrl: string) {
  const normalized = baseUrl.trim().replace(/\/$/, '')
  if (normalized.endsWith('/embeddings')) return normalized
  if (normalized.endsWith('/chat/completions')) {
    return normalized.replace(/\/chat\/completions$/, '/embeddings')
  }
  return `${normalized}/embeddings`
}

function parseEmbedding(item: unknown) {
  const candidate =
    Array.isArray(item) && item.every((value) => typeof value === 'number')
      ? item
      : item && typeof item === 'object' && 'embedding' in item
        ? item.embedding
        : null
  if (!Array.isArray(candidate) || candidate.length === 0) return null
  if (!candidate.every((value) => typeof value === 'number' && Number.isFinite(value))) return null
  return candidate
}

function parseEmbeddings(payload: unknown) {
  if (!payload || typeof payload !== 'object') return []
  const collection =
    'data' in payload && Array.isArray(payload.data)
      ? payload.data
      : 'embeddings' in payload && Array.isArray(payload.embeddings)
        ? payload.embeddings
        : []

  const indexed = collection.map((item, index) => ({
    index:
      item &&
      typeof item === 'object' &&
      'index' in item &&
      typeof item.index === 'number' &&
      Number.isInteger(item.index)
        ? item.index
        : index,
    embedding: parseEmbedding(item),
  }))
  indexed.sort((left, right) => left.index - right.index)
  if (indexed.some((item) => !item.embedding)) return []
  return indexed.map((item) => item.embedding as number[])
}

async function requestEmbeddingBatch(profile: EmbeddingProfile, inputs: string[]) {
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), EMBEDDING_TIMEOUT_MS)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  if (profile.apiKey.trim()) {
    headers.Authorization = `Bearer ${profile.apiKey.trim()}`
  }

  try {
    const response = await externalFetch(embeddingsUrl(profile.baseUrl), {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: profile.model.trim(),
        input: inputs,
      }),
    })
    const payload: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(extractApiErrorMessage(payload) || `向量接口返回 HTTP ${response.status}。`)
    }
    const embeddings = parseEmbeddings(payload)
    if (embeddings.length !== inputs.length) {
      throw new Error('向量接口没有返回完整的 embedding 数据。')
    }
    return embeddings
  } finally {
    globalThis.clearTimeout(timeout)
  }
}

export async function requestApiEmbeddings(profile: EmbeddingProfile, inputs: string[]) {
  const baseUrl = profile.baseUrl.trim()
  const model = profile.model.trim()
  if (!baseUrl) throw new Error('向量 API 还没有填写 Base URL。')
  if (!model) throw new Error('向量 API 还没有选择模型。')
  const texts = inputs.map((input) => input.trim()).filter(Boolean)
  if (texts.length !== inputs.length) throw new Error('不能为空消息生成向量。')

  const embeddings: number[][] = []
  for (let index = 0; index < texts.length; index += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(index, index + EMBEDDING_BATCH_SIZE)
    embeddings.push(...(await requestEmbeddingBatch(profile, batch)))
  }
  return embeddings
}
