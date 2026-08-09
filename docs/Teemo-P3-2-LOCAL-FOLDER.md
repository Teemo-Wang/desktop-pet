# Teemo助理 P3-2 Local Folder Connector

> 状态：`CLOSED / PASS / BLOCKERS: 0`
> 分支：`Teemo/p3-personal-inspiration`
> 开始基线：`9cbab29af6c4691bccbe8f58d44bdb2e34080436`
> P3-1 标签：`v1.3.0-p3.1-inspiration-foundation`，peeled commit 与开始基线一致
> 开发版本：`1.3.0`（尚未构建、安装或发布）

## 1. 阶段结果

P3-2 实现第一个真实、只读、按需访问的 Personal Inspiration Source：Local Folder。用户可以在“我的灵感”中明确选择本地文件夹、查看来源、非递归浏览当前目录、读取实时基础 metadata，并按需预览受支持的 raster image。

本阶段没有建立 Metadata Index、递归素材库、Watcher、Embedding、Vector DB、Search、Eagle、NAS、Web Source 或 Inspiration Agent Context。

## 2. 授权架构

唯一 filesystem 授权事实源仍为 P1 `local-file-access.json` / authorized roots；P3 没有创建第二套 filesystem authorization database。

`Teemo-inspiration-sources.json` 只是 Source Registry，记录用户希望作为灵感来源使用的文件夹。它不具备授权效力。每次真实读取同时要求：

1. P3 global state 已启用。
2. `sourceId` 仍存在于最新 Source Registry。
3. source root 和请求目标仍处于当前 P1 authorized root 内。
4. 请求目标仍处于 P3 configured source root 内。
5. P1 Permission Layer 对 `inspiration://local-folder/<sourceId>` 的 read 请求返回 ALLOW。
6. Main Process 消费对应的一次性 execution authorization 后才执行 filesystem read。

添加来源时，如果所选目录未被现有 P1 root 覆盖，只授权用户实际选择的目录；用户取消或选择失败时不创建 Source。取消 P1 授权后 Source record 保留并变为 `AUTHORIZATION_REQUIRED`，browse/preview fail closed。重新授权必须由用户显式选择原目录。

移除来源只删除 Source Registry 中的记录，不删除文件、不修改来源目录，也不自动撤销 P1 authorized root。

## 3. Source Registry

独立文件：`Teemo-inspiration-sources.json`

```json
{
  "schemaVersion": 1,
  "revision": 0,
  "sources": []
}
```

Local Folder Source 只保存 `sourceId`、`kind`、`displayName`、`rootPath`、`createdAt` 和 `updatedAt`。`sourceId` 是随机 UUID，不由路径或名称派生。相同 canonical root 不能重复添加；删除后可重新添加，但必须生成新的 sourceId。

add/remove 使用 file lock、latest read 和 `expectedRevision`；stale writer 返回 `INSPIRATION_SOURCES_CHANGED`。损坏、无效 schema、重复 ID 或重复 canonical root 均 fail closed，且不覆盖损坏原字节。单 profile 最多 20 个 Source。

Source Registry 不保存 file list、目录树、metadata catalog、hash、image dimensions、preview bytes、thumbnail、tag、AI 描述、Embedding 或 Vector。

## 4. Connector 与文件边界

Connector ID 为 `local-folder`，只暴露 `health`、`list_items`、`item_metadata` 和 `preview`。没有 create/update/delete/move/rename/write/upload/copy/sync 方法，不调用网络或 Provider。

- 请求只接受 `sourceId + relativePath/relativeDirectory`，不接受任意 absolute child path。
- 拒绝 `..`、absolute、drive-qualified、UNC、device namespace、colon/ADS-like child path。
- 每次运行重新读取 Source config、P1 roots、realpath 和 stat，不永久信任创建时结果。
- Source Root 与每个 traversed component 使用 non-following lstat 检查；symlink 和 Windows junction 不跟随。
- canonical target 必须同时位于 P1 authorized root 与 P3 Source Root 内。
- browse 默认 100 项，硬上限 200 项；按实际检查的 dirent 计入边界并返回 `truncated`。
- 一次只列当前目录直接 children，不递归；最大深度 16。

## 5. Preview 与 TOCTOU

Preview 只允许 PNG、JPG/JPEG、WEBP 和 GIF，且必须同时通过扩展名与 magic signature。SVG、PDF、PSD、HTML、文档、视频、音频和其他类型只可作为普通文件列出，不能读取 preview。单文件上限 25 MiB；超限在 open 前拒绝，不向 Renderer 传输 bytes。

读取流程执行 path validation、最新授权检查、non-following component inspection、read-only open、open-handle fstat identity/size 对比、读取后再次 fstat 和 signature 校验。目标在 validate/open/read 之间被替换或改变大小时返回 `INSPIRATION_SOURCE_CHANGED`。这降低常见 race 风险，但不宣称消除 kernel-level TOCTOU。

不在 Source 或 P3 dataDir 中生成 thumbnail、sidecar、cache 或临时素材文件。

## 6. Abort、Timeout 与隐私

