import { describe, expect, it } from 'vitest'

import { createSeedState } from '@/mocks/fixtures/tavern'

import { BUILTIN_CHAT_REGEX_ID } from './builtin-regex'
import {
  BUILTIN_CREATION_LAB_IDS,
  createBuiltinCreationLabResources,
  isBuiltinCreationLabLoadout,
  reconcileBuiltinCreationLabResources,
} from './builtin-creation-lab'

describe('builtin creation lab', () => {
  it('bundles the three creation presets with their companion cards', () => {
    const { characters, presets, worldBooks, regexRules, loadouts } =
      createBuiltinCreationLabResources()

    expect(characters.map((character) => character.name)).toEqual([
      '掌卷 · 四楼书库',
      '卡匠 · 铸造台',
      '调律师 · 旋钮台',
    ])
    expect(characters.map((character) => character.id)).toEqual([
      BUILTIN_CREATION_LAB_IDS.characters.keeper,
      BUILTIN_CREATION_LAB_IDS.characters.smith,
      BUILTIN_CREATION_LAB_IDS.characters.tuner,
    ])
    expect(characters.every((character) => character.source === 'seed')).toBe(true)
    expect(characters[0]?.firstMessage).toContain('掌卷')
    expect(characters[1]?.firstMessage).toContain('卡匠')
    expect(characters[2]?.firstMessage).toContain('调律师')

    expect(presets.map((preset) => preset.name)).toEqual([
      '世界书创作预设 · Hashlib',
      '角色卡创作预设 · Hashlib',
      '预设生成器 · PresetForge v1',
    ])
    expect(presets.every((preset) => preset.source === 'seed')).toBe(true)
    expect(presets.every((preset) => preset.promptSummary.length > 5000)).toBe(true)
    expect(presets.every((preset) => preset.generation.maxTokens <= 8192)).toBe(true)

    expect(worldBooks).toHaveLength(3)
    expect(worldBooks.every((book) => book.source === 'seed')).toBe(true)
    expect(worldBooks.every((book) => book.entries.length === 10)).toBe(true)
    expect(worldBooks.every((book) => book.entries.every((entry) => entry.id.length > 0))).toBe(
      true,
    )

    expect(regexRules).toHaveLength(3)
    expect(regexRules.map((rule) => rule.name)).toEqual([
      '角色卡创作预设 · hashlib 思维链隐藏(提示词侧)',
      '预设生成器 · Forge 智能引号安全化(JSON 不炸)',
      '预设生成器 · Forge 输出前缀清理(防复读)',
    ])
    expect(regexRules.every((rule) => rule.packId && rule.packName)).toBe(true)

    expect(loadouts).toHaveLength(3)
    expect(loadouts.every((loadout) => loadout.regexRuleIds.includes(BUILTIN_CHAT_REGEX_ID))).toBe(
      true,
    )
    expect(loadouts.map((loadout) => loadout.worldBookIds)).toEqual([
      [BUILTIN_CREATION_LAB_IDS.worldBooks.keeper],
      [BUILTIN_CREATION_LAB_IDS.worldBooks.smith],
      [BUILTIN_CREATION_LAB_IDS.worldBooks.tuner],
    ])
    expect(loadouts.map((loadout) => loadout.presetId)).toEqual([
      BUILTIN_CREATION_LAB_IDS.presets.worldbook,
      BUILTIN_CREATION_LAB_IDS.presets.card,
      BUILTIN_CREATION_LAB_IDS.presets.forge,
    ])
    expect(isBuiltinCreationLabLoadout(BUILTIN_CREATION_LAB_IDS.loadouts.keeper)).toBe(true)
    expect(isBuiltinCreationLabLoadout('loadout-user-1')).toBe(false)
  })

  it('seeds the creation lab into a fresh tavern state', () => {
    const state = createSeedState()

    // 种子状态同时包含「创作工坊」三套与「合理化世界」五张卡，所以这里是总数。
    expect(state.characters).toHaveLength(8)
    expect(state.presets.some((preset) => preset.id === 'builtin-preset-lisug-atri-gemini')).toBe(
      true,
    )
    expect(state.presets).toHaveLength(5)
    expect(state.worldBooks).toHaveLength(4)
    expect(state.loadouts).toHaveLength(8)
    expect(state.regexRules[0]?.id).toBe(BUILTIN_CHAT_REGEX_ID)
    expect(state.regexRules).toHaveLength(25)
  })

  it('adds the creation lab to an existing state only once', () => {
    const state = {
      characters: [],
      presets: [],
      worldBooks: [],
      regexRules: [],
      loadouts: [],
    }

    expect(reconcileBuiltinCreationLabResources(state)).toBe(true)
    expect(state.characters).toHaveLength(3)
    expect(state.presets).toHaveLength(3)
    expect(state.worldBooks).toHaveLength(3)
    expect(state.regexRules).toHaveLength(3)
    expect(state.loadouts).toHaveLength(3)
    expect(reconcileBuiltinCreationLabResources(state)).toBe(false)
  })

  it('skips loadouts whose character or preset is missing', () => {
    const builtin = createBuiltinCreationLabResources()
    const state = {
      characters: [],
      presets: [],
      worldBooks: [],
      regexRules: [],
      loadouts: [],
    }

    reconcileBuiltinCreationLabResources(state, {
      ...builtin,
      characters: [],
    })
    expect(state.presets).toHaveLength(3)
    expect(state.loadouts).toHaveLength(0)
  })
})
