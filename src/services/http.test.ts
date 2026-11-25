import { describe, expect, it } from 'vitest'

import { getErrorMessage } from './http'

describe('getErrorMessage', () => {
  it('keeps messages from native Error objects', () => {
    expect(getErrorMessage(new Error('连接被拒绝'))).toBe('连接被拒绝')
  })

  it('keeps string errors returned by the Android bridge', () => {
    expect(getErrorMessage('url not allowed on the configured scope: https://example.test')).toBe(
      'url not allowed on the configured scope: https://example.test',
    )
  })

  it('reads nested error messages from API payloads', () => {
    expect(getErrorMessage({ error: { message: 'Invalid token' } })).toBe('Invalid token')
    expect(getErrorMessage({ message: '请求失败' })).toBe('请求失败')
  })

  it('falls back to a readable Chinese message', () => {
    expect(getErrorMessage(null)).toBe('操作失败，请稍后重试。')
    expect(getErrorMessage({})).toBe('操作失败，请稍后重试。')
  })
})
