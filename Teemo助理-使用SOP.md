# Teemo助理 V1.3.2 使用 SOP

## P4-1 Runtime / Screen Awareness (CLOSED / PASS)

Chat Window now includes a local-only `Runtime / Screen Awareness` page. Choose an opaque display reference, explicitly request one snapshot, respond to the P1 read permission prompt, and review the bounded local preview. Use `Discard` when finished; previews also expire automatically.

The snapshot stays in Main Process memory for its requesting window only. It is not written to files, chat history, logs, or Git, and it is never sent to AI providers or Agent context. P4-1 does not let Teemo click, type, control windows, access the clipboard, record the screen, or perform any desktop action.

P4-2 Controlled Desktop Actions is not available until its own Taskbook and Strict Review are complete.

## P3-4 Inspiration Retrieval (CLOSED / PASS)

“我的灵感”现在可对已建立的本地 Metadata Index 做关键词检索。支持文件名/相对路径 substring、来源、PNG/JPEG/WEBP/GIF、横向/纵向/正方形、最小宽高、最新/最早/名称排序和最多 100 项分页。结果点击复用现有预览。

检索只读取 Teemo 私有 active metadata，不上传素材，不调用 Provider，不写入 Source，不注入 Agent Context。撤销授权、移除来源、索引不可用或关闭灵感能力时 fail closed。P3-5/P3-6 未开始，Git/Controlled Execute/Shell/delete 仍不向普通 Chat 开放。

> 适用版本：`v1.3.2`
> 产品：Windows Electron 桌面 AI 助手
> 当前源码：`D:\Teemo助手\Teemo机器人项目\Teemo-source`
> 更新日期：2026-08-10
> 阶段状态：`P3-3 Visual Metadata Index CLOSED / PASS / BLOCKERS: 0`

> 当前工程状态权威来源：`docs/TeemoProjectKnowledge/CURRENT-STATE.md`。本 SOP 只描述产品使用和运维，不用于判断当前开发阶段、Gate 或下一步授权。

## 1. 产品定位

Teemo助理是面向个人设计生产力的桌面 AI 助手，提供多模型对话、技能调用、本地文件能力、图片/视频/文档处理、Personal Intelligence、Personal Inspiration、ComfyUI 接入、项目和待办管理等能力。

后续产品、安装包、快捷方式和版本命名统一使用 `Teemo助理`。旧的“哈啰设计助手”仅作为历史安装信息，不属于当前产品名称。

## 2. 启动与版本确认

### 已安装版本

当前 Windows 安装位置：

```text
C:\Users\Teemo\AppData\Local\Programs\teemo-assistant\Teemo助理.exe
```

开始菜单入口：`Teemo助理`。启动后可在设置或关于信息中确认版本为 `v1.3.2`。

当前本机安装文件版本为 `1.3.2`，开发源码 `package.json` 与 `package-lock.json` 也为 `1.3.2`；`npm.cmd run verify:release-version` 已通过。

版本规则：发布标签使用 `vX.Y.Z-*`，界面、package/lockfile 和安装包必须显示同一 `X.Y.Z`。界面通过 Electron `app.getVersion()` 动态读取，不单独硬编码；正式构建会自动执行版本一致性检查。

### 开发版

```powershell
Set-Location 'D:\Teemo助手\Teemo机器人项目\Teemo-source'
npm install
npm start
```

正式构建（Windows PowerShell 使用 `npm.cmd`）：

```powershell
npm.cmd run dist:win
```

构建产物位于 `dist\`，不要把 `dist` 当作源码继续修改。

正式版启动后会自动检查 GitHub Release。新版本会在后台下载，下载完成后静默安装并强制重启；不再等待“稍后”确认。发布前必须先通过 `npm.cmd run verify:release-version`。

## 3. 首次配置

1. 打开桌宠或聊天窗口。
2. 进入“设置 / API 接入”。
3. 配置对话模型的 API 地址、模型和 API Key，点击“测试连接”。
4. 如需生图，在生图模型区域单独配置生图地址、模型和 Key。
5. 根据需要配置 ComfyUI 地址（默认本机服务地址通常为 `http://127.0.0.1:8188`）。
6. 在偏好设置中调整置顶、缩放、待机动画和隐私显示选项。

API Key、Token、密码等凭据只保存在本机配置中，不要写入源码、日志、截图或 Git 提交。

## 4. AI 对话与模型

