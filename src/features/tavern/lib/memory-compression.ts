import type { ChatMessage } from '../types'
import { extractCompletionFinishReason, extractCompletionText } from './chat-completion'
import { stripChatLayoutMarkers } from './chat-layout'
import { stripChatArtifacts } from './safe-markdown-text'

export const MEMORY_COMPRESSION_CHUNK_CHARS = 12_000
/** 记忆是每轮都要带进上下文的，必须短：压缩后正文上限，超了按整行截断。 */
export const MEMORY_COMPRESSION_MAX_SUMMARY_CHARS = 2_400

/** 记忆请求走非流式接口：慢一点，但在手机网络和各类中转站上稳定得多。 */
export const MEMORY_WRITE_CHUNK_CHARS = 8_000
export const MEMORY_WRITE_TIMEOUT_MS = 180_000
export const MEMORY_WRITE_MAX_ATTEMPTS = 3

/** 记忆写入不是每轮都做：攒够新内容才请求一次 API。 */
export const MEMORY_REFRESH_MIN_MESSAGES = 10
export const MEMORY_REFRESH_MIN_CHARS = 8_000
export const MEMORY_REFRESH_FORCE_CHARS = 20_000

type CompletedMessageLike = Pick<ChatMessage, 'role' | 'content' | 'status'>

function usableMessages(messages: CompletedMessageLike[]) {
  return messages.filter(
    (message) =>
      message.role !== 'system' && message.status === 'complete' && message.content.trim().length > 0,
  )
}

export function countCompletedMessages(messages: CompletedMessageLike[]) {
  return usableMessages(messages).length
}

export type MemoryRefreshPlan = {
  needed: boolean
  coveredMessages: number
  pendingMessages: number
  pendingChars: number
}

/**
 * 判断这次回复后要不要调 API 重写长期记忆。
 * 默认：攒够 10 条且 8000 字，或者积攒超过 20000 字（接近上下文上限）才压缩一次；
 * 手动点“立即压缩 / 立即摘要”时绕过这个判断。
 */
export function planMemoryRefresh(
  messages: CompletedMessageLike[],
  cursor: number,
  options: { minMessages?: number; minChars?: number; forceChars?: number } = {},
): MemoryRefreshPlan {
  const available = usableMessages(messages)
  const start = Math.min(Math.max(0, Math.trunc(cursor) || 0), available.length)
  const pending = available.slice(start)
  const pendingChars = pending.reduce((sum, message) => sum + message.content.trim().length, 0)
  const minMessages = options.minMessages ?? MEMORY_REFRESH_MIN_MESSAGES
  const minChars = options.minChars ?? MEMORY_REFRESH_MIN_CHARS
  const forceChars = options.forceChars ?? MEMORY_REFRESH_FORCE_CHARS

  return {
    needed:
      pendingChars >= forceChars || (pending.length >= minMessages && pendingChars >= minChars),
    coveredMessages: available.length,
    pendingMessages: pending.length,
    pendingChars,
  }
}

const COMPRESSION_RULES = [
  '你是长期记忆压缩器。你输出的是「记忆条目」，不是剧情复述。',
  '只输出下面五节；某节没有内容就写「无」。每条一行，以「·」开头，不超过 30 字：',
  '【人物】姓名｜年龄或身份｜与对方关系的现状（一人一行，只写现在的状态）',
  '【事实】后续还会用到的客观事实：地点、物品、钱、时间点、身体特征、习惯',
  '【约定】未完成的约定、邀约、期限、欠下的人情',
  '【进展】关系或情节的关键变化（只写结果，不写过程）',
  '【线索】尚未解决、之后可能再被提起的伏笔',
  '硬性要求：',
  '1. 禁止复述对话，禁止动作、神态、景物描写，禁止“然后／接着／随后”式流水叙事。',
  '2. 每句主语写全名，不许用指代不清的“他／她”。',
  '3. 只写已经发生的事，不推测、不续写、不评价。',
  '4. 全文不超过 600 字；超了先删次要事实，不要把句子压成残句。',
  '5. 直接从【人物】开始写，不要标题、前言、总结，也不要用 Markdown。',
  '示例只示范格式，不要照抄内容：',
  '【人物】',
  '· 苏念｜20 岁｜新闻系大二，与江小白暧昧，欠他一次人情',
  '【事实】',
  '· 雨夜便利店，江小白替苏念付了两串关东煮',
  '【约定】',
  '· 次日早上七点半，别墅区 6 号门口见',
  '【线索】',
  '· 陆晚怀疑助理工作像另一种工作',
].join('\n')

const MERGE_RULES = [
  '你是长期记忆合并器。你输出的是「记忆条目」，不是剧情复述。',
  '把多段记忆合并成一份：同一人物合并成一行，数值取最新；约定与线索去重；删掉重复和过期内容。',
  '沿用五节结构：【人物】【事实】【约定】【进展】【线索】，每条一行以「·」开头，不超过 30 字。',
  '每句主语写全名；禁止复述剧情、禁止描写、禁止推测。',
  '全文不超过 800 字；只输出条目，不要前言、总结或 Markdown。',
].join('\n')

