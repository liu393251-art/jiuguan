import { ArrowDown, ArrowLeft, Loader2, Minus, Plus, Settings2 } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ChatComposer } from '@/features/tavern/components/chat-composer'
import { CharacterAvatar } from '@/features/tavern/components/avatar'
import { ImageGenerationDialog } from '@/features/tavern/components/image-generation-dialog'
import { MessageItem } from '@/features/tavern/components/message-item'
import {
  generateImagePrompt,
  getCharacter,
  getErrorMessage,
  updateChat,
} from '@/features/tavern/api'
import {
  useAsyncData,
  useChatMessages,
  useChatSession,
  useSettings,
} from '@/features/tavern/hooks/use-tavern'
import { stripChatLayoutMarkers } from '@/features/tavern/lib/chat-layout'
import { cleanImageSourceText, type AutoImagePromptMode } from '@/features/tavern/lib/image-prompt'
import { stripChatArtifacts } from '@/features/tavern/lib/safe-markdown-text'
import { stripStateCards } from '@/features/tavern/lib/state-card'
import {
  defaultImageGeneration,
  type ChatMessage,
  type CreateImageMessageInput,
  type ImagePromptMode,
} from '@/features/tavern/types'
import { cn } from '@/lib/cn'

const MIN_FONT = 13
const MAX_FONT = 22
const DEFERRED_RENDER_MIN_MESSAGES = 80
const DEFERRED_RENDER_WINDOW = 12

function useVisualViewportHeight() {
  const [height, setHeight] = useState<number | null>(null)

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return

    let frame: number | null = null
    const measure = () => {
      if (frame !== null) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        frame = null
        const next = Math.round(viewport.height)
        setHeight((current) => (current === next ? current : next))
      })
    }

    measure()
    viewport.addEventListener('resize', measure)
    viewport.addEventListener('scroll', measure)
    window.addEventListener('resize', measure)
    return () => {
      viewport.removeEventListener('resize', measure)
      viewport.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [])

  return height
}

