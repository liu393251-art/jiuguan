import { Check, Copy, Pencil, RotateCcw, X } from 'lucide-react'
import { Fragment, memo, useMemo, useState, type CSSProperties } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/cn'
import { getErrorMessage } from '@/services/http'

import {
  formatSpeakerLabel,
  isUserSpeaker,
  parseChatTranscript,
  splitChatSegments,
  type ChatTranscript,
  type ChatTranscriptSegment,
} from '../lib/chat-transcript'
import { stripChatLayoutMarkers } from '../lib/chat-layout'
import { formatDateTime } from '../lib/format'
import { SafeMarkdown } from '../lib/safe-markdown'
import { stripChatArtifacts } from '../lib/safe-markdown-text'
import { extractStateCard, type StateCardData } from '../lib/state-card'
import type { ChatMessage } from '../types'
import { CharacterAvatar } from './avatar'
import { StateCard } from './state-card'

type MessageItemProps = {
  message: ChatMessage
  characterName: string
  userName: string
  avatarTone: number
  fontSize: number
  isStreaming: boolean
  canRetry: boolean
  deferred?: boolean
  onCopy: (message: ChatMessage) => void
  onEdit: (messageId: string, content: string) => Promise<void>
  onRetry: () => void
}

export const MessageItem = memo(function MessageItem({
  message,
  characterName,
  userName,
  avatarTone,
  fontSize,
  isStreaming,
  canRetry,
  deferred = false,
  onCopy,
  onEdit,
  onRetry,
}: MessageItemProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.content)
  const [saving, setSaving] = useState(false)
  const isUser = message.role === 'user'
  const stateView = useMemo(
    () =>
      isUser
        ? { content: message.content, card: null }
        : extractStateCard(stripChatArtifacts(message.content)),
    [isUser, message.content],
  )
  const displayContent = stateView.content
  const stateCard = stateView.card
  const transcript = useMemo(
    () => (isUser ? null : parseChatTranscript(displayContent, userName)),
    [displayContent, isUser, userName],
  )
  const singleSpeakerTranscript = useMemo<ChatTranscript | null>(() => {
    if (isUser || transcript) return null
    const segments = splitChatSegments(displayContent)
    if (!segments.some((segment) => segment.type === 'dialogue')) return null
    return {
      intro: '',
      introSegments: [],
      entries: [
        {
          speaker: characterName,
          content: stripChatLayoutMarkers(displayContent),
          segments,
        },
      ],
    }
  }, [characterName, displayContent, isUser, transcript])
  const narrationContent = useMemo(
    () => (isUser ? '' : stripChatLayoutMarkers(displayContent)),
    [displayContent, isUser],
  )
  const userSegments = useMemo<ChatTranscriptSegment[]>(() => {
    if (!isUser) return []
    const segments = splitChatSegments(displayContent, { unquotedDialogue: true })
    return segments.length > 0 ? segments : [{ type: 'dialogue', content: displayContent }]
  }, [displayContent, isUser])

  async function save() {
    if (!draft.trim()) return
    setSaving(true)
    try {
      await onEdit(message.id, draft.trim())
      setEditing(false)
      toast.success('消息已更新')
    } catch (error) {
      toast.error('修改失败', { description: getErrorMessage(error) })
    } finally {
      setSaving(false)
    }
  }

  if (transcript) {
    return (
      <TranscriptMessage
        message={message}
        transcript={transcript}
        characterName={characterName}
        userName={userName}
        avatarTone={avatarTone}
        fontSize={fontSize}
        isStreaming={isStreaming}
        canRetry={canRetry}
        deferred={deferred}
        stateCard={stateCard}
        onCopy={onCopy}
        onRetry={onRetry}
      />
    )
  }

  if (singleSpeakerTranscript) {
    return (
      <TranscriptMessage
        message={message}
        transcript={singleSpeakerTranscript}
        characterName={characterName}
        userName={userName}
        avatarTone={avatarTone}
        fontSize={fontSize}
        isStreaming={isStreaming}
        canRetry={canRetry}
        deferred={deferred}
        stateCard={stateCard}
        onCopy={onCopy}
        onRetry={onRetry}
      />
    )
  }

  if (!isUser) {
    return (
      <NarrationMessage
        message={message}
        content={narrationContent}
        characterName={characterName}
        fontSize={fontSize}
        isStreaming={isStreaming}
        canRetry={canRetry}
        deferred={deferred}
        stateCard={stateCard}
        onCopy={onCopy}
        onRetry={onRetry}
      />
    )
  }

  const firstDialogueIndex = userSegments.findIndex((segment) => segment.type === 'dialogue')

  return (
    <article
      className="message-row group px-4 py-2.5 sm:px-6"
      aria-label="你的消息"
      data-message-style="user"
      data-render-deferred={deferred ? 'true' : undefined}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-1.5">
        {editing ? (
          <div className="border-border bg-card ml-auto w-full max-w-[86%] space-y-2 rounded-2xl border p-3 shadow-sm sm:max-w-[78%] sm:p-4">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="bg-background min-h-24 text-sm"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDraft(message.content)
                  setEditing(false)
                }}
                disabled={saving}
              >
                <X />
                取消
              </Button>
              <Button size="sm" onClick={() => void save()} disabled={saving || !draft.trim()}>
                <Check />
                保存
              </Button>
            </div>
          </div>
        ) : (
          userSegments.map((segment, index) =>
            segment.type === 'narration' ? (
              <CenteredNarration
                key={`${message.id}-user-narration-${index}`}
                content={segment.content}
                characterName={userName || '你'}
                fontSize={fontSize}
                className="text-foreground/90"
              />
            ) : (
              <UserDialogueRow
                key={`${message.id}-user-dialogue-${index}`}
                content={segment.content}
                speaker={userName.trim() || '你'}
                message={message}
                fontSize={fontSize}
                showMeta={index === firstDialogueIndex}
              />
            ),
          )
        )}

        {message.status === 'streaming' && !isStreaming && (
          <p className="text-muted-foreground text-xs">这条回复没有正常结束。</p>
        )}
        {message.status === 'error' && (
          <p className="text-destructive text-xs">回复中断，可以点下方重试。</p>
        )}

        {!editing && (
          <div className="flex justify-end gap-0.5 opacity-70 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground h-7 px-2 text-[10px]"
              onClick={() => onCopy(message)}
            >
              <Copy className="size-3" />
              复制
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground h-7 px-2 text-[10px]"
              onClick={() => {
                setDraft(message.content)
                setEditing(true)
              }}
            >
              <Pencil className="size-3" />
              编辑
            </Button>
          </div>
        )}
      </div>
    </article>
  )
})

