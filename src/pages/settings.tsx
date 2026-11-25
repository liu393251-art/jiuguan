import {
  AppWindow,
  BookOpen,
  Brain,
  Braces,
  Check,
  ChevronLeft,
  Database,
  Download,
  Eye,
  EyeOff,
  FileText,
  KeyRound,
  Loader2,
  Moon,
  Palette,
  Pencil,
  Plus,
  Puzzle,
  RotateCcw,
  Save,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { ConfirmDialog } from '@/features/tavern/components/confirm-dialog'
import { PageHeader } from '@/features/tavern/components/page-header'
import { useSettings, useVectorMemoryStats } from '@/features/tavern/hooks/use-tavern'
import type {
  ApiProfile,
  ApiProfileInput,
  AppearanceSettings,
  MemoryMode,
  MemoryProfile,
  UserIdentity,
} from '@/features/tavern/types'
import {
  clearVectorMemories,
  exportData,
  fetchApiModels,
  getErrorMessage,
  resetTavernData,
  testApiConnection,
  updateSettings,
} from '@/features/tavern/api'
import { cn } from '@/lib/cn'
import { createUuid } from '@/lib/id'
import { useAppStore, type Theme } from '@/stores/app-store'

const selectClass =
  'border-input bg-background focus-visible:border-ring h-10 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/20'

type SettingsSectionId =
  | 'models'
  | 'characters'
  | 'identity'
  | 'theme'
  | 'presets'
  | 'worldbooks'
  | 'regex'
  | 'memory'
  | 'plugins'
  | 'general'

const SETTINGS_NAV_GROUPS: {
  items: { id: SettingsSectionId; label: string; icon: typeof Brain }[]
}[] = [
  {
    items: [{ id: 'models', label: '模型与服务', icon: AppWindow }],
  },
  {
    items: [
      { id: 'characters', label: '角色', icon: UsersRound },
      { id: 'identity', label: '用户身份', icon: ShieldCheck },
    ],
  },
  {
    items: [{ id: 'theme', label: '主题', icon: Palette }],
  },
  {
    items: [
      { id: 'presets', label: '预设', icon: FileText },
      { id: 'worldbooks', label: '世界书', icon: BookOpen },
      { id: 'regex', label: '正则', icon: Braces },
      { id: 'memory', label: '记忆', icon: Brain },
    ],
  },
  {
    items: [
      { id: 'plugins', label: '插件', icon: Puzzle },
      { id: 'general', label: '设置', icon: Settings },
    ],
  },
]

const SETTINGS_NAV_ITEMS = SETTINGS_NAV_GROUPS.flatMap((group) => group.items)

function isSettingsSection(value: string | null): value is SettingsSectionId {
  return SETTINGS_NAV_ITEMS.some((item) => item.id === value)
}

export function SettingsPage() {
  const settingsQuery = useSettings()
  const vectorStatsQuery = useVectorMemoryStats()
  const [searchParams] = useSearchParams()
  const theme = useAppStore((state) => state.theme)
  const setTheme = useAppStore((state) => state.setTheme)
  const [apiProfileEditor, setApiProfileEditor] = useState<{ open: boolean; value?: ApiProfile }>({
    open: false,
  })
  const [apiProfileToDelete, setApiProfileToDelete] = useState<ApiProfile | null>(null)
  const [identityOverride, setIdentity] = useState<UserIdentity | null>(null)
  const [memoryOverride, setMemory] = useState<MemoryProfile | null>(null)
  const [appearanceOverride, setAppearance] = useState<AppearanceSettings | null>(null)
  const [identityError, setIdentityError] = useState('')
  const [saving, setSaving] = useState<'identity' | 'memory' | 'appearance' | null>(null)
  const [savingApiProfile, setSavingApiProfile] = useState(false)
  const [deletingApiProfile, setDeletingApiProfile] = useState(false)
  const [testingApiProfileId, setTestingApiProfileId] = useState('')
  const [resetOpen, setResetOpen] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [memoryClearOpen, setMemoryClearOpen] = useState(false)
  const [clearingMemory, setClearingMemory] = useState(false)
  const [exporting, setExporting] = useState(false)

  const apiProfiles = settingsQuery.data?.apiProfiles ?? []
  const identity = identityOverride ?? settingsQuery.data?.identity ?? null
  const memory = memoryOverride ?? settingsQuery.data?.memoryProfile ?? null
  const appearance = appearanceOverride ?? settingsQuery.data?.appearance ?? null
  const vectorApiProfile =
    apiProfiles.find((profile) => profile.id === memory?.apiProfileId) ?? null
  const rawSection = searchParams.get('section')
  const activeSection = isSettingsSection(rawSection) ? rawSection : null
  const activeNavItem = SETTINGS_NAV_ITEMS.find((item) => item.id === activeSection) ?? null

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [activeSection])

  async function saveApiProfile(input: ApiProfileInput) {
    setSavingApiProfile(true)
    try {
      const nextProfiles = apiProfileEditor.value
        ? apiProfiles.map((profile) =>
            profile.id === apiProfileEditor.value?.id ? { ...input, id: profile.id } : profile,
          )
        : [{ ...input, id: createUuid() }, ...apiProfiles]
      await updateSettings({ apiProfiles: nextProfiles })
      toast.success(apiProfileEditor.value ? 'API 连接已更新' : 'API 连接已保存', {
        description: '密钥只保存在当前浏览器，请勿填写生产环境密钥。',
      })
      setApiProfileEditor({ open: false })
      settingsQuery.refresh()
      return true
    } catch (error) {
      toast.error('API 连接没有保存', { description: getErrorMessage(error) })
      return false
    } finally {
      setSavingApiProfile(false)
    }
  }

  async function handleTestApiProfile(profile: ApiProfile) {
    setTestingApiProfileId(profile.id)
    try {
      const result = await testApiConnection(profile)
      toast.success(`「${profile.name}」连接成功`, {
        description:
          result.modelCount > 0
            ? `接口返回 ${result.modelCount} 个模型。`
            : '接口已响应，但没有返回模型列表。',
      })
    } catch (error) {
      toast.error(`「${profile.name}」连接失败`, { description: getErrorMessage(error) })
    } finally {
      setTestingApiProfileId('')
    }
  }

  async function handleDeleteApiProfile() {
    if (!apiProfileToDelete) return
    setDeletingApiProfile(true)
    try {
      const nextProfiles = apiProfiles.filter((profile) => profile.id !== apiProfileToDelete.id)
      const nextMemory =
        memory?.apiProfileId === apiProfileToDelete.id
          ? { ...memory, apiProfileId: null }
          : undefined
      await updateSettings({
        apiProfiles: nextProfiles,
        ...(nextMemory ? { memoryProfile: nextMemory } : {}),
      })
      if (nextMemory) setMemory(nextMemory)
      toast.success('API 连接已删除')
      setApiProfileToDelete(null)
      settingsQuery.refresh()
    } catch (error) {
      toast.error('删除失败', { description: getErrorMessage(error) })
    } finally {
      setDeletingApiProfile(false)
    }
  }

  async function saveIdentity() {
    if (!identity) return
    if (!identity.displayName.trim()) {
      setIdentityError('请填写你的称呼。')
      return
    }
    setIdentityError('')
    setSaving('identity')
    try {
      await updateSettings({ identity: { ...identity, displayName: identity.displayName.trim() } })
      toast.success('身份与记忆设置已保存')
      settingsQuery.refresh()
    } catch (error) {
      toast.error('保存失败', { description: getErrorMessage(error) })
    } finally {
      setSaving(null)
    }
  }

  async function saveMemory() {
    if (!memory) return
    setSaving('memory')
    try {
      await updateSettings({
        memoryProfile: {
          ...memory,
          summaryPrompt: memory.summaryPrompt.trim(),
          maxMessages: Math.min(80, Math.max(4, Math.round(memory.maxMessages))),
        },
      })
      toast.success('记忆设置已保存', {
        description: '新对话会使用这套默认记忆方式，已有对话保持原样。',
      })
      settingsQuery.refresh()
    } catch (error) {
      toast.error('保存失败', { description: getErrorMessage(error) })
    } finally {
      setSaving(null)
    }
  }

  async function saveAppearance() {
    if (!appearance) return
    setSaving('appearance')
    try {
      await updateSettings({ appearance })
      toast.success('外观偏好已保存')
      settingsQuery.refresh()
    } catch (error) {
      toast.error('保存失败', { description: getErrorMessage(error) })
    } finally {
      setSaving(null)
    }
  }

  async function handleExport() {
    setExporting(true)
    try {
      const response = await exportData()
      const blob = new Blob([JSON.stringify(response, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `xiaobai-export-${new Date().toISOString().slice(0, 10)}.json`
      anchor.click()
      URL.revokeObjectURL(url)
      toast.success('数据已导出', { description: 'JSON 文件保存在浏览器下载目录。' })
    } catch (error) {
      toast.error('导出失败', { description: getErrorMessage(error) })
    } finally {
      setExporting(false)
    }
  }

  async function handleReset() {
    setResetting(true)
    try {
      const result = await resetTavernData()
      toast.success('本地数据已清空', {
        description: `${result.characters} 位角色、${result.sessions} 段对话已删除。`,
      })
      setResetOpen(false)
      settingsQuery.refresh()
    } catch (error) {
      toast.error('重置失败', { description: getErrorMessage(error) })
    } finally {
      setResetting(false)
    }
  }

  async function handleClearVectorMemories() {
    setClearingMemory(true)
    try {
      const result = await clearVectorMemories()
      toast.success('长期向量记忆已清空', {
        description: `已移除 ${result.removed} 条记忆，聊天记录本身不受影响。`,
      })
      setMemoryClearOpen(false)
      vectorStatsQuery.refresh()
    } catch (error) {
      toast.error('清空失败', { description: getErrorMessage(error) })
    } finally {
      setClearingMemory(false)
    }
  }

  if (settingsQuery.isLoading && !settingsQuery.data) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-52 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    )
  }

  if (settingsQuery.error || !identity || !appearance) {
    return (
      <div className="border-destructive/20 bg-destructive/5 rounded-2xl border p-5">
        <p className="text-destructive font-semibold">设置没有加载出来</p>
        <p className="text-muted-foreground mt-1 text-sm">{settingsQuery.error ?? ''}</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={settingsQuery.refresh}>
          重新加载
        </Button>
      </div>
    )
  }

  const sectionVisibility = (section: SettingsSectionId) =>
    cn('min-w-0 [&>div]:h-full', activeSection === section ? 'block' : 'hidden lg:block')
  const ActiveSectionIcon = activeNavItem?.icon ?? Settings

  return (
    <div className="space-y-6">
      <div className={cn(activeSection && 'hidden lg:block')}>
        <PageHeader
          eyebrow="本地偏好"
          title="设置"
          description="管理真实 API 连接、身份、记忆和外观偏好。没有连接时，聊天会提示先完成配置。"
          actions={
            <div className="bg-card flex rounded-xl border p-1">
              <ThemeButton
                value="light"
                current={theme}
                onSelect={setTheme}
                icon={Sun}
                label="浅色"
              />
              <ThemeButton
                value="dark"
                current={theme}
                onSelect={setTheme}
                icon={Moon}
                label="深色"
              />
            </div>
          }
        />
      </div>

      {!activeSection && (
        <div className="lg:hidden">
          <SettingsMobileIndex />
        </div>
      )}

      {activeSection && activeNavItem && (
        <div className="space-y-4 lg:hidden">
          <Link
            to="/settings"
            replace
            aria-label="返回设置"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm font-semibold transition-colors"
          >
            <ChevronLeft className="size-4" />
            设置
          </Link>
          <div className="flex items-center gap-3">
            <span className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-xl">
              <ActiveSectionIcon className="size-5" strokeWidth={1.8} />
            </span>
            <h2 className="font-display text-[1.75rem] font-semibold tracking-[-0.03em]">
              {activeNavItem.label}
            </h2>
          </div>

          {activeSection === 'theme' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="size-4" />
                  主题
                </CardTitle>
                <CardDescription>选择浅色或深色外观，偏好会保存在当前设备。</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="bg-muted/30 flex gap-2 rounded-xl border p-1.5">
                  <ThemeButton
                    value="light"
                    current={theme}
                    onSelect={setTheme}
                    icon={Sun}
                    label="浅色"
                  />
                  <ThemeButton
                    value="dark"
                    current={theme}
                    onSelect={setTheme}
                    icon={Moon}
                    label="深色"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {activeSection === 'characters' && (
            <SettingsEntryCard
              icon={UsersRound}
              title="角色库"
              description="查看角色卡、标签与背景设定，也可以从这里新建或导入角色。"
              href="/characters"
              actionLabel="打开角色库"
            />
          )}
          {activeSection === 'presets' && (
            <SettingsEntryCard
              icon={FileText}
              title="预设"
              description="管理系统提示词与生成参数，应用到角色或对话。"
              href="/import?tab=presets"
              actionLabel="管理预设"
            />
          )}
          {activeSection === 'worldbooks' && (
            <SettingsEntryCard
              icon={BookOpen}
              title="世界书"
              description="管理世界书条目，让设定按关键词进入上下文。"
              href="/import?tab=worldbooks"
              actionLabel="管理世界书"
            />
          )}
          {activeSection === 'regex' && (
            <SettingsEntryCard
              icon={Braces}
              title="正则"
              description="管理输入与输出过滤规则，清理或改写聊天文本。"
              href="/import?tab=regex"
              actionLabel="管理正则"
            />
          )}
          {activeSection === 'plugins' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Puzzle className="size-4" />
                  插件
                </CardTitle>
                <CardDescription>插件系统还在准备中，当前版本没有可安装的插件。</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="bg-muted/25 rounded-xl border border-dashed p-5 text-center">
                  <p className="text-sm font-semibold">暂无已安装插件</p>
                  <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                    开放后会在这里管理扩展功能，不会影响现有聊天数据。
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        <div className={sectionVisibility('models')}>
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <KeyRound className="size-4" />
                    API 连接
                  </CardTitle>
                  <CardDescription>
                    保存多套 OpenAI 兼容接口。密钥只保存在当前设备，聊天时直接请求你选择的连接。
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setApiProfileEditor({ open: true })}
                >
                  <Plus />
                  新增连接
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {apiProfiles.length === 0 ? (
                <div className="bg-muted/25 rounded-xl border border-dashed p-5 text-center">
                  <p className="text-sm font-semibold">还没有保存的 API 连接</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    添加后可单独测试，也能指定给向量记忆使用。
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {apiProfiles.map((profile) => (
                    <div key={profile.id} className="bg-muted/20 rounded-xl border p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold">{profile.name}</p>
                            {memory?.apiProfileId === profile.id && (
                              <Badge variant="success">向量记忆</Badge>
                            )}
                          </div>
                          <p className="text-muted-foreground mt-1 truncate text-[11px]">
                            {profile.model || '未填写模型'} · {profile.baseUrl || '未填写地址'}
                          </p>
                          <p className="text-muted-foreground mt-1 font-mono text-[10px]">
                            {maskApiKey(profile.apiKey)}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleTestApiProfile(profile)}
                            disabled={testingApiProfileId === profile.id}
                          >
                            {testingApiProfileId === profile.id ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <KeyRound />
                            )}
                            测试
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setApiProfileEditor({ open: true, value: profile })}
                          >
                            <Pencil />
                            编辑
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => setApiProfileToDelete(profile)}
                          >
                            <Trash2 />
                            删除
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                API Key
                会随连接保存在本机浏览器。这里仅适合测试；不要在共享设备或生产环境填写真实密钥。
              </p>
            </CardContent>
          </Card>
        </div>

        <div className={sectionVisibility('identity')}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserRound className="size-4" />
                身份
              </CardTitle>
              <CardDescription>角色会看到你的称呼和人设摘要。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="identity-name">你的称呼</Label>
                <Input
                  id="identity-name"
                  value={identity.displayName}
                  onChange={(event) =>
                    setIdentity({ ...identity, displayName: event.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="identity-persona">你的人设</Label>
                <Textarea
                  id="identity-persona"
                  value={identity.persona}
                  onChange={(event) => setIdentity({ ...identity, persona: event.target.value })}
                  className="min-h-28"
                  placeholder="例如：一个习惯在深夜说话的人。"
                />
              </div>
              {identityError && <p className="text-destructive text-xs">{identityError}</p>}
              <Button onClick={() => void saveIdentity()} disabled={saving === 'identity'}>
                {saving === 'identity' ? <Loader2 className="animate-spin" /> : <Save />}
                保存身份
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className={sectionVisibility('memory')}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="size-4" />
                记忆
              </CardTitle>
              <CardDescription>
                这里决定新对话默认怎么记住内容；每段对话仍可在右上角单独覆盖。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {memory ? (
                <>
                  <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                    {MEMORY_MODES.map((mode) => (
                      <button
                        key={mode.value}
                        type="button"
                        aria-pressed={memory.mode === mode.value}
                        onClick={() => setMemory({ ...memory, mode: mode.value })}
                        className={cn(
                          'min-w-0 rounded-xl border p-3 text-left transition-colors',
                          memory.mode === mode.value
                            ? 'border-primary/35 bg-primary/[0.045] ring-primary/15 ring-1'
                            : 'hover:border-foreground/20',
                        )}
                      >
                        <span className="flex items-center gap-2 text-sm font-semibold">
                          {memory.mode === mode.value && (
                            <Check className="text-primary size-3.5" />
                          )}
                          {mode.label}
                        </span>
                        <span className="text-muted-foreground mt-1 block text-[11px] leading-relaxed">
                          {mode.hint}
                        </span>
                      </button>
                    ))}
                  </div>

                  {memory.mode === 'compressed' && (
                    <div className="border-primary/15 bg-primary/[0.035] rounded-xl border p-3">
                      <p className="flex items-center gap-1.5 text-sm font-medium">
                        <Sparkles className="text-primary size-4" />
                        聊天 API 压缩
                      </p>
                      <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">
                        新对话每次完整回复后，都会用这条对话的生成连接把全部已完成历史压缩成长期记忆；需要先配置可用的聊天
                        API。压缩内容只保存在当前对话里，不上传云端数据库。
                      </p>
                    </div>
                  )}

                  {memory.mode === 'vector' && (
                    <div className="border-primary/15 bg-primary/[0.035] space-y-3 rounded-xl border p-3">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        <Sparkles className="text-primary size-4" />
                        向量引擎
                        <Badge variant="outline">
                          {vectorApiProfile?.model.trim() || '本机向量 · 不联网'}
                        </Badge>
                      </p>
                      <p className="text-muted-foreground mt-1.5 text-[11px] leading-relaxed">
                        默认在本机完成向量化和相似度计算，全部已完成历史都会写入本机 IndexedDB
                        向量库，不使用几 MB 的 localStorage，也不上传云端数据库。选择 API
                        后会调用该连接的
                        <code className="mx-1">/embeddings</code>
                        生成向量，请选支持 embeddings
                        的模型；接口不支持或请求失败时自动退回本机向量。
                      </p>
                      <div className="space-y-1.5">
                        <Label htmlFor="memory-api-profile">向量生成连接</Label>
                        <select
                          id="memory-api-profile"
                          value={memory.apiProfileId ?? ''}
                          onChange={(event) =>
                            setMemory({ ...memory, apiProfileId: event.target.value || null })
                          }
                          className={selectClass}
                        >
                          <option value="">本机向量（推荐，不联网）</option>
                          {apiProfiles.map((profile) => (
                            <option key={profile.id} value={profile.id}>
                              {profile.name} · {profile.model || '未填模型'}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {memory.mode === 'vector' ? (
                    <div className="border-primary/15 bg-primary/[0.035] rounded-xl border p-3">
                      <p className="text-sm font-medium">向量模式不按条数截断</p>
                      <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">
                        当前对话会完整带入；“上下文条数”只用于最近消息和摘要模式。旧对话会全部进入本机向量库，并按语义召回相关片段。
                      </p>
                    </div>
                  ) : (
                    <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
                      <div className="space-y-1.5">
                        <Label htmlFor="memory-summary-prompt">
                          {memory.mode === 'compressed' ? '压缩提示词' : '摘要提示词'}
                        </Label>
                        <Textarea
                          id="memory-summary-prompt"
                          value={memory.summaryPrompt}
                          onChange={(event) =>
                            setMemory({ ...memory, summaryPrompt: event.target.value })
                          }
                          className="min-h-24"
                          placeholder={
                            memory.mode === 'compressed'
                              ? '例如：优先保留关系变化、承诺、未完成的任务和关键物品。'
                              : '例如：保留关系变化、承诺和未完成的约定。'
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="memory-max-messages">上下文条数</Label>
                        <Input
                          id="memory-max-messages"
                          type="number"
                          min={4}
                          max={80}
                          value={memory.maxMessages}
                          onChange={(event) =>
                            setMemory({ ...memory, maxMessages: Number(event.target.value) })
                          }
                        />
                        <p className="text-muted-foreground text-[11px]">
                          {memory.mode === 'compressed' ? '每轮额外带上的最近原文条数' : '4–80 条'}
                        </p>
                      </div>
                    </div>
                  )}

                  <p className="text-muted-foreground text-[11px] leading-relaxed">
                    记忆会自动保存在本机当前对话里；这里保存的是新对话的默认方式，不会改写历史消息。
                  </p>
                  <div className="rounded-xl border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-sm font-medium">
                          <Database className="size-3.5" />
                          长期向量库
                        </p>
                        <p className="text-muted-foreground mt-0.5 text-[11px]">
                          {vectorStatsQuery.data
                            ? `${vectorStatsQuery.data.total} 条记忆 · 本机 ${vectorStatsQuery.data.localCount} / API ${vectorStatsQuery.data.apiCount}`
                            : vectorStatsQuery.error
                              ? `读取失败：${vectorStatsQuery.error}`
                              : '正在读取本地向量库…'}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive"
                        onClick={() => setMemoryClearOpen(true)}
                        disabled={!vectorStatsQuery.data || vectorStatsQuery.data.total === 0}
                      >
                        <Trash2 />
                        清空
                      </Button>
                    </div>
                    <p className="text-muted-foreground mt-2 text-[11px] leading-relaxed">
                      只有选择向量记忆的对话会把消息写入这里。全部已完成的用户与角色消息都会自动索引；旧版本存在
                      localStorage 的向量会在首次启动时自动迁入。库只保存在当前设备，正常重启和 App
                      更新会保留，卸载应用或清除应用数据会删除；删除对话时会同步清理对应记忆。
                    </p>
                  </div>
                  <Button onClick={() => void saveMemory()} disabled={saving === 'memory'}>
                    {saving === 'memory' ? <Loader2 className="animate-spin" /> : <Save />}
                    保存记忆设置
                  </Button>
                </>
              ) : (
                <Skeleton className="h-44 rounded-xl" />
              )}
            </CardContent>
          </Card>
        </div>

        <div className={sectionVisibility('theme')}>
          <Card>
            <CardHeader>
              <CardTitle>外观</CardTitle>
              <CardDescription>新对话会继承默认聊天字号，已有对话保持不变。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="default-font">新对话默认字号</Label>
                <div className="flex items-center gap-3">
                  <input
                    id="default-font"
                    type="range"
                    min={13}
                    max={22}
                    value={appearance.defaultChatFontSize}
                    onChange={(event) =>
                      setAppearance({
                        ...appearance,
                        defaultChatFontSize: Number(event.target.value),
                      })
                    }
                    className="accent-primary flex-1"
                  />
                  <span className="w-10 text-right text-xs font-semibold tabular-nums">
                    {appearance.defaultChatFontSize}px
                  </span>
                </div>
              </div>
              <Button onClick={() => void saveAppearance()} disabled={saving === 'appearance'}>
                {saving === 'appearance' ? <Loader2 className="animate-spin" /> : <Save />}
                保存外观
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className={sectionVisibility('general')}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="size-4" />
              数据管理
            </CardTitle>
            <CardDescription>
              导出备份或清空本机数据。角色卡、预设、世界书和正则请从左侧“导入区”进入。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                variant="outline"
                className="justify-start"
                onClick={() => void handleExport()}
                disabled={exporting}
              >
                {exporting ? <Loader2 className="animate-spin" /> : <Download />}
                导出全部数据
              </Button>
              <Button
                variant="outline"
                className="text-destructive justify-start"
                onClick={() => setResetOpen(true)}
              >
                <RotateCcw />
                清空本地数据
              </Button>
            </div>
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              清空会删除当前浏览器里的全部角色、对话、内容库和设置，回到空状态；不会恢复示例内容。
            </p>
          </CardContent>
        </Card>
      </div>

      {apiProfileEditor.open && (
        <ApiProfileDialog
          open
          profile={apiProfileEditor.value}
          saving={savingApiProfile}
          onOpenChange={(open) => setApiProfileEditor((current) => ({ ...current, open }))}
          onSave={saveApiProfile}
        />
      )}
      <ConfirmDialog
        open={apiProfileToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setApiProfileToDelete(null)
        }}
        title={`删除「${apiProfileToDelete?.name ?? ''}」？`}
        description="删除后，引用这条连接的对话和向量记忆会自动改为自动选择；已经生成的记忆不会删除。"
        loading={deletingApiProfile}
        onConfirm={() => void handleDeleteApiProfile()}
      />
      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="清空本地数据？"
        description="当前角色、对话、预设、世界书、正则和设置都会被删除，且无法撤销。"
        confirmLabel="确认清空"
        loading={resetting}
        onConfirm={() => void handleReset()}
      />
      <ConfirmDialog
        open={memoryClearOpen}
        onOpenChange={setMemoryClearOpen}
        title="清空长期向量记忆？"
        description="只会移除向量库里保存的记忆片段，历史聊天记录、角色和配套都不会被删除。"
        confirmLabel="清空记忆"
        loading={clearingMemory}
        onConfirm={() => void handleClearVectorMemories()}
      />
    </div>
  )
}

function SettingsMobileIndex() {
  return (
    <nav aria-label="设置分类">
      <Card className="overflow-hidden">
        <CardContent className="p-1.5">
          {SETTINGS_NAV_GROUPS.map((group, groupIndex) => (
            <div
              key={group.items.map((item) => item.id).join('-')}
              className={cn(groupIndex > 0 && 'border-border mt-1 border-t pt-1')}
            >
              {group.items.map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.id}
                    to={`/settings?section=${item.id}`}
                    aria-label={item.label}
                    className="hover:bg-muted/60 active:bg-muted flex min-h-14 items-center gap-3.5 rounded-lg px-3 py-3.5 transition-colors"
                  >
                    <Icon className="text-muted-foreground size-5 shrink-0" strokeWidth={1.8} />
                    <span className="text-[15px] font-medium">{item.label}</span>
                    {item.id === 'plugins' && (
                      <span className="text-muted-foreground ml-auto text-[10px] font-semibold">
                        即将开放
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          ))}
        </CardContent>
      </Card>
    </nav>
  )
}

function SettingsEntryCard({
  icon: Icon,
  title,
  description,
  href,
  actionLabel,
}: {
  icon: typeof Brain
  title: string
  description: string
  href: string
  actionLabel: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline">
          <Link to={href}>{actionLabel}</Link>
        </Button>
      </CardContent>
    </Card>
  )
}

const MEMORY_MODES: { value: MemoryMode; label: string; hint: string }[] = [
  {
    value: 'off',
    label: '关闭记忆',
    hint: '只带当前输入，不额外保存长期记忆。',
  },
  {
    value: 'recent',
    label: '最近消息',
    hint: '保留最近一段对话作为上下文。',
  },
  {
    value: 'summary',
    label: '摘要记忆',
    hint: '自动沉淀长期摘要，适合连续剧情。',
  },
  {
    value: 'compressed',
    label: '压缩记忆',
    hint: '每次回复后调用聊天 API，把全部上下文压缩成长期记忆。',
  },
  {
    value: 'vector',
    label: '向量记忆',
    hint: '全部历史进入本机向量库，按语义召回，不按条数截断。',
  },
]

function maskApiKey(value: string) {
  const key = value.trim()
  if (!key) return '未填写 API Key'
  if (key.length <= 8) return '••••••••'
  return `${key.slice(0, 3)}••••••${key.slice(-4)}`
}

function ApiProfileDialog({
  open,
  profile,
  saving,
  onOpenChange,
  onSave,
}: {
  open: boolean
  profile?: ApiProfile
  saving: boolean
  onOpenChange: (open: boolean) => void
  onSave: (input: ApiProfileInput) => Promise<boolean>
}) {
  const [name, setName] = useState(profile?.name ?? '')
  const [baseUrl, setBaseUrl] = useState(profile?.baseUrl ?? '')
  const [model, setModel] = useState(profile?.model ?? '')
  const [apiKey, setApiKey] = useState(profile?.apiKey ?? '')
  const [showKey, setShowKey] = useState(false)
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [modelError, setModelError] = useState('')
  const [error, setError] = useState('')

  async function loadModels() {
    if (!/^https?:\/\//i.test(baseUrl.trim())) {
      setModelError('先填写有效的 Base URL。')
      return
    }
    setModelError('')
    setLoadingModels(true)
    try {
      const models = await fetchApiModels({ baseUrl, apiKey })
      setAvailableModels(models)
      if (models.length === 0) {
        setModelError('接口没有返回可用模型。')
      } else if (!model.trim() || !models.includes(model.trim())) {
        setModel(models[0])
      }
    } catch (caught) {
      setModelError(getErrorMessage(caught))
    } finally {
      setLoadingModels(false)
    }
  }

  async function save() {
    if (!name.trim()) {
      setError('请填写连接名称。')
      return
    }
    if (!/^https?:\/\//i.test(baseUrl.trim())) {
      setError('Base URL 需要以 http:// 或 https:// 开头。')
      return
    }
    if (!model.trim()) {
      setError('请填写模型名。')
      return
    }
    setError('')
    await onSave({
      name: name.trim(),
      provider: 'openai-compatible',
      baseUrl: baseUrl.trim().replace(/\/$/, ''),
      model: model.trim(),
      apiKey: apiKey.trim(),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{profile ? '编辑 API 连接' : '新增 API 连接'}</DialogTitle>
          <DialogDescription>
            兼容 OpenAI 的接口地址。每条连接会单独保存，可分别测试并指定给向量记忆。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="api-profile-name">连接名称</Label>
            <Input
              id="api-profile-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：本机中转"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="api-profile-base">Base URL</Label>
            <Input
              id="api-profile-base"
              value={baseUrl}
              onChange={(event) => {
                setBaseUrl(event.target.value)
                setAvailableModels([])
                setModelError('')
              }}
              placeholder="https://api.openai.com/v1"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="api-profile-model">模型</Label>
                <button
                  type="button"
                  onClick={() => void loadModels()}
                  disabled={loadingModels}
                  className="text-primary text-[11px] font-semibold disabled:opacity-50"
                >
                  {loadingModels ? '获取中…' : '获取模型'}
                </button>
              </div>
              <Input
                id="api-profile-model"
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder="gpt-4o-mini"
              />
              {availableModels.length > 0 && (
                <select
                  aria-label="选择模型"
                  value={availableModels.includes(model) ? model : ''}
                  onChange={(event) => setModel(event.target.value)}
                  className={selectClass}
                >
                  <option value="">选择模型</option>
                  {availableModels.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              )}
              {modelError && <p className="text-destructive text-[11px]">{modelError}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="api-profile-key">API Key</Label>
              <div className="relative">
                <Input
                  id="api-profile-key"
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(event) => {
                    setApiKey(event.target.value)
                    setAvailableModels([])
                    setModelError('')
                  }}
                  placeholder="sk-..."
                  autoComplete="off"
                  spellCheck={false}
                  className="pr-10 font-mono text-xs"
                />
                <button
                  type="button"
                  aria-label={showKey ? '隐藏密钥' : '显示密钥'}
                  onClick={() => setShowKey((current) => !current)}
                  className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1"
                >
                  {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
          </div>
          <p className="text-muted-foreground text-[11px] leading-relaxed">
            密钥以明文保存在当前浏览器的本地数据中，仅用于本机测试，不会上传到其他服务。
          </p>
          {error && <p className="text-destructive text-xs">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}
            保存连接
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ThemeButton({
  value,
  current,
  onSelect,
  icon: Icon,
  label,
}: {
  value: Theme
  current: Theme
  onSelect: (theme: Theme) => void
  icon: typeof Sun
  label: string
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      aria-pressed={current === value}
      className={cn(
        'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
        current === value
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="size-3.5" />
      {label}
      {current === value && <Check className="size-3" />}
    </button>
  )
}
