import type { CharacterInput, ImportKind, WorldBookInput } from '../types'

import { stripChatArtifacts } from './safe-markdown-text'

export type ParsedImport = {
  fileName: string
  fileSize: number
  autoKind: ImportKind | 'unknown'
  name: string
  summary: string
  reason?: string
  details?: string[]
  blocked?: boolean
  raw: unknown
}

export type ImportPayload = Record<string, unknown>

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback
}

function clip(value: string, max = 120) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized
}

function hashTone(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 997
  }
  return hash % 5
}

function parseJsonText(text: string): unknown {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('文件内容为空。')
  return JSON.parse(trimmed) as unknown
}

function decodeBase64Utf8(value: string) {
  const binary = atob(value.replace(/\s+/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new TextDecoder().decode(bytes)
}

function readPngPackedCard(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  if (bytes.length < 8 || signature.some((byte, index) => bytes[index] !== byte)) {
    throw new Error('不是有效的 PNG 文件。')
  }

  const view = new DataView(buffer)
  let offset = 8
  let chara: string | null = null
  let ccv3: string | null = null
  const decoder = new TextDecoder('utf-8')

  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset)
    const type = decoder.decode(bytes.subarray(offset + 4, offset + 8))
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    if (dataEnd + 4 > bytes.length) break

    if (type === 'tEXt') {
      const data = bytes.subarray(dataStart, dataEnd)
      const separator = data.indexOf(0)
      if (separator > 0) {
        const keyword = decoder.decode(data.subarray(0, separator))
        const value = decoder.decode(data.subarray(separator + 1))
        if (keyword === 'chara') chara = value
        if (keyword === 'ccv3') ccv3 = value
      }
    }

    if (type === 'iTXt') {
      const data = bytes.subarray(dataStart, dataEnd)
      const keywordEnd = data.indexOf(0)
      if (keywordEnd > 0) {
        const keyword = decoder.decode(data.subarray(0, keywordEnd))
        if (keyword === 'chara' || keyword === 'ccv3') {
          const compressionFlag = data[keywordEnd + 1] ?? 0
          let cursor = keywordEnd + 3
          const languageEnd = data.indexOf(0, cursor)
          cursor = languageEnd + 1
          const translatedEnd = data.indexOf(0, cursor)
          cursor = translatedEnd + 1
          if (compressionFlag === 0) {
            const text = decoder.decode(data.subarray(cursor))
            if (keyword === 'ccv3') ccv3 = text
            else chara = text
          }
        }
      }
    }

    if (type === 'IEND') break
    offset = dataEnd + 4
  }

  const packed = ccv3 ?? chara
  if (!packed) throw new Error('PNG 中没有找到 chara 或 ccv3 角色卡数据。')
  return parseJsonText(decodeBase64Utf8(packed))
}

function unwrapCharacterCard(raw: unknown): JsonRecord {
  if (!isRecord(raw)) throw new Error('角色卡不是对象结构。')
  return isRecord(raw.data) ? raw.data : raw
}

function normalizeTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean)
      .slice(0, 8)
  }
  if (typeof value === 'string') {
    return value
      .split(/[,，、]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 8)
  }
  return []
}

function normalizeBookEntries(value: unknown) {
  const entriesSource = isRecord(value) ? value.entries : value
  const entries = Array.isArray(entriesSource)
    ? entriesSource
    : isRecord(entriesSource)
      ? Object.values(entriesSource)
      : []

  type NormalizedEntry = {
    keys: string[]
    content: string
    constant: boolean
    order: number
    enabled: boolean
  }

  return entries
    .map((entry, index) => {
      if (!isRecord(entry)) return null
      const keysSource = entry.keys ?? entry.key ?? entry.keys_list
      const keys = Array.isArray(keysSource)
        ? keysSource.map((key) => String(key).trim()).filter(Boolean)
        : typeof keysSource === 'string'
          ? keysSource
              .split(/[,，、]/)
              .map((key) => key.trim())
              .filter(Boolean)
          : []
      const content = asString(entry.content ?? entry.entry ?? entry.text)
      if (!content.trim()) return null
      return {
        keys,
        content,
        constant: asBoolean(entry.constant),
        order: Math.max(0, Math.min(999, Math.trunc(asNumber(entry.order, index)))),
        enabled: !asBoolean(entry.disable, false),
      }
    })
    .filter((entry): entry is NormalizedEntry => Boolean(entry))
}

