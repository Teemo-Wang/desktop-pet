# Current Task

## 当前阶段

- Product：Teemo助理
- Branch：`Teemo/p2-personal-intelligence`
- Phase：P2-1 Cognition UI / Memory Center
- State：`CLOSED / PASS / BLOCKERS: 0`
- App Version：`v1.2.1`
- P1 Recovery Tag：`v1.2.0-p1-agent-foundation`
- P2-1 Recovery Tag：`v1.2.0-p2.1-cognition-ui`
- Guardrail：P2-1 已封板；没有新的明确任务书时不得进入 P2-2

## 封板后维护

- `v1.2.1` 修复手动新增认知的 1,000 字符静默截断，并支持最多 12,000 字符的长内容自动拆分。
- P2-1 原恢复标签 `v1.2.0-p2.1-cognition-ui` 不移动；维护标签为 `v1.2.1-cognition-input`。

## 本阶段已实现

- 「Teemo 对我的了解」一级页面
- Profile / Recent / Project / inactive 查看与过滤
- Observation 依据
- 手动新增、纠正/修改、不再适用、scope migration
- Cognition enabled 开关
- sensitive filtering、revision conflict 和跨窗口 reload
- `test:cognition-management` 与隔离 Electron UI smoke

## 封板结果

1. 实现提交：`fa13978 Teemo: add P2-1 cognition center`。
2. P1 全量回归、Cognition management、Electron 隔离 UI smoke、版本与 diff 检查全部 PASS。
3. GPT「Teemo助手升级」严格审阅结论：`STATUS: PASS / BLOCKERS: 0 / REQUIRED_FIXES: 无`。
4. 封板提交与恢复标签：`Teemo: close P2-1 cognition center` / `v1.2.0-p2.1-cognition-ui`。
5. 停止在 P2-1；不自动进入 P2-2。

## 禁止扩展

本任务不开发 P2-2 Agent Creative Profile、P2-3 Creative Director、P2-4 智能 Collector，也不增加桌面自动化、Embedding、Vector DB、RAG 或 hard delete。
