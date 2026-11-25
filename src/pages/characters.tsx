import { Plus, Search, Upload, UsersRound } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { getCharacterTags } from '@/features/tavern/api'
import { CharacterAvatar } from '@/features/tavern/components/avatar'
import { CharacterFormDialog } from '@/features/tavern/components/character-form-dialog'
import { EmptyState } from '@/features/tavern/components/empty-state'
import { PageHeader } from '@/features/tavern/components/page-header'
import { useAsyncData, useCharacters } from '@/features/tavern/hooks/use-tavern'
import type { Character } from '@/features/tavern/types'
import { cn } from '@/lib/cn'

export function CharactersPage() {
  const [params, setParams] = useSearchParams()
  const search = params.get('q') ?? ''
  const tag = params.get('tag') ?? ''
  const [formOpen, setFormOpen] = useState(() => params.get('new') === '1')
  const charactersQuery = useCharacters({ search: search || undefined, tag: tag || undefined })
  const tagsQuery = useAsyncData((signal) => getCharacterTags(signal), 'character-tags')

  function updateFilters(next: { q?: string; tag?: string }) {
    const query = next.q ?? search
    const nextTag = next.tag ?? tag
    const updated = new URLSearchParams()
    if (query) updated.set('q', query)
    if (nextTag) updated.set('tag', nextTag)
    setParams(updated)
  }

  const items = charactersQuery.data?.items ?? []
  const tags = tagsQuery.data?.items ?? []

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="人物与开场"
        title="角色库"
        description="每个角色都有自己的灯光、说话方式和没有说完的过去。"
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/import/files">
                <Upload />
                导入角色卡
              </Link>
            </Button>
            <Button onClick={() => setFormOpen(true)}>
              <Plus />
              新建角色
            </Button>
          </>
        }
      />

      <div className="space-y-3">
        <form
          className="relative w-full sm:max-w-sm"
          onSubmit={(event) => {
            event.preventDefault()
            const query = String(new FormData(event.currentTarget).get('q') ?? '').trim()
            updateFilters({ q: query })
          }}
        >
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            key={search}
            name="q"
            defaultValue={search}
            placeholder="搜索名字、背景或标签"
            aria-label="搜索角色"
            className="bg-card h-10 pr-16 pl-9"
          />
          <Button
            type="submit"
            size="sm"
            variant="ghost"
            className="absolute top-1/2 right-1 -translate-y-1/2 text-xs"
          >
            搜索
          </Button>
        </form>

        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          <FilterTag active={!tag} onClick={() => updateFilters({ tag: '' })}>
            全部
          </FilterTag>
          {tags.map((item) => (
            <FilterTag
              key={item}
              active={tag === item}
              onClick={() => updateFilters({ tag: tag === item ? '' : item })}
            >
              {item}
            </FilterTag>
          ))}
        </div>
      </div>

      {charactersQuery.isLoading && !charactersQuery.data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-56 rounded-2xl" />
          ))}
        </div>
      ) : charactersQuery.error ? (
        <div className="border-destructive/20 bg-destructive/5 rounded-2xl border p-5">
          <p className="text-destructive font-semibold">角色库没有加载出来</p>
          <p className="text-muted-foreground mt-1 text-sm">{charactersQuery.error}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={charactersQuery.refresh}>
            重新加载
          </Button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title={search || tag ? '没有符合条件的角色' : '角色库还是空的'}
          description={
            search || tag
              ? '试试更短的关键词，或清除标签筛选。'
              : '导入 SillyTavern PNG/JSON 角色卡，或者手动写下第一个人物。'
          }
          action={
            search || tag ? (
              <Button variant="outline" onClick={() => setParams({})}>
                清除筛选
              </Button>
            ) : (
              <Button asChild>
                <Link to="/import/files">
                  <Upload />
                  去导入角色卡
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((character) => (
            <CharacterCard key={character.id} character={character} />
          ))}
        </div>
      )}

      <CharacterFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={() => charactersQuery.refresh()}
      />
    </div>
  )
}

function FilterTag({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'border-primary/30 bg-primary/10 text-primary'
          : 'bg-card text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function CharacterCard({ character }: { character: Character }) {
  return (
    <Link
      to={`/characters/${character.id}`}
      className="bg-card group focus-visible:ring-ring flex flex-col rounded-2xl border p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:outline-none"
    >
      <div className="flex items-start gap-3">
        <CharacterAvatar name={character.name} tone={character.avatarTone} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-display truncate text-lg font-semibold">{character.name}</h2>
            {character.source === 'import' && <Badge variant="outline">导入</Badge>}
          </div>
          <p className="text-muted-foreground mt-1 line-clamp-2 text-xs leading-relaxed">
            {character.tagline.trim() || '未提供'}
          </p>
        </div>
      </div>
      <p className="text-muted-foreground mt-4 line-clamp-3 flex-1 text-xs leading-relaxed">
        {character.description.trim() || '未提供'}
      </p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {character.tags.length > 0 ? (
          character.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px]"
            >
              {tag}
            </span>
          ))
        ) : (
          <span className="text-muted-foreground text-[10px]">未提供标签</span>
        )}
      </div>
      <div className="border-border/70 mt-4 flex items-center justify-between border-t pt-3 text-[11px]">
        <span className="text-muted-foreground">
          {character.tags.length ? `${character.tags.length} 个标签` : '未提供标签'}
        </span>
        <span className="text-primary font-semibold group-hover:underline">进入角色 →</span>
      </div>
    </Link>
  )
}
