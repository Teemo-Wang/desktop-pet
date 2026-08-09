# Teemo助理 P3-3 Visual Metadata Index

> 状态：`CLOSED / PASS / BLOCKERS: 0`
> 分支：`Teemo/p3-personal-inspiration`
> 开始基线：`f1863f46441729e331903626b3cb88e2ac39ff70`
> P3-2 标签：`v1.3.0-p3.2-local-folder-connector`
> 开发版本：`1.3.0`（未构建、未安装、未发布）

## 1. 阶段目标与边界

P3-3 在 P3-2 Local Folder Source 上建立本地、私有、可重建、按 Source 分片的视觉 metadata snapshot。它只记录 PNG、JPEG、WEBP、GIF 的相对路径、MIME、大小、mtime/ctime、宽高和 metadata fingerprint。

本阶段没有实现 Search、Embedding、Vector DB、图片相似度、Eagle、NAS、Web Source、Watcher、后台自动扫描或 Inspiration Agent Context。Provider call count 为 0；Agent 消息顺序仍为 `Skill -> Cognition -> Creative -> Challenge -> Current User`。

## 2. Persistence Architecture

唯一索引根目录：

```text
<TEEMO_ASSISTANT_DATA_DIR>/
  Teemo-inspiration-index/
    manifest.json
    sources/
      <sourceId>.<indexRevision>.jsonl
```

- `manifest.json` 保存 schemaVersion、global revision、updatedAt 和每个 Source 的 active shard pointer。
- 每个 Source 使用 immutable revisioned JSONL shard；manifest 是 active snapshot 的唯一指针。
- Source Registry 仍只有 `Teemo-inspiration-sources.json`；index manifest 不保存 rootPath，也不建立第二套 Source Registry。
- 扫描先生成临时 shard，校验 item、大小和 SHA-256，再在 manifest lock 内复核 manifest/source revision，rename 为 revisioned shard，最后原子更新 manifest。
- manifest commit 前失败时旧 snapshot 保留；未被 manifest 引用且严格匹配当前 Source 下一 revision 的 crash orphan，只能在 manifest lock 内清理。
- Source remove 后 index 立即不可访问并清理；清理失败不回滚 Source remove，后续 Source list 会对 Teemo 私有 index 目录执行安全重试。

## 3. Identity 与 Hash

- Source identity：P3 Source Registry 的随机 `sourceId`。
- `pathKey`：separator-normalized relative path；Windows 使用 case-insensitive lowercase representation。
- `itemId = SHA256(sourceKind + NUL + sourceId + NUL + pathKey)`。
- rename 定义为 old removed + new added；Windows case-only rename 因 pathKey 不变可保持 itemId。
- Source remove/re-add 会获得新 sourceId，因此相同路径也会得到新 itemId。
- `metadataFingerprint` 使用 sourceId、pathKey、size、mtimeNs、ctimeNs、MIME、width、height。
- `metadataFingerprint` 不是 content hash；P3-3 不读取完整素材计算 SHA-256。
- `shardSha256` 只校验 Teemo 自己的 JSONL shard 完整性。

## 4. Scanner 与增量策略

首次 Build 执行 bounded recursive inventory。Refresh 仍遍历完整 Source tree以发现 add/delete/rename，但相同 pathKey、size、mtime、ctime 的 item 复用旧 metadata，不重新打开 image header。Rebuild 忽略复用结果并重新检查全部支持图片。

Header parser 只读取每个文件最多 1 MiB，不执行完整 decode：

- PNG：signature + IHDR dimensions。
- JPEG：bounded marker traversal + SOF dimensions。
- WEBP：RIFF/WEBP + VP8X/VP8/VP8L dimensions。
- GIF：GIF87a/GIF89a + logical screen dimensions。

扩展名和 signature/MIME 必须一致；单个 malformed image 计入 `skippedInvalid`，不使整个 Source scan 失败。超过 256 MiB 的文件计入 `skippedTooLarge`，不读取 header。

