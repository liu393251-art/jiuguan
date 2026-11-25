import { deleteJson, getErrorMessage, getJson, patchJson, postJson } from '@/services/http'
import { externalFetch } from '@/services/external-http'

import {
  characterSchema,
  charactersResponseSchema,
  chatGenerationContextSchema,
  chatMessageSchema,
  chatSessionSchema,
  chatsResponseSchema,
  exportResponseSchema,
  importResultSchema,
  loadoutSchema,
  loadoutsResponseSchema,
  messagesResponseSchema,
  presetSchema,
  presetsResponseSchema,
  regexRuleSchema,
  regexRulesResponseSchema,
  regenerateResponseSchema,
  sendMessageResponseSchema,
  settingsSchema,
  worldBookSchema,
  worldBooksResponseSchema,
  type ApiProfile,
  type Character,
  type CharacterInput,
  type ChatMessage,
  type ChatSession,
  type ChatSessionPatch,
  type ChatGenerationContext,
  type ImportKind,
  type ImportResult,
  type Loadout,
  type LoadoutInput,
  type Preset,
  type PresetInput,
  type RegexRule,
  type RegexRuleInput,
  type Settings,
  type SettingsPatch,
  type WorldBook,
  type WorldBookInput,
} from './types'
import {
  buildUserTurnStopSequences,
  buildContinuationMessages,
  buildPromptMessages,
  extractApiErrorMessage,
  extractCompletionFinishReason,
  extractCompletionText,
  type ChatCompletionMessage,
  type PreparedChatGeneration,
} from './lib/chat-completion'
import {
  buildCompressionChunkPrompt,
  buildCompressionMergePrompt,
  buildCompressionMergeSystemPrompt,
  buildCompressionSystemPrompt,
  chunkCompressionTranscript,
  collectCompressionTurns,
  formatCompressionTurns,
  normalizeCompressedMemory,
} from './lib/memory-compression'
import type { CompletionTransport } from './lib/stream-completion'

const successParser = { parse: () => ({ success: true as const }) }

export async function getCharacters(
  query: { search?: string; tag?: string } = {},
  signal?: AbortSignal,
) {
  const params = new URLSearchParams()
  if (query.search) params.set('q', query.search)
  if (query.tag) params.set('tag', query.tag)
  const suffix = params.size > 0 ? `?${params.toString()}` : ''
  return getJson(`/api/characters${suffix}`, charactersResponseSchema, signal)
}

export async function getCharacterTags(signal?: AbortSignal) {
  return getJson('/api/characters/tags', { parse: (input) => input as { items: string[] } }, signal)
}

export async function getCharacter(characterId: string, signal?: AbortSignal): Promise<Character> {
  return getJson(`/api/characters/${characterId}`, characterSchema, signal)
}

export async function createCharacter(input: CharacterInput): Promise<Character> {
  return postJson('/api/characters', input, characterSchema)
}

export async function updateCharacter(
  characterId: string,
  input: CharacterInput,
): Promise<Character> {
  return patchJson(`/api/characters/${characterId}`, input, characterSchema)
}

export async function deleteCharacter(characterId: string) {
  return deleteJson<{ success: true }>(`/api/characters/${characterId}`, successParser)
}

export async function getChats(search = '', signal?: AbortSignal) {
  const suffix = search ? `?q=${encodeURIComponent(search)}` : ''
  return getJson(`/api/chats${suffix}`, chatsResponseSchema, signal)
}

export async function createChat(characterId: string): Promise<ChatSession> {
  return postJson('/api/chats', { characterId }, chatSessionSchema)
}

export async function createChatFromLoadout(loadoutId: string): Promise<ChatSession> {
  return postJson('/api/chats', { loadoutId }, chatSessionSchema)
}

export async function getChat(sessionId: string, signal?: AbortSignal): Promise<ChatSession> {
  return getJson(`/api/chats/${sessionId}`, chatSessionSchema, signal)
}

