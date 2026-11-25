import { tavernStateSchema, type TavernState } from '@/features/tavern/types'
import {
  hasLegacyBuiltinComboResources,
  reconcileBuiltinComboResources,
} from '@/features/tavern/lib/builtin-combos'
import { BUILTIN_CHAT_REGEX_ID, createBuiltinChatRegex } from '@/features/tavern/lib/builtin-regex'
import { reconcileBuiltinCreationLabResources } from '@/features/tavern/lib/builtin-creation-lab'
import {
  repairIncompleteMessage,
  stripIncompleteSpeakerTag,
} from '@/features/tavern/lib/stream-completion'

import { createSeedState } from './fixtures/tavern'

export const TAVERN_STORAGE_KEY = 'xiaobai.tavern.v3'
const BUILTIN_REGEX_MIGRATION_KEY = 'xiaobai.tavern.builtin-regex.v1'
const BUILTIN_COMBOS_MIGRATION_KEY = 'xiaobai.tavern.builtin-combos.v2'
const BUILTIN_CREATION_LAB_MIGRATION_KEY = 'xiaobai.tavern.builtin-creation-lab.v1'

function storageAvailable() {
  return typeof window !== 'undefined' && Boolean(window.localStorage)
}

export function writeTavernState(state: TavernState) {
  if (!storageAvailable()) return
  window.localStorage.setItem(TAVERN_STORAGE_KEY, JSON.stringify(state))
}

function ensureBuiltinRegexMigration(state: TavernState) {
  if (!storageAvailable() || window.localStorage.getItem(BUILTIN_REGEX_MIGRATION_KEY) === '1') {
    return false
  }
  const added = !state.regexRules.some((rule) => rule.id === BUILTIN_CHAT_REGEX_ID)
  if (added) state.regexRules.unshift(createBuiltinChatRegex())
  window.localStorage.setItem(BUILTIN_REGEX_MIGRATION_KEY, '1')
  return added
}

function ensureBuiltinComboMigration(state: TavernState) {
  if (!storageAvailable()) return false
  const migrated = window.localStorage.getItem(BUILTIN_COMBOS_MIGRATION_KEY) === '1'
  if (migrated && !hasLegacyBuiltinComboResources(state)) return false
  const changed = reconcileBuiltinComboResources(state)
  window.localStorage.setItem(BUILTIN_COMBOS_MIGRATION_KEY, '1')
  return changed
}

function ensureBuiltinCreationLabMigration(state: TavernState) {
  if (
    !storageAvailable() ||
    window.localStorage.getItem(BUILTIN_CREATION_LAB_MIGRATION_KEY) === '1'
  ) {
    return false
  }
  const changed = reconcileBuiltinCreationLabResources(state)
  window.localStorage.setItem(BUILTIN_CREATION_LAB_MIGRATION_KEY, '1')
  return changed
}

function repairIncompleteMessages(state: TavernState) {
  let changed = false
  for (const messages of Object.values(state.messages)) {
    for (const message of messages) {
      if (repairIncompleteMessage(message)) changed = true
    }
  }
  for (const memory of state.vectorMemories) {
    const content = stripIncompleteSpeakerTag(memory.content)
    if (content !== memory.content) {
      memory.content = content
      changed = true
    }
  }
  return changed
}

export function readTavernState(): TavernState {
  if (!storageAvailable()) return createSeedState()

  const stored = window.localStorage.getItem(TAVERN_STORAGE_KEY)
  if (stored) {
    try {
      const parsed = tavernStateSchema.safeParse(JSON.parse(stored))
      if (parsed.success) {
        const repairedMessages = repairIncompleteMessages(parsed.data)
        const regexMigrated = ensureBuiltinRegexMigration(parsed.data)
        const combosMigrated = ensureBuiltinComboMigration(parsed.data)
        const creationLabMigrated = ensureBuiltinCreationLabMigration(parsed.data)
        if (regexMigrated || combosMigrated || creationLabMigrated || repairedMessages) {
          writeTavernState(parsed.data)
        }
        return parsed.data
      }
    } catch {
      // Invalid local data is replaced by a clean initial state below.
    }
  }

  const seeded = createSeedState()
  writeTavernState(seeded)
  return seeded
}

export function updateTavernState(updater: (state: TavernState) => void) {
  const state = readTavernState()
  updater(state)
  writeTavernState(state)
  return state
}

export function resetTavernStore() {
  const seeded = createSeedState()
  writeTavernState(seeded)
  return seeded
}
