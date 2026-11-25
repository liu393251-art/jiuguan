export type StateCardGender = 'female' | 'male' | 'other'

export type StateStat = {
  key: string
  label: string
  value: number
  delta: number | null
}

export type StateParticipant = {
  name: string
  gender: StateCardGender
  age: number | null
  role: string
  stats: StateStat[]
  note: string
}

export type StateCardData = {
  title: string
  participants: StateParticipant[]
}

export type ExtractedStateCard = {
  content: string
  card: StateCardData | null
}

const STATE_START = /^[ \t]*(?:\[\[状态\]\]|【状态】|［状态］|\[状态\])[ \t]*$/gm
const STATE_END = /^[ \t]*(?:\[\[\/状态\]\]|【\/状态】|［\/状态］|\[\/状态\])[ \t]*$/gm
const STAT_ENTRY =
  /([\u3400-\u9fffA-Za-z][\u3400-\u9fffA-Za-z0-9_ ·]{0,11}?)\s*(?:[：:]|\s+)\s*([+-]?\d+(?:\.\d+)?)(?:\s*\/\s*100)?(?:\s*[%％])?/gu
const NON_STAT_LABELS = new Set([
  '姓名',
  '性别',
  '年龄',
  '身份',
  '职业',
  '角色',
  '备注',
  '近况',
  '说明',
])

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function roundStat(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? clamp(Math.round(parsed), 0, 100) : 0
}

function roundDelta(value: string) {
  const parsed = Number(value.replace(/\s+/g, ''))
  return Number.isFinite(parsed) ? clamp(Math.round(parsed), -100, 100) : null
}

