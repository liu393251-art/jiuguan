# 配套包（ZIP）导入格式

配套包用于把一张角色卡和它依赖的预设、世界书、正则一次导入，并自动创建一套可直接开聊的配套。

入口：`导入区 -> 导入配套`，或直接打开 `/import/files?pack=1`。

## 1. ZIP 结构

压缩包内可以自由分目录，文件名不参与类型判断；程序会读取每个 JSON / PNG 的内容来识别类型。

```text
无界驿站-雾港.zip
├── manifest.json          # 可选，配套名称与记忆方式
├── 角色卡.json            # 或角色卡.png
├── 预设.json
├── 世界书-核心.json
├── 世界书-雾港.json
├── 正则-输出规整.json
└── README.txt             # 会被忽略
```

一个配套包必须且只能有一张角色卡。预设、世界书、正则可以缺省，但缺省时会在导入前提示；世界书和正则支持多份。

角色卡里的 `character_book` 会作为独立世界书导入，并和新角色一起绑定到配套。

仓库内置示例：`packs/wujie-station-open-pack.zip`。它包含成年角色、开放题材总纲、默认“雾港来信”题材、人物簿、叙事预设和状态卡归一正则；源文件在 `packs/wujie-station/`，可按 README 替换当前篇后重新打包。

## 2. manifest.json

清单文件不是必需的。没有清单时，配套名取 ZIP 文件名。支持 `manifest.json` 或 `pack.json`。

```json
{
  "format": "xiaobai-tavern-pack",
  "version": 1,
  "name": "无界驿站 · 雾港",
  "description": "海港悬疑题材的开放叙事配套。",
  "memoryMode": "compressed"
}
```

字段说明：

| 字段          | 说明                                                   |
| ------------- | ------------------------------------------------------ |
| `name`        | 配套名称；也支持用 `loadoutName` 覆盖                  |
| `description` | 配套说明，不限长度                                     |
| `memoryMode`  | `off` / `recent` / `summary` / `compressed` / `vector` |
| `format`      | 可选标识，当前不强校验                                 |
| `version`     | 可选版本号，当前不强校验                               |

清单损坏或字段无效时不会阻断导入，会在识别结果里显示提示并回退到自动推断。

## 3. 文件格式

- 角色卡：SillyTavern v1/v2/v3 JSON，或带 `ccv3` / `chara` 元数据的 PNG。
- 预设：SillyTavern Chat Completion / Text Completion 预设 JSON，读取 `settings` 或顶层生成参数，以及 `prompts` / `prompt_order`。
- 世界书：`entries` 对象或数组，兼容 `keys` / `key`、`content` / `entry`、`constant`、`order`、`disable`。
- 正则：顶层数组、`findRegex` 单规则对象，或 `{ "name": "...", "rules": [...] }` 包装。

推荐直接使用小白酒馆或其他 SillyTavern 客户端导出的原始文件，不需要改字段。

## 4. 导入行为

1. 浏览器内解压并逐个识别文件，不上传服务器。
2. 角色卡、预设、世界书和正则先全部归一化为小白酒馆格式。
   名称、介绍和描述按原文完整保留，只去除首尾空白，不截断、不追加省略号。
3. 点击“开始导入”后，所有资源在一次本地状态更新中写入，再创建配套。
4. 配套自动绑定角色、可选预设、全部世界书和全部正则；内置“微信式对话气泡”规则始终保留。
5. 任何已识别资源解析失败、缺少角色卡或包含多张角色卡时，整包不可导入，不会写入半套数据。

多个预设时只绑定文件名排序后的第一个，并显示提示。无法识别的 JSON 只作为提示跳过，不会阻断整包。

## 5. 限制

- ZIP 文件最大 24 MB。
- 单个 JSON / PNG 解压后最大 8 MB。
- 解压后总计最大 40 MB。
- 最多读取 160 个 JSON / PNG 文件。
- 不包含 API 连接、API Key、聊天记录或向量记忆。

重复导入同一个包会新建一套角色、内容和配套，不会覆盖已有数据。
