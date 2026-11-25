export const IMAGE_DB_NAME = 'xiaobai.tavern.images'
export const IMAGE_STORE_NAME = 'images'

const IMAGE_DB_VERSION = 1

type StoredGeneratedImage = {
  id: string
  blob: Blob
  mimeType: string
  createdAt: string
}

let databasePromise: Promise<IDBDatabase> | null = null

function storageError(error: unknown) {
  if (
    error instanceof Error &&
    (error.name === 'QuotaExceededError' ||
      (typeof DOMException !== 'undefined' && error instanceof DOMException && error.code === 22))
  ) {
    return new Error('本机图片库空间不足，请删除旧对话或清理图片后再试。')
  }
  if (error instanceof Error) return error
  return new Error('本机图片库操作失败，请重新打开应用后重试。')
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
      reject(new Error('当前环境不支持 IndexedDB，无法保存生成图片。'))
      return
    }

    const request = indexedDB.open(IMAGE_DB_NAME, IMAGE_DB_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(IMAGE_STORE_NAME)) {
        database.createObjectStore(IMAGE_STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => {
      const database = request.result
      database.onversionchange = () => database.close()
      resolve(database)
    }
    request.onerror = () => reject(storageError(request.error))
    request.onblocked = () =>
      reject(new Error('图片库正在被其他窗口占用，请关闭其他小白酒馆窗口后重试。'))
  })
}

async function getDatabase() {
  if (!databasePromise) {
    databasePromise = openDatabase().catch((error: unknown) => {
      databasePromise = null
      throw storageError(error)
    })
  }
  return databasePromise
}

export async function putGeneratedImage(id: string, blob: Blob, mimeType: string) {
  const database = await getDatabase()
  const transaction = database.transaction(IMAGE_STORE_NAME, 'readwrite')
  transaction.objectStore(IMAGE_STORE_NAME).put({
    id,
    blob,
    mimeType,
    createdAt: new Date().toISOString(),
  } satisfies StoredGeneratedImage)
  await transactionToPromise(transaction)
}

export async function getGeneratedImage(id: string) {
  const database = await getDatabase()
  const transaction = database.transaction(IMAGE_STORE_NAME, 'readonly')
  const completed = transactionToPromise(transaction)
  const request = transaction.objectStore(IMAGE_STORE_NAME).get(id) as IDBRequest<
    StoredGeneratedImage | undefined
  >
  const [record] = await Promise.all([requestToPromise(request), completed])
  if (!record) return null
  return record.blob.type ? record.blob : record.blob.slice(0, record.blob.size, record.mimeType)
}

export async function deleteGeneratedImages(ids: string[]) {
  const uniqueIds = [...new Set(ids.filter(Boolean))]
  if (uniqueIds.length === 0) return
  const database = await getDatabase()
  const transaction = database.transaction(IMAGE_STORE_NAME, 'readwrite')
  const store = transaction.objectStore(IMAGE_STORE_NAME)
  for (const id of uniqueIds) store.delete(id)
  await transactionToPromise(transaction)
}

export async function clearGeneratedImages() {
  const database = await getDatabase()
  const transaction = database.transaction(IMAGE_STORE_NAME, 'readwrite')
  transaction.objectStore(IMAGE_STORE_NAME).clear()
  await transactionToPromise(transaction)
}
