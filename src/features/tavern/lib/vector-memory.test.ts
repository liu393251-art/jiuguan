import { describe, expect, it } from 'vitest'

import type { ChatMessage } from '../types'
import {
  buildPersistedVectorMemoryLine,
  buildVectorMemoryLine,
  createVectorMemoryDrafts,
  recallPersistedMemories,
  recallVectorMemories,
} from './vector-memory'
import type { VectorMemoryEntry } from '../types'

function message(id: string, content: string): ChatMessage {
  return {
    id,
    sessionId: 'session',
    role: 'user',
    content,
    status: 'complete',
    createdAt: '2026-11-24T00:00:00.000Z',
  }
}

describe('vector memory', () => {
  it('recalls semantically related older messages instead of only recent ones', () => {
    const messages = [
      message('1', '我们约好周日去看海边灯塔。'),
      message('2', '今天晚饭想吃番茄鸡蛋面。'),
      message('3', '灯塔下面有一家旧书店。'),
    ]
    expect(recallVectorMemories(messages, '还记得海边那座灯塔吗？', 1)[0]?.id).toBe('1')
  })

  it('turns the recalled message into a readable memory line', () => {
    const messages = [message('1', '你答应过要带我去看冬天的海。')]
    expect(buildVectorMemoryLine(messages, '冬天看海')).toContain('冬天的海')
  })

  it('persists embeddings that can be recalled from another session', () => {
    const drafts = createVectorMemoryDrafts(
      [message('1', '我们在旧书店约好，下次带一盏蓝色台灯。')],
      'loadout-1',
      'chat-model',
    )
    const stored: VectorMemoryEntry[] = drafts.map((draft, index) => ({
      ...draft,
      id: String(index + 1),
      createdAt: '2026-11-24T00:00:00.000Z',
    }))
    expect(recallPersistedMemories(stored, '还记得那盏蓝色台灯吗？', 1)[0]?.content).toContain(
      '蓝色台灯',
    )
    expect(buildPersistedVectorMemoryLine(stored, '蓝色台灯')).toContain('长期记忆')
  })

  it('indexes conversations beyond the old recent-message window without dropping the first turn', () => {
    const messages = Array.from({ length: 120 }, (_, index) =>
      message(
        `message-${index}`,
        index === 0
          ? '我们在旧钟楼约定，每年初雪都要一起回来。'
          : `这是后来发生的第 ${index + 1} 条普通对话。`,
      ),
    )
    const drafts = createVectorMemoryDrafts(messages, 'loadout-long', 'local-semantic-128')
    const stored: VectorMemoryEntry[] = drafts.map((draft, index) => ({
      ...draft,
      id: `memory-${index}`,
      createdAt: '2026-11-24T00:00:00.000Z',
    }))

    expect(stored).toHaveLength(120)
    expect(stored[0]?.embeddingSource).toBe('local')
    expect(recallPersistedMemories(stored, '旧钟楼初雪约定', 1)[0]?.sourceMessageId).toBe(
      'message-0',
    )
  })
})
