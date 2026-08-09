# Teemo助理 P2-2 Agent Creative Profile

> 状态：`CLOSED / PASS / BLOCKERS: 0`
> 分支：`Teemo/p2-personal-intelligence`
> 应用版本：`1.2.1`（P2-2 实现阶段未修改版本）

## 1. 产品定位

Agent Creative Profile 回答“Teemo Agent 认为怎样才是好的设计”。它提供稳定、专业、可解释的设计判断，不等同于用户个人偏好，也不根据聊天或收藏自动改写。

三套长期智能保持独立：

- Teemo Cognition：了解用户是谁、喜欢什么、近期关注什么和项目偏好。
- Agent Creative Profile：Teemo Agent 自己的专业设计判断。
- Personal Inspiration Intelligence（未来 P3）：理解用户收藏、素材与视觉参考。

三者未来可以在 Context 组装层并行使用，但不能共用事实库，也不能由其中一套直接修改另一套的核心事实。

## 2. Default Profile 与 Schema

默认 Profile 位于 `src/creative/TeemoCreativeProfileDefaults.js`，属于版本化产品配置：

- `schemaVersion: 1`
- `profileVersion: 1.0.0`
- 10 条 Core Principles
- 9 个 Evaluation Dimensions
- 默认权重合计 100
- 6 个 Domain Lenses：General、Brand、Marketing、UI、3D、Motion
- Response Policy：区分用户偏好与专业判断、解释冲突、信息不足时降低确定性、不输出伪精确分数、不适用维度可跳过

核心原则覆盖目标优先、信息层级、品牌识别、有效简洁、目的性创新、记忆锚点、独立判断、执行质量、媒介上下文和确定性校准。

评价维度与默认权重：目标适配度 18、视觉层级 14、品牌识别 14、清晰性与可用性 12、构图与节奏 10、字体 8、色彩与材质 8、创新与记忆 8、执行与落地 8。

## 3. Creative Context Builder

`src/creative/TeemoCreativeContextBuilder.js` 是独立、模型无关的 Context Source。Agent Core 通过可选的 `creativeContextBuilder` 注入它，与 Cognition Builder 平行；Creative Builder 失败只记录 `creativeError` 并安全降级，不中断 Cognition 或正常聊天。

Builder 每轮读取最新开关，只在设计评审、视觉优化、品牌、营销视觉、UI/UX、3D、Motion 等相关请求中注入。当前用户意图是主信号，Project 与 Skill 中的设计词不能单独触发；设计任务中的“这个怎么样”“再优化一下”等弱表达需要已有设计上下文才触发。普通聊天不注入；视觉附件只有同时存在评审、优化、选择或建议意图时才触发。

Domain Lens 根据当前用户请求、已加载 Skill Context 与 Project Context 检测，未知场景回退 General。默认预算为 1,400 字符。Profile 版本、角色、约束优先级、偏好/专业判断边界和禁止编造项目事实属于 mandatory core，先写入且不可被预算裁剪；剩余预算再用于原则、领域关注和评价维度。

约束优先级明确为：

1. 当前用户明确要求
2. 当前项目约束
3. 已加载 Skill 规范
4. Creative Judgment

Creative Profile 只能在约束内提出专业建议，不能重写用户、项目或 Skill 约束。Cognition 与 Creative 可以同时注入；任一开关关闭只影响对应 Context Source，两者都关闭时保留原会话、项目和 Skill 链路。

## 4. Provider 一致性

Profile 和 Builder 位于 Agent Core 上游，不写入 AIService 或任一 Provider Adapter。GPT、Grok、DeepSeek 及其他 OpenAI-compatible Provider 接收同一份 Creative system message，不存在 Provider 专属 Creative Identity。

## 5. 开关、存储与隐私

本地状态由 `src/creative/TeemoCreativeProfileService.js` 管理，默认保存到：

```text
<TeemoStorageService dataDir>/Teemo-creative-profile.json
```

状态文件只包含 `schemaVersion`、`profileVersion`、`enabled`、`revision` 和 `updatedAt`。专业原则、维度、权重与 Lens 始终来自源码，不复制到用户数据文件。

开关采用 latest-read 与 optimistic revision，跨窗口旧快照返回 `CREATIVE_PROFILE_CHANGED`，不会覆盖新状态。损坏 JSON 继承 TeemoStorageService 的读取失败禁止覆盖保护，同时以 `CREATIVE_PROFILE_STATE_UNREADABLE` fail closed：本轮不注入、UI 显示读取异常且原文件保持不变，不会静默恢复 enabled=true。

