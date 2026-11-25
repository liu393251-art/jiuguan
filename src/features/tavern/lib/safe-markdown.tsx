import { memo, useMemo, type ReactNode } from 'react'

import {
  normalizeModelText,
  splitStreamingMarkdown,
  stripChatArtifacts,
} from './safe-markdown-text'

const INLINE_TOKEN = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*|\[[^\]]+\]\([^)]+\))/g

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let lastIndex = 0
  const matches = [...text.matchAll(INLINE_TOKEN)]

  matches.forEach((match, index) => {
    const raw = match[0]
    const start = match.index ?? 0
    if (start > lastIndex) nodes.push(text.slice(lastIndex, start))

    const key = `${keyPrefix}-i-${index}`
    if (raw.startsWith('**')) {
      nodes.push(<strong key={key}>{raw.slice(2, -2)}</strong>)
    } else if (raw.startsWith('`')) {
      nodes.push(<code key={key}>{raw.slice(1, -1)}</code>)
    } else if (raw.startsWith('*')) {
      nodes.push(<em key={key}>{raw.slice(1, -1)}</em>)
    } else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(raw)
      if (link && /^https?:\/\//i.test(link[2])) {
        nodes.push(
          <a key={key} href={link[2]} target="_blank" rel="noreferrer noopener">
            {link[1]}
          </a>,
        )
      } else {
        nodes.push(link?.[1] ?? raw)
      }
    }

    lastIndex = start + raw.length
  })

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
  return nodes.length > 0 ? nodes : [text]
}

type Block =
  | { type: 'paragraph' | 'quote'; lines: string[] }
  | { type: 'heading'; level: number; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'code'; text: string }

function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) {
      index += 1
      continue
    }

    if (line.trimStart().startsWith('```')) {
      const codeLines: string[] = []
      index += 1
      while (index < lines.length && !lines[index].trimStart().startsWith('```')) {
        codeLines.push(lines[index])
        index += 1
      }
      index += 1
      blocks.push({ type: 'code', text: codeLines.join('\n') })
      continue
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line)
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] })
      index += 1
      continue
    }

    if (/^\s*>\s?/.test(line)) {
      const quoteLines: string[] = []
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/, ''))
        index += 1
      }
      blocks.push({ type: 'quote', lines: quoteLines })
      continue
    }

    const listMatch = /^\s*([-*+]|\d+\.)\s+(.*)$/.exec(line)
    if (listMatch) {
      const ordered = /\d/.test(listMatch[1])
      const items: string[] = []
      while (index < lines.length) {
        const item = /^\s*([-*+]|\d+\.)\s+(.*)$/.exec(lines[index])
        if (!item) break
        items.push(item[2])
        index += 1
      }
      blocks.push({ type: 'list', ordered, items })
      continue
    }

    const paragraphLines: string[] = []
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^\s*>\s?/.test(lines[index]) &&
      !/^#{1,4}\s+/.test(lines[index]) &&
      !/^\s*([-*+]|\d+\.)\s+/.test(lines[index]) &&
      !lines[index].trimStart().startsWith('```')
    ) {
      paragraphLines.push(lines[index])
      index += 1
    }
    if (paragraphLines.length > 0) blocks.push({ type: 'paragraph', lines: paragraphLines })
  }

  return blocks
}

function renderBlock(block: Block, key: string): ReactNode {
  if (block.type === 'code') {
    return (
      <pre key={key}>
        <code>{block.text}</code>
      </pre>
    )
  }
  if (block.type === 'heading') {
    const level = Math.min(block.level, 3)
    const text = renderInline(block.text, key)
    if (level === 1) return <h1 key={key}>{text}</h1>
    if (level === 2) return <h2 key={key}>{text}</h2>
    return <h3 key={key}>{text}</h3>
  }
  if (block.type === 'quote') {
    return (
      <blockquote key={key}>
        {block.lines.map((line, lineIndex) => (
          <p key={`${key}-q-${lineIndex}`}>{renderInline(line, `${key}-q-${lineIndex}`)}</p>
        ))}
      </blockquote>
    )
  }
  if (block.type === 'list') {
    const items = block.items.map((item, itemIndex) => (
      <li key={`${key}-l-${itemIndex}`}>{renderInline(item, `${key}-l-${itemIndex}`)}</li>
    ))
    return block.ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>
  }
  return (
    <p key={key}>
      {block.lines.map((line, lineIndex) => (
        <span key={`${key}-p-${lineIndex}`}>
          {lineIndex > 0 && <br />}
          {renderInline(line, `${key}-p-${lineIndex}`)}
        </span>
      ))}
    </p>
  )
}

const RenderedBlocks = memo(function RenderedBlocks({
  blocks,
  keyPrefix,
}: {
  blocks: Block[]
  keyPrefix: string
}) {
  return <>{blocks.map((block, index) => renderBlock(block, `${keyPrefix}-${index}`))}</>
})

export const SafeMarkdown = memo(function SafeMarkdown({
  content,
  characterName,
  streaming = false,
  sanitized = false,
}: {
  content: string
  characterName?: string
  streaming?: boolean
  sanitized?: boolean
}) {
  const normalized = useMemo(
    () =>
      normalizeModelText(sanitized ? content : stripChatArtifacts(content), {
        user: '你',
        char: characterName,
      }),
    [characterName, content, sanitized],
  )
  const parts = useMemo(
    () => (streaming ? splitStreamingMarkdown(normalized) : { stable: '', tail: normalized }),
    [normalized, streaming],
  )
  const stableBlocks = useMemo(
    () => (parts.stable ? parseBlocks(parts.stable) : []),
    [parts.stable],
  )
  const tailBlocks = useMemo(() => parseBlocks(parts.tail), [parts.tail])

  return (
    <div className="story-prose">
      <RenderedBlocks blocks={stableBlocks} keyPrefix="s" />
      <RenderedBlocks blocks={tailBlocks} keyPrefix="t" />
    </div>
  )
})
