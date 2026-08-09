# P1-3 Tool Registry

> 阶段状态：`CLOSED / PASS` ｜ GPT 审阅：`BLOCKERS: 0` ｜ 实现提交：`5bed161` ｜ 恢复标签：`v1.1.7-p1.3-tool-registry`

## 阶段目标与边界

P1-3 把 P1-1 中用于闭环验证的具体 Tool 映射迁移为统一、模型无关的 `TeemoToolRegistry`。本阶段只注册 `echo` 和 `get_agent_runtime_info` 两个纯内存、无副作用 Tool，不包含 Permission、文件、Git、Shell、网络、ComfyUI、Memory、Provider Adapter、并行 Tool Calling 或 Tool UI。

## 架构

```text
User
  -> TeemoAgentCore
  -> normalized tool_request
  -> TeemoToolRegistry.execute
     -> lookup
     -> input validation
     -> controlled execution context
     -> handler
     -> normalized result envelope
  -> TeemoAgentCore
  -> AIService
  -> final_response
```

`TeemoAgentCore` 只接收注入的 Registry，并且只调用 `registry.execute(...)`。它不再保存 `toolName -> function` 映射，也不包含 `echo`、`get_agent_runtime_info` 或未来真实 Tool 的 handler。

## Tool Definition Contract

```js
{
  name: 'echo',
  description: 'Return the provided text without side effects.',
  inputSchema: {
    type: 'object',
    properties: { text: { type: 'string' } },
    required: ['text'],
    additionalProperties: false,
  },
  metadata: { category: 'system', sideEffect: 'none' },
  handler: async (arguments, context) => ({ text: arguments.text }),
}
```

- `name` 必须是稳定且唯一的 snake_case；重复注册抛出 `TOOL_ALREADY_REGISTERED`，不会覆盖旧 handler。
- `description`、根类型为 object 的 `inputSchema` 和函数 `handler` 必填。
- `metadata` 仅保存分类和副作用提示；P1-3 不读取它做 Permission 决策。
- 非法 Definition 抛出 `INVALID_TOOL_DEFINITION`。单次注册是原子的，已注册 Tool 不受失败注册影响。

## Input Schema

Registry 内置轻量、JSON Schema 兼容的校验器，没有新增第三方依赖。当前支持 object、array、string、number、integer、boolean、null，以及 required、properties、additionalProperties、enum、items、字符串长度/正则和数字上下限。Tool 根输入必须是 object。

arguments 缺失时按空 object 处理；null、数组等非 object 输入，缺少 required、类型错误或禁止的额外字段均返回 `TOOL_ARGUMENT_VALIDATION_FAILED`。校验失败时 handler 调用次数为 0。

## Tool Result Contract

成功：

```js
{
  ok: true,
  tool: 'echo',
  toolCallId: 'tool_call_...',
  status: 'completed',
  startedAt: 'ISO-8601',
  finishedAt: 'ISO-8601',
  data: { text: 'hello' },
}
```

失败使用同一基础字段，并将 `data` 替换为 `error: { code, message }`。错误类别包括：

- `UNKNOWN_TOOL`
- `TOOL_ARGUMENT_VALIDATION_FAILED`
- `TOOL_HANDLER_FAILED`
- `TOOL_CANCELLED`
- `TOOL_REGISTRY_INTERNAL_ERROR`

handler 的原始异常文本不会进入返回给模型的 envelope，避免意外泄漏内部信息。

## Tool Call ID 与 Run/Step

每次 `execute` 都生成独立 `toolCallId`，优先使用 `crypto.randomUUID()`，兼容环境回退为时间戳和随机串。Agent Core 把 Registry envelope 关联到当前 `runId`、`sessionId` 和 `step`，并在 `run.toolCalls` 中保存：

```text
toolCallId / name / arguments / step / status /
startedAt / finishedAt / result / error
```

这些数据只存在当前内存 Run 中；P1-3 没有新增持久化审计日志。

## Execution Context 与 Abort

handler 只收到冻结的受控 context：

```js
{ runId, sessionId, step, signal }
```

