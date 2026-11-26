import { describe, expect, it } from 'vitest'

import { createSeedState } from '@/mocks/fixtures/tavern'

import { tavernStateSchema } from '../types'
import {
  BUILTIN_HELIHUA_IDS,
  BUILTIN_HELIHUA_PRESET_NAME,
  BUILTIN_HELIHUA_REGEX_PACK_NAME,
  createBuiltinHelihuaResources,
  isBuiltinHelihuaLoadout,
  reconcileBuiltinHelihuaResources,
} from './builtin-helihua'
import { BUILTIN_CHAT_REGEX_ID } from './builtin-regex'
import { parseChatTranscript } from './chat-transcript'
import { applyRegexRules } from './regex-rules'
import { extractStateCard } from './state-card'

describe('builtin 合理化世界', () => {
  it('bundles five characters, one preset, one world book and one regex pack', () => {
    const { characters, presets, worldBooks, regexRules, loadouts } =
      createBuiltinHelihuaResources()

    expect(characters.map((character) => character.name)).toEqual([
      '梧桐里7栋',
      '沈昭宁',
      '苏念',
      '温以宁',
      '周牧',
    ])
    expect(characters.every((character) => character.source === 'seed')).toBe(true)
    expect(characters[0]?.firstMessage).toContain('【苏念】')
    expect(characters[0]?.firstMessage).toContain('[[状态]]')
    expect(characters[0]?.firstMessage).toContain('沈昭宁｜女｜28｜昭衡律所合伙人')

    expect(presets).toHaveLength(1)
    expect(presets[0]?.name).toBe(BUILTIN_HELIHUA_PRESET_NAME)
    expect(presets[0]?.source).toBe('seed')
    expect(presets[0]?.promptSummary.length).toBeGreaterThan(8000)
    expect(presets[0]?.promptSummary).not.toContain('{{setvar')
    expect(presets[0]?.generation.maxTokens).toBeLessThanOrEqual(8192)

    expect(worldBooks).toHaveLength(1)
    expect(worldBooks[0]?.entries).toHaveLength(25)
    expect(worldBooks[0]?.entries.every((entry) => entry.id.length > 0)).toBe(true)

    expect(regexRules).toHaveLength(13)
    expect(regexRules.every((rule) => rule.packId === BUILTIN_HELIHUA_IDS.regexPack)).toBe(true)
    expect(regexRules.every((rule) => rule.packName === BUILTIN_HELIHUA_REGEX_PACK_NAME)).toBe(true)
    expect(regexRules.every((rule) => rule.scope === 'output' && rule.enabled)).toBe(true)

    expect(loadouts).toHaveLength(5)
    expect(loadouts.every((loadout) => loadout.presetId === BUILTIN_HELIHUA_IDS.preset)).toBe(true)
    expect(loadouts.every((loadout) => loadout.worldBookIds.includes(BUILTIN_HELIHUA_IDS.worldBook))).toBe(
      true,
    )
    expect(loadouts.every((loadout) => loadout.regexRuleIds.includes(BUILTIN_CHAT_REGEX_ID))).toBe(
      true,
    )
    expect(loadouts.every((loadout) => loadout.memoryMode === 'compressed')).toBe(true)
    expect(isBuiltinHelihuaLoadout(BUILTIN_HELIHUA_IDS.loadouts.group)).toBe(true)
    expect(isBuiltinHelihuaLoadout('loadout-user-1')).toBe(false)
  })

  it('renders the five person panel from the seeded regex pack', () => {
    const { regexRules } = createBuiltinHelihuaResources()
    const normalized = applyRegexRules(
      [
        '（她把杯子放下，杯底磕在桌沿）',
        '沈昭宁：“你今天来得早。”',
        '{她其实等了很久。}',
        '【窗外的雨小了一点。】',
        '苏念：“老板，我作业写完了。”',
        '<状态>',
        '女 沈昭宁 好感12 欲望20 堕落5',
        '女 苏念 好感18 欲望25 堕落8',
        '女 温以宁 好感10 欲望12 堕落3',
        '男 周牧 仇恨3',
        '男 程越 仇恨0',
        '</状态>',
      ].join('\n'),
      regexRules,
      'output',
    )
    const { content, card } = extractStateCard(normalized)

    expect(content).not.toContain('<状态>')
    expect(content).not.toContain('（她把杯子放下')
    expect(card?.participants.map((item) => item.name)).toEqual([
      '沈昭宁',
      '苏念',
      '温以宁',
      '周牧',
      '程越',
    ])
    expect(card?.participants[0]?.stats[0]).toMatchObject({ key: 'favor', value: 12 })
    expect(card?.participants[3]?.stats[0]).toMatchObject({ key: 'hatred', value: 3 })

    const transcript = parseChatTranscript(content, '你')
    expect(transcript?.entries.map((entry) => entry.speaker)).toEqual(['沈昭宁', '苏念'])
  })

  it('is present in a fresh seed state', () => {
    const state = createSeedState()

    expect(state.characters.filter((item) => item.source === 'seed')).toHaveLength(8)
    expect(state.characters.some((item) => item.id === BUILTIN_HELIHUA_IDS.characters.group)).toBe(
      true,
    )
    expect(state.loadouts.some((item) => item.id === BUILTIN_HELIHUA_IDS.loadouts.group)).toBe(true)
    expect(state.presets.some((item) => item.id === BUILTIN_HELIHUA_IDS.preset)).toBe(true)
    expect(state.worldBooks.some((item) => item.id === BUILTIN_HELIHUA_IDS.worldBook)).toBe(true)
    expect(
      state.regexRules.filter((rule) => rule.packId === BUILTIN_HELIHUA_IDS.regexPack),
    ).toHaveLength(13)
  })

  it('adds the resources to an existing state only once', () => {
    const state = {
      characters: [],
      presets: [],
      worldBooks: [],
      regexRules: [],
      loadouts: [],
    }

    expect(reconcileBuiltinHelihuaResources(state)).toBe(true)
    expect(state.characters).toHaveLength(5)
    expect(state.presets).toHaveLength(1)
    expect(state.worldBooks).toHaveLength(1)
    expect(state.regexRules).toHaveLength(13)
    expect(state.loadouts).toHaveLength(5)
    expect(reconcileBuiltinHelihuaResources(state)).toBe(false)
  })

  it('skips loadouts when the character is missing', () => {
    const builtin = createBuiltinHelihuaResources()
    const state = {
      characters: [],
      presets: [],
      worldBooks: [],
      regexRules: [],
      loadouts: [],
    }

    reconcileBuiltinHelihuaResources(state, { ...builtin, characters: [] })
    expect(state.presets).toHaveLength(1)
    expect(state.loadouts).toHaveLength(0)
  })

  it('keeps the seeded state valid for persistence', () => {
    const state = createSeedState()
    const parsed = tavernStateSchema.safeParse(state)

    expect(parsed.success).toBe(true)
  })
})
