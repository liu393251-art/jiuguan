import type { VectorMemoryEntry } from '@/features/tavern/types'
import {
  scorePersistedMemory,
  VECTOR_RECALL_LIMIT,
  type RecallQuery,
} from '@/features/tavern/lib/vector-memory'

import { readTavernState, writeTavernState } from './mock-db'

export const VECTOR_DB_NAME = 'xiaobai.tavern.vectors'
export const VECTOR_STORE_NAME = 'memories'

const VECTOR_DB_VERSION = 2
const PERSISTENCE_KEY = 'xiaobai.tavern.vector-persistence.v1'

export type StoredVectorMemory = Omit<VectorMemoryEntry, 'embedding' | 'fallbackEmbedding'> & {
  key: string
  embedding: Float32Array
  fallbackEmbedding?: Float32Array
}

export type VectorMemoryStats = {
  total: number
  model: string
  localCount: number
  apiCount: number
  scopes: { scopeId: string; count: number }[]
}

let databasePromise: Promise<IDBDatabase> | null = null
let persistenceRequested = false

function vectorMemoryKey(scopeId: string, sourceMessageId: string) {
  return `${scopeId}\u0000${sourceMessageId}`
}

function toStoredMemory(entry: VectorMemoryEntry): StoredVectorMemory {
  const { embedding, fallbackEmbedding, ...metadata } = entry
  return {
    ...metadata,
    key: vectorMemoryKey(entry.scopeId, entry.sourceMessageId),
    embedding: Float32Array.from(embedding),
    ...(fallbackEmbedding ? { fallbackEmbedding: Float32Array.from(fallbackEmbedding) } : {}),
  }
}

function toVectorMemoryEntry(record: StoredVectorMemory): VectorMemoryEntry {
  return {
    id: record.id,
    scopeId: record.scopeId,
    sessionId: record.sessionId,
    sourceMessageId: record.sourceMessageId,
    role: record.role,
    content: record.content,
    embedding: Array.from(record.embedding),
    ...(record.fallbackEmbedding
      ? { fallbackEmbedding: Array.from(record.fallbackEmbedding) }
      : {}),
    model: record.model,
    embeddingSource: record.embeddingSource,
    embeddingModel: record.embeddingModel,
    createdAt: record.createdAt,
  }
}

function storageError(error: unknown) {
  if (
    error instanceof Error &&
    (error.name === 'QuotaExceededError' ||
      (typeof DOMException !== 'undefined' && error instanceof DOMException && error.code === 22))
  ) {
    return new Error('本机向量库空间不足，请清理旧对话后再试。')
  }
  if (error instanceof Error) return error
  return new Error('本机向量库操作失败，请重新打开应用后重试。')
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(storageError(request.error))
  })
}

function transactionToPromise(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(storageError(transaction.error))
    transaction.onabort = () => reject(storageError(transaction.error))
  })
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('当前环境不支持 IndexedDB，无法保存长期向量库。'))
      return
    }

    const request = indexedDB.open(VECTOR_DB_NAME, VECTOR_DB_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      const transaction = request.transaction
      if (!transaction) return
      const store = database.objectStoreNames.contains(VECTOR_STORE_NAME)
        ? transaction.objectStore(VECTOR_STORE_NAME)
        : database.createObjectStore(VECTOR_STORE_NAME, { keyPath: 'key' })

      if (!store.indexNames.contains('scopeId')) store.createIndex('scopeId', 'scopeId')
      if (!store.indexNames.contains('sessionId')) store.createIndex('sessionId', 'sessionId')
      if (!store.indexNames.contains('sourceMessageId')) {
        store.createIndex('sourceMessageId', 'sourceMessageId')
      }
      if (!store.indexNames.contains('scopeApiModel')) {
        store.createIndex('scopeApiModel', ['scopeId', 'embeddingSource', 'embeddingModel'])
      }
    }
    request.onsuccess = () => {
      const database = request.result
      database.onversionchange = () => database.close()
      resolve(database)
    }
    request.onerror = () => reject(storageError(request.error))
    request.onblocked = () =>
      reject(new Error('向量库正在被其他窗口占用，请关闭其他小白酒馆窗口后重试。'))
  })
}

async function writeRecords(database: IDBDatabase, records: StoredVectorMemory[]) {
  if (records.length === 0) return
  const transaction = database.transaction(VECTOR_STORE_NAME, 'readwrite')
  const store = transaction.objectStore(VECTOR_STORE_NAME)
  for (const record of records) store.put(record)
  await transactionToPromise(transaction)
}

async function migrateLegacyVectorMemories(database: IDBDatabase) {
  const state = readTavernState()
  if (state.vectorMemories.length === 0) return

  await writeRecords(database, state.vectorMemories.map(toStoredMemory))
  state.vectorMemories = []
  try {
    writeTavernState(state)
  } catch (error) {
    console.warn('旧向量已迁移到 IndexedDB，但旧 localStorage 数据清理失败。', error)
  }
}

