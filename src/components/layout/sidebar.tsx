import { BookMarked, Layers, MessageCircleMore, MoonStar, Settings, UsersRound } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { NavLink } from 'react-router-dom'

import { cn } from '@/lib/cn'

type NavItem = {
  label: string
  hint: string
  to: string
  icon: LucideIcon
  end?: boolean
}

const navigation: NavItem[] = [
  { label: '对话', hint: '最近对话', to: '/', icon: MessageCircleMore, end: true },
  { label: '配套', hint: '角色与叙事组合', to: '/loadouts', icon: Layers },
  { label: '设置', hint: '连接与偏好', to: '/settings', icon: Settings },
]

export function Sidebar() {
  return (
    <aside className="border-sidebar-border bg-sidebar fixed inset-y-0 left-0 z-40 hidden w-[17rem] flex-col border-r lg:flex">
      <div className="flex h-24 shrink-0 items-center gap-3 px-6">
        <div className="relative flex size-11 items-center justify-center rounded-2xl bg-white/8 ring-1 ring-white/12">
          <MoonStar className="size-5 text-white" strokeWidth={1.7} />
          <span className="bg-chart-3 ring-sidebar absolute -top-0.5 -right-0.5 size-2 rounded-full ring-2" />
        </div>
        <div className="min-w-0">
          <p className="font-display text-xl font-semibold tracking-[0.08em] text-white">
            小白酒馆
          </p>
          <p className="text-sidebar-muted text-[11px] tracking-[0.2em] uppercase">Tavern</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <p className="text-sidebar-muted mb-2 px-3 text-[10px] font-semibold tracking-[0.2em] uppercase">
          酒馆
        </p>
        <nav className="space-y-1.5">
          {navigation.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors',
                    isActive
                      ? 'bg-white/9 text-white ring-1 ring-white/10'
                      : 'text-sidebar-muted hover:bg-white/5 hover:text-white',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span className="bg-chart-3 absolute top-1/2 left-0 h-6 w-0.5 -translate-y-1/2 rounded-full" />
                    )}
                    <Icon
                      className={cn('size-[18px] shrink-0', isActive && 'text-chart-3')}
                      strokeWidth={1.8}
                    />
                    <span className="flex-1">
                      <span className="block text-sm font-semibold">{item.label}</span>
                      <span className="text-sidebar-muted mt-0.5 block text-[11px]">
                        {item.hint}
                      </span>
                    </span>
                  </>
                )}
              </NavLink>
            )
          })}
        </nav>

        <div className="bg-sidebar-border my-5 h-px" />

        <div className="space-y-1">
          <NavLink
            to="/characters"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs transition-colors',
                isActive
                  ? 'bg-white/8 text-white'
                  : 'text-sidebar-muted hover:bg-white/5 hover:text-white',
              )
            }
          >
            <UsersRound className="size-4" />
            角色库
          </NavLink>
          <NavLink
            to="/import"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs transition-colors',
                isActive
                  ? 'bg-white/8 text-white'
                  : 'text-sidebar-muted hover:bg-white/5 hover:text-white',
              )
            }
          >
            <BookMarked className="size-4" />
            导入区
          </NavLink>
        </div>
      </div>

      <div className="border-sidebar-border shrink-0 border-t p-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-white">
            <span className="bg-chart-2 size-1.5 rounded-full" />
            本地保存 · 真实 API
          </div>
          <p className="text-sidebar-muted mt-2 text-[11px] leading-relaxed">
            角色、对话和导入内容都保存在当前设备。聊天只会发送到你选择的 API 连接。
          </p>
        </div>
        <div className="mt-3 flex items-center gap-3 px-1">
          <div className="from-chart-3 to-chart-1 text-avatar-ink flex size-9 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold">
            白
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-white">旅人</p>
            <p className="text-sidebar-muted text-[10px]">小白酒馆 · 本地访客</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
