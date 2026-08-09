# Teemo助理 P2-3 Creative Director / Challenge Mode

> 状态：`IMPLEMENTED / WAITING REVIEW`
> 分支：`Teemo/p2-personal-intelligence`
> 基线：`bd49022` / `v1.2.1-p2.2-creative-profile`
> 应用版本：`1.2.1`（P2-3 未修改）

## 1. 产品目标

P2-3 让 Teemo 在用户需要时，使用 P2-2 已有的专业判断主动指出风险、挑战审美惯性，并提出真正不同的设计方向。它是 Interaction Policy，不建立第二套审美原则，也不扮演攻击性的“创意总监人格”。

长期架构保持独立：Project 是任务事实与硬约束，Skill 是工作规范，Cognition 了解用户，Creative Profile 提供专业判断，Challenge 决定当前是否更主动地质疑与拓展，未来 Inspiration 提供视觉参考。

## 2. 模式与运行时状态

仅有两种 mode：`balanced` 和 `challenge`。新 session、新窗口和应用重启始终为 balanced。Challenge 状态只保存在 renderer 内存中的 `TeemoCreativeDirectorSessionState` Map，按稳定 `sessionId` 隔离，不写入聊天历史或任何 JSON。缺失 session identity 时不读写共享 renderer fallback：session activate/exit fail balanced，one-shot challenge 只允许当前 Run 生效。

Runtime schema：`schemaVersion: 1`、`mode`、`intensity`、`source`、`updatedAt`。Intensity 仅有 `light`、`standard`、`strong`；非法 mode/intensity/source 被拒绝。

- light：1–2 个关键风险；开放式探索最多 2 个方向。
- standard：默认强度，2–3 个核心问题；开放式探索 2–3 个方向。
- strong：3–5 个关键风险；开放式探索 3 个方向，仍须专业、具体，不攻击用户。

## 3. 命令与生命周期

`TeemoCreativeDirectorPolicy` 使用 deterministic parser，不调用模型。解析优先级为 Exit > One-shot Suppression > 明确否定 > Activate > One-shot，并返回 controlSpan、consumedText 与 remainingUserContent。纯控制语句不进入 Cognition；复合消息只移除控制片段，剩余实质内容继续走既有 Collector。引号内命令以及翻译、解释、引用、文档示例不产生状态副作用。

- Session activate：“开启挑战模式”“接下来用挑战模式”等。
- One-shot challenge：“挑战一下这个方案”“从反方向看看”等；仅当前 Run 生效。
- Exit：“退出挑战模式”“恢复常规判断”等。
- One-shot suppression：Session 已开启时，“这次别挑战”只让当前 Run balanced，下一轮继续 Challenge。
- “这个项目挺有挑战”不会切换 mode。

## 4. Context Architecture

Agent Core 新增可选 `challengeContextBuilder`，send 与 stream 共用同一个 `_prepareMessages`。实际顺序：

```text
Skill system
< Cognition system
< Creative system
< Challenge system
< current user
```

Challenge 复用 P2-2 `isCreativeRelevant`；Project、Skill 或附件不能单独触发。Session Challenge ON 时，非设计问题不注入 Creative/Challenge，但 session 状态继续保持。

Challenge Overlay 默认最多 900 字符，Creative + Challenge 正常总量不超过 2,300 字符。mandatory core 先写入，包含：

1. Challenge 是基于证据的压力测试，不为反对而反对。
2. 当前用户明确要求 > 项目硬约束 > Skill > Creative/Challenge。
3. 不编造未知项目事实、不可见图片内容或虚假指标。
4. 开放式方向至少在 2 个实质差异轴上不同，不得只换颜色或措辞。

预算连 mandatory 都放不下时不注入半截 Context，返回 `CHALLENGE_CONTEXT_BUDGET_TOO_SMALL` 并按 balanced 降级。Builder 异常记录 `run.challengeError`，正常 P2-2 Creative Context 与聊天继续。

## 5. 证据与方向多样性

可用证据仅限当前文本、可见附件、Project、Skill、Cognition、Creative 与已有会话事实。信息不足时降低确定性，不声称不存在的业务目标、品牌规范、转化数据、用户反馈或 A/B 结果。

开放式探索提供 2–3 个方向；任意两个方向至少在构图/信息架构、视觉语言/材质、叙事隐喻、品牌记忆、字体图形、动效交互、传播策略中的 2 个轴上实质不同。约束太强时允许只给 2 个，不为凑数制造伪方向。

窄任务继续直接执行，例如“按钮放大 10%”最多附带相关风险，不强制生成 3 套方案。所有质疑仍在用户、Project 和 Skill 明确约束之下。

