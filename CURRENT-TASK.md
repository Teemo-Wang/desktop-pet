# Current Task

## 当前阶段

- Product：Teemo助理
- Branch：`Teemo/p3-personal-inspiration`
- Phase：P3-3 Visual Metadata Index
- State：`CLOSED / PASS / BLOCKERS: 0`
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
- P3-2 Recovery Tag：`v1.3.0-p3.2-local-folder-connector`
- P3-3 Recovery Tag：`v1.3.0-p3.3-visual-metadata-index`

## P3-3 已实现

- 新增独立 manifest + source-sharded revisioned JSONL Metadata Index、bounded recursive Scanner、Index Service、Main IPC 和 Renderer Client/UI。
- 只读取 Local Folder 内 PNG/JPEG/WEBP/GIF 的最多 1 MiB header；不完整 decode、不计算素材 content hash、不修改 Source。
- Source identity 复用 P3 sourceId；itemId 使用 sourceId + normalized relative path；rename 为 remove + add。
- Build/Refresh/Rebuild 使用 `inspiration://local-folder/<sourceId>` read Permission 和一次性 `inspiration_metadata_index` execution authorization。
- 支持增量 metadata reuse、进度、取消、timeout、stale writer、显式 corruption rebuild、授权撤销隐藏和 Source removal cleanup。
- 没有 Search、Embedding、Vector、Image Search、Eagle、NAS、Web、Watcher 或 Agent Context；P3-4 未开始。

## 当前送审证据

1. P3-3 实现与三组专项测试已完成；文档见 `docs/Teemo-P3-3-VISUAL-METADATA-INDEX.md`。
2. P3-3/P3-2/P3-1 各 2 Node + 1 Electron、P1/P2 22/22 Node、9/9 既有 Electron、32/32 benchmark、auto-update、版本、syntax、diff 与 sensitive scan 全部通过。
3. Electron synthetic UI 截图为 2199 x 1316，SHA256 `0c05187d0039e5f43604c54fc93bde5525706db107be884281a57d75def42ba7`，无真实路径、凭据或正式素材。
4. 全部文件将由唯一 implementation commit `Teemo: add P3-3 visual metadata index` 固化；实际 hash 在最终 Evidence 中报告。
5. GPT Strict Review 已返回 `PASS / BLOCKERS: 0 / CAN_CLOSE_AND_TAG: YES / NEXT_STAGE_ALLOWED: P3-4`；P3-3 已封板并创建 close commit/tag，P3-4 仍未开始。
6. remote push 未执行，正式 v1.2.1 不安装或重启 P3 开发版。

## 禁止扩展

P3-3 已 `CLOSED / PASS / BLOCKERS: 0`；P3-4 尚未开始，仍禁止 Watcher、Eagle、NAS、Figma、网页平台、Search、Embedding、Vector DB、Image Similarity、Inspiration Context、Taste Signals、Cloud Sync、Multi-Agent 或 GUI Automation。
