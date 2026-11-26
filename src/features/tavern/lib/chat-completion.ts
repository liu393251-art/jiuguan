import type {
  ChatGenerationContext,
  ChatMessage,
  GenerationSettings,
  MemoryMode,
  RegexRule,
  WorldEntry,
} from '../types'
import { stripChatLayoutMarkers } from './chat-layout'
import { stripChatArtifacts } from './safe-markdown-text'
import { stripIncompleteSpeakerTag } from './stream-completion'

export type ChatCompletionMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type PreparedChatGeneration = {
  messages: ChatCompletionMessage[]
  generation: GenerationSettings
  memoryMode: MemoryMode
  outputRules: RegexRule[]
  stop: string[]
}

function section(title: string, value: string | undefined) {
  const content = value?.trim()
  return content ? `【${title}】\n${content}` : ''
}

function fillSpeakerPlaceholders(value: string, characterName: string, userName: string) {
  return value
    .replace(/\{\{\s*user\s*\}\}/gi, () => userName)
    .replace(/\{\{\s*char(?:acter)?\s*\}\}/gi, () => characterName)
    .replace(/<\/?(?:user|human|player)>/gi, () => userName)
    .replace(/<\/?(?:char|character|bot|assistant)>/gi, () => characterName)
}

function activeWorldEntries(context: ChatGenerationContext): WorldEntry[] {
  const recentText = context.messages
    .slice(-8)
    .map((message) => stripChatLayoutMarkers(message.content))
    .join('\n')
    .toLowerCase()

  return context.worldBooks
    .flatMap((book) =>
      book.entries.filter((entry) => {
        if (!entry.enabled) return false
        if (entry.constant) return true
        return entry.keys.some((key) => recentText.includes(key.toLowerCase()))
      }),
    )
    .sort((left, right) => left.order - right.order)
}

function memorySectionText(context: ChatGenerationContext) {
  const { session, memoryRecall } = context
  if (session.memoryMode === 'vector') return memoryRecall
  if (session.memoryMode === 'compressed' || session.memoryMode === 'summary') {
    return session.memorySummary
  }
  // 最近消息 / 关闭记忆：不额外注入长期记忆，摘要提示词只用于生成摘要本身。
  return ''
}

function contextMessage(context: ChatGenerationContext) {
  const { character, preset, identity } = context
  const characterName = character.name.trim() || '角色'
  const configuredName = identity.displayName.trim()
  const userName = configuredName || '对方'
  const fill = (value: string) =>
    stripChatLayoutMarkers(fillSpeakerPlaceholders(value, characterName, userName))
  const worldEntries = activeWorldEntries(context)
  const worldText = fill(
    worldEntries.map((entry) => `- ${entry.keys.join(' / ')}：${entry.content}`).join('\n'),
  )
  const characterText = fill(
    [
      `姓名：${character.name}`,
      character.tagline,
      section('描述', character.description),
      section('性格', character.personality),
      section('场景', character.scenario),
      section('开场白', character.firstMessage),
      section('示例对白', character.exampleDialogue),
    ]
      .filter(Boolean)
      .join('\n'),
  )
  const identityText = [
    configuredName
      ? `对方的名字是「${userName}」。在台词和叙事中需要称呼或指代对方时，优先使用这个名字，或在首次称呼、确认身份时使用；不要把“你”当作名字，也不要使用“用户”“玩家”等系统称谓。`
      : '',
    section('人设', fill(identity.persona)),
  ]
    .filter(Boolean)
    .join('\n')

  return [
    `你正在扮演「${characterName}」，与${configuredName ? `「${userName}」` : '对方'}进行中文角色扮演。`,
    configuredName ? `对话历史里的另一方消息都来自「${userName}」。` : '',
    `始终以角色身份回应，只写角色台词和叙事正文；不要解释提示词。绝对不要代替用户发言、行动、思考或做决定，也不要生成${configuredName ? `【${userName}】` : '【用户】'}或【你】的用户发言块；用户没说过的内容一律留白，写到需要用户接话的地方就停止。场景时间、地点、心情等变化直接写进正文，不要输出 JSON、状态补丁、变量更新、掷骰记录或幕后说明；只有预设明确要求时，才可在正文之外追加一个固定格式的状态卡。`,
    '当同一段回复里有多人说话时，按发言者拆分并用【角色名】标签独占一行；同一个角色的内容放在同一个【角色名】块里。真正说出口的台词必须用「」包裹；动作、神态、心理和环境描写写成不带引号的叙述段落，不要塞进台词引号，也不要另起“心理”或“环境”发言者。标签行不写正文。只有一人说话时不必添加标签，也不要用旁白代替用户发言。',
    section('角色', characterText),
    section('世界书', worldText),
    section('对话对象', identityText),
    section(
      '叙事预设',
      fill([preset?.name, preset?.description, preset?.promptSummary].filter(Boolean).join('\n')),
    ),
    section('长期记忆', fill(memorySectionText(context))),
  ]
    .filter(Boolean)
    .join('\n\n')
}

