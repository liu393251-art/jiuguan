import { mkdirSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'

import { expect, test, type Page } from '@playwright/test'
import { strToU8, zipSync } from 'fflate'

const baselineDir = path.resolve(process.cwd(), 'docs', 'visual-baseline')
const screenshotDir =
  process.env.UPDATE_VISUAL_BASELINE === '1'
    ? baselineDir
    : path.resolve(process.cwd(), 'test-results', 'visual-baseline')
const streamScreenshotDir = path.resolve(process.cwd(), 'test-results', 'visual-check')
mkdirSync(baselineDir, { recursive: true })
mkdirSync(screenshotDir, { recursive: true })
mkdirSync(streamScreenshotDir, { recursive: true })

const testCard = {
  spec: 'chara_card_v3',
  data: {
    name: '测试旅人',
    tagline: '雨夜车站的临时旅伴。',
    description: '测试旅人在雨夜的车站等一班晚点的车。',
    first_mes: '你也在等这班车吗？',
    tags: ['测试', '雨夜'],
    character_book: {
      name: '测试车站',
      description: '测试用世界书。',
      entries: [
        {
          keys: ['站台'],
          content: '站台的钟慢了三分钟。',
        },
      ],
    },
  },
}

const emptyCard = {
  spec: 'chara_card_v3',
  data: {
    name: '空白旅人',
    tags: ['测试'],
    character_book: {
      name: '测试世界',
      entries: [{ keys: ['站台'], content: '站台的钟慢三分钟。' }],
    },
  },
}

const regexFile = [
  {
    scriptName: '清理省略号',
    findRegex: '/\\.{3,}/g',
    replaceString: '…',
  },
]

type TestCharacter = { id: string; name: string }
type TestSession = { id: string }

type CompletionRequest = {
  model?: string
  messages?: { role: string; content: string }[]
  stop?: string[]
}

type ImageRequest = {
  model?: string
  prompt?: string
  size?: string
  quality?: string
}

const generatedStoryImagePrompt =
  'cinematic rainy train station, warm station lamps, reflective wet platform, detailed background'

const testImagePng =
  'iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAJFSURBVHhe7dG7bSwxFARRxaN4ZCoQhaXIlMJ7oLGAUI5wP2STnDaOs8YO+9bb+8fXP9N54w+2lgOIOYCYA4g5gJgDiDmAmAOIOYCYA4g5gJgDiDmAmAOIOYCYA4gdEeDn+zON/7WbbQPwkB34jR1sFYAHm4nfVtkiAI+zEt+ymjwAD6LAN60kC8Aj7IBvXEESgMN3wrfOtjwAB++Ib55pWQCOPAE3zLAkAIedhFu6OcAfuKXb9AAcdCJu6jQ1AIecjNu6TAvAATfgxg4OEMSdVVMC8NE34daq9gB88I24ucIBEri5ojUAH3ozbs9ygCRuz3KAJG7PagvABz4Bb5DhAAW8QYYDFPAGGS0B+LAn4S2iHKCIt4hygCLeIsoBiniLKAco4i2iHKCIt4hygCLeIqocgA96Gt4jqhxg4KOehLeIcoAi3iLKAYp4iygHKOItohygiLeIcoAi3iLKAYp4i6iWAAMf9gS8QYYDFPAGGQ5QwBtktAUY+MCbcXuWAyRxe5YDJHF7VmuAgQ+9ETdXOEACN1e0Bxj44Jtwa9WUAAMffgvurHKAAG7sMC3AwAEn47YuUwMMHHIibuo0PcDAQSfhlm4O8Adu6bYkwMBhJ+CGGZYFeOHIHfHNMy0PMHDwTvjW2SQBBg7fAd+4gizAwAMo8W2rSAO88Bgr8S2rbRHghceZid9W2SrAbzxYB35jB9sG+I2HjOB/7eaIADdzADEHEHMAMQcQcwAxBxBzADEHEHMAMQcQcwAxBxBzADEHEHMAMQcQ+1cLzGG6ihlmZQAAAABJRU5ErkJggg=='

async function startOpenAiApi(options: { truncateFirstReply?: boolean } = {}) {
  let completionPayload: CompletionRequest | null = null
  const completionPayloads: CompletionRequest[] = []
  const imagePayloads: ImageRequest[] = []
  let completionCount = 0
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
  }

  const server = createServer((request, response) => {
    if (request.method === 'OPTIONS') {
      response.writeHead(204, corsHeaders)
      response.end()
      return
    }

    if (request.method === 'GET' && request.url === '/v1/models') {
      response.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ data: [{ id: 'real-model' }] }))
      return
    }

    if (request.method === 'POST' && request.url === '/v1/images/generations') {
      let raw = ''
      request.setEncoding('utf8')
      request.on('data', (chunk: string) => {
        raw += chunk
      })
      request.on('end', () => {
        imagePayloads.push(JSON.parse(raw) as ImageRequest)
        response.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' })
        response.end(
          JSON.stringify({
            data: [
              {
                b64_json: testImagePng,
                revised_prompt: '雨夜车站与暖色站灯',
              },
            ],
          }),
        )
      })
      return
    }

    if (request.method === 'POST' && request.url === '/v1/chat/completions') {
      let raw = ''
      request.setEncoding('utf8')
      request.on('data', (chunk: string) => {
        raw += chunk
      })
      request.on('end', () => {
        completionPayload = JSON.parse(raw) as CompletionRequest
        completionPayloads.push(completionPayload)
        completionCount += 1
        response.writeHead(200, {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
        })

        if (
          completionPayload.messages?.[0]?.content.includes('expert image-generation prompt writer')
        ) {
          response.write(
            `data: ${JSON.stringify({
              choices: [{ delta: { content: generatedStoryImagePrompt } }],
            })}\n\n`,
          )
          response.end('data: [DONE]\n\n')
          return
        }

        if (options.truncateFirstReply && completionCount === 1) {
          response.write(
            `data: ${JSON.stringify({
              choices: [
                {
                  delta: {
                    content: '她抬头看了看站台的钟，雨水顺着玻璃往下淌。\n\n【',
                  },
                },
              ],
            })}\n\n`,
          )
          response.write(
            `data: ${JSON.stringify({
              choices: [{ delta: {}, finish_reason: 'length' }],
            })}\n\n`,
          )
          response.end('data: [DONE]\n\n')
          return
        }

        if (options.truncateFirstReply) {
          response.write(
            `data: ${JSON.stringify({
              choices: [
                {
                  delta: {
                    content:
                      '同学A】\n「那就再等一会儿吧。」\n\n她轻轻点了点头，把伞往你那边挪了挪。',
                  },
                },
              ],
            })}\n\n`,
          )
          response.write(
            `data: ${JSON.stringify({
              choices: [{ delta: {}, finish_reason: 'stop' }],
            })}\n\n`,
          )
          response.end('data: [DONE]\n\n')
          return
        }

        response.write(
          `data: ${JSON.stringify({ choices: [{ delta: { content: '【测试旅人】\n「今晚' } }] })}\n\n`,
        )
        setTimeout(() => {
          response.write(
            `data: ${JSON.stringify({
              choices: [
                {
                  delta: {
                    content:
                      '也会来。」\n\n她其实也有些期待，目光落在窗外的雨里。\n\n【同学A】\n「那我也再等一会儿。」',
                  },
                },
              ],
            })}\n\n`,
          )
          response.end('data: [DONE]\n\n')
        }, 600)
      })
      return
    }

    response.writeHead(404, { ...corsHeaders, 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ message: 'Not found' }))
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const port = (server.address() as AddressInfo).port

  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    getCompletionPayload: () => completionPayloads.at(-1) ?? completionPayload,
    getCompletionPayloads: () => completionPayloads,
    getImagePayloads: () => imagePayloads,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      }),
  }
}

async function importFile(page: Page, name: string, value: unknown) {
  await page.goto('/import/files')
  await expect(page.getByRole('heading', { name: '导入文件' })).toBeVisible()
  await page.locator('input[type="file"]').setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(value)),
  })
  await expect(page.getByText(name)).toBeVisible()
  await page.getByRole('button', { name: /开始导入/ }).click()
  await expect(page.getByText('导入流程结束')).toBeVisible({ timeout: 10_000 })
}

async function importTestCard(page: Page) {
  await importFile(page, 'test-card.json', testCard)
}

async function configureTestApi(page: Page, baseUrl: string) {
  await page.goto('/settings')
  await page.getByRole('button', { name: '新增连接' }).click()
  const apiDialog = page.getByRole('dialog')
  await apiDialog.getByLabel('连接名称').fill('真实链路')
  await apiDialog.getByLabel('Base URL').fill(baseUrl)
  await apiDialog.getByLabel('API Key').fill('sk-e2e-test')
  await apiDialog.getByRole('button', { name: '获取模型' }).click()
  await apiDialog.getByLabel('选择模型').selectOption('real-model')
  await apiDialog.getByRole('button', { name: '保存连接' }).click()
  await expect(page.getByText('真实链路', { exact: true })).toBeVisible()

  await page.getByLabel('你的称呼').fill('林澈')
  await page.getByLabel('你的人设').fill('和角色同班的高二学生。')
  await page.getByRole('button', { name: '保存身份' }).click()
  await expect(page.getByText('身份与记忆设置已保存')).toBeVisible()
}

async function configureTestImageApi(page: Page, baseUrl: string) {
  await page.goto('/settings?section=images')
  await page.getByLabel('Base URL').fill(baseUrl)
  await page.getByLabel('模型').fill('image-model')
  await page.getByLabel('API Key').fill('sk-image-e2e')
  await page.getByLabel('默认尺寸').selectOption('1024x1024')
  await page.getByLabel('默认质量').selectOption('high')
  await page.getByRole('button', { name: '保存生图 API' }).click()
  await expect(page.getByText('生图 API 已保存')).toBeVisible()
  await expect(page.getByText('已配置', { exact: true })).toBeVisible()
}