function cleanLine(value: string) {
  return value
    .replace(/^[\s>*·•●▪◦\-–—]+/, '')
    .replace(/[*_`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseGender(value: string): StateCardGender | null {
  const normalized = value
    .replace(/[（）()[\]\s]/g, '')
    .replace(/性别/g, '')
    .toLowerCase()
  if (['女', '女性', '女生', 'f', 'female'].includes(normalized)) return 'female'
  if (['男', '男性', '男生', 'm', 'male'].includes(normalized)) return 'male'
  if (['其他', '非二元', '未知', 'other', 'nonbinary', 'nb'].includes(normalized)) return 'other'
  return null
}

function parseAge(value: string): number | null {
  const normalized = cleanLine(value)
  const explicit = normalized.match(/(\d{1,3})\s*岁/)
  const bare = /^\d{2,3}$/.test(normalized) ? normalized : ''
  const matched = explicit?.[1] ?? bare
  if (!matched) return null
  const age = Number(matched)
  return Number.isInteger(age) && age > 0 && age < 200 ? age : null
}

function joinRole(parts: string[]) {
  return parts
    .map((part) => cleanLine(part))
    .filter(Boolean)
    .join(' · ')
    .slice(0, 80)
}

function participantHeader(value: string): StateParticipant | null {
  const line = cleanLine(value)
  if (!line || STAT_ENTRY.test(line)) {
    STAT_ENTRY.lastIndex = 0
    return null
  }
  STAT_ENTRY.lastIndex = 0

  let parts = line.split(/\s*[|｜]\s*/).filter(Boolean)
  if (parts.length < 2) {
    const parenthetical = line.match(/^([^（(]+)[（(]([^）)]+)[）)]$/)
    if (parenthetical) {
      parts = [cleanLine(parenthetical[1]), ...parenthetical[2].split(/[，,、/]/)]
    } else {
      const tokens = line.split(/\s+/).filter(Boolean)
      if (tokens.length >= 2 && tokens.some((token) => parseGender(token))) {
        parts = tokens
      }
    }
  }

  if (parts.length < 2) return null
  const genderIndex = parts.findIndex((part) => parseGender(part) !== null)
  if (genderIndex < 0) return null

  const nameIndex = genderIndex === 0 ? 1 : 0
  const name = cleanLine(parts[nameIndex] ?? '')
  if (!name || parseAge(name) !== null || parseGender(name) !== null) return null

  const ageIndex = parts.findIndex((part, index) => index !== nameIndex && parseAge(part) !== null)
  const role = joinRole(
    parts.filter((_, index) => index !== nameIndex && index !== genderIndex && index !== ageIndex),
  )

  return {
    name: name.slice(0, 40),
    gender: parseGender(parts[genderIndex] ?? '') ?? 'other',
    age: ageIndex >= 0 ? parseAge(parts[ageIndex] ?? '') : null,
    role,
    stats: [],
    note: '',
  }
}

function statIdentity(label: string) {
  const normalized = label
    .replace(/[（(].*$/, '')
    .replace(/\s+/g, '')
    .toLowerCase()
  if (['好感', '好感度', '好感值', 'affection', 'favor', 'favour'].includes(normalized)) {
    return { key: 'favor', label: '好感度' }
  }
  if (['欲望', '欲望值', 'desire', 'lust'].includes(normalized)) {
    return { key: 'desire', label: '欲望值' }
  }
  if (['堕落', '堕落度', '堕落值', 'corruption'].includes(normalized)) {
    return { key: 'corruption', label: '堕落度' }
  }
  if (['仇恨', '仇恨度', '仇恨值', 'hatred', 'hate'].includes(normalized)) {
    return { key: 'hatred', label: '仇恨值' }
  }
  if (['信任', '信任值', 'trust'].includes(normalized)) {
    return { key: 'trust', label: '信任值' }
  }
  if (['戒备', '戒备值', 'guard', 'wariness'].includes(normalized)) {
    return { key: 'guard', label: '戒备值' }
  }
  return { key: `custom:${normalized || label}`, label: label.slice(0, 12) }
}

function parseStats(value: string): StateStat[] {
  const line = cleanLine(value)
  const matches = [...line.matchAll(STAT_ENTRY)]
  if (matches.length === 0) return []

  return matches.flatMap((match, index) => {
    const rawLabel = cleanLine(match[1] ?? '')
    if (!rawLabel || NON_STAT_LABELS.has(rawLabel)) return []
    const identity = statIdentity(rawLabel)
    const tailStart = (match.index ?? 0) + match[0].length
    const tailEnd = matches[index + 1]?.index ?? line.length
    const tail = line.slice(tailStart, tailEnd)
    const delta =
      tail.match(/^\s*[\uFF08(\u005B]\s*([+-]?\d+(?:\.\d+)?)\s*[\uFF09)\u005D]/) ??
      tail.match(/^\s*([+-]\s*\d+(?:\.\d+)?)(?=\s|$)/)

    return [
      {
        ...identity,
        value: roundStat(match[2] ?? '0'),
        delta: delta ? roundDelta(delta[1] ?? '') : null,
      },
    ]
  })
}

function addStats(participant: StateParticipant, stats: StateStat[]) {
  for (const stat of stats) {
    const existing = participant.stats.find((item) => item.key === stat.key)
    if (existing) Object.assign(existing, stat)
    else participant.stats.push(stat)
  }
}

function parseStateBlock(value: string): StateCardData | null {
  const participants: StateParticipant[] = []
  let current: StateParticipant | null = null

  for (const rawLine of value.replace(/\r\n?/g, '\n').split('\n')) {
    const line = cleanLine(rawLine)
    if (!line || /^[-–—]{3,}$/.test(line) || line.startsWith('```')) continue

    const nameMeta = line.match(/^姓名\s*[：:]\s*(.+)$/)
    if (nameMeta) {
      const name = cleanLine(nameMeta[1] ?? '').slice(0, 40)
      current = name
        ? (participants.find((item) => item.name === name) ?? {
            name,
            gender: 'other',
            age: null,
            role: '',
            stats: [],
            note: '',
          })
        : null
      if (current && !participants.includes(current)) participants.push(current)
      continue
    }

    const header = participantHeader(line)
    if (header) {
      const existing = participants.find((item) => item.name === header.name)
      if (existing) {
        if (existing.gender === 'other') existing.gender = header.gender
        if (header.age !== null) existing.age = header.age
        if (header.role) existing.role = header.role
        current = existing
      } else {
        participants.push(header)
        current = header
      }
      continue
    }

    if (!current) continue

    const meta = line.match(/^(性别|年龄|身份|职业|角色)\s*[：:]\s*(.+)$/)
    if (meta) {
      if (meta[1] === '性别') current.gender = parseGender(meta[2] ?? '') ?? current.gender
      else if (meta[1] === '年龄') current.age = parseAge(meta[2] ?? '') ?? current.age
      else current.role = cleanLine(meta[2] ?? '').slice(0, 80)
      continue
    }

    const note = line.match(/^(备注|近况|说明)\s*[：:]\s*(.+)$/)
    if (note) {
      current.note = [current.note, cleanLine(note[2] ?? '')].filter(Boolean).join(' ')
      continue
    }

    addStats(current, parseStats(line))
  }

  const usable = participants.filter(
    (participant) => participant.stats.length > 0 || participant.note,
  )
  if (usable.length === 0) return null
  return { title: '角色状态', participants: usable }
}

function stripRanges(input: string, ranges: { start: number; end: number }[]) {
  let cursor = 0
  let result = ''
  for (const range of ranges) {
    result += input.slice(cursor, range.start)
    cursor = range.end
  }
  result += input.slice(cursor)
  return result.replace(/\n{3,}/g, '\n\n').trim()
}

export function extractStateCard(input: string): ExtractedStateCard {
  const ranges: { start: number; end: number }[] = []
  const blocks: string[] = []
  let cursor = 0

  while (cursor < input.length) {
    STATE_START.lastIndex = cursor
    const start = STATE_START.exec(input)
    if (!start) break
    const bodyStart = start.index + start[0].length
    STATE_END.lastIndex = bodyStart
    const end = STATE_END.exec(input)
    if (!end) {
      ranges.push({ start: start.index, end: input.length })
      break
    }
    const bodyEnd = end.index
    blocks.push(input.slice(bodyStart, bodyEnd))
    ranges.push({ start: start.index, end: end.index + end[0].length })
    cursor = end.index + end[0].length
  }

  if (ranges.length === 0) return { content: input, card: null }

  const card = blocks.length > 0 ? parseStateBlock(blocks[blocks.length - 1] ?? '') : null
  return { content: stripRanges(input, ranges), card }
}

export function stripStateCards(input: string) {
  return extractStateCard(input).content
}
