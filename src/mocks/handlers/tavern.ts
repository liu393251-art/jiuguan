import { delay, http, HttpResponse } from 'msw'
import { z } from 'zod'

import {
  characterInputSchema,
  chatSessionPatchSchema,
  comboInputSchema,
  completeMessageInputSchema,
  defaultGeneration,
  importRequestSchema,
  loadoutInputSchema,
  memoryModeSchema,
  presetInputSchema,
  regexRuleInputSchema,
  sendMessageInputSchema,
  settingsPatchSchema,
  worldBookInputSchema,
  type ChatMessage,
  type ChatSession,
  type Character,
  type Combo,
  type ImportKind,
  type Loadout,
  type RegexRule,
  type TavernState,
  type VectorMemoryEntry,
  type WorldBook,
} from '@/features/tavern/types'
import {
  createApiVectorMemoryDrafts,
  createVectorMemoryDrafts,
  embedMemoryText,
  recallVectorMemories,
  VECTOR_RECALL_LIMIT,
} from '@/features/tavern/lib/vector-memory'
import { requestApiEmbeddings } from '@/features/tavern/lib/embedding-api'
import { BUILTIN_CHAT_REGEX_ID } from '@/features/tavern/lib/builtin-regex'
import { stripChatLayoutMarkers } from '@/features/tavern/lib/chat-layout'
import { applyRegexRules } from '@/features/tavern/lib/regex-rules'
import { stripChatArtifacts } from '@/features/tavern/lib/safe-markdown-text'
import { createUuid } from '@/lib/id'

import { readTavernState, resetTavernStore, updateTavernState } from '../mock-db'
import {
  clearVectorMemoryStore,
  countVectorMemories,
  deleteVectorMemoriesBySessionIds,
  deleteVectorMemoriesBySourceMessageIds,
  exportVectorMemories,
  hasApiVectorMemory,
  getVectorMemoryStats,
  listVectorMemorySourceIdsByScope,
  putVectorMemories,
  recallVectorMemoriesByScope,
  reassignVectorMemoryScope,
} from '../vector-memory-store'

const NOT_FOUND = { message: '没有找到对应的内容。' }
const LOADOUT_MIGRATION_KEY = 'xiaobai.tavern.loadouts-migrated.v1'
type VectorMemoryDraft = Omit<VectorMemoryEntry, 'id' | 'createdAt'>
const createChatInputSchema = z
  .object({
    characterId: z.string().min(1).optional(),
    loadoutId: z.string().min(1).optional(),
  })
  .refine((value) => Boolean(value.characterId || value.loadoutId), {
    message: '请选择一套配套。',
  })

function now() {
  return new Date().toISOString()
}

function loadoutMigrationDone() {
  return typeof window !== 'undefined' && window.localStorage.getItem(LOADOUT_MIGRATION_KEY) === '1'
}

function markLoadoutMigrationDone() {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(LOADOUT_MIGRATION_KEY, '1')
  }
}

function findCharacter(state: TavernState, characterId: string) {
  return state.characters.find((character) => character.id === characterId)
}

function findSession(state: TavernState, sessionId: string) {
  return state.sessions.find((session) => session.id === sessionId)
}

function memoryScopeId(session: ChatSession) {
  return session.loadoutId ?? session.characterId
}

