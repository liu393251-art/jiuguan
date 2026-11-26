import { z } from 'zod'

import mainCardSource from '../builtins/helihua-character.json'
import shenzhaoningCardSource from '../builtins/helihua/shenzhaoning.json'
import sunanCardSource from '../builtins/helihua/sunan.json'
import wenyiningCardSource from '../builtins/helihua/wenyining.json'
import zhoumuCardSource from '../builtins/helihua/zhoumu.json'
import presetSource from '../builtins/helihua-preset.json'
import regexSource from '../builtins/helihua-regex.json'
import worldbookSource from '../builtins/helihua-worldbook.json'
import {
  characterInputSchema,
  presetInputSchema,
  regexRuleInputSchema,
  worldBookInputSchema,
  type Character,
  type Loadout,
  type Preset,
  type RegexRule,
  type TavernState,
  type WorldBook,
} from '../types'
import { BUILTIN_CHAT_REGEX_ID } from './builtin-regex'
import { buildImportPayload } from './import-parser'

const BUILTIN_TIMESTAMP = '2026-11-25T00:00:00.000Z'

export const BUILTIN_HELIHUA_IDS = {
  worldBook: 'builtin-worldbook-helihua',
  preset: 'builtin-preset-helihua',
  regexPack: 'builtin-regex-pack-helihua',
  characters: {
    group: 'builtin-character-helihua-wutongli7',
    shenzhaoning: 'builtin-character-helihua-shenzhaoning',
    sunan: 'builtin-character-helihua-sunan',
    wenyining: 'builtin-character-helihua-wenyining',
    zhoumu: 'builtin-character-helihua-zhoumu',
  },
  loadouts: {
    group: 'builtin-loadout-helihua-wutongli7',
    shenzhaoning: 'builtin-loadout-helihua-shenzhaoning',
    sunan: 'builtin-loadout-helihua-sunan',
    wenyining: 'builtin-loadout-helihua-wenyining',
    zhoumu: 'builtin-loadout-helihua-zhoumu',
  },
} as const

const BUILTIN_LOADOUT_IDS = new Set<string>(Object.values(BUILTIN_HELIHUA_IDS.loadouts))

export function isBuiltinHelihuaLoadout(loadoutId: string) {
  return BUILTIN_LOADOUT_IDS.has(loadoutId)
}

export const BUILTIN_HELIHUA_PRESET_NAME = '合理化世界 · 预设'
export const BUILTIN_HELIHUA_REGEX_PACK_NAME = '合理化世界 · 渲染归一'

type HelihuaCharacterGroup = {
  characterId: string
  loadoutId: string
  cardSource: unknown
  cardFileName: string
  tagline: string
  loadoutName: string
}

const CHARACTER_GROUPS: HelihuaCharacterGroup[] = [
  {
    characterId: BUILTIN_HELIHUA_IDS.characters.group,
    loadoutId: BUILTIN_HELIHUA_IDS.loadouts.group,
    cardSource: mainCardSource,
    cardFileName: '梧桐里7栋.json',
    tagline: '五人同卡：梧桐里7栋的雨季群像，合理化世界里没有人真正拒绝。',
    loadoutName: '合理化世界 · 梧桐里7栋',
  },
  {
    characterId: BUILTIN_HELIHUA_IDS.characters.shenzhaoning,
    loadoutId: BUILTIN_HELIHUA_IDS.loadouts.shenzhaoning,
    cardSource: shenzhaoningCardSource,
    cardFileName: '沈昭宁.json',
    tagline: '御姐位：昭衡律所合伙人，话短、句子完整、不解释，关心都藏在「顺路」里。',
    loadoutName: '合理化世界 · 沈昭宁',
  },
  {
    characterId: BUILTIN_HELIHUA_IDS.characters.sunan,
    loadoutId: BUILTIN_HELIHUA_IDS.loadouts.sunan,
    cardSource: sunanCardSource,
    cardFileName: '苏念.json',
    tagline: '甜妹位：临江大学新闻系大二，直球黏人，情绪全写在脸上。',
    loadoutName: '合理化世界 · 苏念',
  },
  {
    characterId: BUILTIN_HELIHUA_IDS.characters.wenyining,
    loadoutId: BUILTIN_HELIHUA_IDS.loadouts.wenyining,
    cardSource: wenyiningCardSource,
    cardFileName: '温以宁.json',
    tagline: '克制位：图书馆古籍部，有男友，嘴上退、身体不退，越说不行越是没走。',
    loadoutName: '合理化世界 · 温以宁',
  },
  {
    characterId: BUILTIN_HELIHUA_IDS.characters.zhoumu,
    loadoutId: BUILTIN_HELIHUA_IDS.loadouts.zhoumu,
    cardSource: zhoumuCardSource,
    cardFileName: '周牧.json',
    tagline: '男配位：结构工程师，温以宁的男友，客气地记仇，越生气越礼貌。',
    loadoutName: '合理化世界 · 周牧',
  },
]

const PRESET_DESCRIPTION =
  'Hashlib 破甲核 + 世界法则·合理化 + 格式 / 数值 / 性爱 / 文风 / 语言质地 / 在场边界，53 段提示。'
const WORLDBOOK_DESCRIPTION =
  '临江雨季的设定集：合理化法则、临江市与梧桐里7栋、三位女主的人物与身体、男配、关系网、语言质地与在场边界。'

