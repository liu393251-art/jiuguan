import { z } from 'zod'

import cardLabPresetSource from '../builtins/creation-lab/card-lab.preset.json'
import keeperCardSource from '../builtins/creation-lab/keeper.card.json'
import presetForgeSource from '../builtins/creation-lab/preset-forge.preset.json'
import smithCardSource from '../builtins/creation-lab/smith.card.json'
import tunerCardSource from '../builtins/creation-lab/tuner.card.json'
import worldbookLabPresetSource from '../builtins/creation-lab/worldbook-lab.preset.json'
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

export const BUILTIN_CREATION_LAB_IDS = {
  characters: {
    keeper: 'builtin-character-zhangjuan',
    smith: 'builtin-character-kajiang',
    tuner: 'builtin-character-tiaolvshi',
  },
  presets: {
    worldbook: 'builtin-preset-worldbook-lab',
    card: 'builtin-preset-card-lab',
    forge: 'builtin-preset-preset-forge',
  },
  worldBooks: {
    keeper: 'builtin-worldbook-zhangjuan',
    smith: 'builtin-worldbook-kajiang',
    tuner: 'builtin-worldbook-tiaolvshi',
  },
  loadouts: {
    keeper: 'builtin-loadout-zhangjuan',
    smith: 'builtin-loadout-kajiang',
    tuner: 'builtin-loadout-tiaolvshi',
  },
  regexPacks: {
    card: 'builtin-regex-pack-card-lab',
    forge: 'builtin-regex-pack-preset-forge',
  },
} as const

const BUILTIN_LOADOUT_IDS = new Set<string>(Object.values(BUILTIN_CREATION_LAB_IDS.loadouts))

export function isBuiltinCreationLabLoadout(loadoutId: string) {
  return BUILTIN_LOADOUT_IDS.has(loadoutId)
}

type CreationLabGroup = {
  characterId: string
  worldBookId: string
  presetId: string
  loadoutId: string
  regexPackId: string
  cardSource: unknown
  cardFileName: string
  characterTagline: string
  presetSource: unknown
  presetFileName: string
  presetName: string
  presetShortName: string
  presetDescription: string
  loadoutName: string
}

const CREATION_LAB_GROUPS: CreationLabGroup[] = [
  {
    characterId: BUILTIN_CREATION_LAB_IDS.characters.keeper,
    worldBookId: BUILTIN_CREATION_LAB_IDS.worldBooks.keeper,
    presetId: BUILTIN_CREATION_LAB_IDS.presets.worldbook,
    loadoutId: BUILTIN_CREATION_LAB_IDS.loadouts.keeper,
    regexPackId: '',
    cardSource: keeperCardSource,
    cardFileName: '掌卷_四楼书库.json',
    characterTagline: '一句话换来一册能用的世界书：出书、扩写、审校。',
    presetSource: worldbookLabPresetSource,
    presetFileName: '世界书创作预设_Hashlib.json',
    presetName: '世界书创作预设 · Hashlib',
    presetShortName: '世界书创作预设',
    presetDescription:
      'Hashlib 的世界书创作预设：38 段提示覆盖出书、扩写与审校，配合掌卷把一句话写成一册可直接绑定的世界书。',
    loadoutName: '掌卷 · 四楼书库',
  },
  {
    characterId: BUILTIN_CREATION_LAB_IDS.characters.smith,
    worldBookId: BUILTIN_CREATION_LAB_IDS.worldBooks.smith,
    presetId: BUILTIN_CREATION_LAB_IDS.presets.card,
    loadoutId: BUILTIN_CREATION_LAB_IDS.loadouts.smith,
    regexPackId: BUILTIN_CREATION_LAB_IDS.regexPacks.card,
    cardSource: smithCardSource,
    cardFileName: '卡匠_角色卡铸造台.json',
    characterTagline: '把一句设定打成能开口说话、能演下去的角色卡。',
    presetSource: cardLabPresetSource,
    presetFileName: '角色卡创作预设_Hashlib.json',
    presetName: '角色卡创作预设 · Hashlib',
    presetShortName: '角色卡创作预设',
    presetDescription:
      'Hashlib 的角色卡创作预设：35 段提示约束开场白、对白与人物弧光，配合卡匠铸造可直接导入的角色卡。',
    loadoutName: '卡匠 · 铸造台',
  },
  {
    characterId: BUILTIN_CREATION_LAB_IDS.characters.tuner,
    worldBookId: BUILTIN_CREATION_LAB_IDS.worldBooks.tuner,
    presetId: BUILTIN_CREATION_LAB_IDS.presets.forge,
    loadoutId: BUILTIN_CREATION_LAB_IDS.loadouts.tuner,
    regexPackId: BUILTIN_CREATION_LAB_IDS.regexPacks.forge,
    cardSource: tunerCardSource,
    cardFileName: '调律师_预设旋钮台.json',
    characterTagline: '把想要的语气拧成一组能落地的采样与提示词。',
    presetSource: presetForgeSource,
    presetFileName: '预设生成器_PresetForge_v1.json',
    presetName: '预设生成器 · PresetForge v1',
    presetShortName: '预设生成器',
    presetDescription:
      'PresetForge v1：45 段提示把想要的语气、节奏与限制翻译成生成参数和提示块，配合调律师现场试听。',
    loadoutName: '调律师 · 旋钮台',
  },
]