function normalizeCharacter(raw: unknown, fileName: string): ImportPayload {
  const card = unwrapCharacterCard(raw)
  const name = asString(card.name) || fileName.replace(/\.[^.]+$/, '')
  const description = asString(card.description)
  const avatar = asString(card.avatar)
  const character: CharacterInput & { source: 'import' } = {
    name,
    tagline: clip(asString(card.tagline ?? card.creator_notes ?? description), 60),
    description,
    personality: asString(card.personality),
    scenario: asString(card.scenario),
    firstMessage: stripChatArtifacts(asString(card.first_mes ?? card.firstMessage)),
    exampleDialogue: stripChatArtifacts(asString(card.mes_example ?? card.example_dialogue)),
    tags: normalizeTags(card.tags),
    avatarTone: hashTone(name + avatar),
    source: 'import',
  }

  const bookSource = isRecord(card.character_book) ? card.character_book : null
  const bookEntries = normalizeBookEntries(card.character_book)
  const attachedWorldBook: WorldBookInput | undefined =
    bookEntries.length > 0
      ? {
          name: asString(bookSource?.name) || name,
          description: clip(asString(bookSource?.description), 160),
          entries: bookEntries,
        }
      : undefined

  return { ...character, attachedWorldBook }
}

function normalizePreset(raw: unknown, fileName: string): ImportPayload {
  const source = isRecord(raw) && isRecord(raw.data) ? raw.data : raw
  if (!isRecord(source)) throw new Error('预设不是对象结构。')
  const settings = isRecord(source.settings) ? source.settings : source

  return {
    name:
      asString(source.name ?? source.preset_name, fileName.replace(/\.[^.]+$/, '')) || '导入的预设',
    description: clip(asString(source.description ?? source.creator_notes), 160),
    generation: {
      temperature: Math.min(2, Math.max(0, asNumber(settings.temperature ?? settings.temp, 0.86))),
      topP: Math.min(1, Math.max(0, asNumber(settings.top_p ?? settings.topP, 0.92))),
      maxTokens: Math.min(
        8192,
        Math.max(
          64,
          Math.trunc(
            asNumber(settings.openai_max_tokens ?? settings.max_tokens ?? settings.max_length, 900),
          ),
        ),
      ),
      presencePenalty: Math.min(
        2,
        Math.max(-2, asNumber(settings.presence_penalty ?? settings.presencePenalty, 0.24)),
      ),
      frequencyPenalty: Math.min(
        2,
        Math.max(-2, asNumber(settings.frequency_penalty ?? settings.frequencyPenalty, 0.2)),
      ),
    },
    promptSummary: presetPromptText(source),
  }
}

function promptOrderEntries(value: unknown): { identifier: string; enabled: boolean }[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => promptOrderEntries(item))
  }
  if (!isRecord(value)) return []
  if (Array.isArray(value.order)) return promptOrderEntries(value.order)
  const identifier = asString(value.identifier)
  if (!identifier) return []
  return [{ identifier, enabled: value.enabled !== false }]
}

function presetPromptText(source: Record<string, unknown>) {
  const prompts = Array.isArray(source.prompts)
    ? source.prompts
        .filter(isRecord)
        .map((prompt) => ({
          identifier: asString(prompt.identifier),
          name: asString(prompt.name),
          content: asString(prompt.content),
          enabled: prompt.enabled !== false,
        }))
        .filter((prompt) => prompt.identifier && prompt.content.trim())
    : []
  const promptMap = new Map(prompts.map((prompt) => [prompt.identifier, prompt]))
  const orderedIdentifiers = new Set<string>()
  const ordered = promptOrderEntries(source.prompt_order)
    .filter((entry) => {
      if (orderedIdentifiers.has(entry.identifier)) return false
      orderedIdentifiers.add(entry.identifier)
      return entry.enabled
    })
    .map((entry) => promptMap.get(entry.identifier))
    .filter((prompt): prompt is NonNullable<typeof prompt> => Boolean(prompt))
  const remaining = prompts.filter(
    (prompt) => prompt.enabled && !orderedIdentifiers.has(prompt.identifier),
  )
  const explicit = asString(source.promptSummary ?? source.prompt_summary).trim()

  return [explicit, ...ordered.concat(remaining).map((prompt) => {
    const title = prompt.name || prompt.identifier
    return `【${title}】\n${prompt.content.trim()}`
  })]
    .filter(Boolean)
    .join('\n\n')
}

