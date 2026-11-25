import { describe, expect, it } from 'vitest'

import { buildImportPayload, parseImportFile } from './import-parser'

function jsonFile(name: string, value: unknown) {
  return new File([JSON.stringify(value)], name, { type: 'application/json' })
}

function makePng(cards: { keyword: 'chara' | 'ccv3'; value: unknown }[]) {
  const encoder = new TextEncoder()
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
  const chunks: Uint8Array[] = [signature]

  for (const card of cards) {
    const base64 = btoa(unescape(encodeURIComponent(JSON.stringify(card.value))))
    const data = encoder.encode(`${card.keyword}\0${base64}`)
    const chunk = new Uint8Array(12 + data.length)
    const view = new DataView(chunk.buffer)
    view.setUint32(0, data.length)
    chunk.set(encoder.encode('tEXt'), 4)
    chunk.set(data, 8)
    chunks.push(chunk)
  }

  const iend = new Uint8Array(12)
  const iendView = new DataView(iend.buffer)
  iendView.setUint32(0, 0)
  iend.set(encoder.encode('IEND'), 4)
  chunks.push(iend)

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return new File([result], 'character.png', { type: 'image/png' })
}

describe('import parser', () => {
  it('detects a v3 JSON character card and normalizes fields', async () => {
    const file = jsonFile('shenyan.json', {
      spec: 'chara_card_v3',
      data: {
        name: '沈砚',
        description: '旧书店店主。',
        personality: '克制',
        first_mes: '雨很大。\n[{"op":"replace","path":"/状态","value":1}]',
        mes_example: '示例仍在。\n```json\n[{"op":"replace","path":"/状态","value":2}]\n```',
        tags: ['治愈'],
      },
    })
    const parsed = await parseImportFile(file)
    expect(parsed.autoKind).toBe('character')
    expect(parsed.name).toBe('沈砚')
    const payload = buildImportPayload('character', parsed.raw, file.name)
    expect(payload.firstMessage).toBe('雨很大。')
    expect(payload.exampleDialogue).toBe('示例仍在。')
  })

  it('detects a SillyTavern preset and never creates a character', async () => {
    const file = jsonFile('preset.json', {
      name: '夜间叙事',
      temperature: 0.9,
      top_p: 0.9,
      prompts: [{ identifier: 'main' }],
      prompt_order: [{ order: [] }],
    })
    const parsed = await parseImportFile(file)
    expect(parsed.autoKind).toBe('preset')
    const payload = buildImportPayload('preset', parsed.raw, file.name)
    expect(payload.generation).toMatchObject({ temperature: 0.9 })
  })

  it('keeps enabled preset prompts in prompt order', () => {
    const payload = buildImportPayload(
      'preset',
      {
        name: '气泡预设',
        temperature: 0.7,
        prompts: [
          { identifier: 'main', name: '主规则', content: '先写主规则。' },
          { identifier: 'style', name: '文风', content: '不要写状态栏。' },
          { identifier: 'disabled', name: '停用', content: '这条不应出现。' },
        ],
        prompt_order: {
          order: [
            { identifier: 'style', enabled: true },
            { identifier: 'main', enabled: true },
            { identifier: 'disabled', enabled: false },
          ],
        },
      },
      'preset.json',
    ) as { promptSummary: string }

    expect(payload.promptSummary.indexOf('不要写状态栏')).toBeLessThan(
      payload.promptSummary.indexOf('先写主规则'),
    )
    expect(payload.promptSummary).not.toContain('这条不应出现')
  })

  it('detects world books and regex exports', async () => {
    const worldFile = jsonFile('world.json', {
      name: '雾港',
      entries: { 0: { keys: ['钟楼'], content: '钟楼慢三分钟。', constant: true } },
    })
    const regexFile = jsonFile('regex.json', [
      { scriptName: '去提示', findRegex: '（[^）]*）', replaceString: '' },
    ])
    expect((await parseImportFile(worldFile)).autoKind).toBe('worldbook')
    expect((await parseImportFile(regexFile)).autoKind).toBe('regex')
  })

  it('strips slash delimiters, merges flags, and rejects invalid flags', () => {
    const slash = buildImportPayload(
      'regex',
      [{ scriptName: '收束', findRegex: '/我害怕(?:人群|夜晚)/gi', replaceString: '我有些不安' }],
      'rules.json',
    ) as { rules: { pattern: string; flags: string }[] }
    expect(slash.rules[0]).toMatchObject({
      pattern: '我害怕(?:人群|夜晚)',
      flags: 'gi',
    })

    const bare = buildImportPayload(
      'regex',
      [{ name: '空白', findRegex: '\\s+$', flags: 'g' }],
      'rules.json',
    ) as { rules: { pattern: string; flags: string }[] }
    expect(bare.rules[0]).toMatchObject({ pattern: '\\s+$', flags: 'g' })

    const unnamed = buildImportPayload(
      'regex',
      [{ findRegex: '\\.{3,}', replaceString: '…' }],
      'regex.json',
    ) as { name: string }
    expect(unnamed.name).toBe('regex')

    expect(() =>
      buildImportPayload('regex', [{ name: '坏规则', findRegex: '/foo/z' }], 'bad.json'),
    ).toThrow(/正则表达式/)
  })

  it('leaves unknown JSON untouched', async () => {
    const file = jsonFile('notes.json', { hello: 'world' })
    const parsed = await parseImportFile(file)
    expect(parsed.autoKind).toBe('unknown')
    expect(parsed.reason).toContain('未找到')
  })

  it('reads PNG tEXt card data and prefers ccv3', async () => {
    const file = makePng([
      { keyword: 'chara', value: { name: '旧版角色', first_mes: '旧' } },
      {
        keyword: 'ccv3',
        value: { spec: 'chara_card_v3', data: { name: '新版角色', first_mes: '新' } },
      },
    ])
    const parsed = await parseImportFile(file)
    expect(parsed.autoKind).toBe('character')
    expect(parsed.name).toBe('新版角色')
  })
})
