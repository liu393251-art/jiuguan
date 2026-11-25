import { describe, expect, it } from 'vitest'

import { parseChatLayout, stripChatLayoutMarkers } from './chat-layout'

describe('chat layout markers', () => {
  it('removes tags and reports explicit layout ranges', () => {
    expect(parseChatLayout('前[[bubble]]中[[/bubble]]后')).toEqual({
      text: '前中后',
      ranges: [{ type: 'dialogue', start: 1, end: 2 }],
    })
  })

  it('supports nested narration and dialogue ranges', () => {
    expect(parseChatLayout('[[narration]]A[[bubble]]B[[/bubble]]C[[/narration]]')).toEqual({
      text: 'ABC',
      ranges: [
        { type: 'narration', start: 0, end: 1 },
        { type: 'dialogue', start: 1, end: 2 },
        { type: 'narration', start: 2, end: 3 },
      ],
    })
  })

  it('keeps an unclosed marker effective to the end', () => {
    expect(parseChatLayout('[[narration]]她转过身。')).toEqual({
      text: '她转过身。',
      ranges: [{ type: 'narration', start: 0, end: 5 }],
    })
  })

  it('accepts Chinese aliases and strips all known tags', () => {
    expect(stripChatLayoutMarkers('[[气泡]]「走吧。」[[/气泡]][[旁白]]她点头。[[/旁白]]')).toBe(
      '「走吧。」她点头。',
    )
  })
})