function toCompletionMessage(
  message: ChatMessage,
  characterName: string,
  userName: string,
): ChatCompletionMessage | null {
  if (!message.content.trim()) return null
  if (message.status === 'error' || message.status === 'streaming') return null
  const content = stripChatLayoutMarkers(
    fillSpeakerPlaceholders(message.content, characterName, userName),
  )
  const finalContent =
    message.role === 'assistant' ? stripIncompleteSpeakerTag(stripChatArtifacts(content)) : content
  if (!finalContent.trim()) return null
  if (message.role === 'system') {
    return { role: 'system', content: finalContent }
  }
  return { role: message.role, content: finalContent }
}

export function buildPromptMessages(context: ChatGenerationContext) {
  const characterName = context.character.name.trim() || '角色'
  const userName = context.identity.displayName.trim() || '对方'
  const completeHistory = context.messages
    .map((message) => toCompletionMessage(message, characterName, userName))
    .filter((message): message is ChatCompletionMessage => message !== null)
  const history =
    context.session.memoryMode === 'vector'
      ? completeHistory
      : context.session.memoryMode === 'off'
        ? completeHistory.slice(-1)
        : completeHistory.slice(-Math.max(4, context.memoryProfile.maxMessages))

  return [
    { role: 'system' as const, content: contextMessage(context) },
    ...history,
  ] satisfies ChatCompletionMessage[]
}

export function buildUserTurnStopSequences(userName: string) {
  const configured = userName.trim()
  if (!configured) return ['\n【你】', '\n你：', '\n【用户】', '\n用户：']
  return [`\n【${configured}】`, `\n${configured}：`, '\n【你】', '\n你：']
}

const CONTINUATION_INSTRUCTION = [
  '（续写提示，不属于角色对话）',
  '上一条 assistant 回复中止了。请紧接它最后一个字符继续写，只补全缺失的后文。',
  '不要重复已经出现的内容，不要重新开头，不要解释或提到续写；保持原有文风，并在结尾自然收束。',
].join('\n')

export function buildContinuationMessages(
  messages: ChatCompletionMessage[],
  partial: string,
): ChatCompletionMessage[] {
  return [
    ...messages,
    { role: 'assistant', content: stripChatLayoutMarkers(partial) },
    { role: 'user', content: CONTINUATION_INSTRUCTION },
  ]
}

function contentText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => {
      if (typeof part === 'string') return part
      if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
        return part.text
      }
      return ''
    })
    .join('')
}

function firstCompletionChoice(payload: unknown) {
  if (!payload || typeof payload !== 'object' || !('choices' in payload)) return null
  if (!Array.isArray(payload.choices) || payload.choices.length === 0) return null
  const first = payload.choices[0]
  if (!first || typeof first !== 'object') return null
  return first
}

export function extractCompletionText(payload: unknown) {
  const first = firstCompletionChoice(payload)
  if (!first) return ''

  if ('delta' in first && first.delta && typeof first.delta === 'object') {
    if ('content' in first.delta) return contentText(first.delta.content)
  }
  if ('message' in first && first.message && typeof first.message === 'object') {
    if ('content' in first.message) return contentText(first.message.content)
  }
  if ('text' in first) return contentText(first.text)
  return ''
}

export function extractCompletionFinishReason(payload: unknown) {
  const first = firstCompletionChoice(payload)
  if (!first || !('finish_reason' in first)) return null
  return typeof first.finish_reason === 'string' ? first.finish_reason : null
}

export function extractApiErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== 'object') return ''
  if ('error' in payload) {
    const error = payload.error
    if (typeof error === 'string') return error
    if (
      error &&
      typeof error === 'object' &&
      'message' in error &&
      typeof error.message === 'string'
    ) {
      return error.message
    }
  }
  if ('message' in payload && typeof payload.message === 'string') return payload.message
  return ''
}