function narrationFontSize(fontSize: number) {
  return Math.min(23, Math.max(16, fontSize + 1))
}

function CenteredNarration({
  content,
  characterName,
  fontSize,
  className,
  streaming = false,
  sanitized = false,
}: {
  content: string
  characterName: string
  fontSize: number
  className?: string
  streaming?: boolean
  sanitized?: boolean
}) {
  return (
    <div
      className={cn('mx-auto w-full max-w-3xl px-4 py-1 text-center sm:px-10', className)}
      data-message-part="narration"
      style={{ '--chat-font-size': `${narrationFontSize(fontSize)}px` } as CSSProperties}
    >
      <SafeMarkdown
        content={content}
        characterName={characterName}
        streaming={streaming}
        sanitized={sanitized}
      />
    </div>
  )
}

function NarrationMessage({
  message,
  content,
  characterName,
  fontSize,
  isStreaming,
  canRetry,
  deferred,
  stateCard,
  onCopy,
  onRetry,
}: {
  message: ChatMessage
  content: string
  characterName: string
  fontSize: number
  isStreaming: boolean
  canRetry: boolean
  deferred: boolean
  stateCard: StateCardData | null
  onCopy: (message: ChatMessage) => void
  onRetry: () => void
}) {
  return (
    <article
      className="message-row group px-4 py-2.5 sm:px-6"
      aria-label={`${characterName}的叙述`}
      data-message-style="narration"
      data-render-deferred={deferred ? 'true' : undefined}
    >
      <div className="mx-auto w-full max-w-3xl">
        {content.trim() && (
          <div className="text-foreground/90">
            <CenteredNarration
              content={content}
              characterName={characterName}
              fontSize={fontSize}
              streaming={isStreaming}
              sanitized
            />
            {isStreaming && <span className="stream-caret" aria-hidden="true" />}
          </div>
        )}
        {stateCard && (
          <div className="mx-auto w-full max-w-3xl px-4 pt-1 sm:px-10">
            <StateCard data={stateCard} />
          </div>
        )}
        {message.status === 'streaming' && !isStreaming && (
          <p className="text-muted-foreground mt-1 px-1 text-xs sm:px-10">这条回复没有正常结束。</p>
        )}
        {message.status === 'error' && (
          <p className="text-destructive mt-1 px-1 text-xs sm:px-10">回复中断，可以点下方重试。</p>
        )}
        <div className="mt-1 flex justify-end gap-0.5 opacity-70 transition-opacity sm:justify-start sm:px-9 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground h-7 px-2 text-[10px]"
            onClick={() => onCopy(message)}
          >
            <Copy className="size-3" />
            复制
          </Button>
          {canRetry && !isStreaming && (
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground h-7 px-2 text-[10px]"
              onClick={onRetry}
            >
              <RotateCcw className="size-3" />
              重试
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}

function DialogueBubble({
  content,
  characterName,
  fontSize,
  streaming = false,
  sanitized = false,
}: {
  content: string
  characterName: string
  fontSize: number
  streaming?: boolean
  sanitized?: boolean
}) {
  return (
    <div
      className="bg-chat-assistant text-chat-assistant-foreground max-w-full rounded-2xl rounded-tl-md border px-3.5 py-2.5 text-left shadow-sm sm:px-4 sm:py-3"
      data-message-part="dialogue"
      style={{ '--chat-font-size': `${fontSize}px` } as CSSProperties}
    >
      <SafeMarkdown
        content={content}
        characterName={characterName}
        streaming={streaming}
        sanitized={sanitized}
      />
    </div>
  )
}

function UserDialogueRow({
  content,
  speaker,
  message,
  fontSize,
  showMeta,
  sanitized = false,
}: {
  content: string
  speaker: string
  message: ChatMessage
  fontSize: number
  showMeta: boolean
  sanitized?: boolean
}) {
  return (
    <div
      className="flex flex-row-reverse items-start gap-2.5"
      data-speaker-side="right"
      data-speaker={speaker}
    >
      <div className="bg-secondary text-secondary-foreground mt-5 flex size-8 shrink-0 items-center justify-center rounded-xl text-[11px] font-semibold">
        你
      </div>
      <div className="flex max-w-[82%] min-w-0 flex-col items-end text-right sm:max-w-[74%]">
        <div className="mb-1 flex items-center justify-end gap-2 text-[10px]">
          <span className="text-muted-foreground font-medium">{speaker}</span>
          {showMeta && (
            <>
              <span className="text-muted-foreground/60">{formatDateTime(message.createdAt)}</span>
              {message.status === 'stopped' && (
                <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5">
                  已停止
                </span>
              )}
              {message.status === 'error' && (
                <span className="bg-destructive/10 text-destructive rounded-full px-1.5 py-0.5">
                  中断
                </span>
              )}
            </>
          )}
        </div>
        <div
          className="bg-chat-user text-chat-user-foreground rounded-2xl rounded-tr-md border border-transparent px-3.5 py-2.5 text-left shadow-sm sm:px-4 sm:py-3"
          style={{ '--chat-font-size': `${fontSize}px` } as CSSProperties}
        >
          <SafeMarkdown content={content} characterName={speaker} sanitized={sanitized} />
        </div>
      </div>
    </div>
  )
}

function TranscriptMessage({
  message,
  transcript,
  characterName,
  userName,
  avatarTone,
  fontSize,
  isStreaming,
  canRetry,
  deferred,
  stateCard,
  onCopy,
  onRetry,
}: {
  message: ChatMessage
  transcript: ChatTranscript
  characterName: string
  userName: string
  avatarTone: number
  fontSize: number
  isStreaming: boolean
  canRetry: boolean
  deferred: boolean
  stateCard: StateCardData | null
  onCopy: (message: ChatMessage) => void
  onRetry: () => void
}) {
  const firstAudibleEntryIndex = transcript.entries.findIndex((entry) => {
    const isUser = isUserSpeaker(entry.speaker, userName)
    return isUser || entry.segments.some((segment) => segment.type === 'dialogue')
  })

  return (
    <article
      className="message-row group px-4 py-3 sm:px-6"
      aria-label={`${characterName}的群聊消息`}
      data-testid="chat-transcript"
      data-render-deferred={deferred ? 'true' : undefined}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2.5">
        {transcript.intro && (
          <CenteredNarration
            content={transcript.intro}
            characterName={characterName}
            fontSize={fontSize}
            className="text-foreground/90"
            streaming={isStreaming}
            sanitized
          />
        )}
        {transcript.entries.map((entry, index) => {
          const isUser = isUserSpeaker(entry.speaker, userName)
          const speaker = isUser ? '你' : formatSpeakerLabel(entry.speaker, userName, characterName)
          if (!isUser) {
            return (
              <Fragment key={`${message.id}-speaker-${index}`}>
                {entry.segments.map((segment, segmentIndex) => {
                  if (segment.type === 'narration') {
                    return (
                      <CenteredNarration
                        key={`${message.id}-${index}-narration-${segmentIndex}`}
                        content={segment.content}
                        characterName={speaker}
                        fontSize={fontSize}
                        className="text-foreground/90"
                        streaming={isStreaming}
                        sanitized
                      />
                    )
                  }

                  const showMeta =
                    index === firstAudibleEntryIndex &&
                    segmentIndex === entry.segments.findIndex((item) => item.type === 'dialogue')
                  return (
                    <div
                      key={`${message.id}-${index}-dialogue-${segmentIndex}`}
                      className="flex flex-row items-start gap-2.5"
                      data-speaker-side="left"
                      data-speaker={speaker}
                    >
                      <CharacterAvatar
                        name={speaker}
                        tone={transcriptTone(speaker, characterName, avatarTone)}
                        size="sm"
                        className="mt-5 size-8 rounded-xl"
                      />
                      <div className="max-w-[88%] min-w-0 sm:max-w-[82%]">
                        <div className="mb-1 flex items-center gap-2 text-[10px]">
                          <span className="text-muted-foreground font-medium">{speaker}</span>
                          {showMeta && (
                            <span className="text-muted-foreground/60">
                              {formatDateTime(message.createdAt)}
                            </span>
                          )}
                          {showMeta && message.status === 'stopped' && (
                            <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5">
                              已停止
                            </span>
                          )}
                          {showMeta && message.status === 'error' && (
                            <span className="bg-destructive/10 text-destructive rounded-full px-1.5 py-0.5">
                              中断
                            </span>
                          )}
                        </div>
                        <DialogueBubble
                          content={segment.content}
                          characterName={speaker}
                          fontSize={fontSize}
                          streaming={isStreaming}
                          sanitized
                        />
                      </div>
                    </div>
                  )
                })}
              </Fragment>
            )
          }

          const showMeta = index === firstAudibleEntryIndex
          const firstDialogueIndex = entry.segments.findIndex(
            (segment) => segment.type === 'dialogue',
          )
          return (
            <Fragment key={`${message.id}-speaker-${index}`}>
              {entry.segments.map((segment, segmentIndex) =>
                segment.type === 'narration' ? (
                  <CenteredNarration
                    key={`${message.id}-${index}-user-narration-${segmentIndex}`}
                    content={segment.content}
                    characterName={speaker}
                    fontSize={fontSize}
                    className="text-foreground/90"
                    sanitized
                  />
                ) : (
                  <UserDialogueRow
                    key={`${message.id}-${index}-user-dialogue-${segmentIndex}`}
                    content={segment.content}
                    speaker={speaker}
                    message={message}
                    fontSize={fontSize}
                    showMeta={showMeta && segmentIndex === firstDialogueIndex}
                    sanitized
                  />
                ),
              )}
            </Fragment>
          )
        })}
        {isStreaming && <span className="stream-caret mx-auto" aria-hidden="true" />}
        {stateCard && (
          <div className="pt-0.5">
            <StateCard data={stateCard} />
          </div>
        )}

        {message.status === 'streaming' && !isStreaming && (
          <p className="text-muted-foreground mx-auto w-full max-w-3xl px-4 text-xs sm:px-10">
            这条回复没有正常结束。
          </p>
        )}
        {message.status === 'error' && (
          <p className="text-destructive mx-auto w-full max-w-3xl px-4 text-xs sm:px-10">
            回复中断，可以点下方重试。
          </p>
        )}

        <div className="flex justify-end gap-0.5 opacity-70 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground h-7 px-2 text-[10px]"
            onClick={() => onCopy(message)}
          >
            <Copy className="size-3" />
            复制整段
          </Button>
          {canRetry && !isStreaming && (
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground h-7 px-2 text-[10px]"
              onClick={onRetry}
            >
              <RotateCcw className="size-3" />
              重试
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}

function transcriptTone(speaker: string, characterName: string, fallback: number) {
  if (speaker === characterName) return fallback
  let hash = 0
  for (const character of speaker) {
    hash = (hash * 31 + (character.codePointAt(0) ?? 0)) % 5
  }
  return (hash + fallback) % 5
}
