# 小白酒馆 · MVP 产品 Brief

## 1. 产品

- 产品名称：小白酒馆（Xiaobai Tavern）
- 一句话定位：一个本地优先、移动优先的 AI 角色叙事酒馆，让用户从角色卡开始，走进一段可保存、可调整、可继续的对话。
- 目标用户：喜欢角色扮演、互动小说、SillyTavern 角色卡与深夜陪伴式对话的中文用户。
- 核心场景：导入角色卡；选择角色开始对话；在聊天中调整本段对话的预设、世界书、记忆和正则；回到对话列表继续或批量整理。
- 这一版完成标准：角色库、角色详情、对话列表、聊天、会话设置、设置中心、导入区全部可走通；可保存多条真实 OpenAI 兼容 API 连接并完成流式回复；可在聊天中通过独立生图 API 生成图片并保存到本机；向量记忆在本机自动索引全部历史、无需云端数据库；刷新后数据保留；移动端 390px 与桌面 1440px 可读。

## 2. 首版功能

1. 角色库与角色详情：搜索、标签筛选、导入、新建、编辑、复制资料、删除。
2. 对话列表：最近对话、搜索、新建对话、长按/复选框多选、全选、批量删除确认。
3. 聊天：安全 Markdown 消息、真实 API 流式回复、微信式多人气泡、酒馆式多来源生图与图片消息、消息级原文生图、停止、重试、复制、编辑、字号快捷调整、分批加载与回到最新。
4. 会话级设置：角色卡、预设、世界书、记忆模式与摘要、正则开关、生成参数、聊天字号，全部只覆盖当前对话。
5. 设置：多聊天 API 连接、模型获取与下拉选择、连接测试、独立生图 API、身份人设、记忆连接选择、外观、数据导入导出与重置。
6. 导入区：角色卡、预设、世界书和正则统一管理；右上角导入文件或新建；多文件导入自动识别 PNG/JSON 角色卡、SillyTavern 预设、世界书、正则。同一来源的正则按包展示，进入包内可逐条开关或编辑。

本版暂不纳入：账号体系、云同步、语音、多人房间、插件市场。

## 3. 页面与流程

| 页面     | 路径                 | 目的           | 关键动作                                             |
| -------- | -------------------- | -------------- | ---------------------------------------------------- |
| 对话首页 | `/`                  | 继续最近对话   | 搜索、新建、长按多选、批量删除                       |
| 角色库   | `/characters`        | 浏览角色       | 搜索、标签筛选、新建、导入入口                       |
| 角色详情 | `/characters/:id`    | 查看完整设定   | 开始对话、复制、编辑、删除                           |
| 聊天     | `/chat/:id`          | 进行叙事对话   | 发送、流式回复、生图、停止、重试、复制、编辑、调字号 |
| 对话设置 | `/chat/:id/settings` | 覆盖当前会话   | 角色、预设、世界书、记忆、正则、参数、字号           |
| 设置中心 | `/settings`          | 本地偏好与数据 | 聊天 API、生图 API、身份、记忆、外观、导入导出、重置 |
| 导入文件 | `/import/files`      | 批量识别入库   | 拖拽、覆盖类型、跳过、逐项结果、ZIP 配套包           |
| 导入区   | `/import`            | 管理内容与角色 | 角色卡、预设、世界书、正则的导入与增删改             |

核心路径：

```text
对话首页 -> 新建聊天 -> 选择角色或配套 -> 聊天 -> 打开对话设置 -> 调整 API/预设/世界书/记忆 -> 保存 -> 继续对话 -> 刷新仍保留
```

导入路径：

```text
左侧导入区 -> 导入文件或新建 -> 自动识别 -> 覆盖类型/跳过 -> 逐项导入 -> 角色库或内容库出现新条目

左侧导入区 -> 导入配套 -> 上传 ZIP -> 自动识别角色卡/预设/世界书/正则 -> 确认导入 -> 资源与配套一次创建
```

## 4. 数据实体

