import type { ChatMessage } from '../types'

export type CompletionTransport = 'json' | 'sse'

export type CompletionTerminal = {
  transport: CompletionTransport
  finishReason: string | null
  sawDone: boolean
  invalidData: boolean
}

export type CompletionAssessment = {
  content: string
  complete: boolean
  warning: string | null
  issue: CompletionIssue
}

export type CompletionIssue =
  | 'length'
  | 'content_filter'
  | 'provider'
  | 'invalid-data'
  | 'disconnected'
  | 'incomplete-tag'
  | null

const INCOMPLETE_SPEAKER_TAG = /(?:^|\n)[ \t]*【[^】\r\n]*$/
const NORMAL_FINISH_REASONS = new Set(['stop', 'end_turn', 'eos_token', 'stop_sequence'])

export function hasIncompleteSpeakerTag(content: string) {
  return INCOMPLETE_SPEAKER_TAG.test(content)
}

export function stripIncompleteSpeakerTag(content: string) {
  return content.replace(INCOMPLETE_SPEAKER_TAG, '').trimEnd()
}

export function repairIncompleteMessage(message: Pick<ChatMessage, 'role' | 'content' | 'status'>) {
  if (message.role !== 'assistant') return false
  const content = stripIncompleteSpeakerTag(message.content)
  if (content === message.content) return false
  message.content = content
  if (message.status === 'complete') message.status = 'stopped'
  return true
}

export function mergeContinuation(existing: string, continuation: string) {
  let next = continuation
  const partialTag = existing.match(/【([^】\n]*)$/)?.[1]

  if (partialTag !== undefined) {
    const completedTagPrefix = `【${partialTag}`
    if (next.startsWith(completedTagPrefix)) {
      next = next.slice(completedTagPrefix.length)
    } else if (partialTag && next.startsWith(partialTag)) {
      next = next.slice(partialTag.length)
    } else if (next.startsWith('【')) {
      next = next.slice(1)
    }
  }

  const maxOverlap = Math.min(existing.length, next.length, 300)
  for (let length = maxOverlap; length >= 8; length -= 1) {
    if (existing.endsWith(next.slice(0, length))) {
      next = next.slice(length)
      break
    }
  }

  return next ? `${existing}${next}` : existing
}

export function canContinueCompletion(assessment: CompletionAssessment) {
  return (
    assessment.issue === 'length' ||
    assessment.issue === 'invalid-data' ||
    assessment.issue === 'disconnected' ||
    assessment.issue === 'incomplete-tag'
  )
}

export function assessCompletion(
  content: string,
  terminal: CompletionTerminal,
): CompletionAssessment {
  const trimmed = content.trim()
  const incompleteTag = hasIncompleteSpeakerTag(trimmed)
  const sanitized = stripIncompleteSpeakerTag(trimmed)
  const finishReason = terminal.finishReason?.trim().toLowerCase() || null

  let warning: string | null = null
  let issue: CompletionIssue = null
  if (finishReason === 'length' || finishReason === 'max_tokens') {
    issue = 'length'
    warning =
      '回复达到本次 token 上限，内容可能不完整。可以点下方重试，或在对话设置里提高最大输出。'
  } else if (finishReason === 'content_filter') {
    issue = 'content_filter'
    warning = '接口因内容策略中止了回复，已保留当前内容。'
  } else if (finishReason && !NORMAL_FINISH_REASONS.has(finishReason)) {
    issue = 'provider'
    warning = `接口以「${finishReason.slice(0, 40)}」结束回复，内容可能不完整。`
  } else if (terminal.invalidData) {
    issue = 'invalid-data'
    warning = '部分流式数据无法解析，已保留收到的内容。'
  } else if (terminal.transport === 'sse' && !terminal.sawDone && !finishReason) {
    issue = 'disconnected'
    warning = '流式连接在正常结束信号前断开，已保留收到的内容。'
  } else if (incompleteTag) {
    issue = 'incomplete-tag'
    warning = '回复停在发言标签中间，未完成的标签已移除。'
  }

  return {
    content: sanitized,
    complete: warning === null,
    warning,
    issue,
  }
}