async function firstCharacter(page: Page): Promise<TestCharacter> {
  const response = await page.evaluate(async () => (await fetch('/api/characters')).json())
  return (response as { items: TestCharacter[] }).items[0]
}

async function createChat(page: Page, characterId: string): Promise<TestSession> {
  return (await page.evaluate(async (id) => {
    const response = await fetch('/api/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ characterId: id }),
    })
    if (!response.ok) throw new Error(await response.text())
    return response.json()
  }, characterId)) as TestSession
}

async function createSeededChat(
  page: Page,
  characterId: string,
  title: string,
  count: number,
): Promise<TestSession> {
  const messages = Array.from({ length: count }, (_, index) => {
    const turn = Math.floor(index / 2) + 1
    return index % 2 === 0
      ? { role: 'user', content: `第 ${turn} 次：站台的钟又慢了三分钟。` }
      : { role: 'assistant', content: `第 ${turn} 次：那就再等三分钟。` }
  })
  return (await page.evaluate(
    async (payload) => {
      const response = await fetch('/api/test/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error(await response.text())
      return response.json()
    },
    { characterId, title, messages },
  )) as TestSession
}

async function readVectorStore(page: Page) {
  return page.evaluate(async () => {
    return new Promise<{ count: number; typed: boolean; scopes: string[] }>((resolve, reject) => {
      const request = indexedDB.open('xiaobai.tavern.vectors')
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('向量库被占用。'))
      request.onupgradeneeded = () => {
        const database = request.result
        const transaction = request.transaction
        if (!transaction) return
        const store = database.createObjectStore('memories', { keyPath: 'key' })
        store.createIndex('scopeId', 'scopeId')
        store.createIndex('sessionId', 'sessionId')
        store.createIndex('sourceMessageId', 'sourceMessageId')
      }
      request.onsuccess = () => {
        const database = request.result
        const transaction = database.transaction('memories', 'readonly')
        const items: { embedding: unknown; scopeId: string }[] = []
        transaction.oncomplete = () => {
          database.close()
          resolve({
            count: items.length,
            typed: items.every((item) => item.embedding instanceof Float32Array),
            scopes: [...new Set(items.map((item) => item.scopeId))],
          })
        }
        transaction.onerror = () => {
          database.close()
          reject(transaction.error)
        }
        const records = transaction.objectStore('memories').getAll()
        records.onerror = () => {
          database.close()
          reject(records.error)
        }
        records.onsuccess = () => {
          items.push(...(records.result as { embedding: unknown; scopeId: string }[]))
        }
      }
    })
  })
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => window.localStorage.clear())
  await page.reload()
  await expect(page.getByRole('heading', { name: '对话', exact: true })).toBeVisible()
  await page.evaluate(async () => {
    await fetch('/api/vector-memories', { method: 'DELETE' })
  })
})

test('starts with built-in combos and imports only real card fields', async ({ page }) => {
  test.setTimeout(45_000)
  await expect(page.getByText('还没有对话')).toBeVisible()
  await page.getByRole('button', { name: '新建聊天' }).last().click()
  await expect(page.getByRole('dialog').getByRole('heading', { name: '选择配套' })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.goto('/characters')
  await expect(page.getByText('角色库还是空的')).toBeVisible()
  await page.goto('/import')
  await expect(page.getByRole('heading', { name: "li'sug · ATRI Gemini" })).toBeVisible()
  await page.goto('/import?tab=regex')
  await expect(page.getByRole('heading', { name: '微信式对话气泡' })).toBeVisible()
  await page.goto('/settings')
  await expect(page.getByText('还没有保存的 API 连接')).toBeVisible()
  await page.getByRole('button', { name: '新增连接' }).click()
  await expect(page.locator('#api-profile-key')).toHaveValue('')

  await page.goto('/import/files')
  await expect(page.getByRole('heading', { name: '导入文件' })).toBeVisible()
  await page.locator('input[type="file"]').setInputFiles([
    {
      name: 'empty-card.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(emptyCard)),
    },
    {
      name: 'regex.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(regexFile)),
    },
  ])
  await expect(page.getByText('empty-card.json')).toBeVisible()
  await expect(page.getByText('regex.json')).toBeVisible()
  await page.getByRole('button', { name: /开始导入/ }).click()
  await expect(page.getByText('导入流程结束')).toBeVisible({ timeout: 10_000 })
  const rules = await page.evaluate(async () => (await fetch('/api/regex-rules')).json())
  const ruleNames = (rules as { items: { name: string }[] }).items.map((rule) => rule.name)
  expect(ruleNames).toHaveLength(10)
  expect(ruleNames).toContain('微信式对话气泡')

  await page.goto('/characters')
  await expect(page.getByText('空白旅人')).toBeVisible()
  await expect(page.getByText('未提供').first()).toBeVisible()
  await page.getByRole('link', { name: /空白旅人/ }).click()
  await expect(page.getByRole('heading', { name: '空白旅人' })).toBeVisible()
  await expect(page.getByText('未提供').first()).toBeVisible()
  await expect(page.getByText('从角色卡导入')).toHaveCount(0)
  await expect(page.getByText('这个角色还没有补充背景设定')).toHaveCount(0)

  await page.goto('/import?tab=worldbooks')
  await expect(page.getByText('测试世界')).toBeVisible()
  await page.goto('/import?tab=regex')
  await expect(page.getByText('清理省略号')).toBeVisible()

  await page.goto('/settings')
  await page.getByRole('button', { name: '清空本地数据' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('清空本地数据？')).toBeVisible()
  await dialog.getByRole('button', { name: '确认清空' }).click()
  await expect(page.getByText('本地数据已清空')).toBeVisible()
  await page.goto('/')
  await expect(page.getByText('还没有对话')).toBeVisible()
  await page.goto('/characters')
  await expect(page.getByText('角色库还是空的')).toBeVisible()
})

test('renders only story text from imported state patches on desktop and mobile', async ({
  page,
}) => {
  await importTestCard(page)
  const character = await firstCharacter(page)
  const session = (await page.evaluate(
    async ({ characterId }) => {
      const response = await fetch('/api/test/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId,
          title: '状态补丁验证',
          messages: [
            {
              role: 'assistant',
              content:
                '第一段正文仍在。\n[{"op":"replace","path":"/世界/当前时间","value":"深夜"}]',
            },
            {
              role: 'user',
              content: '[剧情] 普通括号保留。\n```ts\nconst marker = 1\n```',
            },
            {
              role: 'assistant',
              content:
                '第二段正文仍在。\n```json\n[{"op":"replace","path":"/世界/天气","value":"雨"}]\n```',
            },
            {
              role: 'assistant',
              content:
                '第三段正文仍在。\n[\n{ "op": "replace", "path": "/世界/地点", "value": "KTV 包间" },\n{ "op"',
            },
          ],
        }),
      })
      if (!response.ok) throw new Error(await response.text())
      return response.json()
    },
    { characterId: character.id },
  )) as TestSession

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport)
    await page.goto(`/chat/${session.id}`)
    await expect(page.getByText('第一段正文仍在。')).toBeVisible()
    await expect(page.getByText(/普通括号保留/)).toBeVisible()
    await expect(page.getByText('第二段正文仍在。')).toBeVisible()
    await expect(page.getByText('第三段正文仍在。')).toBeVisible()
    await expect(page.getByText('const marker = 1')).toBeVisible()

    const chatText = await page.locator('[data-testid="message-scroll"]').innerText()
    expect(chatText).not.toContain('"op"')
    expect(chatText).not.toContain('/世界/当前时间')
    expect(chatText).not.toContain('/世界/天气')
    expect(chatText).not.toContain('/世界/地点')
    expect(chatText).not.toContain('安全文本渲染')
    expect(chatText).not.toContain('每批最多 40 条')
  }

  await page.goto(`/chat/${session.id}/settings`)
  await expect(page.getByText(/安全文本渲染 · 最近 40 条分批加载/)).toBeVisible()
})

test('renders expandable character state cards without leaking markers into messages', async ({
  page,
}) => {
  await importTestCard(page)
  const character = await firstCharacter(page)
  const session = (await page.evaluate(
    async ({ characterId }) => {
      const response = await fetch('/api/test/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId,
          title: '状态卡验证',
          messages: [
            {
              role: 'assistant',
              content:
                '雨水顺着屋檐连成一条线。\n\n【测试旅人】\n「先把门关上。」\n\n她把伞靠在墙边，没有立刻往前走。\n\n[[状态]]\n测试旅人｜女｜27｜临时旅伴\n好感度：42（+3）\n欲望值：18\n堕落度：6\n备注：她开始愿意把后背留给身边的人。\n\n周既明｜男｜38｜调查员\n仇恨值：73（-2）\n信任值：21\n戒备值：88\n[[/状态]]',
            },
            {
              role: 'assistant',
              content:
                '雨停之后，走廊尽头的灯还亮着。\n\n[[状态]]\n测试旅人｜女｜27｜临时旅伴\n好感度：45（+3）\n欲望值：20（+2）\n堕落度：6\n[[/状态]]',
            },
          ],
        }),
      })
      if (!response.ok) throw new Error(await response.text())
      return response.json()
    },
    { characterId: character.id },
  )) as TestSession

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport)
    await page.goto(`/chat/${session.id}`)

    const cards = page.getByTestId('state-card')
    await expect(cards).toHaveCount(2)
    await expect(cards.first()).toBeVisible()
    await expect(cards.first()).toHaveAttribute('data-state', 'collapsed')
    await expect(cards.first().getByTestId('state-participant-周既明')).toBeHidden()

    const chatText = await page.getByTestId('message-scroll').innerText()
    expect(chatText).not.toContain('[[状态]]')
    expect(chatText).not.toContain('[[/状态]]')
    expect(chatText).not.toContain('好感度：42')

    await cards.first().getByTestId('state-card-toggle').click()
    await expect(cards.first()).toHaveAttribute('data-state', 'expanded')
    await expect(cards.first().getByTestId('state-participant-周既明')).toBeVisible()
    await expect(cards.first().getByRole('progressbar', { name: '好感度' })).toHaveAttribute(
      'aria-valuenow',
      '42',
    )
    await expect(cards.first().getByText('+3')).toBeVisible()
    await expect(cards.first().getByText('周既明', { exact: true }).first()).toBeVisible()

    await cards.first().getByTestId('state-card-toggle').click()
    await expect(cards.first()).toHaveAttribute('data-state', 'collapsed')

    const overflow = await page.evaluate(
      () =>
        Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) -
        window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
  }
})

