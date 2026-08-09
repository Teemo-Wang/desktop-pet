# Teemo助理 P1-2 Cognition + Context Builder

> 更新日期：2026-08-09
> 范围：模型无关的个人 Cognition 基础层；不包含正式 Tool Registry、Permission Layer、File/Shell/Git Tool、向量检索、Memory UI 或 Agent 审美人格。

## 1. 架构与接入

```text
Chat / Standalone Chat
        ↓
TeemoAgentCore.run() / runStream()
        ↓
TeemoContextBuilder
  ├─ Teemo Profile
  ├─ Recent Context
  ├─ Current Project Context
  ├─ Existing Skill Context
  └─ Conversation Context
        ↓
AIService
        ↓
GPT / Grok / DeepSeek / OpenAI-compatible Provider

正常回答完成
        ↓（失败不影响回答）
TeemoCognitionCollector
        ↓
Observation → scope 判断 → Profile / Recent / Project
```

Agent Core 只增加两个可选依赖：`contextBuilder` 与 `cognitionCollector`。Context Builder 在模型调用前执行；Collector 在得到正常回答后以旁路 Promise 执行。两者不存在或关闭时，P1-1 路径保持不变。

## 2. 本地数据文件

真实数据文件为：

```text
<TeemoStorageService dataDir>/Teemo-cognition.json
```

默认 dataDir 仍是 `~/.hellobike-pet`；测试通过 `TEEMO_ASSISTANT_DATA_DIR` 或构造参数 `dataDir` 使用隔离目录。服务只通过 `TeemoStorageService.readJson/writeJson` 访问文件，因此继续沿用临时文件、JSON 校验、原子替换和读取失败禁止覆盖保护。首次加载不会主动写文件，只有产生有效 Observation 时才持久化。

为保证完整 Electron 烟测也真正隔离，仍直接使用 `~/.hellobike-pet` 的钉钉、任务上下文、视觉记录、工作统计、音频临时目录和独立聊天上传目录已统一在存在 `TEEMO_ASSISTANT_DATA_DIR` 时改用该目录；未设置环境变量时生产路径不变。

## 3. 数据结构

顶层结构：

```json
{
  "version": 1,
  "profile": [],
  "recentContext": [],
  "projectContexts": {},
  "observations": [],
  "updatedAt": "ISO-8601"
}
```

### Teemo Profile

长期稳定认知项包含 `id`、`observationId`、`category`、`scope: "global"`、`content`、`confidence`、`evidenceCount`、`status`、`supersededBy`、`createdAt`、`updatedAt`、`lastObservedAt`。

只有明确长期表述，或同一普通 Observation 达到重复阈值，才会进入 Profile。项目 Observation 永远不能调用 Profile 升级。

### Recent Context

近期认知项与 Profile 字段一致，但 `scope` 为 `recent`。`createdAt`、`updatedAt` 和 `lastObservedAt` 为未来衰减/过期策略保留时间基础；P1-2 不实现复杂衰减算法。

### Project Context

按 `projectContexts[projectId]` 隔离，每项同时保存 `scope: "project"` 与 `projectId`。项目工作台当前详情页的 `projectId` 和项目元数据会随本轮请求交给 Context Builder；项目认知不会复制到 Profile。

### Observation

Observation 字段：

```json
{
  "id": "obs_...",
  "category": "preference | workflow | goal | constraint | correction",
  "scope": "global | recent | project",
  "content": "用户明确表达",
  "fingerprint": "去空白和标点后的匹配键",
  "confidence": 0.7,
  "evidenceCount": 1,
  "projectId": null,
  "sourceSessionId": "...",
  "status": "active | superseded",
  "supersededBy": null,
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601",
  "lastObservedAt": "ISO-8601"
}
```

同 scope、同 projectId、同 fingerprint 的重复表达会更新原 Observation 的证据次数和时间，不会无限生成重复记录。

## 4. Collector 规则

P1-2 使用保守、可测试的确定性采集器，不调用 AIService，也不进入 Agent Loop，因此不存在 Collector → Agent Core → Collector 递归。

- “以后都 / 以后默认 / 我一直 / 我通常 / 我比较喜欢 / 记住”等明确长期表达：写 Observation，并直接升级为 Profile。
- “最近 / 近期 / 这段时间 / 目前”等表达：写 Recent Context。
- “这次 / 暂时 / 试一下”等临时表达：只写 Recent；存在当前 projectId 且明确提到本项目时写 Project。
- 存在 active projectId 时，风格、色彩、材质、排版、视觉、方案选择等模糊审美表达默认写当前 Project；只有“我一直 / 我平时都 / 所有项目 / 跨项目 / 以后都”等明确跨项目长期表达才允许进入 Profile。
- “这个项目 / 本项目 / 当前项目 / 项目要求”等明确表达：只写对应 projectId。
- 普通偏好：先写 Recent Observation；同类有效表达累计 3 次后可升级 Profile。
- 普通知识问答、随机聊天、没有偏好/目标/约束信号的内容：跳过。