## 6. Creative Dependency 与隔离

Creative Profile disabled 或 `CREATIVE_PROFILE_STATE_UNREADABLE` 时，Challenge fail closed、session 回到 balanced、UI 控件禁用；普通聊天继续。Challenge 不修改 Creative Defaults、Creative State、Cognition、Project、Skill，不使用 Tool 或 Permission。纯开启/退出/one-shot/suppression 控制语句在进入 Cognition Collector 前标记为 `challenge_runtime_command` 并跳过；复合消息仅剥离控制 span，remainingUserContent 继续沿用既有 Cognition 收集规则。

GPT、Grok、DeepSeek 等 Provider 在 Agent Core 上游接收同一 Overlay。Provider 切换不改变 Session State、Creative Profile 或 Cognition。

## 7. UI

“Teemo 的设计判断”页面新增“设计评审模式”区域：常规/挑战 segmented control，以及轻度/标准/强 intensity control。Principles、Dimensions、Lens 继续只读。

聊天输入区新增稳定尺寸的快速状态按钮，显示“常规”或“挑战 · 强度”。One-shot 完成后短暂显示“本轮 · 挑战”，不改变 Toggle。每个窗口和每个 session 独立；新窗口与重启恢复常规。

## 8. 自动测试

新增：

```powershell
npm.cmd run test:creative-director
npm.cmd run test:challenge-context
npm.cmd run test:creative-director-ui-smoke
```

覆盖 default/session/restart/window isolation、同 renderer Session A/B、缺失 identity、三档强度、命令优先级、one-shot/suppress、引用防误触、混合消息 control span、Creative relevance、图片正反例、disabled/unreadable、预算、mandatory、Context 顺序、send/stream、Provider A/B、Builder failure、Cognition/Creative 字节隔离和 Direction Diversity Contract。

Electron smoke 使用独立 `userData` 与 `TEEMO_ASSISTANT_DATA_DIR`，验证默认常规、强挑战、双窗口隔离、重启、Creative OFF、session command、one-shot，以及没有 Challenge/Director 持久化文件。视觉截图检查页面非空、控制区清楚且未遮挡原有内容。

## 9. 人工验收 A-H

- A 偏好冲突：mandatory policy 要求区分“符合极简偏好”与“继续简化会削弱品牌记忆”，PASS。
- B 硬约束：Project 必须红色仍高于 Challenge，只允许挑战红色内部层级、材质和构图，PASS。
- C 窄修改：Context 明确直接完成小修改，最多附带风险，不强制发散，PASS。
- D 开放探索：2–3 个方向且任意两个至少 2 个差异轴，不允许只换颜色/措辞，PASS。
- E Strong：3–5 个风险、开放时 3 个方向，同时禁止攻击或贬低用户，PASS。
- F 信息不足：禁止编造业务事实和指标，必须降低确定性，PASS。
- G 图片不可见：禁止假装看过不可见内容；只有附件加评价意图才触发，PASS。
- H 普通问题：Challenge session ON 时“今天星期几”不注入 Creative/Challenge，session 仍保持，PASS。

人工验收采用 Context Inspection 与 Mock AI，不对真实模型做不稳定的固定文本断言。

## 10. 隐私与 Non-goals

测试未读取或修改正式 Cognition、Creative State、settings、history、skills、projects、authorized roots、credentials 或个人素材库。P2-3 不新增私人数据文件。

本阶段未实现 P2-4 Cognition Intelligence、P2-5 Skill Router、P3 Inspiration、Creative Calibration、Provider Native Tool Calling、GUI/Browser/Blender/Photoshop 自动化、Screen Capture、Multi-Agent 或复杂 Persona。

## 11. Known Risks

- 命令与 relevance 是保守确定性规则，未来应使用真实设计对话样本建立 precision/recall benchmark。
- Window-local runtime 不建立 Event Bus；同一历史 session 在不同 renderer 中仍各自 balanced/challenge，符合当前隔离要求。同一 renderer 内始终使用当前会话稳定 id；未知 identity 不共享状态。
- Context Contract 能约束模型行为，但 P2-3 不以真实 Provider 的语义输出作为稳定自动化断言。

## 12. 审阅状态

实现、专项隔离测试、P1/P2-1/P2-2 全量回归、三个 Electron UI smoke、版本检查、语法检查与 `git diff --check` 均已通过，当前严格保持 `IMPLEMENTED / WAITING REVIEW`。GPT 返回 `PASS / BLOCKERS: 0 / CAN_CLOSE_AND_TAG: YES` 前不创建 P2-3 恢复标签，不开始 P2-4。