function buildDefaultLoadout(state: TavernState, character: Character, timestamp: string): Loadout {
  const preset =
    state.presets.find((item) => item.id === 'preset-warm') ??
    state.presets.find((item) => item.source !== 'seed') ??
    null
  return {
    id: createUuid(),
    name: `${character.name} · 默认配套`,
    characterId: character.id,
    presetId: preset?.id ?? null,
    worldBookIds: [],
    regexRuleIds: state.regexRules
      .filter((rule) => rule.id === 'regex-stage' || rule.id === BUILTIN_CHAT_REGEX_ID)
      .map((rule) => rule.id),
    memoryMode: state.settings.memoryProfile.mode,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function ensureLoadoutRecord(state: TavernState, character: Character, timestamp: string) {
  const existing = state.loadouts.find((loadout) => loadout.characterId === character.id)
  if (existing) return existing
  const loadout = buildDefaultLoadout(state, character, timestamp)
  state.loadouts.unshift(loadout)
  return loadout
}

function comboReferencesExist(
  state: TavernState,
  payload: { presetId: string | null; regexRuleIds: string[] },
) {
  if (payload.presetId && !state.presets.some((preset) => preset.id === payload.presetId)) {
    return false
  }
  const knownRegex = new Set(state.regexRules.map((rule) => rule.id))
  return payload.regexRuleIds.every((id) => knownRegex.has(id))
}

function resolveVectorApiProfile(state: TavernState) {
  return (
    state.settings.apiProfiles.find(
      (profile) => profile.id === state.settings.memoryProfile.apiProfileId,
    ) ?? null
  )
}

function defaultApiProfileId(state: TavernState) {
  return state.settings.apiProfiles[0]?.id ?? null
}

async function indexVectorMessages(sessionId: string) {
  const snapshot = readTavernState()
  const session = findSession(snapshot, sessionId)
  if (!session || session.memoryMode !== 'vector') return

  const scopeId = memoryScopeId(session)
  const messages = (snapshot.messages[sessionId] ?? []).filter(
    (message) =>
      message.role !== 'system' &&
      stripChatLayoutMarkers(message.content).trim().length >= 4 &&
      message.status !== 'error' &&
      message.status !== 'streaming',
  )
  let existing: Set<string>
  try {
    existing = new Set(await listVectorMemorySourceIdsByScope(scopeId))
  } catch (error) {
    console.warn('读取本机向量库失败，本次跳过记忆索引。', error)
    return
  }
  const pending = messages.filter((message) => !existing.has(message.id))
  if (pending.length === 0) return

  const vectorProfile = resolveVectorApiProfile(snapshot)
  let drafts: VectorMemoryDraft[]
  if (vectorProfile?.baseUrl.trim() && vectorProfile.model.trim()) {
    try {
      const embeddings = await requestApiEmbeddings(
        vectorProfile,
        pending.map((message) => stripChatLayoutMarkers(message.content)),
      )
      drafts = createApiVectorMemoryDrafts(pending, scopeId, vectorProfile.model.trim(), embeddings)
    } catch {
      drafts = createVectorMemoryDrafts(pending, scopeId)
    }
  } else {
    drafts = createVectorMemoryDrafts(pending, scopeId)
  }

  const timestamp = now()
  const latestState = readTavernState()
  const target = findSession(latestState, sessionId)
  if (!target || target.memoryMode !== 'vector') return
  const latestMessages = new Map(
    (latestState.messages[sessionId] ?? []).map((message) => [message.id, message]),
  )
  const entries: VectorMemoryEntry[] = drafts
    .filter(
      (draft) =>
        !existing.has(draft.sourceMessageId) &&
        stripChatLayoutMarkers(latestMessages.get(draft.sourceMessageId)?.content ?? '') ===
          draft.content,
    )
    .map((draft) => ({ ...draft, id: createUuid(), createdAt: timestamp }))
  if (entries.length === 0) return

  try {
    await putVectorMemories(entries)
  } catch (error) {
    console.warn('向量记忆写入本机 IndexedDB 失败，聊天内容仍会正常保存。', error)
  }
}

function updateSessionMeta(session: ChatSession, messages: ChatMessage[]) {
  const last = messages[messages.length - 1]
  session.messageCount = messages.length
  session.lastMessagePreview = last ? messagePreview(last.role, last.content) : '还没有开始这段对话'
  session.updatedAt = now()
}

function messagePreview(role: ChatMessage['role'], content: string) {
  const label = role === 'user' ? '你' : '对方'
  const visible =
    role === 'assistant'
      ? stripChatArtifacts(stripChatLayoutMarkers(content))
      : stripChatLayoutMarkers(content)
  const text = visible.replace(/\s+/g, ' ').trim().slice(0, 42)
  return `${label}：${text || '…'}`
}

async function buildMemoryRecall(state: TavernState, session: ChatSession, query: string) {
  if (session.memoryMode !== 'vector') return ''
  const scopeId = memoryScopeId(session)
  const currentMessageIds = new Set((state.messages[session.id] ?? []).map((message) => message.id))
  const vectorProfile = resolveVectorApiProfile(state)
  const localQuery = embedMemoryText(query)
  let apiQuery: { model: string; vector: number[] } | undefined

  const apiModel = vectorProfile?.model.trim()
  if (vectorProfile && apiModel) {
    try {
      if (await hasApiVectorMemory(scopeId, apiModel)) {
        const [embedding] = await requestApiEmbeddings(vectorProfile, [query])
        if (embedding) apiQuery = { model: apiModel, vector: embedding }
      }
    } catch {
      // The local fallback vectors keep recall available when the API is offline.
    }
  }

  let recalled: { role: ChatMessage['role']; content: string }[] = []
  try {
    recalled = (
      await recallVectorMemoriesByScope(
        scopeId,
        { local: localQuery, api: apiQuery },
        {
          excludeSessionId: session.id,
          excludeSourceMessageIds: currentMessageIds,
          limit: VECTOR_RECALL_LIMIT,
        },
      )
    ).map((memory) => ({ role: memory.role, content: memory.content }))
  } catch (error) {
    console.warn('读取本机向量库失败，将退回当前消息窗口。', error)
  }

  if (recalled.length === 0) {
    const relatedSessionIds = new Set(
      state.sessions
        .filter((item) => memoryScopeId(item) === scopeId && item.id !== session.id)
        .map((item) => item.id),
    )
    const fallbackMessages = Object.entries(state.messages)
      .filter(([sessionId]) => relatedSessionIds.has(sessionId))
      .flatMap(([, messages]) => messages)
      .filter(
        (message) =>
          message.role !== 'system' && message.status !== 'error' && message.status !== 'streaming',
      )
    recalled = recallVectorMemories(fallbackMessages, query, VECTOR_RECALL_LIMIT).flatMap(
      (message) =>
        message.role === 'system' ? [] : [{ role: message.role, content: message.content }],
    )
  }

  if (recalled.length === 0) return '长期记忆里没有找到相关片段。'
  return recalled
    .map(
      (memory) =>
        `- ${memory.role === 'user' ? '用户' : '角色'}曾提到：${memory.content
          .replace(/\s+/g, ' ')
          .slice(0, 120)}`,
    )
    .join('\n')
}

function finishMessage(
  state: TavernState,
  sessionId: string,
  messageId: string,
  content: string,
  status: ChatMessage['status'],
) {
  const list = state.messages[sessionId] ?? []
  const message = list.find((item) => item.id === messageId)
  if (!message) return null
  const updated: ChatMessage = { ...message, content, status }
  state.messages[sessionId] = list.map((item) => (item.id === messageId ? updated : item))
  const target = findSession(state, sessionId)
  if (target) {
    updateSessionMeta(target, state.messages[sessionId])
    if (status === 'complete' && target.memoryMode === 'summary') {
      const lastUser = [...state.messages[sessionId]].reverse().find((item) => item.role === 'user')
      const character = findCharacter(state, target.characterId)
      if (lastUser) {
        const snippet = `最近你与${character?.name ?? '对方'}谈到：${lastUser.content.slice(0, 52)}。`
        target.memorySummary = [target.memorySummary, snippet].filter(Boolean).join(' ').slice(-240)
      }
    }
  }
  return updated
}

const characterImportSchema = characterInputSchema.extend({
  attachedWorldBook: worldBookInputSchema.optional(),
})

const regexImportSchema = z.object({
  name: z.string().min(1),
  rules: z.array(regexRuleInputSchema).min(1),
})

const packImportSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().default(''),
  character: characterImportSchema,
  preset: presetInputSchema.nullable().default(null),
  worldbooks: z.array(worldBookInputSchema).max(24).default([]),
  regexRules: z.array(regexRuleInputSchema).max(160).default([]),
  memoryMode: memoryModeSchema.optional(),
})

