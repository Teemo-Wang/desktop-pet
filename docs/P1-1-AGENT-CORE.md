# Teemo助理 P1-1 Agent Core 基础骨架

> 更新日期：2026-08-09
> 范围：P1-1，仅建立 Agent Run/Step 循环；不包含 Memory、正式 Tool Registry、Permission Layer、文件写入、Shell、Git 或 ComfyUI Tool。

## 1. 当前调用关系

```text
Chat / Standalone Chat
        ↓
TeemoAgentCore.runStream()
        ↓
AIService.stream()
        ↓
AI Provider
```

P1-1 的安全闭环测试使用非流式入口：

```text
AgentCore.run()
  ↓
AIService.send()
  ↓
Normalized Agent Action
  ↓
echo / get_agent_runtime_info
  ↓
tool result message
  ↓
AIService.send()
  ↓
final_response
```

## 2. 新增文件

- `src/agent/TeemoAgentCore.js`：模型无关的 Agent Run/Step 状态机、动作标准化、循环、取消和统一错误结果。
- `tests/TeemoAgentCore.test.js`：内存 Mock 测试，验证 direct、tool 闭环、多步、最大步骤、未知 Tool、Tool 错误和 Abort。
- `docs/P1-1-AGENT-CORE.md`：本架构与验收记录。

## 3. 修改文件

- `src/services/ai.js`：非流式 `send()` 接受调用方 `AbortSignal`；AIBrain 请求也沿用该 signal。
- `index.html`、`Teemo-chat-window/Teemo-chat-window.html`：加载 Agent Core。
- `src/app.js`、`Teemo-chat-window/Teemo-chat-window.js`：初始化 Agent Core。
- `src/components/chat.js`、`Teemo-chat-window/Teemo-chat-window.js`：普通聊天通过 `runStream()` 兼容包装现有流式调用。
- `package.json`：增加 `test:agent-core`。
- `PROJECT-STATUS.md`、`CHANGELOG.md`：记录 P1-1 状态。

## 4. Agent Run / Agent Step

每次运行都有运行时对象：

```text
runId / sessionId / model
status / step
messages / toolCalls
startedAt / finishedAt / error
```

状态包括 `idle`、`thinking`、`tool_waiting`、`continuing`、`completed`、`cancelled`、`failed`。默认最大步骤为 4，可在单次调用中传入更小的 `maxSteps`。运行状态不写入正式聊天历史或用户数据目录。

## 5. Agent Action Contract

Agent Core 只接受统一动作：

```json
{"type":"direct_response","content":"..."}
{"type":"tool_request","tool":"echo","arguments":{"text":"..."}}
{"type":"final_response","content":"..."}
```

普通文本会兼容降级为 `direct_response`。供应商协议差异不进入 Agent Core；后续模型适配应在 AIService/Provider 层完成。

## 6. P1-1 安全测试 Tool

- `echo`：原样返回输入文本。
- `get_agent_runtime_info`：只返回当前 `runId`、`step` 和 `test: true`。

它们只在内存中运行，不访问本地文件、系统目录、网络敏感资源、Shell、Git 或用户 Memory。P1-1 没有建立正式 Tool Registry。

## 7. 兼容性

- 普通聊天仍使用现有 `AIService.stream()`，现在由 `TeemoAgentCore.runStream()` 管理 Run/Step 外壳。
- 保留流式 UI、停止生成、模型切换、历史会话、Skill 注入和附件上下文。
- Agent Core 不读取 API Key、不直接 `fetch` 模型接口、不改变聊天历史数据结构。
- 非流式 Agent Loop 用于测试和后续 Tool Calling 接入；当前聊天默认不要求模型输出动作 JSON。

## 8. 验证结果

已执行：

```powershell
node --check src/agent/TeemoAgentCore.js
node --check src/services/ai.js
node --check src/components/chat.js
node --check Teemo-chat-window/Teemo-chat-window.js
npm.cmd run test:agent-core
```

结果：全部通过，输出 `TeemoAgentCore tests passed`。测试使用内存 Mock，没有写入正式用户数据。

补充状态机验证：

- 并发 Run 使用独立 `runId`、`sessionId`、messages、toolCalls 和 AbortSignal；测试中取消 Run A 不影响 Run B 继续完成，Run A 的数据不会混入 Run B。
- Action 最小 schema 会拒绝缺失 `type`、未知 `type`、缺失/空 `tool`、非对象 `arguments` 和损坏的 JSON Action；拒绝时为 `INVALID_ACTION`，且没有 Tool 被执行。
- 普通非 JSON 文本仍兼容归一为 `direct_response`。

已使用隔离 profile `D:\Teemo助手\Teemo-p1-1-agent-core-smoke-profile` 启动 Electron 开发版 8 秒。应用持续运行，渲染进程成功加载 `TeemoAgentCore`；没有 Agent Core 初始化错误。隔离 profile 缺少本地语雀配置，因此日志显示语雀读取不可用，这是测试隔离造成的预期结果，不影响 Agent Core。本阶段没有修改正式用户数据。

## 9. 技术债与 P1-2 前检查

- 当前 Provider 尚未把原生 GPT/Grok/DeepSeek Tool Calling 响应转换为统一 Action；P1-2 前需先确定 Provider Adapter 方案。
- 当前聊天默认使用 `disableActionContract` 兼容模式，避免改变用户可见输出；正式 Agent 模式需要独立入口或明确路由策略。
- `activeRuns` 为内存 Map，应用退出即释放，符合 P1-1 不持久化要求。
- Tool Registry、Permission Layer、Context Builder、Memory/Cognition 均未实现，不应在本提交中继续扩展。

## 10. 回滚方式

回滚本阶段单一提交即可恢复 P1-1 前状态；P0 恢复点仍为 `v1.1.6-p0-closed`，v1.1.7 稳定点为本阶段提交创建前的 `v1.1.7` 标签。
