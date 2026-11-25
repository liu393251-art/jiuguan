import {
  Check,
  CheckSquare,
  Layers,
  MessagesSquare,
  Plus,
  Search,
  Trash2,
  UsersRound,
  X,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { bulkDeleteChats, createChatFromLoadout, getErrorMessage } from '@/features/tavern/api'
import { CharacterAvatar } from '@/features/tavern/components/avatar'
import { ConfirmDialog } from '@/features/tavern/components/confirm-dialog'
import { EmptyState } from '@/features/tavern/components/empty-state'
import { PageHeader } from '@/features/tavern/components/page-header'
import { useCharacters, useChats, useLoadouts } from '@/features/tavern/hooks/use-tavern'
import { formatRelativeTime } from '@/features/tavern/lib/format'
import type { ChatSession, Character, Loadout } from '@/features/tavern/types'
import { cn } from '@/lib/cn'

export function HomePage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const search = params.get('q') ?? ''
  const newRequested = params.get('new') === '1'
  const chatsQuery = useChats(search)
  const charactersQuery = useCharacters()
  const loadoutsQuery = useLoadouts()
  const [selectionMode, setSelectionMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [manualNewChatOpen, setManualNewChatOpen] = useState(false)
  const [startingId, setStartingId] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const sessions = chatsQuery.data?.items ?? []
  const characters = charactersQuery.data?.items ?? []
  const loadouts = loadoutsQuery.data?.items ?? []
  const characterMap = new Map(characters.map((character) => [character.id, character]))
  const newChatOpen = manualNewChatOpen || newRequested

  function setNewChatOpen(open: boolean) {
    setManualNewChatOpen(open)
    if (!open && newRequested) {
      const next = new URLSearchParams(params)
      next.delete('new')
      setParams(next, { replace: true })
    }
  }

  function toggleSelected(sessionId: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(sessionId)) next.delete(sessionId)
      else next.add(sessionId)
      return next
    })
  }

  function startSelection(sessionId?: string) {
    setSelectionMode(true)
    if (sessionId) setSelected(new Set([sessionId]))
  }

  function cancelSelection() {
    setSelectionMode(false)
    setSelected(new Set())
  }

  async function handleDelete() {
    if (selected.size === 0) return
    setDeleting(true)
    try {
      const result = await bulkDeleteChats([...selected])
      toast.success(`已删除 ${result.removed} 段对话`)
      setConfirmOpen(false)
      cancelSelection()
      chatsQuery.refresh()
    } catch (error) {
      toast.error('批量删除失败', { description: getErrorMessage(error) })
    } finally {
      setDeleting(false)
    }
  }

  async function handleStart(loadout: Loadout) {
    setStartingId(loadout.id)
    try {
      const session = await createChatFromLoadout(loadout.id)
      toast.success(`已用「${loadout.name}」开始对话`)
      navigate(`/chat/${session.id}`)
    } catch (error) {
      toast.error('无法开始对话', { description: getErrorMessage(error) })
    } finally {
      setStartingId(null)
    }
  }

  function handleNewChat() {
    setNewChatOpen(true)
  }

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="小白酒馆 · 今夜"
        title="对话"
        description="窗外的声音留给城市。这里只保存你愿意说出口的那一部分。"
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => (selectionMode ? cancelSelection() : setSelectionMode(true))}
              disabled={sessions.length === 0 && !selectionMode}
            >
              <CheckSquare />
              {selectionMode ? '退出多选' : '多选删除'}
            </Button>
            <Button onClick={handleNewChat}>
              <Plus />
              新建聊天
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form
          className="relative w-full sm:max-w-sm"
          onSubmit={(event) => {
            event.preventDefault()
            const query = String(new FormData(event.currentTarget).get('q') ?? '').trim()
            setParams(query ? { q: query } : {})
          }}
        >
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            key={search}
            name="q"
            defaultValue={search}
            placeholder="搜索对话、角色或最后一句话"
            aria-label="搜索对话"
            className="bg-card h-10 pr-16 pl-9"
          />
          {search && (
            <button
              type="button"
              aria-label="清空搜索"
              onClick={() => setParams({})}
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-10 -translate-y-1/2 p-1"
            >
              <X className="size-3.5" />
            </button>
          )}
          <Button
            type="submit"
            size="sm"
            variant="ghost"
            className="absolute top-1/2 right-1 -translate-y-1/2 text-xs"
          >
            搜索
          </Button>
        </form>

        <div className="text-muted-foreground flex min-w-0 flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline" className="bg-card">
            <span className="bg-success size-1.5 rounded-full" />
            本地保存
          </Badge>
          <span>{sessions.length} 段对话</span>
          <span className="text-border">/</span>
          <span>{loadouts.length} 套配套</span>
        </div>
      </div>

      {selectionMode && (
        <div className="bg-card flex flex-wrap items-center gap-2 rounded-xl border p-3 shadow-sm">
          <span className="mr-auto text-sm font-semibold">已选 {selected.size} 段对话</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelected(new Set(sessions.map((session) => session.id)))}
          >
            全选
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={selected.size === 0}
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 />
            删除{selected.size > 0 ? ` ${selected.size} 段` : ''}
          </Button>
          <Button variant="ghost" size="sm" onClick={cancelSelection}>
            取消
          </Button>
        </div>
      )}

      {chatsQuery.isLoading && !chatsQuery.data ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : chatsQuery.error ? (
        <div className="border-destructive/20 bg-destructive/5 rounded-2xl border p-5">
          <p className="text-destructive font-semibold">对话列表没有加载出来</p>
          <p className="text-muted-foreground mt-1 text-sm">{chatsQuery.error}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={chatsQuery.refresh}>
            重新加载
          </Button>
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title={search ? '没有找到这段对话' : '今夜还没有开口'}
          description={
            search
              ? '换一个关键词，或者回到全部对话。'
              : '点“新建聊天”，选一位角色或一套配套，就能开始第一段对话。'
          }
          action={
            search ? (
              <Button variant="outline" onClick={() => setParams({})}>
                回到全部对话
              </Button>
            ) : (
              <Button onClick={handleNewChat}>
                <Plus />
                新建聊天
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => {
            const character = characterMap.get(session.characterId)
            return (
              <ChatRow
                key={session.id}
                session={session}
                character={character}
                selectionMode={selectionMode}
                selected={selected.has(session.id)}
                onToggle={() => toggleSelected(session.id)}
                onOpen={() => navigate(`/chat/${session.id}`)}
                onLongPress={() => startSelection(session.id)}
              />
            )
          })}
        </div>
      )}

      <Dialog open={newChatOpen} onOpenChange={setNewChatOpen}>
        <DialogContent className="max-h-[80dvh] max-w-lg">
          <DialogHeader>
            <DialogTitle>今晚用哪套配套？</DialogTitle>
            <DialogDescription>
              配套已经把角色、预设、世界书、正则和记忆组合好，选一套就能开始。
            </DialogDescription>
          </DialogHeader>
          <div className="-mx-1 max-h-[52dvh] space-y-2 overflow-y-auto px-1">
            {loadoutsQuery.isLoading &&
              Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-16 rounded-xl" />
              ))}
            {!charactersQuery.isLoading && characters.length === 0 && (
              <EmptyState
                icon={UsersRound}
                title="还没有可以开聊的角色"
                description="先去导入区导入角色卡，或在角色库新建角色；回来就能选择配套开始聊天。"
                className="py-8"
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button asChild size="sm">
                      <Link to="/import">打开导入区</Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link to="/characters?new=1">新建角色</Link>
                    </Button>
                  </div>
                }
              />
            )}
            {!loadoutsQuery.isLoading && characters.length > 0 && loadouts.length === 0 && (
              <EmptyState
                icon={Layers}
                title="还没有配套"
                description="去配套页把角色卡和预设、世界书、正则组合起来，之后每次开聊都能直接选。"
                className="py-8"
                action={
                  <Button asChild size="sm">
                    <Link to="/loadouts">去创建配套</Link>
                  </Button>
                }
              />
            )}
            {loadouts.map((loadout) => {
              const character = characterMap.get(loadout.characterId)
              return (
                <button
                  key={loadout.id}
                  type="button"
                  onClick={() => void handleStart(loadout)}
                  disabled={startingId !== null}
                  className="hover:bg-muted/60 flex w-full min-w-0 items-center gap-3 rounded-xl border p-3 text-left transition-colors disabled:opacity-60"
                >
                  <CharacterAvatar
                    name={character?.name ?? '旅人'}
                    tone={character?.avatarTone ?? 0}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{loadout.name}</span>
                    <span className="text-muted-foreground mt-0.5 block truncate text-xs">
                      {character?.name ?? '角色已删除'} · {loadout.worldBookIds.length} 世界书 ·{' '}
                      {loadout.regexRuleIds.length} 正则
                    </span>
                  </span>
                  <span className="text-primary shrink-0 text-xs font-semibold">
                    {startingId === loadout.id ? '正在点亮…' : '开始'}
                  </span>
                </button>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`删除 ${selected.size} 段对话？`}
        description="对话和其中的消息会一起从当前浏览器移除，无法撤销。角色和内容库不会受影响。"
        confirmLabel={`删除 ${selected.size} 段`}
        loading={deleting}
        onConfirm={() => void handleDelete()}
      />
    </div>
  )
}

function ChatRow({
  session,
  character,
  selectionMode,
  selected,
  onToggle,
  onOpen,
  onLongPress,
}: {
  session: ChatSession
  character?: Character
  selectionMode: boolean
  selected: boolean
  onToggle: () => void
  onOpen: () => void
  onLongPress: () => void
}) {
  const timer = useRef<number | null>(null)
  const longPressed = useRef(false)

  function clearTimer() {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
  }

  function handleClick() {
    if (longPressed.current) {
      longPressed.current = false
      return
    }
    if (selectionMode) onToggle()
    else onOpen()
  }

  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={`chat-row-${session.id}`}
      onPointerDown={() => {
        clearTimer()
        longPressed.current = false
        timer.current = window.setTimeout(() => {
          longPressed.current = true
          onLongPress()
        }, 460)
      }}
      onPointerUp={clearTimer}
      onPointerCancel={clearTimer}
      onPointerLeave={clearTimer}
      onClick={handleClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          handleClick()
        }
      }}
      className={cn(
        'long-pressable bg-card group focus-visible:ring-ring flex w-full cursor-pointer items-center gap-3.5 rounded-2xl border p-3.5 text-left shadow-sm transition-all outline-none hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 sm:p-4',
        selected && 'border-primary/50 bg-primary/[0.045] ring-primary/20 ring-1',
      )}
    >
      {selectionMode && (
        <span
          className={cn(
            'flex size-5 shrink-0 items-center justify-center rounded-full border',
            selected ? 'bg-primary border-primary text-primary-foreground' : 'border-input',
          )}
          onClick={(event) => {
            event.stopPropagation()
            onToggle()
          }}
        >
          {selected && <Check className="size-3" />}
        </span>
      )}
      <CharacterAvatar name={character?.name ?? '旅人'} tone={character?.avatarTone ?? 0} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold sm:text-base">{session.title}</p>
          <span className="text-muted-foreground hidden shrink-0 text-[10px] sm:block">
            {character?.name}
          </span>
        </div>
        <p className="text-muted-foreground mt-1 line-clamp-1 text-xs leading-relaxed sm:text-sm">
          {session.lastMessagePreview}
        </p>
        <div className="text-muted-foreground mt-2 flex items-center gap-2 text-[10px]">
          <span>{formatRelativeTime(session.updatedAt)}</span>
          <span className="text-border">·</span>
          <span>{session.messageCount} 条消息</span>
          <span className="text-border hidden sm:inline">·</span>
          <span className="hidden sm:inline">{session.fontSize}px</span>
        </div>
      </div>
      <span className="text-muted-foreground group-hover:text-primary hidden text-xs font-medium sm:block">
        继续
      </span>
    </div>
  )
}