function buildCharacter(group: HelihuaCharacterGroup): Character {
  const payload = buildImportPayload('character', group.cardSource, group.cardFileName)
  return {
    ...characterInputSchema.parse({ ...payload, tagline: group.tagline }),
    id: group.characterId,
    source: 'seed',
    createdAt: BUILTIN_TIMESTAMP,
    updatedAt: BUILTIN_TIMESTAMP,
  }
}

function buildWorldBook(): WorldBook {
  const payload = buildImportPayload('worldbook', worldbookSource, 'helihua-worldbook.json')
  const book = worldBookInputSchema.parse({ ...payload, description: WORLDBOOK_DESCRIPTION })
  return {
    ...book,
    id: BUILTIN_HELIHUA_IDS.worldBook,
    source: 'seed',
    createdAt: BUILTIN_TIMESTAMP,
    entries: book.entries.map((entry, index) => ({
      ...entry,
      id: `${BUILTIN_HELIHUA_IDS.worldBook}-entry-${index + 1}`,
    })),
  }
}

function buildPreset(): Preset {
  const payload = buildImportPayload('preset', presetSource, 'helihua-preset.json')
  const input = presetInputSchema.parse({
    ...payload,
    name: BUILTIN_HELIHUA_PRESET_NAME,
    description: PRESET_DESCRIPTION,
  })
  return {
    ...input,
    generation: { ...input.generation },
    id: BUILTIN_HELIHUA_IDS.preset,
    source: 'seed',
    createdAt: BUILTIN_TIMESTAMP,
  }
}

function buildRegexRules(): RegexRule[] {
  const payload = buildImportPayload('regex', regexSource, 'helihua-regex.json')
  return z
    .array(regexRuleInputSchema)
    .parse(payload.rules)
    .map((rule, index) => ({
      ...rule,
      id: `${BUILTIN_HELIHUA_IDS.regexPack}-${index + 1}`,
      name: `合理化世界 · ${rule.name}`,
      packId: BUILTIN_HELIHUA_IDS.regexPack,
      packName: BUILTIN_HELIHUA_REGEX_PACK_NAME,
    }))
}

function buildLoadout(group: HelihuaCharacterGroup, regexRules: RegexRule[]): Loadout {
  return {
    id: group.loadoutId,
    name: group.loadoutName,
    characterId: group.characterId,
    presetId: BUILTIN_HELIHUA_IDS.preset,
    worldBookIds: [BUILTIN_HELIHUA_IDS.worldBook],
    regexRuleIds: [BUILTIN_CHAT_REGEX_ID, ...regexRules.map((rule) => rule.id)],
    memoryMode: 'compressed',
    createdAt: BUILTIN_TIMESTAMP,
    updatedAt: BUILTIN_TIMESTAMP,
  }
}

export function createBuiltinHelihuaResources(): {
  characters: Character[]
  presets: Preset[]
  worldBooks: WorldBook[]
  regexRules: RegexRule[]
  loadouts: Loadout[]
} {
  const regexRules = buildRegexRules()
  const characters = CHARACTER_GROUPS.map(buildCharacter)
  const loadouts = CHARACTER_GROUPS.map((group) => buildLoadout(group, regexRules))

  return {
    characters,
    presets: [buildPreset()],
    worldBooks: [buildWorldBook()],
    regexRules,
    loadouts,
  }
}

type HelihuaState = Pick<
  TavernState,
  'characters' | 'presets' | 'worldBooks' | 'regexRules' | 'loadouts'
>

function addMissing<T extends { id: string }>(target: T[], items: T[], clone: (item: T) => T) {
  const ids = new Set(target.map((item) => item.id))
  let changed = false
  for (const item of items) {
    if (ids.has(item.id)) continue
    target.push(clone(item))
    ids.add(item.id)
    changed = true
  }
  return changed
}

export function reconcileBuiltinHelihuaResources(
  state: HelihuaState,
  builtin = createBuiltinHelihuaResources(),
) {
  let changed = false
  changed =
    addMissing(state.characters, builtin.characters, (character) => ({
      ...character,
      tags: [...character.tags],
    })) || changed
  changed =
    addMissing(state.worldBooks, builtin.worldBooks, (book) => ({
      ...book,
      entries: book.entries.map((entry) => ({ ...entry, keys: [...entry.keys] })),
    })) || changed
  changed =
    addMissing(state.presets, builtin.presets, (preset) => ({
      ...preset,
      generation: { ...preset.generation },
    })) || changed
  changed = addMissing(state.regexRules, builtin.regexRules, (rule) => ({ ...rule })) || changed

  const characterIds = new Set(state.characters.map((character) => character.id))
  const presetIds = new Set(state.presets.map((preset) => preset.id))
  const loadoutIds = new Set(state.loadouts.map((loadout) => loadout.id))
  for (const loadout of builtin.loadouts) {
    if (loadoutIds.has(loadout.id)) continue
    const missingCharacter = !characterIds.has(loadout.characterId)
    const missingPreset = loadout.presetId !== null && !presetIds.has(loadout.presetId)
    if (missingCharacter || missingPreset) continue
    state.loadouts.push({
      ...loadout,
      worldBookIds: [...loadout.worldBookIds],
      regexRuleIds: [...loadout.regexRuleIds],
    })
    loadoutIds.add(loadout.id)
    changed = true
  }

  return changed
}
