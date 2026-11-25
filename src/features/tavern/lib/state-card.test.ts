import { describe, expect, it } from 'vitest'

import { extractStateCard, stripStateCards } from './state-card'

describe('state card parser', () => {
  it('extracts participant stats and removes the block from story text', () => {
    const result = extractStateCard(`门铃响了三下。

[[状态]]
闻灯｜女｜34｜驿站掌柜
好感度：42（+3）
欲望值：18
堕落度：6
备注：她把钥匙放回了外套内袋。

周既明｜男｜38｜调查员
仇恨值：73（-2）
信任值：21
戒备值：88
[[/状态]]`)

    expect(result.content).toBe('门铃响了三下。')
    expect(result.card?.participants).toHaveLength(2)
    expect(result.card?.participants[0]).toMatchObject({
      name: '闻灯',
      gender: 'female',
      age: 34,
      role: '驿站掌柜',
      note: '她把钥匙放回了外套内袋。',
    })
    expect(result.card?.participants[0]?.stats).toEqual([
      { key: 'favor', label: '好感度', value: 42, delta: 3 },
      { key: 'desire', label: '欲望值', value: 18, delta: null },
      { key: 'corruption', label: '堕落度', value: 6, delta: null },
    ])
    expect(result.card?.participants[1]?.stats).toEqual([
      { key: 'hatred', label: '仇恨值', value: 73, delta: -2 },
      { key: 'trust', label: '信任值', value: 21, delta: null },
      { key: 'guard', label: '戒备值', value: 88, delta: null },
    ])
  })

  it('accepts alternate markers, aliases, compact stat lines, and clamps values', () => {
    const result = extractStateCard(`她把灯芯拨亮。

【状态】
林晚 / 女 / 29 / 夜间电台主持人
**好感：130/100**
欲望 12；堕落：-8

顾临（男，31岁，自由斡旋者）
仇恨度：55
[[/状态]]
桌上留着一杯没喝完的酒。`)

    expect(result.content).toBe('她把灯芯拨亮。\n\n桌上留着一杯没喝完的酒。')
    expect(result.card?.participants.map((participant) => participant.name)).toEqual([
      '林晚',
      '顾临',
    ])
    expect(result.card?.participants[0]?.stats).toEqual([
      { key: 'favor', label: '好感度', value: 100, delta: null },
      { key: 'desire', label: '欲望值', value: 12, delta: null },
      { key: 'corruption', label: '堕落度', value: 0, delta: null },
    ])
    expect(result.card?.participants[1]).toMatchObject({
      gender: 'male',
      age: 31,
      role: '自由斡旋者',
    })
    expect(result.card?.participants[1]?.stats[0]).toEqual({
      key: 'hatred',
      label: '仇恨值',
      value: 55,
      delta: null,
    })
  })

  it('hides an unfinished block while a reply is still streaming', () => {
    const result = extractStateCard(`她还没有回答。

[[状态]]
闻灯｜女｜34｜驿站掌柜
好感度：42`)

    expect(result.content).toBe('她还没有回答。')
    expect(result.card).toBeNull()
  })

  it('does not treat ordinary prose mentioning state as a status block', () => {
    const input = '她看了一眼便签上的状态：墨水还没干。'
    expect(extractStateCard(input)).toEqual({ content: input, card: null })
    expect(stripStateCards(input)).toBe(input)
  })

  it('keeps only the last complete block when several are present', () => {
    const result = extractStateCard(`[[状态]]
闻灯｜女｜34
好感度：10
[[/状态]]

正文仍在。

[状态]
闻灯｜女｜34
好感度：58
[/状态]`)

    expect(result.content).toBe('正文仍在。')
    expect(result.card?.participants[0]?.stats[0]).toMatchObject({ key: 'favor', value: 58 })
  })
})
