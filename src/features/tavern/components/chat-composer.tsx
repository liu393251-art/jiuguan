import { Image as ImageIcon, Loader2, SendHorizontal, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import type { ChatSendFeedback } from '@/features/tavern/types'
import { getErrorMessage } from '@/services/http'

export function ChatComposer({
  onSend,
  onStop,
  onGenerateImage,
  isStreaming,
  disabled,
  fontSize,
}: {
  onSend: (content: string) => Promise<ChatSendFeedback | null>
  onStop: () => void
  onGenerateImage?: () => void
  isStreaming: boolean
  disabled?: boolean
  fontSize: number
}) {
  const [value, setValue] = useState('')
  const [sending, setSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const element = textareaRef.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 168)}px`
  }, [value])

  function insertPair(open: string, close: string) {
    const element = textareaRef.current
    if (!element || disabled) return
    const start = element.selectionStart ?? value.length
    const end = element.selectionEnd ?? start
    const selected = value.slice(start, end)
    element.focus()
    flushSync(() => {
      setValue(`${value.slice(0, start)}${open}${selected}${close}${value.slice(end)}`)
    })
    const caret = start + open.length + selected.length
    element.setSelectionRange(caret, caret)
  }

  async function submit() {
    const content = value.trim()
    if (!content || sending || isStreaming || disabled) return
    setSending(true)
    const pendingReply = onSend(content)
    setValue('')
    textareaRef.current?.focus()
    try {
      const feedback = await pendingReply
      if (feedback?.error) {
        toast.error('消息已发出，但没有收到回复', { description: feedback.error })
      } else if (feedback?.warning) {
        toast.error('回复没有完整生成', { description: feedback.warning })
      }
    } catch (error) {
      setValue((current) => current || content)
      toast.error('消息没有发出去', { description: getErrorMessage(error) })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="border-border/80 bg-background/92 safe-bottom border-t backdrop-blur-xl">
      <div className="mx-auto w-full max-w-3xl px-3 pt-2.5 pb-2 sm:px-6 sm:pb-3">
        <div className="mb-1.5 flex items-center gap-1.5 px-1">
          {onGenerateImage && (
            <button
              type="button"
              aria-label="生成图片"
              title="生成图片"
              onMouseDown={(event) => event.preventDefault()}
              onClick={onGenerateImage}
              disabled={disabled || isStreaming || sending}
              className="text-muted-foreground hover:bg-muted hover:text-foreground border-border/70 bg-card flex h-8 items-center justify-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ImageIcon className="size-3.5" />
              生图
            </button>
          )}
          <button
            type="button"
            aria-label="插入引号"
            title="插入引号"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => insertPair('“', '”')}
            className="text-muted-foreground hover:bg-muted hover:text-foreground border-border/70 bg-card flex h-8 min-w-10 items-center justify-center rounded-md border px-2.5 text-sm leading-none shadow-sm transition-colors"
          >
            “”
          </button>
          <button
            type="button"
            aria-label="插入括号"
            title="插入括号"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => insertPair('（', '）')}
            className="text-muted-foreground hover:bg-muted hover:text-foreground border-border/70 bg-card flex h-8 min-w-10 items-center justify-center rounded-md border px-2.5 text-sm leading-none shadow-sm transition-colors"
          >
            （）
          </button>
        </div>
        <div className="border-border bg-card focus-within:border-ring/60 focus-within:ring-ring/15 flex min-w-0 items-end gap-2 rounded-2xl border p-2 shadow-sm transition-colors focus-within:ring-2">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void submit()
              }
            }}
            rows={1}
            disabled={disabled}
            placeholder={isStreaming ? '正在生成回复…' : '输入消息…'}
            aria-label="消息内容"
            style={{ fontSize: `${Math.max(14, fontSize)}px` }}
            className="placeholder:text-muted-foreground/60 max-h-[168px] min-h-10 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 leading-relaxed outline-none disabled:cursor-not-allowed disabled:opacity-60"
          />
          {isStreaming ? (
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={onStop}
              aria-label="停止生成"
              className="mb-0.5 size-10 shrink-0"
            >
              <Square className="fill-current" />
            </Button>
          ) : (
            <Button
              type="button"
              size="icon"
              onClick={() => void submit()}
              disabled={!value.trim() || sending || disabled}
              aria-label="发送消息"
              className="mb-0.5 size-10 shrink-0"
            >
              {sending ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
            </Button>
          )}
        </div>
        <div className="text-muted-foreground mt-1.5 hidden items-center px-1 text-[10px] sm:flex">
          <span>Enter 发送 · Shift + Enter 换行</span>
        </div>
      </div>
    </div>
  )
}
