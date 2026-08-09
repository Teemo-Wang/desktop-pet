# P1-5 Safe File Tools

> 阶段状态：实现与本地验证完成，等待 GPT 审阅。分支：`Teemo/p1-agent-core`。

## 目标与边界

P1-5 为 Agent 增加第一组真实本地文件能力，同时保持“用户先授权文件夹、每次敏感工具调用再经过 Permission Layer”的双层授权。正式工具只有：

- `list_directory`、`read_file`、`search_files`、`search_text`：`read`
- `create_file`、`patch_file`、`rename_file`：`write`

本阶段没有删除、Shell/Execute、Git、网络、Browser、ComfyUI、Memory、Provider Native Tool Calling、批量改写或并行工具能力。Agent 不能新增或扩大授权根目录；授权目录仍只能由现有设置 UI 和系统目录选择器维护。

## 安全执行链

```text
model args
  -> renderer TeemoToolRegistry schema validation
  -> Main TeemoFileService first canonicalization + authorized-root containment
  -> owner-bound, short-lived prepared operation
  -> canonical file:/// permission resource
  -> Main TeemoPermissionService allow / prompt / deny
  -> one-use execution authorization bound to toolCallId + session + tool + permission + resource
  -> Main consumes authorization
  -> second canonicalization + containment + identity checks
  -> bounded file I/O
  -> Tool Result envelope
```

模型路径不会直接成为 Permission Resource。`resolvePermissionResource` 是可信 Tool Definition hook：它经 `TeemoFileClient` 请求 Main 准备操作，只把规范化 URI、安全原因和不透明 operation ID 交回 Registry。权限请求不包含完整 arguments、文件内容或凭据。

Main 中的准备操作绑定 `webContents.id`，只能使用一次并有过期时间。即使 renderer 绕过 Registry 直接调用文件执行 IPC，只要 Main 未消费到与该 `toolCallId` 精确匹配的中央授权凭证，都会返回 `PERMISSION_CHECK_FAILED`。拒绝、超时、abort 或 late allow 不会执行 I/O，准备操作会被释放。

## Windows 路径与授权根目录

`TeemoFileService` 是真实路径与 I/O 的唯一可信实现。它拒绝：

- NUL、UNC、`\\?\`、`\\.\`、URI-like path 与 NTFS ADS `file:stream`
- 显式 `..` traversal
- 授权根目录的相似前缀逃逸
- Windows 尾随空格/点、非法字符与设备保留名的新文件名
- symlink / junction 解析后落到授权根目录之外

已存在路径通过 `realpath` 解析；新文件通过“父目录 realpath + 单一 basename”生成。权限等待前后会再次比较规范路径、授权根、目标/父目录文件身份和目标存在状态；资源被替换、根授权被撤销或链接目标变化时返回 `FILE_RESOURCE_CHANGED`。文件 URI 使用 `pathToFileURL` 生成稳定的 `file:///D:/...` 形式，Resource Matcher 使用路径段边界而不是裸前缀匹配，并拒绝 `file://server/...` UNC URI。

## 读取与搜索

所有限制集中在 `TeemoFileService.limits`：读取字节、返回文本、可补丁字节、创建字节、补丁条数、目录项目、搜索文件数、结果数、深度和累计读取字节均有上限。

- `read_file` 返回 path/type/size/content 或 extractedText/truncated/sha256/modifiedAt。
- 普通文本必须是有效 UTF-8；拒绝 UTF-16、NUL/binary 和未知编码。
- PDF/DOCX 只允许抽取文本，不允许写入。
- 搜索默认忽略 `node_modules`、`.git`、`dist`、`cache`、`.cache`。
- 目录列举通过 `opendir` 到达上限后停止，不构造无限结果集。
- 递归搜索对每个候选再次 `realpath` 并检查授权根，链接不能把搜索带到根目录外。

## 保守写入语义

写入仅允许集中白名单中的纯文本扩展名，例如 `.txt`、`.md`、`.json`、`.js/.cjs/.mjs`、`.ts/.tsx/.jsx`、`.css/.scss`、`.html`、`.py`、`.ps1`、`.yaml/.yml`、`.xml`、`.csv`。PDF、DOCX、图片、视频、压缩包、数据库、EXE/DLL 和其他二进制格式不可写。

