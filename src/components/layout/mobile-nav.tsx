import * as DialogPrimitive from '@radix-ui/react-dialog'
import { BookMarked, Layers, Menu, MoonStar, Plus, Settings, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { CharacterAvatar } from '@/features/tavern/components/avatar'
import { useCharacters, useChats } from '@/features/tavern/hooks/use-tavern'
import { formatRelativeTime } from '@/features/tavern/lib/format'

const menuLinks = [
  { to: '/loadouts', label: '配套', hint: '角色与叙事组合', icon: Layers },
  { to: '/settings', label: '设置', hint: '连接与偏好', icon: Settings },
  { to: '/import', label: '导入区', hint: '角色卡与内容', icon: BookMarked },
]

export function MobileNav() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const chatsQuery = useChats()
  const charactersQuery = useCharacters()
  const sessions = chatsQuery.data?.items ?? []
  const characterMap = new Map(
    (charactersQuery.data?.items ?? []).map((character) => [character.id, character]),
  )

  function openMenu() {
    setOpen(true)
    chatsQuery.refresh()
  }

  function startNewChat() {
    setOpen(false)
    navigate('/?new=1')
  }

  function openSession(sessionId: string) {
    setOpen(false)
    navigate(`/chat/${sessionId}`)
  }

  return (
    <>
      <header className="bg-background/88 fixed inset-x-0 top-0 z-40 border-b pt-[var(--safe-top)] backdrop-blur-xl lg:hidden">
        <div className="flex h-14 items-center gap-3 px-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="打开菜单"
            onClick={openMenu}
            className="text-foreground bg-card/70 border"
          >
            <Menu className="size-5" />
          </Button>
          <Link to="/" className="font-display text-lg font-semibold tracking-[0.08em]">
            小白酒馆
          </Link>
          <span className="text-muted-foreground ml-auto text-[10px] font-semibold tracking-[0.16em] uppercase">
            本地
          </span>
        </div>
      </header>

      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-[2px]" />
          <DialogPrimitive.Content
            data-testid="mobile-menu"
            className="bg-sidebar text-sidebar-foreground data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:animate-in data-[state=open]:slide-in-from-left fixed inset-y-0 left-0 z-50 flex h-dvh w-[min(86vw,21rem)] flex-col border-r border-white/10 shadow-2xl duration-200 outline-none"
          >
            <DialogPrimitive.Title className="sr-only">导航菜单</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              查看最近对话、新建对话，或前往设置与导入。
            </DialogPrimitive.Description>

            <div className="flex min-h-20 shrink-0 items-center gap-3 px-5 pt-[var(--safe-top)]">
              <div className="relative flex size-10 items-center justify-center rounded-2xl bg-white/8 ring-1 ring-white/12">
                <MoonStar className="size-5 text-white" strokeWidth={1.7} />
                <span className="bg-chart-3 ring-sidebar absolute -top-0.5 -right-0.5 size-2 rounded-full ring-2" />
              </div>
              <div className="min-w-0">
                <p className="font-display truncate text-xl font-semibold tracking-[0.08em] text-white">
                  小白酒馆
                </p>
                <p className="text-sidebar-muted text-[10px] tracking-[0.2em] uppercase">
                  最近的对话
                </p>
              </div>
              <DialogPrimitive.Close
                aria-label="关闭菜单"
                className="text-sidebar-muted ml-auto rounded-lg p-2 transition-colors hover:bg-white/8 hover:text-white"
              >
                <X className="size-4" />
              </DialogPrimitive.Close>
            </div>

            <div className="border-sidebar-border flex min-h-0 flex-1 flex-col border-t">
              <div className="flex shrink-0 items-center justify-between px-4 py-3">
                <p className="text-sidebar-muted px-1 text-[10px] font-semibold tracking-[0.18em] uppercase">
                  对话
                </p>
                <button
                  type="button"
                  aria-label="新建聊天"
                  onClick={startNewChat}
                  className="bg-chart-3 text-avatar-ink hover:bg-chart-3/90 flex size-8 items-center justify-center rounded-full transition-colors"
                >
                  <Plus className="size-4" strokeWidth={2.2} />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
                {chatsQuery.isLoading && !chatsQuery.data ? (
                  <div className="space-y-2 px-2">
                    {Array.from({ length: 4 }, (_, index) => (
                      <div key={index} className="h-14 animate-pulse rounded-xl bg-white/5" />
                    ))}
                  </div>
                ) : chatsQuery.error ? (
                  <div className="mx-2 rounded-xl border border-white/10 bg-white/[0.04] p-4 text-center">
                    <p className="text-xs font-semibold text-white">对话列表没有加载出来</p>
                    <p className="text-sidebar-muted mt-1 text-[11px]">{chatsQuery.error}</p>
                    <button
                      type="button"
                      onClick={() => chatsQuery.refresh()}
                      className="text-chart-3 mt-3 text-xs font-semibold"
                    >
                      重新加载
                    </button>
                  </div>
                ) : sessions.length === 0 ? (
                  <div className="mx-2 rounded-xl border border-dashed border-white/12 px-4 py-8 text-center">
                    <p className="text-sm font-semibold text-white">还没有对话</p>
                    <p className="text-sidebar-muted mt-1 text-[11px] leading-relaxed">
                      点上方的小加号，用一套配套开始第一段对话。
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {sessions.map((session) => {
                      const character = characterMap.get(session.characterId)
                      return (
                        <button
                          key={session.id}
                          type="button"
                          onClick={() => openSession(session.id)}
                          className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-white/6"
                        >
                          <CharacterAvatar
                            name={character?.name ?? '旅人'}
                            tone={character?.avatarTone ?? 0}
                            size="sm"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-sm font-semibold text-white">
                                {session.title}
                              </span>
                              <span className="text-sidebar-muted ml-auto shrink-0 text-[9px]">
                                {formatRelativeTime(session.updatedAt)}
                              </span>
                            </span>
                            <span className="text-sidebar-muted mt-0.5 block truncate text-[11px]">
                              {session.lastMessagePreview}
                            </span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            <nav className="border-sidebar-border grid shrink-0 grid-cols-3 gap-2 border-t p-3 pb-[calc(0.75rem+var(--safe-bottom))]">
              {menuLinks.map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setOpen(false)}
                    className="flex min-w-0 flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-2 py-2.5 text-center transition-colors hover:bg-white/6"
                  >
                    <span className="text-chart-3 flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/6">
                      <Icon className="size-4" />
                    </span>
                    <span className="w-full min-w-0">
                      <span className="block truncate text-xs font-semibold text-white">
                        {item.label}
                      </span>
                      <span className="text-sidebar-muted mt-0.5 block truncate text-[9px]">
                        {item.hint}
                      </span>
                    </span>
                  </Link>
                )
              })}
            </nav>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  )
}