test('sends the selected real API request and keeps the streamed reply after reload', async ({
  page,
}) => {
  test.setTimeout(60_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  const api = await startOpenAiApi()

  try {
    await configureTestApi(page, api.baseUrl)

    await importTestCard(page)
    await page.goto('/characters')
    await page.getByRole('link', { name: /测试旅人/ }).click()
    await page.getByRole('button', { name: '开始对话' }).click()
    await expect(page).toHaveURL(/\/chat\//)
    await expect(page.getByText('你也在等这班车吗？').first()).toBeVisible()
    expect(api.getCompletionPayloads()).toHaveLength(0)

    await page.getByLabel('消息内容').fill('今晚的车还会来吗？')
    await page.getByRole('button', { name: '发送消息' }).click()
    await expect(page.getByLabel('消息内容')).toHaveValue('')
    await expect(page.getByText('今晚的车还会来吗？').first()).toBeVisible()
    await expect(page.getByRole('button', { name: '停止生成' })).toBeVisible()
    await expect(page.getByTestId('chat-transcript')).toBeVisible()
    await expect
      .poll(() =>
        page
          .getByTestId('message-scroll')
          .evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight),
      )
      .toBeLessThan(120)
    await page.screenshot({ path: path.join(streamScreenshotDir, 'chat-streaming-1440.png') })
    await expect(page.getByText(/今晚也会来/)).toBeVisible({ timeout: 20_000 })
    await expect(
      page.getByTestId('chat-transcript').last().locator('[data-speaker="同学A"]'),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: '停止生成' })).toHaveCount(0, {
      timeout: 20_000,
    })

    const completionPayload = api.getCompletionPayload()
    expect(completionPayload?.model).toBe('real-model')
    expect(completionPayload?.messages?.[0]?.role).toBe('system')
    expect(completionPayload?.messages?.[0]?.content).toContain('测试旅人')
    expect(completionPayload?.messages?.[0]?.content).toContain('林澈')
    expect(completionPayload?.messages?.[0]?.content).toContain('优先使用这个名字')
    expect(completionPayload?.messages?.at(-1)?.content).toBe('今晚的车还会来吗？')
    expect(completionPayload?.stop).toContain('\n【林澈】')
    expect(api.getCompletionPayloads()).toHaveLength(1)

    await page.reload()
    await expect(page.getByText('今晚的车还会来吗？').first()).toBeVisible()
    await expect(page.getByText(/今晚也会来/)).toBeVisible()
    await expect(page.getByTestId('chat-transcript').last()).toBeVisible()

    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByLabel('消息内容').fill('手机端也记得我的名字吗？')
    await page.getByRole('button', { name: '发送消息' }).click()
    await expect(page.getByText('手机端也记得我的名字吗？').first()).toBeVisible()
    await expect(page.getByRole('button', { name: '停止生成' })).toBeVisible()
    await expect(page.getByRole('button', { name: '停止生成' })).toHaveCount(0, {
      timeout: 20_000,
    })
    const mobileCompletionPayload = api.getCompletionPayload()
    expect(mobileCompletionPayload?.messages?.[0]?.content).toContain('林澈')
    expect(mobileCompletionPayload?.messages?.at(-1)?.content).toBe('手机端也记得我的名字吗？')
  } finally {
    await api.close()
  }
})

test('generates an image from a separate API and keeps it after reload', async ({ page }) => {
  test.setTimeout(60_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  const api = await startOpenAiApi()

  try {
    await configureTestImageApi(page, api.baseUrl)
    await importTestCard(page)
    const character = await firstCharacter(page)
    const session = await createChat(page, character.id)
    const prompt = '雨夜车站，暖色站灯，电影感构图'

    await page.goto(`/chat/${session.id}`)
    await page.getByRole('button', { name: '生成图片', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: '为「测试旅人」生成图片' })).toBeVisible()
    await dialog.getByLabel('画面提示词').fill(prompt)
    await dialog.getByRole('button', { name: '生成图片' }).click()
    await expect(dialog.getByRole('button', { name: '发送到对话' })).toBeVisible({
      timeout: 20_000,
    })
    await expect(dialog.getByRole('img', { name: prompt })).toBeVisible()
    await dialog.getByRole('button', { name: '发送到对话' }).click()

    await expect(page.getByText('图片已发送到当前对话')).toBeVisible()
    await expect(page.locator('[data-message-style="image"]')).toBeVisible()
    await expect(page.getByRole('img', { name: prompt })).toBeVisible()
    expect(api.getImagePayloads()).toEqual([
      {
        model: 'image-model',
        prompt,
        n: 1,
        size: '1024x1024',
        quality: 'high',
      },
    ])

    await page.reload()
    await expect(page.locator('[data-message-style="image"]')).toBeVisible()
    await expect(page.getByRole('img', { name: prompt })).toBeVisible()
  } finally {
    await api.close()
  }
})

