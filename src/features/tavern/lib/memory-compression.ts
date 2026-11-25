import type { ChatMessage } from '../types'
import { stripChatLayoutMarkers } from './chat-layout'
import { stripChatArtifacts } from './safe-markdown-text'

export const MEMORY_COMPRESSION_CHUNK_CHARS = 12_000
export const MEMORY_COMPRESSION_MAX_SUMMARY_CHARS = 8_000

const COMPRESSION_RULES = [
  '你是长期记忆压缩器，服务于中文角色扮演对话。',
  '请把提供的全部对话压缩成一份可长期复用的记忆，供后续续写参考。',
  '要求：',
  '1. 只保留对后续剧情有用的事实：人物身份与关系、称呼、重要事件及因果、承诺与约定、未完成的任务或矛盾、关键物品/地点/时间线、用户明确要求记住的设定。',
  '2. 省略重复描写、寒暄、纯环境铺陈，以及可以从上下文推断的细节。',
  '3. 不要续写剧情，不要编造对话中不存在的信息。',
  '4. 用第三人称、按时间顺序写成连贯短文；不要使用 Markdown 标题、代码块或列表前缀。',
  '5. 只输出记忆正文，全文控制在 900 字以内。',
].join('\n')

const MERGE_RULES = [
  '你是长期记忆压缩器。',
  '下面是一段长对话的分段记忆，请把它们合并成一份统一、按时间顺序、没有重复的长期记忆。',
  '保留人物关系、重要事件、承诺、未完成事项和关键设定；删掉重复和无关细节。',
  '不要续写剧情，不要编造内容；只输出记忆正文，全文控制在 1200 字以内。',
].join('\n')

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

export function buildCompressionSystemPrompt(extraPrompt = '') {
  const extra = extraPrompt.trim()
  return extra ? `${COMPRESSION_RULES}\n补充要求（优先遵守）：${extra}` : COMPRESSION_RULES
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

export function buildCompressionMergeSystemPrompt() {
  return MERGE_RULES
}

export function normalizeCompressedMemory(value: string) {
  const cleaned = value
    .replace(/^```(?:\w+)?\s*/gm, '')
    .replace(/```$/gm, '')
    .trim()
  return cleaned.slice(0, MEMORY_COMPRESSION_MAX_SUMMARY_CHARS)
}