- 支持多模型配置和切换，具体供应商取决于 API 兼容性及本机配置。
- 普通提问、需求拆解、文案、总结和编程问题可直接在聊天窗口输入。
- 支持流式输出；请求过程中可取消。
- 连接异常时先使用“测试连接”，再检查地址、模型名、Key 和代理设置。
- 不同模型共享同一套本地文件授权和 Service 规则，不要为单个模型另建权限逻辑。
- 对支持 Native Tool Calling 的 Provider，普通 Chat 可调用当前 Safe File Tools。模型的结构化工具请求会经过 `TeemoAgentCore`、Tool Registry、P1 Permission、File IPC 和 Main Process `TeemoFileService`；Safe File Tool 路径不从聊天界面直接执行 filesystem I/O。
- 普通 Chat 当前只开放：`list_directory`、`read_file`、`search_files`、`search_text`、`create_file`、`patch_file`、`rename_file`、`create_directory`。不开放 Git Tools、Controlled Execute、任意 Shell/PowerShell、任意程序执行、delete 或 destructive operation。

## 5. 图片、视频与文档

- 图片可在聊天窗口上传并用于分析或改图。
- 文本、代码、PDF、DOCX 等文档通过本地文件入口读取后交给 AI 分析。
- 纯文字生图与图片改图使用独立的生图配置；改图应使用支持图生图的模型。
- 长文本或大文件应按需分段处理，避免一次请求超过模型上下文限制。

## 6. 本地文件读取权限

Teemo 默认不能浏览任意本地路径。使用“本地文件”前：

1. 打开设置中的“本地文件读取权限”。
2. 点击“授权文件夹”，选择需要读取的目录。
3. 在聊天窗口点击“本地文件”，从已授权目录中选择文档。
4. 不再需要时点击“取消授权”。

在普通 Chat 使用文件工具时，请提供位于 P1 authorized root 内的明确真实路径。工具调用仍会逐次经过 P1 Permission，Main Process 是最终 filesystem authorization boundary。普通 Chat 支持安全读取、搜索、文本创建、精确 patch、不覆盖 rename 与创建空目录；不提供 delete。

自然语言目录别名（例如“素材库”）的自动定位仍属于后续体验优化，不是当前普通 Chat File Tool 的正式使用契约；不要假定模型可以猜测本机绝对路径。

请只授权必要目录。未授权目录、授权目录外的路径和路径穿越请求必须被拒绝。

## 7. 技能中心

- 内置技能用于设计规范、文案、配色、命名、评审等场景。
- 可在技能中心上传或编辑 Markdown 技能模板。
- P2-5 已加入确定性的 Skill Router、Manifest、Composition 和 Session continuity；最多组合 3 个 Skill，且每个 role 最多 1 个。
- 对话中提及技能名称、别名或明确任务信号时，系统会尝试匹配并注入相关规则；不确定时保持普通聊天，不强行命中。
- 对 Skill 的提问、解释、比较和明确否定会抑制该 Skill，防止“怎么用”“这次不用”等表达被误当作调用。
- Skill UI 可查看和覆盖 Routing Metadata，并可显式重建损坏或过期的路由信息；重建不修改 Raw Skill 原文。
- 用户个人技能数据保存在本机，不要提交到公开 Git 仓库。

## 8. P2 Personal Intelligence

P2-1 至 P2-5 已全部完成并通过最终验收：

| 阶段 | 能力 | 状态 |
|---|---|---|
| P2-1 | Cognition Center：查看、搜索、手动添加、纠正、迁移和停用 Teemo 对用户的了解 | `CLOSED / PASS` |
| P2-2 | Agent Creative Profile：独立于用户偏好的专业设计判断 | `CLOSED / PASS` |
| P2-3 | Creative Director / Challenge Mode：常规/挑战模式及轻度、标准、强度较高三档 | `CLOSED / PASS` |
| P2-4 | Cognition Intelligence：证据、冲突、时效、可信度和保守晋升 | `CLOSED / PASS` |
| P2-5 | Skill Intelligence：确定性路由、组合、连续性、抑制与修复 | `CLOSED / PASS` |

### 使用原则

- Context 顺序固定为 `Skill -> Cognition -> Creative -> Challenge -> Current User`。
- 当前用户明确要求始终高于 Project、Skill 和 Creative/Challenge 建议。
- Cognition、Creative Profile、Challenge Session、Raw Skill 和 Skill Registry 是独立事实源，不互相覆盖。
- Challenge 是 session-local、runtime-only；新会话、新窗口和应用重启后恢复常规判断。
- Cognition 与 Creative 可分别关闭；关闭后停止对应注入，不删除已有数据。
- 所有 P2 测试使用隔离 profile，未读取或修改正式用户数据。