Creative Service 不读取或写入 `Teemo-cognition.json`、聊天历史、设置、Skills、Projects、授权根、凭据或个人素材库。Cognition Collector 不能修改 Creative Profile；用户偏好、收藏与未来 Inspiration 结果也不能自动修改它。

## 6. UI

独立聊天侧栏新增一级入口“Teemo 的设计判断”。页面只读展示：

- Profile 版本与独立启用开关
- 10 条专业原则
- 9 个评价维度及权重
- 6 个可切换 Domain Lens
- “了解你”与“设计判断”的区别
- 用户、项目、Skill、Creative 的约束优先级

页面不允许任意编辑 Principles，不包含 Creative Calibration、Challenge Mode、素材库、Pinterest、Eagle、Figma Inspiration、Embedding 或视觉检索入口。

## 7. 测试与隔离

新增测试：

```powershell
npm.cmd run test:creative-profile
npm.cmd run test:creative-context
npm.cmd run test:creative-ui-smoke
```

单元测试覆盖默认 Schema、版本、唯一 ID、权重总和、Lens 回退、开关持久化、revision 冲突、损坏状态保护，以及 Cognition Collector 不能修改 Creative State。

Context 测试覆盖相关性门控的误触发/弱表达/图片边界、800 字符最坏预算下 mandatory policy、实际 message 顺序、Cognition 与 Creative 四种开关组合、项目与 Skill 约束、Provider A/B 一致消息、send/stream 一致注入、跨实例 reload/revision，以及 Creative Builder 或状态读取失败时的独立降级。

Electron smoke 使用独立 `TEEMO_ASSISTANT_DATA_DIR` 和 Electron profile，验证真实页面、10 条原则、9 个维度、6 个 Lens、只读边界、开关跨重启持久化、损坏状态关闭并显示错误，以及状态文件不包含原则正文。测试不读取或修改正式 Cognition、设置、历史、Skills、Projects、授权根、凭据或个人素材库。

## 8. 人工体验 Scenario A-E

- A：普通非设计聊天不出现 Creative Context。
- B：设计评审请求出现对应 Lens 的紧凑专业判断。
- C：用户偏好与专业判断冲突时区分两者并解释依据。
- D：项目或 Skill 有明确限制时在限制内给建议，不改写限制。
- E：关闭 Creative 后仅停止 Creative 注入；Cognition 与普通聊天继续工作，重启后状态保持。

## 9. 阶段边界

P2-2 没有实现 P2-3 的 Creative Director、Challenge Mode、Explorer Mode 或 Creative Calibration，也没有实现 P2-4 的 Cognition 智能采集升级。

P3 Personal Inspiration Intelligence 仍只保留架构边界。当前没有 Inspiration Connector、Eagle/Pinterest/Figma 集成、Embedding、Vector DB、以图搜图、素材自动标签、跨库检索或灵感学习。未来 Inspiration Context 应作为 Agent Core 的第三个独立可选 Context Source 接入，不得复用或修改 Creative Profile Service。

## 10. 审阅与封板

GPT 首轮严格审阅给出 5 个 blocker：恢复点证据、mandatory policy 预算、relevance 边界、损坏状态 fail-safe、流式与跨实例验证；均已完成小范围修复并通过第二轮全量回归。GPT 复审结论：`STATUS: PASS / BLOCKERS: 0 / REQUIRED_FIXES: 无 / CAN_CLOSE_AND_TAG: YES / NEXT_STAGE_ALLOWED: P2-3`。

恢复点核验：`v1.2.0-p2.1-cognition-ui` 是 annotated tag，tag object 为 `5b04b7b...`，peeled commit 仍为原封板提交 `8eaa7aec...`，远程 peeled tag 一致；`v1.2.1-cognition-input^{}` 为 `528a493`，是 P2-2 实现提交 `095ca4c` 的直接父提交，因此 1.2.1 维护版本在 P2-2 开始前已经存在。

实现提交：`095ca4c Teemo: add P2-2 creative profile`。审阅修复提交：`78f1a8d Teemo: harden P2-2 creative context`。阶段恢复标签：`v1.2.1-p2.2-creative-profile`。