## 5. Authorization 与 Filesystem Safety

Filesystem 授权事实源继续只有 P1 authorized roots。每次 Build/Refresh/Rebuild 都要求：

```text
toolName: inspiration_metadata_index
permission: read
resource: inspiration://local-folder/<sourceId>
```

一次用户动作只申请一次 source-specific Permission，并由 Main 消费一次性 execution authorization。DENY、null、Permission exception 和 pre-abort 都不会调用 Scanner；authorization 不能跨 Source replay，消费后不能重放。

Scanner 在每个 directory boundary 和每 100 个 dirent 复核：Source 仍存在、Source Registry revision/root 未变化、P1 root 仍授权、root identity 未变化、Abort/timeout 未触发。commit 前再次复核 Source、manifest revision 和 source indexRevision。

所有 child 使用 relative path；拒绝 traversal/absolute/UNC/device/ADS-like child。每个 entry 先 non-following lstat；symlink/junction 不跟随。canonical target 必须同时位于 P3 Source Root 和 P1 authorized root 内。Header read 使用 read-only open、inventory/lstat/open fstat identity/size/time 对比和 post-read fstat，降低 validate/open/read TOCTOU 风险。

P1 authorization 撤销后 Source record 和 private shard可保留，但 UI/API 返回 `AUTHORIZATION_REQUIRED` 且不返回 item name/path；重新授权后才可查看上次 snapshot。

## 6. Hard Limits

| 边界 | 值 |
|---|---:|
| Source count | 20（继承 P3-2） |
| max depth | 16 |
| directories / Source | 10,000 |
| dirents / Source | 50,000 |
| indexed items / Source | 25,000 |
| indexed items / profile | 100,000 |
| file size | 256 MiB |
| header read | 1 MiB / item |
| Source shard | 64 MiB |
| committed index total | 256 MiB |
| active scan | 1 global |
| Source scan timeout | 120 seconds |
| item header timeout | 3 seconds |
| Renderer page size | <=100 |

超过 directory/dirent/item/storage hard limit 时整次 scan fail closed，不提交 partial snapshot。实现限制的是 deterministic data budget，不宣称 Node RSS 或 kernel I/O 的 OS-level hard sandbox。

## 7. Corruption 与 Recovery

- Manifest parse/schema/revision/shard reference 无效时整个 Metadata Index fail closed；不自动覆盖原字节。
- Source shard SHA、JSONL、item schema、sourceId、itemCount、duplicate itemId/pathKey 任一无效时只将该 Source 标为 `CORRUPT`。
- P3-2 live browse/preview、普通聊天和 P2 页面不依赖 Metadata Index，损坏时继续可用。
- Source shard 只有用户显式 Rebuild 成功后才切换新 shard并清理旧 corrupt shard。
- Manifest 只有用户显式“重建索引数据”才重置；损坏 manifest 先移动到 Teemo private index root 内的 recoverable backup，Source Registry、P1 roots 和 Source 文件不变。

## 8. UI

“我的灵感”沿用现有一级入口。每个 Local Folder Source 显示 index status、item count、上次索引时间，并按状态提供建立、刷新、重建、查看和取消。SCANNING 只存在于 runtime，不写入 manifest。

Metadata list 按 pathKey 稳定排序并按 100 项分页，显示 filename、relativePath、MIME、dimensions、size 和 modified time。没有 Search bar、keyword filter、semantic input、Embedding/AI 或 image-similarity 控件。

授权撤销时 metadata panel 立即隐藏；corrupt shard 显示显式重建；manifest corruption 显示显式索引数据恢复。所有文案明确索引不会修改或删除原文件。

验收截图：`Teemo-P3-3-visual-metadata-index.png`，2199 x 1316，SHA256 `0c05187d0039e5f43604c54fc93bde5525706db107be884281a57d75def42ba7`。截图只包含 synthetic Source/name/dimensions，无真实路径、素材名、凭据或正式用户数据；人工检查无遮挡、操作分组清楚、metadata 行稳定且无 Search/AI 控件。

