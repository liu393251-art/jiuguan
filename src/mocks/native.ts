import type { RequestHandler } from 'msw'

import { handlers } from './handlers'

function isApiRequest(request: Request) {
  return new URL(request.url).pathname.startsWith('/api/')
}

export function enableNativeMocking() {
  const originalFetch = window.fetch.bind(window)
  let requestId = 0

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    if (!isApiRequest(request)) {
      return originalFetch(input, init)
    }

    for (const handler of handlers) {
      requestId += 1
      const result = await (handler as RequestHandler).run({
        request: request.clone(),
        requestId: `native-${requestId}`,
      })
      if (result?.response) return result.response
    }

    return new Response(JSON.stringify({ message: 'Mock API 未匹配到请求。' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
