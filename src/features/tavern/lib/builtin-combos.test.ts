import { describe, expect, it } from 'vitest'

import { createSeedState } from '@/mocks/fixtures/tavern'

import { createBuiltinChatRegex } from './builtin-regex'
import {
  BUILTIN_COMBO_IDS,
  createBuiltinComboResources,
  reconcileBuiltinComboResources,
} from './builtin-combos'

describe('builtin combos', () => {
  it('bundles the ATRI Gemini preset with the Tangli regex pack', () => {
    const { presets, regexRules, combos } = createBuiltinComboResources()
    const preset = presets.find((item) => item.id === BUILTIN_COMBO_IDS.atriPreset)
    const combo = combos.find((item) => item.id === BUILTIN_COMBO_IDS.combo)

    expect(preset?.name).toBe("li'sug · ATRI Gemini")
    expect(preset?.generation.temperature).toBeCloseTo(1.1)
    expect(preset?.promptSummary).toContain('ATRI')
    expect(combos).toHaveLength(1)
    expect(combo?.name).toBe('棠梨 · ATRI Gemini')
    expect(combo?.presetId).toBe(preset?.id)
    expect(combo?.regexRuleIds).toHaveLength(8)
    expect(combo?.coverImage).toContain('tangli-preset-regex')

    const rules = combo?.regexRuleIds.map((id) => regexRules.find((rule) => rule.id === id))
    expect(rules?.every(Boolean)).toBe(true)
    expect(rules?.every((rule) => rule?.name.startsWith('棠梨 · '))).toBe(true)
    expect(rules?.every((rule) => rule?.packName === '棠梨预设正则包')).toBe(true)
    expect(rules?.filter((rule) => rule?.enabled)).toHaveLength(5)
    expect(rules?.find((rule) => rule?.name.includes('user_message'))?.scope).toBe('input')
    expect(rules?.find((rule) => rule?.name.includes('user_message'))?.enabled).toBe(false)
    expect(rules?.find((rule) => rule?.name.includes('summary1'))?.enabled).toBe(false)
    expect(rules?.find((rule) => rule?.name.includes('summary2'))?.enabled).toBe(false)
    expect(rules?.find((rule) => rule?.name.includes('thinking'))?.scope).toBe('output')
    expect(rules?.find((rule) => rule?.name.includes('thinking'))?.enabled).toBe(true)
  })

  it('replaces the legacy two built-in combos with the single current combo', () => {
    const state = createSeedState()
    const [currentCombo] = state.combos
    state.combos = [
      {
        ...currentCombo,
        id: 'builtin-combo-lisug-atri-gemini',
        name: "li'sug · ATRI Gemini",
        presetId: BUILTIN_COMBO_IDS.atriPreset,
        regexRuleIds: ['builtin-regex-lisug-atri-1'],
      },
      {
        ...currentCombo,
        id: 'builtin-combo-tangli-regex',
        name: '棠梨预设正则包',
        presetId: null,
        regexRuleIds: ['builtin-regex-tangli-1'],
      },
    ]
    state.regexRules = [
      createBuiltinChatRegex(),
      {
        ...state.regexRules[1],
        id: 'builtin-regex-lisug-atri-1',
        name: "【li'sug】thinking",
      },
      {
        ...state.regexRules[1],
        id: 'builtin-regex-tangli-1',
        name: "【li'sug】thinking",
        packId: null,
        packName: null,
      },
    ]

    expect(reconcileBuiltinComboResources(state)).toBe(true)
    expect(state.combos).toHaveLength(1)
    expect(state.combos[0]).toMatchObject({
      id: BUILTIN_COMBO_IDS.combo,
      name: '棠梨 · ATRI Gemini',
      presetId: BUILTIN_COMBO_IDS.atriPreset,
    })
    expect(state.combos[0].regexRuleIds).toHaveLength(8)
    expect(state.regexRules).toHaveLength(9)
    expect(state.regexRules.some((rule) => rule.id.includes('lisug-atri'))).toBe(false)
    expect(state.regexRules.find((rule) => rule.id === 'builtin-regex-tangli-1')?.name).toBe(
      "棠梨 · 【li'sug】thinking",
    )
    expect(state.regexRules.find((rule) => rule.id === 'builtin-regex-tangli-1')?.packName).toBe(
      '棠梨预设正则包',
    )
    expect(reconcileBuiltinComboResources(state)).toBe(false)
  })
})