Collector 仅基于用户消息建立认知，绝不把模型回答或模型推测写成用户事实。

## 5. 用户纠正

“不是 / 更正 / 不再 / 现在不 / 只适用于这个项目”等明确纠正优先。服务把匹配的旧 Observation 和对应知识项标为 `superseded`，保留历史，不做全量删除；新表达成为当前 active 认知。

对于“这个只适用于这个项目”这类指代表达，Collector 只在同一 session 内恰好存在一个 active global/recent 候选时，才把旧认知 supersede 并迁入当前 projectId。存在多个候选时不猜测指代：保留旧认知，只记录 correction Observation。

## 6. Context Builder

`TeemoContextBuilder.build()` 生成：

```text
profile
recentContext
projectContext { projectId, metadata, knowledge }
skillContext
conversationContext
priority
budget
systemMessage
```

Skill 和 Conversation 仍保留在现有 messages 中，Builder 只识别、裁剪并放进 Context Bundle，不重复改写聊天历史。新增给模型的 system message 只包含有价值的 Profile、Recent、Project 内容和固定冲突规则。

语义优先级固定为：

```text
当前用户明确指令 > 当前项目 Context > Recent Context > 长期 Teemo Profile
```

不同层级不会在存储中互相覆盖。项目 Context 只改变当前请求的模型行为，不修改长期 Profile。

## 7. Prompt budget

默认总预算约 5200 字符，按 Profile 20%、Recent 20%、Project 28%、Skill 14%、Conversation 18% 分配。每层按 confidence 和 lastObservedAt 排序，只取当前有效、高可信、较新的条目；单条也会裁剪。Context Builder 不读取或注入全部 Observation，不使用 Vector Database、Embedding 或 RAG。

## 8. 隐私边界

Collector 在任何持久化之前检查 API Key、Token、Authorization、Secret、密码、密钥、令牌及常见凭据前缀。命中后整轮跳过，不写 Observation，不写 Cognition，也不输出原文到日志。默认 getter 还会过滤本地文件中可能已经存在的敏感条目，避免被 Context Builder 注入模型。

## 9. 安全降级

- Context Builder 不存在、被关闭或返回空上下文：直接使用原 messages。
- Context Builder 抛错：Run 记录非敏感 `CONTEXT_BUILD_FAILED`，继续调用 AIService。
- Collector 抛错：Run 记录非敏感 `COLLECTOR_FAILED`，用户回答保持成功。
- Collector 不调用模型，不触发 Agent Loop。
- Cognition 数据不进入聊天历史、Skill、项目文件或源码目录。

## 10. Service API

`TeemoCognitionService` 当前提供：

- `getProfile()`
- `getRecentContext()`
- `getProjectContext(projectId)`
- `listObservations()`
- `recordObservation()`
- `promoteToProfile()`
- `updateRecentFromObservation()`
- `updateProjectFromObservation()`
- `supersedeObservation()` / `supersedeSimilar()`
- `remove()`

这些 API 为后续可选 Memory UI 保留，但 P1-2 不新增 UI 页面。

## 11. 验证

自动测试入口：

```powershell
npm.cmd run test:agent-core
npm.cmd run test:cognition
```

`test:cognition` 使用系统临时目录作为隔离 dataDir，并在结束后清理；覆盖明确长期偏好、临时偏好、Recent 时间字段、项目隔离、重复证据升级、用户纠正、敏感信息、Context Bundle、上下文预算、Agent Core 非流式/流式接入、无数据降级、Builder 失败和 Collector 失败/不递归。

## 12. 已知技术债

- Collector 是 P1-2 的保守确定性规则，暂不处理复杂指代、同义表达和跨会话语义聚类。
- Recent 只有时间字段，尚无自动衰减和过期策略。
- 当前项目作用域来自项目工作台详情页；独立聊天窗口没有项目选择 UI，因此默认无 projectId。
- Profile/Recent/Project 暂无用户管理页面，只能通过 Service API 管理。
- Provider 原生 Tool Calling、正式 Tool Registry、Permission Layer、向量检索和 Agent Creative Profile 均不属于本阶段。

## 13. GPT 审阅与封板

首轮审阅确认整体架构符合 P1-2 预期，并要求修正两个 Cognition 正确性风险：active project 中的模糊审美不能进入 Profile；“这个只适用于这个项目”不能随机选择最近认知迁移。修正提交 `a0c2f04` 已补齐保守作用域规则和对应自动测试。

最终复审结论：

```text
P1-2 Teemo Cognition + Context Builder
STATUS: CLOSED
RESULT: PASS
BLOCKERS: 0
```

阶段恢复标签：`v1.1.7-p1.2-cognition-context`。P1-2 封板后不顺带开始 P1-3。