export async function updateChat(sessionId: string, patch: ChatSessionPatch): Promise<ChatSession> {
  return patchJson(`/api/chats/${sessionId}`, patch, chatSessionSchema)
}

export async function deleteChat(sessionId: string) {
  return deleteJson<{ success: true }>(`/api/chats/${sessionId}`, successParser)
}

export async function bulkDeleteChats(ids: string[]) {
  return postJson(
    '/api/chats/bulk-delete',
    { ids },
    { parse: (input) => input as { success: true; removed: number } },
  )
}

export async function getMessages(
  sessionId: string,
  options: { limit?: number; before?: string } = {},
  signal?: AbortSignal,
) {
  const params = new URLSearchParams()
  params.set('limit', String(options.limit ?? 40))
  if (options.before) params.set('before', options.before)
  return getJson(
    `/api/chats/${sessionId}/messages?${params.toString()}`,
    messagesResponseSchema,
    signal,
  )
}

async function getAllChatMessages(sessionId: string, signal?: AbortSignal) {
  const pages: ChatMessage[][] = []
  let before: string | undefined
  for (let page = 0; page < 50; page += 1) {
    const response = await getMessages(sessionId, { limit: 80, before }, signal)
    if (response.items.length > 0) pages.unshift(response.items)
    if (!response.hasMore || response.items.length === 0) break
    before = response.items[0]?.id
    if (!before) break
  }
  return pages.flat()
}

export async function sendMessage(sessionId: string, content: string) {
  return postJson(`/api/chats/${sessionId}/messages`, { content }, sendMessageResponseSchema)
}

export async function updateMessage(sessionId: string, messageId: string, content: string) {
  return patchJson(`/api/chats/${sessionId}/messages/${messageId}`, { content }, chatMessageSchema)
}

export async function completeMessage(
  sessionId: string,
  messageId: string,
  content: string,
  status: 'complete' | 'stopped' | 'error',
): Promise<ChatMessage> {
  return patchJson(
    `/api/chats/${sessionId}/messages/${messageId}/complete`,
    { content, status },
    chatMessageSchema,
  )
}

export async function regenerateReply(sessionId: string) {
  return postJson(`/api/chats/${sessionId}/regenerate`, {}, regenerateResponseSchema)
}

export async function getPresets(signal?: AbortSignal) {
  return getJson('/api/presets', presetsResponseSchema, signal)
}

export async function createPreset(input: PresetInput): Promise<Preset> {
  return postJson('/api/presets', input, presetSchema)
}

export async function updatePreset(presetId: string, input: PresetInput): Promise<Preset> {
  return patchJson(`/api/presets/${presetId}`, input, presetSchema)
}

export async function deletePreset(presetId: string) {
  return deleteJson<{ success: true }>(`/api/presets/${presetId}`, successParser)
}

export async function getWorldBooks(signal?: AbortSignal) {
  return getJson('/api/worldbooks', worldBooksResponseSchema, signal)
}

export async function createWorldBook(input: WorldBookInput): Promise<WorldBook> {
  return postJson('/api/worldbooks', input, worldBookSchema)
}

export async function updateWorldBook(
  worldBookId: string,
  input: WorldBookInput,
): Promise<WorldBook> {
  return patchJson(`/api/worldbooks/${worldBookId}`, input, worldBookSchema)
}

export async function deleteWorldBook(worldBookId: string) {
  return deleteJson<{ success: true }>(`/api/worldbooks/${worldBookId}`, successParser)
}

export async function getRegexRules(signal?: AbortSignal) {
  return getJson('/api/regex-rules', regexRulesResponseSchema, signal)
}

export async function createRegexRule(input: RegexRuleInput): Promise<RegexRule> {
  return postJson('/api/regex-rules', input, regexRuleSchema)
}

export async function updateRegexRule(ruleId: string, input: RegexRuleInput): Promise<RegexRule> {
  return patchJson(`/api/regex-rules/${ruleId}`, input, regexRuleSchema)
}

