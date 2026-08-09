# Current Task

## 当前阶段

- Product：Teemo助理
- Branch：`Teemo/p2-personal-intelligence`
- Phase：P2-4 Cognition Intelligence
- State：`IMPLEMENTED / WAITING REVIEW`
- App Version：`v1.2.1`
- P1 Recovery Tag：`v1.2.0-p1-agent-foundation`
- P2-1 Recovery Tag：`v1.2.0-p2.1-cognition-ui`
- P2-2 Recovery Tag：`v1.2.1-p2.2-creative-profile`
- P2-3 Recovery Tag：`v1.2.1-p2.3-challenge-mode`
- P2-4 Recovery Tag：尚未创建；必须等待 GPT PASS 门禁

## P2-4 已实现

- 保持 Cognition v2 与唯一 `Teemo-cognition.json` 事实源，无 read-time migration。
- 新增 deterministic Intelligence：composite identity、exact dedup、freshness、effective confidence、conflict、promotion eligibility 和 relevance。
- Recent 跨至少 2 个自然日且至少 3 次有效证据才可晋升；单日 burst、conflict、stale、Project、Manual Recent 均阻止自动晋升。
- Collector 单轮一次持久化，revision 冲突最多 retry 1 次；第二次冲突非致命跳过。
- Context 保持 5200 字符预算、project isolation 和 stale exclusion，并将 Cognition 明确包装为不可信用户派生 data。
- Memory Center 增加轻量状态、有效可信度、最后确认和 evidence count。
- 新增四套专项测试；完整 P1/P2 回归和隔离 Electron smoke 已通过。

## 当前验收进度

1. P2-4 任务书已由同一 GPT 对话确认：`TASKBOOK READY: YES / IMPLEMENTATION ALLOWED: YES`。
2. 实现与自动测试完成；文档见 `docs/P2-4-COGNITION-INTELLIGENCE.md`。
3. 下一步创建 implementation commit：`Teemo: add P2-4 cognition intelligence`。
4. 将 108 项实现报告发送到“Teemo助手升级”对话，等待严格审阅。
5. 只有 `STATUS: PASS / BLOCKERS: 0 / CAN_CLOSE_AND_TAG: YES` 才能封板并创建 P2-4 recovery tag。

## 禁止扩展

当前不得提前开发 P2-5 Skill Specification/Router 或 P3 Inspiration；不得增加 Embedding、Vector DB、LLM Collector、Cloud Sync、Multi-Agent、GUI Automation 或 Provider Native Tool Calling。GPT FAIL 时只修 P2-4 blocker。
