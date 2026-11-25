import type { RegexRule } from '../types'

export const BUILTIN_CHAT_REGEX_ID = 'regex-chat-bubbles'

export function createBuiltinChatRegex(): RegexRule {
  return {
    id: BUILTIN_CHAT_REGEX_ID,
    name: '微信式对话气泡',
    pattern: '^【([^】\\r\\n]{1,32})】[ \\t]*\\\\?[ \\t]*$',
    replacement: '$1：',
    flags: 'gm',
    scope: 'output',
    enabled: true,
  }
}