export const tavernHandlers = [
  http.get('/api/characters', async ({ request }) => {
    await delay(260)
    const url = new URL(request.url)
    const search = (url.searchParams.get('q') ?? '').trim().toLowerCase()
    const tag = (url.searchParams.get('tag') ?? '').trim()
    const items = readTavernState()
      .characters.filter((character) => {
        if (tag && !character.tags.includes(tag)) return false
        if (!search) return true
        return [character.name, character.tagline, character.description, ...character.tags].some(
          (value) => value.toLowerCase().includes(search),
        )
      })
      .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
    return HttpResponse.json({ items })
  }),

  http.get('/api/characters/tags', async () => {
    await delay(120)
    const tags = Array.from(
      new Set(readTavernState().characters.flatMap((character) => character.tags)),
    )
    return HttpResponse.json({ items: tags })
  }),

  http.get('/api/characters/:id', async ({ params }) => {
    await delay(200)
    const character = findCharacter(readTavernState(), String(params.id))
    return character ? HttpResponse.json(character) : HttpResponse.json(NOT_FOUND, { status: 404 })
  }),

  http.post('/api/characters', async ({ request }) => {
    await delay(420)
    try {
      const payload = characterInputSchema.parse(await request.json())
      const character: Character = {
        ...payload,
        id: createUuid(),
        source: 'user',
        createdAt: now(),
        updatedAt: now(),
      }
      updateTavernState((state) => {
        state.characters.unshift(character)
      })
      return HttpResponse.json(character, { status: 201 })
    } catch {
      return HttpResponse.json({ message: '角色资料不完整，请检查名称和开场白。' }, { status: 422 })
    }
  }),

  http.patch('/api/characters/:id', async ({ params, request }) => {
    await delay(320)
    const characterId = String(params.id)
    try {
      const payload = characterInputSchema.parse(await request.json())
      const existing = findCharacter(readTavernState(), characterId)
      if (!existing) return HttpResponse.json(NOT_FOUND, { status: 404 })
      const updated: Character = { ...existing, ...payload, updatedAt: now() }
      updateTavernState((state) => {
        state.characters = state.characters.map((character) =>
          character.id === characterId ? updated : character,
        )
      })
      return HttpResponse.json(updated)
    } catch {
      return HttpResponse.json({ message: '角色资料格式不正确。' }, { status: 422 })
    }
  }),

  http.delete('/api/characters/:id', async ({ params }) => {
    await delay(260)
    const characterId = String(params.id)
    const state = readTavernState()
    if (!findCharacter(state, characterId)) {
      return HttpResponse.json(NOT_FOUND, { status: 404 })
    }
    const sessionIds = state.sessions
      .filter((session) => session.characterId === characterId)
      .map((session) => session.id)
    updateTavernState((current) => {
      current.characters = current.characters.filter((character) => character.id !== characterId)
      current.loadouts = current.loadouts.filter((loadout) => loadout.characterId !== characterId)
      current.sessions = current.sessions.filter((session) => session.characterId !== characterId)
      sessionIds.forEach((id) => delete current.messages[id])
    })
    try {
      await deleteVectorMemoriesBySessionIds(sessionIds)
    } catch (error) {
      console.warn('角色已删除，但对应的向量记忆清理失败。', error)
    }
    return HttpResponse.json({ success: true, removedSessions: sessionIds.length })
  }),

  http.get('/api/chats', async ({ request }) => {
    await delay(280)
    const search = (new URL(request.url).searchParams.get('q') ?? '').trim().toLowerCase()
    const state = readTavernState()
    const items = state.sessions
      .filter((session) => {
        if (!search) return true
        const character = findCharacter(state, session.characterId)
        return [session.title, session.lastMessagePreview, character?.name ?? ''].some((value) =>
          value.toLowerCase().includes(search),
        )
      })
      .sort(
        (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
      )
    return HttpResponse.json({ items })
  }),

  http.post('/api/chats', async ({ request }) => {
    await delay(360)
    try {
      const payload = createChatInputSchema.parse(await request.json())
      const state = readTavernState()
      const createdAtValue = now()
      let loadout = payload.loadoutId
        ? state.loadouts.find((item) => item.id === payload.loadoutId)
        : undefined
      if (!loadout && payload.characterId) {
        const character = findCharacter(state, payload.characterId)
        if (!character) return HttpResponse.json(NOT_FOUND, { status: 404 })
        loadout = ensureLoadoutRecord(state, character, createdAtValue)
      }
      if (!loadout) return HttpResponse.json(NOT_FOUND, { status: 404 })
      const activeLoadout = loadout
      const character = findCharacter(state, activeLoadout.characterId)
      if (!character) return HttpResponse.json(NOT_FOUND, { status: 404 })
      const preset = activeLoadout.presetId
        ? state.presets.find((item) => item.id === activeLoadout.presetId)
        : null
      const firstMessage: ChatMessage | null = character.firstMessage.trim()
        ? {
            id: createUuid(),
            sessionId: '',
            role: 'assistant',
            content: character.firstMessage,
            status: 'complete',
            createdAt: createdAtValue,
          }
        : null
      const session: ChatSession = {
        id: createUuid(),
        title: activeLoadout.name,
        loadoutId: activeLoadout.id,
        characterId: character.id,
        apiProfileId: defaultApiProfileId(state),
        presetId: activeLoadout.presetId,
        worldBookIds: [...activeLoadout.worldBookIds],
        regexRuleIds: [...activeLoadout.regexRuleIds],
        memoryProfileId: state.settings.memoryProfile.id,
        memoryMode: activeLoadout.memoryMode,
        memorySummary: '',
        generation: preset ? { ...preset.generation } : { ...defaultGeneration },
        fontSize: state.settings.appearance.defaultChatFontSize,
        lastMessagePreview: firstMessage ? messagePreview('assistant', character.firstMessage) : '',
        messageCount: firstMessage ? 1 : 0,
        createdAt: createdAtValue,
        updatedAt: createdAtValue,
      }
      if (firstMessage) firstMessage.sessionId = session.id
      updateTavernState((current) => {
        if (!current.loadouts.some((item) => item.id === activeLoadout.id)) {
          current.loadouts.unshift(activeLoadout)
        }
        current.sessions.unshift(session)
        current.messages[session.id] = firstMessage ? [firstMessage] : []
      })
      if (firstMessage) await indexVectorMessages(session.id)
      return HttpResponse.json(session, { status: 201 })
    } catch {
      return HttpResponse.json({ message: '无法创建对话，请重新选择配套。' }, { status: 422 })
    }
  }),

  http.post('/api/test/chats', async ({ request }) => {
    await delay(80)
    try {
      const payload = z
        .object({
          characterId: z.string().min(1),
          title: z.string().min(1).max(60),
          messages: z
            .array(
              z.object({
                role: z.enum(['user', 'assistant']),
                content: z.string().min(1),
              }),
            )
            .min(1)
            .max(80),
        })
        .parse(await request.json())
      const state = readTavernState()
      const character = findCharacter(state, payload.characterId)
      if (!character) return HttpResponse.json(NOT_FOUND, { status: 404 })

      const sessionId = createUuid()
      const timestamp = now()
      const startedAt = Date.parse(timestamp)
      const messages: ChatMessage[] = payload.messages.map((message, index) => ({
        id: createUuid(),
        sessionId,
        role: message.role,
        content: message.content,
        status: 'complete',
        createdAt: new Date(startedAt + index * 1000).toISOString(),
      }))
      const last = messages[messages.length - 1]
      const session: ChatSession = {
        id: sessionId,
        title: payload.title,
        loadoutId: null,
        characterId: character.id,
        apiProfileId: defaultApiProfileId(state),
        presetId: null,
        worldBookIds: [],
        regexRuleIds: [],
        memoryProfileId: state.settings.memoryProfile.id,
        memoryMode: state.settings.memoryProfile.mode,
        memorySummary: '',
        generation: { ...defaultGeneration },
        fontSize: state.settings.appearance.defaultChatFontSize,
        lastMessagePreview: messagePreview(last.role, last.content),
        messageCount: messages.length,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      updateTavernState((current) => {
        current.sessions.unshift(session)
        current.messages[session.id] = messages
      })
      await indexVectorMessages(session.id)
      return HttpResponse.json(session, { status: 201 })
    } catch {
      return HttpResponse.json({ message: '测试对话数据格式不正确。' }, { status: 422 })
    }
  }),

  http.post('/api/chats/bulk-delete', async ({ request }) => {
    await delay(340)
    try {
      const payload = z.object({ ids: z.array(z.string()).min(1) }).parse(await request.json())
      updateTavernState((state) => {
        state.sessions = state.sessions.filter((session) => !payload.ids.includes(session.id))
        payload.ids.forEach((id) => delete state.messages[id])
      })
      try {
        await deleteVectorMemoriesBySessionIds(payload.ids)
      } catch (error) {
        console.warn('对话已删除，但对应的向量记忆清理失败。', error)
      }
      return HttpResponse.json({ success: true, removed: payload.ids.length })
    } catch {
      return HttpResponse.json({ message: '没有选中可删除的对话。' }, { status: 422 })
    }
  }),

  http.get('/api/chats/:id', async ({ params }) => {
    await delay(210)
    const session = findSession(readTavernState(), String(params.id))
    return session ? HttpResponse.json(session) : HttpResponse.json(NOT_FOUND, { status: 404 })
  }),

  http.patch('/api/chats/:id', async ({ params, request }) => {
    await delay(300)
    const sessionId = String(params.id)
    try {
      const payload = chatSessionPatchSchema.parse(await request.json())
      const existing = findSession(readTavernState(), sessionId)
      if (!existing) return HttpResponse.json(NOT_FOUND, { status: 404 })
      const updated: ChatSession = { ...existing, ...payload, updatedAt: now() }
      updateTavernState((state) => {
        state.sessions = state.sessions.map((session) =>
          session.id === sessionId ? updated : session,
        )
      })
      if (updated.memoryMode === 'vector') await indexVectorMessages(sessionId)
      return HttpResponse.json(updated)
    } catch {
      return HttpResponse.json({ message: '对话设置格式不正确。' }, { status: 422 })
    }
  }),

  http.delete('/api/chats/:id', async ({ params }) => {
    await delay(260)
    const sessionId = String(params.id)
    if (!findSession(readTavernState(), sessionId)) {
      return HttpResponse.json(NOT_FOUND, { status: 404 })
    }
    updateTavernState((state) => {
      state.sessions = state.sessions.filter((session) => session.id !== sessionId)
      delete state.messages[sessionId]
    })
    try {
      await deleteVectorMemoriesBySessionIds([sessionId])
    } catch (error) {
      console.warn('对话已删除，但对应的向量记忆清理失败。', error)
    }
    return HttpResponse.json({ success: true })
  }),

  http.get('/api/chats/:id/messages', async ({ params, request }) => {
    await delay(240)
    const sessionId = String(params.id)
    const url = new URL(request.url)
    const limit = Math.min(80, Math.max(10, Number(url.searchParams.get('limit') ?? 40) || 40))
    const before = url.searchParams.get('before')
    const all = readTavernState().messages[sessionId] ?? []
    const endIndex = before ? all.findIndex((message) => message.id === before) : all.length
    const safeEnd = endIndex < 0 ? all.length : endIndex
    const startIndex = Math.max(0, safeEnd - limit)
    return HttpResponse.json({
      items: all.slice(startIndex, safeEnd),
      hasMore: startIndex > 0,
    })
  }),

  http.post('/api/chats/:id/messages', async ({ params, request }) => {
    await delay(380)
    const sessionId = String(params.id)
    try {
      const payload = sendMessageInputSchema.parse(await request.json())
      const state = readTavernState()
      const session = findSession(state, sessionId)
      if (!session) return HttpResponse.json(NOT_FOUND, { status: 404 })
      const activeRules = state.regexRules.filter((rule) => session.regexRuleIds.includes(rule.id))
      const content = applyRegexRules(payload.content, activeRules, 'input').trim()
      if (!content) {
        return HttpResponse.json({ message: '消息经正则处理后为空。' }, { status: 422 })
      }
      const createdAtValue = now()
      const userMessage: ChatMessage = {
        id: createUuid(),
        sessionId,
        role: 'user',
        content,
        status: 'complete',
        createdAt: createdAtValue,
      }
      const assistantMessage: ChatMessage = {
        id: createUuid(),
        sessionId,
        role: 'assistant',
        content: '',
        status: 'streaming',
        createdAt: new Date(Date.now() + 1).toISOString(),
      }
      updateTavernState((current) => {
        const messages = current.messages[sessionId] ?? []
        messages.push(userMessage, assistantMessage)
        current.messages[sessionId] = messages
        const target = findSession(current, sessionId)
        if (target) updateSessionMeta(target, messages)
      })
      return HttpResponse.json({ userMessage, assistantMessage }, { status: 201 })
    } catch {
      return HttpResponse.json({ message: '消息发送失败，请检查内容。' }, { status: 422 })
    }
  }),

  http.get('/api/chats/:id/generation-context', async ({ params }) => {
    await delay(120)
    const sessionId = String(params.id)
    let state = readTavernState()
    let session = findSession(state, sessionId)
    if (session?.memoryMode === 'vector') {
      await indexVectorMessages(sessionId)
      state = readTavernState()
      session = findSession(state, sessionId)
    }
    const character = session ? findCharacter(state, session.characterId) : undefined
    if (!session || !character) {
      return HttpResponse.json(NOT_FOUND, { status: 404 })
    }
    const preset = session.presetId
      ? (state.presets.find((item) => item.id === session.presetId) ?? null)
      : null
    const worldBooks = session.worldBookIds
      .map((id) => state.worldBooks.find((book) => book.id === id))
      .filter((book): book is WorldBook => Boolean(book))
    const regexRules = session.regexRuleIds
      .map((id) => state.regexRules.find((rule) => rule.id === id))
      .filter((rule): rule is RegexRule => Boolean(rule))
    const allMessages = (state.messages[sessionId] ?? []).filter(
      (message) =>
        message.content.trim() && message.status !== 'error' && message.status !== 'streaming',
    )
    const messages =
      session.memoryMode === 'vector'
        ? allMessages
        : allMessages.slice(-Math.max(4, state.settings.memoryProfile.maxMessages))
    const lastUser = [...allMessages].reverse().find((message) => message.role === 'user')
    const memoryRecall = await buildMemoryRecall(state, session, lastUser?.content ?? '')

    return HttpResponse.json({
      session,
      character,
      preset,
      worldBooks,
      regexRules,
      identity: state.settings.identity,
      memoryProfile: state.settings.memoryProfile,
      messages,
      memoryRecall,
    })
  }),

  http.patch('/api/chats/:id/messages/:messageId/complete', async ({ params, request }) => {
    await delay(120)
    const sessionId = String(params.id)
    const messageId = String(params.messageId)
    try {
      const payload = completeMessageInputSchema.parse(await request.json())
      let updated: ChatMessage | null = null
      updateTavernState((current) => {
        updated = finishMessage(current, sessionId, messageId, payload.content, payload.status)
      })
      if (updated) {
        try {
          await deleteVectorMemoriesBySourceMessageIds([messageId])
        } catch (error) {
          console.warn('旧向量记忆清理失败，将尝试用最新内容覆盖。', error)
        }
        await indexVectorMessages(sessionId)
      }
      return updated ? HttpResponse.json(updated) : HttpResponse.json(NOT_FOUND, { status: 404 })
    } catch (error) {
      console.error('保存回复状态失败。', error)
      return HttpResponse.json({ message: '回复状态没有保存。' }, { status: 422 })
    }
  }),

  http.patch('/api/chats/:id/messages/:messageId', async ({ params, request }) => {
    await delay(220)
    const sessionId = String(params.id)
    const messageId = String(params.messageId)
    try {
      const payload = z.object({ content: z.string().trim().min(1) }).parse(await request.json())
      const message = readTavernState().messages[sessionId]?.find((item) => item.id === messageId)
      if (!message) return HttpResponse.json(NOT_FOUND, { status: 404 })
      const updated: ChatMessage = { ...message, content: payload.content }
      updateTavernState((state) => {
        const list = state.messages[sessionId] ?? []
        state.messages[sessionId] = list.map((item) => (item.id === messageId ? updated : item))
        const target = findSession(state, sessionId)
        if (target) {
          updateSessionMeta(target, state.messages[sessionId])
        }
      })
      try {
        await deleteVectorMemoriesBySourceMessageIds([messageId])
      } catch (error) {
        console.warn('旧向量记忆清理失败，将尝试用最新内容覆盖。', error)
      }
      await indexVectorMessages(sessionId)
      return HttpResponse.json(updated)
    } catch {
      return HttpResponse.json({ message: '消息内容不能为空。' }, { status: 422 })
    }
  }),

  http.post('/api/chats/:id/regenerate', async ({ params }) => {
    await delay(240)
    const sessionId = String(params.id)
    const state = readTavernState()
    const session = findSession(state, sessionId)
    const messages = state.messages[sessionId] ?? []
    const lastAssistant = [...messages].reverse().find((message) => message.role === 'assistant')
    if (!session || !lastAssistant) {
      return HttpResponse.json({ message: '还没有可以重试的回复。' }, { status: 404 })
    }
    const assistantMessage: ChatMessage = {
      id: createUuid(),
      sessionId,
      role: 'assistant',
      content: '',
      status: 'streaming',
      createdAt: now(),
    }
    updateTavernState((current) => {
      const list = (current.messages[sessionId] ?? []).filter(
        (item) => item.id !== lastAssistant.id,
      )
      list.push(assistantMessage)
      current.messages[sessionId] = list
      const target = findSession(current, sessionId)
      if (target) updateSessionMeta(target, list)
    })
    try {
      await deleteVectorMemoriesBySourceMessageIds([lastAssistant.id])
    } catch (error) {
      console.warn('旧回复的向量记忆清理失败。', error)
    }
    return HttpResponse.json({ assistantMessage, removedMessageId: lastAssistant.id })
  }),

  http.get('/api/loadouts', async () => {
    await delay(180)
    const state = readTavernState()
    const missing = loadoutMigrationDone()
      ? []
      : state.characters.filter(
          (character) => !state.loadouts.some((loadout) => loadout.characterId === character.id),
        )
    if (missing.length > 0) {
      const timestamp = now()
      const created = missing.map((character) => buildDefaultLoadout(state, character, timestamp))
      updateTavernState((current) => {
        const known = new Set(current.loadouts.map((loadout) => loadout.characterId))
        current.loadouts.unshift(...created.filter((loadout) => !known.has(loadout.characterId)))
      })
      markLoadoutMigrationDone()
      return HttpResponse.json({ items: readTavernState().loadouts })
    }
    if (!loadoutMigrationDone()) markLoadoutMigrationDone()
    return HttpResponse.json({ items: state.loadouts })
  }),

  http.post('/api/loadouts', async ({ request }) => {
    await delay(320)
    try {
      const payload = loadoutInputSchema.parse(await request.json())
      const character = findCharacter(readTavernState(), payload.characterId)
      if (!character) return HttpResponse.json(NOT_FOUND, { status: 404 })
      const timestamp = now()
      const loadout: Loadout = {
        ...payload,
        id: createUuid(),
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      updateTavernState((state) => {
        state.loadouts.unshift(loadout)
      })
      markLoadoutMigrationDone()
      return HttpResponse.json(loadout, { status: 201 })
    } catch {
      return HttpResponse.json({ message: '配套信息不完整，请检查名称和角色卡。' }, { status: 422 })
    }
  }),

  http.patch('/api/loadouts/:id', async ({ params, request }) => {
    await delay(280)
    const loadoutId = String(params.id)
    try {
      const payload = loadoutInputSchema.parse(await request.json())
      const state = readTavernState()
      const existing = state.loadouts.find((loadout) => loadout.id === loadoutId)
      if (!existing) return HttpResponse.json(NOT_FOUND, { status: 404 })
      if (!findCharacter(state, payload.characterId)) {
        return HttpResponse.json(NOT_FOUND, { status: 404 })
      }
      const updated: Loadout = { ...existing, ...payload, updatedAt: now() }
      updateTavernState((current) => {
        current.loadouts = current.loadouts.map((loadout) =>
          loadout.id === loadoutId ? updated : loadout,
        )
      })
      markLoadoutMigrationDone()
      return HttpResponse.json(updated)
    } catch {
      return HttpResponse.json({ message: '配套格式不正确。' }, { status: 422 })
    }
  }),

  http.delete('/api/loadouts/:id', async ({ params }) => {
    await delay(240)
    const loadoutId = String(params.id)
    const affectedSessions = readTavernState().sessions.filter(
      (session) => session.loadoutId === loadoutId,
    )
    const characterBySession = new Map(
      affectedSessions.map((session) => [session.id, session.characterId]),
    )
    updateTavernState((state) => {
      state.sessions = state.sessions.map((session) =>
        session.loadoutId === loadoutId ? { ...session, loadoutId: null } : session,
      )
      state.loadouts = state.loadouts.filter((loadout) => loadout.id !== loadoutId)
    })
    try {
      await reassignVectorMemoryScope(loadoutId, characterBySession)
    } catch (error) {
      console.warn('配套已删除，但对应的向量记忆迁移失败。', error)
    }
    markLoadoutMigrationDone()
    return HttpResponse.json({ success: true })
  }),

  http.get('/api/combos', async () => {
    await delay(180)
    return HttpResponse.json({ items: readTavernState().combos })
  }),

  http.post('/api/combos', async ({ request }) => {
    await delay(320)
    try {
      const payload = comboInputSchema.parse(await request.json())
      const state = readTavernState()
      if (!comboReferencesExist(state, payload)) {
        return HttpResponse.json({ message: '组合引用的预设或正则已不存在。' }, { status: 422 })
      }
      const timestamp = now()
      const combo: Combo = {
        ...payload,
        id: createUuid(),
        coverImage: null,
        source: 'user',
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      updateTavernState((current) => {
        current.combos.unshift(combo)
      })
      return HttpResponse.json(combo, { status: 201 })
    } catch {
      return HttpResponse.json({ message: '组合信息不完整，至少选择预设或正则。' }, { status: 422 })
    }
  }),

  http.patch('/api/combos/:id', async ({ params, request }) => {
    await delay(280)
    try {
      const payload = comboInputSchema.parse(await request.json())
      const comboId = String(params.id)
      const state = readTavernState()
      const existing = state.combos.find((combo) => combo.id === comboId)
      if (!existing) return HttpResponse.json(NOT_FOUND, { status: 404 })
      if (!comboReferencesExist(state, payload)) {
        return HttpResponse.json({ message: '组合引用的预设或正则已不存在。' }, { status: 422 })
      }
      const updated: Combo = { ...existing, ...payload, updatedAt: now() }
      updateTavernState((current) => {
        current.combos = current.combos.map((combo) => (combo.id === comboId ? updated : combo))
      })
      return HttpResponse.json(updated)
    } catch {
      return HttpResponse.json({ message: '组合信息不完整，至少选择预设或正则。' }, { status: 422 })
    }
  }),

  http.delete('/api/combos/:id', async ({ params }) => {
    await delay(220)
    const comboId = String(params.id)
    updateTavernState((state) => {
      state.combos = state.combos.filter((combo) => combo.id !== comboId)
    })
    return HttpResponse.json({ success: true })
  }),

  http.get('/api/presets', async () => {
    await delay(180)
    return HttpResponse.json({ items: readTavernState().presets })
  }),

  http.post('/api/presets', async ({ request }) => {
    await delay(320)
    try {
      const payload = presetInputSchema.parse(await request.json())
      const preset = { ...payload, id: createUuid(), source: 'user' as const, createdAt: now() }
      updateTavernState((state) => {
        state.presets.unshift(preset)
      })
      return HttpResponse.json(preset, { status: 201 })
    } catch {
      return HttpResponse.json({ message: '预设信息不完整。' }, { status: 422 })
    }
  }),

  http.patch('/api/presets/:id', async ({ params, request }) => {
    await delay(260)
    try {
      const payload = presetInputSchema.parse(await request.json())
      const id = String(params.id)
      const existing = readTavernState().presets.find((preset) => preset.id === id)
      if (!existing) return HttpResponse.json(NOT_FOUND, { status: 404 })
      const updated = { ...existing, ...payload }
      updateTavernState((state) => {
        state.presets = state.presets.map((preset) => (preset.id === id ? updated : preset))
      })
      return HttpResponse.json(updated)
    } catch {
      return HttpResponse.json({ message: '预设格式不正确。' }, { status: 422 })
    }
  }),

  http.delete('/api/presets/:id', async ({ params }) => {
    await delay(220)
    const id = String(params.id)
    const timestamp = now()
    updateTavernState((state) => {
      state.presets = state.presets.filter((preset) => preset.id !== id)
      state.sessions = state.sessions.map((session) =>
        session.presetId === id ? { ...session, presetId: null } : session,
      )
      state.combos = state.combos.map((combo) =>
        combo.presetId === id ? { ...combo, presetId: null, updatedAt: timestamp } : combo,
      )
    })
    return HttpResponse.json({ success: true })
  }),

  http.get('/api/worldbooks', async () => {
    await delay(180)
    return HttpResponse.json({ items: readTavernState().worldBooks })
  }),

  http.post('/api/worldbooks', async ({ request }) => {
    await delay(340)
    try {
      const payload = worldBookInputSchema.parse(await request.json())
      const worldBook: WorldBook = {
        ...payload,
        id: createUuid(),
        source: 'user',
        createdAt: now(),
        entries: payload.entries.map((entry) => ({ ...entry, id: createUuid() })),
      }
      updateTavernState((state) => {
        state.worldBooks.unshift(worldBook)
      })
      return HttpResponse.json(worldBook, { status: 201 })
    } catch {
      return HttpResponse.json({ message: '世界书需要至少一个完整条目。' }, { status: 422 })
    }
  }),

  http.patch('/api/worldbooks/:id', async ({ params, request }) => {
    await delay(280)
    try {
      const payload = worldBookInputSchema.parse(await request.json())
      const id = String(params.id)
      const existing = readTavernState().worldBooks.find((book) => book.id === id)
      if (!existing) return HttpResponse.json(NOT_FOUND, { status: 404 })
      const updated: WorldBook = {
        ...existing,
        ...payload,
        entries: payload.entries.map((entry) => ({ ...entry, id: createUuid() })),
      }
      updateTavernState((state) => {
        state.worldBooks = state.worldBooks.map((book) => (book.id === id ? updated : book))
      })
      return HttpResponse.json(updated)
    } catch {
      return HttpResponse.json({ message: '世界书格式不正确。' }, { status: 422 })
    }
  }),

  http.delete('/api/worldbooks/:id', async ({ params }) => {
    await delay(220)
    const id = String(params.id)
    updateTavernState((state) => {
      state.worldBooks = state.worldBooks.filter((book) => book.id !== id)
      state.sessions = state.sessions.map((session) => ({
        ...session,
        worldBookIds: session.worldBookIds.filter((bookId) => bookId !== id),
      }))
    })
    return HttpResponse.json({ success: true })
  }),

  http.get('/api/regex-rules', async () => {
    await delay(180)
    return HttpResponse.json({ items: readTavernState().regexRules })
  }),

  http.post('/api/regex-rules', async ({ request }) => {
    await delay(300)
    try {
      const payload = regexRuleInputSchema.parse(await request.json())
      const rule: RegexRule = { ...payload, id: createUuid(), packId: null, packName: null }
      updateTavernState((state) => {
        state.regexRules.unshift(rule)
      })
      return HttpResponse.json(rule, { status: 201 })
    } catch {
      return HttpResponse.json({ message: '正则规则不完整。' }, { status: 422 })
    }
  }),

  http.patch('/api/regex-rules/:id', async ({ params, request }) => {
    await delay(260)
    try {
      const payload = regexRuleInputSchema.parse(await request.json())
      const id = String(params.id)
      const existing = readTavernState().regexRules.find((rule) => rule.id === id)
      if (!existing) return HttpResponse.json(NOT_FOUND, { status: 404 })
      const updated: RegexRule = { ...existing, ...payload }
      updateTavernState((state) => {
        state.regexRules = state.regexRules.map((rule) => (rule.id === id ? updated : rule))
      })
      return HttpResponse.json(updated)
    } catch {
      return HttpResponse.json({ message: '正则规则格式不正确。' }, { status: 422 })
    }
  }),

  http.delete('/api/regex-rules/:id', async ({ params }) => {
    await delay(220)
    const id = String(params.id)
    const timestamp = now()
    updateTavernState((state) => {
      state.regexRules = state.regexRules.filter((rule) => rule.id !== id)
      state.sessions = state.sessions.map((session) => ({
        ...session,
        regexRuleIds: session.regexRuleIds.filter((ruleId) => ruleId !== id),
      }))
      state.combos = state.combos.map((combo) =>
        combo.regexRuleIds.includes(id)
          ? {
              ...combo,
              regexRuleIds: combo.regexRuleIds.filter((ruleId) => ruleId !== id),
              updatedAt: timestamp,
            }
          : combo,
      )
    })
    return HttpResponse.json({ success: true })
  }),

  http.get('/api/vector-memories', async () => {
    await delay(140)
    try {
      return HttpResponse.json(await getVectorMemoryStats())
    } catch (error) {
      return HttpResponse.json(
        { message: error instanceof Error ? error.message : '读取本机向量库失败。' },
        { status: 500 },
      )
    }
  }),

  http.delete('/api/vector-memories', async () => {
    await delay(200)
    try {
      const removed = await countVectorMemories()
      await clearVectorMemoryStore()
      return HttpResponse.json({ success: true, removed })
    } catch (error) {
      return HttpResponse.json(
        { message: error instanceof Error ? error.message : '清空本机向量库失败。' },
        { status: 500 },
      )
    }
  }),

  http.get('/api/settings', async () => {
    await delay(200)
    return HttpResponse.json(readTavernState().settings)
  }),

  http.patch('/api/settings', async ({ request }) => {
    await delay(320)
    try {
      const payload = settingsPatchSchema.parse(await request.json())
      updateTavernState((state) => {
        state.settings = { ...state.settings, ...payload }
        const profileIds = new Set(state.settings.apiProfiles.map((profile) => profile.id))
        if (
          state.settings.memoryProfile.apiProfileId &&
          !profileIds.has(state.settings.memoryProfile.apiProfileId)
        ) {
          state.settings.memoryProfile = { ...state.settings.memoryProfile, apiProfileId: null }
        }
        state.sessions = state.sessions.map((session) =>
          session.apiProfileId && !profileIds.has(session.apiProfileId)
            ? { ...session, apiProfileId: null }
            : session,
        )
      })
      return HttpResponse.json(readTavernState().settings)
    } catch {
      return HttpResponse.json({ message: '设置内容格式不正确。' }, { status: 422 })
    }
  }),

  http.post('/api/import', async ({ request }) => {
    await delay(420)
    let requestedKind: ImportKind = 'character'
    try {
      const payload = importRequestSchema.parse(await request.json())
      requestedKind = payload.kind
      const timestamp = now()

      if (payload.kind === 'pack') {
        const parsed = packImportSchema.parse(payload.payload)
        const { attachedWorldBook, ...characterInput } = parsed.character
        const character: Character = {
          ...characterInput,
          id: createUuid(),
          source: 'import',
          createdAt: timestamp,
          updatedAt: timestamp,
        }
        const attachedBook: WorldBook | null = attachedWorldBook
          ? {
              ...attachedWorldBook,
              id: createUuid(),
              source: 'import',
              createdAt: timestamp,
              entries: attachedWorldBook.entries.map((entry) => ({ ...entry, id: createUuid() })),
            }
          : null
        const worldBooks: WorldBook[] = parsed.worldbooks.map((book) => ({
          ...book,
          id: createUuid(),
          source: 'import',
          createdAt: timestamp,
          entries: book.entries.map((entry) => ({ ...entry, id: createUuid() })),
        }))
        const preset = parsed.preset
          ? {
              ...parsed.preset,
              id: createUuid(),
              source: 'import' as const,
              createdAt: timestamp,
            }
          : null
        const regexPackId = `regex-pack-${createUuid()}`
        const regexRules: RegexRule[] = parsed.regexRules.map((rule) => ({
          ...rule,
          id: createUuid(),
          packId: regexPackId,
          packName: parsed.name,
        }))
        const worldBookIds = [
          ...new Set([
            ...(attachedBook ? [attachedBook.id] : []),
            ...worldBooks.map((book) => book.id),
          ]),
        ]
        const loadout: Loadout = {
          id: createUuid(),
          name: parsed.name,
          characterId: character.id,
          presetId: preset?.id ?? null,
          worldBookIds,
          regexRuleIds: [...new Set([BUILTIN_CHAT_REGEX_ID, ...regexRules.map((rule) => rule.id)])],
          memoryMode: parsed.memoryMode ?? readTavernState().settings.memoryProfile.mode,
          createdAt: timestamp,
          updatedAt: timestamp,
        }

        updateTavernState((current) => {
          current.characters.unshift(character)
          if (attachedBook) current.worldBooks.unshift(attachedBook)
          if (worldBooks.length > 0) current.worldBooks.unshift(...worldBooks)
          if (preset) current.presets.unshift(preset)
          if (regexRules.length > 0) current.regexRules.unshift(...regexRules)
          current.loadouts.unshift(loadout)
        })

        return HttpResponse.json({
          ok: true,
          kind: 'pack',
          name: parsed.name,
          id: loadout.id,
          loadoutId: loadout.id,
          message: `配套已导入：角色 1、世界书 ${worldBookIds.length}、预设 ${
            preset ? 1 : 0
          }、正则 ${regexRules.length} 条`,
          count: 1 + worldBookIds.length + (preset ? 1 : 0) + regexRules.length,
        })
      }

      if (payload.kind === 'character') {
        const parsed = characterImportSchema.parse(payload.payload)
        const { attachedWorldBook, ...input } = parsed
        const character: Character = {
          ...input,
          id: createUuid(),
          source: 'import',
          createdAt: timestamp,
          updatedAt: timestamp,
        }
        const attachedBook: WorldBook | null = attachedWorldBook
          ? {
              ...attachedWorldBook,
              id: createUuid(),
              source: 'import',
              createdAt: timestamp,
              entries: attachedWorldBook.entries.map((entry) => ({ ...entry, id: createUuid() })),
            }
          : null
        const loadout = buildDefaultLoadout(readTavernState(), character, timestamp)
        if (attachedBook) loadout.worldBookIds = [attachedBook.id]
        updateTavernState((current) => {
          current.characters.unshift(character)
          if (attachedBook) current.worldBooks.unshift(attachedBook)
          current.loadouts.unshift(loadout)
        })
        return HttpResponse.json({
          ok: true,
          kind: 'character',
          name: character.name,
          id: character.id,
          message: attachedBook ? '角色、角色书与默认配套已导入' : '角色与默认配套已导入',
          count: attachedBook ? 3 : 2,
        })
      }

      if (payload.kind === 'preset') {
        const parsed = presetInputSchema.parse(payload.payload)
        const preset = {
          ...parsed,
          id: createUuid(),
          source: 'import' as const,
          createdAt: timestamp,
        }
        updateTavernState((current) => {
          current.presets.unshift(preset)
        })
        return HttpResponse.json({
          ok: true,
          kind: 'preset',
          name: preset.name,
          id: preset.id,
          message: '预设已导入',
          count: 1,
        })
      }

      if (payload.kind === 'worldbook') {
        const parsed = worldBookInputSchema.parse(payload.payload)
        const book: WorldBook = {
          ...parsed,
          id: createUuid(),
          source: 'import',
          createdAt: timestamp,
          entries: parsed.entries.map((entry) => ({ ...entry, id: createUuid() })),
        }
        updateTavernState((current) => {
          current.worldBooks.unshift(book)
        })
        return HttpResponse.json({
          ok: true,
          kind: 'worldbook',
          name: book.name,
          id: book.id,
          message: '世界书已导入',
          count: book.entries.length,
        })
      }

      const parsed = regexImportSchema.parse(payload.payload)
      const packId = `regex-pack-${createUuid()}`
      const rules: RegexRule[] = parsed.rules.map((rule) => ({
        ...rule,
        id: createUuid(),
        packId,
        packName: parsed.name,
      }))
      updateTavernState((current) => {
        current.regexRules.unshift(...rules)
      })
      return HttpResponse.json({
        ok: true,
        kind: 'regex',
        name: parsed.name,
        id: rules[0]?.id,
        message: `已导入 ${rules.length} 条正则规则`,
        count: rules.length,
      })
    } catch (error) {
      return HttpResponse.json({
        ok: false,
        kind: requestedKind,
        name: '未导入',
        message: error instanceof Error ? error.message.slice(0, 160) : '文件结构无法识别。',
        count: 0,
      })
    }
  }),

  http.get('/api/export', async () => {
    await delay(260)
    try {
      const state = readTavernState()
      const vectorMemories = await exportVectorMemories()
      return HttpResponse.json({ exportedAt: now(), state: { ...state, vectorMemories } })
    } catch (error) {
      return HttpResponse.json(
        { message: error instanceof Error ? error.message : '导出本机数据失败。' },
        { status: 500 },
      )
    }
  }),

  http.post('/api/reset', async () => {
    await delay(360)
    try {
      const state = resetTavernStore()
      await clearVectorMemoryStore()
      return HttpResponse.json({
        success: true,
        characters: state.characters.length,
        sessions: state.sessions.length,
      })
    } catch (error) {
      return HttpResponse.json(
        { message: error instanceof Error ? error.message : '清空本机数据失败。' },
        { status: 500 },
      )
    }
  }),
]