function requestPersistentStorage() {
  if (persistenceRequested || typeof navigator === 'undefined') return
  persistenceRequested = true

  let marker: string | null = null
  if (typeof localStorage !== 'undefined') {
    try {
      marker = localStorage.getItem(PERSISTENCE_KEY)
    } catch {
      // localStorage can be unavailable in private modes; IndexedDB may still work.
    }
  }
  if (marker === '1') return

  if (!navigator.storage?.persist) return
  try {
    void navigator.storage
      .persist()
      .then((granted) => {
        if (granted && typeof localStorage !== 'undefined') {
          try {
            localStorage.setItem(PERSISTENCE_KEY, '1')
          } catch {
            // Persistence is best-effort; the database still works without the marker.
          }
        }
      })
      .catch(() => {
        // Some WebViews do not expose persistent storage; IndexedDB remains usable.
      })
  } catch {
    // A broken StorageManager implementation must not block the vector database.
  }
}

async function getDatabase() {
  if (!databasePromise) {
    databasePromise = openDatabase()
      .then(async (database) => {
        await migrateLegacyVectorMemories(database)
        requestPersistentStorage()
        return database
      })
      .catch((error: unknown) => {
        databasePromise = null
        throw storageError(error)
      })
  }
  return databasePromise
}

async function getAllRecords() {
  const database = await getDatabase()
  const transaction = database.transaction(VECTOR_STORE_NAME, 'readonly')
  const completed = transactionToPromise(transaction)
  const request = transaction.objectStore(VECTOR_STORE_NAME).getAll()
  const [records] = await Promise.all([requestToPromise(request), completed])
  return records as StoredVectorMemory[]
}

async function deleteByIndex(indexName: 'sessionId' | 'sourceMessageId', values: string[]) {
  const uniqueValues = [...new Set(values)]
  if (uniqueValues.length === 0) return 0

  const database = await getDatabase()
  return new Promise<number>((resolve, reject) => {
    const transaction = database.transaction(VECTOR_STORE_NAME, 'readwrite')
    const store = transaction.objectStore(VECTOR_STORE_NAME)
    const index = store.index(indexName)
    let removed = 0
    let settled = false

    const fail = (error: unknown) => {
      if (settled) return
      settled = true
      reject(storageError(error))
    }

    transaction.oncomplete = () => {
      if (settled) return
      settled = true
      resolve(removed)
    }
    transaction.onerror = () => fail(transaction.error)
    transaction.onabort = () => fail(transaction.error)

    for (const value of uniqueValues) {
      const request = index.getAllKeys(IDBKeyRange.only(value))
      request.onsuccess = () => {
        for (const key of request.result) {
          store.delete(key)
          removed += 1
        }
      }
      request.onerror = () => fail(request.error)
    }
  })
}

export async function initializeVectorMemoryStore() {
  await getDatabase()
}

export async function listVectorMemoriesByScope(scopeId: string) {
  const database = await getDatabase()
  const transaction = database.transaction(VECTOR_STORE_NAME, 'readonly')
  const completed = transactionToPromise(transaction)
  const request = transaction.objectStore(VECTOR_STORE_NAME).index('scopeId').getAll(scopeId)
  const [records] = await Promise.all([requestToPromise(request), completed])
  return records as StoredVectorMemory[]
}

export async function listVectorMemorySourceIdsByScope(scopeId: string) {
  const database = await getDatabase()
  const transaction = database.transaction(VECTOR_STORE_NAME, 'readonly')
  const completed = transactionToPromise(transaction)
  const request = transaction.objectStore(VECTOR_STORE_NAME).index('scopeId').getAllKeys(scopeId)
  const [keys] = await Promise.all([requestToPromise(request), completed])
  const prefix = `${scopeId}\u0000`
  return keys.map((key) => String(key).slice(prefix.length))
}

export async function hasApiVectorMemory(scopeId: string, model: string) {
  const database = await getDatabase()
  const transaction = database.transaction(VECTOR_STORE_NAME, 'readonly')
  const completed = transactionToPromise(transaction)
  const request = transaction
    .objectStore(VECTOR_STORE_NAME)
    .index('scopeApiModel')
    .getKey([scopeId, 'api', model])
  const [key] = await Promise.all([requestToPromise(request), completed])
  return key !== undefined
}

