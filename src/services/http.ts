type Parser<T> = {
  parse: (input: unknown) => T
}

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

function resolveUrl(path: string) {
  return `${apiBaseUrl}${path}`
}

async function readErrorMessage(response: Response) {
  try {
    const payload: unknown = await response.json()

    if (
      payload &&
      typeof payload === 'object' &&
      'message' in payload &&
      typeof payload.message === 'string'
    ) {
      return payload.message
    }
  } catch {
    // The response did not contain JSON.
  }

  return `Request failed with status ${response.status}.`
}

async function request<T>(path: string, init: RequestInit, parser?: Parser<T>): Promise<T> {
  const headers = new Headers(init.headers)

  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(resolveUrl(path), {
    ...init,
    headers,
  })

  if (!response.ok) {
    throw new ApiError(await readErrorMessage(response), response.status)
  }

  if (response.status === 204) {
    return undefined as T
  }

  const payload: unknown = await response.json()
  return parser ? parser.parse(payload) : (payload as T)
}

export function getJson<T>(path: string, parser: Parser<T>, signal?: AbortSignal) {
  return request(path, { method: 'GET', signal }, parser)
}

export function postJson<T>(path: string, body: unknown, parser: Parser<T>) {
  return request(
    path,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    parser,
  )
}

export function patchJson<T>(path: string, body: unknown, parser: Parser<T>) {
  return request(
    path,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
    parser,
  )
}

export function deleteJson<T>(path: string, parser: Parser<T>) {
  return request(path, { method: 'DELETE' }, parser)
}

function readUnknownErrorMessage(error: unknown, depth = 0): string {
  if (depth > 3 || error == null) return ''
  if (typeof error === 'string') return error.trim()
  if (typeof error === 'number' || typeof error === 'boolean') return String(error)
  if (error instanceof Error) {
    return error.message.trim() || readUnknownErrorMessage(error.cause, depth + 1)
  }
  if (typeof error === 'object') {
    const record = error as Record<string, unknown>
    for (const key of ['message', 'error', 'reason', 'cause']) {
      const message = readUnknownErrorMessage(record[key], depth + 1)
      if (message) return message
    }
    try {
      const serialized = JSON.stringify(error)
      return serialized && serialized !== '{}' ? serialized : ''
    } catch {
      return ''
    }
  }
  return ''
}

export function getErrorMessage(error: unknown) {
  return readUnknownErrorMessage(error) || '操作失败，请稍后重试。'
}

export async function streamNdjson<T>(
  path: string,
  onEvent: (event: T) => void,
  signal?: AbortSignal,
) {
  const response = await fetch(resolveUrl(path), { method: 'GET', signal })

  if (!response.ok) {
    throw new ApiError(await readErrorMessage(response), response.status)
  }
  if (!response.body) {
    throw new ApiError('流式响应不可用。', 500)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        onEvent(JSON.parse(trimmed) as T)
      } catch {
        // Ignore malformed chunks and wait for the next complete line.
      }
    }
  }
}
