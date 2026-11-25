import { defaultImageGeneration, type TavernState } from '@/features/tavern/types'
import { createBuiltinComboResources } from '@/features/tavern/lib/builtin-combos'
import { createBuiltinChatRegex } from '@/features/tavern/lib/builtin-regex'

export function createSeedState(): TavernState {
  const builtinCombos = createBuiltinComboResources()
  return {
    characters: [],
    loadouts: [],
    combos: builtinCombos.combos,
    presets: builtinCombos.presets,
    worldBooks: [],
    regexRules: [createBuiltinChatRegex(), ...builtinCombos.regexRules],
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
      imageGeneration: { ...defaultImageGeneration },
    },
  }
}
