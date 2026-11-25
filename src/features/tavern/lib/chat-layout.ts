export type ChatLayoutType = 'dialogue' | 'narration'

export type ChatLayoutRange = {
  type: ChatLayoutType
  start: number
  end: number
}

export type ChatLayoutText = {
  text: string
  ranges: ChatLayoutRange[]
}

const LAYOUT_TAG = /\[\[\s*(\/?)\s*(bubble|dialogue|narration|气泡|旁白|叙述)\s*\]\]/gi

const TAG_TYPES: Record<string, ChatLayoutType> = {
  bubble: 'dialogue',
  dialogue: 'dialogue',
  气泡: 'dialogue',
  narration: 'narration',
  旁白: 'narration',
  叙述: 'narration',
}

type LayoutTagEvent = {
  position: number
  type: ChatLayoutType
  opening: boolean
}

function closeLayoutTag(stack: ChatLayoutType[], type: ChatLayoutType) {
  const index = stack.lastIndexOf(type)
  if (index >= 0) stack.splice(index)
}

/**
 * Legacy regex rules can use `[[bubble]]...[[/bubble]]` or
 * `[[narration]]...[[/narration]]` to assign layout explicitly. The returned
 * text has all recognized tags removed and ranges use offsets into that text.
 */
export function parseChatLayout(input: string): ChatLayoutText {
  const events: LayoutTagEvent[] = []
  let text = ''
  let cursor = 0

  for (const match of input.matchAll(LAYOUT_TAG)) {
    const index = match.index ?? 0
    text += input.slice(cursor, index)
    const type = TAG_TYPES[match[2].toLowerCase()]
    if (type) {
      events.push({
        position: text.length,
        type,
        opening: match[1] !== '/',
      })
    }
    cursor = index + match[0].length
  }
  text += input.slice(cursor)

  const positions = [...new Set([0, text.length, ...events.map((event) => event.position)])].sort(
    (left, right) => left - right,
  )
  const eventsByPosition = new Map<number, LayoutTagEvent[]>()
  for (const event of events) {
    const bucket = eventsByPosition.get(event.position) ?? []
    bucket.push(event)
    eventsByPosition.set(event.position, bucket)
  }

  const ranges: ChatLayoutRange[] = []
  const stack: ChatLayoutType[] = []
  positions.forEach((position, index) => {
    for (const event of eventsByPosition.get(position) ?? []) {
      if (event.opening) stack.push(event.type)
      else closeLayoutTag(stack, event.type)
    }

    const next = positions[index + 1]
    const type = stack[stack.length - 1]
    if (next === undefined || next <= position || !type) return

    const previous = ranges[ranges.length - 1]
    if (previous && previous.type === type && previous.end === position) {
      previous.end = next
    } else {
      ranges.push({ type, start: position, end: next })
    }
  })

  return { text, ranges }
}

export function stripChatLayoutMarkers(input: string) {
  return parseChatLayout(input).text
}
