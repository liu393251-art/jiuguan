import type { TavernState } from '@/features/tavern/types'
import { createBuiltinChatRegex } from '@/features/tavern/lib/builtin-regex'

export function createSeedState(): TavernState {
  return {
    characters: [],
    loadouts: [],
    presets: [],
    worldBooks: [],
    regexRules: [createBuiltinChatRegex()],
    sessions: [],
    messages: {},
    vectorMemories: [],
    settings: {
      apiProfiles: [],
      memoryProfile: {
        id: 'memory-default',
        name: '默认记忆',
        description: '',
        mode: 'recent',
        summaryPrompt: '',
        maxMessages: 24,
        apiProfileId: null,
      },
      identity: {
        displayName: '',
        persona: '',
      },
      appearance: {
        defaultChatFontSize: 15,
      },
    },
  }
}