const SUMMARY_RULES = [
  '你是长期记忆摘要器，服务于中文角色扮演对话。',
  '请把提供的对话整理成一份可以长期沿用的摘要：人物身份与关系的变化、称呼、重要事件与因果、承诺与约定、未完成的矛盾、关键物品与地点。',
  '按时间顺序、用第三人称写成连贯短文；只写会改变后续走向的事，不要逐轮复述对话和动作，不要环境铺陈。',
  '不要续写剧情，不要编造对话里没有的信息，不要 Markdown 标题或列表前缀。',
  '只输出摘要正文，全文控制在 600 字以内。',
].join('\n')

export const DEFAULT_MEMORY_PROMPT =
  '优先保留：人物身份与关系、称呼、重要事件与因果、承诺与约定、未完成的任务或矛盾、关键物品与地点、时间线，以及用户明确要求记住的设定。'

function withExtraPrompt(rules: string, extraPrompt: string) {
  const extra = extraPrompt.trim()
  if (!extra) return rules
  return `${rules}\n\n用户指定的记忆要求（优先于上面的通用要求）：\n${extra}`
}

export type CompressionTurn = {
  role: 'user' | 'assistant'
  content: string
}

function fillSpeakerPlaceholders(value: string, characterName: string, userName: string) {
  return value
    .replace(/\{\{\s*user\s*\}\}/gi, () => userName)
    .replace(/\{\{\s*char(?:acter)?\s*\}\}/gi, () => characterName)
    .replace(/<\/?(?:user|human|player)>/gi, () => userName)
    .replace(/<\/?(?:char|character|bot|assistant)>/gi, () => characterName)
}

export function collectCompressionTurns(
  messages: ChatMessage[],
  characterName: string,
  userName: string,
) {
  const speaker = characterName.trim() || '角色'
  const userSpeaker = userName.trim() || '用户'
  return messages.flatMap<CompressionTurn>((message) => {
    if (message.role === 'system') return []
    if (message.status === 'error' || message.status === 'streaming') return []
    const content = stripChatLayoutMarkers(
      fillSpeakerPlaceholders(message.content, speaker, userSpeaker),
    )
    const finalContent = message.role === 'assistant' ? stripChatArtifacts(content) : content
    if (!finalContent.trim()) return []
    return [{ role: message.role, content: finalContent.trim() }]
  })
}

export function formatCompressionTurns(
  turns: CompressionTurn[],
  characterName: string,
  userName: string,
) {
  const speaker = characterName.trim() || '角色'
  const userSpeaker = userName.trim() || '用户'
  return turns.map((turn) => `${turn.role === 'user' ? userSpeaker : speaker}：${turn.content}`)
}

export function chunkCompressionTranscript(
  lines: string[],
  maxChars = MEMORY_COMPRESSION_CHUNK_CHARS,
) {
  const limit = Math.max(500, Math.floor(maxChars))
  const chunks: string[] = []
  let current = ''

  const flush = () => {
    const value = current.trim()
    if (value) chunks.push(value)
    current = ''
  }

  for (const line of lines) {
    if (line.length > limit) {
      flush()
      for (let start = 0; start < line.length; start += limit) {
        chunks.push(line.slice(start, start + limit))
      }
      continue
    }
    const next = current ? `${current}\n${line}` : line
    if (next.length > limit) {
      flush()
      current = line
    } else {
      current = next
    }
  }
  flush()
  return chunks
}

