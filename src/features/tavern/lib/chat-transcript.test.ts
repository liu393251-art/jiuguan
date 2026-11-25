import { describe, expect, it } from 'vitest'

import { createBuiltinChatRegex } from './builtin-regex'
import {
  formatSpeakerLabel,
  isUserSpeaker,
  parseChatTranscript,
  splitChatSegments,
} from './chat-transcript'
import { applyRegexRules } from './regex-rules'

const sample = `【一条瑠璃】\\
「请、请不要用那种说法…！」

她的声音陡然拔高了一点。

【佐伯翼】\\
「约好时间地点比较妥当。」

【你】\\
「那就放学后见。」
`

describe('chat transcript rendering', () => {
  it('splits tagged roleplay into speaker messages and removes line-continuation slashes', () => {
    const transcript = parseChatTranscript(sample)

    expect(transcript?.entries).toEqual([
      {
        speaker: '一条瑠璃',
        content: '「请、请不要用那种说法…！」\n\n她的声音陡然拔高了一点。',
        segments: [
          { type: 'dialogue', content: '「请、请不要用那种说法…！」' },
          { type: 'narration', content: '她的声音陡然拔高了一点。' },
        ],
      },
      {
        speaker: '佐伯翼',
        content: '「约好时间地点比较妥当。」',
        segments: [{ type: 'dialogue', content: '「约好时间地点比较妥当。」' }],
      },
      {
        speaker: '你',
        content: '「那就放学后见。」',
        segments: [{ type: 'dialogue', content: '「那就放学后见。」' }],
      },
    ])
  })

  it('separates spoken dialogue from narration while preserving their order', () => {
    expect(
      splitChatSegments(
        '走廊尽头的壁灯把影子拉长。\n「你来了。」\n她侧过身，把门推开。\n“外面下雨了。”',
      ),
    ).toEqual([
      { type: 'narration', content: '走廊尽头的壁灯把影子拉长。' },
      { type: 'dialogue', content: '「你来了。」' },
      { type: 'narration', content: '她侧过身，把门推开。' },
      { type: 'dialogue', content: '“外面下雨了。”' },
    ])
  })

  it('accepts the normalized speaker form produced by the built-in regex', () => {
    const normalized = applyRegexRules(sample, [createBuiltinChatRegex()], 'output')
    const transcript = parseChatTranscript(normalized)

    expect(normalized).toContain('一条瑠璃：')
    expect(normalized).not.toContain('【一条瑠璃】')
    expect(transcript?.entries.map((entry) => entry.speaker)).toEqual(['一条瑠璃', '佐伯翼', '你'])
  })

  it('consumes layout tags injected by output regex rules', () => {
    const rule = {
      ...createBuiltinChatRegex(),
      id: 'regex-layout-test',
      name: '标记台词',
      pattern: '^(我会回来。)$',
      replacement: '[[bubble]]$1[[/bubble]]',
    }
    const normalized = applyRegexRules('【沈砚】\n我会回来。', [rule], 'output')
    const transcript = parseChatTranscript(normalized)

    expect(transcript?.entries[0]?.content).toBe('我会回来。')
    expect(transcript?.entries[0]?.segments).toEqual([{ type: 'dialogue', content: '我会回来。' }])
  })

  it('keeps ordinary prose as one message', () => {
    expect(parseChatTranscript('她看向窗外，雨还没有停。')).toBeNull()
  })

  it('treats unquoted or quoted user lines as dialogue and parentheses as narration', () => {
    const transcript = parseChatTranscript(
      `【林澈】
放学后见。
（点了点头）
别迟到。

【一条瑠璃】
她没应声。`,
      '林澈',
    )

    expect(transcript?.entries[0]?.segments).toEqual([
      { type: 'dialogue', content: '放学后见。' },
      { type: 'narration', content: '（点了点头）' },
      { type: 'dialogue', content: '别迟到。' },
    ])
    expect(transcript?.entries[1]?.segments).toEqual([{ type: 'narration', content: '她没应声。' }])
  })

  it('supports curly quotes and keeps parentheses inside quoted user speech', () => {
    const quoted = parseChatTranscript(`【你】
“我到了。”
（收伞）
“我在（楼下）等你。”`)
    expect(quoted?.entries[0]?.segments).toEqual([
      { type: 'dialogue', content: '“我到了。”' },
      { type: 'narration', content: '（收伞）' },
      { type: 'dialogue', content: '“我在（楼下）等你。”' },
    ])
  })

  it('lets regex layout tags force narration or bubbles', () => {
    const transcript = parseChatTranscript(`【沈砚】
[[narration]]他低声念出“别回头”。[[/narration]]
[[bubble]]我会回来。[[/bubble]]`)

    expect(transcript?.entries[0]?.content).toBe('他低声念出“别回头”。\n我会回来。')
    expect(transcript?.entries[0]?.segments).toEqual([
      { type: 'narration', content: '他低声念出“别回头”。' },
      { type: 'dialogue', content: '我会回来。' },
    ])
  })

  it('supports layout tags around a complete speaker block', () => {
    const transcript = parseChatTranscript(`[[bubble]]【沈砚】
我会回来。
[[/bubble]]
【旁白】
她没应声。`)

    expect(transcript?.entries).toEqual([
      {
        speaker: '沈砚',
        content: '我会回来。',
        segments: [{ type: 'dialogue', content: '我会回来。' }],
      },
      {
        speaker: '旁白',
        content: '她没应声。',
        segments: [{ type: 'narration', content: '她没应声。' }],
      },
    ])
  })

  it('applies layout tags to unquoted user text as well', () => {
    const transcript = parseChatTranscript(
      `【林澈】
[[narration]]放学的铃声响起。[[/narration]]
[[bubble]]明天见。[[/bubble]]`,
      '林澈',
    )

    expect(transcript?.entries[0]?.segments).toEqual([
      { type: 'narration', content: '放学的铃声响起。' },
      { type: 'dialogue', content: '明天见。' },
    ])
  })

  it('recognizes the configured user and common user labels', () => {
    expect(isUserSpeaker('林澈', '林澈')).toBe(true)
    expect(isUserSpeaker('你', '')).toBe(true)
    expect(isUserSpeaker('{{user}}', '')).toBe(true)
    expect(isUserSpeaker('一条瑠璃', '林澈')).toBe(false)
    expect(formatSpeakerLabel('{{user}}', '林澈', '沈砚')).toBe('林澈')
  })
})
