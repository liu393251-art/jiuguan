import { z } from 'zod'

import atriPresetSource from '../builtins/lisug-atri-gemini.preset.json'
import tangliRegexSource from '../builtins/tangli-regex.json'
import {
  presetInputSchema,
  regexRuleInputSchema,
  type Combo,
  type Preset,
  type RegexRule,
  type TavernState,
} from '../types'
import { buildImportPayload } from './import-parser'

const BUILTIN_TIMESTAMP = '2026-11-25T00:00:00.000Z'
const TANGLI_REGEX_PACK_ID = 'builtin-regex-pack-tangli'
const TANGLI_REGEX_PACK_NAME = '棠梨预设正则包'
const LEGACY_BUILTIN_COMBO_IDS = new Set([
  'builtin-combo-lisug-atri-gemini',
  'builtin-combo-tangli-regex',
])
const LEGACY_BUILTIN_REGEX_PREFIX = 'builtin-regex-lisug-atri-'
const TANGLI_BUILTIN_REGEX_PREFIX = 'builtin-regex-tangli-'

export const BUILTIN_COMBO_IDS = {
  atriPreset: 'builtin-preset-lisug-atri-gemini',
  combo: 'builtin-combo-atri-tangli',
} as const

const atriPresetInput = presetInputSchema.parse({
  ...buildImportPayload('preset', atriPresetSource, 'lisug-atri-gemini.json'),
  name: "li'sug · ATRI Gemini",
  description:
    '来自 lisug_ATRI_gemini.json 的内置 Gemini 叙事预设；与棠梨预设正则包组成一套内置组合。',
})

function parseBuiltinRegexRules(
  source: unknown,
  fileName: string,
  idPrefix: string,
  namePrefix: string,
  packId: string,
  packName: string,
) {
  const payload = buildImportPayload('regex', source, fileName)
  return z
    .array(regexRuleInputSchema)
    .parse(payload.rules)
    .map((rule, index) => ({
      ...rule,
      id: `${idPrefix}-${index + 1}`,
      name: `${namePrefix} · ${rule.name}`,
      packId,
      packName,
    }))
}

const tangliRegexInputs = parseBuiltinRegexRules(
  tangliRegexSource.regex_scripts,
  tangliRegexSource.name,
  'builtin-regex-tangli',
  '棠梨',
  TANGLI_REGEX_PACK_ID,
  TANGLI_REGEX_PACK_NAME,
)

export function createBuiltinComboResources(): {
  presets: Preset[]
  regexRules: RegexRule[]
  combos: Combo[]
} {
  const preset: Preset = {
    ...atriPresetInput,
    generation: { ...atriPresetInput.generation },
    id: BUILTIN_COMBO_IDS.atriPreset,
    source: 'seed',
    createdAt: BUILTIN_TIMESTAMP,
  }
  const tangliRules: RegexRule[] = tangliRegexInputs.map((rule) => ({ ...rule }))
  const combo: Combo = {
    id: BUILTIN_COMBO_IDS.combo,
    name: '棠梨 · ATRI Gemini',
    description:
      "内置组合：li'sug ATRI Gemini 预设 + 棠梨预设正则包中的 8 条正则，适合 Gemini 长上下文叙事。",
    presetId: preset.id,
    regexRuleIds: tangliRules.map((rule) => rule.id),
    coverImage: '/builtin/tangli-preset-regex.png',
    source: 'seed',
    createdAt: BUILTIN_TIMESTAMP,
    updatedAt: BUILTIN_TIMESTAMP,
  }

  return {
    presets: [preset],
    regexRules: tangliRules,
    combos: [combo],
  }
}

type ComboResourceState = Pick<TavernState, 'presets' | 'regexRules' | 'combos'>

export function hasLegacyBuiltinComboResources(state: ComboResourceState) {
  return (
    state.combos.some((combo) => LEGACY_BUILTIN_COMBO_IDS.has(combo.id)) ||
    state.regexRules.some((rule) => rule.id.startsWith(LEGACY_BUILTIN_REGEX_PREFIX)) ||
    state.regexRules.some((rule) => rule.id.startsWith(TANGLI_BUILTIN_REGEX_PREFIX) && !rule.packId)
  )
}

function hasSameRegexContent(left: RegexRule, right: RegexRule) {
  return (
    left.name === right.name &&
    left.pattern === right.pattern &&
    left.replacement === right.replacement &&
    left.flags === right.flags &&
    left.scope === right.scope &&
    left.enabled === right.enabled &&
    left.packId === right.packId &&
    left.packName === right.packName
  )
}

export function reconcileBuiltinComboResources(
  state: ComboResourceState,
  builtin = createBuiltinComboResources(),
) {
  let changed = false
  const currentComboIds = new Set(builtin.combos.map((combo) => combo.id))

  const retainedCombos = state.combos.filter(
    (combo) =>
      !LEGACY_BUILTIN_COMBO_IDS.has(combo.id) &&
      (combo.source !== 'seed' || currentComboIds.has(combo.id)),
  )
  if (retainedCombos.length !== state.combos.length) {
    state.combos = retainedCombos
    changed = true
  }

  const builtinRegexById = new Map(builtin.regexRules.map((rule) => [rule.id, rule]))
  const nextRegexRules: RegexRule[] = []
  for (const rule of state.regexRules) {
    if (rule.id.startsWith(LEGACY_BUILTIN_REGEX_PREFIX)) {
      changed = true
      continue
    }
    if (rule.id.startsWith(TANGLI_BUILTIN_REGEX_PREFIX) && !builtinRegexById.has(rule.id)) {
      changed = true
      continue
    }
    const canonical = builtinRegexById.get(rule.id)
    if (canonical && !hasSameRegexContent(rule, canonical)) {
      nextRegexRules.push({ ...canonical })
      changed = true
      continue
    }
    nextRegexRules.push(rule)
  }
  state.regexRules = nextRegexRules

  const presetIds = new Set(state.presets.map((preset) => preset.id))
  for (const preset of builtin.presets) {
    if (presetIds.has(preset.id)) continue
    state.presets.push({ ...preset, generation: { ...preset.generation } })
    presetIds.add(preset.id)
    changed = true
  }

  const regexIds = new Set(state.regexRules.map((rule) => rule.id))
  for (const rule of builtin.regexRules) {
    if (regexIds.has(rule.id)) continue
    state.regexRules.push({ ...rule })
    regexIds.add(rule.id)
    changed = true
  }

  const validPresetIds = new Set(state.presets.map((preset) => preset.id))
  const validRegexIds = new Set(state.regexRules.map((rule) => rule.id))
  const cleanedCombos: Combo[] = []
  for (const combo of state.combos) {
    const regexRuleIds = combo.regexRuleIds.filter((id) => validRegexIds.has(id))
    const presetId = combo.presetId && validPresetIds.has(combo.presetId) ? combo.presetId : null
    if (!presetId && regexRuleIds.length === 0) {
      changed = true
      continue
    }
    if (regexRuleIds.length !== combo.regexRuleIds.length || presetId !== combo.presetId) {
      cleanedCombos.push({ ...combo, regexRuleIds, presetId })
      changed = true
      continue
    }
    cleanedCombos.push(combo)
  }
  state.combos = cleanedCombos

  const comboIds = new Set(state.combos.map((combo) => combo.id))
  for (const combo of builtin.combos) {
    if (comboIds.has(combo.id)) continue
    state.combos.push({ ...combo, regexRuleIds: [...combo.regexRuleIds] })
    comboIds.add(combo.id)
    changed = true
  }

  return changed
}
