import { readFileSync } from 'node:fs'
import path from 'node:path'

import { zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import { applyRegexRules } from './regex-rules'
import { parsePackFile } from './pack-import'
import { extractStateCard } from './state-card'

const packDir = path.resolve(process.cwd(), 'packs', 'wujie-station')
const packFiles = [
  'manifest.json',
  'character.json',
  'preset.json',
  'worldbook-core.json',
  'worldbook-cast.json',
  'worldbook-mist-harbor.json',
  'regex.json',
]

function bundledPackFile() {
  const files = Object.fromEntries(
    packFiles.map((fileName) => [
      fileName,
      new Uint8Array(readFileSync(path.join(packDir, fileName))),
    ]),
  )
  return new File([zipSync(files)], 'wujie-station-open-pack.zip', {
    type: 'application/zip',
  })
}

describe('bundled open narrative pack', () => {
  it('parses as one complete adult cast pack with a bound starter theme', async () => {
    const pack = await parsePackFile(bundledPackFile())

    expect(pack.errors).toEqual([])
    expect(pack.warnings).toEqual([])
    expect(pack.name).toBe('无界驿站 · 开放叙事配套')
    expect(pack.character?.name).toBe('闻灯')
    expect(pack.preset?.name).toBe('无界叙事引擎')
    expect(pack.worldbooks.map((book) => book.name)).toEqual(
      expect.arrayContaining(['无界驿站 · 总纲', '无界驿站 · 人物簿', '当前篇 · 雾港来信']),
    )
    expect(pack.regexRules).toHaveLength(9)
    expect(pack.character?.payload.firstMessage).toContain('[[状态]]')
    expect(pack.character?.payload.firstMessage).toContain('闻灯｜女｜34')
    expect(pack.preset?.payload.promptSummary).toContain('所有正式参与角色均须年满 18 岁')

    const normalized = applyRegexRules(
      `【状态】
闻灯｜女｜34｜无界驿站掌柜
好感:42（+3）
欲望 18
堕落度：6

周既明｜男｜38｜前港务调查员
仇恨度：73（-2）
【/状态】`,
      pack.regexRules.map((rule) => ({
        ...rule,
        id: rule.name,
        packId: null,
        packName: null,
      })),
      'output',
    )
    const card = extractStateCard(normalized)

    expect(normalized).toContain('[[状态]]')
    expect(normalized).toContain('[[/状态]]')
    expect(card.content).toBe('')
    expect(card.card?.participants[0]?.stats[0]).toMatchObject({
      key: 'favor',
      label: '好感度',
      value: 42,
      delta: 3,
    })
    expect(card.card?.participants[1]?.stats[0]).toMatchObject({
      key: 'hatred',
      label: '仇恨值',
      value: 73,
      delta: -2,
    })
  })
})
