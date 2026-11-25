import {
  BookOpen,
  Braces,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
  UsersRound,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
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
import { Textarea } from '@/components/ui/textarea'
import {
  createPreset,
  createRegexRule,
  createWorldBook,
  deletePreset,
  deleteRegexRule,
  deleteWorldBook,
  getErrorMessage,
  updatePreset,
  updateRegexRule,
  updateWorldBook,
} from '@/features/tavern/api'
import { CharacterAvatar } from '@/features/tavern/components/avatar'
import { ConfirmDialog } from '@/features/tavern/components/confirm-dialog'
import { EmptyState } from '@/features/tavern/components/empty-state'
import { PageHeader } from '@/features/tavern/components/page-header'
import {
  useCharacters,
  usePresets,
  useRegexRules,
  useWorldBooks,
} from '@/features/tavern/hooks/use-tavern'
import {
  defaultGeneration,
  type GenerationSettings,
  type Preset,
  type RegexRule,
  type RegexScope,
  type WorldBook,
  type WorldEntryInput,
} from '@/features/tavern/types'
import { cn } from '@/lib/cn'

type LibraryTab = 'characters' | 'presets' | 'worldbooks' | 'regex'
type DeleteTarget = { kind: LibraryTab; id: string; name: string }

const tabs: { value: LibraryTab; label: string; icon: typeof FileText }[] = [
  { value: 'characters', label: '角色卡', icon: UsersRound },
  { value: 'presets', label: '预设', icon: FileText },
  { value: 'worldbooks', label: '世界书', icon: BookOpen },
  { value: 'regex', label: '正则', icon: Braces },
]

const selectClass =
  'border-input bg-background focus-visible:border-ring h-10 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/20'

export function LibraryPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const rawTab = params.get('tab')
  const tab: LibraryTab =
    rawTab === 'characters' || rawTab === 'worldbooks' || rawTab === 'regex' ? rawTab : 'presets'
  const charactersQuery = useCharacters()
  const presetsQuery = usePresets()
  const worldBooksQuery = useWorldBooks()
  const regexQuery = useRegexRules()
  const [presetEditor, setPresetEditor] = useState<{ open: boolean; value?: Preset }>({
    open: false,
  })
  const [worldEditor, setWorldEditor] = useState<{ open: boolean; value?: WorldBook }>({
    open: false,
  })
  const [regexEditor, setRegexEditor] = useState<{ open: boolean; value?: RegexRule }>({
    open: false,
  })
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [newPickerOpen, setNewPickerOpen] = useState(false)

  const characters = charactersQuery.data?.items ?? []
  const presets = presetsQuery.data?.items ?? []
  const worldBooks = worldBooksQuery.data?.items ?? []
  const regexRules = regexQuery.data?.items ?? []

  function setTab(value: LibraryTab) {
    setParams({ tab: value })
  }

  function openNew(kind: LibraryTab | 'character') {
    setNewPickerOpen(false)
    if (kind === 'character') {
      navigate('/characters?new=1')
      return
    }
    if (kind === 'presets') setPresetEditor({ open: true })
    if (kind === 'worldbooks') setWorldEditor({ open: true })
    if (kind === 'regex') setRegexEditor({ open: true })
  }

  function refreshCurrent() {
    if (tab === 'characters') charactersQuery.refresh()
    if (tab === 'presets') presetsQuery.refresh()
    if (tab === 'worldbooks') worldBooksQuery.refresh()
    if (tab === 'regex') regexQuery.refresh()
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      if (deleteTarget.kind === 'presets') await deletePreset(deleteTarget.id)
      if (deleteTarget.kind === 'worldbooks') await deleteWorldBook(deleteTarget.id)
      if (deleteTarget.kind === 'regex') await deleteRegexRule(deleteTarget.id)
      toast.success(`${deleteTarget.name} 已删除`)
      setDeleteTarget(null)
      refreshCurrent()
    } catch (error) {
      toast.error('删除失败', { description: getErrorMessage(error) })
    } finally {
      setDeleting(false)
    }
  }

  const loading =
    tab === 'characters'
      ? charactersQuery.isLoading && !charactersQuery.data
      : tab === 'presets'
        ? presetsQuery.isLoading && !presetsQuery.data
        : tab === 'worldbooks'
          ? worldBooksQuery.isLoading && !worldBooksQuery.data
          : regexQuery.isLoading && !regexQuery.data

  const error =
    tab === 'characters'
      ? charactersQuery.error
      : tab === 'presets'
        ? presetsQuery.error
        : tab === 'worldbooks'
          ? worldBooksQuery.error
          : regexQuery.error

  const counts = {
    characters: characters.length,
    presets: presets.length,
    worldbooks: worldBooks.length,
    regex: regexRules.length,
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="导入 · 新建 · 管理"
        title="导入区"
        description="角色卡、预设、世界书和正则都在这里。导入会自动识别类型；也可以从右上角新建。"
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/import/files">
                <Upload />
                导入文件
              </Link>
            </Button>
            <Button onClick={() => setNewPickerOpen(true)}>
              <Plus />
              新建
            </Button>
          </>
        }
      />

      <div className="bg-card grid grid-cols-2 gap-1 rounded-xl border p-1 sm:flex sm:w-fit">
        {tabs.map((item) => {
          const Icon = item.icon
          const active = item.value === tab
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => setTab(item.value)}
              aria-pressed={active}
              className={cn(
                'flex min-w-0 items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors sm:justify-start',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="size-3.5" />
              {item.label}
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px]',
                  active ? 'bg-primary-foreground/15' : 'bg-muted',
                )}
              >
                {counts[item.value]}
              </span>
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-36 rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <div className="border-destructive/20 bg-destructive/5 rounded-2xl border p-5">
          <p className="text-destructive font-semibold">导入区没有加载出来</p>
          <p className="text-muted-foreground mt-1 text-sm">{error}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={refreshCurrent}>
            重新加载
          </Button>
        </div>
      ) : tab === 'characters' ? (
        characters.length === 0 ? (
          <EmptyState
            icon={UsersRound}
            title="还没有角色卡"
            description="新建一个人物，或从右上角导入 PNG / JSON 角色卡。"
            action={
              <Button asChild>
                <Link to="/characters?new=1">
                  <Plus />
                  新建角色卡
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {characters.map((character) => (
              <Card key={character.id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <CharacterAvatar
                      name={character.name}
                      tone={character.avatarTone}
                      className="size-11 rounded-xl"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="truncate text-sm font-semibold">{character.name}</h2>
                        <Badge variant="outline">
                          {character.source === 'seed'
                            ? '内置'
                            : character.source === 'import'
                              ? '导入'
                              : '本地'}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground mt-1 line-clamp-2 text-xs leading-relaxed">
                        {character.tagline || character.description || '还没有填写角色介绍。'}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
                    <div className="flex min-w-0 flex-wrap gap-1">
                      {character.tags.slice(0, 3).map((tag) => (
                        <Badge key={tag} variant="secondary">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <Button size="sm" variant="ghost" asChild>
                      <Link to={`/characters/${character.id}`}>打开角色</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : tab === 'presets' ? (
        presets.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="还没有预设"
            description="新建一套提示词与参数模板，或从 SillyTavern 预设 JSON 导入。"
            action={
              <Button onClick={() => setPresetEditor({ open: true })}>
                <Plus />
                新建预设
              </Button>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {presets.map((preset) => (
              <Card key={preset.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-sm font-semibold">{preset.name}</h2>
                      <p className="text-muted-foreground mt-1 line-clamp-2 text-xs leading-relaxed">
                        {preset.description}
                      </p>
                    </div>
                    <Badge variant="outline">{preset.source === 'seed' ? '内置' : '本地'}</Badge>
                  </div>
                  <div className="text-muted-foreground mt-3 flex flex-wrap gap-2 text-[10px]">
                    <span>temp {preset.generation.temperature.toFixed(2)}</span>
                    <span>top_p {preset.generation.topP.toFixed(2)}</span>
                    <span>{preset.generation.maxTokens} tokens</span>
                  </div>
                  {preset.promptSummary && (
                    <p className="text-muted-foreground mt-2 line-clamp-1 text-[11px]">
                      {preset.promptSummary}
                    </p>
                  )}
                  <div className="mt-3 flex justify-end gap-1 border-t pt-3">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setPresetEditor({ open: true, value: preset })}
                    >
                      <Pencil />
                      编辑
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() =>
                        setDeleteTarget({ kind: 'presets', id: preset.id, name: preset.name })
                      }
                    >
                      <Trash2 />
                      删除
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : tab === 'worldbooks' ? (
        worldBooks.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="还没有世界书"
            description="世界书可以常驻，也可以只在触发词出现时注入。"
            action={
              <Button onClick={() => setWorldEditor({ open: true })}>
                <Plus />
                新建世界书
              </Button>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {worldBooks.map((book) => (
              <Card key={book.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-sm font-semibold">{book.name}</h2>
                      <p className="text-muted-foreground mt-1 line-clamp-2 text-xs leading-relaxed">
                        {book.description}
                      </p>
                    </div>
                    <Badge variant="outline">{book.entries.length} 条</Badge>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {book.entries.slice(0, 3).map((entry) => (
                      <div
                        key={entry.id}
                        className="text-muted-foreground flex items-center gap-2 text-[11px]"
                      >
                        <span className="bg-border h-1 w-1 shrink-0 rounded-full" />
                        <span className="truncate">{entry.keys.join(' / ')}</span>
                        {entry.constant && <span className="text-primary shrink-0">常驻</span>}
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex justify-end gap-1 border-t pt-3">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setWorldEditor({ open: true, value: book })}
                    >
                      <Pencil />
                      编辑
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() =>
                        setDeleteTarget({ kind: 'worldbooks', id: book.id, name: book.name })
                      }
                    >
                      <Trash2 />
                      删除
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : regexRules.length === 0 ? (
        <EmptyState
          icon={Braces}
          title="还没有正则规则"
          description="用规则清理舞台提示、OOC 行或重复标点。"
          action={
            <Button onClick={() => setRegexEditor({ open: true })}>
              <Plus />
              新建正则
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {regexRules.map((rule) => (
            <Card key={rule.id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold">{rule.name}</h2>
                    <Badge variant={rule.enabled ? 'success' : 'outline'}>
                      {rule.enabled ? '启用' : '停用'}
                    </Badge>
                    <Badge variant="outline">
                      {rule.scope === 'both'
                        ? '输入 + 输出'
                        : rule.scope === 'input'
                          ? '输入'
                          : '输出'}
                    </Badge>
                  </div>
                  <code className="text-muted-foreground mt-1.5 block truncate text-[11px]">
                    /{rule.pattern}/{rule.flags} → {rule.replacement || '（空）'}
                  </code>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setRegexEditor({ open: true, value: rule })}
                  >
                    <Pencil />
                    编辑
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => setDeleteTarget({ kind: 'regex', id: rule.id, name: rule.name })}
                  >
                    <Trash2 />
                    删除
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {presetEditor.open && (
        <PresetEditor
          open
          preset={presetEditor.value}
          onOpenChange={(open) => setPresetEditor((current) => ({ ...current, open }))}
          onSaved={() => {
            setPresetEditor({ open: false })
            presetsQuery.refresh()
          }}
        />
      )}
      {worldEditor.open && (
        <WorldBookEditor
          open
          worldBook={worldEditor.value}
          onOpenChange={(open) => setWorldEditor((current) => ({ ...current, open }))}
          onSaved={() => {
            setWorldEditor({ open: false })
            worldBooksQuery.refresh()
          }}
        />
      )}
      {regexEditor.open && (
        <RegexEditor
          open
          rule={regexEditor.value}
          onOpenChange={(open) => setRegexEditor((current) => ({ ...current, open }))}
          onSaved={() => {
            setRegexEditor({ open: false })
            regexQuery.refresh()
          }}
        />
      )}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title={`删除「${deleteTarget?.name ?? ''}」？`}
        description="删除后，所有对话中对该项目的勾选也会一并移除。角色和历史消息不会被删除。"
        loading={deleting}
        onConfirm={() => void confirmDelete()}
      />

      <Dialog open={newPickerOpen} onOpenChange={setNewPickerOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>新建什么？</DialogTitle>
            <DialogDescription>
              选择要创建的内容类型。角色卡也可以先导入现成的 PNG 或 JSON。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 sm:grid-cols-2">
            <NewKindButton
              icon={UsersRound}
              title="角色卡"
              hint="新建一个人物，或去导入角色卡"
              onClick={() => openNew('character')}
            />
            <NewKindButton
              icon={FileText}
              title="预设"
              hint="提示词与参数模板"
              onClick={() => openNew('presets')}
            />
            <NewKindButton
              icon={BookOpen}
              title="世界书"
              hint="常驻或触发式设定"
              onClick={() => openNew('worldbooks')}
            />
            <NewKindButton
              icon={Braces}
              title="正则"
              hint="输入 / 输出文本处理"
              onClick={() => openNew('regex')}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function NewKindButton({
  icon: Icon,
  title,
  hint,
  onClick,
}: {
  icon: typeof FileText
  title: string
  hint: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hover:border-primary/35 hover:bg-primary/[0.03] flex min-w-0 items-start gap-3 rounded-xl border p-3 text-left transition-colors"
    >
      <span className="bg-muted text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="text-muted-foreground mt-0.5 block text-[11px] leading-relaxed">
          {hint}
        </span>
      </span>
    </button>
  )
}

function PresetEditor({
  open,
  preset,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  preset?: Preset
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [name, setName] = useState(preset?.name ?? '')
  const [description, setDescription] = useState(preset?.description ?? '')
  const [promptSummary, setPromptSummary] = useState(preset?.promptSummary ?? '')
  const [generation, setGeneration] = useState<GenerationSettings>(
    preset ? { ...preset.generation } : { ...defaultGeneration },
  )
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!name.trim()) {
      setError('请填写预设名称。')
      return
    }
    setError('')
    setSaving(true)
    try {
      const input = {
        name: name.trim(),
        description: description.trim(),
        promptSummary: promptSummary.trim(),
        generation: {
          temperature: Math.min(2, Math.max(0, generation.temperature)),
          topP: Math.min(1, Math.max(0, generation.topP)),
          maxTokens: Math.round(Math.min(8192, Math.max(64, generation.maxTokens))),
          presencePenalty: Math.min(2, Math.max(-2, generation.presencePenalty)),
          frequencyPenalty: Math.min(2, Math.max(-2, generation.frequencyPenalty)),
        },
      }
      if (preset) await updatePreset(preset.id, input)
      else await createPreset(input)
      toast.success(preset ? '预设已更新' : '预设已创建')
      onSaved()
    } catch (caught) {
      setError(getErrorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{preset ? '编辑预设' : '新建预设'}</DialogTitle>
          <DialogDescription>
            预设保存生成参数和启用的提示词；从 SillyTavern 导入时会保留提示词顺序。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <EditorField label="名称">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：暖灯叙事"
            />
          </EditorField>
          <EditorField label="说明">
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="min-h-20"
            />
          </EditorField>
          <EditorField label="提示词（可选）">
            <Textarea
              value={promptSummary}
              onChange={(event) => setPromptSummary(event.target.value)}
              className="min-h-40 font-mono text-xs"
            />
          </EditorField>
          <div className="grid gap-3 sm:grid-cols-2">
            <GenerationField
              label="Temperature"
              value={generation.temperature}
              step={0.05}
              onChange={(value) => setGeneration({ ...generation, temperature: Number(value) })}
            />
            <GenerationField
              label="Top P"
              value={generation.topP}
              step={0.01}
              onChange={(value) => setGeneration({ ...generation, topP: Number(value) })}
            />
            <GenerationField
              label="最大 Token"
              value={generation.maxTokens}
              step={50}
              onChange={(value) => setGeneration({ ...generation, maxTokens: Number(value) })}
            />
            <GenerationField
              label="Presence penalty"
              value={generation.presencePenalty}
              step={0.05}
              onChange={(value) => setGeneration({ ...generation, presencePenalty: Number(value) })}
            />
            <GenerationField
              label="Frequency penalty"
              value={generation.frequencyPenalty}
              step={0.05}
              onChange={(value) =>
                setGeneration({ ...generation, frequencyPenalty: Number(value) })
              }
            />
          </div>
          {error && <p className="text-destructive text-xs">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}
            保存预设
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type DraftEntry = {
  keysText: string
  content: string
  constant: boolean
  order: number
  enabled: boolean
}

function WorldBookEditor({
  open,
  worldBook,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  worldBook?: WorldBook
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [name, setName] = useState(worldBook?.name ?? '')
  const [description, setDescription] = useState(worldBook?.description ?? '')
  const [entries, setEntries] = useState<DraftEntry[]>(
    worldBook
      ? worldBook.entries.map((entry) => ({
          keysText: entry.keys.join('，'),
          content: entry.content,
          constant: entry.constant,
          order: entry.order,
          enabled: entry.enabled,
        }))
      : [{ keysText: '', content: '', constant: false, order: 0, enabled: true }],
  )
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function patchEntry(index: number, patch: Partial<DraftEntry>) {
    setEntries((current) =>
      current.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry)),
    )
  }

  async function save() {
    if (!name.trim()) {
      setError('请填写世界书名称。')
      return
    }
    const normalized: WorldEntryInput[] = entries.map((entry) => ({
      keys: entry.keysText
        .split(/[,，、]/)
        .map((key) => key.trim())
        .filter(Boolean),
      content: entry.content.trim(),
      constant: entry.constant,
      order: Math.max(0, Math.round(entry.order)),
      enabled: entry.enabled,
    }))
    if (
      normalized.length === 0 ||
      normalized.some((entry) => entry.keys.length === 0 || !entry.content)
    ) {
      setError('每个条目都需要至少一个触发词和一段内容。')
      return
    }
    setError('')
    setSaving(true)
    try {
      const input = { name: name.trim(), description: description.trim(), entries: normalized }
      if (worldBook) await updateWorldBook(worldBook.id, input)
      else await createWorldBook(input)
      toast.success(worldBook ? '世界书已更新' : '世界书已创建')
      onSaved()
    } catch (caught) {
      setError(getErrorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1.5rem)] max-w-3xl">
        <DialogHeader>
          <DialogTitle>{worldBook ? '编辑世界书' : '新建世界书'}</DialogTitle>
          <DialogDescription>
            常驻条目会一直进入上下文；普通条目依赖触发词。这里只编辑内容库，不会自动勾选到某个对话。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <EditorField label="名称">
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </EditorField>
            <EditorField label="说明">
              <Input value={description} onChange={(event) => setDescription(event.target.value)} />
            </EditorField>
          </div>
          <div className="flex items-center justify-between">
            <Label>条目（{entries.length}）</Label>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setEntries((current) => [
                  ...current,
                  {
                    keysText: '',
                    content: '',
                    constant: false,
                    order: current.length,
                    enabled: true,
                  },
                ])
              }
            >
              <Plus />
              添加条目
            </Button>
          </div>
          <div className="max-h-[44dvh] space-y-3 overflow-y-auto pr-1">
            {entries.map((entry, index) => (
              <div key={index} className="bg-muted/25 space-y-2.5 rounded-xl border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground text-[11px] font-semibold">
                    条目 {index + 1}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive h-7 px-2"
                    onClick={() =>
                      setEntries((current) => current.filter((_, itemIndex) => itemIndex !== index))
                    }
                  >
                    <Trash2 />
                    移除
                  </Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_90px]">
                  <Input
                    value={entry.keysText}
                    onChange={(event) => patchEntry(index, { keysText: event.target.value })}
                    placeholder="触发词，用逗号分隔"
                  />
                  <Input
                    type="number"
                    min={0}
                    value={entry.order}
                    onChange={(event) => patchEntry(index, { order: Number(event.target.value) })}
                    aria-label="条目顺序"
                  />
                </div>
                <Textarea
                  value={entry.content}
                  onChange={(event) => patchEntry(index, { content: event.target.value })}
                  placeholder="会注入到上下文的世界设定"
                  className="min-h-20"
                />
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-1.5 text-xs">
                    <Checkbox
                      checked={entry.constant}
                      onChange={(event) => patchEntry(index, { constant: event.target.checked })}
                    />
                    常驻
                  </label>
                  <label className="flex items-center gap-1.5 text-xs">
                    <Checkbox
                      checked={entry.enabled}
                      onChange={(event) => patchEntry(index, { enabled: event.target.checked })}
                    />
                    启用
                  </label>
                </div>
              </div>
            ))}
          </div>
          {error && <p className="text-destructive text-xs">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}
            保存世界书
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RegexEditor({
  open,
  rule,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  rule?: RegexRule
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [name, setName] = useState(rule?.name ?? '')
  const [pattern, setPattern] = useState(rule?.pattern ?? '')
  const [replacement, setReplacement] = useState(rule?.replacement ?? '')
  const [flags, setFlags] = useState(rule?.flags ?? 'g')
  const [scope, setScope] = useState<RegexScope>(rule?.scope ?? 'output')
  const [enabled, setEnabled] = useState(rule?.enabled ?? true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!name.trim() || !pattern) {
      setError('请填写规则名称和正则表达式。')
      return
    }
    try {
      new RegExp(pattern, flags)
    } catch {
      setError('正则表达式或 flags 无效。')
      return
    }
    setError('')
    setSaving(true)
    try {
      const input = {
        name: name.trim(),
        pattern,
        replacement,
        flags,
        scope,
        enabled,
      }
      if (rule) await updateRegexRule(rule.id, input)
      else await createRegexRule(input)
      toast.success(rule ? '正则规则已更新' : '正则规则已创建')
      onSaved()
    } catch (caught) {
      setError(getErrorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{rule ? '编辑正则' : '新建正则'}</DialogTitle>
          <DialogDescription>
            规则只在被具体对话勾选时运行。输入规则处理你发出的文本，输出规则处理模型回复。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <EditorField label="名称">
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </EditorField>
          <div className="grid gap-3 sm:grid-cols-[1fr_110px]">
            <EditorField label="表达式">
              <Input
                value={pattern}
                onChange={(event) => setPattern(event.target.value)}
                placeholder="例如：（[^）]*）"
                className="font-mono text-xs"
              />
            </EditorField>
            <EditorField label="Flags">
              <Input
                value={flags}
                onChange={(event) => setFlags(event.target.value)}
                placeholder="g"
                className="font-mono text-xs"
              />
            </EditorField>
          </div>
          <EditorField label="替换为">
            <Input
              value={replacement}
              onChange={(event) => setReplacement(event.target.value)}
              placeholder="留空表示删除"
            />
          </EditorField>
          <EditorField label="作用范围">
            <select
              value={scope}
              onChange={(event) => setScope(event.target.value as RegexScope)}
              className={selectClass}
            >
              <option value="output">仅输出</option>
              <option value="input">仅输入</option>
              <option value="both">输入与输出</option>
            </select>
          </EditorField>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
            启用这条规则
          </label>
          {error && <p className="text-destructive text-xs">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}
            保存正则
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditorField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function GenerationField({
  label,
  value,
  step,
  onChange,
}: {
  label: string
  value: number
  step: number
  onChange: (value: string) => void
}) {
  return (
    <EditorField label={label}>
      <Input
        type="number"
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </EditorField>
  )
}
