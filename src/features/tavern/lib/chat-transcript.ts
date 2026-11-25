import { parseChatLayout, type ChatLayoutRange, type ChatLayoutType } from './chat-layout'

export type ChatTranscriptSegment = {
  type: ChatLayoutType
  content: string
}

export type ChatTranscriptEntry = {
  speaker: string
  content: string
  segments: ChatTranscriptSegment[]
}

export type ChatTranscript = {
  intro: string
  introSegments: ChatTranscriptSegment[]
  entries: ChatTranscriptEntry[]
}

const SPEAKER_TAG = /^【([^】\n]{1,32})】[ \t]*/gm
const SPEAKER_LABEL = /^([^：:\n【】]{1,32})[：:][ \t]*$/gm
const QUOTE_PAIRS = [
  { open: '「', close: '」' },
  { open: '『', close: '』' },
  { open: '“', close: '”' },
  { open: '"', close: '"' },
] as const
const PAREN_PAIRS = [
  { open: '（', close: '）' },
  { open: '(', close: ')' },
] as const
const USER_SPEAKER_ALIASES = new Set([
  '你',
  '我',
  '用户',
  '玩家',
  '对方',
  'user',
  'me',
  'player',
  'human',
])

type SegmentRange = {
  type: ChatLayoutType
  start: number
  end: number
}

type KeyedSegmentRange = SegmentRange & {
  key: string
}

function normalizeTranscriptText(content: string) {
  return content
    .replace(/\r\n?/g, '\n')
    .replace(/\\[ \t]*(?=\n|$)/g, '')
    .trim()
}

function nextOpeningQuote(text: string, from: number, end: number) {
  let next: { index: number; open: string; close: string } | null = null
  for (const pair of QUOTE_PAIRS) {
    const index = text.indexOf(pair.open, from)
    if (index < 0 || index >= end || (next && next.index <= index)) continue
    next = { index, ...pair }
  }
  return next
}

function nextUserBoundary(text: string, from: number, end: number) {
  let next: { index: number; open: string; close: string; type: ChatLayoutType } | null = null
  for (const pair of QUOTE_PAIRS) {
    const index = text.indexOf(pair.open, from)
    if (index >= 0 && index < end && (!next || index < next.index)) {
      next = { index, ...pair, type: 'dialogue' }
    }
  }
  for (const pair of PAREN_PAIRS) {
    const index = text.indexOf(pair.open, from)
    if (index >= 0 && index < end && (!next || index < next.index)) {
      next = { index, ...pair, type: 'narration' }
    }
  }
  return next
}

function splitUserChatRanges(text: string, start: number, end: number): SegmentRange[] {
  const ranges: SegmentRange[] = []
  let cursor = start

  while (cursor < end) {
    const opening = nextUserBoundary(text, cursor, end)
    if (!opening) {
      ranges.push({ type: 'dialogue', start: cursor, end })
      break
    }
    if (opening.index > cursor) {
      ranges.push({ type: 'dialogue', start: cursor, end: opening.index })
    }

    const closeIndex = text.indexOf(opening.close, opening.index + opening.open.length)
    if (closeIndex < 0 || closeIndex + opening.close.length > end) {
      ranges.push({ type: opening.type, start: opening.index, end })
      break
    }
    ranges.push({
      type: opening.type,
      start: opening.index,
      end: closeIndex + opening.close.length,
    })
    cursor = closeIndex + opening.close.length
  }

  return ranges
}

function splitQuotedRanges(text: string, start: number, end: number): SegmentRange[] {
  const ranges: SegmentRange[] = []
  let cursor = start

  while (cursor < end) {
    const opening = nextOpeningQuote(text, cursor, end)
    if (!opening) {
      ranges.push({ type: 'narration', start: cursor, end })
      break
    }
    if (opening.index > cursor) {
      ranges.push({ type: 'narration', start: cursor, end: opening.index })
    }

    const closeIndex = text.indexOf(opening.close, opening.index + opening.open.length)
    if (closeIndex < 0 || closeIndex + opening.close.length > end) {
      ranges.push({ type: 'dialogue', start: opening.index, end })
      break
    }
    ranges.push({
      type: 'dialogue',
      start: opening.index,
      end: closeIndex + opening.close.length,
    })
    cursor = closeIndex + opening.close.length
  }

  return ranges
}

