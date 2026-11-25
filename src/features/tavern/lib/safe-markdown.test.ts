import { describe, expect, it } from 'vitest'

import {
  normalizeModelText,
  splitStreamingMarkdown,
  stripChatArtifacts,
} from './safe-markdown-text'

describe('safe model text', () => {
  it('removes script, style and iframe content entirely', () => {
    const text = normalizeModelText(
      '<script>alert(1)</script>正文<style>body{display:none}</style><iframe src="x"></iframe>',
    )
    expect(text).toBe('正文')
  })

  it('converts common HTML line breaks into safe text', () => {
    expect(normalizeModelText('第一段<br>第二段</p><b>粗体</b>')).toBe('第一段\n第二段\n粗体')
  })

  it('removes a trailing JSON patch array while preserving story text', () => {
    const text = '正文保留。\n[{"op":"replace","path":"/世界/当前时间","value":"深夜"}]'
    expect(stripChatArtifacts(text)).toBe('正文保留。')
  })

  it('removes a truncated patch array from a stopped stream', () => {
    const text = [
      '正文保留。',
      '[',
      '{ "op": "replace", "path": "/世界/当前时间", "value": "21:40" },',
      '{ "op"',
    ].join('\n')
    expect(stripChatArtifacts(text)).toBe('正文保留。')
  })

  it('removes a trailing state-update brief before a truncated patch', () => {
    const text = [
      '正文保留。',
      '',
      'Time passed: about 10 minutes of dialogue and clearing the room.',
      '- Dramatic updates allowed: yes, scene shift within the same location.',
      '- Update time to 21:40 and refresh the mood record.',
      '',
      '[',
      '{ "op": "replace", "path": "/世界/当前时间", "value": "21:40" },',
      '{ "op"',
    ].join('\n')
    expect(stripChatArtifacts(text)).toBe('正文保留。')
  })

  it('removes patch arrays that use escaped Markdown line breaks', () => {
    const text = [
      '正文保留。',
      '[\\',
      '{ "op": "replace", "path": "/世界/当前时间", "value": "21:40" },\\',
      '{ "op": "replace", "path": "/世界/地点", "value": "KTV 包间" }\\',
      ']',
    ].join('\n')
    expect(stripChatArtifacts(text)).toBe('正文保留。')
  })

  it('removes fenced JSON patch blocks and keeps surrounding text', () => {
    const text = '前文。\n```json\n[{"op":"replace","path":"/世界/天气","value":"雨"}]\n```\n后文。'
    expect(stripChatArtifacts(text)).toBe('前文。\n\n后文。')
  })

  it('removes an unclosed fenced patch block', () => {
    const text = '正文保留。\n```json\n[{"op":"replace","path":"/世界/天气","value":"雨"}'
    expect(stripChatArtifacts(text)).toBe('正文保留。')
  })

  it('keeps ordinary brackets and code blocks', () => {
    const text = '[剧情] 他抬头。\n```ts\nconst value = [1, 2]\n```'
    expect(stripChatArtifacts(text)).toBe(text)
  })

  it('keeps an unmatched story bracket that does not look like a patch', () => {
    const text = '她停在门口：[剧情还没写完'
    expect(stripChatArtifacts(text)).toBe(text)
  })

  it('keeps role-card speaker placeholders readable', () => {
    expect(
      normalizeModelText('<user>抬头看向<char>。{{user}}和{{char}}都在。', {
        user: '你',
        char: '沈砚',
      }),
    ).toBe('你抬头看向沈砚。你和沈砚都在。')

    expect(
      normalizeModelText('喂，<user>你疯啦？', {
        user: '你',
        char: '沈砚',
      }),
    ).toBe('喂，你疯啦？')
  })

  it('keeps a stable streaming prefix and reparses only the moving tail', () => {
    const stable = `${'前文。'.repeat(80)}\n\n`
    const tail = '后文。'.repeat(120)
    const parts = splitStreamingMarkdown(`${stable}${tail}`, 120)

    expect(parts.stable).toBe(stable)
    expect(parts.tail).toBe(tail)
  })

  it('normalizes CRLF before choosing a streaming boundary', () => {
    const stable = `${'前文。'.repeat(80)}\r\n\r\n`
    const tail = '后文。'.repeat(120)
    const parts = splitStreamingMarkdown(`${stable}${tail}`, 120)

    expect(parts.stable).toBe(stable.replace(/\r\n/g, '\n'))
    expect(parts.tail).toBe(tail)
  })

  it('does not split a streaming code block in the middle', () => {
    const intro = '开场。\n\n'
    const openCode = `\`\`\`ts\n${'const value = 1\n'.repeat(80)}\n\n${'const other = 2\n'.repeat(80)}`
    const parts = splitStreamingMarkdown(`${intro}${openCode}`, 120)

    expect(parts.stable).toBe(intro)
    expect(parts.tail).toBe(openCode)
  })
})
