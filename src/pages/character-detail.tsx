import { ArrowLeft, Copy, Loader2, MessageCircleMore, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { createChat, deleteCharacter, getErrorMessage } from '@/features/tavern/api'
import { CharacterAvatar } from '@/features/tavern/components/avatar'
import { CharacterFormDialog } from '@/features/tavern/components/character-form-dialog'
import { ConfirmDialog } from '@/features/tavern/components/confirm-dialog'
import { useCharacter } from '@/features/tavern/hooks/use-tavern'

export function CharacterDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const query = useCharacter(id)
  const character = query.data
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [starting, setStarting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function copyProfile() {
    if (!character) return
    const text = [
      `角色：${character.name}`,
      character.tagline,
      `背景：${character.description}`,
      character.personality && `性格：${character.personality}`,
      character.scenario && `场景：${character.scenario}`,
      `开场白：${character.firstMessage}`,
    ]
      .filter(Boolean)
      .join('\n\n')
    try {
      await navigator.clipboard.writeText(text)
      toast.success('角色资料已复制')
    } catch (error) {
      toast.error('复制失败', { description: getErrorMessage(error) })
    }
  }

  async function startChat() {
    if (!character) return
    setStarting(true)
    try {
      const session = await createChat(character.id)
      navigate(`/chat/${session.id}`)
    } catch (error) {
      toast.error('无法开始对话', { description: getErrorMessage(error) })
    } finally {
      setStarting(false)
    }
  }

  async function removeCharacter() {
    if (!character) return
    setDeleting(true)
    try {
      await deleteCharacter(character.id)
      toast.success(`${character.name} 已从角色库移除`)
      navigate('/characters')
    } catch (error) {
      toast.error('删除失败', { description: getErrorMessage(error) })
    } finally {
      setDeleting(false)
    }
  }

  if (query.isLoading && !character) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-44 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    )
  }

  if (!character) {
    return (
      <div className="border-border bg-card rounded-2xl border p-8 text-center">
        <p className="font-display text-xl font-semibold">这个角色不在这里</p>
        <p className="text-muted-foreground mt-2 text-sm">{query.error ?? '可能已经被删除。'}</p>
        <Button asChild variant="outline" className="mt-5">
          <Link to="/characters">
            <ArrowLeft />
            返回角色库
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Link
        to="/characters"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs font-medium"
      >
        <ArrowLeft className="size-3.5" />
        角色库
      </Link>

      <section className="bg-card relative overflow-hidden rounded-3xl border p-5 shadow-sm sm:p-7">
        <div className="bg-glow/35 pointer-events-none absolute -top-24 -right-16 size-56 rounded-full blur-3xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start">
          <CharacterAvatar name={character.name} tone={character.avatarTone} size="xl" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
                {character.name}
              </h1>
              {character.source === 'import' && <Badge variant="outline">导入角色卡</Badge>}
            </div>
            <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-relaxed">
              {character.tagline.trim() || '未提供'}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {character.tags.length > 0 ? (
                character.tags.map((tag) => (
                  <span
                    key={tag}
                    className="bg-muted text-muted-foreground rounded-full px-2.5 py-1 text-[11px]"
                  >
                    {tag}
                  </span>
                ))
              ) : (
                <span className="text-muted-foreground text-[11px]">未提供标签</span>
              )}
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button onClick={() => void startChat()} disabled={starting}>
                {starting ? <Loader2 className="animate-spin" /> : <MessageCircleMore />}
                开始对话
              </Button>
              <Button variant="outline" onClick={() => void copyProfile()}>
                <Copy />
                复制资料
              </Button>
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil />
                编辑
              </Button>
              <Button
                variant="ghost"
                className="text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 />
                删除
              </Button>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)]">
        <div className="space-y-5">
          <DetailCard title="人物背景" content={character.description} />
          <DetailCard title="性格与说话方式" content={character.personality} />
          <DetailCard title="场景设定" content={character.scenario} />
        </div>
        <div className="space-y-5">
          <DetailCard title="开场白" content={character.firstMessage} accent />
          <DetailCard title="示例对白" content={character.exampleDialogue} />
        </div>
      </div>

      <CharacterFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        character={character}
        onSaved={() => query.refresh()}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`删除 ${character.name}？`}
        description="这个角色以及由该角色创建的所有对话都会一并移除。内容库不会受影响。"
        loading={deleting}
        onConfirm={() => void removeCharacter()}
      />
    </div>
  )
}

function DetailCard({
  title,
  content,
  accent = false,
}: {
  title: string
  content: string
  accent?: boolean
}) {
  return (
    <Card className={accent ? 'border-primary/20 bg-primary/[0.035]' : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm leading-[1.85] whitespace-pre-wrap">
          {content.trim() || '未提供'}
        </p>
      </CardContent>
    </Card>
  )
}
