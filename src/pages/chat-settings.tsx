import { Archive, ArrowLeft, Check, Loader2, ShieldCheck, Sparkles } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  compressChatMemory,
  getErrorMessage,
  summarizeChatMemory,
  updateChat,
} from '@/features/tavern/api'
import { CharacterAvatar } from '@/features/tavern/components/avatar'
import {
  useCharacters,
  useChatSession,
  useCombos,
  useLoadouts,
  usePresets,
  useRegexRules,
  useSettings,
  useWorldBooks,
} from '@/features/tavern/hooks/use-tavern'
import { withBuiltinChatRegex } from '@/features/tavern/lib/builtin-regex'
import type { ChatSession, GenerationSettings, MemoryMode } from '@/features/tavern/types'
import { cn } from '@/lib/cn'

type Draft = {
  loadoutId: string
  characterId: string
  apiProfileId: string
  presetId: string
  worldBookIds: string[]
  regexRuleIds: string[]
  memoryMode: MemoryMode
  memorySummary: string
  memorySummaryCursor: number
  generation: GenerationSettings
  fontSize: number
}

const memoryModes: { value: MemoryMode; label: string; hint: string }[] = [
  {
    value: 'off',
    label: '关闭记忆',
    hint: '只带最近对话作为上下文，不生成摘要。',
  },
  {
    value: 'recent',
    label: '最近消息',
    hint: '保留最近 24 条消息，不额外写入摘要。',
  },
  {
    value: 'summary',
    label: '摘要记忆',
    hint: '生成一段长期摘要，下次对话仍会带着它。',
  },
  {
    value: 'compressed',
    label: '压缩记忆',
    hint: '上下文快满时才用聊天 API 压缩一次，保留长期记忆。',
  },
  {
    value: 'vector',
    label: '向量记忆',
    hint: '全部历史进入本机向量库，按语义召回，不按条数截断。',
  },
]

function toDraft(session: ChatSession): Draft {
  return {
    loadoutId: session.loadoutId ?? '',
    characterId: session.characterId,
    apiProfileId: session.apiProfileId ?? '',
    presetId: session.presetId ?? '',
    worldBookIds: [...session.worldBookIds],
    regexRuleIds: [...session.regexRuleIds],
    memoryMode: session.memoryMode,
    memorySummary: session.memorySummary,
    memorySummaryCursor: session.memorySummaryCursor ?? 0,
    generation: { ...session.generation },
    fontSize: session.fontSize,
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))
}

