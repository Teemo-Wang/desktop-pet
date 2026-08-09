# Current Task

## 当前阶段

- Product：Teemo助理
- Branch：`Teemo/p2-personal-intelligence`
- Phase：P2-5 Skill Intelligence / Skill Router
- State：`IMPLEMENTED / WAITING GPT REVIEW`
- App Version：`v1.2.1`
- P1 Recovery Tag：`v1.2.0-p1-agent-foundation`
- P2-1 Recovery Tag：`v1.2.0-p2.1-cognition-ui`
- P2-2 Recovery Tag：`v1.2.1-p2.2-creative-profile`
- P2-3 Recovery Tag：`v1.2.1-p2.3-challenge-mode`
- P2-4 Recovery Tag：`v1.2.1-p2.4-cognition-intelligence`
- P2-5 Recovery Tag：尚未创建；必须等待 GPT PASS 门禁

## P2-5 已实现

- Teemo Skill Specification v1、Raw Skill/Manifest 分离、SHA-256 source hash 和原样 `rawSource`。
- revisioned/locked `Teemo-skill-registry.json`，双窗口 optimistic concurrency，损坏 fail closed 且不覆盖原字节。
- deterministic Provider-neutral Router；NO_SKILL、explicit、ambiguity、hard exclusion、required-tool availability 和 adult/sensitive 同架构。
- 最多 3 个、每 role 最多 1 个的 Skill Composition；6,000 字符总预算和 provenance。
- runtime-only session continuity；missing sessionId、新窗口、新 session 和 restart 隔离。
- Agent Core 统一 send/stream 与两个 Renderer；消息顺序为 Skill、Cognition、Creative、Challenge、Current User。
- 两个既有 Skill UI 的 Routing Metadata override、状态和聊天 Skill chip。
- 8 组专项测试、32 条 benchmark 与隔离 Electron smoke 已通过。

## 当前验收进度

1. 同一 GPT 对话已给出完整 P2-5 任务书：`TASKBOOK READY: YES / IMPLEMENTATION ALLOWED: YES`。
2. 实现与专项验证完成；文档见 `docs/P2-5-SKILL-INTELLIGENCE.md`。
3. 正在运行完整 P1/P2 回归并整理 implementation patch/test evidence。
4. 下一步创建 implementation commit：`Teemo: add P2-5 skill intelligence`，提交同一 GPT 对话 strict review。
5. 只有 `PASS / BLOCKERS: 0 / CAN_CLOSE_AND_TAG: YES` 才能关闭并创建 `v1.2.1-p2.5-skill-intelligence`。
6. P2-5 PASS 后进入 `P2-FINAL-ACCEPTANCE`；P2 Final PASS 后构建、安装并重启，不进入 P3。

## 禁止扩展

当前不得开发 P3 Inspiration、Semantic Search、Embedding、Vector DB、LLM Router、自动学习 Router、行为追踪数据库、Safety Engine、Cloud Sync、Multi-Agent、GUI Automation 或 Provider Native Tool Calling。GPT FAIL 时只修 P2-5 blocker。