function normalizeWorldBook(raw: unknown, fileName: string): ImportPayload {
  const source = isRecord(raw) && !Array.isArray(raw) ? raw : { entries: raw }
  const entries = normalizeBookEntries(source)
  if (entries.length === 0) throw new Error('世界书中没有可用的 entries。')
  const name = isRecord(raw)
    ? asString(raw.name ?? (isRecord(raw.originalData) ? raw.originalData.name : '')) ||
      fileName.replace(/\.[^.]+$/, '')
    : fileName.replace(/\.[^.]+$/, '')

  return {
    name: name || fileName.replace(/\.[^.]+$/, ''),
    description: clip(asString(isRecord(raw) ? (raw.description ?? raw.notes) : ''), 160),
    entries,
  }
}

function mergeRegexFlags(...groups: (string | undefined)[]) {
  return Array.from(new Set(groups.join('').split(''))).join('')
}

function normalizeRegexPattern(source: string, explicitFlags: string) {
  const value = source.trim()
  if (!value.startsWith('/')) {
    const flags = mergeRegexFlags(explicitFlags || 'g')
    try {
      new RegExp(value, flags)
    } catch {
      throw new Error(`正则表达式或 flags 无效：/${value}/${flags}`)
    }
    return { pattern: value, flags }
  }

  const end = value.lastIndexOf('/')
  if (end <= 0) throw new Error('正则表达式缺少结束斜杠。')
  const pattern = value.slice(1, end)
  const flags = mergeRegexFlags(explicitFlags, value.slice(end + 1)) || 'g'
  try {
    new RegExp(pattern, flags)
  } catch {
    throw new Error(`正则表达式或 flags 无效：/${pattern}/${flags}`)
  }
  return { pattern, flags }
}

function regexScopeFromPlacement(value: unknown): 'input' | 'output' | 'both' {
  const placements = Array.isArray(value)
    ? value.filter((item): item is number => typeof item === 'number')
    : []
  if (placements.length === 0) return 'output'
  const hasInput = placements.includes(1)
  const hasOutput = placements.includes(2)
  if (hasInput && hasOutput) return 'both'
  return hasInput ? 'input' : 'output'
}

function isWholeMessageBlank(pattern: string, replacement: string) {
  if (replacement.trim()) return false
  const normalized = pattern.replace(/\s+/g, '')
  return ['^.*$', '.*', '^[\\s\\S]*$', '[\\s\\S]*', '^[\\s\\S]*?$', '[\\s\\S]*?'].includes(
    normalized,
  )
}

function hasDepthScope(entry: Record<string, unknown>) {
  return typeof entry.minDepth === 'number' || typeof entry.maxDepth === 'number'
}

function normalizeRegexRaw(raw: unknown, fileName: string): ImportPayload {
  const list = Array.isArray(raw)
    ? raw
    : isRecord(raw) && Array.isArray(raw.rules)
      ? raw.rules
      : [raw]
  type NormalizedRule = {
    name: string
    pattern: string
    replacement: string
    flags: string
    scope: 'input' | 'output' | 'both'
    enabled: boolean
  }

  const rules = list
    .map((entry) => {
      if (!isRecord(entry)) return null
      const source = asString(entry.findRegex ?? entry.pattern ?? entry.find_regex)
      if (!source) return null
      const normalized = normalizeRegexPattern(source, asString(entry.flags))
      const replacement = asString(entry.replaceString ?? entry.replacement ?? entry.replace)
      return {
        name: asString(entry.scriptName ?? entry.name) || fileName.replace(/\.[^.]+$/, ''),
        pattern: normalized.pattern,
        replacement,
        flags: normalized.flags,
        scope: regexScopeFromPlacement(entry.placement),
        // SillyTavern's depth-scoped and whole-message blanking scripts need its
        // message pipeline; keeping them enabled here would corrupt chat text.
        enabled:
          !asBoolean(entry.disabled ?? entry.disabledFlag, false) &&
          !hasDepthScope(entry) &&
          !isWholeMessageBlank(normalized.pattern, replacement),
      }
    })
    .filter((rule): rule is NormalizedRule => Boolean(rule))

  if (rules.length === 0) throw new Error('没有找到 findRegex / pattern 结构。')

  return {
    name: asString(isRecord(raw) ? raw.name : '') || fileName.replace(/\.[^.]+$/, ''),
    rules,
  }
}

