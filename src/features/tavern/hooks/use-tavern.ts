import { startTransition, useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { getErrorMessage } from '@/services/http'

import {
  getCharacter,
  getCharacters,
  getChat,
  getChats,
  getCombos,
  getLoadouts,
  getMessages,
  getPresets,
  getRegexRules,
  getSettings,
  getVectorMemoryStats,
  getWorldBooks,
  compressChatMemory,
  completeMessage,
  continueChatCompletion,
  prepareChatGeneration,
  regenerateReply,
  sendMessage,
  streamChatCompletion,
  updateChat,
  updateMessage,
} from '../api'
import { applyRegexRules } from '../lib/regex-rules'
import { stripChatArtifacts } from '../lib/safe-markdown-text'
import { stripStateCards } from '../lib/state-card'
import {
  assessCompletion,
  canContinueCompletion,
  mergeContinuation,
  stripIncompleteSpeakerTag,
} from '../lib/stream-completion'
import type { ChatMessage, ChatSendFeedback, RegexRule } from '../types'

const MAX_CONTINUATION_ATTEMPTS = 2
const STREAM_FLUSH_INTERVAL_MS = 1000 / 30

type AsyncState<T> = {
  data: T | null
  isLoading: boolean
  error: string | null
}

function cleanAssistantContent(content: string, rules: RegexRule[]) {
  return stripChatArtifacts(applyRegexRules(content, rules, 'output'))
}

function hasVisibleAssistantContent(content: string) {
  return stripStateCards(content).trim().length > 0
}

export function useAsyncData<T>(load: (signal: AbortSignal) => Promise<T>, key: string) {
  const [version, setVersion] = useState(0)
  const requestKey = `${key}:${version}`
  const [state, setState] = useState<AsyncState<T> & { key: string }>({
    key: '',
    data: null,
    isLoading: true,
    error: null,
  })
  const loadRef = useRef(load)

  useEffect(() => {
    loadRef.current = load
  })

  useEffect(() => {
    const controller = new AbortController()
    loadRef
      .current(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setState({ key: requestKey, data, isLoading: false, error: null })
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({
            key: requestKey,
            data: null,
            isLoading: false,
            error: getErrorMessage(error),
          })
        }
      })
    return () => controller.abort()
  }, [requestKey, version])

  const refresh = useCallback(() => setVersion((current) => current + 1), [])

  const isLoading = state.key !== requestKey
  return {
    data: state.data,
    isLoading,
    error: isLoading ? null : state.error,
    refresh,
  }
}

export function useCharacters(query: { search?: string; tag?: string } = {}) {
  return useAsyncData(
    (signal) => getCharacters(query, signal),
    `${query.search ?? ''}|${query.tag ?? ''}`,
  )
}

export function useCharacter(characterId: string) {
  return useAsyncData((signal) => getCharacter(characterId, signal), characterId)
}

export function useChats(search = '') {
  return useAsyncData((signal) => getChats(search, signal), search)
}

export function useChatSession(sessionId: string) {
  return useAsyncData((signal) => getChat(sessionId, signal), sessionId)
}

export function usePresets() {
  return useAsyncData((signal) => getPresets(signal), 'presets')
}

export function useWorldBooks() {
  return useAsyncData((signal) => getWorldBooks(signal), 'worldbooks')
}

export function useRegexRules() {
  return useAsyncData((signal) => getRegexRules(signal), 'regex-rules')
}

export function useLoadouts() {
  return useAsyncData((signal) => getLoadouts(signal), 'loadouts')
}

export function useCombos() {
  return useAsyncData((signal) => getCombos(signal), 'combos')
}

export function useVectorMemoryStats() {
  return useAsyncData((signal) => getVectorMemoryStats(signal), 'vector-memory-stats')
}

export function useSettings() {
  return useAsyncData((signal) => getSettings(signal), 'settings')
}

