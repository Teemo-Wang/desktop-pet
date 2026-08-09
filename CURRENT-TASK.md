# Current Task

## 当前阶段

- Product：Teemo助理
- Branch：`Teemo/p2-personal-intelligence`
- Phase：P2-2 Agent Creative Profile
- State：`IMPLEMENTED / WAITING REVIEW`
- App Version：`v1.2.1`
- P1 Recovery Tag：`v1.2.0-p1-agent-foundation`
- P2-1 Recovery Tag：`v1.2.0-p2.1-cognition-ui`
- Guardrail：P2-2 必须经 GPT 严格审阅后才可 PASS/CLOSED；用户已明确授权审阅通过后自动继续 P2-3、P2-4 和 P2 总验收

## 封板后维护

- `v1.2.1` 修复手动新增认知的 1,000 字符静默截断，并支持最多 12,000 字符的长内容自动拆分。
- P2-1 原恢复标签 `v1.2.0-p2.1-cognition-ui` 不移动；维护标签为 `v1.2.1-cognition-input`。

## P2-2 已实现

- 独立 Default Creative Profile：schema 1 / profile 1.0.0、10 条原则、9 个维度、6 个 Domain Lens
- 相关性门控和 1,400 字符预算的 Creative Context Builder
- Agent Core 可选平行注入、Provider-neutral 一致性和失败独立降级
- 用户 > 项目 > Skill > Creative Judgment 约束优先级
- “Teemo 的设计判断”只读页面、独立开关和 revision 冲突保护
- `test:creative-profile`、`test:creative-context` 与隔离 Electron UI smoke

## 当前验收进度

1. P2-2 实现和专项隔离测试已完成。
2. P1/P2-1 全量回归、静态检查、版本检查和完整 diff 审核均已通过。
3. 实现提交 `095ca4c Teemo: add P2-2 creative profile`；GPT 首轮审阅的 5 个 blocker 已修复并通过专项及全量回归，等待复审。
4. GPT 审阅前不创建 P2-2 closed tag，不标记 PASS/CLOSED。
5. 审阅通过并修复全部 blocker 后，按用户授权自动进入 P2-3、P2-4，直至 P2 总验收、构建、安装和重启完成。

## 禁止扩展

P2-2 不提前开发 P2-3、P2-4 或 P3 Inspiration；不增加桌面自动化、Provider Native Tool Calling、Embedding、Vector DB、RAG、素材库 Connector 或 hard delete。后续阶段只在当前阶段经 GPT 审阅通过后启动。