function readableMemory(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

/** 只把还没进记忆的那几条送进压缩请求；一条都不剩时才重发全部。 */
export function selectTurnsForMemoryWrite<T>(turns: T[], coveredCount: number) {
  const covered = Math.min(Math.max(0, Math.trunc(coveredCount) || 0), turns.length)
  const pending = turns.slice(covered)
  return pending.length > 0 ? pending : turns
}

export function buildCompressionSystemPrompt(extraPrompt = '') {
  return withExtraPrompt(COMPRESSION_RULES, extraPrompt)
}

export function buildSummarySystemPrompt(extraPrompt = '') {
  return withExtraPrompt(SUMMARY_RULES, extraPrompt)
}

/** 压缩 / 摘要请求统一入口：两种记忆方式都会带上用户填写的记忆提示词。 */
export function buildMemoryWriteSystemPrompt(
  kind: 'compressed' | 'summary',
  extraPrompt = '',
) {
  return kind === 'summary'
    ? buildSummarySystemPrompt(extraPrompt)
    : buildCompressionSystemPrompt(extraPrompt)
}

export function buildCompressionChunkPrompt({
  chunk,
  index,
  total,
  previousMemory = '',
}: {
  chunk: string
  index: number
  total: number
  previousMemory?: string
}) {
  const previous = readableMemory(previousMemory)
  const parts = [`请压缩完整对话的第 ${index}/${total} 段。`]
  if (previous) {
    parts.push(
      `此前保存的长期记忆如下，请在压缩本段时一并保留仍然有效的设定：\n【此前长期记忆】\n${previous}\n【此前长期记忆结束】`,
    )
  }
  parts.push(`【对话开始】\n${chunk}\n【对话结束】`)
  return parts.join('\n\n')
}

export function buildCompressionMergePrompt(partials: string[]) {
  const body = partials
    .map((partial, index) => `【第 ${index + 1} 部分】\n${readableMemory(partial)}`)
    .join('\n\n')
  return `请合并以下分段记忆：\n\n${body}`
}

/** 一次压缩 / 摘要请求真正发出去的两条消息。 */
export function buildMemoryWriteMessages({
  kind,
  customPrompt,
  chunk,
  index,
  total,
  previousMemory,
}: {
  kind: 'compressed' | 'summary'
  customPrompt: string
  chunk: string
  index: number
  total: number
  previousMemory?: string
}) {
  return {
    system: buildMemoryWriteSystemPrompt(kind, customPrompt),
    user: buildCompressionChunkPrompt({ chunk, index, total, previousMemory }),
  } as const
}

export function buildCompressionMergeSystemPrompt(extraPrompt = '') {
  return withExtraPrompt(MERGE_RULES, extraPrompt)
}

export function normalizeCompressedMemory(value: string) {
  const cleaned = value
    .replace(/^```(?:\w+)?\s*/gm, '')
    .replace(/```$/gm, '')
    .trim()
  if (cleaned.length <= MEMORY_COMPRESSION_MAX_SUMMARY_CHARS) return cleaned

  const cut = cleaned.slice(0, MEMORY_COMPRESSION_MAX_SUMMARY_CHARS)
  const boundary = Math.max(cut.lastIndexOf('\n'), cut.lastIndexOf('。'), cut.lastIndexOf('；'))
  return (boundary > MEMORY_COMPRESSION_MAX_SUMMARY_CHARS * 0.6 ? cut.slice(0, boundary + 1) : cut)
    .trim()
}

function reasoningChars(payload: unknown) {
  if (!payload || typeof payload !== 'object' || !('choices' in payload)) return 0
  const choices = (payload as { choices?: unknown }).choices
  if (!Array.isArray(choices) || choices.length === 0) return 0
  const first = choices[0]
  if (!first || typeof first !== 'object') return 0
  const message = (first as { message?: unknown }).message
  if (!message || typeof message !== 'object') return 0
  const reasoning = (message as { reasoning_content?: unknown }).reasoning_content
  return typeof reasoning === 'string' ? reasoning.length : 0
}

/**
 * 解析一次非流式的记忆请求。空正文在手机端很常见：
 * 推理模型把 max_tokens 用在了思考上、或中转站只回 reasoning_content。
 * 这里把原因说清楚，交给上层决定是否加大额度重试。
 */
export function readMemoryCompletion(payload: unknown) {
  const content = extractCompletionText(payload).trim()
  const finishReason = extractCompletionFinishReason(payload)
  const thinking = reasoningChars(payload)
  const truncated = finishReason === 'length' || finishReason === 'max_tokens'

  // 半截的记忆比没有更糟：截断直接判失败，让上层加大输出额度重试。
  if (truncated) {
    throw new Error('记忆正文被截断（输出额度不足）。')
  }

  if (!content) {
    if (thinking > 0 && finishReason === 'length') {
      throw new Error('模型把输出额度用在了思考上，没写出记忆正文。')
    }
    if (thinking > 0) {
      throw new Error('模型只返回了思考过程，没有返回记忆正文。')
    }
    throw new Error('接口返回成功，但没有生成记忆正文。')
  }

  return { content, finishReason, reasoningChars: thinking }
}

/** 网络抖动、超时、5xx、空正文都值得重试；鉴权/参数错误重试也没用。 */
export function isRetryableMemoryWriteError(error: unknown) {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase()
  if (/401|403|unauthorized|forbidden|invalid api key|api key/.test(message)) return false
  if (/404|model_not_found|does not exist|no such model/.test(message)) return false
  if (/400|invalid_request|invalid parameter|unsupported/.test(message)) return false
  return true
}

/** 输出得像“记忆条目”（有分节或至少三条 ·），而不是把故事又讲一遍。 */
export function isValidMemoryEntryFormat(text: string) {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const bulletLines = lines.filter((line) => line.startsWith('·') || line.startsWith('- ')).length
  const hasSection = lines.some((line) => /^【(人物|事实|约定|进展|线索)】/.test(line))
  return hasSection || bulletLines >= 3
}
