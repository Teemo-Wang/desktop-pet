# Current Task

## 当前阶段

- Product：Teemo助理
- Branch：`Teemo/p2-personal-intelligence`
- Phase：P2 FINAL ACCEPTANCE
- State：`READY / P2-5 CLOSED`
- App Version：`v1.2.1`
- P1 Recovery Tag：`v1.2.0-p1-agent-foundation`
- P2-1 Recovery Tag：`v1.2.0-p2.1-cognition-ui`
- P2-2 Recovery Tag：`v1.2.1-p2.2-creative-profile`
- P2-3 Recovery Tag：`v1.2.1-p2.3-challenge-mode`
- P2-4 Recovery Tag：`v1.2.1-p2.4-cognition-intelligence`
- P2-5 Recovery Tag：`v1.2.1-p2.5-skill-intelligence`

## P2-5 已实现

- Teemo Skill Specification v1、Raw Skill/Manifest 分离、SHA-256 source hash 和原样 `rawSource`。
- revisioned/locked `Teemo-skill-registry.json`，双窗口 optimistic concurrency，损坏 fail closed 且不覆盖原字节。
- deterministic Provider-neutral Router；NO_SKILL、explicit、ambiguity、hard exclusion、required-tool availability 和 adult/sensitive 同架构。
- 最多 3 个、每 role 最多 1 个的 Skill Composition；6,000 字符总预算和 provenance。
- runtime-only session continuity；missing sessionId、新窗口、新 session 和 restart 隔离。
- Agent Core 统一 send/stream 与两个 Renderer；消息顺序为 Skill、Cognition、Creative、Challenge、Current User。
- 两个既有 Skill UI 的 Routing Metadata override、状态和聊天 Skill chip。
- 整轮 negative/meta/question/comparison suppression，统一阻止 textual explicit、`explicitSkillId`、auto 与 continuity 回流。
- hard-rejected Session 清理与 multi-Skill survivor retention；invalid Manifest 隔离、合法邻居 save/reset、双 UI 显式 Repair 和重启持久化。
- 8 组专项测试、32 条 benchmark 与隔离 Electron smoke 已通过。

## 当前验收进度

1. P2-5 实现、专项测试和 22 Node / 9 Electron 全量回归完成；文档见 `docs/P2-5-SKILL-INTELLIGENCE.md`。
2. GPT 四轮 strict review 最终确认 `PASS / BLOCKERS: 0 / CAN_CLOSE_AND_TAG: YES`。
3. P2-5 关闭提交与恢复标签固定为当前阶段恢复点，不移动 P2-1 至 P2-4 的既有标签。
4. 当前只执行 `P2-FINAL-ACCEPTANCE`：验证 P2-1 至 P2-5 跨模块契约、完整回归、版本、标签和安装包。
5. 只有 P2 Final Acceptance PASS 后才构建正式 Windows installer、安装并重启 Teemo助理。
6. 不进入 P3。

## 禁止扩展

当前不得开发 P3 Inspiration、Semantic Search、Embedding、Vector DB、LLM Router、自动学习 Router、行为追踪数据库、Safety Engine、Cloud Sync、Multi-Agent、GUI Automation 或 Provider Native Tool Calling。P2 Final Acceptance 只做验收、文档、恢复点和发布安装，不新增功能。