health/item metadata/list/preview 默认上限分别为 3/3/5/10 秒，不自动 retry。pre-abort 在 Connector I/O 前结束；directory iteration 与 preview open/read 边界检查取消状态。测试使用可控 I/O hook 验证 mid-list、mid-preview、list timeout、preview timeout 和 late-result 行为。

已超时请求不会把 late result 写入 UI 或 persistent state。已进入的同步 OS filesystem call 无法由 JavaScript `Promise.race` 强制中止，这是当前明确的非阻塞限制；实现不夸大为 kernel-level cancellation。

UI、公开错误、Permission resource、截图和测试输出不显示真实绝对路径。测试只使用 `os.tmpdir()` 下的 synthetic source、isolated Electron userData、isolated `TEEMO_ASSISTANT_DATA_DIR` 和 temp authorized roots。

## 7. UI

继续复用“我的灵感”一级入口，没有新增导航。页面增加：

- 添加本地文件夹。
- Source display name、folder basename、状态、浏览、重新授权和移除。
- 非递归目录层级、根目录返回边界和 direct children。
- 支持图片的单选按需 preview；不支持文件与 link 只展示、不可点击。
- 授权撤销、来源缺失/无效、Permission deny、timeout、损坏配置的稳定错误状态。
- 撤权、缺失、无效或 global disabled 时立即清空已打开的目录与 preview。

截图：`Teemo-P3-2-local-folder-ui.png`，2079 x 1256，SHA256 `59853cced44a7a363906e2979477b814bf39fb0a1ef9c91098274bda0d5c86df`。人工检查无遮挡、无真实路径/凭据/正式素材名称，Source 状态、层级和移除语义清楚。

## 8. 隔离边界

Local Folder browse/metadata/preview 不修改 P3 global state 或 Source config。Cognition、Creative Profile、Challenge Session、Raw Skill、Skill Registry/Manifest、Project、settings、history 和 credentials fixture 字节保持不变。

Agent assembly 仍为 `Skill -> Cognition -> Creative -> Challenge -> Current User`，没有 Inspiration system message、文件路径或 preview data。Provider call count 为 0。

## 9. 实际验证

- `npm.cmd run test:local-folder`：PASS，68 项 Source/Permission/path/link/limit/type/size/read-only/TOCTOU/abort/timeout 检查；Windows junction fixture 成功并拒绝跟随。
- `npm.cmd run test:local-folder-isolation`：PASS，P2/P3 state、Agent Context、Provider 和正式数据隔离通过。
- `npm.cmd run test:local-folder-ui-smoke`：PASS，isolated Electron add/browse/preview/revoke/reauthorize/remove/restart/two-window/corrupt-config/P2 navigation；`app.getVersion() = 1.3.0`。
- P3-1：2 组 Node + 1 组 Electron，PASS。
- P1/P2：22/22 Node regression，PASS。
- 既有 Electron：10/10，PASS。
- Skill benchmark：32/32 cases，PASS。
- `npm.cmd run test:auto-update`：PASS。
- 所有新增/修改 JS `node --check`：PASS。
- `git diff --check`：PASS。
- `npm.cmd run verify:release-version`：PASS，package/lock/UI/installer 均为 1.3.0。
- 敏感信息扫描：PASS。

## 10. Human Acceptance A-I

- A — Add First Local Source：PASS。isolated profile 从 0 添加到 1，生成唯一 UUID；没有 metadata index。
- B — P1 Authorization Is Source of Truth：PASS。未授权不能创建/读取；Source Registry 不能替代 P1 roots。
- C — Authorization Revocation：PASS。Source record 保留、状态需要重新授权，browse/preview fail closed。
- D — Path / Link Escape：PASS。正常子目录可浏览，`..`/absolute/UNC/device 拒绝，Windows junction 显示为 unsupported 且不可进入。
- E — Bounded Browse：PASS。单层、默认 100、硬上限 200、`truncated`、depth 16、Source 20。
- F — Read-only Source：PASS。list/metadata/preview/remove 后 source bytes、mtime、file tree 不变，移除不删除原文件。
- G — Cancel / Timeout：PASS。pre/mid abort、list/preview timeout 返回稳定错误，无 late state/UI mutation。
- H — Intelligence Isolation：PASS。P2 事实源与 Agent Context 不变，Provider calls=0。
- I — Formal User Data Isolation：PASS。Node/Electron 只使用 temp profile/source/roots；正式数据与真实素材未参与。

## 11. Gate 状态

GPT Strict Review 已确认 `PASS / BLOCKERS: 0 / CAN_CLOSE_AND_TAG: YES / NEXT_STAGE_ALLOWED: P3-3`。P3-2 已获准关闭并创建 annotated recovery tag `v1.3.0-p3.2-local-folder-connector`；remote push 未执行。

GPT 确认的非阻塞风险：同步 OS filesystem call 无法由 `Promise.race` 强制中止；Windows `O_NOFOLLOW` 可用性有限，当前依靠 lstat/realpath、双 containment、open/fstat 与 post-read fstat 组合；移除 Source 后保留 P1 root 是有意的授权分离；rootPath 只保存在本地私有 Source 配置。以上均不阻塞 P3-2 关闭。

`FORMAL_USER_DATA_TOUCHED: NO`

`REAL_PERSONAL_INSPIRATION_CONTENT_USED_IN_TESTS: NO`