### P2 最终验收

- 22 组 Node regression：PASS。
- 9 组 Electron smoke：PASS。
- 32 条 Skill benchmark：PASS。
- 50 个 P2 变更 JavaScript 文件语法检查：PASS。
- GPT Final Acceptance：`PASS / BLOCKERS: 0 / CAN_CLOSE_P2: YES`。

## 9. P3 Personal Inspiration

P3-1 至 P3-3 已完成并通过严格验收：

| 阶段 | 能力 | 状态 |
|---|---|---|
| P3-1 | Inspiration Foundation：独立状态、只读 Connector 契约、隐私边界和“我的灵感”入口 | `CLOSED / PASS` |
| P3-2 | Local Folder Connector：添加、浏览、按需预览和重新授权本地灵感来源 | `CLOSED / PASS` |
| P3-3 | Visual Metadata Index：建立、刷新、重建和查看基础图片 metadata | `CLOSED / PASS` |

### 添加本地灵感来源

1. 打开独立聊天窗口，在侧栏进入“我的灵感”。
2. 开启 Personal Inspiration 总开关。
3. 点击“添加本地文件夹”，选择需要作为灵感来源的目录。
4. 如果目录尚未获得 P1 文件授权，按权限提示确认授权。
5. 添加成功后，可使用“浏览”查看目录层级，并按需预览 PNG、JPEG、WEBP 或 GIF。

Local Folder Source Registry 只记录来源配置，不等于文件系统授权。实际读取仍要求目录处于 P1 authorized roots，并通过 `inspiration://local-folder/<sourceId>` 的 source-specific read Permission。

### 建立和维护 Metadata Index

1. 新来源首次使用时点击“建立索引”。
2. 文件新增、删除、修改或重命名后，点击“刷新索引”。
3. 索引损坏、需要忽略旧复用结果或界面明确提示时，点击“重建索引”。
4. 点击“查看索引”检查素材数量、上次索引时间和 metadata 列表。
5. 扫描过程中可取消；同一时间全局只运行一个索引任务。

索引只处理 PNG、JPEG、WEBP 和 GIF，记录文件名、相对路径、MIME、尺寸、大小和修改时间等基础 metadata。每项最多读取 1 MiB header，不完整解码图片、不计算素材 content hash。

### 权限、删除和数据边界

- 撤销 P1 文件夹授权后，Source 记录可以保留，但浏览、预览和 metadata 会隐藏并 fail closed；重新使用前需要显式重新授权原目录。
- “移除来源”只移除 P3 Source 记录和对应私有索引，不删除源文件，也不自动撤销 P1 authorized root。
- 索引文件只保存在 Teemo 自己的数据目录，不向素材目录写入 thumbnail、cache、sidecar 或 index。
- 关闭 Personal Inspiration 后，不再允许来源读取或提交新索引；已有私有索引不会进入 Agent Context。
- Metadata Index 没有后台 watcher 或自动刷新。界面显示的是“上次索引”，素材变化后需要手动刷新。
- P3-3 没有 Search、Keyword Filter、Embedding、Vector DB、图片相似搜索或 AI Vision 检索。

### P3 验收状态

- GPT Strict Review：`PASS / BLOCKERS: 0 / CAN_CLOSE_AND_TAG: YES / NEXT_STAGE_ALLOWED: P3-4`。
- P3-3 implementation commit：`2a010f0af7debdd6d8bc39740157031470aefc07`。
- P3-3 close commit：`e75de8d31cdc1e8c4175357cf4a8f621304748cc`。
- P3-3 recovery tag：`v1.3.0-p3.3-visual-metadata-index`。
- P3-4 尚未开始；P3 分支尚未 remote push。

## 10. 项目与待办

- 项目支持创建、查看和维护项目状态。
- 待办支持新增、完成、取消、优先级、截止时间及提醒。
- 可将聊天内容转成待办，再在待办面板中确认和调整。

## 11. ComfyUI

1. 先启动本机 ComfyUI 服务。
2. 在 Teemo 设置中填写 ComfyUI 地址，默认可使用 `http://127.0.0.1:8188`。
3. 导入工作流前确认所需自定义节点和模型已安装。
4. 缺失节点应先记录节点名称，再从对应项目或 ComfyUI Manager 安装；不要随意替换节点导致工作流语义改变。
5. 运行前检查输入图片、模型、显存和输出目录；运行后核对结果图片是否生成。

