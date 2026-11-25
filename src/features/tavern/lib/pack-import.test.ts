import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import {
  buildPackImportPayload,
  parseAnyImportFile,
  parsePackFile,
  type ParsedTavernPack,
} from './pack-import'

function jsonBytes(value: unknown) {
  return strToU8(JSON.stringify(value))
}

function zipFile(name: string, files: Record<string, Uint8Array>) {
  return new File([zipSync(files)], name, { type: 'application/zip' })
}

const characterCard = {
  spec: 'chara_card_v2',
  spec_version: '2.0',
  data: {
    name: '闻灯',
    description: '无界驿站的掌柜。',
    personality: '克制，观察力强。',
    first_mes: '铜铃响了一声。',
    mes_example: '「住店，还是找人？」',
    tags: ['开放世界', '叙事'],
    character_book: {
      name: '无界驿站核心',
      entries: [
        {
          keys: ['驿站', '铜铃'],
          content: '驿站会停靠在不同的故事世界。',
          constant: true,
          order: 1,
          enabled: true,
        },
      ],
    },
  },
}

const preset = {
  name: '无界叙事引擎',
  settings: {
    temperature: 0.92,
    top_p: 0.95,
    openai_max_tokens: 1100,
    presence_penalty: 0.3,
    frequency_penalty: 0.18,
  },
  prompts: [
    {
      identifier: 'main',
      name: '叙事主规则',
      content: '让世界先于解释出现，不要代替用户行动。',
      enabled: true,
    },
  ],
  prompt_order: [
    {
      character_id: 100001,
      order: [{ identifier: 'main', enabled: true }],
    },
  ],
}

const worldbook = {
  name: '题材包 · 雾港',
  description: '潮汐会带走记忆的海港。',
  entries: [
    {
      keys: ['雾港', '潮汐'],
      content: '雾港的潮汐每天会抹去一段不被写下的记忆。',
      constant: true,
      order: 10,
      enabled: true,
    },
  ],
}

const regex = {
  name: '无界驿站 · 输出规整',
  rules: [
    {
      scriptName: '加粗说话标签',
      findRegex: '/^\\*\\*【([^】]+)】\\*\\*$/gm',
      replaceString: '$1：',
      disabled: false,
    },
  ],
}

const manifest = {
  format: 'xiaobai-tavern-pack',
  version: 1,
  name: '无界驿站 · 雾港',
  description: '一个可以直接开聊的配套包。',
  memoryMode: 'vector',
}

describe('ZIP pack import', () => {
  it('recognizes a complete pack and builds one loadout payload', async () => {
    const file = zipFile('无界驿站-雾港.zip', {
      '无界驿站/角色卡.json': jsonBytes(characterCard),
      '无界驿站/预设.json': jsonBytes(preset),
      '无界驿站/世界书.json': jsonBytes(worldbook),
      '无界驿站/正则.json': jsonBytes(regex),
      '无界驿站/manifest.json': jsonBytes(manifest),
      '无界驿站/README.txt': strToU8('说明文件不参与导入。'),
      '__MACOSX/空文件.json': strToU8('{}'),
    })

    const parsed = await parseAnyImportFile(file)
    expect(parsed.autoKind).toBe('pack')
    expect(parsed.name).toBe('无界驿站 · 雾港')
    expect(parsed.blocked).toBeFalsy()
    expect(parsed.summary).toContain('世界书 2')
    expect(parsed.details?.join('')).toContain('世界书：无界驿站核心、题材包 · 雾港')

    const pack = parsed.raw as ParsedTavernPack
    expect(pack.character?.name).toBe('闻灯')
    expect(pack.preset?.name).toBe('无界叙事引擎')
    expect(pack.worldbooks).toHaveLength(1)
    expect(pack.regexRules).toHaveLength(1)
    expect(pack.memoryMode).toBe('vector')
    expect(pack.warnings).toEqual([])

    const payload = buildPackImportPayload(pack)
    expect(payload.name).toBe('无界驿站 · 雾港')
    expect(payload.memoryMode).toBe('vector')
    expect(payload.character).toMatchObject({ name: '闻灯' })
    expect(payload.character.attachedWorldBook).toMatchObject({ name: '无界驿站核心' })
    expect(payload.preset).toMatchObject({ name: '无界叙事引擎' })
    expect(payload.worldbooks).toHaveLength(1)
    expect(payload.regexRules).toHaveLength(1)
  })

  it('blocks a pack without a character card', async () => {
    const file = zipFile('缺角色.zip', {
      '预设.json': jsonBytes(preset),
      '世界书.json': jsonBytes(worldbook),
    })

    const parsed = await parseAnyImportFile(file)
    expect(parsed.autoKind).toBe('pack')
    expect(parsed.blocked).toBe(true)
    expect(parsed.reason).toContain('没有角色卡')
    expect(() => buildPackImportPayload(parsed.raw as ParsedTavernPack)).toThrow(/角色卡/)
  })

  it('keeps a valid pack importable when the manifest is invalid', async () => {
    const file = zipFile('清单损坏.zip', {
      '角色卡.json': jsonBytes(characterCard),
      '预设.json': jsonBytes(preset),
      '世界书.json': jsonBytes(worldbook),
      '正则.json': jsonBytes(regex),
      'manifest.json': strToU8('{not json'),
    })

    const pack = await parsePackFile(file)
    expect(pack.errors).toEqual([])
    expect(pack.warnings.join('')).toContain('清单')
    expect(pack.name).toBe('清单损坏')
  })

  it('preserves long pack names, descriptions, and character taglines', async () => {
    const name = '配套'.repeat(40)
    const description = '说明文字。\n第二行。'.repeat(30)
    const tagline = '旅行'.repeat(42)
    const file = zipFile('长配套.zip', {
      '角色卡.json': jsonBytes({
        ...characterCard,
        data: { ...characterCard.data, tagline },
      }),
      'manifest.json': jsonBytes({ name, description }),
    })

    const pack = await parsePackFile(file)
    expect(pack.errors).toEqual([])
    expect(pack.name).toBe(name)
    expect(pack.description).toBe(description)
    expect(pack.character?.payload.tagline).toBe(tagline)

    const payload = buildPackImportPayload(pack)
    expect(payload.name).toBe(name)
    expect(payload.description).toBe(description)
    expect(payload.character.tagline).toBe(tagline)
  })

  it('rejects an archive that has no readable card data', async () => {
    const file = zipFile('空包.zip', {
      'notes.txt': strToU8('没有可导入的内容。'),
    })

    const parsed = await parseAnyImportFile(file)
    expect(parsed.autoKind).toBe('unknown')
    expect(parsed.reason).toContain('没有可识别的')
  })
})