export async function deleteRegexRule(ruleId: string) {
  return deleteJson<{ success: true }>(`/api/regex-rules/${ruleId}`, successParser)
}

export async function getLoadouts(signal?: AbortSignal) {
  return getJson('/api/loadouts', loadoutsResponseSchema, signal)
}

export async function createLoadout(input: LoadoutInput): Promise<Loadout> {
  return postJson('/api/loadouts', input, loadoutSchema)
}

export async function updateLoadout(loadoutId: string, input: LoadoutInput): Promise<Loadout> {
  return patchJson(`/api/loadouts/${loadoutId}`, input, loadoutSchema)
}

export async function deleteLoadout(loadoutId: string) {
  return deleteJson<{ success: true }>(`/api/loadouts/${loadoutId}`, successParser)
}

export type VectorMemoryStats = {
  total: number
  model: string
  localCount: number
  apiCount: number
  scopes: { scopeId: string; count: number }[]
}

export async function getVectorMemoryStats(signal?: AbortSignal) {
  return getJson<VectorMemoryStats>(
    '/api/vector-memories',
    {
      parse: (input) => input as VectorMemoryStats,
    },
    signal,
  )
}

export async function clearVectorMemories() {
  return deleteJson<{ success: true; removed: number }>('/api/vector-memories', {
    parse: (input) => input as { success: true; removed: number },
  })
}

export async function getSettings(signal?: AbortSignal): Promise<Settings> {
  return getJson('/api/settings', settingsSchema, signal)
}

export async function updateSettings(patch: SettingsPatch): Promise<Settings> {
  return patchJson('/api/settings', patch, settingsSchema)
}

export type ApiConnectionTestResult = {
  modelCount: number
  models: string[]
}

export async function fetchApiModels(
  profile: Pick<ApiProfile, 'baseUrl' | 'apiKey'>,
): Promise<string[]> {
  const baseUrl = profile.baseUrl.trim().replace(/\/$/, '')
  const apiKey = profile.apiKey.trim()
  if (!baseUrl) throw new Error('请先填写 Base URL。')

  let endpoint: string
  try {
    const parsed = new URL(baseUrl)
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error()
    endpoint = modelsUrl(baseUrl)
  } catch {
    throw new Error('Base URL 格式不正确，请填写以 http:// 或 https:// 开头的地址。')
  }

  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), 12_000)

  try {
    let response: Response
    try {
      response = await externalFetch(endpoint, {
        method: 'GET',
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        signal: controller.signal,
      })
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error('连接测试超时（12 秒），请检查 Base URL、网络和端口。', { cause: error })
      }
      throw error
    }
    const payload: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      const detail = extractApiErrorMessage(payload)
      if (response.status === 401) {
        throw new Error(`API Key 无效或未填写${detail ? `：${detail}` : '。'}`)
      }
      if (response.status === 403) {
        throw new Error(`接口拒绝访问${detail ? `：${detail}` : '（HTTP 403）。'}`)
      }
      if (response.status === 404) {
        throw new Error(
          `没有找到模型列表接口${detail ? `：${detail}` : '。请确认 Base URL 是否包含 /v1。'}`,
        )
      }
      if (response.status === 429) {
        throw new Error(`请求过于频繁${detail ? `：${detail}` : '（HTTP 429）。'}`)
      }
      if (response.status >= 500) {
        throw new Error(`接口服务器错误${detail ? `：${detail}` : `（HTTP ${response.status}）。`}`)
      }
      throw new Error(detail || `接口返回 HTTP ${response.status}。`)
    }

    const models =
      payload && typeof payload === 'object' && 'data' in payload && Array.isArray(payload.data)
        ? payload.data
            .map((item) =>
              item && typeof item === 'object' && 'id' in item && typeof item.id === 'string'
                ? item.id
                : '',
            )
            .filter(Boolean)
        : []

    return models.sort((left, right) => left.localeCompare(right))
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('连接测试超时（12 秒），请检查 Base URL、网络和端口。', { cause: error })
    }
    throw error instanceof Error ? error : new Error(getErrorMessage(error), { cause: error })
  } finally {
    globalThis.clearTimeout(timeout)
  }
}

