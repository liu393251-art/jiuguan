import { defaultImageGeneration, type TavernState } from '@/features/tavern/types'
import { createBuiltinComboResources } from '@/features/tavern/lib/builtin-combos'
import { createBuiltinChatRegex } from '@/features/tavern/lib/builtin-regex'
import { createBuiltinCreationLabResources } from '@/features/tavern/lib/builtin-creation-lab'
import { createBuiltinHelihuaResources } from '@/features/tavern/lib/builtin-helihua'

export function createSeedState(): TavernState {
  const builtinCombos = createBuiltinComboResources()
  const creationLab = createBuiltinCreationLabResources()
  const helihua = createBuiltinHelihuaResources()
  return {
    characters: [...creationLab.characters, ...helihua.characters],
    loadouts: [...creationLab.loadouts, ...helihua.loadouts],
    combos: builtinCombos.combos,
    presets: [...builtinCombos.presets, ...creationLab.presets, ...helihua.presets],
    worldBooks: [...creationLab.worldBooks, ...helihua.worldBooks],
    regexRules: [
      createBuiltinChatRegex(),
      ...builtinCombos.regexRules,
      ...creationLab.regexRules,
      ...helihua.regexRules,
    ],

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