- `Character`：`id/name/tagline/description/personality/scenario/firstMessage/exampleDialogue/tags/avatarTone/source/createdAt/updatedAt`
- `Preset`：`id/name/description/generation/promptSummary/source/createdAt`
- `WorldBook`：`id/name/description/entries/source/createdAt`；`WorldEntry` 含 `keys/content/constant/order/enabled`
- `MemoryProfile`：`id/name/description/mode/summaryPrompt/maxMessages/apiProfileId`
- `RegexRule`：`id/name/pattern/replacement/flags/scope/enabled`
- `ApiProfile`：`id/name/provider/baseUrl/model/apiKey`；可保存多条，Key 只保存在当前设备。
- `ChatSession`：`id/title/loadoutId/characterId/apiProfileId/presetId/worldBookIds/regexRuleIds/memoryProfileId/memoryMode/memorySummary/generation/fontSize/lastMessagePreview/messageCount/createdAt/updatedAt`
- `ChatMessage`：`id/sessionId/role/content/status/createdAt`；`status` 为 `complete|streaming|stopped|error`
- `VectorMemoryEntry`：`id/scopeId/sessionId/sourceMessageId/role/content/embedding/fallbackEmbedding/model/embeddingSource/embeddingModel/createdAt`；全部落在本机 IndexedDB，不使用云端向量数据库。
- `ImportJob/ImportResult`：导入在浏览器内完成解析；API 返回每个文件的 `ok/kind/name/message/id/count`。

会话设置是**快照**，不在渲染时从全局设置隐式回填。新对话创建时复制全局默认值；已有对话只修改自己的字段。

## 5. 数据流与边界

```text
页面 / components
  -> src/features/tavern/api.ts
  -> src/services/http.ts
  -> /api/...
  -> src/mocks/handlers/tavern.ts
  -> src/mocks/mock-db.ts
  -> src/mocks/fixtures/tavern.ts
```

- 页面不读 fixtures、不直接 localStorage、不自己 fetch。
- 所有 API 输入输出经过 Zod。
- localStorage key：`xiaobai.tavern.v3`，带版本号；设置页可清空。长期向量库单独存放在 IndexedDB `xiaobai.tavern.vectors`，不占用 localStorage 配额；首次启动会把旧 localStorage 里的 `vectorMemories` 自动迁入并清空旧字段。
- 流式回复：本地 `POST /api/chats/:id/messages` 先保存用户消息与 assistant 占位；随后读取当前会话上下文，向所选连接 `POST {baseUrl}/chat/completions` 并解析 SSE。前端用缓冲区 + `requestAnimationFrame` 合并渲染。
- 向量记忆：消息完成、编辑、切换到向量模式或读取生成上下文时，自动把全部已完成消息写入 IndexedDB 向量索引，不按 `maxMessages` 淘汰。向量以 `Float32Array` 保存，统计与召回使用游标扫描，避免一次性把整库读进内存；并尽力调用 `navigator.storage.persist()` 降低系统回收概率。默认使用本机向量；显式选择记忆 API 后尝试 `POST {baseUrl}/embeddings`，接口不可用时自动回退本机向量。
- 浏览器直接请求第三方接口会受 CORS 限制；桌面端与 Android 端通过 `@tauri-apps/plugin-http` 发起原生请求。API Key 由本机持有，不经过应用服务器。

## 6. 导入规则

- PNG：读取 tEXt / iTXt；优先 `ccv3`，回退 `chara`；Base64 解码后按 JSON 角色卡解析。
- JSON 角色卡：兼容 `data` 包裹与 v1/v2/v3 常见字段 `name/description/personality/scenario/first_mes/mes_example/tags/character_book`。
- 预设：识别 Chat Completion / Text Completion / Instruct 的 `temperature/top_p/max_tokens/prompts/prompt_order/settings` 结构；选到预设时绝不创建角色。
- 世界书：识别 `entries` 对象或数组、`keys/key`、`content/entry`、`constant`、`order`；可导入为全局世界书。
- 正则：兼容 `findRegex/pattern`、`replaceString/replacement`、`scriptName/name`、`disabled` 等常见导出。
- ZIP 配套包：浏览器内解压，按内容识别角色卡、预设、世界书和正则；必须且只能有一张角色卡。确认后一次性创建角色、内容资源和绑定好的配套，任一已识别资源失败则整包不写入。清单支持 `manifest.json` / `pack.json` 的配套名、说明和记忆方式。
- 未知 JSON：标记“无法识别”，不猜测入库；用户可以手动覆盖类型或跳过。
- 多文件：逐项调用 `/api/import`，单个失败不影响其他文件；每项显示识别类型、名称、目标库、成功/跳过/失败原因。
- 角色卡带 `character_book` 时，同时创建 `<角色名> · 角色书` 世界书。

