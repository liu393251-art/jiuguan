import { z } from 'zod'

export const generationSettingsSchema = z.object({
  temperature: z.number().min(0).max(2),
  topP: z.number().min(0).max(1),
  maxTokens: z.number().int().min(64).max(8192),
  presencePenalty: z.number().min(-2).max(2),
  frequencyPenalty: z.number().min(-2).max(2),
})

export const defaultGeneration: GenerationSettings = {
  temperature: 0.86,
  topP: 0.92,
  maxTokens: 900,
  presencePenalty: 0.24,
  frequencyPenalty: 0.2,
}

export const characterSourceSchema = z.enum(['seed', 'import', 'user'])

export const characterSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  tagline: z.string(),
  description: z.string(),
  personality: z.string(),
  scenario: z.string(),
  firstMessage: z.string(),
  exampleDialogue: z.string(),
  tags: z.array(z.string()),
  avatarTone: z.number().int().min(0).max(4),
  source: characterSourceSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
})

export const characterInputSchema = z.object({
  name: z.string().trim().min(1, '请填写角色名。').max(40, '角色名不超过 40 个字。'),
  tagline: z.string().trim().max(60, '一句话介绍不超过 60 个字。'),
  description: z.string().trim(),
  personality: z.string().trim(),
  scenario: z.string().trim(),
  firstMessage: z.string().trim(),
  exampleDialogue: z.string().trim(),
  tags: z.array(z.string().trim().min(1)).max(8),
  avatarTone: z.number().int().min(0).max(4),
})

export const presetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  generation: generationSettingsSchema,
  promptSummary: z.string(),
  source: characterSourceSchema,
  createdAt: z.string().min(1),
})

export const presetInputSchema = z.object({
  name: z.string().trim().min(1, '请填写预设名称。').max(40),
  description: z.string().trim().max(160),
  generation: generationSettingsSchema,
  promptSummary: z.string().trim(),
})

export const worldEntryInputSchema = z.object({
  keys: z.array(z.string().trim().min(1)),
  content: z.string().trim().min(1, '请填写条目内容。'),
  constant: z.boolean(),
  order: z.number().int().min(0).max(999),
  enabled: z.boolean(),
})

export const worldEntrySchema = worldEntryInputSchema.extend({
  id: z.string().min(1),
})

export const worldBookInputSchema = z.object({
  name: z.string().trim().min(1, '请填写世界书名称。').max(40),
  description: z.string().trim().max(160),
  entries: z.array(worldEntryInputSchema).min(1, '至少添加一个世界书条目。'),
})

export const worldBookSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  entries: z.array(worldEntrySchema),
  source: characterSourceSchema,
  createdAt: z.string().min(1),
})

export const regexScopeSchema = z.enum(['input', 'output', 'both'])

export const regexRuleInputSchema = z.object({
  name: z.string().trim().min(1, '请填写规则名称。').max(40),
  pattern: z.string().min(1, '请填写正则表达式。'),
  replacement: z.string(),
  flags: z.string(),
  scope: regexScopeSchema,
  enabled: z.boolean(),
})

export const regexRuleSchema = regexRuleInputSchema.extend({
  id: z.string().min(1),
  packId: z.string().min(1).nullable().default(null),
  packName: z.string().min(1).nullable().default(null),
})

export const memoryModeSchema = z.enum(['off', 'recent', 'summary', 'compressed', 'vector'])

export const memoryProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  mode: memoryModeSchema,
  summaryPrompt: z.string(),
  maxMessages: z.number().int().min(4).max(80),
  apiProfileId: z.string().nullable().default(null),
})

export const loadoutSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  characterId: z.string().min(1),
  presetId: z.string().nullable(),
  worldBookIds: z.array(z.string()),
  regexRuleIds: z.array(z.string()),
  memoryMode: memoryModeSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
})

export const loadoutInputSchema = z.object({
  name: z.string().trim().min(1, '请填写配套名称。').max(40),
  characterId: z.string().min(1, '请选择角色卡。'),
  presetId: z.string().nullable(),
  worldBookIds: z.array(z.string()),
  regexRuleIds: z.array(z.string()),
  memoryMode: memoryModeSchema,
})

const comboBaseSchema = z.object({
  name: z.string().trim().min(1, '请填写组合名称。'),
  description: z.string().trim(),
  presetId: z.string().nullable(),
  regexRuleIds: z.array(z.string()),
})