export function useChatMessages(sessionId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loadedSessionId, setLoadedSessionId] = useState('')
  const [streaming, setStreaming] = useState<{ sessionId: string; messageId: string | null }>({
    sessionId: '',
    messageId: null,
  })
  const [compressingSessionId, setCompressingSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const streamingIdRef = useRef<string | null>(null)
  const bufferRef = useRef('')
  const rafRef = useRef<number | null>(null)
  const lastFlushAtRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const outputRulesRef = useRef<RegexRule[]>([])
  const stopRequestedRef = useRef(false)
  const mountedRef = useRef(true)
  const isLoading = loadedSessionId !== sessionId
  const isStreaming = streaming.sessionId === sessionId && streaming.messageId !== null
  const isCompressingMemory = compressingSessionId === sessionId
  const streamingMessageId = streaming.sessionId === sessionId ? streaming.messageId : null

  const flush = useCallback(() => {
    rafRef.current = null
    const messageId = streamingIdRef.current
    if (!messageId || !mountedRef.current) return
    const content = bufferRef.current
    startTransition(() => {
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId && message.status === 'streaming'
            ? { ...message, content }
            : message,
        ),
      )
    })
  }, [])

  const scheduleFlush = useCallback(() => {
    if (rafRef.current !== null) return
    const tick = (timestamp: number) => {
      if (timestamp - lastFlushAtRef.current < STREAM_FLUSH_INTERVAL_MS) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }
      lastFlushAtRef.current = timestamp
      rafRef.current = null
      flush()
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [flush])

  useEffect(() => {
    mountedRef.current = true
    const controller = new AbortController()
    streamingIdRef.current = null
    bufferRef.current = ''
    lastFlushAtRef.current = 0
    outputRulesRef.current = []
    stopRequestedRef.current = false
    getMessages(sessionId, { limit: 40 }, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return
        setMessages(response.items)
        setHasMore(response.hasMore)
        setError(null)
        setLoadedSessionId(sessionId)
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return
        setError(getErrorMessage(caught))
        setLoadedSessionId(sessionId)
      })
    return () => {
      controller.abort()
      abortRef.current?.abort()
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      mountedRef.current = false
    }
  }, [sessionId])

  const runStream = useCallback(
    async (assistant: ChatMessage) => {
      streamingIdRef.current = assistant.id
      bufferRef.current = assistant.content
      lastFlushAtRef.current = 0
      outputRulesRef.current = []
      stopRequestedRef.current = false
      setStreaming({ sessionId, messageId: assistant.id })
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const prepared = await prepareChatGeneration(sessionId, controller.signal)
        outputRulesRef.current = prepared.outputRules
        const raw = await streamChatCompletion(
          prepared,
          (delta) => {
            bufferRef.current += delta
            scheduleFlush()
          },
          controller.signal,
        )
        if (controller.signal.aborted) return null
        let content = cleanAssistantContent(raw.content, outputRulesRef.current)
        if (!hasVisibleAssistantContent(content)) {
          throw new Error('模型回复没有可显示的正文，可能只返回了状态更新；请检查输出正则或重试。')
        }
        let completion = assessCompletion(content, raw)
        let continuationWarning: string | null = null
        let attempts = 0

        while (
          !completion.complete &&
          canContinueCompletion(completion) &&
          attempts < MAX_CONTINUATION_ATTEMPTS
        ) {
          attempts += 1
          let continuation = ''
          try {
            const continuationTerminal = await continueChatCompletion(
              prepared,
              content,
              (delta) => {
                continuation += delta
              },
              controller.signal,
            )
            if (controller.signal.aborted) return null
            const cleaned = cleanAssistantContent(continuation, outputRulesRef.current)
            if (!cleaned.trim()) {
              continuationWarning = '自动补全没有返回新的正文，已保留当前内容。'
              break
            }
            const merged = mergeContinuation(content, cleaned)
            if (merged === content) {
              continuationWarning = '自动补全没有产生新的正文，已保留当前内容。'
              break
            }
            content = merged
            completion = assessCompletion(content, continuationTerminal)
            bufferRef.current = content
            scheduleFlush()
          } catch (error) {
            if (controller.signal.aborted) throw error
            continuationWarning = '自动补全请求失败，已保留当前内容。'
            break
          }
        }

        if (!hasVisibleAssistantContent(completion.content)) {
          throw new Error('模型只生成了一个未完成的发言标签，没有可显示的正文；请重试。')
        }
        const final = await completeMessage(
          sessionId,
          assistant.id,
          completion.content,
          completion.complete ? 'complete' : 'error',
        )
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current)
          rafRef.current = null
        }
        if (mountedRef.current) {
          setMessages((current) =>
            current.map((message) => (message.id === assistant.id ? final : message)),
          )
        }
        if (completion.complete && prepared.memoryMode === 'compressed') {
          setCompressingSessionId(sessionId)
          void compressChatMemory(sessionId)
            .then((result) =>
              result ? updateChat(sessionId, { memorySummary: result.summary }) : null,
            )
            .catch((error: unknown) => {
              toast.warning('长期记忆压缩没有完成', {
                description: getErrorMessage(error),
              })
            })
            .finally(() => {
              setCompressingSessionId((current) => (current === sessionId ? null : current))
            })
        }
        return completion.complete ? null : (continuationWarning ?? completion.warning)
      } catch (error) {
        if (controller.signal.aborted) {
          if (!stopRequestedRef.current) {
            const content = stripIncompleteSpeakerTag(
              cleanAssistantContent(bufferRef.current, outputRulesRef.current),
            )
            void completeMessage(sessionId, assistant.id, content, 'stopped').catch(() => {
              // Unmounting can cancel the local persistence request as well.
            })
          }
          return null
        }
        const content = stripIncompleteSpeakerTag(
          cleanAssistantContent(bufferRef.current, outputRulesRef.current),
        )
        if (mountedRef.current) {
          setMessages((current) =>
            current.map((message) =>
              message.id === assistant.id ? { ...message, content, status: 'error' } : message,
            ),
          )
        }
        try {
          await completeMessage(sessionId, assistant.id, content, 'error')
        } catch {
          // The original API error is more useful than a local persistence failure.
        }
        throw error instanceof Error ? error : new Error('API 请求失败。')
      } finally {
        if (abortRef.current === controller) abortRef.current = null
        if (streamingIdRef.current === assistant.id) streamingIdRef.current = null
        if (mountedRef.current) setStreaming({ sessionId, messageId: null })
      }
    },
    [scheduleFlush, sessionId],
  )

  const send = useCallback(
    async (content: string): Promise<ChatSendFeedback | null> => {
      setError(null)
      const result = await sendMessage(sessionId, content)
      setMessages((current) => [...current, result.userMessage, result.assistantMessage])
      try {
        const warning = await runStream(result.assistantMessage)
        return warning ? { warning } : null
      } catch (caught) {
        return {
          error: caught instanceof Error ? caught.message : 'API 请求失败，请检查连接设置。',
        }
      }
    },
    [runStream, sessionId],
  )

  const stop = useCallback(async () => {
    const messageId = streamingIdRef.current
    if (!messageId) return
    stopRequestedRef.current = true
    const partial = stripIncompleteSpeakerTag(
      cleanAssistantContent(bufferRef.current, outputRulesRef.current),
    )
    abortRef.current?.abort()
    streamingIdRef.current = null
    setStreaming({ sessionId, messageId: null })
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId ? { ...message, content: partial, status: 'stopped' } : message,
      ),
    )
    try {
      await completeMessage(sessionId, messageId, partial, 'stopped')
    } catch {
      // The visible copy is already marked as stopped.
    }
  }, [sessionId])

  const retry = useCallback(async () => {
    setError(null)
    const result = await regenerateReply(sessionId)
    setMessages((current) => [
      ...current.filter((message) => message.id !== result.removedMessageId),
      result.assistantMessage,
    ])
    return runStream(result.assistantMessage)
  }, [runStream, sessionId])

  const loadEarlier = useCallback(async () => {
    if (messages.length === 0) return
    const response = await getMessages(sessionId, { limit: 40, before: messages[0].id })
    setMessages((current) => {
      const existing = new Set(current.map((message) => message.id))
      return [...response.items.filter((message) => !existing.has(message.id)), ...current]
    })
    setHasMore(response.hasMore)
  }, [messages, sessionId])

  const editMessage = useCallback(
    async (messageId: string, content: string) => {
      const updated = await updateMessage(sessionId, messageId, content)
      setMessages((current) =>
        current.map((message) => (message.id === messageId ? updated : message)),
      )
    },
    [sessionId],
  )

  return {
    messages: isLoading ? [] : messages,
    hasMore,
    isLoading,
    isStreaming,
    isCompressingMemory,
    streamingMessageId,
    error,
    send,
    stop,
    retry,
    loadEarlier,
    editMessage,
  }
}