API Key、Token、settings、Electron app、Agent Core 实例和 Node 全局对象不会由 Registry 传入 Tool。`AbortSignal` 在执行前已取消时 handler 不会运行；handler 执行期间或返回后发现取消时统一返回 `TOOL_CANCELLED`，Agent Core 继续收敛为既有的 `AGENT_CANCELLED` Run 状态，不进入下一 Step。

## 内置 Tool 与生命周期

`src/tools/TeemoBuiltinTools.js` 是桌宠 renderer 和独立聊天 renderer 的唯一内置 Definition 来源。两个 Electron renderer 属于不同 JavaScript 进程，不能共享同一个对象实例；各自在启动时创建一次稳定 Registry，并复用到该 renderer 的所有 Agent Run，而不是每 Step 重建或重复注册。

- `echo`：要求 `text: string`，原样返回 `{ text }`。
- `get_agent_runtime_info`：不接收额外字段，只返回非敏感的 runId、sessionId、step 和测试标记。

## Provider 独立性与公开 Definition

Registry 不包含 GPT、Grok、DeepSeek 或其他 Provider 分支。`registry.listDefinitions()` 只导出 `name`、`description`、`inputSchema` 的深拷贝，不暴露 handler、metadata、内部 Map 或执行 context。未来 Provider Adapter 可以转换这些公开定义，但不属于 P1-3。

## Cognition 与日志安全

P1-2 Cognition 未被改造成 Tool，也没有新增 Profile/Observation 修改入口。Collector 仍只分析原始用户消息；失败的 Tool Run 不触发成功回答采集，因此 Tool 参数、结果和错误不会自动成为用户偏好。

Registry 和 Agent Core 不记录 arguments 或完整 result 到生产日志。未来如增加审计日志，只允许默认记录 tool name、toolCallId、runId、status、duration 和 error code。

## 验证

- `npm.cmd run test:tools`：PASS
- `npm.cmd run test:agent-core`：PASS
- `npm.cmd run test:cognition`：PASS
- Electron：PASS。最终使用 `C:\Users\Teemo\Documents\Codex\2026-08-09\w\work\Teemo-P1-3-smoke-20260809-122052` 下独立的 `--user-data-dir` 与 `TEEMO_ASSISTANT_DATA_DIR` 启动 10 秒；主进程和 renderer 持续运行，Agent Core、Tool Registry、Cognition 均无初始化错误。日志中只有既有的 CSP 开发警告，以及隔离环境缺少 `yuque-teams.local.json` 的预期提示。

测试覆盖合法/非法/重复注册、失败隔离、公开定义、参数 Schema、handler 零调用保护、内置 Tool、未知 Tool、handler 异常、Abort、统一 envelope、toolCallId 唯一性，以及 Agent Core 非流式/流式 Tool 闭环、并发隔离、maxSteps、Action 校验和 P1-2 回归。

烟测首先发现并修复了 Electron renderer 的 UMD 相对 `require` 解析问题；修复后重新执行全部自动测试和隔离烟测均通过。烟测没有读取或修改正式用户数据，结束时仅停止了与该隔离 profile 精确匹配的 Electron 测试进程。

## 技术债与 P1-4 预留

- 当前校验器只实现 P1 所需 JSON Schema 子集；未来 Tool 需要 `oneOf`、`$ref` 等高级能力时再评估成熟校验库。
- 当前每个 Step 只允许一个 Tool Request，不支持并行 Tool Calling。
- metadata 已预留但没有任何 allow/deny 行为；正式 Permission Layer 留给 P1-4。
- Tool Call 仅在完成后写入 Run；未来实时审计/UI 可增加执行中事件，但不得改变 Registry 的统一入口。
- P1-4 起权限状态必须由中央 Permission Service 维护；两个 renderer 可以保留独立 Registry 实例，但不能各自维护互不一致的授权状态。

## GPT 封板结论

GPT 逐项对照原 P1-3 任务书后确认：Agent Core/Registry 已解耦，统一 Contract、错误收敛、Provider 独立性、安全边界和 P1-1/P1-2 回归均符合预期；未发现必须留在 P1-3 修复的问题。

```text
P1-3 Tool Registry
STATUS: CLOSED
RESULT: PASS
BLOCKERS: 0
```
