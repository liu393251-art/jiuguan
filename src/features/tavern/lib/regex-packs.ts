import type { RegexRule } from '../types'

export type RegexPack = {
  id: string
  name: string
  ruleIds: string[]
  rules: RegexRule[]
}

export function buildRegexPacks(rules: RegexRule[]): RegexPack[] {
  const packs = new Map<string, RegexPack>()
  for (const rule of rules) {
    const id = rule.packId ?? `regex-rule:${rule.id}`
    const name = rule.packName?.trim() || rule.name
    const existing = packs.get(id)
    if (existing) {
      existing.ruleIds.push(rule.id)
      existing.rules.push(rule)
      continue
    }
    packs.set(id, { id, name, ruleIds: [rule.id], rules: [rule] })
  }
  return [...packs.values()]
}

export function findRegexPackForRules(packs: RegexPack[], ruleIds: string[]) {
  if (ruleIds.length === 0) return undefined
  return packs.find((pack) => {
    if (pack.ruleIds.length !== ruleIds.length) return false
    const selected = new Set(ruleIds)
    return pack.ruleIds.every((id) => selected.has(id))
  })
}