### create_file

- 使用 `wx` 独占创建；没有 check-then-overwrite 窗口。
- 目标已存在时失败，不提供 overwrite 参数。
- JSON 新文件必须可解析。

### patch_file

- 强制 64 位 `expectedSha256`。
- 每个 `oldText` 必须精确出现一次：0 次为 `PATCH_TARGET_NOT_FOUND`，多次为 `PATCH_TARGET_AMBIGUOUS`。
- 全部 edits 先在内存验证；不是无条件整文件覆盖接口。
- 读取时会截断的文件、超过 patch 上限的文件、非 UTF-8/binary 文件不可补丁。
- 原 JSON 有效时，补丁后 JSON 仍必须有效。
- 同目录创建 `Teemo-patch-*.tmp`，写入、fsync、哈希复核并再次检查源哈希后原子替换。
- 同一 expected hash 的并发补丁只有一个成功，另一个因资源身份或哈希冲突失败。

### rename_file

- 只处理单个普通文件，要求 `expectedSha256`。
- 源与目标必须位于同一个授权根，源/目标扩展名都必须在文本写白名单。
- 目标必须不存在；使用 exclusive hard-link + unlink 完成不覆盖重命名，并在 unlink 失败时回滚目标链接。

P1-5 没有删除工具。

## 生产接入

Main 启动一个 `TeemoFileService`、一个 `TeemoPermissionService` 和一套文件 IPC。桌宠与独立聊天窗口各自创建 Renderer Client 与 Registry，但都通过 `TeemoFileTools.createDefinitions/register` 得到相同 7 个 Definition，并共享 Main 的授权根、permission grants、pending request、audit 与执行授权源。

现有 `nodeIntegration: true`、legacy upload/document UI 以及旧 renderer 直读逻辑仍是项目级技术债。本阶段保护的是 Agent Tool 执行边界，没有宣称完成 Electron sandbox / contextIsolation 重构，也没有擅自改写既有附件体验。

## 测试与隔离验证

- `npm.cmd run test:file-tools`：PASS
- `npm.cmd run test:tools`：PASS
- `npm.cmd run test:permissions`：PASS
- `npm.cmd run test:agent-core`：PASS
- `npm.cmd run test:cognition`：PASS
- 受影响 JavaScript `node --check`：PASS

`tests/TeemoFileTools.test.js` 覆盖路径规范化、traversal/UNC/device/ADS、相似前缀、junction 逃逸、目录/读取/搜索、默认忽略、截断、UTF-8/写类型、独占创建、精确补丁、歧义/缺失目标、JSON 校验、expected hash、same-hash 并发冲突、同根重命名、授权撤销、资源替换、abort、动态 permission resource、deny/late allow、Main IPC owner 绑定、单次执行和直接 IPC 权限旁路拒绝。

Electron 双 renderer 集成烟测使用：

```text
C:\Users\Teemo\Documents\Codex\2026-08-09\w\work\Teemo-P1-5-electron-smoke-final-20260809
```

该目录包含独立 `--user-data-dir` 与 `TEEMO_ASSISTANT_DATA_DIR`。烟测输出 `TEEMO_FILE_TOOLS_ELECTRON_SMOKE_PASS`，验证两 renderer Definition 完全一致、共享 Main session grant、read/write prompt、deny、create、expected-hash patch 及 abort/late allow。

完整应用使用：

```text
C:\Users\Teemo\Documents\Codex\2026-08-09\w\work\Teemo-P1-5-app-smoke-final-20260809
```

以隔离 profile/data 启动 10 秒，Main 文件/权限服务、桌宠 renderer File Client/Definitions 和原 Agent/Cognition 初始化无报错。仅出现既有 CSP 警告与隔离环境缺少语雀本地配置的预期提示。没有读取或修改正式 settings、chat history、cognition、skills、projects 或其他用户数据。

## 回滚与剩余边界

实现提交完成后可用该提交的父提交回到 P1-4 封板点 `dd1331f`；不要使用破坏性 reset 覆盖用户改动。P1-5 在 GPT 确认前不创建阶段 tag。

剩余边界：Electron sandbox/contextIsolation、历史 UI 直读文件、持久权限管理中心、删除、Git、Shell/Execute 和 Provider 原生 Tool Calling 均不属于本阶段。