test('uses a selected message verbatim and writes story prompts with the chat API', async ({
  page,
}) => {
  test.setTimeout(70_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  const api = await startOpenAiApi()

  try {
    await configureTestApi(page, api.baseUrl)
    await configureTestImageApi(page, api.baseUrl)
    await importTestCard(page)
    const character = await firstCharacter(page)
    const session = await createChat(page, character.id)

    await page.goto(`/chat/${session.id}`)
    await page.getByLabel('消息内容').fill('今晚的车还会来吗？')
    await page.getByRole('button', { name: '发送消息' }).click()
    await expect(page.getByText('她其实也有些期待')).toBeVisible({ timeout: 20_000 })

    const userMessage = page.locator('article[aria-label="你的消息"]').last()
    await userMessage.getByRole('button', { name: '用这条消息生成图片' }).click()
    let dialog = page.getByRole('dialog')
    await expect(dialog.getByLabel('画面来源')).toHaveValue('message')
    await expect(dialog.getByLabel('画面提示词')).toHaveValue('今晚的车还会来吗？')
    await dialog.getByRole('button', { name: '生成图片' }).click()
    await expect(dialog.getByRole('button', { name: '发送到对话' })).toBeVisible({
      timeout: 20_000,
    })
    expect(api.getImagePayloads()[0]?.prompt).toBe('今晚的车还会来吗？')

    await dialog.getByRole('button', { name: '取消' }).click()
    await page.getByRole('button', { name: '生成图片', exact: true }).click()
    dialog = page.getByRole('dialog')
    await dialog.getByLabel('画面来源').selectOption('story')
    await dialog.getByRole('button', { name: '只生成提示词' }).click()
    await expect(dialog.getByLabel('画面提示词')).toHaveValue(generatedStoryImagePrompt, {
      timeout: 20_000,
    })
    const promptRequest = api.getCompletionPayload()
    expect(promptRequest?.messages?.[0]?.content).toContain('image-generation prompt writer')
    expect(promptRequest?.messages?.[1]?.content).toContain('今晚的车还会来吗')

    await dialog.getByRole('button', { name: '生成图片' }).click()
    await expect(dialog.getByRole('button', { name: '发送到对话' })).toBeVisible({
      timeout: 20_000,
    })
    expect(api.getImagePayloads()[1]?.prompt).toBe(generatedStoryImagePrompt)
  } finally {
    await api.close()
  }
})

test('continues a token-truncated reply into the same message on desktop and mobile', async ({
  page,
}) => {
  test.setTimeout(60_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  const api = await startOpenAiApi({ truncateFirstReply: true })

  try {
    await configureTestApi(page, api.baseUrl)
    await importTestCard(page)
    await page.goto('/characters')
    await page.getByRole('link', { name: /测试旅人/ }).click()
    await page.getByRole('button', { name: '开始对话' }).click()
    await expect(page).toHaveURL(/\/chat\//)

    await page.getByLabel('消息内容').fill('今晚的车还会来吗？')
    await page.getByRole('button', { name: '发送消息' }).click()
    await expect(page.getByText('她抬头看了看站台的钟')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('那就再等一会儿吧')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('button', { name: '停止生成' })).toHaveCount(0, {
      timeout: 20_000,
    })

    const payloads = api.getCompletionPayloads()
    expect(payloads).toHaveLength(2)
    expect(payloads[1]?.messages?.at(-2)?.role).toBe('assistant')
    expect(payloads[1]?.messages?.at(-2)?.content).toContain('【')
    expect(payloads[1]?.messages?.at(-1)?.content).toContain('不要重复')

    const chatText = await page.getByTestId('message-scroll').innerText()
    expect(chatText).toContain('她抬头看了看站台的钟')
    expect(chatText).toContain('那就再等一会儿吧')
    expect(chatText).not.toContain('回复中断')
    expect(chatText).not.toContain('【')
    await expect(page.getByTestId('chat-transcript')).toHaveCount(1)

    await page.reload()
    await expect(page.getByText('那就再等一会儿吧')).toBeVisible()

    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.getByText('那就再等一会儿吧')).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
  } finally {
    await api.close()
  }
})

test('shows a configuration error instead of inventing a reply', async ({ page }) => {
  await importTestCard(page)
  const character = await firstCharacter(page)
  const session = await createChat(page, character.id)

  await page.goto(`/chat/${session.id}`)
  await page.getByLabel('消息内容').fill('没有 API 时会发生什么？')
  await page.getByRole('button', { name: '发送消息' }).click()

  await expect(page.getByText('消息已发出，但没有收到回复')).toBeVisible()
  await expect(
    page.getByText('还没有配置 API 连接，请先到设置里新增一条连接并获取模型。'),
  ).toBeVisible()
  await expect(page.getByText('回复中断，可以点下方重试。')).toBeVisible()
  await expect(page.getByLabel('消息内容')).toHaveValue('')
})

test('keeps mobile error toasts above the composer and dismisses them automatically', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await importTestCard(page)
  const character = await firstCharacter(page)
  const session = await createChat(page, character.id)

  await page.goto(`/chat/${session.id}`)
  await page.getByLabel('消息内容').fill('没有 API 时提示会挡住输入框吗？')
  await page.getByRole('button', { name: '发送消息' }).click()

  const toast = page
    .locator('[data-sonner-toast]')
    .filter({ hasText: '消息已发出，但没有收到回复' })
    .first()
  await expect(toast).toBeVisible()
  await page.waitForTimeout(500)
  const [toastBox, headerBox, composerBox] = await Promise.all([
    toast.boundingBox(),
    page.getByRole('banner').boundingBox(),
    page.getByLabel('消息内容').boundingBox(),
  ])
  expect(toastBox).not.toBeNull()
  expect(headerBox).not.toBeNull()
  expect(composerBox).not.toBeNull()
  expect(toastBox?.y ?? 0).toBeGreaterThanOrEqual(
    (headerBox?.y ?? 0) + (headerBox?.height ?? 0) - 1,
  )
  expect((toastBox?.y ?? 0) + (toastBox?.height ?? 0)).toBeLessThan(composerBox?.y ?? 0)
  await expect(toast.locator('[data-close-button]')).toHaveCount(0)
  await expect(toast).toHaveCount(0, { timeout: 7_000 })
})

test('inserts quote and parenthesis pairs at the caret', async ({ page }) => {
  await importTestCard(page)
  const character = await firstCharacter(page)
  const session = await createChat(page, character.id)
  await page.goto(`/chat/${session.id}`)

  const composer = page.getByLabel('消息内容')
  await page.getByRole('button', { name: '插入引号' }).click()
  await page.keyboard.type('今晚见')
  await expect(composer).toHaveValue('“今晚见”')

  await page.getByRole('button', { name: '插入括号' }).click()
  await page.keyboard.type('点头')
  await expect(composer).toHaveValue('“今晚见（点头）”')

  await composer.fill('小声说话')
  await composer.selectText()
  await page.getByRole('button', { name: '插入引号' }).click()
  await expect(composer).toHaveValue('“小声说话”')
})

test('renders multi-speaker replies as left and right chat bubbles', async ({ page }) => {
  await importTestCard(page)
  const character = await firstCharacter(page)
  const session = (await page.evaluate(
    async ({ characterId }) => {
      const response = await fetch('/api/test/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId,
          title: '群聊气泡',
          messages: [
            { role: 'user', content: '（我把伞收好）' },
            { role: 'user', content: '今晚几点见？' },
            {
              role: 'assistant',
              content:
                '【测试旅人】\\\n「放学后，在旧站台见。」\\\n她把伞往你那边偏了偏，心里不想让你等太久。\\\n旧站台的灯闪了两下，几个低年级学生从楼梯口经过。\\\n\\\n【同学A】\\\n「我也去。」\\\n\\\n【你】\\\n我也去。\\\n（把伞收好）\\\n那就说定了。',
            },
            {
              role: 'assistant',
              content:
                '走廊尽头的壁灯把两个人的影子拉得很长。隔壁的空包厢门虚掩着，门缝里漏出一线幽蓝的待机灯光，像一口安静的水井。',
            },
          ],
        }),
      })
      if (!response.ok) throw new Error(await response.text())
      return response.json()
    },
    { characterId: character.id },
  )) as TestSession

  await page.goto(`/chat/${session.id}`)
  const transcript = page.getByTestId('chat-transcript')
  await expect(transcript).toBeVisible()
  await expect(transcript.locator('[data-speaker="测试旅人"]')).toBeVisible()
  await expect(transcript.locator('[data-speaker="同学A"]')).toBeVisible()
  await expect(transcript.locator('[data-speaker="你"]')).toHaveCount(2)
  await expect(transcript.locator('[data-speaker-side="left"]')).toHaveCount(2)
  await expect(transcript.locator('[data-speaker-side="right"]')).toHaveCount(2)
  await expect(transcript.getByText('那就说定了。')).toBeVisible()
  await expect(transcript.getByText('心里不想让你等太久')).toBeVisible()
  const ownAction = page.locator('[data-message-style="user"]').filter({ hasText: '我把伞收好' })
  await expect(ownAction.locator('[data-message-part="dialogue"]')).toHaveCount(0)
  expect(
    await ownAction
      .locator('[data-message-part="narration"]')
      .evaluate((element) => getComputedStyle(element).textAlign),
  ).toBe('center')
  const userAction = transcript.getByText('把伞收好')
  await expect(userAction).toBeVisible()
  expect(await userAction.evaluate((element) => element.closest('[data-speaker]') === null)).toBe(
    true,
  )
  expect(await userAction.evaluate((element) => getComputedStyle(element).textAlign)).toBe('center')
  const traveler = transcript.locator('[data-speaker="测试旅人"]')
  await expect(traveler.locator('[data-message-part="dialogue"]')).toHaveCount(1)
  const narrationPart = transcript.locator('[data-message-part="narration"]').first()
  await expect(narrationPart).toContainText('心里不想让你等太久')
  expect(
    await narrationPart.evaluate((element) => element.closest('[data-speaker]') === null),
  ).toBe(true)
  const narrationFontSize = await narrationPart
    .locator('.story-prose')
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))
  const dialogueFontSize = await traveler
    .locator('[data-message-part="dialogue"] .story-prose')
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))
  expect(narrationFontSize).toBeGreaterThan(dialogueFontSize)
  const narrationMessage = page.locator('[data-message-style="narration"]')
  await expect(narrationMessage).toContainText('走廊尽头的壁灯')
  await expect
    .poll(() =>
      narrationMessage
        .locator('.story-prose')
        .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
    )
    .toBeGreaterThanOrEqual(16)
  await expect
    .poll(() =>
      page
        .getByTestId('message-scroll')
        .evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight),
    )
    .toBeLessThan(80)
  await page.screenshot({ path: path.join(streamScreenshotDir, 'chat-group-1440.png') })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: path.join(streamScreenshotDir, 'chat-group-390.png') })
  const overflow = await page.evaluate(
    () =>
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
  )
  expect(overflow).toBeLessThanOrEqual(1)
})

test('uses explicit layout tags for speech and narration', async ({ page }) => {
  await importTestCard(page)
  const character = await firstCharacter(page)
  const session = (await page.evaluate(
    async ({ characterId }) => {
      const response = await fetch('/api/test/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId,
          title: '显式布局',
          messages: [
            {
              role: 'assistant',
              content:
                '[[narration]]走廊尽头的灯闪了两下。[[/narration]]\n\n【测试旅人】\n[[bubble]]我回来了。[[/bubble]]\n[[narration]]她把伞收好。[[/narration]]',
            },
          ],
        }),
      })
      if (!response.ok) throw new Error(await response.text())
      return response.json()
    },
    { characterId: character.id },
  )) as TestSession

  await page.goto(`/chat/${session.id}`)
  const transcript = page.getByTestId('chat-transcript')
  const traveler = transcript.locator('[data-speaker="测试旅人"]')
  await expect(traveler.locator('[data-message-part="dialogue"]')).toHaveCount(1)
  await expect(transcript.getByText('我回来了。')).toBeVisible()

  const action = transcript.getByText('她把伞收好。')
  await expect(action).toBeVisible()
  expect(await action.evaluate((element) => element.closest('[data-speaker]') === null)).toBe(true)
  await expect(transcript).not.toContainText('[[bubble]]')
  await expect(transcript).not.toContainText('[[narration]]')
})

