import { Copy, Download, ImageOff, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getErrorMessage } from '@/services/http'

import { formatDateTime } from '../lib/format'
import { getGeneratedImage } from '../lib/image-store'
import type { ChatMessage, ImageAttachment } from '../types'
import { CharacterAvatar } from './avatar'

function useGeneratedImageUrl(imageId: string | undefined) {
  const [result, setResult] = useState<{
    id: string
    url: string | null
    error: string | null
  } | null>(null)

  useEffect(() => {
    if (!imageId) return

    let active = true
    let objectUrl: string | null = null
    void getGeneratedImage(imageId)
      .then((blob) => {
        if (!active) return
        if (!blob) {
          setResult({ id: imageId, url: null, error: '本机图片库中没有找到这张图。' })
          return
        }
        objectUrl = URL.createObjectURL(blob)
        setResult({ id: imageId, url: objectUrl, error: null })
      })
      .catch((error: unknown) => {
        if (!active) return
        setResult({ id: imageId, url: null, error: getErrorMessage(error) })
      })

    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [imageId])

  if (!imageId) {
    return { url: null, loading: false, error: '图片数据不存在。' }
  }
  if (result?.id !== imageId) {
    return { url: null, loading: true, error: null }
  }
  return { url: result.url, loading: false, error: result.error }
}

function imageExtension(mimeType: string) {
  if (mimeType.includes('jpeg')) return 'jpg'
  if (mimeType.includes('webp')) return 'webp'
  if (mimeType.includes('gif')) return 'gif'
  return 'png'
}

export function GeneratedImageMessage({
  message,
  characterName,
  avatarTone,
}: {
  message: ChatMessage
  characterName: string
  avatarTone: number
}) {
  const image = message.image
  if (!image) return null

  return (
    <ImageMessageCard
      message={message}
      image={image}
      characterName={characterName}
      avatarTone={avatarTone}
    />
  )
}

function ImageMessageCard({
  message,
  image,
  characterName,
  avatarTone,
}: {
  message: ChatMessage
  image: ImageAttachment
  characterName: string
  avatarTone: number
}) {
  const imageState = useGeneratedImageUrl(image.id)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [copying, setCopying] = useState(false)
  const downloadName = `xiaobai-image-${image.id}.${imageExtension(image.mimeType)}`

  async function copyPrompt() {
    setCopying(true)
    try {
      await navigator.clipboard.writeText(image.prompt)
      toast.success('画面描述已复制')
    } catch (error) {
      toast.error('复制失败', { description: getErrorMessage(error) })
    } finally {
      setCopying(false)
    }
  }

  return (
    <article
      className="message-row group px-4 py-3 sm:px-6"
      aria-label={`${characterName}生成的图片`}
      data-message-style="image"
    >
      <div className="mx-auto flex w-full max-w-3xl items-start gap-2.5">
        <CharacterAvatar
          name={characterName}
          tone={avatarTone}
          size="sm"
          className="mt-5 size-8 rounded-xl"
        />
        <div className="max-w-[89%] min-w-0 sm:max-w-[82%]">
          <div className="mb-1 flex items-center gap-2 text-[10px]">
            <span className="text-muted-foreground font-medium">{characterName}</span>
            <span className="text-muted-foreground/60">{formatDateTime(message.createdAt)}</span>
            <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5">
              生成图片
            </span>
          </div>

          <div className="bg-card overflow-hidden rounded-2xl rounded-tl-md border shadow-sm">
            {imageState.loading ? (
              <div className="bg-muted/35 flex min-h-56 items-center justify-center">
                <Loader2 className="text-muted-foreground size-5 animate-spin" />
              </div>
            ) : imageState.url ? (
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                className="block w-full cursor-zoom-in bg-black/5"
                aria-label="查看大图"
              >
                <img
                  src={imageState.url}
                  alt={image.prompt}
                  className="mx-auto max-h-[min(68vh,620px)] w-auto max-w-full object-contain"
                />
              </button>
            ) : (
              <div className="bg-muted/35 text-muted-foreground flex min-h-40 flex-col items-center justify-center gap-2 px-5 text-center">
                <ImageOff className="size-5" />
                <p className="text-xs">{imageState.error || '图片数据不可用。'}</p>
              </div>
            )}

            <div className="space-y-2 p-3">
              <p className="text-foreground/85 line-clamp-3 text-xs leading-relaxed">
                {image.prompt}
              </p>
              {image.revisedPrompt && image.revisedPrompt !== image.prompt && (
                <p className="text-muted-foreground line-clamp-2 text-[11px] leading-relaxed">
                  接口改写：{image.revisedPrompt}
                </p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-muted-foreground text-[10px]">
                  {image.model} · {image.size}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground h-7 px-2 text-[10px]"
                    onClick={() => void copyPrompt()}
                    disabled={copying}
                  >
                    <Copy className="size-3" />
                    提示词
                  </Button>
                  {imageState.url && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground h-7 px-2 text-[10px]"
                      asChild
                    >
                      <a href={imageState.url} download={downloadName}>
                        <Download className="size-3" />
                        下载
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {imageState.url && (
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-4xl p-3 sm:p-4">
            <DialogHeader className="sr-only">
              <DialogTitle>{characterName}生成的图片</DialogTitle>
              <DialogDescription>{image.prompt}</DialogDescription>
            </DialogHeader>
            <img
              src={imageState.url}
              alt={image.prompt}
              className="max-h-[82dvh] w-full rounded-xl object-contain"
            />
          </DialogContent>
        </Dialog>
      )}
    </article>
  )
}
