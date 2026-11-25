import type { ChatMessage, VectorMemoryEntry } from '../types'
import { stripChatLayoutMarkers } from './chat-layout'

export const LOCAL_VECTOR_SIZE = 128
export const LOCAL_VECTOR_MODEL = 'local-semantic-128'
export const VECTOR_RECALL_LIMIT = 8

function normalizeText(input: string) {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function tokenize(input: string) {
  const text = normalizeText(input)
  const tokens: string[] = []
  const latinWords = text.match(/[a-z0-9]{2,}/g) ?? []
  tokens.push(...latinWords)

  const cjkRuns = text.match(/[\p{Script=Han}]+/gu) ?? []
  for (const run of cjkRuns) {
    const chars = Array.from(run)
    tokens.push(...chars)
    for (let index = 0; index < chars.length - 1; index += 1) {
      tokens.push(chars[index] + chars[index + 1])
    }
  }
  return tokens
}

function hashToken(token: string) {
  let hash = 2166136261
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash)
}

export function embedMemoryText(input: string) {
  const vector = new Array<number>(LOCAL_VECTOR_SIZE).fill(0)
  for (const token of tokenize(stripChatLayoutMarkers(input))) {
    const hash = hashToken(token)
    const index = hash % LOCAL_VECTOR_SIZE
    const sign = (hash & 1) === 0 ? 1 : -1
    vector[index] += sign * (1 + Math.min(token.length, 4) * 0.15)
  }

  let magnitude = 0
  for (const value of vector) magnitude += value * value
  if (magnitude > 0) {
    const inverse = 1 / Math.sqrt(magnitude)
    for (let index = 0; index < vector.length; index += 1) vector[index] *= inverse
  }
  return vector.map((value) => Number(value.toFixed(6)))
}

export function cosineSimilarity(left: ArrayLike<number>, right: ArrayLike<number>) {
  let score = 0
  const length = Math.min(left.length, right.length)
  for (let index = 0; index < length; index += 1) score += left[index] * right[index]
  return score
}

export function recallVectorMemories(
  messages: ChatMessage[],
  query: string,
  limit = VECTOR_RECALL_LIMIT,
): ChatMessage[] {
  if (!query.trim() || messages.length === 0) return []
  const queryVector = embedMemoryText(query)
  return messages
    .filter((message) => message.role !== 'system' && message.content.trim().length >= 8)
    .map((message) => ({
      message,
      score: cosineSimilarity(queryVector, embedMemoryText(message.content)),
    }))
    .filter((item) => item.score > 0.08)
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, limit))
    .map((item) => item.message)
}

export function recallPersistedMemories(
  memories: VectorMemoryEntry[],
  query: string,
  limit = VECTOR_RECALL_LIMIT,
): VectorMemoryEntry[] {
  if (!query.trim() || memories.length === 0) return []
  const queryVector = embedMemoryText(query)
  return memories
    .map((memory) => ({
      memory,
      score: cosineSimilarity(queryVector, memory.embedding),
    }))
    .filter((item) => item.score > 0.08)
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, limit))
    .map((item) => item.memory)
}

export function buildVectorMemoryLine(messages: ChatMessage[], query: string) {
  const [recalled] = recallVectorMemories(messages, query, 1)
  if (!recalled) return '他把你们之前说过的话重新想了一遍。'
  const content = stripChatLayoutMarkers(recalled.content)
  const excerpt = content.replace(/\s+/g, ' ').trim().slice(0, 42)
  return `他想起你们之前提过：「${excerpt}${content.length > 42 ? '…' : ''}」`
}

export function buildPersistedVectorMemoryLine(memories: VectorMemoryEntry[], query: string) {
  const [recalled] = recallPersistedMemories(memories, query, 1)
  if (!recalled) return '他在长期记忆里没有找到相关片段，于是认真听你继续说。'
  const content = stripChatLayoutMarkers(recalled.content)
  const excerpt = content.replace(/\s+/g, ' ').trim().slice(0, 42)
  return `他从长期记忆里想起：「${excerpt}${content.length > 42 ? '…' : ''}」`
}

export function createVectorMemoryDrafts(
  messages: ChatMessage[],
  scopeId: string,
  model = LOCAL_VECTOR_MODEL,
) {
  return messages
    .filter((message) => message.role !== 'system' && message.content.trim().length >= 4)
    .map((message) => {
      const content = stripChatLayoutMarkers(message.content)
      return {
        scopeId,
        sessionId: message.sessionId,
        sourceMessageId: message.id,
        role: message.role as 'user' | 'assistant',
        content,
        embedding: embedMemoryText(content),
        embeddingSource: 'local' as const,
        embeddingModel: LOCAL_VECTOR_MODEL,
        model,
      }
    })
}

export function createApiVectorMemoryDrafts(
  messages: ChatMessage[],
  scopeId: string,
  model: string,
  embeddings: number[][],
) {
  if (embeddings.length !== messages.length) {
    throw new Error('向量接口返回数量与消息数量不一致。')
  }

  return messages.map((message, index) => {
    const content = stripChatLayoutMarkers(message.content)
    return {
      scopeId,
      sessionId: message.sessionId,
      sourceMessageId: message.id,
      role: message.role as 'user' | 'assistant',
      content,
      embedding: embeddings[index],
      fallbackEmbedding: embedMemoryText(content),
      embeddingSource: 'api' as const,
      embeddingModel: model,
      model,
    }
  })
}

export type RecallQuery = {
  local: number[]
  api?: {
    model: string
    vector: number[]
  }
}

type PersistedMemoryWithEmbedding = Pick<
  VectorMemoryEntry,
  'embeddingSource' | 'embeddingModel'
> & {
  embedding: ArrayLike<number>
  fallbackEmbedding?: ArrayLike<number>
}

export function scorePersistedMemory(memory: PersistedMemoryWithEmbedding, query: RecallQuery) {
  const useApi =
    memory.embeddingSource === 'api' &&
    Boolean(query.api) &&
    memory.embeddingModel === query.api?.model
  if (memory.embeddingSource === 'api' && !useApi && !memory.fallbackEmbedding) {
    return 0
  }
  const embedding = useApi ? memory.embedding : (memory.fallbackEmbedding ?? memory.embedding)
  const queryVector = useApi && query.api ? query.api.vector : query.local
  return cosineSimilarity(queryVector, embedding)
}

export function recallPersistedMemoriesWithQuery<T extends PersistedMemoryWithEmbedding>(
  memories: T[],
  query: RecallQuery,
  limit = VECTOR_RECALL_LIMIT,
) {
  return memories
    .map((memory) => ({ memory, score: scorePersistedMemory(memory, query) }))
    .filter((item) => item.score > 0.05)
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, limit))
    .map((item) => item.memory)
}