function completionUrl(baseUrl: string) {
  const normalized = baseUrl.trim().replace(/\/$/, '')
  return normalized.endsWith('/chat/completions') ? normalized : `${normalized}/chat/completions`
}

function modelsUrl(baseUrl: string) {
  const normalized = baseUrl.trim().replace(/\/$/, '')
  return normalized.endsWith('/chat/completions')
    ? normalized.replace(/\/chat\/completions$/, '/models')
    : `${normalized}/models`
}

export async function getChatGenerationContext(
  sessionId: string,
  signal?: AbortSignal,
): Promise<ChatGenerationContext> {
  return getJson(`/api/chats/${sessionId}/generation-context`, chatGenerationContextSchema, signal)
}

export async function prepareChatGeneration(
  sessionId: string,
  signal?: AbortSignal,
): Promise<PreparedChatGeneration & { profile: ApiProfile }> {
  const [context, settings] = await Promise.all([
    getChatGenerationContext(sessionId, signal),
    getSettings(signal),
  ])
  const profile =
    settings.apiProfiles.find((item) => item.id === context.session.apiProfileId) ??
    settings.apiProfiles[0]

  if (!profile) {
    throw new Error('还没有配置 API 连接，请先到设置里新增一条连接并获取模型。')
  }
  if (!profile.baseUrl.trim()) {
    throw new Error(`「${profile.name}」还没有填写 Base URL。`)
  }
  if (!profile.model.trim()) {
    throw new Error(`「${profile.name}」还没有选择模型。`)
  }

  return {
    profile,
    messages: buildPromptMessages(context),
    generation: context.session.generation,
    memoryMode: context.session.memoryMode,
    outputRules: context.regexRules,
    stop: buildUserTurnStopSequences(context.identity.displayName),
  }
}

async function readResponseError(response: Response) {
  const payload: unknown = await response.json().catch(() => null)
  return extractApiErrorMessage(payload) || `接口返回 HTTP ${response.status}。`
}

export type ChatCompletionResult = {
  content: string
  finishReason: string | null
  sawDone: boolean
  invalidData: boolean
  transport: CompletionTransport
}

async function readSseCompletion(
  response: Response,
  onDelta: (delta: string) => void,
  signal?: AbortSignal,
): Promise<ChatCompletionResult> {
  if (!response.body) throw new Error('接口没有返回可读取的流式响应。')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let raw = ''
  let sawData = false
  let sawDone = false
  let invalidData = false
  let finishReason: string | null = null

  const handleEvent = (event: string) => {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).replace(/^ /, ''))
      .join('\n')
    if (!data) return
    if (data.trim() === '[DONE]') {
      sawDone = true
      return
    }
    sawData = true
    let payload: unknown
    try {
      payload = JSON.parse(data)
    } catch {
      invalidData = true
      return
    }
    const apiError = extractApiErrorMessage(payload)
    if (apiError) throw new Error(apiError)
    finishReason = extractCompletionFinishReason(payload) ?? finishReason
    const delta = extractCompletionText(payload)
    if (delta) {
      raw += delta
      onDelta(delta)
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (signal?.aborted) throw new DOMException('请求已停止。', 'AbortError')
    buffer += decoder.decode(value, { stream: true })
    let boundary = buffer.search(/\r?\n\r?\n/)
    while (boundary >= 0) {
      const event = buffer.slice(0, boundary)
      const separator = buffer.slice(boundary).match(/^\r?\n\r?\n/)?.[0] ?? '\n\n'
      buffer = buffer.slice(boundary + separator.length)
      handleEvent(event)
      boundary = buffer.search(/\r?\n\r?\n/)
    }
  }
  buffer += decoder.decode()
  if (buffer.trim()) handleEvent(buffer)

  let usedJsonFallback = false
  if (!sawData) {
    try {
      const payload: unknown = JSON.parse(buffer)
      const apiError = extractApiErrorMessage(payload)
      if (apiError) throw new Error(apiError)
      const content = extractCompletionText(payload)
      if (content) {
        usedJsonFallback = true
        finishReason = extractCompletionFinishReason(payload) ?? finishReason
        raw += content
        onDelta(content)
      }
    } catch (error) {
      if (error instanceof Error && error.message !== 'Unexpected end of JSON input') throw error
    }
  }

  if (!raw.trim()) throw new Error('接口返回成功，但没有生成任何文本。')
  return {
    content: raw,
    finishReason,
    sawDone,
    invalidData,
    transport: usedJsonFallback ? 'json' : 'sse',
  }
}

