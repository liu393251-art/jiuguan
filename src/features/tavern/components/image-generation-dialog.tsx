import { Image as ImageIcon, Loader2, Sparkles, WandSparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createUuid } from '@/lib/id'
import { getErrorMessage } from '@/services/http'

import { generateImage } from '../api'
import type { GeneratedImage } from '../lib/image-generation'
import { IMAGE_QUALITY_OPTIONS, IMAGE_SIZE_OPTIONS } from '../lib/image-options'
import {
  imagePromptModeHint,
  imagePromptModeLabel,
  isAutoImagePromptMode,
  type AutoImagePromptMode,
} from '../lib/image-prompt'
import { deleteGeneratedImages, putGeneratedImage } from '../lib/image-store'
import type {
  CreateImageMessageInput,
  ImageGenerationSettings,
  ImagePromptMode,
  ImageQuality,
  ImageSize,
} from '../types'

const selectClass =
  'border-input bg-background focus-visible:border-ring h-10 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/20'

const BASE_MODES: ImagePromptMode[] = [
  'free',
  'character',
  'face',
  'persona',
  'story',
  'last',
  'raw-last',
  'background',
]

type Preview = {
  id: string
  result: GeneratedImage
  url: string
  prompt: string
}

type Phase = 'idle' | 'prompt' | 'image'