export const comboInputSchema = comboBaseSchema.refine(
  (value) => Boolean(value.presetId) || value.regexRuleIds.length > 0,
  {
    message: '组合至少需要带一个预设或一条正则。',
  },
)

export const comboSchema = comboBaseSchema.extend({
  id: z.string().min(1),
  coverImage: z.string().nullable().default(null),
  source: characterSourceSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
})

export const vectorMemoryEntrySchema = z.object({
  id: z.string().min(1),
  scopeId: z.string().min(1),
  sessionId: z.string().min(1),
  sourceMessageId: z.string().min(1),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  embedding: z.array(z.number()),
  fallbackEmbedding: z.array(z.number()).optional(),
  model: z.string(),
  embeddingSource: z.enum(['local', 'api']).default('local'),
  embeddingModel: z.string().default('local-semantic-128'),
  createdAt: z.string().min(1),
})

export const userIdentitySchema = z.object({
  displayName: z.string().trim().max(30),
  persona: z.string().trim().max(500),
})

export const appearanceSettingsSchema = z.object({
  defaultChatFontSize: z.number().int().min(13).max(22),
})

export const apiProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(40),
  provider: z.literal('openai-compatible'),
  baseUrl: z.string().trim().max(500),
  model: z.string().trim().max(120),
  apiKey: z.string().trim().max(500),
})

export const apiProfileInputSchema = apiProfileSchema.omit({ id: true })

export const chatSessionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  loadoutId: z.string().nullable().default(null),
  characterId: z.string().min(1),
  apiProfileId: z.string().nullable().default(null),
  presetId: z.string().nullable(),
  worldBookIds: z.array(z.string()),
  regexRuleIds: z.array(z.string()),
  memoryProfileId: z.string().nullable(),
  memoryMode: memoryModeSchema,
  memorySummary: z.string(),
  generation: generationSettingsSchema,
  fontSize: z.number().int().min(13).max(22),
  lastMessagePreview: z.string(),
  messageCount: z.number().int().nonnegative(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
})

export const chatSessionPatchSchema = z.object({
  title: z.string().trim().min(1).max(60).optional(),
  loadoutId: z.string().nullable().optional(),
  characterId: z.string().min(1).optional(),
  apiProfileId: z.string().nullable().optional(),
  presetId: z.string().nullable().optional(),
  worldBookIds: z.array(z.string()).optional(),
  regexRuleIds: z.array(z.string()).optional(),
  memoryProfileId: z.string().nullable().optional(),
  memoryMode: memoryModeSchema.optional(),
  memorySummary: z.string().optional(),
  generation: generationSettingsSchema.optional(),
  fontSize: z.number().int().min(13).max(22).optional(),
})

export const chatMessageSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  status: z.enum(['complete', 'streaming', 'stopped', 'error']),
  createdAt: z.string().min(1),
})

export const sendMessageInputSchema = z.object({
  content: z.string().trim().min(1, '先写点什么再发送。').max(4000, '单条消息不超过 4000 字。'),
})

export const messagePatchSchema = z.object({
  content: z.string().trim().min(1, '消息不能为空。').max(4000),
})

export const stopMessageInputSchema = z.object({
  content: z.string().max(8000),
})

export const charactersResponseSchema = z.object({ items: z.array(characterSchema) })
export const presetsResponseSchema = z.object({ items: z.array(presetSchema) })
export const worldBooksResponseSchema = z.object({ items: z.array(worldBookSchema) })
export const regexRulesResponseSchema = z.object({ items: z.array(regexRuleSchema) })
export const chatsResponseSchema = z.object({ items: z.array(chatSessionSchema) })
export const loadoutsResponseSchema = z.object({ items: z.array(loadoutSchema) })
export const combosResponseSchema = z.object({ items: z.array(comboSchema) })

export const messagesResponseSchema = z.object({
  items: z.array(chatMessageSchema),
  hasMore: z.boolean(),
})

export const sendMessageResponseSchema = z.object({
  userMessage: chatMessageSchema,
  assistantMessage: chatMessageSchema,
})

export const chatGenerationContextSchema = z.object({
  session: chatSessionSchema,
  character: characterSchema,
  preset: presetSchema.nullable(),
  worldBooks: z.array(worldBookSchema),
  regexRules: z.array(regexRuleSchema),
  identity: userIdentitySchema,
  memoryProfile: memoryProfileSchema,
  messages: z.array(chatMessageSchema),
  memoryRecall: z.string(),
})