export async function recallVectorMemoriesByScope(
  scopeId: string,
  query: RecallQuery,
  options: {
    excludeSessionId?: string
    excludeSourceMessageIds?: Set<string>
    limit?: number
  } = {},
) {
  const limit = Math.max(1, options.limit ?? VECTOR_RECALL_LIMIT)
  const database = await getDatabase()

  return new Promise<StoredVectorMemory[]>((resolve, reject) => {
    const transaction = database.transaction(VECTOR_STORE_NAME, 'readonly')
    const index = transaction.objectStore(VECTOR_STORE_NAME).index('scopeId')
    const request = index.openCursor(IDBKeyRange.only(scopeId))
    const top: { memory: StoredVectorMemory; score: number }[] = []
    let settled = false

    const fail = (error: unknown) => {
      if (settled) return
      settled = true
      reject(storageError(error))
    }

    transaction.onerror = () => fail(transaction.error)
    transaction.onabort = () => fail(transaction.error)
    request.onerror = () => fail(request.error)
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        if (settled) return
        settled = true
        resolve(top.map((item) => item.memory))
        return
      }

      const memory = cursor.value as StoredVectorMemory
      const excluded =
        memory.sessionId === options.excludeSessionId ||
        options.excludeSourceMessageIds?.has(memory.sourceMessageId)
      if (!excluded) {
        const score = scorePersistedMemory(memory, query)
        if (score > 0.05) {
          top.push({ memory, score })
          top.sort((left, right) => right.score - left.score)
          if (top.length > limit) top.length = limit
        }
      }
      cursor.continue()
    }
  })
}

export async function putVectorMemories(entries: VectorMemoryEntry[]) {
  if (entries.length === 0) return
  const database = await getDatabase()
  await writeRecords(database, entries.map(toStoredMemory))
}

export async function deleteVectorMemoriesBySessionIds(sessionIds: string[]) {
  return deleteByIndex('sessionId', sessionIds)
}

export async function deleteVectorMemoriesBySourceMessageIds(messageIds: string[]) {
  return deleteByIndex('sourceMessageId', messageIds)
}

export async function reassignVectorMemoryScope(
  sourceScopeId: string,
  targetScopeBySession: Map<string, string>,
) {
  if (targetScopeBySession.size === 0) return 0
  const records = (await listVectorMemoriesByScope(sourceScopeId)).filter((record) => {
    const targetScope = targetScopeBySession.get(record.sessionId)
    return Boolean(targetScope && targetScope !== sourceScopeId)
  })
  if (records.length === 0) return 0

  const database = await getDatabase()
  const transaction = database.transaction(VECTOR_STORE_NAME, 'readwrite')
  const store = transaction.objectStore(VECTOR_STORE_NAME)
  for (const record of records) {
    const targetScope = targetScopeBySession.get(record.sessionId)
    if (!targetScope) continue
    store.delete(record.key)
    store.put({
      ...record,
      scopeId: targetScope,
      key: vectorMemoryKey(targetScope, record.sourceMessageId),
    })
  }
  await transactionToPromise(transaction)
  return records.length
}

export async function clearVectorMemoryStore() {
  const database = await getDatabase()
  const transaction = database.transaction(VECTOR_STORE_NAME, 'readwrite')
  transaction.objectStore(VECTOR_STORE_NAME).clear()
  await transactionToPromise(transaction)
}

export async function countVectorMemories() {
  const database = await getDatabase()
  const transaction = database.transaction(VECTOR_STORE_NAME, 'readonly')
  const completed = transactionToPromise(transaction)
  const request = transaction.objectStore(VECTOR_STORE_NAME).count()
  const [total] = await Promise.all([requestToPromise(request), completed])
  return total
}

export async function getVectorMemoryStats(): Promise<VectorMemoryStats> {
  const database = await getDatabase()

  return new Promise<VectorMemoryStats>((resolve, reject) => {
    const transaction = database.transaction(VECTOR_STORE_NAME, 'readonly')
    const counts = new Map<string, number>()
    const apiModels = new Set<string>()
    let total = 0
    let localCount = 0
    let apiCount = 0
    let settled = false

    const fail = (error: unknown) => {
      if (settled) return
      settled = true
      reject(storageError(error))
    }

    transaction.onerror = () => fail(transaction.error)
    transaction.onabort = () => fail(transaction.error)
    const request = transaction.objectStore(VECTOR_STORE_NAME).openCursor()
    request.onerror = () => fail(request.error)
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        if (settled) return
        settled = true
        resolve({
          total,
          model: apiModels.size > 0 ? [...apiModels].join(' / ') : 'local-semantic-128',
          localCount,
          apiCount,
          scopes: [...counts.entries()].map(([scopeId, count]) => ({ scopeId, count })),
        })
        return
      }

      const memory = cursor.value as StoredVectorMemory
      total += 1
      counts.set(memory.scopeId, (counts.get(memory.scopeId) ?? 0) + 1)
      if (memory.embeddingSource === 'api') {
        apiCount += 1
        apiModels.add(memory.embeddingModel)
      } else {
        localCount += 1
      }
      cursor.continue()
    }
  })
}

export async function exportVectorMemories() {
  const memories = await getAllRecords()
  return memories.map(toVectorMemoryEntry)
}