## 9. Human Acceptance A-I

- A — First Metadata Build：PASS。4 个合法 synthetic image 进入索引，TXT/invalid/oversized 不进入；MIME、dimensions、size 和 path 正确。
- B — Incremental Refresh：PASS。实际 summary 为 reused 2、added 2、removed 2；unchanged header 未重读。
- C — Delete / Rename：PASS。删除项消失；rename 为 old removed + new itemId。
- D — Authorization Revoke：PASS。Source 保留，metadata list 隐藏，scan fail closed；重新授权后可查看旧 snapshot。
- E — Bounded / Link Safety：PASS。depth/directory/dirent/item/storage 注入边界均保留旧 snapshot；Windows junction 不跟随。
- F — Corruption / Rebuild：PASS。shard corruption 只影响该 Source；显式 rebuild 修复；manifest corruption 保留原字节并显式 reset。
- G — Cancel / Timeout / Multi-window：PASS。授权中取消、mid-scan cancel、timeout 均无 late commit；global active scan=1，第二窗口被 BUSY 拒绝；Storage stale writer 另有 Node 覆盖。
- H — Intelligence Isolation：PASS。Cognition、Creative、Challenge、Raw Skill/Registry、Project、settings/history/credentials fixture 字节不变；Agent Context 不变；Provider call=0。
- I — Formal User Data Isolation：PASS。Node/Electron 只使用 `os.tmpdir()` synthetic source、isolated userData/dataDir 和 temp P1 roots。

## 10. 验证入口

```powershell
npm.cmd run test:inspiration-index
npm.cmd run test:inspiration-index-isolation
npm.cmd run test:inspiration-index-ui-smoke
```

实际结果：

- P3-3：2 组 Node + 1 组 Electron，PASS。
- P3-2：2 组 Node + 1 组 Electron，PASS。
- P3-1：2 组 Node + 1 组 Electron，PASS。
- P1/P2：22/22 Node regression，PASS；Skill benchmark 32/32。
- 既有 P1/P2 Electron：9/9，PASS。
- `test:auto-update`、全部变更 JavaScript `node --check`、`git diff --check`、stage contamination scan、release/version mapping：PASS。
- package、lock top、lock root、Electron `app.getVersion()` 均为 `1.3.0`。
- 全部 P3-3 fixtures 使用 temp profile/source/dataDir/P1 roots；正式用户数据与真实个人素材零触碰。

## 11. Known Non-blocking Limitations

- JavaScript AbortSignal 无法强制中断已经进入的同步 kernel filesystem call；实现通过 1 MiB header 上限、单文件时间检查、目录间异步 yield 和边界复核控制风险，不夸大为 kernel-level cancellation。
- Windows `O_NOFOLLOW` 可用性有限，依靠 lstat/realpath、双 containment、inventory/open/post-read fstat 组合降低 race 风险，不宣称消除全部 kernel-level TOCTOU。
- 没有 watcher 或后台 refresh；UI 只显示“上次索引”，不声称实时同步。
- 显式 manifest corruption recovery 会在 Teemo private index root 保留一份损坏 manifest backup，便于恢复审计；不会写入 Source 目录。

## 12. Review Gate

GPT Strict Review 已完成，当前状态：

```text
P3-3 Visual Metadata Index
CLOSED / PASS / BLOCKERS: 0
```

GPT 返回：`STATUS: PASS / BLOCKERS: 0 / CAN_CLOSE_AND_TAG: YES / NEXT_STAGE_ALLOWED: P3-4`。
审阅记录见 `docs/Teemo-P3-3-GPT-STRICT-REVIEW.md`。
P3-3 close commit 和 annotated recovery tag 已按 Gate 创建；P3-4 尚未开始。

`FORMAL_USER_DATA_TOUCHED: NO`

`REAL_PERSONAL_INSPIRATION_CONTENT_USED_IN_TESTS: NO`
