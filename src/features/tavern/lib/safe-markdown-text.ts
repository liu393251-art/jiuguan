function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPatchArray(value: unknown) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (item) => isRecord(item) && typeof item.op === 'string' && typeof item.path === 'string',
    )
  )
}

function normalizePatchJson(value: string) {
  // Some models emit Markdown line-continuation slashes inside JSON. They are
  // invalid JSON, but removing them only for detection keeps the artifact
  // hidden without touching the surrounding story text.
  return value.replace(/\\\r?\n/g, '\n')
}

function isPatchJson(value: string) {
  try {
    return isPatchArray(JSON.parse(normalizePatchJson(value)) as unknown)
  } catch {
    return false
  }
}

function skipPatchNoise(input: string, start: number) {
  let index = start
  while (index < input.length) {
    const character = input[index]
    if (character === '\\' || /\s/.test(character)) {
      index += 1
      continue
    }
    break
  }
  return index
}

function isPatchArrayStart(input: string, start: number) {
  if (input[start] !== '[') return false

  let index = skipPatchNoise(input, start + 1)
  if (input[index] !== '{') return false

  index = skipPatchNoise(input, index + 1)
  if (input.slice(index, index + 4) !== '"op"') return false

  index = skipPatchNoise(input, index + 4)
  return input[index] === ':'
}

function findPatchStart(input: string, from: number) {
  for (let start = input.indexOf('[', from); start !== -1; start = input.indexOf('[', start + 1)) {
    if (isPatchArrayStart(input, start)) return start
  }
  return -1
}

function findArrayEnd(input: string, start: number) {
  let depth = 0
  let inString = false
  let escaped = false

  for (let index = start; index < input.length; index += 1) {
    const character = input[index]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === '"') {
        inString = false
      }
      continue
    }

    if (character === '"') {
      inString = true
    } else if (character === '[') {
      depth += 1
    } else if (character === ']') {
      depth -= 1
      if (depth === 0) return index
    }
  }

  return -1
}

function isPatchPayload(value: string) {
  const trimmed = value.trim()
  return isPatchJson(trimmed) || isPatchArrayStart(trimmed, 0)
}

function isStateBriefLine(line: string) {
  const trimmed = line.trim()
  if (!trimmed) return true
  if (/[\u3400-\u9fff]/.test(trimmed)) return false
  return /^[-*+]\s+/.test(trimmed) || /^[A-Z][^:]{1,80}:\s/.test(trimmed)
}

function removeTrailingStateBrief(input: string, patchStart: number) {
  const patchEnd = findArrayEnd(input, patchStart)
  if (patchEnd !== -1 && input.slice(patchEnd + 1).trim()) return input

  let blockStart = input.lastIndexOf('\n', patchStart - 1) + 1
  const patchLineStart = blockStart
  while (blockStart > 0) {
    const previousLineEnd = blockStart - 1
    const previousLineStart = input.lastIndexOf('\n', previousLineEnd - 1) + 1
    if (!isStateBriefLine(input.slice(previousLineStart, previousLineEnd))) break
    blockStart = previousLineStart
  }

  return blockStart < patchLineStart ? input.slice(0, blockStart) : input
}

function removeFencedPatches(input: string) {
  return input.replace(/```[^\n]*\r?\n([\s\S]*?)(?:```|$)/g, (block, body: string) =>
    isPatchPayload(body) ? '' : block,
  )
}

function removeRawPatches(input: string) {
  let cursor = 0
  let result = ''

  while (cursor < input.length) {
    const start = findPatchStart(input, cursor)
    if (start === -1) break

    const end = findArrayEnd(input, start)
    if (end !== -1 && isPatchJson(input.slice(start, end + 1))) {
      result += input.slice(cursor, start)
      cursor = end + 1
      continue
    }

    // A stopped or truncated stream leaves the patch array open. Once the
    // opening `[{"op":...` is unambiguous, the rest of the tail is artifact.
    if (end === -1) {
      result += input.slice(cursor, start)
      cursor = input.length
      break
    }

    result += input.slice(cursor, start + 1)
    cursor = start + 1
  }

  return result + input.slice(cursor)
}

export function stripChatArtifacts(input: string) {
  const patchStart = findPatchStart(input, 0)
  const withoutBrief = patchStart === -1 ? input : removeTrailingStateBrief(input, patchStart)
  return removeRawPatches(removeFencedPatches(withoutBrief))
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

type ModelTextRoles = {
  user?: string
  char?: string
}

export function normalizeModelText(input: string, roles: ModelTextRoles = {}) {
  const user = roles.user?.trim() || '你'
  const char = roles.char?.trim() || '角色'
  const userMarker = '\uE000'
  const charMarker = '\uE001'

  return (
    input
      .replace(/\{\{\s*user\s*\}\}/gi, userMarker)
      .replace(/\{\{\s*char(?:acter)?\s*\}\}/gi, charMarker)
      // Role cards often use <user> / <char> as visible placeholders. Protect them
      // before the generic HTML-tag removal below so speakers never become empty.
      .replace(/<\/?(?:user|human|player)>/gi, userMarker)
      .replace(/<\/?(?:char|character|bot|assistant)>/gi, charMarker)
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|blockquote|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/你\uE000|\uE000你/g, '你')
      .replaceAll(userMarker, user)
      .replaceAll(charMarker, char)
  )
}

export type StreamingMarkdownParts = {
  stable: string
  tail: string
}

const STREAMING_TAIL_MIN_CHARS = 600

function isInsideCodeFence(input: string, position: number) {
  let fences = 0
  for (
    let start = input.indexOf('```');
    start !== -1 && start < position;
    start = input.indexOf('```', start + 3)
  ) {
    fences += 1
  }
  return fences % 2 === 1
}

export function splitStreamingMarkdown(
  input: string,
  minTailChars = STREAMING_TAIL_MIN_CHARS,
): StreamingMarkdownParts {
  const text = input.includes('\r') ? input.replace(/\r\n?/g, '\n') : input
  if (text.length <= minTailChars * 2) return { stable: '', tail: text }

  const searchEnd = text.length - minTailChars
  let boundary = text.lastIndexOf('\n\n', searchEnd)
  while (boundary >= 0) {
    if (!isInsideCodeFence(text, boundary)) {
      return {
        stable: text.slice(0, boundary + 2),
        tail: text.slice(boundary + 2),
      }
    }
    boundary = text.lastIndexOf('\n\n', boundary - 1)
  }

  return { stable: '', tail: text }
}