export function ChatPage() {
  const { id = '' } = useParams()
  const viewportHeight = useVisualViewportHeight()
  const sessionQuery = useChatSession(id)
  const session = sessionQuery.data
  const settingsQuery = useSettings()
  const userName = settingsQuery.data?.identity.displayName ?? ''
  const characterQuery = useAsyncData(
    (signal) => (session ? getCharacter(session.characterId, signal) : Promise.resolve(null)),
    session?.characterId ?? 'pending',
  )
  const character = characterQuery.data
  const messagesState = useChatMessages(id)
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)
  const lastScrollTopRef = useRef(0)
  const scrollSyncFrameRef = useRef<number | null>(null)
  const [fontOverride, setFontOverride] = useState<{ sessionId: string; value: number } | null>(
    null,
  )
  const [imageDialog, setImageDialog] = useState<{
    mode: ImagePromptMode
    prompt?: string
  } | null>(null)
  const [showJump, setShowJump] = useState(false)
  const fontSize = fontOverride?.sessionId === id ? fontOverride.value : (session?.fontSize ?? 15)
  const retryMessages = messagesState.retry
  const imageConfig = settingsQuery.data?.imageGeneration ?? defaultImageGeneration

  const pinToBottomNow = useCallback(() => {
    const element = scrollRef.current
    if (!element) return
    element.scrollTop = element.scrollHeight
    lastScrollTopRef.current = element.scrollTop
  }, [])

  const syncScroll = useCallback(() => {
    const element = scrollRef.current
    if (!element) return
    if (stickRef.current) {
      pinToBottomNow()
      setShowJump(false)
      return
    }
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight
    setShowJump(distance > 240)
  }, [pinToBottomNow])

  const scheduleScrollSync = useCallback(() => {
    if (scrollSyncFrameRef.current !== null) return
    scrollSyncFrameRef.current = requestAnimationFrame(() => {
      scrollSyncFrameRef.current = null
      syncScroll()
    })
  }, [syncScroll])

  useLayoutEffect(() => {
    if (stickRef.current) {
      pinToBottomNow()
      setShowJump(false)
    } else {
      syncScroll()
    }
  }, [fontSize, id, messagesState.isLoading, messagesState.messages, pinToBottomNow, syncScroll])

  useEffect(() => {
    const scrollElement = scrollRef.current
    const contentElement = contentRef.current
    if (!scrollElement || !contentElement) return
    const observer = new ResizeObserver(scheduleScrollSync)
    observer.observe(scrollElement)
    observer.observe(contentElement)
    return () => observer.disconnect()
  }, [scheduleScrollSync])

  useEffect(() => {
    if (viewportHeight === null) return
    scheduleScrollSync()
  }, [scheduleScrollSync, viewportHeight])

  useEffect(
    () => () => {
      if (scrollSyncFrameRef.current !== null) cancelAnimationFrame(scrollSyncFrameRef.current)
    },
    [],
  )

  const handleScroll = useCallback(() => {
    const element = scrollRef.current
    if (!element) return
    const movedUp = element.scrollTop < lastScrollTopRef.current - 1
    lastScrollTopRef.current = element.scrollTop
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight
    if (distance < 80) stickRef.current = true
    else if (movedUp) stickRef.current = false
    setShowJump(distance > 240)
  }, [])

  const changeFontSize = useCallback(
    (next: number) => {
      const value = Math.min(MAX_FONT, Math.max(MIN_FONT, next))
      setFontOverride({ sessionId: id, value })
      if (!session) return
      void updateChat(session.id, { fontSize: value }).catch((error: unknown) => {
        toast.error('字号没有保存', { description: getErrorMessage(error) })
      })
    },
    [id, session],
  )

  async function handleSend(content: string) {
    stickRef.current = true
    return messagesState.send(content)
  }

  async function handleAttachImage(input: CreateImageMessageInput) {
    stickRef.current = true
    await messagesState.addImageMessage(input)
  }

  const handleGeneratePrompt = useCallback(
    (mode: AutoImagePromptMode, signal: AbortSignal) => generateImagePrompt(id, mode, signal),
    [id],
  )

  const handleGenerateFromMessage = useCallback((message: ChatMessage) => {
    const prompt = cleanImageSourceText(message.content)
    if (!prompt) {
      toast.error('这条消息没有可用于生图的文字')
      return
    }
    stickRef.current = true
    setImageDialog({ mode: 'message', prompt })
  }, [])

  const handleRetry = useCallback(async () => {
    stickRef.current = true
    try {
      const warning = await retryMessages()
      if (warning) {
        toast.error('重试后回复仍未完整生成', { description: warning })
      }
    } catch (error) {
      toast.error('重试失败', { description: getErrorMessage(error) })
    }
  }, [retryMessages])

  const handleCopy = useCallback(async (message: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(
        stripChatLayoutMarkers(stripStateCards(stripChatArtifacts(message.content))),
      )
      toast.success('这条消息已复制')
    } catch (error) {
      toast.error('复制失败', { description: getErrorMessage(error) })
    }
  }, [])

  async function handleLoadEarlier() {
    const element = scrollRef.current
    if (!element) return
    const previousHeight = element.scrollHeight
    stickRef.current = false
    try {
      await messagesState.loadEarlier()
      requestAnimationFrame(() => {
        element.scrollTop = element.scrollHeight - previousHeight
        lastScrollTopRef.current = element.scrollTop
      })
    } catch (error) {
      toast.error('没有加载到更早的消息', { description: getErrorMessage(error) })
    }
  }

  if (sessionQuery.isLoading && !session) {
    return (
      <div className="mx-auto flex h-dvh w-full max-w-3xl flex-col gap-4 p-4">
        <Skeleton className="h-14 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-20 w-2/3 rounded-2xl" />
        <Skeleton className="ml-auto h-16 w-1/2 rounded-2xl" />
      </div>
    )
  }

  if (!session) {
    return (
      <div className="flex h-dvh items-center justify-center p-6">
        <div className="bg-card max-w-sm rounded-2xl border p-7 text-center">
          <p className="font-display text-xl font-semibold">这段对话已经结束了</p>
          <p className="text-muted-foreground mt-2 text-sm">
            {sessionQuery.error ?? '没有找到对应的对话。'}
          </p>
          <Button asChild variant="outline" className="mt-5">
            <Link to="/">
              <ArrowLeft />
              返回对话列表
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  let lastAssistantId: string | undefined
  for (let index = messagesState.messages.length - 1; index >= 0; index -= 1) {
    const message = messagesState.messages[index]
    if (message.role !== 'assistant' || message.status === 'streaming') continue
    if (message.kind !== 'image') {
      lastAssistantId = message.id
    }
    break
  }
  const lastSourceMessage = [...messagesState.messages]
    .reverse()
    .find(
      (message) =>
        message.kind !== 'image' && message.status === 'complete' && message.content.trim(),
    )
  const lastMessageText = lastSourceMessage ? cleanImageSourceText(lastSourceMessage.content) : ''
  const deferredBeforeIndex =
    messagesState.messages.length >= DEFERRED_RENDER_MIN_MESSAGES
      ? messagesState.messages.length - DEFERRED_RENDER_WINDOW
      : 0

  return (
    <div
      data-testid="chat-shell"
      style={viewportHeight === null ? undefined : { height: `${viewportHeight}px` }}
      className="chat-canvas bg-background flex h-dvh flex-col overflow-hidden pt-[var(--safe-top)]"
    >
      <header className="border-border/70 bg-background/90 sticky top-0 z-20 shrink-0 border-b backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-4xl items-center gap-2 px-2 sm:gap-3 sm:px-6">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/" aria-label="返回对话列表">
              <ArrowLeft />
            </Link>
          </Button>
          <CharacterAvatar
            name={character?.name ?? session.title}
            tone={character?.avatarTone ?? 0}
            size="sm"
            className="size-9 rounded-xl"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold sm:text-base">
              {character?.name ?? session.title}
            </p>
            <p className="text-muted-foreground truncate text-[10px] sm:text-[11px]">
              {session.title} · {session.messageCount} 条 · 仅此对话
            </p>
          </div>
          <div className="flex items-center gap-0.5 rounded-lg border p-0.5">
            <button
              type="button"
              aria-label="减小聊天字号"
              onClick={() => changeFontSize(fontSize - 1)}
              disabled={fontSize <= MIN_FONT}
              className="text-muted-foreground hover:bg-muted hover:text-foreground flex size-10 items-center justify-center rounded-md disabled:opacity-40 sm:size-7"
            >
              <Minus className="size-3.5" />
            </button>
            <span className="w-8 text-center text-[10px] font-semibold tabular-nums">
              {fontSize}
            </span>
            <button
              type="button"
              aria-label="增大聊天字号"
              onClick={() => changeFontSize(fontSize + 1)}
              disabled={fontSize >= MAX_FONT}
              className="text-muted-foreground hover:bg-muted hover:text-foreground flex size-10 items-center justify-center rounded-md disabled:opacity-40 sm:size-7"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
          <Button variant="ghost" size="icon" asChild>
            <Link to={`/chat/${session.id}/settings`} aria-label="打开当前对话设置">
              <Settings2 />
            </Link>
          </Button>
        </div>
      </header>

      <div
        data-testid="message-scroll"
        ref={scrollRef}
        onScroll={handleScroll}
        className="relative min-h-0 flex-1 overflow-y-auto [overflow-anchor:none]"
      >
        <div ref={contentRef} className="mx-auto w-full max-w-4xl pb-5">
          {messagesState.hasMore && (
            <div className="flex justify-center px-4 pt-4">
              <Button variant="outline" size="sm" onClick={() => void handleLoadEarlier()}>
                <ArrowDown className="rotate-180" />
                加载更早的消息
              </Button>
            </div>
          )}

          {messagesState.isLoading ? (
            <div className="space-y-4 p-4 sm:p-6">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton
                  key={index}
                  className={cn('h-24 rounded-2xl', index % 2 === 0 ? 'w-2/3' : 'ml-auto w-1/2')}
                />
              ))}
            </div>
          ) : messagesState.error ? (
            <div className="border-destructive/20 bg-destructive/5 m-4 rounded-2xl border p-5">
              <p className="text-destructive font-semibold">消息没有加载出来</p>
              <p className="text-muted-foreground mt-1 text-sm">{messagesState.error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => window.location.reload()}
              >
                重新加载页面
              </Button>
            </div>
          ) : messagesState.messages.length === 0 ? (
            <div className="p-10 text-center">
              <p className="font-display text-lg font-semibold">还没有消息</p>
              <p className="text-muted-foreground mt-2 text-sm">
                在下方输入框发送第一条消息即可开始对话。
              </p>
            </div>
          ) : (
            messagesState.messages.map((message, index) => (
              <MessageItem
                key={message.id}
                message={message}
                characterName={character?.name ?? session.title}
                userName={userName}
                avatarTone={character?.avatarTone ?? 0}
                fontSize={fontSize}
                isStreaming={message.id === messagesState.streamingMessageId}
                canRetry={message.id === lastAssistantId}
                deferred={index < deferredBeforeIndex}
                onCopy={handleCopy}
                onEdit={messagesState.editMessage}
                onRetry={handleRetry}
                onGenerateImage={handleGenerateFromMessage}
              />
            ))
          )}
          {messagesState.isStreaming && (
            <div className="text-muted-foreground flex items-center gap-2 px-6 py-2 text-[11px]">
              <Loader2 className="size-3 animate-spin" />
              正在生成回复，点击输入框右侧按钮可停止
            </div>
          )}
          {messagesState.isCompressingMemory && (
            <div className="text-muted-foreground flex items-center gap-2 px-6 py-2 text-[11px]">
              <Loader2 className="size-3 animate-spin" />
              正在用聊天 API 更新长期记忆…
            </div>
          )}
        </div>
      </div>

      {showJump && (
        <button
          type="button"
          onClick={() => {
            const element = scrollRef.current
            if (element) element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' })
            stickRef.current = true
            setShowJump(false)
          }}
          aria-label="回到最新消息"
          className="bg-card text-foreground fixed right-4 bottom-28 z-10 flex size-10 items-center justify-center rounded-full border shadow-lg sm:right-8"
        >
          <ArrowDown className="size-4" />
        </button>
      )}

      <ChatComposer
        onSend={handleSend}
        onStop={() => void messagesState.stop()}
        onGenerateImage={() => setImageDialog({ mode: 'free' })}
        isStreaming={messagesState.isStreaming}
        disabled={messagesState.isLoading}
        fontSize={fontSize}
      />
      {imageDialog && (
        <ImageGenerationDialog
          open
          config={imageConfig}
          characterName={character?.name ?? session.title}
          initialMode={imageDialog.mode}
          initialPrompt={imageDialog.prompt}
          lastMessageText={lastMessageText}
          onOpenChange={(next) => {
            if (!next) setImageDialog(null)
          }}
          onGeneratePrompt={handleGeneratePrompt}
          onAttach={handleAttachImage}
        />
      )}
    </div>
  )
}