test('multi-selects and deletes conversations with confirmation', async ({ page }) => {
  await importTestCard(page)
  const character = await firstCharacter(page)
  const first = await createSeededChat(page, character.id, '测试对话一', 2)
  const second = await createSeededChat(page, character.id, '测试对话二', 2)
  const third = await createSeededChat(page, character.id, '测试对话三', 2)

  await page.goto('/')
  await page.getByRole('button', { name: '多选删除' }).click()
  await page.getByTestId(`chat-row-${first.id}`).click()
  await page.getByTestId(`chat-row-${second.id}`).click()
  await expect(page.getByText('已选 2 段对话')).toBeVisible()

  await page.getByRole('button', { name: '删除 2 段' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('删除 2 段对话？')).toBeVisible()
  await dialog.getByRole('button', { name: '删除 2 段' }).click()
  await expect(page.getByText('已删除 2 段对话')).toBeVisible()
  await expect(page.getByTestId(`chat-row-${first.id}`)).toHaveCount(0)
  await expect(page.getByTestId(`chat-row-${third.id}`)).toBeVisible()
})

test('loads earlier messages in a long conversation and keeps the reading position', async ({
  page,
}) => {
  await importTestCard(page)
  const character = await firstCharacter(page)
  const session = await createSeededChat(page, character.id, '长对话测试', 48)
  await page.goto(`/chat/${session.id}`)
  await expect(page.locator('header').getByText(/48 条/)).toBeVisible()

  const loadEarlier = page.getByRole('button', { name: '加载更早的消息' })
  await expect(loadEarlier).toBeVisible()
  const scroller = page.getByTestId('message-scroll')
  await expect
    .poll(() =>
      scroller.evaluate(
        (element) => element.scrollHeight - element.scrollTop - element.clientHeight,
      ),
    )
    .toBeLessThan(80)
  await scroller.evaluate((element) => {
    element.scrollTop = 0
  })
  const before = await scroller.evaluate((element) => ({
    height: element.scrollHeight,
    top: element.scrollTop,
  }))

  await loadEarlier.click()
  await expect(loadEarlier).toHaveCount(0)
  await page.waitForTimeout(150)
  const after = await scroller.evaluate((element) => ({
    height: element.scrollHeight,
    top: element.scrollTop,
  }))
  expect(after.height).toBeGreaterThan(before.height)
  expect(after.top).toBeGreaterThan(0)
})

test('saves per-chat font size and keeps it after reload', async ({ page }) => {
  await importTestCard(page)
  const character = await firstCharacter(page)
  const session = await createChat(page, character.id)
  await page.goto(`/chat/${session.id}`)
  await page.getByRole('link', { name: '打开当前对话设置' }).click()
  await expect(page.getByText('仅影响当前对话').first()).toBeVisible()

  const slider = page.getByLabel('聊天字号')
  await slider.focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.getByRole('button', { name: '保存设置' }).click()
  await expect(page).toHaveURL(new RegExp(`/chat/${session.id}$`))
  await expect(page.locator('header').getByText('18', { exact: true })).toBeVisible()

  await page.reload()
  await expect(page.locator('header').getByText('18', { exact: true })).toBeVisible()
})

test('keeps mobile pages inside 390px and key controls reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await importTestCard(page)
  const character = await firstCharacter(page)
  const session = await createSeededChat(page, character.id, '移动端测试', 4)

  for (const route of [
    '/',
    '/loadouts',
    '/loadouts?tab=combos',
    '/characters',
    '/settings',
    `/chat/${session.id}`,
    `/chat/${session.id}/settings`,
  ]) {
    await page.goto(route)
    await page.waitForTimeout(150)
    const overflow = await page.evaluate(
      () =>
        Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) -
        window.innerWidth,
    )
    expect(overflow, route).toBeLessThanOrEqual(1)
  }

  await page.goto(`/chat/${session.id}`)
  const plus = await page.getByRole('button', { name: '增大聊天字号' }).boundingBox()
  const send = await page.getByRole('button', { name: '发送消息' }).boundingBox()
  expect(plus?.height ?? 0).toBeGreaterThanOrEqual(36)
  expect(send?.height ?? 0).toBeGreaterThanOrEqual(40)

  await page.goto(`/chat/${session.id}/settings`)
  const characterSelect = page.getByLabel('选择对话角色卡')
  const box = await characterSelect.boundingBox()
  expect(box).not.toBeNull()
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(391)

  await page.evaluate(() => {
    document.documentElement.dataset.platform = 'android'
  })
  const backLink = await page.getByRole('link', { name: '返回聊天' }).boundingBox()
  expect(backLink).not.toBeNull()
  expect(backLink?.y ?? 0).toBeGreaterThanOrEqual(23)

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await page.waitForTimeout(150)
  const preview = await page.getByText(/预览聊天字号/).boundingBox()
  const savebar = await page.getByTestId('chat-settings-savebar').boundingBox()
  expect(preview).not.toBeNull()
  expect(savebar).not.toBeNull()
  expect((preview?.y ?? 0) + (preview?.height ?? 0)).toBeLessThanOrEqual((savebar?.y ?? 0) + 1)

  await page.goto('/')
  await page.getByRole('button', { name: '打开菜单' }).click()
  const menu = page.getByRole('dialog', { name: '导航菜单' })
  await expect(menu).toBeVisible()
  await expect(menu.getByText('移动端测试')).toBeVisible()
  await expect(menu.getByRole('link', { name: /配套/ })).toBeVisible()
  await expect(menu.getByRole('link', { name: /设置/ })).toBeVisible()
  await expect(menu.getByRole('link', { name: /导入/ })).toBeVisible()
  await menu.getByRole('button', { name: '新建聊天' }).click()
  await expect(page.getByRole('dialog').getByRole('heading', { name: '选择配套' })).toBeVisible()
})

