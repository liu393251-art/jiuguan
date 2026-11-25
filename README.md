# 小白酒馆 · AI 角色叙事酒馆

本地优先、移动优先的 AI 角色叙事应用。用户可以从角色卡开始，选择预设、世界书、记忆与正则，进入一段可保存、可调整、可继续的对话。

当前版本支持保存多条 OpenAI 兼容 API 连接、获取模型列表并真实请求聊天接口。角色、会话、消息和内容库通过本地 MSW API 读写并持久化在 `localStorage`；长期向量库存放在本机 IndexedDB，向量以 `Float32Array` 保存。聊天回复会通过浏览器或 Tauri 原生 HTTP 直接发送到用户选择的 API。API Key 仅保存在当前设备，适合本机测试。

## 快速开始

```bash
pnpm install
pnpm dev
```

打开 `http://localhost:5173`。MSW 会自动接管 `/api/tavern/*` 请求。

> 如果 `public/mockServiceWorker.js` 缺失，运行 `pnpm msw:init`。

## 页面

| 页面     | 路径                 | 说明                                                     |
| -------- | -------------------- | -------------------------------------------------------- |
| 对话首页 | `/`                  | 最近对话、搜索、新建、多选批量删除                       |
| 角色库   | `/characters`        | 搜索、标签筛选、新建与导入入口                           |
| 角色详情 | `/characters/:id`    | 完整设定、开始对话、编辑、复制、删除                     |
| 聊天     | `/chat/:id`          | 流式回复、停止、重试、编辑、复制、字号调整、分批加载     |
| 对话设置 | `/chat/:id/settings` | 当前会话的角色、预设、世界书、记忆、正则、生成参数与字号 |
| 设置中心 | `/settings`          | 多 API 连接、身份人设、记忆、外观、导入导出与重置        |
| 导入文件 | `/import/files`      | 多文件识别 PNG/JSON 角色卡、预设、世界书与正则           |
| 导入区   | `/import`            | 角色卡、预设、世界书、正则的导入与增删改                 |

对话设置是会话级快照：新对话创建时复制全局默认值，之后只修改当前会话，不回写全局。

## 技术栈

React + Vite + TypeScript、Tailwind CSS v4、shadcn/ui 风格组件与 Radix primitives、Lucide、Motion、React Router、Zustand、React Hook Form + Zod、Sonner、MSW、Vitest + Playwright。

## 数据流

```text
页面 / feature components
  -> src/features/tavern/api.ts
  -> src/services/http.ts
  -> fetch("/api/tavern/...")
  -> src/mocks/handlers/tavern.ts
  -> src/mocks/mock-db.ts
  -> src/mocks/fixtures/tavern.ts
```

- 页面不直接读取 fixtures、`localStorage` 或实现 `fetch`。
- API 输入输出经过 Zod 校验。
- 初始状态只内置“微信式对话气泡”正则；角色、对话和其他内容仍由用户自行导入或创建。
- Mock 数据持久化 key 为 `xiaobai.tavern.v3`，可从设置页清空。
- 导入文件在浏览器内解析，入库仍走 API -> MSW -> mock-db。
- 本地会话与消息先由 MSW 持久化，再通过 `src/services/external-http.ts` 请求用户选择的 OpenAI 兼容接口。
- 聊天使用 SSE `chat/completions` 流式返回；可中途停止，停止和失败状态都会写回本地消息。
- 打开会话首帧定位到底部；发送后输入框立即清空，流式增长和输入框/视口尺寸变化时保持吸底，只有用户上翻才解除。
- 多人回复按 `【角色名】` 拆分；`「」`、`“”` 或用户直接输入的正文显示为左右气泡，动作、心理和环境描写（包括用户用 `（）` 写的内容）显示为居中无气泡正文。叙述使用比台词略大的字号，并且不会另起“心理/环境”发言者；输入框上方可一键插入 `“”` 与 `（）`。
- SillyTavern 预设导入会保留 `prompt_order` 中启用的提示词，并按顺序注入系统提示。
- 用户身份（称呼、人设）会注入系统提示；角色卡里的 `{{user}}` / `{{char}}`、`<user>` / `<char>` 会在请求前替换为当前称呼和角色名。
- 压缩记忆会在每次完整回复后，用当前会话的聊天 API 把全部已完成历史压缩成长期记忆；历史过长时先分段压缩再合并，后续只带压缩结果和最近消息。压缩失败不影响聊天，并保留上一次成功的结果。
- 向量记忆会为全部已完成的用户与角色消息建立本机索引，不再按最近条数淘汰；当前对话完整带入，旧会话按语义召回。向量库使用本机 IndexedDB 持久化，不再挤占 `localStorage` 配额，旧版本存在 `localStorage` 的向量会在首次启动时自动迁入；默认在本机计算向量，不联网、不上传云端数据库。只有显式选择 API 连接时才调用该连接的 `/embeddings`，失败会退回本机向量。
- 助手消息里的完整或截断 JSON 状态补丁、状态说明不会进入正文和后续上下文；桌面端与移动端共用同一套过滤逻辑。
- 浏览器会受第三方接口跨域限制；桌面端和 Android 端通过 Tauri HTTP 插件绕过 CORS。

## 常用命令

| 命令             | 作用                                         |
| ---------------- | -------------------------------------------- |
| `pnpm dev`       | 启动开发服务器                               |
| `pnpm build`     | 生产构建                                     |
| `pnpm preview`   | 预览生产构建                                 |
| `pnpm lint`      | ESLint                                       |
| `pnpm typecheck` | TypeScript 检查                              |
| `pnpm test`      | Vitest 单元测试                              |
| `pnpm test:e2e`  | Playwright 端到端测试（自动启动和回收 Vite） |
| `pnpm validate`  | lint + typecheck + unit test + build         |

## 验收

提交前运行：

```bash
pnpm validate
```

关键流程再运行：

```bash
pnpm test:e2e
```

视觉检查覆盖 1440px 桌面与 390px 移动端、Light / Dark。E2E 会把基线截图写入 `docs/visual-baseline/`。

当前边界：没有账号、云同步、云端向量数据库或服务端密钥托管；API Key 和普通数据以明文保存在当前设备的 `localStorage`，向量库以明文保存在本机 IndexedDB。正常重启与 App 更新会保留数据；卸载应用、清除应用数据或系统清理存储空间时仍可能删除，共享设备上不要填写生产密钥。Android 调试包允许 HTTP 明文接口，正式发布应使用 HTTPS 或单独配置网络安全策略。
