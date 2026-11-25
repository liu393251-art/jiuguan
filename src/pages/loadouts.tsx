import {
  BookOpen,
  Braces,
  FileText,
  Layers,
  Loader2,
  MessageCircleMore,
  Pencil,
  Plus,
  Trash2,
  Upload,
  UsersRound,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  createChatFromLoadout,
  createLoadout,
  deleteLoadout,
  getErrorMessage,
  updateLoadout,
} from '@/features/tavern/api'
import { CharacterAvatar } from '@/features/tavern/components/avatar'
import { ConfirmDialog } from '@/features/tavern/components/confirm-dialog'
import { EmptyState } from '@/features/tavern/components/empty-state'
import { PageHeader } from '@/features/tavern/components/page-header'
import {
  useCharacters,
  useLoadouts,
  usePresets,
  useRegexRules,
  useWorldBooks,
} from '@/features/tavern/hooks/use-tavern'
import type { Loadout, LoadoutInput, MemoryMode } from '@/features/tavern/types'
import { cn } from '@/lib/cn'

const memoryLabels: Record<MemoryMode, string> = {
  off: '关闭记忆',
  recent: '最近消息',
  summary: '摘要记忆',
  compressed: '压缩记忆',
  vector: '向量长期记忆',
}

const memoryOptions: { value: MemoryMode; label: string; hint: string }[] = [
  { value: 'off', label: '关闭', hint: '不带长期记忆' },
  { value: 'recent', label: '最近消息', hint: '保留最近一段上下文' },
  { value: 'summary', label: '摘要', hint: '自动沉淀长期摘要' },
  { value: 'compressed', label: '压缩', hint: '聊天 API 压缩全部上下文' },
  { value: 'vector', label: '向量', hint: '全部历史本机索引，按语义召回' },
]

const selectClass =
  'border-input bg-background focus-visible:border-ring h-11 w-full min-w-0 rounded-lg border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/20'

const emptyDraft: LoadoutInput = {
  name: '',
  characterId: '',
  presetId: null,
  worldBookIds: [],
  regexRuleIds: [],
  memoryMode: 'recent',
}

