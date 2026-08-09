# P1-4 Permission Layer

> 阶段状态：`CLOSED / PASS` ｜ GPT 审阅：`BLOCKERS: 0` ｜ 实现提交：`625cd1f` ｜ 恢复标签：`v1.1.7-p1.4-permission-layer`

## 目标与边界

P1-4 在 P1-3 Registry 与 Tool handler 之间增加统一 Permission Layer，回答“当前 Tool Call 是否被允许执行”。本阶段只通过内存 Mock Tool 验证 read/write/execute，不新增正式 File、Git、Shell、网络、ComfyUI、Memory 或 Provider Tool。

```text
Agent Core
  -> TeemoToolRegistry (lookup + schema validation)
  -> TeemoPermissionService
     -> none: allow
     -> matching grant: allow
     -> no grant: prompt
     -> deny / timeout / abort / error: fail closed
  -> Tool handler
  -> existing Tool Result envelope
```

Permission 不属于模型、Cognition、单个 Tool handler 或任一 renderer。GPT、Grok、DeepSeek 及后续模型只能请求 Tool，不能自行授权。

## 权限等级与 Tool metadata

统一风险等级：

- `none`：纯计算、纯内存、无系统副作用。
- `read`：读取资源但原则上不修改状态。
- `write`：修改用户数据、文件或外部状态。
- `execute`：运行程序、命令或可能产生不可预测副作用的能力。

Tool 在 P1-3 metadata 中声明：

```js
metadata: {
  category: 'test',
  permission: 'write',
  resource: 'teemo-test://project-a/root',
  permissionReason: 'Verify a harmless mock action.',
  sideEffect: 'mock_only',
}
```

`echo` 和 `get_agent_runtime_info` 已显式声明 `permission: 'none'`。Registry 对 none 直接允许；缺失或非法 permission metadata 统一 `PERMISSION_CHECK_FAILED`，handler 不执行。Agent Core 不根据 Tool 名称猜权限。

## Decision Contract

Permission Service 使用明确三态：

```js
{ decision: 'allow', source: 'none_required' }
{ decision: 'allow', source: 'session_grant', scope: 'session', grantId: '...' }
{ decision: 'prompt', permission: 'write', source: 'no_matching_grant' }
{ decision: 'deny', reason: 'user_denied', source: 'user' }
```

Registry 只在 `decision === 'allow'` 时调用 handler。deny、timeout、cancel 和检查异常继续使用 P1-3 Tool Result envelope，不建立第二套结果：

- `PERMISSION_DENIED`
- `PERMISSION_TIMEOUT`
- `PERMISSION_CHECK_FAILED`
- Abort 继续为 `TOOL_CANCELLED`，Agent Core 收敛为 `AGENT_CANCELLED`

## Permission Request Contract

Main Process 产生独立 `permissionRequestId`，并与 P1-3 的 toolCallId/runId/sessionId 关联。发送到 UI 的请求只包含：

```js
{
  permissionRequestId,
  toolCallId,
  runId,
  sessionId,
  toolName,
  permission,
  resource,
  reason,
  createdAt,
}
```

Registry 不把 arguments、handler、settings、Prompt、文件内容或认证凭据送入权限服务/UI。所有文本有长度上限并去除换行控制符。

## once / session / resource

- `once`：只允许当前 pending permissionRequestId/toolCallId；不写 grant。当前调用结束后下一调用重新 prompt。
- `session`：Main 内存 grant 绑定 sessionId、toolName、permission，以及存在时的 resource；新 session 不继承，应用重启不恢复。
- `resource`：Main 内存 grant 额外要求明确 resource，并按 URI 的 protocol、host 和路径段边界匹配。

P1-4 只接受 `teemo-test://` 一类可规范化 URI 做资源测试，不实现真实 Windows 文件路径 scope。匹配不会使用裸 `startsWith`：`.../root/file` 属于 `.../root`，`.../rooted` 不属于。P1-5 必须在现有安全 path normalization 基础上实现真实文件资源适配。

没有 persistent allow-all、全局 execute 白名单或永久无限授权。

## 中央 Source of Truth 与 IPC

`main.js` 启动唯一 `TeemoPermissionService`，session grants、pending requests 和 audit 都只保存在 Main Process 内存。桌宠和独立聊天 renderer 各自的 Registry 注入 `TeemoPermissionClient`，但所有决策通过同一个中央服务。

IPC Contract：

- `teemo-permission:request`
- `teemo-permission:prompt`
- `teemo-permission:respond`
- `teemo-permission:cancel`
- `teemo-permission:evaluate`
- `teemo-permission:list`
- `teemo-permission:revoke`
- `teemo-permission:clear-session`

Renderer 没有 grant 接口，不能直接写 Permission Store。Main 将 pending permissionRequestId 绑定发起请求的 `webContents.id`；另一个 renderer 即使获得 ID，也不能替它提交 allow/cancel。Renderer 只能请求、响应自己的 pending UI、查询展示用 grants 或撤销授权。

## 最小确认 UI

`TeemoPermissionPrompt` 使用 DOM `textContent` 显示已脱敏的 toolName、permission、resource、reason，提供：

