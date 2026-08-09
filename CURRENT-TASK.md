# Current Task

## 当前阶段

- Product：Teemo助理
- Branch：`Teemo/p3-personal-inspiration`
- Phase：P3-2 Local Folder Connector
- State：`IMPLEMENTED / WAITING REVIEW`
- Installed App Version：`v1.2.1`
- Development App Version：`v1.3.0`
- P3 Baseline：`cd29e6f` / `v1.2.1-p3-baseline`
- P1 Recovery Tag：`v1.2.0-p1-agent-foundation`
- P2-1 Recovery Tag：`v1.2.0-p2.1-cognition-ui`
- P2-2 Recovery Tag：`v1.2.1-p2.2-creative-profile`
- P2-3 Recovery Tag：`v1.2.1-p2.3-challenge-mode`
- P2-4 Recovery Tag：`v1.2.1-p2.4-cognition-intelligence`
- P2-5 Recovery Tag：`v1.2.1-p2.5-skill-intelligence`
- P3-1 Recovery Tag：`v1.3.0-p3.1-inspiration-foundation`

## P3-2 已实现

- 新增 Local Folder Source Registry、Main read-only Service、Connector、Renderer IPC Client 和“我的灵感”来源浏览 UI。
- Source Registry 只保存 Source 配置，不是 filesystem authorization；唯一授权事实源仍为 P1 authorized roots。
- 每次读取还要求 source-specific P1 Permission：`inspiration://local-folder/<sourceId>`，并在 Main 消费一次性 execution authorization。
- 只支持单层、按需、受限的 list/metadata/PNG-JPEG-WEBP-GIF preview；不建立 Metadata Index、Embedding、Search 或 Agent Context。
- traversal、absolute/UNC/device、symlink/junction、超深、超量、错误 signature、超大 preview 和 TOCTOU replacement 均 fail closed。
- 三组 P3-2 专项、P3-1 与 P1/P2 全量回归通过；所有 fixture 使用 temp profile/source/roots，正式数据与真实个人素材零触碰。

## 当前送审证据

1. P3-2 实现与三组专项测试已完成；文档见 `docs/Teemo-P3-2-LOCAL-FOLDER.md`。
2. P3-1 三组、P1/P2 22 组 Node、10 组既有 Electron、32-case benchmark、自动更新、语法、diff、版本与敏感信息检查全部通过。
3. Electron synthetic UI 截图为 2079 x 1256，SHA256 `59853cced44a7a363906e2979477b814bf39fb0a1ef9c91098274bda0d5c86df`，无真实路径、凭据或正式素材。
4. 当前等待 GPT P3-2 Strict Review；送审前只允许创建 implementation commit，不创建 close tag。
5. P3-3 Metadata Index 尚未开始，remote push 未执行，正式 v1.2.1 不安装 P3 开发版。

## 禁止扩展

P3-2 等待审阅。当前不得实现 P3-3 Metadata Index、Watcher、Eagle、NAS、Figma、网页平台、Semantic Search、Embedding、Vector DB、Image Similarity、Inspiration Context、Taste Signals、Cloud Sync、Multi-Agent 或 GUI Automation。只有 GPT Gate 明确允许后才能关闭 P3-2 并规划 P3-3。