## 7. 渲染与性能

- 不使用 `dangerouslySetInnerHTML`。模型内容先剥离 script/style/iframe 与 HTML 标签，再渲染为受控 Markdown（段落、标题、引用、列表、粗斜体、行内/代码块、http(s) 链接）。
- 消息组件 `memo`，key 使用消息 id；最近 40 条首屏渲染，可“加载更早”。累计超过 80 条后，才对视口外较早的消息启用 `content-visibility`，最近 12 条保持完整渲染，避免吸底位置跳动。
- 流式 token 进入 ref 缓冲，按 `requestAnimationFrame` 合并到状态并限制在约 30fps；Markdown 把稳定段落缓存为前缀，只重新解析持续增长的尾段；只有当前 assistant 消息内容变化。
- 打开会话时在首帧前定位到底部；发送后输入框立即清空。流式增长、输入框高度和视口变化时保持吸底，只有用户确实上翻才解除，并显示“回到最新消息”按钮。
- 聊天顶部显示“安全文本渲染 · 最近 40 条分批加载”的真实状态。
- 向量模式不套用最近消息条数：当前对话完整进入请求，旧会话从本机向量库按语义召回；其他记忆模式仍使用配置的最近条数。
- 助手回复按 `【说话者】` 标签拆分：`「」`、`“”` 或用户直接输入的正文显示为气泡，用户靠右、角色靠左；动作、心理和环境描写（包括用户用 `（）` 写的内容）改为无气泡、无头像的居中正文，字号比台词略大。同一角色块内的段落顺序保持不变；输入框上方提供 `“”` 与 `（）` 一键插入。
- 内置正则“微信式对话气泡”把独占一行的 `【角色名】` 规范成聊天标签；新角色默认配套自动勾选。
- SillyTavern 预设按 `prompt_order` 保留启用提示词，预设提示可要求模型在轮到用户时停止。

## 8. 视觉方向

- 三个形容词：暖、克制、叙事感。
- 参考：Tavo 的清晰层级、轻量底部导航；不照搬。
- 避免：赛博霓虹、大面积粉紫渐变、传统 SillyTavern 的拥挤表单感。
- 暖纸色浅色 + 深夜书桌深色；琥珀/铜色主色；Manrope + 中文衬线标题。
- 移动端左上角汉堡菜单：上半部分为最近聊天与小加号新建，底部为设置和导入区；聊天页独立全屏；桌面左侧主导航 + 内容区。

## 9. 示例数据

- 初始数据只包含内置“微信式对话气泡”正则，不包含示例角色、对话、世界书、预设或 API Key。
- 内容由用户在导入区或导入文件页创建；清空本地数据后回到同一内置正则空态。
- E2E 通过真实导入接口和测试专用会话接口生成临时数据，不写入产品初始状态。
- 覆盖空态、加载、错误、禁用、批量删除和未知导入类型。

## 10. 验收

- 所有页面从导航可进入；所有按钮有真实行为或明确 disabled。
- 角色/对话/内容库/设置的新增、修改、删除刷新后仍保留。
- 导入 PNG/JSON 角色卡、预设、世界书、正则；多文件逐项结果；失败不阻断其他文件。
- 对话设置只影响当前会话；刷新后保留。
- 真实 API 流式回复分块出现，可停止；刷新后已生成内容保留；未配置 API 或请求失败时有明确提示。
- 向量模式在超过 80 条消息后仍能索引和召回第一条消息；刷新、重启和 App 更新后本机向量库仍在（卸载应用或清除应用数据除外），不产生云端数据库写入；旧 localStorage 向量能自动迁移。
- 1440/390、Light/Dark 可读，移动端无横向溢出。
- `pnpm validate` 通过；关键流程 E2E 通过。