export async function streamChatCompletion(
  prepared: PreparedChatGeneration & { profile: ApiProfile },
  onDelta: (delta: string) => void,
  signal?: AbortSignal,
): Promise<ChatCompletionResult> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  }
  if (prepared.profile.apiKey.trim()) {
    headers.Authorization = `Bearer ${prepared.profile.apiKey.trim()}`
  }

  let response: Response
  try {
    response = await externalFetch(completionUrl(prepared.profile.baseUrl), {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({
        model: prepared.profile.model,
        messages: prepared.messages satisfies ChatCompletionMessage[],
        stream: true,
        temperature: prepared.generation.temperature,
        top_p: prepared.generation.topP,
        max_tokens: prepared.generation.maxTokens,
        presence_penalty: prepared.generation.presencePenalty,
        frequency_penalty: prepared.generation.frequencyPenalty,
        ...(prepared.stop.length > 0 ? { stop: prepared.stop } : {}),
      }),
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw error instanceof Error ? error : new Error(getErrorMessage(error), { cause: error })
  }

  if (!response.ok) throw new Error(await readResponseError(response))
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const payload: unknown = await response.json()
    const apiError = extractApiErrorMessage(payload)
    if (apiError) throw new Error(apiError)
    const content = extractCompletionText(payload)
    if (!content.trim()) throw new Error('接口返回成功，但没有生成任何文本。')
    onDelta(content)
    return {
      content,
      finishReason: extractCompletionFinishReason(payload),
      sawDone: false,
      invalidData: false,
      transport: 'json',
    }
  }

  return readSseCompletion(response, onDelta, signal)
}

export async function continueChatCompletion(
  prepared: PreparedChatGeneration & { profile: ApiProfile },
  partial: string,
  onDelta: (delta: string) => void,
  signal?: AbortSignal,
) {
  return streamChatCompletion(
    {
      ...prepared,
      messages: buildContinuationMessages(prepared.messages, partial),
      generation: {
        ...prepared.generation,
        maxTokens: Math.min(8192, Math.max(1800, Math.ceil(prepared.generation.maxTokens * 1.5))),
      },
    },
    onDelta,
    signal,
  )
}

export type MemoryCompressionResult = {
  summary: string
  chunkCount: number
  model: string
}

const memoryCompressionRuns = new Map<string, Promise<MemoryCompressionResult | null>>()

async function requestCompressionCompletion(
  prepared: PreparedChatGeneration & { profile: ApiProfile },
  messages: ChatCompletionMessage[],
  generation: PreparedChatGeneration['generation'],
) {
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), 90_000)
  try {
    const result = await streamChatCompletion(
      { ...prepared, messages, generation },
      () => {},
      controller.signal,
    )
    return result.content.trim()
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('记忆压缩请求超时，请稍后重试。', { cause: error })
    }
    throw error
  } finally {
    globalThis.clearTimeout(timeout)
  }
}