function detectJsonKind(raw: unknown): ImportKind | 'unknown' {
  if (Array.isArray(raw)) {
    if (raw.every((item) => isRecord(item) && (item.keys || item.key))) return 'worldbook'
    if (
      raw.every((item) => isRecord(item) && (item.findRegex || item.pattern || item.find_regex))
    ) {
      return 'regex'
    }
    return 'unknown'
  }

  if (!isRecord(raw)) return 'unknown'

  const data = isRecord(raw.data) ? raw.data : raw
  if (
    isRecord(raw.data) &&
    (typeof data.name === 'string' || typeof data.first_mes === 'string') &&
    (raw.spec || raw.spec_version || data.description || data.personality)
  ) {
    return 'character'
  }
  if (
    typeof data.name === 'string' &&
    (typeof data.first_mes === 'string' || data.character_book)
  ) {
    return 'character'
  }
  if (isRecord(raw.entries) || Array.isArray(raw.entries)) return 'worldbook'
  if (raw.findRegex || raw.pattern || raw.find_regex) return 'regex'
  if (Array.isArray(raw.rules)) return 'regex'

  const settings = isRecord(raw.settings) ? raw.settings : raw
  const hasGeneration =
    'temperature' in settings ||
    'temp' in settings ||
    'top_p' in settings ||
    'max_tokens' in settings ||
    'openai_max_tokens' in settings
  const hasPromptShape =
    Array.isArray(raw.prompts) || Array.isArray(raw.prompt_order) || isRecord(raw.prompt_order)
  if (hasGeneration || hasPromptShape) return 'preset'

  return 'unknown'
}

function summaryFor(kind: ImportKind | 'unknown', raw: unknown, name: string) {
  if (kind === 'character') return `角色 · ${name}`
  if (kind === 'preset') {
    const source = isRecord(raw) && isRecord(raw.data) ? raw.data : raw
    const prompts = isRecord(source) && Array.isArray(source.prompts) ? source.prompts.length : 0
    return prompts > 0 ? `预设 · ${prompts} 个提示块` : '预设 · 生成参数'
  }
  if (kind === 'worldbook') {
    const source = isRecord(raw) ? raw : {}
    const entries = isRecord(source.entries)
      ? Object.keys(source.entries).length
      : Array.isArray(source.entries)
        ? source.entries.length
        : 0
    return `世界书 · ${entries || '若干'} 条设定`
  }
  if (kind === 'regex') return '正则 · 文本处理规则'
  return '无法识别'
}

export function buildImportPayload(
  kind: ImportKind,
  raw: unknown,
  fileName: string,
): ImportPayload {
  if (kind === 'pack') throw new Error('配套包需要通过 ZIP 文件导入。')
  if (kind === 'character') return normalizeCharacter(raw, fileName)
  if (kind === 'preset') return normalizePreset(raw, fileName)
  if (kind === 'worldbook') return normalizeWorldBook(raw, fileName)
  return normalizeRegexRaw(raw, fileName)
}

function detectedName(kind: ImportKind | 'unknown', raw: unknown, fileName: string) {
  if (kind === 'unknown') return fileName.replace(/\.[^.]+$/, '')
  try {
    const payload = buildImportPayload(kind, raw, fileName)
    return String(payload.name ?? fileName)
  } catch {
    return fileName.replace(/\.[^.]+$/, '')
  }
}

async function readFileAsArrayBuffer(file: File) {
  if (typeof file.arrayBuffer === 'function') {
    return file.arrayBuffer()
  }
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result)
      else reject(new Error('无法读取文件内容。'))
    }
    reader.onerror = () => reject(new Error('读取文件失败。'))
    reader.readAsArrayBuffer(file)
  })
}

export async function parseImportFile(file: File): Promise<ParsedImport> {
  const arrayBuffer = await readFileAsArrayBuffer(file)
  const isPng = file.name.toLowerCase().endsWith('.png') || file.type === 'image/png'

  try {
    const raw = isPng
      ? readPngPackedCard(arrayBuffer)
      : parseJsonText(new TextDecoder('utf-8').decode(arrayBuffer))
    const kind = isPng ? 'character' : detectJsonKind(raw)
    const name = detectedName(kind, raw, file.name)
    return {
      fileName: file.name,
      fileSize: file.size,
      autoKind: kind,
      name,
      summary: summaryFor(kind, raw, name),
      reason: kind === 'unknown' ? '未找到角色卡、预设、世界书或正则结构。' : undefined,
      raw,
    }
  } catch (error) {
    return {
      fileName: file.name,
      fileSize: file.size,
      autoKind: 'unknown',
      name: file.name.replace(/\.[^.]+$/, ''),
      summary: '读取失败',
      reason: error instanceof Error ? error.message : '未知错误',
      raw: null,
    }
  }
}