test('keeps mobile navigation and long dialogs inside system insets', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await importTestCard(page)
  const character = await firstCharacter(page)
  const session = await createSeededChat(
    page,
    character.id,
    '这是一段非常非常长的对话标题，用来检查手机窄屏会不会把首页撑破',
    4,
  )

  const applyInsets = () =>
    page.evaluate(() => {
      document.documentElement.style.setProperty('--safe-top', '28px')
      document.documentElement.style.setProperty('--safe-bottom', '12px')
    })

  await page.goto('/')
  await applyInsets()
  const overflow = await page.evaluate(
    () =>
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
  )
  expect(overflow).toBeLessThanOrEqual(1)

  const headerBox = await page.locator('header.fixed').boundingBox()
  const titleBox = await page.getByRole('heading', { name: '对话', exact: true }).boundingBox()
  expect(headerBox).not.toBeNull()
  expect(titleBox).not.toBeNull()
  expect((titleBox?.y ?? 0) + 1).toBeGreaterThanOrEqual(
    (headerBox?.y ?? 0) + (headerBox?.height ?? 0),
  )

  await page.getByRole('button', { name: '打开菜单' }).click()
  const menu = page.getByRole('dialog', { name: '导航菜单' })
  await expect(menu.getByRole('link', { name: /配套/ })).toBeVisible()
  await menu.getByRole('link', { name: /配套/ }).click()
  await expect(page).toHaveURL(/\/loadouts$/)
  await expect(page.getByRole('heading', { name: '配套', exact: true })).toBeVisible()

  await page.goto('/characters')
  await applyInsets()
  await page.getByRole('button', { name: '新建角色' }).click()
  const dialog = page.getByRole('dialog', { name: '新建角色' })
  const dialogBox = await dialog.boundingBox()
  expect(dialogBox).not.toBeNull()
  expect(dialogBox?.y ?? 0).toBeGreaterThanOrEqual(28)
  expect((dialogBox?.y ?? 0) + (dialogBox?.height ?? 0)).toBeLessThanOrEqual(641)

  await page
    .getByTestId('character-form-scroll')
    .evaluate((element) => (element.scrollTop = element.scrollHeight))
  await page.getByRole('button', { name: '关闭' }).click()
  await expect(dialog).toHaveCount(0)

  await page.setViewportSize({ width: 1280, height: 900 })
  await page.getByRole('button', { name: '新建角色' }).click()
  const desktopDialogBox = await page.getByRole('dialog', { name: '新建角色' }).boundingBox()
  expect(desktopDialogBox).not.toBeNull()
  expect(
    Math.abs((desktopDialogBox?.y ?? 0) + (desktopDialogBox?.height ?? 0) / 2 - 450),
  ).toBeLessThanOrEqual(2)
  await page.getByRole('button', { name: '关闭' }).click()

  await page.setViewportSize({ width: 320, height: 640 })
  await page.goto(`/chat/${session.id}`)
  await applyInsets()
  await expect
    .poll(async () => (await page.getByTestId('chat-shell').boundingBox())?.height ?? 0)
    .toBeLessThanOrEqual(640)
  await page.setViewportSize({ width: 320, height: 420 })
  await expect
    .poll(async () => (await page.getByTestId('chat-shell').boundingBox())?.height ?? 0)
    .toBeLessThanOrEqual(420)
  const composer = await page.getByLabel('消息内容').boundingBox()
  expect(composer).not.toBeNull()
  expect((composer?.y ?? 0) + (composer?.height ?? 0)).toBeLessThanOrEqual(421)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/chat/${session.id}/settings`)
  const worldBookRow = page.getByText('测试车站', { exact: true }).locator('..')
  await expect(worldBookRow).toBeVisible()
  await expect(worldBookRow).not.toContainText('条')
  await expect(worldBookRow).not.toContainText('测试用世界书')
})

test('keeps long loadout cards inside narrow mobile screens', async ({ page }) => {
  const longName = '只要你觉淂公平，就必须愿赌服输'
  await page.setViewportSize({ width: 320, height: 640 })
  await importFile(page, 'long-name-card.json', {
    ...testCard,
    data: { ...testCard.data, name: longName },
  })

  await page.goto('/loadouts')
  const card = page.locator('[data-slot="card"]').filter({ hasText: longName }).first()
  await expect(card).toBeVisible()

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) -
            window.innerWidth,
        ),
      )
      .toBeLessThanOrEqual(1)

    const cardBox = await card.boundingBox()
    const badgeBox = await card.locator('[data-slot="badge"]').boundingBox()
    expect(cardBox).not.toBeNull()
    expect(badgeBox).not.toBeNull()
    expect((cardBox?.x ?? -1) + (cardBox?.width ?? 0)).toBeLessThanOrEqual(width + 1)
    expect((badgeBox?.x ?? -1) + (badgeBox?.width ?? 0)).toBeLessThanOrEqual(width + 1)
  }
})

test('locks page scale without blocking normal touch scrolling', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '对话', exact: true })).toBeVisible()
  const viewport = await page.locator('meta[name="viewport"]').getAttribute('content')
  expect(viewport).toContain('user-scalable=no')
  expect(viewport).toContain('maximum-scale=1.0')

  const styles = await page.evaluate(() => ({
    htmlTouchAction: getComputedStyle(document.documentElement).touchAction,
    bodyTouchAction: getComputedStyle(document.body).touchAction,
    textSizeAdjust: getComputedStyle(document.documentElement).webkitTextSizeAdjust,
  }))
  expect(styles.htmlTouchAction).toBe('pan-x pan-y')
  expect(styles.bodyTouchAction).toBe('pan-x pan-y')
  expect(styles.textSizeAdjust).toBe('100%')

  const gestures = await page.evaluate(() => {
    const dispatchTouch = (type: string, touchCount: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'touches', { value: { length: touchCount } })
      document.dispatchEvent(event)
      return event.defaultPrevented
    }
    const event = new Event('gesturestart', { bubbles: true, cancelable: true })
    document.dispatchEvent(event)
    return {
      oneFingerTouch: dispatchTouch('touchstart', 1),
      twoFingerTouch: dispatchTouch('touchstart', 2),
      twoFingerMove: dispatchTouch('touchmove', 2),
      gesture: event.defaultPrevented,
    }
  })
  expect(gestures).toEqual({
    oneFingerTouch: false,
    twoFingerTouch: true,
    twoFingerMove: true,
    gesture: true,
  })
})

test('saves multiple API connections and selects one for vector memory', async ({ page }) => {
  await page.goto('/settings')

  for (const [name, model, key] of [
    ['测试连接 A', 'model-a', 'sk-test-secret-a'],
    ['测试连接 B', 'model-b', 'sk-test-secret-b'],
  ]) {
    await page.getByRole('button', { name: '新增连接' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('连接名称').fill(name)
    await dialog.getByLabel('Base URL').fill('https://api.example.com/v1')
    await dialog.getByLabel('API Key').fill(key)
    await dialog.getByLabel('模型').fill(model)
    await dialog.getByRole('button', { name: '保存连接' }).click()
    await expect(page.getByText(name, { exact: true })).toBeVisible()
    await expect(page.getByText(key, { exact: true })).toHaveCount(0)
  }

  await page.getByRole('button', { name: /向量记忆/ }).click()
  await page.getByLabel('向量生成连接').selectOption({ label: '测试连接 B · model-b' })
  await page.getByRole('button', { name: '保存记忆设置' }).click()
  await expect(page.getByText('记忆设置已保存')).toBeVisible()

  await page.reload()
  await expect(page.getByText('测试连接 A', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('测试连接 B', { exact: true }).first()).toBeVisible()
  await expect(page.getByLabel('向量生成连接').locator('option:checked')).toHaveText(
    '测试连接 B · model-b',
  )
})

test('persists vector memories in IndexedDB and migrates old localStorage entries', async ({
  page,
}) => {
  test.setTimeout(90_000)
  const api = await startOpenAiApi()

  try {
    await configureTestApi(page, api.baseUrl)
    await page.goto('/settings')
    await page.getByRole('button', { name: /向量记忆/ }).click()
    await page.getByRole('button', { name: '保存记忆设置' }).click()
    await expect(page.getByText('记忆设置已保存')).toBeVisible()

    await importTestCard(page)
    const character = await firstCharacter(page)
    const session = await createChat(page, character.id)

    await expect.poll(async () => (await readVectorStore(page)).count).toBeGreaterThan(0)
    const initial = await readVectorStore(page)
    expect(initial.typed).toBe(true)
    const localState = await page.evaluate(() =>
      JSON.parse(window.localStorage.getItem('xiaobai.tavern.v3') ?? 'null'),
    )
    expect(localState.vectorMemories).toHaveLength(0)

    const exported = await page.evaluate(
      async () =>
        (await fetch('/api/export')).json() as Promise<{ state: Record<string, unknown> }>,
    )
    expect((exported.state.vectorMemories as unknown[]).length).toBeGreaterThan(0)

    await page.evaluate(async () => {
      await fetch('/api/vector-memories', { method: 'DELETE' })
    })
    await expect.poll(async () => (await readVectorStore(page)).count).toBe(0)

    await page.evaluate((legacyState) => {
      window.localStorage.setItem('xiaobai.tavern.v3', JSON.stringify(legacyState))
    }, exported.state)
    await page.reload()
    await expect.poll(async () => (await readVectorStore(page)).count).toBeGreaterThan(0)
    const migratedState = await page.evaluate(() =>
      JSON.parse(window.localStorage.getItem('xiaobai.tavern.v3') ?? 'null'),
    )
    expect(migratedState.vectorMemories).toHaveLength(0)

    await page.goto(`/chat/${session.id}`)
    await expect(page.getByText('你也在等这班车吗？').first()).toBeVisible()
    await page.getByLabel('消息内容').fill('向量记忆还在吗？')
    await page.getByRole('button', { name: '发送消息' }).click()
    await expect(page.getByText(/今晚也会来/)).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('button', { name: '停止生成' })).toHaveCount(0, {
      timeout: 20_000,
    })
    await expect
      .poll(async () => (await readVectorStore(page)).count)
      .toBeGreaterThan(initial.count)

    await page.reload()
    await expect(page.getByText(/今晚也会来/)).toBeVisible()
    const finalState = await page.evaluate(() =>
      JSON.parse(window.localStorage.getItem('xiaobai.tavern.v3') ?? 'null'),
    )
    expect(finalState.vectorMemories).toHaveLength(0)

    await page.goto('/settings')
    await expect(page.getByText(/条记忆 · 本机/)).toBeVisible()

    await page.setViewportSize({ width: 390, height: 844 })
    await page.reload()
    await page.getByRole('link', { name: '记忆', exact: true }).click()
    await expect(page).toHaveURL(/section=memory/)
    await expect(page.getByText(/条记忆 · 本机/)).toBeVisible()
    await expect
      .poll(async () => (await readVectorStore(page)).count)
      .toBeGreaterThan(initial.count)

    await page.evaluate(async (sessionId) => {
      await fetch(`/api/chats/${sessionId}`, { method: 'DELETE' })
    }, session.id)
    await expect.poll(async () => (await readVectorStore(page)).count).toBe(0)
  } finally {
    await api.close()
  }
})

test('shows built-in combos and applies a preset plus regex to a chat', async ({ page }) => {
  await importTestCard(page)

  await page.goto('/loadouts?tab=combos')
  await expect(page.getByRole('heading', { name: '棠梨 · ATRI Gemini' })).toBeVisible()
  const builtinCombos = await page.evaluate(
    async () =>
      (await fetch('/api/combos')).json() as Promise<{ items: { id: string; name: string }[] }>,
  )
  expect(builtinCombos.items).toHaveLength(1)

  const comboCard = page
    .locator('[data-slot="card"]')
    .filter({ hasText: '棠梨 · ATRI Gemini' })
    .first()
  await expect(comboCard.getByRole('button', { name: /新建配套/ })).toHaveCount(0)
  await expect(comboCard.getByRole('button', { name: /编辑/ })).toBeVisible()
  await comboCard.getByRole('button', { name: /编辑/ }).click()
  const comboEditor = page.getByRole('dialog')
  await expect(comboEditor.getByLabel('选择组合正则')).toHaveValue('builtin-regex-pack-tangli')
  await comboEditor.getByRole('button', { name: '取消' }).click()

  await page.goto('/loadouts')
  await page.getByRole('button', { name: '新建配套' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: '新建配套' })).toBeVisible()
  await dialog.getByLabel('选择组合套用到配套').selectOption({ label: '棠梨 · ATRI Gemini' })
  await expect(dialog.getByLabel('选择配套正则')).toHaveValue('builtin-regex-pack-tangli')
  expect(await dialog.getByLabel('选择配套预设').inputValue()).toBeTruthy()
  await dialog.getByRole('button', { name: '取消' }).click()

  const character = await firstCharacter(page)
  const session = await createChat(page, character.id)
  await page.goto(`/chat/${session.id}/settings`)
  await page.getByLabel('套用组合').selectOption({ label: '棠梨 · ATRI Gemini' })
  await page.getByRole('button', { name: '保存设置' }).click()
  await expect(page).toHaveURL(new RegExp(`/chat/${session.id}$`))

  const saved = (await page.evaluate(
    async (id) => (await fetch(`/api/chats/${id}`)).json(),
    session.id,
  )) as {
    presetId: string | null
    generation: { temperature: number }
    regexRuleIds: string[]
  }
  expect(saved.presetId).toBeTruthy()
  expect(saved.generation.temperature).toBeCloseTo(1.1)
  expect(saved.regexRuleIds).toHaveLength(9)

  const sent = (await page.evaluate(async (id) => {
    const response = await fetch(`/api/chats/${id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '测试输入不会被组合正则清空' }),
    })
    return {
      status: response.status,
      body: (await response.json()) as { userMessage?: { content?: string } },
    }
  }, session.id)) as { status: number; body: { userMessage?: { content?: string } } }
  expect(sent.status).toBe(201)
  expect(sent.body.userMessage?.content).toBe('测试输入不会被组合正则清空')
})

