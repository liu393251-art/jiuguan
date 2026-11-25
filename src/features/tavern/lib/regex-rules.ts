import type { RegexRule } from '../types'

export function applyRegexRules(
  content: string,
  rules: RegexRule[],
  scope: 'input' | 'output',
) {
  return rules.reduce((current, rule) => {
    if (!rule.enabled || (rule.scope !== scope && rule.scope !== 'both')) return current
    try {
      return current.replace(new RegExp(rule.pattern, rule.flags), rule.replacement)
    } catch {
      return current
    }
  }, content)
}