export const regenerateResponseSchema = z.object({
  assistantMessage: chatMessageSchema,
  removedMessageId: z.string(),
})

export const completeMessageInputSchema = z.object({
  content: z.string().max(16000),
  status: z.enum(['complete', 'stopped', 'error']),
})

export const settingsSchema = z.object({
  apiProfiles: z.array(apiProfileSchema).default([]),
  memoryProfile: memoryProfileSchema,
  identity: userIdentitySchema,
  appearance: appearanceSettingsSchema,
})

export const settingsPatchSchema = z.object({
  apiProfiles: z.array(apiProfileSchema).optional(),
  memoryProfile: memoryProfileSchema.optional(),
  identity: userIdentitySchema.optional(),
  appearance: appearanceSettingsSchema.optional(),
})

export const importKindSchema = z.enum(['character', 'preset', 'worldbook', 'regex', 'pack'])

export const importRequestSchema = z.object({
  kind: importKindSchema,
  name: z.string().min(1),
  payload: z.unknown(),
})

export const importResultSchema = z.object({
  ok: z.boolean(),
  kind: importKindSchema,
  name: z.string(),
  message: z.string(),
  id: z.string().optional(),
  loadoutId: z.string().optional(),
  count: z.number().int().nonnegative().optional(),
})

export const exportResponseSchema = z.object({
  exportedAt: z.string().min(1),
  state: z.record(z.string(), z.unknown()),
})

export const tavernStateSchema = z.object({
  characters: z.array(characterSchema),
  loadouts: z.array(loadoutSchema).default([]),
  combos: z.array(comboSchema).default([]),
  presets: z.array(presetSchema),
  worldBooks: z.array(worldBookSchema),
  regexRules: z.array(regexRuleSchema),
  sessions: z.array(chatSessionSchema),
  messages: z.record(z.string(), z.array(chatMessageSchema)),
  vectorMemories: z.array(vectorMemoryEntrySchema).default([]),
  settings: settingsSchema,
})

export type GenerationSettings = z.infer<typeof generationSettingsSchema>
export type CharacterSource = z.infer<typeof characterSourceSchema>
export type Character = z.infer<typeof characterSchema>
export type CharacterInput = z.infer<typeof characterInputSchema>
export type Preset = z.infer<typeof presetSchema>
export type PresetInput = z.infer<typeof presetInputSchema>
export type WorldEntryInput = z.infer<typeof worldEntryInputSchema>
export type WorldEntry = z.infer<typeof worldEntrySchema>
export type WorldBook = z.infer<typeof worldBookSchema>
export type WorldBookInput = z.infer<typeof worldBookInputSchema>
export type RegexScope = z.infer<typeof regexScopeSchema>
export type RegexRule = z.infer<typeof regexRuleSchema>
export type RegexRuleInput = z.infer<typeof regexRuleInputSchema>
export type MemoryMode = z.infer<typeof memoryModeSchema>
export type MemoryProfile = z.infer<typeof memoryProfileSchema>
export type Loadout = z.infer<typeof loadoutSchema>
export type LoadoutInput = z.infer<typeof loadoutInputSchema>
export type Combo = z.infer<typeof comboSchema>
export type ComboInput = z.infer<typeof comboInputSchema>
export type VectorMemoryEntry = z.infer<typeof vectorMemoryEntrySchema>
export type UserIdentity = z.infer<typeof userIdentitySchema>
export type AppearanceSettings = z.infer<typeof appearanceSettingsSchema>
export type ApiProfile = z.infer<typeof apiProfileSchema>
export type ApiProfileInput = z.infer<typeof apiProfileInputSchema>
export type ChatSession = z.infer<typeof chatSessionSchema>
export type ChatSessionPatch = z.infer<typeof chatSessionPatchSchema>
export type ChatMessage = z.infer<typeof chatMessageSchema>
export type ChatSendFeedback = {
  warning?: string
  error?: string
}
export type ChatGenerationContext = z.infer<typeof chatGenerationContextSchema>
export type CompleteMessageInput = z.infer<typeof completeMessageInputSchema>
export type SendMessageInput = z.infer<typeof sendMessageInputSchema>
export type Settings = z.infer<typeof settingsSchema>
export type SettingsPatch = z.infer<typeof settingsPatchSchema>
export type ImportKind = z.infer<typeof importKindSchema>
export type ImportRequest = z.infer<typeof importRequestSchema>
export type ImportResult = z.infer<typeof importResultSchema>
export type TavernState = z.infer<typeof tavernStateSchema>