test('migrates the legacy two built-in combos down to one', async ({ page }) => {
  const state = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem('xiaobai.tavern.v3') ?? 'null'),
  )
  state.combos = [
    {
      ...state.combos[0],
      id: 'builtin-combo-lisug-atri-gemini',
      name: "li'sug · ATRI Gemini",
    },
    {
      ...state.combos[0],
      id: 'builtin-combo-tangli-regex',
      name: '棠梨预设正则包',
      presetId: null,
    },
  ]
  state.regexRules.push({
    ...state.regexRules[1],
    id: 'builtin-regex-lisug-atri-1',
    name: "【li'sug】thinking",
  })

  await page.evaluate((legacyState) => {
    window.localStorage.setItem('xiaobai.tavern.v3', JSON.stringify(legacyState))
    window.localStorage.setItem('xiaobai.tavern.builtin-combos.v1', '1')
  }, state)
  await page.reload()
  await expect(page.getByRole('heading', { name: '对话', exact: true })).toBeVisible()

  const combos = await page.evaluate(
    async () =>
      (await fetch('/api/combos')).json() as Promise<{ items: { id: string; name: string }[] }>,
  )
  expect(combos.items).toHaveLength(1)
  expect(combos.items[0].name).toBe('棠梨 · ATRI Gemini')
  const rules = await page.evaluate(
    async () => (await fetch('/api/regex-rules')).json() as Promise<{ items: { id: string }[] }>,
  )
  expect(rules.items).toHaveLength(9)
  expect(rules.items.some((rule) => rule.id.includes('lisug-atri'))).toBe(false)
})

test('creates, edits, and deletes a combo from the combo tab', async ({ page }) => {
  await page.goto('/loadouts?tab=combos')
  await page.getByRole('button', { name: '新建组合' }).click()
  const editor = page.getByRole('dialog')
  await editor.getByPlaceholder('例如：ATRI Gemini + 去油').fill('测试组合')
  await editor.getByLabel('选择组合预设').selectOption({ label: "li'sug · ATRI Gemini" })
  await editor.getByLabel('选择组合正则').selectOption({ label: '棠梨预设正则包（8 条）' })
  await editor.getByRole('button', { name: '保存组合' }).click()
  await expect(page.getByRole('heading', { name: '测试组合' })).toBeVisible()
  const createdCard = page.locator('[data-slot="card"]').filter({ hasText: '测试组合' }).first()
  await expect(createdCard.getByText(/棠梨预设正则包 · 8 条/)).toBeVisible()

  await page.getByRole('button', { name: '编辑 测试组合' }).click()
  const editDialog = page.getByRole('dialog')
  await editDialog.getByPlaceholder('例如：ATRI Gemini + 去油').fill('测试组合二')
  await editDialog.getByRole('button', { name: '保存组合' }).click()
  await expect(page.getByRole('heading', { name: '测试组合二' })).toBeVisible()

  await page.getByRole('button', { name: '删除 测试组合二' }).click()
  await page.getByRole('dialog').getByRole('button', { name: '确认删除' }).click()
  await expect(page.getByRole('heading', { name: '测试组合二' })).toHaveCount(0)
})

test('groups an imported regex pack and toggles one rule inside it', async ({ page }) => {
  await importFile(page, 'regex-pack.json', {
    name: '测试正则包',
    rules: [
      ...regexFile,
      {
        scriptName: '压缩空格',
        findRegex: '/ {2,}/g',
        replaceString: ' ',
      },
    ],
  })

  await page.goto('/import?tab=regex')
  const importedCard = page.getByTestId('regex-pack-card').filter({ hasText: '测试正则包' })
  await expect(importedCard).toHaveCount(1)
  await expect(importedCard.getByText('2 条规则 · 2 条启用')).toBeVisible()
  await expect(importedCard.getByTestId('regex-pack-rule')).toHaveCount(0)

  await importedCard.getByRole('button', { name: '管理正则包 测试正则包' }).click()
  const manager = page.getByRole('dialog')
  await expect(manager.getByRole('heading', { name: '测试正则包' })).toBeVisible()
  await expect(manager.getByTestId('regex-pack-rule')).toHaveCount(2)

  await manager.getByRole('button', { name: '编辑' }).first().click()
  const editDialog = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('heading', { name: '编辑正则' }) })
  await expect(editDialog).toBeVisible()
  await editDialog.locator('input').first().fill('清理省略号（已编辑）')
  await editDialog
    .locator('[data-slot="dialog-footer"]')
    .getByRole('button', { name: '保存正则' })
    .click()
  await expect(manager.getByText('清理省略号（已编辑）')).toBeVisible()

  await manager.getByLabel('停用规则 清理省略号（已编辑）').click()
  await expect(manager.getByLabel('启用规则 清理省略号（已编辑）')).toBeVisible()
  await expect
    .poll(async () => {
      const response = (await page.evaluate(async () =>
        (await fetch('/api/regex-rules')).json(),
      )) as { items: { name: string; enabled: boolean }[] }
      return response.items.find((rule) => rule.name === '清理省略号（已编辑）')?.enabled
    })
    .toBe(false)

  await manager.locator('[data-slot="dialog-footer"]').getByRole('button', { name: '关闭' }).click()
  await expect(importedCard.getByText('2 条规则 · 1 条启用')).toBeVisible()
})

test('offers the built-in chat bubble regex when creating a combo', async ({ page }) => {
  await page.goto('/loadouts?tab=combos')
  await page.getByRole('button', { name: '新建组合' }).click()
  const editor = page.getByRole('dialog')
  await editor.getByPlaceholder('例如：ATRI Gemini + 去油').fill('气泡组合')
  const regexSelect = editor.getByLabel('选择组合正则')
  await expect(regexSelect.locator('option', { hasText: '微信式对话气泡' })).toHaveCount(1)
  await regexSelect.selectOption({ label: '微信式对话气泡（内置 · 1 条）' })
  await editor.getByRole('button', { name: '保存组合' }).click()

  const comboCard = page.locator('[data-slot="card"]').filter({ hasText: '气泡组合' }).first()
  await expect(page.getByRole('heading', { name: '气泡组合' })).toBeVisible()
  await expect(comboCard.getByText('微信式对话气泡（内置）')).toBeVisible()
  const combo = (await page.evaluate(async () => (await fetch('/api/combos')).json())) as {
    items: { name: string; regexRuleIds: string[] }[]
  }
  expect(combo.items.find((item) => item.name === '气泡组合')?.regexRuleIds).toEqual([
    'regex-chat-bubbles',
  ])
})

test('imports a character into a default loadout and starts from home', async ({ page }) => {
  await importTestCard(page)

  await page.goto('/loadouts')
  await expect(page.getByRole('heading', { name: '配套', exact: true })).toBeVisible()
  await expect(page.getByText('测试旅人 · 默认配套')).toBeVisible()

  await page.goto('/')
  await page.getByRole('button', { name: '新建聊天' }).first().click()
  await expect(page.getByRole('dialog').getByRole('heading', { name: '选择配套' })).toBeVisible()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /测试旅人 · 默认配套/ })
    .click()
  await expect(page).toHaveURL(/\/chat\//)
  await expect(page.getByText('你也在等这班车吗？').first()).toBeVisible()
})

test('imports a long tagline without truncation', async ({ page }) => {
  const name = '长简介旅人'
  const tagline = '旅行'.repeat(42)
  await importFile(page, 'long-tagline-card.json', {
    ...testCard,
    data: { ...testCard.data, name, tagline },
  })

  const characters = await page.evaluate(async () => {
    const response = await fetch('/api/characters')
    const data = (await response.json()) as {
      items: { name: string; tagline: string }[]
    }
    return data.items
  })

  expect(characters.find((character) => character.name === name)?.tagline).toBe(tagline)
})