- 拒绝
- 允许一次
- 本会话允许

它不显示完整 arguments、文件内容或凭据。请求因 abort/timeout 失效时 Client 会 dismiss 对应对话框；迟到的 allow 因 Main pending 已移除而返回 false，不能复活 Tool。

生产环境当前没有 read/write/execute Tool，因此正常聊天不会出现权限框。自动测试可向 Main Service 注入 Decision Provider，无需点击真实 UI。

## Agent 状态、Abort 与 Timeout

当中央服务实际发出 prompt，Registry 通过内部 callback 将 Run 状态设为 `permission_waiting`；授权完成后进入 handler，随后继续既有 `continuing`。none 或已有 grant 不进入等待状态。

AbortSignal 在 Registry 执行前、权限等待中、权限返回后和 handler 返回后均检查。Renderer Client 在 abort 时向 Main cancel 当前 toolCallId/permissionRequestId；Main 删除 pending，UI 的后续响应无效。

默认 timeout 由 `TeemoPermissionService` 单点配置为 60 秒，测试可覆盖短 timeout。超时返回 `PERMISSION_TIMEOUT`，handler 调用为 0。

## Fail Closed

- permission=none 不依赖 Permission Service，服务异常时仍保持安全 Tool 正常。
- read/write/execute 在 service 缺失、抛错、请求非法、scope 非法或 UI 失败时拒绝执行。
- Tool arguments 中即使包含 `permission: 'allow'` 也不会影响 metadata 和中央决策。
- Registry 的 permissionService 只在实例构造时注入，单次 execute context 不能替换它。

## Audit、日志与 Cognition 隔离

Main 内存 Audit 只记录：permissionRequestId、toolCallId、runId、sessionId、toolName、permission、decision、scope、createdAt、resolvedAt。它不记录 arguments、result、文件内容、API Key、Token、Authorization 或密码。

本阶段没有生产权限日志或 Audit UI，也没有任何 Permission 持久化。Permission 不写入 `Teemo-cognition.json`，Permission Request/Decision 不进入 Collector 或 Observation；P1-2 Collector 仍只分析原始用户自然语言。

## 测试与隔离烟测

- `node --check` 全部受影响 JavaScript：PASS
- `npm.cmd run test:permissions`：PASS
- `npm.cmd run test:tools`：PASS
- `npm.cmd run test:agent-core`：PASS
- `npm.cmd run test:cognition`：PASS
- `git diff --check`：PASS

`test:permissions` 覆盖 none/read/write/execute 基础决策、allow once、session 隔离、resource 边界、revoke、deny、abort+late allow、timeout、fail closed、缺 metadata、两个客户端共享中央状态、敏感数据不进入 request/audit，以及 Agent Core `permission_waiting` 闭环。

Electron IPC 集成烟测使用 `C:\Users\Teemo\Documents\Codex\2026-08-09\w\work\Teemo-P1-4-ipc-smoke-20260809-123249` 的隔离 profile/data 运行两个隐藏 renderer，验证：中央 session grant 只 prompt 一次、allow once 第二次重新决策、deny handler=0、abort handler=0、none 不调用 provider，输出 `TEEMO_PERMISSION_ELECTRON_SMOKE_PASS`。

完整应用使用 `C:\Users\Teemo\Documents\Codex\2026-08-09\w\work\Teemo-P1-4-app-smoke-20260809-123302` 的独立 `--user-data-dir` 和 `TEEMO_ASSISTANT_DATA_DIR` 启动 10 秒，Main Permission Service、桌宠 renderer Registry/Client、Agent Core 和 Cognition 无初始化错误。仅有既有 CSP 警告与隔离环境缺少语雀本地配置的预期提示。

没有读取或修改正式 settings、chat history、Cognition、skills、projects 或其他正式用户数据。

## 已知技术债与 P1-5 预留

- 当前 Permission Layer 保护 Agent Tool 执行路径，不是 Electron renderer 沙箱。项目既有 `nodeIntegration: true` 和历史 UI/IPC 能力仍是独立安全债；后续需规划 contextIsolation/preload 收敛，但不在 P1-4 大改。
- Main 内存授权不会跨应用重启；本阶段有意不实现永久授权。
- resource 只支持测试 URI；P1-5 需要接入 TeemoFileService 的 canonical path 和 root containment，不能复制简化匹配。
- Tool Call 完成后才完整写入 run.toolCalls；实时审计 UI 可在后续增加 lifecycle event。
- Permission UI 是最小确认对话框，没有权限管理中心、批量授权或持久化设置。
- P1-5 必须让可信 FileService 先 canonicalize 模型参数并检查 authorized root，再生成 Permission Resource；用户授权后、实际 I/O 前必须第二次 canonicalize/containment，防止路径、symlink 或 junction 在等待期间变化。

## GPT 封板结论

GPT 重点审阅了中央事实源、跨 renderer 一致性、IPC owner 绑定、fail closed、Abort/late allow、resource scope 和敏感数据边界，确认这些关键安全约束均已闭环，没有仍属于 P1-4 的阻塞项。

```text
P1-4 Permission Layer
STATUS: CLOSED
RESULT: PASS
BLOCKERS: 0
```