function extractAttachedWorldBook(payload: Record<string, unknown>) {
  const raw = payload.attachedWorldBook
  if (!raw) return null
  return worldBookInputSchema.parse(raw)
}

function toCharacterInput(payload: Record<string, unknown>, tagline: string) {
  // characterInputSchema strips helper fields such as attachedWorldBook/source.
  return characterInputSchema.parse({ ...payload, tagline })
}

function buildCharacter(group: CreationLabGroup): Character {
  const payload = buildImportPayload('character', group.cardSource, group.cardFileName)
  return {
    ...toCharacterInput(payload, group.characterTagline),
    id: group.characterId,
    source: 'seed',
    createdAt: BUILTIN_TIMESTAMP,
    updatedAt: BUILTIN_TIMESTAMP,
  }
}

function buildWorldBook(group: CreationLabGroup): WorldBook | null {
  const payload = buildImportPayload('character', group.cardSource, group.cardFileName)
  const book = extractAttachedWorldBook(payload)
  if (!book) return null
  return {
    ...book,
    id: group.worldBookId,
    source: 'seed',
    createdAt: BUILTIN_TIMESTAMP,
    entries: book.entries.map((entry, index) => ({
      ...entry,
      id: `${group.worldBookId}-entry-${index + 1}`,
    })),
  }
}

function buildPreset(group: CreationLabGroup): Preset {
  const payload = buildImportPayload('preset', group.presetSource, group.presetFileName)
  const input = presetInputSchema.parse({
    ...payload,
    name: group.presetName,
    description: group.presetDescription,
  })
  return {
    ...input,
    generation: { ...input.generation },
    id: group.presetId,
    source: 'seed',
    createdAt: BUILTIN_TIMESTAMP,
  }
}

function buildRegexRules(group: CreationLabGroup): RegexRule[] {
  const source = group.presetSource
  const scripts =
    typeof source === 'object' && source !== null && 'regex_scripts' in source
      ? (source as { regex_scripts?: unknown }).regex_scripts
      : null
  if (!Array.isArray(scripts) || scripts.length === 0) return []

  const payload = buildImportPayload('regex', scripts, group.presetFileName)
  const packName = `${group.presetShortName} · 正则`
  return z
    .array(regexRuleInputSchema)
    .parse(payload.rules)
    .map((rule, index) => ({
      ...rule,
      id: `${group.regexPackId}-${index + 1}`,
      name: `${group.presetShortName} · ${rule.name}`,
      packId: group.regexPackId,
      packName,
    }))
}

function buildLoadout(group: CreationLabGroup, regexRules: RegexRule[]): Loadout {
  return {
    id: group.loadoutId,
    name: group.loadoutName,
    characterId: group.characterId,
    presetId: group.presetId,
    worldBookIds: group.worldBookId ? [group.worldBookId] : [],
    regexRuleIds: [BUILTIN_CHAT_REGEX_ID, ...regexRules.map((rule) => rule.id)],
    memoryMode: 'recent',
    createdAt: BUILTIN_TIMESTAMP,
    updatedAt: BUILTIN_TIMESTAMP,
  }
}

export function createBuiltinCreationLabResources(): {
  characters: Character[]
  presets: Preset[]
  worldBooks: WorldBook[]
  regexRules: RegexRule[]
  loadouts: Loadout[]
} {
  const characters: Character[] = []
  const presets: Preset[] = []
  const worldBooks: WorldBook[] = []
  const regexRules: RegexRule[] = []
  const loadouts: Loadout[] = []

  for (const group of CREATION_LAB_GROUPS) {
    characters.push(buildCharacter(group))
    const book = buildWorldBook(group)
    if (book) worldBooks.push(book)
    presets.push(buildPreset(group))
    const rules = buildRegexRules(group)
    regexRules.push(...rules)
    loadouts.push(buildLoadout(group, rules))
  }

  return { characters, presets, worldBooks, regexRules, loadouts }
}

type CreationLabState = Pick<
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

export function reconcileBuiltinCreationLabResources(
  state: CreationLabState,
  builtin = createBuiltinCreationLabResources(),
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
