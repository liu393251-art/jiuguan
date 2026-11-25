import { describe, expect, it } from 'vitest'

import type { RegexRule } from '../types'
import { buildRegexPacks, findRegexPackForRules } from './regex-packs'

function rule(id: string, patch: Partial<RegexRule> = {}): RegexRule {
  return {
    id,
    name: id,
    pattern: 'x',
    replacement: '',
    flags: '',
    scope: 'output',
    enabled: true,
    packId: null,
    packName: null,
    ...patch,
  }
}

describe('regex packs', () => {
  it('groups rules by pack and keeps standalone rules selectable', () => {
    const packs = buildRegexPacks([
      rule('chat', { packId: 'chat-pack', packName: '微信式对话气泡' }),
      rule('tangli-1', { packId: 'tangli-pack', packName: '棠梨正则包' }),
      rule('tangli-2', { packId: 'tangli-pack', packName: '棠梨正则包' }),
      rule('solo'),
    ])

    expect(packs.map((pack) => [pack.id, pack.ruleIds])).toEqual([
      ['chat-pack', ['chat']],
      ['tangli-pack', ['tangli-1', 'tangli-2']],
      ['regex-rule:solo', ['solo']],
    ])
  })

  it('matches a whole pack regardless of rule order', () => {
    const packs = buildRegexPacks([
      rule('tangli-1', { packId: 'tangli-pack', packName: '棠梨正则包' }),
      rule('tangli-2', { packId: 'tangli-pack', packName: '棠梨正则包' }),
    ])

    expect(findRegexPackForRules(packs, ['tangli-2', 'tangli-1'])?.name).toBe('棠梨正则包')
    expect(findRegexPackForRules(packs, ['tangli-1'])).toBeUndefined()
    expect(findRegexPackForRules(packs, [])).toBeUndefined()
  })
})
