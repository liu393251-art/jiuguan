import {
  ArrowLeft,
  CheckCircle2,
  FileJson,
  FileWarning,
  Image,
  Loader2,
  Package,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import { useRef, useState, type DragEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { PageHeader } from '@/features/tavern/components/page-header'
import { importEntity, getErrorMessage } from '@/features/tavern/api'
import { buildImportPayload, type ParsedImport } from '@/features/tavern/lib/import-parser'
import {
  buildPackImportPayload,
  isZipFile,
  parseAnyImportFile,
  type ParsedTavernPack,
} from '@/features/tavern/lib/pack-import'
import { formatFileSize } from '@/features/tavern/lib/format'
import type { ImportKind } from '@/features/tavern/types'
import { cn } from '@/lib/cn'

type ReviewStatus = 'idle' | 'importing' | 'success' | 'error'

type ReviewItem = {
  id: string
  parsed: ParsedImport
  kind: ImportKind | 'unknown'
  skip: boolean
  status: ReviewStatus
  message: string
}

const kindLabels: Record<ImportKind | 'unknown', string> = {
  character: '角色卡',
  preset: '预设',
  worldbook: '世界书',
  regex: '正则',
  pack: '配套包',
  unknown: '无法识别',
}

const targetLabels: Record<ImportKind | 'unknown', string> = {
  character: '角色库',
  preset: '预设',
  worldbook: '世界书',
  regex: '正则',
  pack: '配套',
  unknown: '未选择',
}

const packSupport = {
  icon: Package,
  title: 'ZIP 配套包',
  text: '自动识别包内角色卡、预设、世界书与正则，导入后直接生成配套',
}

const supported = [
  packSupport,
  { icon: Image, title: 'PNG 角色卡', text: '读取 tEXt / iTXt 的 ccv3 或 chara' },
  { icon: FileJson, title: 'JSON 角色卡', text: '兼容 v1/v2/v3 与 data 包裹' },
  {
    icon: FileJson,
    title: 'SillyTavern 预设',
    text: '识别 Chat/Text Completion 参数与 prompt 结构',
  },
  { icon: FileJson, title: '世界书 / 正则', text: 'entries、keys、findRegex 等常见导出' },
]

let nextItemId = 0

export function ImportCenterPage() {
  const [searchParams] = useSearchParams()
  const packOnly = searchParams.get('pack') === '1'
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [items, setItems] = useState<ReviewItem[]>([])
  const [parsing, setParsing] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [importing, setImporting] = useState(false)
  const [imported, setImported] = useState(false)

  async function reviewFiles(files: FileList | File[]) {
    const allFiles = Array.from(files)
    const list = packOnly ? allFiles.filter(isZipFile) : allFiles
    if (packOnly && list.length !== allFiles.length) {
      toast.error('导入配套只接受 ZIP 文件')
    }
    if (list.length === 0) {
      toast.error(packOnly ? '请选择一个 ZIP 配套包' : '只支持 ZIP、PNG 角色卡和 JSON 文件')
      return
    }
    setParsing(true)
    setImported(false)
    try {
      const reviewed = await Promise.all(
        list.map(async (file) => {
          const parsed = await parseAnyImportFile(file)
          nextItemId += 1
          return {
            id: `import-${nextItemId}`,
            parsed,
            kind: parsed.autoKind,
            skip: false,
            status: 'idle' as const,
            message: '',
          }
        }),
      )
      setItems((current) => [...current, ...reviewed])
    } finally {
      setParsing(false)
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    if (event.dataTransfer.files.length > 0) void reviewFiles(event.dataTransfer.files)
  }

  function updateItem(id: string, patch: Partial<ReviewItem>) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  async function startImport() {
    const targets = items.filter(
      (item) => !item.skip && item.kind !== 'unknown' && !item.parsed.blocked,
    )
    if (targets.length === 0) {
      toast.error('没有可导入的文件', {
        description: '无法识别的普通文件可以手动选择类型；配套包需要包含且只包含一张角色卡。',
      })
      return
    }
    setImporting(true)
    let success = 0
    let failed = 0
    for (const item of targets) {
      const kind = item.kind as ImportKind
      updateItem(item.id, { status: 'importing', message: '正在写入本地数据…' })
      try {
        const payload =
          kind === 'pack'
            ? buildPackImportPayload(item.parsed.raw as ParsedTavernPack)
            : buildImportPayload(kind, item.parsed.raw, item.parsed.fileName)
        const result = await importEntity(kind, item.parsed.name, payload)
        success += 1
        updateItem(item.id, { status: 'success', message: result.message })
      } catch (error) {
        failed += 1
        updateItem(item.id, { status: 'error', message: getErrorMessage(error) })
      }
    }
    setImporting(false)
    setImported(true)
    if (failed === 0) {
      toast.success(`已导入 ${success} 个文件`, { description: '其他文件不受影响。' })
    } else {
      toast.warning(`导入完成：${success} 成功，${failed} 失败`, {
        description: '失败项可以在列表中查看原因，其他文件已保留。',
      })
    }
  }

  const importable = items.filter(
    (item) => !item.skip && item.kind !== 'unknown' && !item.parsed.blocked,
  ).length

  return (
    <div className="space-y-6">
      <Link
        to="/import"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs font-medium"
      >
        <ArrowLeft className="size-3.5" />
        返回导入区
      </Link>

      <PageHeader
        eyebrow={packOnly ? '导入区 · 配套包' : '导入区 · 文件识别'}
        title={packOnly ? '导入配套' : '导入文件'}
        description={
          packOnly
            ? '选择一个 ZIP 配套包。小白酒馆会读取包内角色卡、预设、世界书和正则，一次性创建资源并绑定成一套配套。'
            : '一次拖入多个文件或一个 ZIP 配套包。小白酒馆会自动识别角色卡、预设、世界书和正则；导入角色卡会顺手生成默认配套。'
        }
        actions={
          <Button variant="outline" asChild>
            <Link to="/import">进入导入区</Link>
          </Button>
        }
      />

      <div
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          'bg-card/60 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors',
          dragging && 'border-primary bg-primary/[0.04]',
        )}
      >
        <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-2xl">
          {parsing ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <UploadCloud className="size-5" />
          )}
        </div>
        <p className="font-display mt-4 text-lg font-semibold">
          {parsing ? '正在读取文件…' : packOnly ? '把 ZIP 配套包拖到这里' : '把文件拖到这里'}
        </p>
        <p className="text-muted-foreground mt-1 max-w-md text-xs leading-relaxed">
          {packOnly
            ? '配套包只在浏览器中解压和识别，确认导入后才写入本地。'
            : '文件只在浏览器中解析，识别后的结构化数据再通过 Mock API 写入本地。支持 ZIP、PNG 和 JSON，可多选。'}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={
            packOnly
              ? '.zip,application/zip,application/x-zip-compressed'
              : '.zip,.png,.json,application/zip,application/x-zip-compressed,image/png,application/json'
          }
          multiple
          className="sr-only"
          onChange={(event) => {
            if (event.target.files) void reviewFiles(event.target.files)
            event.target.value = ''
          }}
        />
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button onClick={() => inputRef.current?.click()} disabled={parsing}>
            <UploadCloud />
            选择文件
          </Button>
          {items.length > 0 && (
            <Button variant="outline" onClick={() => setItems([])} disabled={importing}>
              <Trash2 />
              清空列表
            </Button>
          )}
        </div>
      </div>

      {items.length === 0 && (
        <div
          className={cn(
            'grid gap-3 sm:grid-cols-2',
            packOnly ? 'xl:grid-cols-4' : 'xl:grid-cols-5',
          )}
        >
          {(packOnly ? [packSupport] : supported).map((item) => {
            const Icon = item.icon
            return (
              <Card key={item.title}>
                <CardHeader className="pb-2">
                  <Icon className="text-primary size-5" />
                  <CardTitle className="mt-2 text-sm">{item.title}</CardTitle>
                  <CardDescription>{item.text}</CardDescription>
                </CardHeader>
              </Card>
            )
          })}
        </div>
      )}

      {items.length > 0 && (
        <Card>
          <CardHeader className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>待导入文件</CardTitle>
              <CardDescription>
                {items.length} 个文件 · {importable}{' '}
                个待导入。普通文件可以手动覆盖类型，配套包按包内内容识别。
              </CardDescription>
            </div>
            <Button onClick={() => void startImport()} disabled={importing || importable === 0}>
              {importing ? <Loader2 className="animate-spin" /> : <UploadCloud />}
              开始导入 {importable > 0 ? `(${importable})` : ''}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {items.map((item) => (
              <div
                key={item.id}
                className={cn(
                  'rounded-xl border p-3 transition-colors',
                  item.skip && 'opacity-55',
                  item.status === 'success' && 'border-success/30 bg-success/[0.035]',
                  item.status === 'error' && 'border-destructive/30 bg-destructive/[0.035]',
                )}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div className="bg-muted mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg">
                      {item.parsed.autoKind === 'pack' ? (
                        <Package className="size-4" />
                      ) : item.parsed.fileName.toLowerCase().endsWith('.png') ? (
                        <Image className="size-4" />
                      ) : (
                        <FileJson className="size-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold">{item.parsed.fileName}</p>
                        <span className="text-muted-foreground text-[10px]">
                          {formatFileSize(item.parsed.fileSize)}
                        </span>
                        <Badge variant={item.kind === 'unknown' ? 'destructive' : 'outline'}>
                          {kindLabels[item.kind]}
                        </Badge>
                        {item.parsed.blocked && <Badge variant="destructive">无法导入</Badge>}
                        {item.skip && <Badge variant="outline">已跳过</Badge>}
                      </div>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {item.parsed.summary} · 目标：{targetLabels[item.kind]}
                      </p>
                      {item.parsed.details && item.parsed.details.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {item.parsed.details.map((detail) => (
                            <span
                              key={detail}
                              className="bg-muted/60 text-muted-foreground rounded-full px-2 py-0.5 text-[10px]"
                            >
                              {detail}
                            </span>
                          ))}
                        </div>
                      )}
                      {item.parsed.reason && (
                        <p className="text-destructive mt-1 text-[11px]">{item.parsed.reason}</p>
                      )}
                      {item.message && (
                        <p
                          className={cn(
                            'mt-1 text-[11px]',
                            item.status === 'error' ? 'text-destructive' : 'text-success',
                          )}
                        >
                          {item.message}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <select
                      value={item.kind}
                      onChange={(event) =>
                        updateItem(item.id, {
                          kind: event.target.value as ImportKind | 'unknown',
                          status: 'idle',
                          message: '',
                        })
                      }
                      disabled={
                        importing ||
                        item.status === 'success' ||
                        item.parsed.blocked ||
                        item.parsed.autoKind === 'pack'
                      }
                      aria-label={`${item.parsed.fileName} 的导入类型`}
                      className="border-input bg-background focus-visible:ring-ring/20 h-8 rounded-lg border px-2 text-xs outline-none focus-visible:ring-2"
                    >
                      <option value="unknown">无法识别</option>
                      <option value="character">角色卡</option>
                      <option value="preset">预设</option>
                      <option value="worldbook">世界书</option>
                      <option value="regex">正则</option>
                      {item.parsed.autoKind === 'pack' && <option value="pack">配套包</option>}
                    </select>
                    <label className="text-muted-foreground flex cursor-pointer items-center gap-1.5 text-[11px]">
                      <Checkbox
                        checked={item.skip}
                        onChange={(event) => updateItem(item.id, { skip: event.target.checked })}
                        disabled={importing || item.status === 'success'}
                      />
                      跳过
                    </label>
                    <ItemStatus status={item.status} />
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {imported && (
        <div className="border-success/25 bg-success/[0.045] flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">导入流程结束</p>
            <p className="text-muted-foreground mt-1 text-xs">
              成功的文件已经写入本地；失败或跳过的文件没有产生任何角色或内容。
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/loadouts">去配套</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/import">进入导入区</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function ItemStatus({ status }: { status: ReviewStatus }) {
  if (status === 'importing') {
    return (
      <span className="text-muted-foreground flex items-center gap-1 text-[11px]">
        <Loader2 className="size-3 animate-spin" />
        导入中
      </span>
    )
  }
  if (status === 'success') {
    return (
      <span className="text-success flex items-center gap-1 text-[11px]">
        <CheckCircle2 className="size-3" />
        成功
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span className="text-destructive flex items-center gap-1 text-[11px]">
        <FileWarning className="size-3" />
        失败
      </span>
    )
  }
  return null
}