export function ImageGenerationDialog({
  open,
  config,
  characterName,
  initialMode = 'free',
  initialPrompt = '',
  lastMessageText = '',
  onOpenChange,
  onGeneratePrompt,
  onAttach,
}: {
  open: boolean
  config: ImageGenerationSettings
  characterName: string
  initialMode?: ImagePromptMode
  initialPrompt?: string
  lastMessageText?: string
  onOpenChange: (open: boolean) => void
  onGeneratePrompt: (mode: AutoImagePromptMode, signal: AbortSignal) => Promise<string>
  onAttach: (input: CreateImageMessageInput) => Promise<void>
}) {
  const selectedMessagePrompt = initialMode === 'message' ? initialPrompt.trim() : ''
  const availableModes = selectedMessagePrompt
    ? (['message', ...BASE_MODES] as ImagePromptMode[])
    : BASE_MODES
  const [mode, setMode] = useState<ImagePromptMode>(
    availableModes.includes(initialMode) ? initialMode : 'free',
  )
  const [prompt, setPrompt] = useState(
    initialMode === 'raw-last' ? lastMessageText.trim() : selectedMessagePrompt,
  )
  const [size, setSize] = useState<ImageSize>(config.size)
  const [quality, setQuality] = useState<ImageQuality>(config.quality)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const previewUrlRef = useRef('')
  const configured = Boolean(config.baseUrl.trim() && config.model.trim())
  const autoPrompt = isAutoImagePromptMode(mode)
  const busy = phase !== 'idle' || saving

  function clearPreview() {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = ''
    setPreview(null)
  }

  useEffect(
    () => () => {
      abortRef.current?.abort()
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    },
    [],
  )

  function close() {
    if (busy) return
    onOpenChange(false)
  }

  function selectMode(next: ImagePromptMode) {
    if (busy || next === mode) return
    clearPreview()
    setError('')
    setMode(next)
    if (next === 'message') {
      setPrompt(selectedMessagePrompt)
    } else if (next === 'raw-last') {
      setPrompt(lastMessageText.trim())
    } else {
      setPrompt('')
    }
  }

  async function requestPrompt(controller: AbortController) {
    if (!autoPrompt) return prompt.trim()
    const generated = await onGeneratePrompt(mode, controller.signal)
    if (controller.signal.aborted) return ''
    setPrompt(generated)
    return generated
  }

  async function generatePromptOnly() {
    if (!autoPrompt || busy) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setError('')
    clearPreview()
    setPhase('prompt')
    try {
      const generated = await requestPrompt(controller)
      if (!generated) throw new Error('聊天模型没有返回可用的画面提示词。')
    } catch (caught) {
      if (caught instanceof Error && caught.name === 'AbortError') return
      setError(getErrorMessage(caught))
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      if (!controller.signal.aborted) setPhase('idle')
    }
  }

  async function generate() {
    if (!configured || busy) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    clearPreview()
    setError('')
    setPhase('prompt')
    try {
      const finalPrompt = prompt.trim() || (await requestPrompt(controller))
      if (!finalPrompt) {
        throw new Error(
          autoPrompt
            ? '聊天模型没有返回可用的画面提示词，请重试或改用自由描述。'
            : '请先填写画面描述。',
        )
      }
      setPhase('image')
      const result = await generateImage(config, {
        prompt: finalPrompt,
        size,
        quality,
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      const url = URL.createObjectURL(result.blob)
      previewUrlRef.current = url
      setPreview({
        id: createUuid(),
        result,
        url,
        prompt: finalPrompt,
      })
    } catch (caught) {
      if (caught instanceof Error && caught.name === 'AbortError') return
      setError(getErrorMessage(caught))
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      if (!controller.signal.aborted) setPhase('idle')
    }
  }

  async function regenerateImage() {
    if (!preview || busy) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setError('')
    setPhase('image')
    try {
      const result = await generateImage(config, {
        prompt: preview.prompt,
        size,
        quality,
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
      const url = URL.createObjectURL(result.blob)
      previewUrlRef.current = url
      setPreview({
        id: createUuid(),
        result,
        url,
        prompt: preview.prompt,
      })
    } catch (caught) {
      if (caught instanceof Error && caught.name === 'AbortError') return
      setError(getErrorMessage(caught))
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      if (!controller.signal.aborted) setPhase('idle')
    }
  }

  async function attach() {
    if (!preview || busy) return
    setSaving(true)
    setError('')
    try {
      await putGeneratedImage(preview.id, preview.result.blob, preview.result.mimeType)
      try {
        await onAttach({
          id: preview.id,
          prompt: preview.prompt,
          revisedPrompt: preview.result.revisedPrompt,
          model: preview.result.model,
          size: preview.result.size,
          mimeType: preview.result.mimeType,
        })
      } catch (caught) {
        await deleteGeneratedImages([preview.id]).catch(() => {})
        throw caught
      }
      toast.success('图片已发送到当前对话')
      onOpenChange(false)
    } catch (caught) {
      setError(getErrorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  const sizeHint =
    mode === 'face' || mode === 'persona'
      ? '肖像模式建议使用竖图尺寸。'
      : mode === 'background'
        ? '背景模式建议使用横图尺寸。'
        : ''

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && busy) return
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="size-4" />
            为「{characterName}」生成图片
          </DialogTitle>
          <DialogDescription>
            自由描述和原文模式直接使用当前文字；其他模式会先用聊天 API
            把角色卡或聊天上下文写成画面提示词，再交给生图 API。
          </DialogDescription>
        </DialogHeader>

        {!configured ? (
          <div className="space-y-3 rounded-xl border border-amber-500/25 bg-amber-500/8 p-4">
            <p className="text-sm font-semibold">还没有配置生图 API</p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              需要填写 Base URL 和模型名后才能生成图片。聊天 API 与生图 API
              分开配置，可以使用不同服务商。
            </p>
            <Button asChild size="sm" variant="outline">
              <Link to="/settings?section=images">去设置生图 API</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="image-source">画面来源</Label>
              <select
                id="image-source"
                value={mode}
                onChange={(event) => selectMode(event.target.value as ImagePromptMode)}
                className={selectClass}
                disabled={busy}
              >
                {availableModes.map((option) => (
                  <option
                    key={option}
                    value={option}
                    disabled={option === 'raw-last' && !lastMessageText.trim()}
                  >
                    {imagePromptModeLabel(option)}
                  </option>
                ))}
              </select>
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                {imagePromptModeHint(mode)}
                {autoPrompt && ' 使用当前会话的聊天 API。'}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="image-prompt">画面提示词</Label>
                <div className="flex items-center gap-2">
                  {autoPrompt && (
                    <button
                      type="button"
                      className="text-primary inline-flex items-center gap-1 text-[11px] font-semibold disabled:opacity-50"
                      onClick={() => void generatePromptOnly()}
                      disabled={busy}
                    >
                      <WandSparkles className="size-3" />
                      {prompt.trim() ? '重新生成提示词' : '只生成提示词'}
                    </button>
                  )}
                  {mode === 'message' && (
                    <span className="text-muted-foreground text-[11px]">来自选中消息</span>
                  )}
                  {mode === 'raw-last' && (
                    <span className="text-muted-foreground text-[11px]">来自最后一条消息</span>
                  )}
                </div>
              </div>
              <Textarea
                id="image-prompt"
                value={prompt}
                onChange={(event) => {
                  setPrompt(event.target.value)
                  if (preview) clearPreview()
                }}
                placeholder={
                  autoPrompt
                    ? '可以直接点“生成图片”自动写提示词；也可以点“只生成提示词”后先检查、修改。'
                    : '例如：雨夜车站，角色靠在玻璃窗边，暖色站灯，电影感构图，细节丰富'
                }
                className="min-h-28"
                disabled={busy}
                maxLength={4000}
              />
              {autoPrompt && prompt.trim() && (
                <p className="text-muted-foreground text-[11px]">
                  这是聊天模型写出的提示词，已经可以手动修改；改动后再生成图片会直接使用当前文字。
                </p>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="image-size">尺寸</Label>
                <select
                  id="image-size"
                  value={size}
                  onChange={(event) => {
                    setSize(event.target.value as ImageSize)
                    if (preview) clearPreview()
                  }}
                  className={selectClass}
                  disabled={busy}
                >
                  {IMAGE_SIZE_OPTIONS.filter(
                    (option) =>
                      option.value !== '512x512' ||
                      config.model.toLowerCase().startsWith('dall-e-2'),
                  ).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="image-quality">质量</Label>
                <select
                  id="image-quality"
                  value={quality}
                  onChange={(event) => {
                    setQuality(event.target.value as ImageQuality)
                    if (preview) clearPreview()
                  }}
                  className={selectClass}
                  disabled={busy}
                >
                  {IMAGE_QUALITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <p className="text-muted-foreground text-[11px] leading-relaxed">
              {sizeHint && `${sizeHint} `}
              不同服务商支持的尺寸和质量不同；如果接口报参数错误，设为“由接口决定”和“自动”。模型：
              {config.model}
            </p>

            {error && <p className="text-destructive text-xs leading-relaxed">{error}</p>}

            {preview && (
              <div className="bg-muted/25 overflow-hidden rounded-xl border">
                <img
                  src={preview.url}
                  alt={preview.prompt}
                  className="mx-auto max-h-[35vh] w-auto max-w-full object-contain sm:max-h-[52vh]"
                />
                <div className="flex flex-wrap items-center justify-between gap-2 border-t p-2.5">
                  <p className="text-muted-foreground text-[10px]">
                    {preview.result.model} · {preview.result.size}
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void regenerateImage()}
                    disabled={busy}
                  >
                    重新生成图片
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        <DialogFooter className="bg-card sticky bottom-0 z-10">
          <Button variant="outline" onClick={close} disabled={busy}>
            取消
          </Button>
          {preview ? (
            <Button onClick={() => void attach()} disabled={busy}>
              {saving ? <Loader2 className="animate-spin" /> : <ImageIcon />}
              发送到对话
            </Button>
          ) : (
            <Button
              onClick={() => void generate()}
              disabled={!configured || busy || (!prompt.trim() && !autoPrompt)}
            >
              {phase !== 'idle' ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {phase === 'prompt'
                ? '正在生成提示词…'
                : phase === 'image'
                  ? '正在生成图片…'
                  : '生成图片'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