function applyLayoutRanges(
  baseRanges: SegmentRange[],
  layoutRanges: ChatLayoutRange[],
): KeyedSegmentRange[] {
  const pieces: KeyedSegmentRange[] = []

  baseRanges.forEach((base, baseIndex) => {
    const boundaries = new Set([base.start, base.end])
    layoutRanges.forEach((layout) => {
      if (layout.start >= base.end || layout.end <= base.start) return
      boundaries.add(Math.max(base.start, layout.start))
      boundaries.add(Math.min(base.end, layout.end))
    })
    const sortedBoundaries = [...boundaries].sort((left, right) => left - right)

    for (let index = 0; index < sortedBoundaries.length - 1; index += 1) {
      const start = sortedBoundaries[index]
      const end = sortedBoundaries[index + 1]
      if (end <= start) continue
      const midpoint = start + (end - start) / 2
      const layoutIndex = layoutRanges.findIndex(
        (layout) => layout.start <= midpoint && midpoint < layout.end,
      )
      const layout = layoutIndex >= 0 ? layoutRanges[layoutIndex] : null
      pieces.push({
        type: layout?.type ?? base.type,
        start,
        end,
        key: layout ? `layout:${layoutIndex}` : `base:${baseIndex}`,
      })
    }
  })

  const merged: KeyedSegmentRange[] = []
  for (const piece of pieces) {
    const previous = merged[merged.length - 1]
    if (
      previous &&
      previous.key === piece.key &&
      previous.type === piece.type &&
      previous.end === piece.start
    ) {
      previous.end = piece.end
    } else {
      merged.push({ ...piece })
    }
  }
  return merged
}

function trimSegment(text: string, range: SegmentRange): ChatTranscriptSegment | null {
  let start = range.start
  let end = range.end
  while (start < end && /\s/.test(text[start])) start += 1
  while (end > start && /\s/.test(text[end - 1])) end -= 1
  if (end <= start) return null
  return { type: range.type, content: text.slice(start, end) }
}

function buildChatSegments(
  text: string,
  start: number,
  end: number,
  layoutRanges: ChatLayoutRange[],
  options: { unquotedDialogue?: boolean } = {},
): ChatTranscriptSegment[] {
  if (end <= start) return []
  const baseRanges = options.unquotedDialogue
    ? splitUserChatRanges(text, start, end)
    : splitQuotedRanges(text, start, end)
  return applyLayoutRanges(baseRanges, layoutRanges)
    .map((range) => trimSegment(text, range))
    .filter((segment): segment is ChatTranscriptSegment => segment !== null)
}

export function splitChatSegments(
  content: string,
  options: { unquotedDialogue?: boolean } = {},
): ChatTranscriptSegment[] {
  const normalized = normalizeTranscriptText(content)
  const layout = parseChatLayout(normalized)
  return buildChatSegments(layout.text, 0, layout.text.length, layout.ranges, options)
}

function speakerMatches(content: string) {
  return [...content.matchAll(SPEAKER_TAG), ...content.matchAll(SPEAKER_LABEL)].sort(
    (left, right) => (left.index ?? 0) - (right.index ?? 0),
  )
}

export function parseChatTranscript(content: string, userName = ''): ChatTranscript | null {
  const normalized = normalizeTranscriptText(content)
  const layout = parseChatLayout(normalized)
  const text = layout.text
  const matches = speakerMatches(text)
  if (matches.length < 1) return null

  const entries: ChatTranscriptEntry[] = []
  matches.forEach((match, index) => {
    const start = (match.index ?? 0) + match[0].length
    const end = match.index === undefined ? start : (matches[index + 1]?.index ?? text.length)
    const body = text.slice(start, end).trim()
    const speaker = match[1]?.trim()
    if (speaker && body) {
      entries.push({
        speaker,
        content: body,
        segments: buildChatSegments(text, start, end, layout.ranges, {
          unquotedDialogue: isUserSpeaker(speaker, userName),
        }),
      })
    }
  })

  if (entries.length < 1) return null
  const introEnd = matches[0]?.index ?? 0
  const intro = text.slice(0, introEnd).trim()
  return {
    intro,
    introSegments: buildChatSegments(text, 0, introEnd, layout.ranges),
    entries,
  }
}

function normalizeSpeakerMarkers(speaker: string, userName: string, characterName: string) {
  const user = userName.trim() || '你'
  const character = characterName.trim() || '角色'
  return speaker
    .trim()
    .replace(/\{\{\s*user\s*\}\}/gi, user)
    .replace(/\{\{\s*char(?:acter)?\s*\}\}/gi, character)
    .replace(/<\/?(?:user|human|player)>/gi, user)
    .replace(/<\/?(?:char|character|bot|assistant)>/gi, character)
}

export function isUserSpeaker(speaker: string, userName = '') {
  const normalized = normalizeSpeakerMarkers(speaker, userName, '')
  if (userName.trim() && normalized === userName.trim()) return true
  return USER_SPEAKER_ALIASES.has(normalized.toLowerCase())
}

export function formatSpeakerLabel(speaker: string, userName: string, characterName: string) {
  const normalized = normalizeSpeakerMarkers(speaker, userName, characterName)
  if (isUserSpeaker(normalized, userName)) return userName.trim() || '你'
  return normalized || characterName || '旁白'
}
