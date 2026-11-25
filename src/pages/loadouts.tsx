import {
  BookOpen,
  Braces,
  FileText,
  Layers,
  Loader2,
  MessageCircleMore,
  Pencil,
  Plus,
  Sparkles,
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
import {
  createChatFromLoadout,
  createCombo,
  createLoadout,
  deleteCombo,
  deleteLoadout,
  getErrorMessage,
  updateCombo,
  updateLoadout,
} from '@/features/tavern/api'
import { CharacterAvatar } from '@/features/tavern/components/avatar'
import { ConfirmDialog } from '@/features/tavern/components/confirm-dialog'
import { EmptyState } from '@/features/tavern/components/empty-state'
import { PageHeader } from '@/features/tavern/components/page-header'
import {
  useCharacters,
  useCombos,
  useLoadouts,
  usePresets,
  useRegexRules,
  useWorldBooks,
} from '@/features/tavern/hooks/use-tavern'
import { BUILTIN_CHAT_REGEX_ID, withBuiltinChatRegex } from '@/features/tavern/lib/builtin-regex'
import { buildRegexPacks, findRegexPackForRules } from '@/features/tavern/lib/regex-packs'
import type {
  Combo,
  ComboInput,
  Loadout,
  LoadoutInput,
  MemoryMode,
  RegexRule,
} from '@/features/tavern/types'
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

type LoadoutTab = 'loadouts' | 'combos'

const emptyComboDraft: ComboInput = {
  name: '',
  description: '',
  presetId: null,
  regexRuleIds: [],
}

export function LoadoutsPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab: LoadoutTab = params.get('tab') === 'combos' ? 'combos' : 'loadouts'
  const loadoutsQuery = useLoadouts()
  const combosQuery = useCombos()
  const charactersQuery = useCharacters()
  const presetsQuery = usePresets()
  const worldBooksQuery = useWorldBooks()
  const regexQuery = useRegexRules()
  const [editor, setEditor] = useState<{ open: boolean; value?: Loadout }>({ open: false })
  const [comboEditor, setComboEditor] = useState<{ open: boolean; value?: Combo }>({ open: false })
  const [deleteTarget, setDeleteTarget] = useState<Loadout | null>(null)
  const [comboDeleteTarget, setComboDeleteTarget] = useState<Combo | null>(null)
  const [startingId, setStartingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deletingCombo, setDeletingCombo] = useState(false)

  const loadouts = loadoutsQuery.data?.items ?? []
  const combos = combosQuery.data?.items ?? []
  const characters = charactersQuery.data?.items ?? []
  const presets = presetsQuery.data?.items ?? []
  const worldBooks = worldBooksQuery.data?.items ?? []
  const regexRules = regexQuery.data?.items ?? []
  const characterMap = new Map(characters.map((character) => [character.id, character]))
  const presetMap = new Map(presets.map((preset) => [preset.id, preset]))
  const regexMap = new Map(regexRules.map((rule) => [rule.id, rule]))
  const regexPacks = buildRegexPacks(regexRules).filter(
    (pack) => !pack.ruleIds.includes(BUILTIN_CHAT_REGEX_ID),
  )

  const loading =
    tab === 'loadouts'
      ? (loadoutsQuery.isLoading && !loadoutsQuery.data) ||
        (charactersQuery.isLoading && !charactersQuery.data)
      : (combosQuery.isLoading && !combosQuery.data) ||
        (presetsQuery.isLoading && !presetsQuery.data) ||
        (regexQuery.isLoading && !regexQuery.data)
  const loadError = tab === 'loadouts' ? loadoutsQuery.error : combosQuery.error

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

  async function confirmDeleteCombo() {
    if (!comboDeleteTarget) return
    setDeletingCombo(true)
    try {
      await deleteCombo(comboDeleteTarget.id)
      toast.success(`「${comboDeleteTarget.name}」已删除`, {
        description: '预设和正则都还在，只移除这份组合。',
      })
      setComboDeleteTarget(null)
      combosQuery.refresh()
    } catch (error) {
      toast.error('删除失败', { description: getErrorMessage(error) })
    } finally {
      setDeletingCombo(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={tab === 'loadouts' ? '角色 · 世界书 · 预设 · 正则 · 记忆' : '预设 · 正则'}
        title="配套"
        description={
          tab === 'loadouts'
            ? '把角色卡和它需要的设定打包成一套。开始对话时选配套，不用再逐项勾选。'
            : '组合只打包预设和正则，可快速带入对话或新配套；角色、世界书和记忆仍由配套管理。'
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/import/files">
                <Upload />
                导入文件
              </Link>
            </Button>
            {tab === 'loadouts' ? (
              <Button onClick={() => setEditor({ open: true })} disabled={characters.length === 0}>
                <Plus />
                新建配套
              </Button>
            ) : (
              <Button onClick={() => setComboEditor({ open: true })}>
                <Plus />
                新建组合
              </Button>
            )}
          </>
        }
      />

      <div className="bg-card flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl border p-1">
        <TabButton
          active={tab === 'loadouts'}
          onClick={() => setParams({ tab: 'loadouts' })}
          icon={Layers}
          label="配套"
          count={loadouts.length}
        />
        <TabButton
          active={tab === 'combos'}
          onClick={() => setParams({ tab: 'combos' })}
          icon={Sparkles}
          label="组合"
          count={combos.length}
        />
      </div>

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
          {tab === 'loadouts'
            ? `${characters.length} 位角色 · ${loadouts.length} 套配套`
            : `${presets.length} 个预设 · ${regexRules.length} 条正则 · ${combos.length} 个组合`}
        </span>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-56 rounded-2xl" />
          ))}
        </div>
      ) : loadError ? (
        <div className="border-destructive/20 bg-destructive/5 rounded-2xl border p-5">
          <p className="text-destructive font-semibold">
            {tab === 'loadouts' ? '配套没有加载出来' : '组合没有加载出来'}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">{loadError}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={tab === 'loadouts' ? loadoutsQuery.refresh : combosQuery.refresh}
          >
            重新加载
          </Button>
        </div>
      ) : tab === 'combos' ? (
        combos.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="还没有组合"
            description="把常用预设和正则打包成组合，之后可以一键带入配套或当前对话。"
            action={
              <Button onClick={() => setComboEditor({ open: true })}>
                <Plus />
                新建组合
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {combos.map((combo) => {
              const preset = combo.presetId ? presetMap.get(combo.presetId) : null
              const regexPack = findRegexPackForRules(regexPacks, combo.regexRuleIds)
              const activeRegexCount = combo.regexRuleIds.filter(
                (id) => regexMap.get(id)?.enabled,
              ).length
              return (
                <Card key={combo.id} className="flex min-w-0 flex-col overflow-hidden">
                  {combo.coverImage ? (
                    <div className="bg-muted/30 aspect-[3/4] overflow-hidden border-b">
                      <img
                        src={combo.coverImage}
                        alt=""
                        className="size-full object-cover object-center"
                        loading="lazy"
                      />
                    </div>
                  ) : (
                    <div className="from-primary/12 via-chart-3/10 to-card relative flex aspect-[3/4] items-center justify-center border-b bg-gradient-to-br">
                      <div className="text-primary/70 flex flex-col items-center gap-1">
                        <Sparkles className="size-7" strokeWidth={1.4} />
                        <span className="text-[10px] font-semibold tracking-[0.24em] uppercase">
                          Preset + Regex
                        </span>
                      </div>
                    </div>
                  )}
                  <CardContent className="flex flex-1 flex-col p-4">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <h2 className="truncate text-sm font-semibold">{combo.name}</h2>
                        <p className="text-muted-foreground mt-1 line-clamp-2 text-xs leading-relaxed">
                          {combo.description || '预设与正则的快捷组合。'}
                        </p>
                      </div>
                      <Badge
                        variant={combo.source === 'seed' ? 'info' : 'outline'}
                        className="shrink-0"
                      >
                        {combo.source === 'seed' ? '内置' : '本地'}
                      </Badge>
                    </div>

                    <div className="mt-3 space-y-1.5 text-[11px]">
                      <CompositionRow
                        icon={FileText}
                        label="预设"
                        value={preset?.name ?? (combo.presetId ? '预设已删除' : '不绑定预设')}
                        muted={!preset}
                      />
                      <CompositionRow
                        icon={Braces}
                        label="正则"
                        value={
                          regexPack
                            ? `${regexPack.name} · ${regexPack.ruleIds.length} 条 · ${activeRegexCount} 启用`
                            : combo.regexRuleIds.length > 0
                              ? `多组正则 · ${combo.regexRuleIds.length} 条 · ${activeRegexCount} 启用`
                              : '不绑定正则'
                        }
                        muted={combo.regexRuleIds.length === 0}
                      />
                    </div>

                    <div className="mt-4 flex items-center gap-1 border-t pt-3">
                      <Button
                        size="sm"
                        className="flex-1"
                        aria-label={`编辑 ${combo.name}`}
                        onClick={() => setComboEditor({ open: true, value: combo })}
                      >
                        <Pencil />
                        编辑组合
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        aria-label={`删除 ${combo.name}`}
                        onClick={() => setComboDeleteTarget(combo)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )
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
            const regexPack = findRegexPackForRules(
              regexPacks,
              loadout.regexRuleIds.filter((id) => id !== BUILTIN_CHAT_REGEX_ID),
            )
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
                        regexPack
                          ? `${regexPack.name} · ${regexPack.ruleIds.length} 条`
                          : loadout.regexRuleIds.length > 0
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
          combos={combos}
          worldBooks={worldBooks}
          regexRules={regexRules}
          onOpenChange={(open) => setEditor((current) => ({ ...current, open }))}
          onSaved={() => {
            setEditor({ open: false })
            loadoutsQuery.refresh()
          }}
        />
      )}

      {comboEditor.open && (
        <ComboEditor
          open
          combo={comboEditor.value}
          presets={presets}
          regexRules={regexRules}
          onOpenChange={(open) => setComboEditor((current) => ({ ...current, open }))}
          onSaved={() => {
            setComboEditor({ open: false })
            combosQuery.refresh()
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

      <ConfirmDialog
        open={comboDeleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setComboDeleteTarget(null)
        }}
        title={`删除「${comboDeleteTarget?.name ?? ''}」？`}
        description="只删除这份组合，不会删除预设、正则或已有对话。"
        loading={deletingCombo}
        onConfirm={() => void confirmDeleteCombo()}
      />
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  icon: typeof Layers
  label: string
  count: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors',
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <Icon className="size-3.5" />
      {label}
      <span
        className={cn(
          'rounded-full px-1.5 py-0.5 text-[10px]',
          active ? 'bg-primary-foreground/15' : 'bg-muted',
        )}
      >
        {count}
      </span>
    </button>
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
  combos,
  worldBooks,
  regexRules,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  loadout?: Loadout
  characters: { id: string; name: string; tagline: string }[]
  presets: { id: string; name: string }[]
  combos: Combo[]
  worldBooks: { id: string; name: string; entries: unknown[] }[]
  regexRules: RegexRule[]
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
  const regexPacks = buildRegexPacks(regexRules).filter(
    (pack) => !pack.ruleIds.includes(BUILTIN_CHAT_REGEX_ID),
  )
  const selectedRegexRuleIds = draft.regexRuleIds.filter((id) => id !== BUILTIN_CHAT_REGEX_ID)
  const selectedRegexPack = findRegexPackForRules(regexPacks, selectedRegexRuleIds)
  const hasLegacyRegexSelection = selectedRegexRuleIds.length > 0 && !selectedRegexPack
  const selectedRegexPackId = selectedRegexPack?.id ?? (hasLegacyRegexSelection ? '__legacy__' : '')

  function patch(next: Partial<LoadoutInput>) {
    setDraft((current) => ({ ...current, ...next }))
  }

  function toggleWorldBook(id: string) {
    setDraft((current) => {
      const values = current.worldBookIds
      return {
        ...current,
        worldBookIds: values.includes(id) ? values.filter((item) => item !== id) : [...values, id],
      }
    })
  }

  function applyCombo(comboId: string) {
    const combo = combos.find((item) => item.id === comboId)
    if (!combo) return
    patch({
      presetId: combo.presetId,
      regexRuleIds: withBuiltinChatRegex(combo.regexRuleIds),
    })
    toast.success(`已带入「${combo.name}」`, {
      description: '只替换预设和正则包，角色卡、世界书和记忆保持不变。',
    })
  }

  function selectRegexPack(packId: string) {
    const pack = regexPacks.find((item) => item.id === packId)
    const hasBuiltinChat = draft.regexRuleIds.includes(BUILTIN_CHAT_REGEX_ID)
    patch({
      regexRuleIds: pack
        ? withBuiltinChatRegex(pack.ruleIds)
        : hasBuiltinChat
          ? [BUILTIN_CHAT_REGEX_ID]
          : [],
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
            一套配套只绑定一张角色卡，可以再带上预设、世界书、正则包和记忆方式。
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

          {combos.length > 0 && (
            <Field label="快速套用组合（可选）">
              <select
                value=""
                onChange={(event) => applyCombo(event.target.value)}
                className={selectClass}
                aria-label="选择组合套用到配套"
              >
                <option value="">选择组合，带入预设和正则</option>
                {combos.map((combo) => (
                  <option key={combo.id} value={combo.id}>
                    {combo.name}
                  </option>
                ))}
              </select>
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                只替换下面的预设和正则包，不会改动角色卡、世界书和记忆方式。
              </p>
            </Field>
          )}

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
                      onChange={() => toggleWorldBook(book.id)}
                    />
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">{book.name}</span>
                  </label>
                ))}
              </div>
            )}
          </Field>

          <Field label="正则包">
            {regexRules.length === 0 ? (
              <p className="text-muted-foreground text-xs">导入区里还没有正则规则。</p>
            ) : (
              <>
                <select
                  value={selectedRegexPackId}
                  onChange={(event) => selectRegexPack(event.target.value)}
                  className={selectClass}
                  aria-label="选择配套正则"
                >
                  <option value="">不绑定额外正则</option>
                  {hasLegacyRegexSelection && (
                    <option value="__legacy__" disabled>
                      当前为旧的多组正则，请重新选择
                    </option>
                  )}
                  {regexPacks.map((pack) => (
                    <option key={pack.id} value={pack.id}>
                      {pack.name}（{pack.ruleIds.length} 条）
                    </option>
                  ))}
                </select>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  正则按整组套用；套用组合时会自动保留微信式对话气泡。
                </p>
              </>
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

function ComboEditor({
  open,
  combo,
  presets,
  regexRules,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  combo?: Combo
  presets: { id: string; name: string }[]
  regexRules: RegexRule[]
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [draft, setDraft] = useState<ComboInput>(() =>
    combo
      ? {
          name: combo.name,
          description: combo.description,
          presetId: combo.presetId,
          regexRuleIds: [...combo.regexRuleIds],
        }
      : {
          ...emptyComboDraft,
          presetId: presets[0]?.id ?? null,
        },
  )
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const regexPacks = buildRegexPacks(regexRules).filter(
    (pack) => !pack.ruleIds.includes(BUILTIN_CHAT_REGEX_ID),
  )
  const selectedRegexRuleIds = draft.regexRuleIds.filter((id) => id !== BUILTIN_CHAT_REGEX_ID)
  const selectedRegexPack = findRegexPackForRules(regexPacks, selectedRegexRuleIds)
  const hasLegacyRegexSelection = selectedRegexRuleIds.length > 0 && !selectedRegexPack
  const selectedRegexPackId = selectedRegexPack?.id ?? (hasLegacyRegexSelection ? '__legacy__' : '')

  function patch(next: Partial<ComboInput>) {
    setDraft((current) => ({ ...current, ...next }))
  }

  function selectRegexPack(packId: string) {
    const pack = regexPacks.find((item) => item.id === packId)
    patch({ regexRuleIds: pack ? [...pack.ruleIds] : [] })
  }

  async function save() {
    if (!draft.name.trim()) {
      setError('请填写组合名称。')
      return
    }
    if (!draft.presetId && draft.regexRuleIds.length === 0) {
      setError('至少选择预设或一组正则。')
      return
    }
    if (hasLegacyRegexSelection) {
      setError('这份组合包含多组正则，请重新选择一组。')
      return
    }
    setError('')
    setSaving(true)
    try {
      const input: ComboInput = {
        ...draft,
        name: draft.name.trim(),
        description: draft.description.trim(),
        presetId: draft.presetId || null,
        regexRuleIds: draft.regexRuleIds.filter((id) => id !== BUILTIN_CHAT_REGEX_ID),
      }
      if (combo) await updateCombo(combo.id, input)
      else await createCombo(input)
      toast.success(combo ? '组合已更新' : '组合已创建')
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
          <DialogTitle>{combo ? '编辑组合' : '新建组合'}</DialogTitle>
          <DialogDescription>
            组合只保存预设和一组正则，不绑定角色卡、世界书或记忆方式。
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[62dvh] space-y-4 overflow-y-auto pr-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="组合名称">
              <Input
                value={draft.name}
                onChange={(event) => patch({ name: event.target.value })}
                placeholder="例如：ATRI Gemini + 去油"
              />
            </Field>
            <Field label="一句话说明">
              <Input
                value={draft.description}
                onChange={(event) => patch({ description: event.target.value })}
                placeholder="这套预设和正则适合什么场景"
              />
            </Field>
          </div>

          <Field label="预设">
            <select
              value={draft.presetId ?? ''}
              onChange={(event) => patch({ presetId: event.target.value || null })}
              className={selectClass}
              aria-label="选择组合预设"
            >
              <option value="">不绑定预设</option>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="正则">
            {regexRules.length === 0 ? (
              <p className="text-muted-foreground text-xs">导入区里还没有正则规则。</p>
            ) : (
              <>
                <select
                  value={selectedRegexPackId}
                  onChange={(event) => selectRegexPack(event.target.value)}
                  className={selectClass}
                  aria-label="选择组合正则"
                >
                  <option value="">不绑定正则</option>
                  {hasLegacyRegexSelection && (
                    <option value="__legacy__" disabled>
                      当前为旧的多组正则，请重新选择
                    </option>
                  )}
                  {regexPacks.map((pack) => (
                    <option key={pack.id} value={pack.id}>
                      {pack.name}（{pack.ruleIds.length} 条）
                    </option>
                  ))}
                </select>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  正则按整组套用，不单独拆分条目。
                </p>
              </>
            )}
          </Field>

          {combo?.coverImage && (
            <p className="text-muted-foreground text-[11px]">内置封面会保留，编辑不会移除。</p>
          )}

          {error && <p className="text-destructive text-xs">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}
            保存组合
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