test('imports a ZIP pack as one bound loadout', async ({ page }) => {
  const pack = zipSync({
    '测试配套/角色卡.json': strToU8(JSON.stringify(testCard)),
    '测试配套/预设.json': strToU8(
      JSON.stringify({
        name: '测试配套预设',
        settings: {
          temperature: 0.88,
          top_p: 0.92,
          openai_max_tokens: 900,
        },
        prompts: [
          {
            identifier: 'main',
            name: '主规则',
            content: '先让场景发生，再让角色说话。',
            enabled: true,
          },
        ],
        prompt_order: [{ order: [{ identifier: 'main', enabled: true }] }],
      }),
    ),
    '测试配套/世界书.json': strToU8(
      JSON.stringify({
        name: '测试配套世界',
        entries: [{ keys: ['站台'], content: '站台的钟慢三分钟。', constant: true }],
      }),
    ),
    '测试配套/正则.json': strToU8(JSON.stringify({ name: '测试配套正则', rules: regexFile })),
    '测试配套/manifest.json': strToU8(
      JSON.stringify({
        name: '测试 ZIP 配套',
        description: '从导入配套页上传。',
        memoryMode: 'compressed',
      }),
    ),
    '测试配套/README.txt': strToU8('说明文件不参与导入。'),
  })

  await page.goto('/import/files?pack=1')
  await expect(page.getByRole('heading', { name: '导入配套' })).toBeVisible()
  await page.locator('input[type="file"]').setInputFiles({
    name: '测试配套.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(pack),
  })
  await expect(page.getByText('测试配套.zip')).toBeVisible()
  await expect(page.getByText(/配套 · 角色 1 · 预设 1 · 世界书 2 · 正则 1/)).toBeVisible()
  await page.getByRole('button', { name: /开始导入/ }).click()
  await expect(page.getByText('导入流程结束')).toBeVisible({ timeout: 10_000 })

  const imported = await page.evaluate(async () => {
    const read = async (url: string) => (await fetch(url)).json() as Promise<{ items: unknown[] }>
    return {
      characters: await read('/api/characters'),
      presets: await read('/api/presets'),
      worldbooks: await read('/api/worldbooks'),
      regexRules: await read('/api/regex-rules'),
      loadouts: await read('/api/loadouts'),
    }
  })

  const characters = imported.characters.items as { id: string; name: string }[]
  const presets = imported.presets.items as { id: string; name: string }[]
  const worldbooks = imported.worldbooks.items as { id: string; name: string }[]
  const regexRules = imported.regexRules.items as { id: string; name: string }[]
  const loadouts = imported.loadouts.items as {
    id: string
    name: string
    characterId: string
    presetId: string | null
    worldBookIds: string[]
    regexRuleIds: string[]
    memoryMode: string
  }[]

  expect(characters.map((item) => item.name)).toContain('测试旅人')
  expect(presets.map((item) => item.name)).toContain('测试配套预设')
  expect(worldbooks.map((item) => item.name)).toEqual(
    expect.arrayContaining(['测试车站', '测试配套世界']),
  )
  expect(regexRules.map((item) => item.name)).toEqual(
    expect.arrayContaining(['微信式对话气泡', '清理省略号']),
  )

  const loadout = loadouts.find((item) => item.name === '测试 ZIP 配套')
  expect(loadout).toBeTruthy()
  expect(loadout?.presetId).toBe(presets.find((item) => item.name === '测试配套预设')?.id)
  expect(loadout?.worldBookIds).toHaveLength(2)
  expect(loadout?.regexRuleIds).toHaveLength(2)
  expect(loadout?.memoryMode).toBe('compressed')

  await page.goto('/loadouts')
  await expect(page.getByRole('heading', { name: '测试 ZIP 配套' })).toBeVisible()
  await page.getByRole('button', { name: '开始对话' }).first().click()
  await expect(page).toHaveURL(/\/chat\//)
  await expect(page.getByText('你也在等这班车吗？').first()).toBeVisible()
})

test('imports the bundled open narrative pack and renders its opening state card', async ({
  page,
}) => {
  await page.goto('/import/files?pack=1')
  await expect(page.getByRole('heading', { name: '导入配套' })).toBeVisible()
  await page
    .locator('input[type="file"]')
    .setInputFiles(path.resolve(process.cwd(), 'packs', 'wujie-station-open-pack.zip'))
  await expect(page.getByText('wujie-station-open-pack.zip')).toBeVisible()
  await expect(page.getByText(/配套 · 角色 1 · 预设 1 · 世界书 3 · 正则 9/)).toBeVisible()
  await page.getByRole('button', { name: /开始导入/ }).click()
  await expect(page.getByText('导入流程结束')).toBeVisible({ timeout: 10_000 })

  const imported = await page.evaluate(async () => {
    const read = async (url: string) => (await fetch(url)).json() as Promise<{ items: unknown[] }>
    return {
      characters: await read('/api/characters'),
      presets: await read('/api/presets'),
      worldbooks: await read('/api/worldbooks'),
      regexRules: await read('/api/regex-rules'),
      loadouts: await read('/api/loadouts'),
    }
  })

  const characters = imported.characters.items as { id: string; name: string }[]
  const presets = imported.presets.items as { id: string; name: string }[]
  const worldbooks = imported.worldbooks.items as { id: string; name: string }[]
  const regexRules = imported.regexRules.items as { id: string; name: string }[]
  const loadouts = imported.loadouts.items as {
    id: string
    name: string
    characterId: string
    presetId: string | null
    worldBookIds: string[]
    regexRuleIds: string[]
  }[]

  expect(characters.map((item) => item.name)).toContain('闻灯')
  expect(presets.map((item) => item.name)).toContain('无界叙事引擎')
  expect(worldbooks.map((item) => item.name)).toEqual(
    expect.arrayContaining(['无界驿站 · 总纲', '无界驿站 · 人物簿', '当前篇 · 雾港来信']),
  )
  expect(regexRules.map((item) => item.name)).toEqual(
    expect.arrayContaining(['微信式对话气泡', '状态开头归一', '好感度归一']),
  )

  const loadout = loadouts.find((item) => item.name === '无界驿站 · 开放叙事配套')
  expect(loadout?.worldBookIds).toHaveLength(3)
  expect(loadout?.regexRuleIds).toHaveLength(10)

  await page.goto('/loadouts')
  await page.getByRole('button', { name: '开始对话' }).first().click()
  await expect(page).toHaveURL(/\/chat\//)
  await expect(page.getByText('无界驿站今夜停在雾港旧码头。')).toBeVisible()
  await expect(page.getByTestId('state-card')).toBeVisible()
  await expect(
    page.getByTestId('state-card').getByText('闻灯', { exact: true }).first(),
  ).toBeVisible()
  await expect(
    page.getByTestId('state-card').getByText('周既明', { exact: true }).first(),
  ).toBeVisible()
})

test('blocks a ZIP pack without a character card', async ({ page }) => {
  const pack = zipSync({
    '预设.json': strToU8(
      JSON.stringify({
        name: '缺少角色的预设',
        temperature: 0.8,
        prompts: [{ identifier: 'main', content: '测试。' }],
        prompt_order: [{ order: [{ identifier: 'main', enabled: true }] }],
      }),
    ),
  })

  await page.goto('/import/files?pack=1')
  await page.locator('input[type="file"]').setInputFiles({
    name: '缺少角色.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(pack),
  })
  await expect(page.getByText('无法导入', { exact: true })).toBeVisible()
  await expect(page.getByText(/配套包里没有角色卡/)).toBeVisible()
  await expect(page.getByRole('button', { name: /开始导入/ })).toBeDisabled()
})

test('supports dark mode without mobile overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/settings')
  await page.getByRole('button', { name: '深色' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)

  await page.goto('/')
  await expect(page.getByRole('heading', { name: '对话', exact: true })).toBeVisible()
  const overflow = await page.evaluate(
    () =>
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
  )
  expect(overflow).toBeLessThanOrEqual(1)
})

test('uses two-level settings navigation on mobile without changing desktop', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: '设置' })).toBeVisible()

  for (const label of [
    '模型与服务',
    '生图 API',
    '角色',
    '用户身份',
    '主题',
    '预设',
    '世界书',
    '正则',
    '记忆',
    '插件',
    '设置',
  ]) {
    await expect(page.getByRole('link', { name: label, exact: true })).toBeVisible()
  }
  await expect(page.getByText('还没有保存的 API 连接')).toBeHidden()

  await page.getByRole('link', { name: '生图 API', exact: true }).click()
  await expect(page).toHaveURL(/section=images/)
  await expect(page.getByRole('heading', { name: '生图 API', level: 2 })).toBeVisible()
  await expect(page.getByLabel('Base URL')).toBeVisible()
  await page.getByRole('link', { name: '返回设置' }).click()

  await page.getByRole('link', { name: '记忆', exact: true }).click()
  await expect(page).toHaveURL(/section=memory/)
  await expect(page.getByRole('heading', { name: '记忆', level: 2 })).toBeVisible()
  await expect(page.getByText('压缩记忆')).toBeVisible()

  const sectionOverflow = await page.evaluate(
    () =>
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
  )
  expect(sectionOverflow).toBeLessThanOrEqual(1)

  await page.getByRole('link', { name: '返回设置' }).click()
  await expect(page).toHaveURL(/\/settings$/)
  await expect(page.getByRole('link', { name: '插件', exact: true })).toBeVisible()

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/settings')
  await expect(page.getByText('你的称呼', { exact: true })).toBeVisible()
  await expect(page.getByText('还没有保存的 API 连接')).toBeVisible()
})

test('captures empty baselines and imported chat screenshots', async ({ page }) => {
  test.setTimeout(60_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '对话', exact: true })).toBeVisible()
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(screenshotDir, 'home-1440.png'), fullPage: true })

  await page.goto('/characters')
  await expect(page.getByRole('heading', { name: '角色库', exact: true })).toBeVisible()
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(screenshotDir, 'characters-1440.png'), fullPage: true })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '对话', exact: true })).toBeVisible()
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(screenshotDir, 'home-390.png'), fullPage: true })
  await page.getByRole('button', { name: '打开菜单' }).click()
  await expect(page.getByRole('dialog', { name: '导航菜单' })).toBeVisible()
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(screenshotDir, 'mobile-menu-390.png') })
  await page.keyboard.press('Escape')

  await page.goto('/characters')
  await expect(page.getByRole('heading', { name: '角色库', exact: true })).toBeVisible()
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(screenshotDir, 'characters-390.png'), fullPage: true })

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/import/files')
  await expect(page.getByRole('heading', { name: '导入文件' })).toBeVisible()
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(screenshotDir, 'import-1440.png'), fullPage: true })

  await page.goto('/import')
  await expect(page.getByRole('heading', { name: '导入区' })).toBeVisible()
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(screenshotDir, 'import-area-1440.png'), fullPage: true })

  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: '设置' })).toBeVisible()
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(screenshotDir, 'settings-1440.png'), fullPage: true })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/import/files')
  await expect(page.getByRole('heading', { name: '导入文件' })).toBeVisible()
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(screenshotDir, 'import-390.png'), fullPage: true })

  await page.goto('/import')
  await expect(page.getByRole('heading', { name: '导入区' })).toBeVisible()
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(screenshotDir, 'import-area-390.png'), fullPage: true })

  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: '设置' })).toBeVisible()
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(screenshotDir, 'settings-390.png'), fullPage: true })

  await importTestCard(page)
  const character = await firstCharacter(page)
  const session = await createSeededChat(page, character.id, '测试对话', 8)

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`/chat/${session.id}`)
  await expect(page.getByText('测试对话').first()).toBeVisible()
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(screenshotDir, 'chat-1440.png') })

  await page.goto(`/chat/${session.id}/settings`)
  await expect(page.getByText('仅影响当前对话').first()).toBeVisible()
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(screenshotDir, 'chat-settings-1440.png') })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/chat/${session.id}`)
  await expect(page.getByText('测试对话').first()).toBeVisible()
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(screenshotDir, 'chat-390.png') })

  await page.goto(`/chat/${session.id}/settings`)
  await expect(page.getByText('仅影响当前对话').first()).toBeVisible()
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(screenshotDir, 'chat-settings-390.png') })
})
