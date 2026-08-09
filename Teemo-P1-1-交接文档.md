# Teemo助理开发交接文档

> 交接版本：P1-1 Agent Core Foundation
> 交接日期：2026-08-09
> 用途：提供给下一位 Vibe Coding / AI Coding Agent 的唯一接手说明。

## 1. 接手结论

Teemo助理 P1-1 已完成、测试通过、经 GPT 审阅并正式封板。下一位 Agent 应从当前 Git 恢复点继续工作，不要重复实现 P1-1，也不要自动开始未获用户确认的阶段。

当前阶段结果：

```text
P1-1 Agent Core Foundation: CLOSED / PASS
Blockers: 0
```

GPT 的最终审阅结论是：并发 Run 隔离、严格 Action schema 校验、Agent Loop、Abort、maxSteps 和普通聊天兼容均已满足 P1-1 要求；Provider 原生 Tool Calling、Tool Registry、Permission Layer、Cognition 等属于后续技术债。

## 2. 唯一源码与项目身份

正式开发源码只有：

```text
D:\Teemo助手\Teemo机器人项目\Teemo-source
```

产品信息：

```text
产品名：Teemo助理
应用版本：1.1.7
Electron App ID：cn.teemo.assistant
正式开发分支：Teemo/p1-agent-core
远程仓库：https://github.com/Teemo-Wang/desktop-pet.git
```

禁止把以下目录作为长期源码修改：`Teemo-app`、`Teemo-unpacked`、`app.asar`、正式安装目录、`dist` 构建产物。它们只能用于运行、参考、排查或恢复。

## 3. Git 恢复点

```text
P0 稳定恢复点：219b92a / v1.1.6-p0-closed
P1 前产品恢复点：298b5f8 / v1.1.7
P1-1 阶段恢复点：41a39e0 / v1.1.7-p1.1-agent-core
当前分支：Teemo/p1-agent-core
当前 HEAD：5d0cc4e（仅新增本交接文档；P1-1 功能封板点仍为 41a39e0）
```

当前分支已推送到 `origin/Teemo/p1-agent-core`，阶段标签已推送到远程并指向 `41a39e0`。当前工作区应保持干净。接手第一步必须执行：

```powershell
cd D:\Teemo助手\Teemo机器人项目\Teemo-source
git status
git branch -vv
git log --oneline --decorate -n 10
git tag
```

禁止使用 `git reset --hard`、`git clean -fd`、`git checkout .`、`git restore .` 或强制 push 覆盖已有修改，除非用户明确授权并已说明目标。

## 4. 已完成的 P1-1 能力

主要实现：

- `src/agent/TeemoAgentCore.js`：模型无关的 Agent Run/Step 状态机、统一 Action、Agent Loop、maxSteps、Abort/cancel、统一错误结果和并发隔离。
- `tests/TeemoAgentCore.test.js`：direct response、Tool 闭环、多 step、maxSteps、未知 Tool、Tool 异常、Abort、流式包装、并发隔离和非法 Action schema 测试。
- `docs/P1-1-AGENT-CORE.md`：架构、边界和验证记录。
- `src/services/ai.js`：非流式 `send()` 支持 AbortSignal，并继续负责模型 API、Key、Base URL 和 SSE 等底层能力。
- `src/components/chat.js`、`src/app.js`、`index.html`、`Teemo-chat-window/*`：以兼容包装方式接入 Agent Core，保留原 UI、历史、Skill、附件、模型切换和流式停止。

当前仅允许两个完全无副作用的内存测试 Tool：

```text
echo
get_agent_runtime_info
```

它们不能访问本地文件、Shell、Git、系统目录、敏感网络资源或用户 Memory。

## 5. 当前调用关系

普通聊天和流式聊天保持兼容，核心关系如下：

```text
Chat / Standalone Chat
        -> TeemoAgentCore.runStream()
        -> AIService.stream()
        -> GPT / Grok / DeepSeek 等 Provider
```

非流式 Agent Loop 测试路径如下：

```text
TeemoAgentCore.run()
        -> AIService.send()
        -> Normalized Agent Action
        -> Safe Test Tool
        -> Tool Result
        -> AIService.send()
        -> final_response
```

Agent Core 不得直接读取 API Key、拼接 Provider 请求、实现 fetch/SSE 或写入用户历史；这些仍属于 Service/Provider 层。

## 6. 验证方式

接手或修改后至少执行：

```powershell
node --check src/agent/TeemoAgentCore.js
node --check src/services/ai.js
node --check src/components/chat.js
node --check Teemo-chat-window/Teemo-chat-window.js
npm.cmd run test:agent-core
```

需要 Electron 启动验证时，应使用隔离 profile，不能写入正式用户数据。正式构建命令为：

```powershell
npm.cmd run dist:win
```

构建产物在 `dist/`，不要提交 `dist`、`node_modules`、缓存、日志、用户配置、聊天历史、上传文件、私人 Skill/Memory 数据或真实凭据。

## 7. 下一阶段边界

P1-1 已冻结。未经用户明确需求，不要修改 P1-1 的架构或追加功能。

可作为后续阶段规划，但不应在接手初始化时顺带实现：

- P1-2：Teemo Cognition / Context Builder。
- Provider 原生 GPT/Grok/DeepSeek Tool Calling Adapter。
- 正式 Tool Registry。
- Permission Layer。
- File Tool、文件写入/删除、Git Tool、Shell/Execute。
- ComfyUI Agent、Memory/Cognition 数据、移动端和无关 UI 重构。

任何涉及本地文件、系统资源或执行能力的新 Tool，必须通过统一 Permission Layer；不得让模型直接获得无限制系统权限。

## 8. 开发纪律

开始修改前必须先读取 `AGENTS.md`、`PROJECT-STATUS.md` 和与任务相关的文档，确认 Git 工作区并理解调用关系。坚持小范围修改、单一目的提交和受影响模块验证；新建或需要重新命名的项目文件优先使用 `Teemo` 前缀（用户明确指定的固定文件名除外）。

保护正式用户数据：`settings`、`chat-history`、`skills`、`projects`、`todos`、`work-stats` 及 Electron userData 不得清空、覆盖、删除或上传。测试保存/迁移时使用隔离 profile、临时目录、数据副本或 Mock。

不得提交或输出 API Key、Token、密码、Authorization Header、Cookie、Session 或真实账号凭据。发现风险时先报告路径和类型，不要擅自删除本机配置。

## 9. 交付汇报格式

每次任务结束必须说明：

```text
做了什么
修改了哪些文件
为什么这样改
是否修改数据结构或增加配置
执行了哪些测试及结果
剩余风险/技术债
如何回滚
```

如果发现与当前任务无关的旧文档、旧 `js/` 模块或命名兼容路径，不要擅自删除；记录为技术债并保持兼容。规则冲突时，以根目录 `AGENTS.md`、用户当前明确要求和当前 Git 实际状态为准。

## 10. 推荐接手顺序

```text
读取本文件和 AGENTS.md
    -> git status / branch / log / tag
    -> 阅读 PROJECT-STATUS.md 与 docs/P1-1-AGENT-CORE.md
    -> 运行 npm.cmd run test:agent-core
    -> 向用户确认下一阶段目标
    -> 新建独立分支后再开发
```

除非用户明确要求，接手后不要自动安装、重打包、迁移数据、清理旧目录或开始 P1-2。
