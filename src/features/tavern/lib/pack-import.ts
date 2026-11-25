import { unzipSync, type UnzipFileInfo } from 'fflate'

import type { ImportKind, MemoryMode, RegexRuleInput } from '../types'
import {
  buildImportPayload,
  parseImportFile,
  type ImportPayload,
  type ParsedImport,
} from './import-parser'

export type PackAssetKind = Exclude<ImportKind, 'pack'>

export type PackAsset = {
  kind: PackAssetKind
  path: string
  fileName: string
  name: string
  summary: string
  payload: ImportPayload
}

export type ParsedTavernPack = {
  name: string
  description: string
  memoryMode?: MemoryMode
  character: (PackAsset & { kind: 'character' }) | null
  preset: PackAsset | null
  worldbooks: PackAsset[]
  regexRules: RegexRuleInput[]
  assets: PackAsset[]
  details: string[]
  warnings: string[]
  errors: string[]
}

export type PackImportPayload = {
  name: string
  description: string
  character: ImportPayload
  preset: ImportPayload | null
  worldbooks: ImportPayload[]
  regexRules: RegexRuleInput[]
  memoryMode?: MemoryMode
}

type ZipEntry = {
  path: string
  bytes: Uint8Array
}

type PackManifest = {
  path: string
  name?: string
  description?: string
  memoryMode?: MemoryMode
  warnings: string[]
}

