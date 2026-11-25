import type { RegexRule } from '../types'

export const BUILTIN_CHAT_REGEX_ID = 'regex-chat-bubbles'
export const BUILTIN_CHAT_REGEX_PACK_ID = 'regex-pack-chat-bubbles'

export function createBuiltinChatRegex(): RegexRule {
  return {
    id: BUILTIN_CHAT_REGEX_ID,
    packId: BUILTIN_CHAT_REGEX_PACK_ID,
    packName: '微信式对话气泡',
    name: '微信式对话气泡',
    pattern: '^【([^】\\r\\n]{1,32})】[ \\t]*\\\\?[ \\t]*$',
    replacement: '$1：',
    flags: 'gm',
    scope: 'output',
    enabled: true,
  }
}

export function withBuiltinChatRegex(ruleIds: string[]) {
  return [BUILTIN_CHAT_REGEX_ID, ...ruleIds.filter((id) => id !== BUILTIN_CHAT_REGEX_ID)]
}