## 12. 本地数据与安全

用户数据可能位于以下目录：

```text
C:\Users\Teemo\.hellobike-pet
C:\Users\Teemo\AppData\Roaming\hellobike-desktop-pet
C:\Users\Teemo\AppData\Roaming\teemo-assistant
```

这些目录包含设置、聊天历史、技能、项目、待办、工作统计、P3 来源配置和私有 Metadata Index 等数据。升级、重装和测试时不得清空、覆盖或删除它们；需要测试时使用隔离 profile、临时目录或备份副本。

## 13. 常见故障处理

| 现象 | 处理 |
|---|---|
| 聊天无回复 | 测试 API 连接，核对模型、地址、Key 和网络代理 |
| 流式输出中断 | 重试并检查代理/网络；确认没有重复启动多个旧版本 |
| 文件无法读取 | 确认目录已授权，且文件位于授权目录内 |
| 灵感来源需要重新授权 | 在“我的灵感”中选择重新授权，并选择原来源目录 |
| 灵感索引没有反映新文件 | 点击“刷新索引”；P3-3 不提供 watcher 或后台自动扫描 |
| 灵感索引显示损坏 | 使用对应 Source 的“重建索引”；manifest 损坏时使用显式索引数据恢复 |
| 灵感索引提示任务繁忙 | 等待当前全局索引任务结束，或先取消当前任务再重试 |
| PDF/DOCX 解析失败 | 先用文本文件验证，再检查文件是否损坏或过大 |
| ComfyUI 连接失败 | 确认服务已启动、地址正确，浏览器能打开 ComfyUI 页面 |
| 生图失败 | 核对生图 Key、地址和模型是否属于同一服务，并确认模型支持当前模式 |
| 设置未保存 | 检查应用是否有写入权限，不要直接删除用户数据文件 |

## 14. 开发与交接规则

- 唯一开发源码是 `Teemo-source`，禁止修改安装目录、`dist`、`app.asar` 或解包产物。
- 开发前先阅读根目录 `AGENTS.md`，检查分支、工作区状态和相关调用关系。
- 当前 P0 基线：`219b92a` / `v1.1.6-p0-closed`；P1：`v1.2.0-p1-agent-foundation`。
- P2 恢复标签依次为 `v1.2.0-p2.1-cognition-ui`、`v1.2.1-p2.2-creative-profile`、`v1.2.1-p2.3-challenge-mode`、`v1.2.1-p2.4-cognition-intelligence`、`v1.2.1-p2.5-skill-intelligence`。
- P2 关闭提交为 `28bd459`；自动更新策略提交为 `801850b`。
- 当前分支为 `Teemo/p3-personal-inspiration`。P3-1、P3-2、P3-3 recovery tag 依次为 `v1.3.0-p3.1-inspiration-foundation`、`v1.3.0-p3.2-local-folder-connector`、`v1.3.0-p3.3-visual-metadata-index`。
- P3-3 close commit 为 `e75de8d`；P3-4 未开始，未获得独立 Taskbook 前不得预实现。
- 底层能力优先通过 `AIService`、`TeemoStorageService`、`TeemoFileService` 调用。
- 修改后至少执行语法检查、受影响功能测试、应用启动检查和 `git diff/status` 检查。
- 新增文件、节点或需要重命名的项目资产优先使用 `Teemo` 前缀；用户明确指定的文件名除外。

## 15. 当前版本边界

已具备：多模型 AI、流式聊天、技能系统、项目/待办、P1 Agent Core、统一 Tool Registry/Permission、安全文件/Git/受控执行工具、完整 P2 Personal Intelligence、P3 Inspiration Foundation、Local Folder Connector、Visual Metadata Index、PDF/DOCX 读取、图片/视频处理、ComfyUI 接入、Windows 安装包、自动更新和 Teemo 图标。

尚未实现且必须由独立阶段规划启动：P3-4、Semantic/Keyword Search、Embedding、Vector DB、Image Similarity/Image Search、Eagle、NAS、Web Source、Watcher、Background Auto Scan、Inspiration Agent Context、Taste Signals、Cloud Sync，以及任何扩展权限边界的自动化能力。任意 Shell、文件删除、destructive/remote Git 和未审阅的外部写操作仍不提供。