export function LoadoutsPage() {
  const navigate = useNavigate()
  const loadoutsQuery = useLoadouts()
  const charactersQuery = useCharacters()
  const presetsQuery = usePresets()
  const worldBooksQuery = useWorldBooks()
  const regexQuery = useRegexRules()
  const [editor, setEditor] = useState<{ open: boolean; value?: Loadout }>({ open: false })
  const [deleteTarget, setDeleteTarget] = useState<Loadout | null>(null)
  const [startingId, setStartingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadouts = loadoutsQuery.data?.items ?? []
  const characters = charactersQuery.data?.items ?? []
  const presets = presetsQuery.data?.items ?? []
  const worldBooks = worldBooksQuery.data?.items ?? []
  const regexRules = regexQuery.data?.items ?? []
  const characterMap = new Map(characters.map((character) => [character.id, character]))
  const presetMap = new Map(presets.map((preset) => [preset.id, preset]))

  const loading =
    (loadoutsQuery.isLoading && !loadoutsQuery.data) ||
    (charactersQuery.isLoading && !charactersQuery.data)

  async function startChat(loadout: Loadout) {
    setStartingId(loadout.id)
    try {
      const session = await createChatFromLoadout(loadout.id)
      navigate(`/chat/${session.id}`)
    } catch (error) {
      toast.error('无法开始对话', { description: getErrorMessage(error) })
    } finally {
      setStartingId(null)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteLoadout(deleteTarget.id)
      toast.success(`「${deleteTarget.name}」已删除`, {
        description: '已有对话会保留，但不再关联这套配套。',
      })
      setDeleteTarget(null)
      loadoutsQuery.refresh()
    } catch (error) {
      toast.error('删除失败', { description: getErrorMessage(error) })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="角色 · 世界书 · 预设 · 正则 · 记忆"
        title="配套"
        description="把角色卡和它需要的设定打包成一套。开始对话时选配套，不用再逐项勾选。"
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/import/files">
                <Upload />
                导入文件
              </Link>
            </Button>
            <Button onClick={() => setEditor({ open: true })} disabled={characters.length === 0}>
              <Plus />
              新建配套
            </Button>
          </>
        }
      />

      <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
        <Link to="/characters" className="hover:text-foreground inline-flex items-center gap-1.5">
          <UsersRound className="size-3.5" />
          角色库
        </Link>
        <span className="text-border">/</span>
        <Link to="/import" className="hover:text-foreground inline-flex items-center gap-1.5">
          <Layers className="size-3.5" />
          导入区
        </Link>
        <span className="text-border">/</span>
        <span>
          {characters.length} 位角色 · {loadouts.length} 套配套
        </span>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-56 rounded-2xl" />
          ))}
        </div>
      ) : loadoutsQuery.error ? (
        <div className="border-destructive/20 bg-destructive/5 rounded-2xl border p-5">
          <p className="text-destructive font-semibold">配套没有加载出来</p>
          <p className="text-muted-foreground mt-1 text-sm">{loadoutsQuery.error}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={loadoutsQuery.refresh}>
            重新加载
          </Button>
        </div>
      ) : loadouts.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="还没有配套"
          description={
            characters.length === 0
              ? '先导入一张角色卡。导入后会自动生成一套默认配套，之后可以自由调整。'
              : '用已有角色组合预设、世界书、正则和记忆方式，保存后就能直接开聊。'
          }
          action={
            characters.length === 0 ? (
              <Button asChild>
                <Link to="/import/files">
                  <Upload />
                  去导入角色卡
                </Link>
              </Button>
            ) : (
              <Button onClick={() => setEditor({ open: true })}>
                <Plus />
                新建配套
              </Button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {loadouts.map((loadout) => {
            const character = characterMap.get(loadout.characterId)
            const preset = loadout.presetId ? presetMap.get(loadout.presetId) : null
            return (
              <Card key={loadout.id} className="flex min-w-0 flex-col">
                <CardContent className="flex flex-1 flex-col p-4">
                  <div className="flex items-start gap-3">
                    <CharacterAvatar
                      name={character?.name ?? '旅人'}
                      tone={character?.avatarTone ?? 0}
                      size="lg"
                    />
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-sm font-semibold">{loadout.name}</h2>
                      <p className="text-muted-foreground mt-0.5 truncate text-xs">
                        {character?.name ?? '角色已删除'}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0">
                      {memoryLabels[loadout.memoryMode]}
                    </Badge>
                  </div>

                  <div className="mt-4 space-y-1.5 text-[11px]">
                    <CompositionRow
                      icon={FileText}
                      label="预设"
                      value={preset?.name ?? '不使用预设'}
                      muted={!preset}
                    />
                    <CompositionRow
                      icon={BookOpen}
                      label="世界书"
                      value={
                        loadout.worldBookIds.length > 0
                          ? `${loadout.worldBookIds.length} 本`
                          : '未绑定'
                      }
                      muted={loadout.worldBookIds.length === 0}
                    />
                    <CompositionRow
                      icon={Braces}
                      label="正则"
                      value={
                        loadout.regexRuleIds.length > 0
                          ? `${loadout.regexRuleIds.length} 条`
                          : '未绑定'
                      }
                      muted={loadout.regexRuleIds.length === 0}
                    />
                  </div>

                  <div className="mt-4 flex items-center gap-1 border-t pt-3">
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => void startChat(loadout)}
                      disabled={startingId !== null || !character}
                    >
                      {startingId === loadout.id ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <MessageCircleMore />
                      )}
                      开始对话
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`编辑 ${loadout.name}`}
                      onClick={() => setEditor({ open: true, value: loadout })}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      aria-label={`删除 ${loadout.name}`}
                      onClick={() => setDeleteTarget(loadout)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {editor.open && (
        <LoadoutEditor
          open
          loadout={editor.value}
          characters={characters}
          presets={presets}
          worldBooks={worldBooks}
          regexRules={regexRules}
          onOpenChange={(open) => setEditor((current) => ({ ...current, open }))}
          onSaved={() => {
            setEditor({ open: false })
            loadoutsQuery.refresh()
          }}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title={`删除「${deleteTarget?.name ?? ''}」？`}
        description="只删除这套组合，不会删除角色卡、世界书、正则或已有对话。已有对话会保留原来的设置，但不再关联这套配套。"
        loading={deleting}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  )
}

function CompositionRow({
  icon: Icon,
  label,
  value,
  muted,
}: {
  icon: typeof FileText
  label: string
  value: string
  muted?: boolean
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Icon className="text-muted-foreground size-3.5 shrink-0" />
      <span className="text-muted-foreground w-9 shrink-0">{label}</span>
      <span className={cn('truncate', muted ? 'text-muted-foreground' : 'font-medium')}>
        {value}
      </span>
    </div>
  )
}

function LoadoutEditor({
  open,
  loadout,
  characters,
  presets,
  worldBooks,
  regexRules,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  loadout?: Loadout
  characters: { id: string; name: string; tagline: string }[]
  presets: { id: string; name: string }[]
  worldBooks: { id: string; name: string; entries: unknown[] }[]
  regexRules: { id: string; name: string }[]
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [draft, setDraft] = useState<LoadoutInput>(() =>
    loadout
      ? {
          name: loadout.name,
          characterId: loadout.characterId,
          presetId: loadout.presetId,
          worldBookIds: [...loadout.worldBookIds],
          regexRuleIds: [...loadout.regexRuleIds],
          memoryMode: loadout.memoryMode,
        }
      : {
          ...emptyDraft,
          characterId: characters[0]?.id ?? '',
          name: characters[0] ? `${characters[0].name} · 配套` : '',
        },
  )
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function patch(next: Partial<LoadoutInput>) {
    setDraft((current) => ({ ...current, ...next }))
  }

  function toggle(key: 'worldBookIds' | 'regexRuleIds', id: string) {
    setDraft((current) => {
      const values = current[key]
      return {
        ...current,
        [key]: values.includes(id) ? values.filter((item) => item !== id) : [...values, id],
      }
    })
  }

  async function save() {
    if (!draft.name.trim()) {
      setError('请填写配套名称。')
      return
    }
    if (!draft.characterId) {
      setError('请选择一张角色卡。')
      return
    }
    setError('')
    setSaving(true)
    try {
      const input: LoadoutInput = {
        ...draft,
        name: draft.name.trim(),
        presetId: draft.presetId || null,
      }
      if (loadout) await updateLoadout(loadout.id, input)
      else await createLoadout(input)
      toast.success(loadout ? '配套已更新' : '配套已创建')
      onSaved()
    } catch (caught) {
      setError(getErrorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1.5rem)] max-w-2xl">
        <DialogHeader>
          <DialogTitle>{loadout ? '编辑配套' : '新建配套'}</DialogTitle>
          <DialogDescription>
            一套配套只绑定一张角色卡，可以再带上预设、世界书、正则和记忆方式。
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[62dvh] space-y-4 overflow-y-auto pr-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="配套名称">
              <Input
                value={draft.name}
                onChange={(event) => patch({ name: event.target.value })}
                placeholder="例如：雨夜车站 · 长线"
              />
            </Field>
            <Field label="角色卡">
              <select
                value={draft.characterId}
                onChange={(event) => patch({ characterId: event.target.value })}
                className={selectClass}
                aria-label="选择配套角色卡"
              >
                {characters.map((character) => (
                  <option key={character.id} value={character.id}>
                    {character.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="预设">
            <select
              value={draft.presetId ?? ''}
              onChange={(event) => patch({ presetId: event.target.value || null })}
              className={selectClass}
              aria-label="选择配套预设"
            >
              <option value="">不使用预设</option>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label={`世界书（已选 ${draft.worldBookIds.length}）`}>
            {worldBooks.length === 0 ? (
              <p className="text-muted-foreground text-xs">导入区里还没有世界书。</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {worldBooks.map((book) => (
                  <label
                    key={book.id}
                    className="hover:bg-muted/40 flex min-w-0 cursor-pointer items-center gap-2.5 rounded-xl border p-2.5"
                  >
                    <Checkbox
                      checked={draft.worldBookIds.includes(book.id)}
                      onChange={() => toggle('worldBookIds', book.id)}
                    />
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">{book.name}</span>
                  </label>
                ))}
              </div>
            )}
          </Field>

          <Field label={`正则（已选 ${draft.regexRuleIds.length}）`}>
            {regexRules.length === 0 ? (
              <p className="text-muted-foreground text-xs">导入区里还没有正则规则。</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {regexRules.map((rule) => (
                  <label
                    key={rule.id}
                    className="hover:bg-muted/40 flex min-w-0 cursor-pointer items-center gap-2.5 rounded-xl border p-2.5"
                  >
                    <Checkbox
                      checked={draft.regexRuleIds.includes(rule.id)}
                      onChange={() => toggle('regexRuleIds', rule.id)}
                    />
                    <span className="min-w-0 flex-1 truncate text-xs">{rule.name}</span>
                  </label>
                ))}
              </div>
            )}
          </Field>

          <Field label="记忆方式">
            <div className="grid gap-2 sm:grid-cols-3">
              {memoryOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => patch({ memoryMode: option.value })}
                  aria-pressed={draft.memoryMode === option.value}
                  className={cn(
                    'min-w-0 rounded-xl border p-2.5 text-left transition-colors',
                    draft.memoryMode === option.value
                      ? 'border-primary/35 bg-primary/[0.045] ring-primary/15 ring-1'
                      : 'hover:border-foreground/20',
                  )}
                >
                  <span className="block text-xs font-semibold">{option.label}</span>
                  <span className="text-muted-foreground mt-0.5 block text-[10px] leading-relaxed">
                    {option.hint}
                  </span>
                </button>
              ))}
            </div>
            {draft.memoryMode === 'vector' && (
              <p className="text-muted-foreground mt-2 text-[11px] leading-relaxed">
                向量模式会把这段配套下的全部历史写入本机向量库，不按条数截断；默认不联网，选择 API
                后才调用该连接生成向量。
              </p>
            )}
            {draft.memoryMode === 'compressed' && (
              <p className="text-muted-foreground mt-2 text-[11px] leading-relaxed">
                压缩模式会在每次完整回复后用聊天 API
                收起全部上下文，只把压缩记忆和最近几条原文带进下一轮。
              </p>
            )}
          </Field>

          {error && <p className="text-destructive text-xs">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}
            保存配套
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}