async function runMemoryCompression(
  sessionId: string,
  force: boolean,
): Promise<MemoryCompressionResult | null> {
  const [context, settings, messages] = await Promise.all([
    getChatGenerationContext(sessionId),
    getSettings(),
    getAllChatMessages(sessionId),
  ])
  if (!force && context.session.memoryMode !== 'compressed') return null

  const profile =
    settings.apiProfiles.find((item) => item.id === context.session.apiProfileId) ??
    settings.apiProfiles[0]
  if (!profile) {
    throw new Error('还没有配置 API 连接，无法压缩长期记忆。')
  }
  if (!profile.baseUrl.trim()) {
    throw new Error(`「${profile.name}」还没有填写 Base URL，无法压缩长期记忆。`)
  }
  if (!profile.model.trim()) {
    throw new Error(`「${profile.name}」还没有选择模型，无法压缩长期记忆。`)
  }

  const turns = collectCompressionTurns(
    messages,
    context.character.name,
    context.identity.displayName,
  )
  if (turns.length === 0) {
    throw new Error('这段对话还没有可压缩的完整消息。')
  }

  const lines = formatCompressionTurns(turns, context.character.name, context.identity.displayName)
  const chunks = chunkCompressionTranscript(lines)
  if (chunks.length === 0) {
    throw new Error('这段对话还没有可压缩的完整消息。')
  }

  const prepared: PreparedChatGeneration & { profile: ApiProfile } = {
    profile,
    messages: [],
    generation: context.session.generation,
    memoryMode: context.session.memoryMode,
    outputRules: [],
    stop: [],
  }
  const compressionGeneration = {
    temperature: 0.2,
    topP: 0.9,
    maxTokens: 900,
    presencePenalty: 0,
    frequencyPenalty: 0,
  }
  const systemPrompt = buildCompressionSystemPrompt(settings.memoryProfile.summaryPrompt)
  const partials: string[] = []
  for (const [index, chunk] of chunks.entries()) {
    const text = await requestCompressionCompletion(
      prepared,
      [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: buildCompressionChunkPrompt({
            chunk,
            index: index + 1,
            total: chunks.length,
            previousMemory: index === 0 ? context.session.memorySummary : '',
          }),
        },
      ],
      compressionGeneration,
    )
    if (!text) throw new Error('记忆压缩接口没有返回有效文本。')
    partials.push(text)
  }

  const merged =
    partials.length === 1
      ? partials[0]
      : await requestCompressionCompletion(
          prepared,
          [
            { role: 'system', content: buildCompressionMergeSystemPrompt() },
            { role: 'user', content: buildCompressionMergePrompt(partials) },
          ],
          { ...compressionGeneration, maxTokens: 1600 },
        )
  const summary = normalizeCompressedMemory(merged)
  if (!summary) throw new Error('记忆压缩接口没有返回有效文本。')

  return { summary, chunkCount: chunks.length, model: profile.model.trim() }
}

export function compressChatMemory(sessionId: string, options: { force?: boolean } = {}) {
  const running = memoryCompressionRuns.get(sessionId)
  if (running) return running
  const run = runMemoryCompression(sessionId, options.force === true).finally(() => {
    if (memoryCompressionRuns.get(sessionId) === run) memoryCompressionRuns.delete(sessionId)
  })
  memoryCompressionRuns.set(sessionId, run)
  return run
}

export async function testApiConnection(
  profile: Pick<ApiProfile, 'baseUrl' | 'apiKey'>,
): Promise<ApiConnectionTestResult> {
  const models = await fetchApiModels(profile)
  return { modelCount: models.length, models }
}

export async function importEntity(
  kind: ImportKind,
  name: string,
  payload: unknown,
): Promise<ImportResult> {
  return postJson('/api/import', { kind, name, payload }, importResultSchema)
}

export async function exportData() {
  return getJson('/api/export', exportResponseSchema)
}

export async function resetTavernData() {
  return postJson(
    '/api/reset',
    {},
    { parse: (input) => input as { success: true; characters: number; sessions: number } },
  )
}

export { getErrorMessage }