const MAX_ZIP_BYTES = 24 * 1024 * 1024
const MAX_ENTRY_BYTES = 8 * 1024 * 1024
const MAX_TOTAL_BYTES = 40 * 1024 * 1024
const MAX_ENTRIES = 160
const MANIFEST_NAMES = new Set(['manifest.json', 'pack.json'])
const MEMORY_MODES = new Set<MemoryMode>(['off', 'recent', 'summary', 'compressed', 'vector'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeText(value: string) {
  return value.trim()
}

function baseName(path: string) {
  return path.split(/[\\/]/).pop() ?? path
}

function fileKind(path: string): 'json' | 'png' | null {
  if (/\.json$/i.test(path)) return 'json'
  if (/\.png$/i.test(path)) return 'png'
  return null
}

function shouldIgnorePath(path: string) {
  const parts = path.split('/')
  return parts.some((part) => part === '__MACOSX' || part.startsWith('.'))
}

export function isZipFile(file: File) {
  return (
    /\.zip$/i.test(file.name) ||
    file.type === 'application/zip' ||
    file.type === 'application/x-zip-compressed'
  )
}

async function readZipEntries(file: File): Promise<ZipEntry[]> {
  if (file.size > MAX_ZIP_BYTES) {
    throw new Error('配套包超过 24 MB，请精简图片或拆分后再导入。')
  }

  let totalBytes = 0
  let count = 0
  let rejection = ''
  const bytes = new Uint8Array(await file.arrayBuffer())

  let unzipped: ReturnType<typeof unzipSync>
  try {
    unzipped = unzipSync(bytes, {
      filter: (entry: UnzipFileInfo) => {
        if (!entry.name || entry.name.endsWith('/') || shouldIgnorePath(entry.name)) return false
        if (!fileKind(entry.name)) return false

        count += 1
        if (count > MAX_ENTRIES) {
          rejection = `配套包内文件超过 ${MAX_ENTRIES} 个，已拒绝导入。`
          return false
        }
        if (entry.originalSize > MAX_ENTRY_BYTES) {
          rejection = `文件 ${entry.name} 解压后超过 8 MB，已拒绝导入。`
          return false
        }

        totalBytes += entry.originalSize
        if (totalBytes > MAX_TOTAL_BYTES) {
          rejection = '配套包解压后超过 40 MB，已拒绝导入。'
          return false
        }
        return true
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '压缩包结构无效'
    throw new Error(`无法解压配套包：${message}`, { cause: error })
  }

  if (rejection) throw new Error(rejection)

  const entries = Object.entries(unzipped)
    .map(([path, entry]) => ({ path, bytes: entry }))
    .sort((left, right) => left.path.localeCompare(right.path, 'zh-CN'))

  if (entries.length === 0) {
    throw new Error('压缩包里没有可识别的 JSON 或 PNG 文件。')
  }
  return entries
}

function readManifest(entries: ZipEntry[]): PackManifest | null {
  const manifests = entries.filter((entry) =>
    MANIFEST_NAMES.has(baseName(entry.path).toLowerCase()),
  )
  if (manifests.length === 0) return null

  const entry = manifests[0]
  const warnings =
    manifests.length > 1 ? [`检测到 ${manifests.length} 个清单文件，只读取 ${entry.path}。`] : []

  try {
    const raw = JSON.parse(new TextDecoder('utf-8').decode(entry.bytes)) as unknown
    if (!isRecord(raw)) {
      return { path: entry.path, warnings: [...warnings, '配套清单不是对象结构，已忽略。'] }
    }
    const memoryMode =
      typeof raw.memoryMode === 'string' && MEMORY_MODES.has(raw.memoryMode as MemoryMode)
        ? (raw.memoryMode as MemoryMode)
        : undefined
    if (raw.memoryMode !== undefined && !memoryMode) {
      warnings.push(`清单里的记忆方式「${String(raw.memoryMode)}」无效，已使用默认值。`)
    }

    return {
      path: entry.path,
      name:
        typeof raw.loadoutName === 'string'
          ? raw.loadoutName
          : typeof raw.name === 'string'
            ? raw.name
            : undefined,
      description: typeof raw.description === 'string' ? raw.description : undefined,
      memoryMode,
      warnings,
    }
  } catch {
    return { path: entry.path, warnings: [...warnings, '配套清单不是有效 JSON，已忽略。'] }
  }
}

function isPackAssetOf<K extends PackAssetKind>(kind: K) {
  return (asset: PackAsset): asset is PackAsset & { kind: K } => asset.kind === kind
}

function hasAttachedWorldBook(payload: ImportPayload) {
  const book = payload.attachedWorldBook
  return isRecord(book) && Array.isArray(book.entries) && book.entries.length > 0
}

function attachedWorldBookName(payload: ImportPayload) {
  if (!hasAttachedWorldBook(payload)) return null
  const book = payload.attachedWorldBook
  if (!isRecord(book)) return '角色书'
  return typeof book.name === 'string' && book.name.trim() ? book.name.trim() : '角色书'
}

function regexRulesFromPayload(payload: ImportPayload) {
  return Array.isArray(payload.rules) ? (payload.rules as RegexRuleInput[]) : []
}

export async function parsePackFile(file: File): Promise<ParsedTavernPack> {
  const entries = await readZipEntries(file)
  const manifest = readManifest(entries)
  const warnings = manifest?.warnings ?? []
  const errors: string[] = []
  const assets: PackAsset[] = []

  for (const entry of entries) {
    if (manifest?.path === entry.path) continue
    const fileName = baseName(entry.path)
    const kind = fileKind(fileName)
    if (!kind) continue

    const fileBytes = new Uint8Array(entry.bytes)
    const parsed = await parseImportFile(
      new File([fileBytes], fileName, {
        type: kind === 'png' ? 'image/png' : 'application/json',
      }),
    )

    if (parsed.autoKind === 'unknown') {
      if (kind === 'json') warnings.push(`跳过无法识别的文件：${entry.path}`)
      continue
    }
    if (parsed.autoKind === 'pack') {
      errors.push(`${entry.path} 不能作为配套包内文件。`)
      continue
    }

    try {
      assets.push({
        kind: parsed.autoKind,
        path: entry.path,
        fileName,
        name: parsed.name,
        summary: parsed.summary,
        payload: buildImportPayload(parsed.autoKind, parsed.raw, fileName),
      })
    } catch (error) {
      errors.push(`${entry.path}：${error instanceof Error ? error.message : '文件结构无法识别。'}`)
    }
  }

  const characters = assets.filter(isPackAssetOf('character'))
  const presets = assets.filter(isPackAssetOf('preset'))
  const worldbooks = assets.filter(isPackAssetOf('worldbook'))
  const regexAssets = assets.filter(isPackAssetOf('regex'))

  if (characters.length === 0) errors.push('配套包里没有角色卡。')
  if (characters.length > 1) {
    errors.push(`配套包只能包含一张角色卡，当前找到 ${characters.length} 张。`)
  }
  if (presets.length === 0) warnings.push('没有找到预设，将使用默认生成参数。')
  if (presets.length > 1) {
    warnings.push(`找到 ${presets.length} 个预设，将绑定排序后的第一个。`)
  }

  const character = characters[0] ?? null
  const attachedBookName = character ? attachedWorldBookName(character.payload) : null
  const worldBookNames = [
    ...(attachedBookName ? [attachedBookName] : []),
    ...worldbooks.map((book) => book.name),
  ]
  if (character && worldBookNames.length === 0) {
    warnings.push('没有找到世界书，角色卡也没有内嵌角色书。')
  }

  const regexRules = regexAssets.flatMap((asset) => regexRulesFromPayload(asset.payload))
  if (regexRules.length === 0) warnings.push('没有找到正则规则，将只使用内置气泡规则。')

  const zipBase = baseName(file.name)
    .replace(/\.zip$/i, '')
    .trim()
  const inferredName = character ? `${character.name} · 配套` : '未命名配套'
  const name =
    normalizeText(manifest?.name ?? '') ||
    (zipBase && zipBase.toLowerCase() !== 'pack' ? zipBase : inferredName)
  const description = normalizeText(manifest?.description ?? '') || `从 ${file.name} 导入的配套包。`
  const preset = presets[0] ?? null
  const details = [
    character ? `角色卡：${character.name}` : '角色卡：缺失',
    preset ? `预设：${preset.name}` : '预设：未找到，使用默认参数',
    worldBookNames.length > 0 ? `世界书：${worldBookNames.join('、')}` : '世界书：未找到',
    `正则：${regexRules.length} 条`,
  ]

  return {
    name,
    description,
    memoryMode: manifest?.memoryMode,
    character,
    preset,
    worldbooks,
    regexRules,
    assets,
    details,
    warnings,
    errors,
  }
}

export function buildPackImportPayload(parsed: ParsedTavernPack): PackImportPayload {
  if (parsed.errors.length > 0) throw new Error(parsed.errors.join('；'))
  if (!parsed.character) throw new Error('配套包里没有角色卡。')

  return {
    name: parsed.name,
    description: parsed.description,
    character: parsed.character.payload,
    preset: parsed.preset?.payload ?? null,
    worldbooks: parsed.worldbooks.map((book) => book.payload),
    regexRules: parsed.regexRules,
    memoryMode: parsed.memoryMode,
  }
}

function packSummary(pack: ParsedTavernPack) {
  if (pack.errors.length > 0) return '配套 · 无法导入'
  const attachedBook = pack.character ? attachedWorldBookName(pack.character.payload) : null
  const parts = [
    `角色 ${pack.character ? 1 : 0}`,
    `预设 ${pack.preset ? 1 : 0}`,
    `世界书 ${pack.worldbooks.length + (attachedBook ? 1 : 0)}`,
    `正则 ${pack.regexRules.length}`,
  ]
  return `配套 · ${parts.join(' · ')}`
}

export async function parseAnyImportFile(file: File): Promise<ParsedImport> {
  if (!isZipFile(file)) return parseImportFile(file)

  try {
    const pack = await parsePackFile(file)
    return {
      fileName: file.name,
      fileSize: file.size,
      autoKind: 'pack',
      name: pack.name,
      summary: packSummary(pack),
      reason: pack.errors.length > 0 ? pack.errors.join('；') : undefined,
      details: [...pack.details, ...pack.warnings.map((warning) => `注意：${warning}`)],
      blocked: pack.errors.length > 0,
      raw: pack,
    }
  } catch (error) {
    return {
      fileName: file.name,
      fileSize: file.size,
      autoKind: 'unknown',
      name: baseName(file.name).replace(/\.zip$/i, ''),
      summary: '配套包读取失败',
      reason: error instanceof Error ? error.message : '未知错误',
      raw: null,
    }
  }
}
