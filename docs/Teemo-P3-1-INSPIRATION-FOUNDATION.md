# Teemo助理 P3-1 Inspiration Foundation

> 状态：`IMPLEMENTED / WAITING REVIEW`
> 分支：`Teemo/p3-personal-inspiration`
> 基线：`cd29e6f` / `v1.2.1-p3-baseline`
> 开发版本：`1.3.0`（尚未构建、安装或发布）

## 1. 阶段目标

P3-1 只建立 Personal Inspiration Intelligence 的独立数据域、只读 Connector Contract、权限边界和最小管理页。它不连接任何真实素材来源，不建立索引、Embedding、Vector Store、检索或 Agent Context 注入。

## 2. 独立数据域

- 唯一状态文件为 `Teemo-inspiration-state.json`，schemaVersion 为 1，默认 `enabled: false`。
- 状态只保存 enabled、revision、updatedAt；不保存素材、索引、连接凭据或 P2 数据。
- mutation 使用文件锁、latest read 和 expectedRevision；双窗口 stale write 返回 `INSPIRATION_STATE_CHANGED`。
- 文件不存在时只返回默认状态且不主动落盘；JSON 解析失败或 schema/字段无效时均 fail closed、安全停用并保留原始字节。

## 3. Connector Contract

- Connector Definition 必须声明 connectorId、kind、displayName、version、`readOnly: true`、capabilities、authorization、offlineBehavior 和 privacyClass。
- 当前只允许 health、list_items、item_metadata、preview 四种只读 capability，公开 capability 列表不可在运行时修改。
- 带 write/create/update/delete/remove/move/rename/upload/sync_write 的 capability，或暴露对应写方法的 Connector，注册时直接拒绝。
- 生产 Registry 为空。测试只注册临时 synthetic Connector，不存在 Local Folder、Eagle、NAS、Figma、Pinterest、Behance 或花瓣实现。

## 4. 权限与错误边界

- 每次 Connector 读取都先经过 P1 Permission Service，permission 固定为 read，resource 为 `inspiration://source/<connectorId>`。
- deny、prompt、Permission Service 缺失/异常、Abort、状态关闭或状态损坏时，Connector handler 不得执行。
- 对 UI 和调用方只返回稳定公开错误，不泄露内部异常或本地路径。
- P3-1 不新增写权限、文件授权根、IPC 或 Main Process 能力。

## 5. UI

独立聊天侧栏新增“我的灵感”一级入口。页面只提供基础能力开关、隐私说明、状态、已连接来源数量和空来源状态；没有未来来源的假连接按钮。页面导航与 Cognition、Creative、Challenge、Skill Center 相互隔离。

## 6. P2 隔离

- 未修改 Agent Core、Context Builder、Cognition Collector、Creative Profile、Challenge 或 Skill Router。
- Agent 实际消息顺序仍为 Skill、Cognition、Creative、Challenge、Current User，不含 Inspiration。
- 专项隔离测试用固定字节保护 Cognition、Creative、Skill 和 Project 文件，P3-1 操作后逐字节不变。
- 测试不读取或修改正式用户 profile、Cognition、Creative、Skill、Project、聊天、凭据或个人素材。

## 7. 验证入口

```powershell
npm.cmd run test:inspiration-foundation
npm.cmd run test:inspiration-isolation
npm.cmd run test:inspiration-ui-smoke
npm.cmd run verify:release-version
```

Electron smoke 使用隔离 userData 与临时数据目录，覆盖默认关闭、双窗口 revision 冲突、开关持久化、重启、损坏状态 fail closed、生产 Registry 为空、P2 页面可用和正式数据零触碰。

送审前验证结果：

- P3-1 专项：2 组 Node + 1 组 Electron，PASS。
- P1/P2 回归：22 组 Node，PASS。
- 既有 Electron smoke：9 组，PASS。
- Skill benchmark：32 cases，PASS。
- 自动更新策略：PASS。
- P3 变更 JavaScript 语法、`git diff --check`、package/lockfile/version baseline 一致性：PASS。
- Electron 截图：页面非空、布局稳定、无重叠，生产来源数为 0。

## 8. Non-goals

P3-1 不实现真实来源连接器、Local Folder、Eagle、NAS、网页引用、Figma、Pinterest、Behance、花瓣、Metadata Index、Embedding、Vector Store、语义检索、图片相似度、Inspiration Context、Taste Signals、自动学习或云同步。

## 9. 审阅状态

P3-1 当前为 `IMPLEMENTED / WAITING REVIEW`。本地实现与完整回归已完成，等待 GPT Gate。只有 GPT 返回 `STATUS: PASS / BLOCKERS: 0 / CAN_CLOSE_AND_TAG: YES / NEXT_STAGE_ALLOWED: P3-2` 后，才允许建立 P3-1 recovery tag 并进入 P3-2。
