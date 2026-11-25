import { fetch as tauriFetch } from '@tauri-apps/plugin-http'

import { getErrorMessage } from './http'

type ExternalFetchInit = RequestInit & {
  connectTimeout?: number
}

export function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function requestTarget(input: string) {
  try {
    const url = new URL(input)
    return {
      host: url.host,
      url,
    }
  } catch {
    return {
      host: input,
      url: null,
    }
  }
}

export function describeExternalHttpError(error: unknown, input: string) {
  const message = getErrorMessage(error)
  const lower = message.toLowerCase()
  const { host } = requestTarget(input)

  if (lower.includes('url not allowed')) {
    return `系统网络权限拒绝了 ${host}。请确认应用已允许该地址和端口后重试。`
  }
  if (lower.includes('renegotiat')) {
    return `连接 ${host} 时服务器要求 TLS 重协商，安卓网络库不支持这种握手。请让中转站关闭证书校验或重协商，或改用标准 443 端口的反向代理。`
  }
  if (
    lower.includes('certificate') ||
    lower.includes('unknown issuer') ||
    lower.includes('invalid peer') ||
    lower.includes('tls') ||
    lower.includes('ssl') ||
    lower.includes('handshake')
  ) {
    return `连接 ${host} 的 HTTPS 握手失败：${message}`
  }
  if (
    lower.includes('dns') ||
    lower.includes('resolve') ||
    lower.includes('lookup address') ||
    lower.includes('name or service not known') ||
    lower.includes('no address associated')
  ) {
    return `无法解析 ${host} 的域名。手机需要和服务器处于同一网络，并能正常访问这个地址。`
  }
  if (
    lower.includes('connection refused') ||
    lower.includes('tcp connect') ||
    lower.includes('connect error') ||
    lower.includes('os error 111')
  ) {
    return `无法连接 ${host}，端口可能未开放，或服务器没有启动。`
  }
  if (lower.includes('timed out') || lower.includes('timeout')) {
    return `连接 ${host} 超时，请检查网络、地址和端口。`
  }
  if (lower.includes('cancel')) {
    return '请求已取消或超时。'
  }
  if (
    lower.includes('failed to fetch') ||
    lower.includes('load failed') ||
    lower.includes('network request failed')
  ) {
    return `请求没有到达 ${host}。请检查网络；浏览器版还可能受跨域限制。`
  }

  return `连接 ${host} 失败：${message}`
}

async function requestWith(
  input: string,
  init: ExternalFetchInit,
  fetcher: (input: string, init: ExternalFetchInit) => Promise<Response>,
) {
  try {
    return await fetcher(input, init)
  } catch (error) {
    throw new Error(describeExternalHttpError(error, input), { cause: error })
  }
}

export async function externalFetch(input: string, init: ExternalFetchInit = {}) {
  if (isTauriRuntime()) {
    return requestWith(
      input,
      {
        ...init,
        connectTimeout: 30_000,
      },
      tauriFetch,
    )
  }

  return requestWith(input, init, fetch)
}