export function ChatSettingsPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const sessionQuery = useChatSession(id)
  const charactersQuery = useCharacters()
  const combosQuery = useCombos()
  const presetsQuery = usePresets()
  const worldBooksQuery = useWorldBooks()
  const regexQuery = useRegexRules()
  const settingsQuery = useSettings()
  const loadoutsQuery = useLoadouts()
  const [draftOverride, setDraftOverride] = useState<{ sessionId: string; value: Draft } | null>(
    null,
  )
  const [saving, setSaving] = useState(false)
  const [compressing, setCompressing] = useState(false)
  const [summarizing, setSummarizing] = useState(false)

  const session = sessionQuery.data
  const draft =
    draftOverride?.sessionId === id ? draftOverride.value : session ? toDraft(session) : null
  const characters = charactersQuery.data?.items ?? []
  const combos = combosQuery.data?.items ?? []
  const presets = presetsQuery.data?.items ?? []
  const worldBooks = worldBooksQuery.data?.items ?? []
  const regexRules = regexQuery.data?.items ?? []
  const loadouts = loadoutsQuery.data?.items ?? []
  const selectedPreset = presets.find((preset) => preset.id === draft?.presetId)
  const selectedCharacter = characters.find((character) => character.id === draft?.characterId)
  const apiProfiles = settingsQuery.data?.apiProfiles ?? []
  const globalApiProfile = apiProfiles[0]
  const selectedApiProfile =
    apiProfiles.find((profile) => profile.id === draft?.apiProfileId) ?? globalApiProfile
  const vectorApiProfile = apiProfiles.find(
    (profile) => profile.id === settingsQuery.data?.memoryProfile.apiProfileId,
  )

  function patchDraft(patch: Partial<Draft>) {
    if (!draft) return
    setDraftOverride({ sessionId: id, value: { ...draft, ...patch } })
  }

  function toggleId(key: 'worldBookIds' | 'regexRuleIds', value: string) {
    if (!draft) return
    const values = draft[key]
    setDraftOverride({
      sessionId: id,
      value: {
        ...draft,
        [key]: values.includes(value)
          ? values.filter((item) => item !== value)
          : [...values, value],
      },
    })
  }

  function updateGeneration(key: keyof GenerationSettings, raw: string) {
    if (!draft) return
    const value = Number(raw)
    setDraftOverride({
      sessionId: id,
      value: {
        ...draft,
        generation: {
          ...draft.generation,
          [key]: Number.isFinite(value) ? value : 0,
        },
      },
    })
  }

  function applyLoadout(loadoutId: string) {
    if (!draft) return
    const loadout = loadouts.find((item) => item.id === loadoutId)
    if (!loadout) {
      patchDraft({ loadoutId: '' })
      return
    }
    patchDraft({
      loadoutId: loadout.id,
      characterId: loadout.characterId,
      presetId: loadout.presetId ?? '',
      worldBookIds: [...loadout.worldBookIds],
      regexRuleIds: [...loadout.regexRuleIds],
      memoryMode: loadout.memoryMode,
    })
    toast.success(`已套用「${loadout.name}」`, {
      description: '保存后才会写入这段对话。',
    })
  }

  function applyCombo(comboId: string) {
    if (!draft) return
    const combo = combos.find((item) => item.id === comboId)
    if (!combo) return
    const preset = combo.presetId ? presets.find((item) => item.id === combo.presetId) : null
    patchDraft({
      presetId: combo.presetId ?? '',
      regexRuleIds: withBuiltinChatRegex(combo.regexRuleIds),
      ...(preset ? { generation: { ...preset.generation } } : {}),
    })
    toast.success(`已套用「${combo.name}」`, {
      description: '只替换预设和正则；保存后写入这段对话。',
    })
  }

  async function save() {
    if (!session || !draft) return
    if (!draft.characterId) {
      toast.error('请先选择角色卡')
      return
    }
    setSaving(true)
    try {
      await updateChat(session.id, {
        loadoutId: draft.loadoutId || null,
        characterId: draft.characterId,
        apiProfileId: draft.apiProfileId || null,
        presetId: draft.presetId || null,
        worldBookIds: draft.worldBookIds,
        regexRuleIds: draft.regexRuleIds,
        memoryProfileId: session.memoryProfileId,
        memoryMode: draft.memoryMode,
        memorySummary: draft.memorySummary,
        memorySummaryCursor: draft.memorySummaryCursor,
        generation: {
          temperature: clamp(draft.generation.temperature, 0, 2),
          topP: clamp(draft.generation.topP, 0, 1),
          maxTokens: Math.round(clamp(draft.generation.maxTokens, 64, 8192)),
          presencePenalty: clamp(draft.generation.presencePenalty, -2, 2),
          frequencyPenalty: clamp(draft.generation.frequencyPenalty, -2, 2),
        },
        fontSize: Math.round(clamp(draft.fontSize, 13, 22)),
      })
      toast.success('这段对话的设置已保存', {
        description: '只影响当前对话，其他会话不会改变。',
      })
      navigate(`/chat/${session.id}`)
    } catch (error) {
      toast.error('保存失败', { description: getErrorMessage(error) })
    } finally {
      setSaving(false)
    }
  }

  async function compressMemoryNow() {
    if (!session || !draft) return
    setCompressing(true)
    try {
      const result = await compressChatMemory(session.id, { force: true })
      if (!result) throw new Error('这段对话还没有可压缩的完整消息。')
      patchDraft({ memorySummary: result.summary, memorySummaryCursor: result.coveredMessages })
      toast.success('已压缩全部上下文', {
        description: `分 ${result.chunkCount} 段完成 · ${result.model}。保存后写入这段对话。`,
      })
    } catch (error) {
      toast.error('记忆压缩失败', { description: getErrorMessage(error) })
    } finally {
      setCompressing(false)
    }
  }

  async function summarizeMemoryNow() {
    if (!session || !draft) return
    setSummarizing(true)
    try {
      const result = await summarizeChatMemory(session.id, { force: true })
      if (!result) throw new Error('这段对话还没有可摘要的完整消息。')
      patchDraft({ memorySummary: result.summary, memorySummaryCursor: result.coveredMessages })
      toast.success('已生成长期摘要', {
        description: `分 ${result.chunkCount} 段完成 · ${result.model}。保存后写入这段对话。`,
      })
    } catch (error) {
      toast.error('摘要生成失败', { description: getErrorMessage(error) })
    } finally {
      setSummarizing(false)
    }
  }

  if (sessionQuery.isLoading && !session) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-8">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    )
  }

  if (!session || !draft) {
    return (
      <div className="flex h-dvh items-center justify-center p-6">
        <div className="bg-card max-w-sm rounded-2xl border p-7 text-center">
          <p className="font-display text-xl font-semibold">没有找到这段对话</p>
          <p className="text-muted-foreground mt-2 text-sm">{sessionQuery.error ?? ''}</p>
          <Button asChild variant="outline" className="mt-5">
            <Link to="/">
              <ArrowLeft />
              返回对话列表
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="chat-canvas min-h-dvh">
      <header className="border-border/70 bg-background/90 sticky top-0 z-20 border-b pt-[var(--safe-top)] backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-4xl items-center gap-2 px-3 sm:px-6">
          <Button variant="ghost" size="icon" asChild>
            <Link to={`/chat/${session.id}`} aria-label="返回聊天">
              <ArrowLeft />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">对话设置</p>
            <p className="text-muted-foreground truncate text-[10px]">{session.title}</p>
          </div>
          <Badge variant="outline" className="bg-card shrink-0">
            仅影响当前对话
          </Badge>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl min-w-0 space-y-5 px-4 py-6 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-8">
        <div className="border-primary/20 bg-primary/[0.045] min-w-0 rounded-2xl border p-4">
          <p className="text-sm font-semibold break-words">这里改的是「{session.title}」</p>
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
            角色卡、预设、世界书、记忆、正则和字号都只覆盖这一段对话。全局设置和其他会话保持原样。
          </p>
        </div>

        <p className="text-muted-foreground flex flex-wrap items-center gap-1.5 px-1 text-[10px]">
          <ShieldCheck className="text-success size-3" />
          安全文本渲染 · 最近 40 条分批加载 · 真实 API 请求
        </p>

        <Section
          title="配套"
          description="套用配套会同时带上角色卡、预设、世界书、正则和记忆方式；只影响当前对话。"
        >
          <div className="space-y-2">
            <Label htmlFor="chat-loadout">当前配套</Label>
            <select
              id="chat-loadout"
              value={draft.loadoutId}
              onChange={(event) => applyLoadout(event.target.value)}
              className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/20 h-11 w-full min-w-0 rounded-lg border px-3 text-sm outline-none focus-visible:ring-2"
            >
              <option value="">不关联配套（逐项设置）</option>
              {loadouts.map((loadout) => (
                <option key={loadout.id} value={loadout.id}>
                  {loadout.name}
                </option>
              ))}
            </select>
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              换配套不会改写已有消息；之后的回复会按新组合生成。切换角色卡会解除配套关联。
            </p>
          </div>
        </Section>

        <Section
          title="组合"
          description="组合只带预设和正则，用来快速切换文风与文本清理规则；角色、世界书和记忆不会改变。"
        >
          <div className="space-y-2">
            <Label htmlFor="chat-combo">套用组合</Label>
            <select
              id="chat-combo"
              value=""
              onChange={(event) => applyCombo(event.target.value)}
              className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/20 h-11 w-full min-w-0 rounded-lg border px-3 text-sm outline-none focus-visible:ring-2"
            >
              <option value="">选择组合，带入预设和正则</option>
              {combos.map((combo) => (
                <option key={combo.id} value={combo.id}>
                  {combo.name}
                </option>
              ))}
            </select>
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              选择后会同时替换当前预设与正则勾选；仍需点保存才会写入这段对话。
            </p>
          </div>
        </Section>

        <Section
          title="生成 API"
          description="这段对话的回复会发送到所选连接；未单独指定时跟随全局默认连接。"
        >
          <div className="space-y-2">
            <Label htmlFor="chat-api-profile">这条对话使用哪条 API</Label>
            <select
              id="chat-api-profile"
              value={draft.apiProfileId}
              onChange={(event) => patchDraft({ apiProfileId: event.target.value })}
              className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/20 h-11 w-full min-w-0 rounded-lg border px-3 text-sm outline-none focus-visible:ring-2"
            >
              <option value="">
                自动选择{globalApiProfile ? `（${globalApiProfile.name}）` : ''}
              </option>
              {apiProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name} · {profile.model || '未填模型'}
                </option>
              ))}
            </select>
            {apiProfiles.length === 0 ? (
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                还没有 API 连接。
                <Link to="/settings" className="text-primary ml-1 font-semibold">
                  去设置添加
                </Link>
                ，否则发送消息时会提示配置缺失。
              </p>
            ) : (
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                当前会使用「{selectedApiProfile?.name ?? '未配置'}」
                {selectedApiProfile?.model ? ` · ${selectedApiProfile.model}` : ''}。
              </p>
            )}
          </div>
        </Section>

        <Section title="角色卡" description="切换角色会改变后续回复的人设，不改写已有消息。">
          <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <select
              value={draft.characterId}
              onChange={(event) =>
                patchDraft({
                  characterId: event.target.value,
                  loadoutId: '',
                })
              }
              className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/20 h-11 w-full min-w-0 rounded-lg border px-3 text-sm outline-none focus-visible:ring-2"
              aria-label="选择对话角色卡"
            >
              {characters.map((character) => (
                <option key={character.id} value={character.id}>
                  {character.name} · {character.tagline}
                </option>
              ))}
            </select>
            {selectedCharacter && (
              <span className="text-muted-foreground flex max-w-full min-w-0 items-center gap-2 text-xs">
                <CharacterAvatar
                  name={selectedCharacter.name}
                  tone={selectedCharacter.avatarTone}
                  size="sm"
                  className="size-8 rounded-lg"
                />
                <span className="min-w-0 truncate">
                  {selectedCharacter.tags.slice(0, 2).join(' · ') || '未设置标签'}
                </span>
              </span>
            )}
          </div>
        </Section>

        <Section
          title="预设"
          description="预设会带入生成参数和提示词。套用后仍可手动调整下面的数值。"
        >
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label htmlFor="chat-preset">当前预设</Label>
              <select
                id="chat-preset"
                value={draft.presetId}
                onChange={(event) => patchDraft({ presetId: event.target.value })}
                className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/20 h-11 w-full min-w-0 rounded-lg border px-3 text-sm outline-none focus-visible:ring-2"
              >
                <option value="">不使用预设</option>
                {presets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </div>
            <Button
              variant="outline"
              disabled={!selectedPreset || !draft}
              onClick={() => {
                if (!selectedPreset) return
                patchDraft({ generation: { ...selectedPreset.generation } })
                toast.success(`已套用「${selectedPreset.name}」参数`)
              }}
            >
              <Sparkles />
              套用参数
            </Button>
          </div>
          {selectedPreset && (
            <p className="text-muted-foreground mt-2 text-xs">{selectedPreset.description}</p>
          )}
        </Section>

        <Section title="世界书" description="勾选后，这些设定只在本段对话中生效。">
          {worldBooks.length === 0 ? (
            <p className="text-muted-foreground text-sm">内容库里还没有世界书。</p>
          ) : (
            <div className="space-y-2">
              {worldBooks.map((book) => (
                <label
                  key={book.id}
                  className="hover:bg-muted/40 flex min-w-0 cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors"
                >
                  <Checkbox
                    checked={draft.worldBookIds.includes(book.id)}
                    onChange={() => toggleId('worldBookIds', book.id)}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{book.name}</span>
                </label>
              ))}
            </div>
          )}
        </Section>

        <Section title="记忆" description="记忆内容会影响后续回复，但不会自动改写历史消息。">
          <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {memoryModes.map((mode) => (
              <button
                key={mode.value}
                type="button"
                onClick={() => patchDraft({ memoryMode: mode.value })}
                aria-pressed={draft.memoryMode === mode.value}
                className={cn(
                  'min-w-0 rounded-xl border p-3 text-left transition-colors',
                  draft.memoryMode === mode.value
                    ? 'border-primary/35 bg-primary/[0.045] ring-primary/15 ring-1'
                    : 'hover:border-foreground/20',
                )}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {draft.memoryMode === mode.value && <Check className="text-primary size-3.5" />}
                  {mode.label}
                </span>
                <span className="text-muted-foreground mt-1 block text-[11px] leading-relaxed">
                  {mode.hint}
                </span>
              </button>
            ))}
          </div>
          {draft.memoryMode === 'compressed' && (
            <div className="border-primary/15 bg-primary/[0.035] mt-3 rounded-xl border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  <Archive className="text-primary size-4" />
                  聊天 API 压缩
                  <Badge variant="outline">
                    {selectedApiProfile?.model.trim() || '未配置模型'}
                  </Badge>
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void compressMemoryNow()}
                  disabled={compressing}
                >
                  {compressing ? <Loader2 className="animate-spin" /> : <Archive />}
                  {compressing ? '正在压缩…' : '立即压缩全部上下文'}
                </Button>
              </div>
              <p className="text-muted-foreground mt-1.5 text-[11px] leading-relaxed">
                不会每轮都请求：新增的完整消息攒到 10 条且 8000 字、或积攒到 20000 字（接近上下文上限）时，才用这条对话的聊天
                API 把已完成历史压缩成下方长期记忆，请求会带上「设置 → 记忆」里的压缩提示词。接口失败不会影响聊天，只保留上一次成功压缩的内容。后续回复会带压缩记忆和最近消息。
              </p>
              <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">
                已覆盖 {draft.memorySummaryCursor} 条消息 · 压缩提示词：
                {settingsQuery.data?.memoryProfile.summaryPrompt.trim() || '未填写，使用默认规则'}
              </p>
            </div>
          )}
          {draft.memoryMode === 'summary' && (
            <div className="border-primary/15 bg-primary/[0.035] mt-3 rounded-xl border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  <Archive className="text-primary size-4" />
                  聊天 API 摘要
                  <Badge variant="outline">
                    {selectedApiProfile?.model.trim() || '未配置模型'}
                  </Badge>
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void summarizeMemoryNow()}
                  disabled={summarizing}
                >
                  {summarizing ? <Loader2 className="animate-spin" /> : <Archive />}
                  {summarizing ? '正在摘要…' : '立即生成长期摘要'}
                </Button>
              </div>
              <p className="text-muted-foreground mt-1.5 text-[11px] leading-relaxed">
                同样不是每轮都请求：新增的完整消息攒到 10 条且 8000 字、或积攒到 20000 字时，才用这条对话的聊天 API
                把已完成历史整理成一段长期摘要，写进下方；请求会带上「设置 →
                记忆」里的摘要提示词。摘要会随对话一起带上，再配最近消息作为即时上下文。
              </p>
              <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">
                已覆盖 {draft.memorySummaryCursor} 条消息 · 摘要提示词：
                {settingsQuery.data?.memoryProfile.summaryPrompt.trim() || '未填写，使用默认规则'}
              </p>
            </div>
          )}
          {draft.memoryMode === 'vector' && (
            <div className="border-primary/15 bg-primary/[0.035] mt-3 rounded-xl border p-3">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                <Sparkles className="text-primary size-4" />
                向量引擎
                <Badge variant="outline">
                  {vectorApiProfile?.model.trim() || '本机向量 · 不联网'}
                </Badge>
              </p>
              <p className="text-muted-foreground mt-1.5 text-[11px] leading-relaxed">
                当前对话会完整带入，全部已完成历史会自动写入本机向量库，不按条数截断，也不上传云端数据库。若要改用
                API 生成向量，请到设置里的记忆区域选择连接；接口不可用时会自动退回本机向量。
              </p>
            </div>
          )}
          <div className="mt-4 space-y-1.5">
            <Label htmlFor="memory-summary">
              {draft.memoryMode === 'compressed' ? '当前压缩记忆' : '当前摘要'}
            </Label>
            <Textarea
              id="memory-summary"
              value={draft.memorySummary}
              onChange={(event) => patchDraft({ memorySummary: event.target.value })}
              placeholder={
                draft.memoryMode === 'compressed'
                  ? '这段对话还没有压缩记忆。完整回复后会自动压缩全部上下文，也可以点上方按钮立即压缩。'
                  : '这段对话还没有摘要。切换到摘要记忆后，回复完成时会自动写入一句。'
              }
              className="bg-background min-h-24"
            />
            <p className="text-muted-foreground text-[11px]">
              {draft.memoryMode === 'compressed'
                ? '你可以手动调整压缩记忆；下一次自动压缩会参考并重写这里的内容。'
                : '你可以手动修改摘要；保存后只作用于当前对话。'}
            </p>
          </div>
        </Section>

        <Section title="正则" description="只对本段对话的输入或输出生效。">
          {regexRules.length === 0 ? (
            <p className="text-muted-foreground text-sm">内容库里还没有正则规则。</p>
          ) : (
            <div className="space-y-2">
              {regexRules.map((rule) => (
                <label
                  key={rule.id}
                  className="hover:bg-muted/40 flex min-w-0 cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors"
                >
                  <Checkbox
                    checked={draft.regexRuleIds.includes(rule.id)}
                    onChange={() => toggleId('regexRuleIds', rule.id)}
                    className="mt-0.5"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {rule.name}
                      <Badge variant={rule.enabled ? 'success' : 'outline'}>
                        {rule.enabled ? '启用' : '停用'}
                      </Badge>
                    </span>
                    <code className="text-muted-foreground mt-1 block max-w-full truncate text-[11px]">
                      /{rule.pattern}/{rule.flags}
                    </code>
                  </span>
                </label>
              ))}
            </div>
          )}
        </Section>

        <Section title="生成参数" description="范围会被校验；保存后只覆盖本段对话。">
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <NumberField
              label="Temperature"
              value={draft.generation.temperature}
              step={0.05}
              min={0}
              max={2}
              onChange={(value) => updateGeneration('temperature', value)}
              hint="越高越发散，建议 0.7–0.95"
            />
            <NumberField
              label="Top P"
              value={draft.generation.topP}
              step={0.01}
              min={0}
              max={1}
              onChange={(value) => updateGeneration('topP', value)}
              hint="控制候选词范围"
            />
            <NumberField
              label="最大回复 Token"
              value={draft.generation.maxTokens}
              step={50}
              min={64}
              max={8192}
              onChange={(value) => updateGeneration('maxTokens', value)}
              hint="限制每次生成的最大长度"
            />
            <NumberField
              label="Presence penalty"
              value={draft.generation.presencePenalty}
              step={0.05}
              min={-2}
              max={2}
              onChange={(value) => updateGeneration('presencePenalty', value)}
              hint="减少重复话题"
            />
            <NumberField
              label="Frequency penalty"
              value={draft.generation.frequencyPenalty}
              step={0.05}
              min={-2}
              max={2}
              onChange={(value) => updateGeneration('frequencyPenalty', value)}
              hint="减少重复用词"
            />
          </div>
        </Section>

        <Section title="聊天字号" description="只改变这段对话的气泡文字大小。">
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
            <input
              type="range"
              min={13}
              max={22}
              value={draft.fontSize}
              onChange={(event) => patchDraft({ fontSize: Number(event.target.value) })}
              aria-label="聊天字号"
              className="accent-primary w-full min-w-0 flex-1"
            />
            <span className="text-muted-foreground w-14 text-right text-xs font-semibold tabular-nums">
              {draft.fontSize}px
            </span>
          </div>
          <div className="bg-muted/45 mt-3 rounded-xl border p-3">
            <p className="text-muted-foreground text-[11px]">预览</p>
            <p className="mt-1 leading-[1.88]" style={{ fontSize: `${draft.fontSize}px` }}>
              这是一段用于预览聊天字号的示例文字。
            </p>
          </div>
        </Section>
      </main>

      <div
        data-testid="chat-settings-savebar"
        className="border-border bg-background/92 safe-bottom fixed inset-x-0 bottom-0 z-20 border-t backdrop-blur-xl"
      >
        <div className="mx-auto flex w-full max-w-4xl min-w-0 items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <p className="text-muted-foreground hidden text-xs sm:block">仅影响当前对话</p>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button variant="outline" asChild className="flex-1 sm:flex-none">
              <Link to={`/chat/${session.id}`}>取消</Link>
            </Button>
            <Button onClick={() => void save()} disabled={saving} className="flex-1 sm:flex-none">
              {saving && <Loader2 className="animate-spin" />}
              保存设置
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function NumberField({
  label,
  value,
  step,
  min,
  max,
  onChange,
  hint,
}: {
  label: string
  value: number
  step: number
  min: number
  max: number
  onChange: (value: string) => void
  hint: string
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type="number"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={(event) => onChange(event.target.value)}
      />
      <p className="text-muted-foreground text-[10px]">{hint}</p>
    </div>
  )
}
