# P2-5 Skill Intelligence / Skill Router

## 1. 阶段状态

- Phase：P2-5 Skill Intelligence / Skill Router
- Branch：`Teemo/p2-personal-intelligence`
- Version：`1.2.1`，未自行升版
- State：`IMPLEMENTED / WAITING GPT REVIEW`
- P3：未开始

## 2. Teemo Skill Specification v1

P2-5 建立 schemaVersion 1 的机器可读 Contract。每个 Internal Manifest 包含稳定 `skillId`、name、sourceRef、SHA-256 contentHash、routing status/role/signals/composition/continuity/priority、input/output modality、required/optional tool、permission/dependency 声明、content domain/sensitivity 和独立 overrides。

Raw Skill 是用户安装的真实 SOP/Prompt/Workflow；Manifest 只负责路由。`skills.json` 继续作为既有 Skill 事实源，新增 `rawSource` 原样保存导入 Markdown。Registry 独立存于 `Teemo-skill-registry.json`。导入、自动推断、previewRoute、route、override、重启和普通 Registry 读取都不修改 Raw Skill。

## 3. Import / Manifest / Registry

`TeemoSkillImporter` 只做确定性解析：frontmatter、标题、description、触发条件、适用场景、示例、不适用和 exclusion。没有可靠信号时标记 `needs_review`，不调用 LLM，也不使用 Embedding。

`TeemoSkillValidator` 校验 schema、enum、数组上限、duplicate id、source hash、role、modality 和依赖字段。invalid Manifest 不进入 Router。

`TeemoSkillManifestService` 使用 `TeemoStorageService` 的原子写和 `.teemo-lock` 文件锁，Registry 含 `revision` 与 expectedRevision。双窗口 stale write 返回 `SKILL_REGISTRY_CHANGED`。读取、比较和 migration 写入在同一锁内完成，避免窗口启动覆盖较新的 override。损坏 Registry 不自动重建、不覆盖原文件，Router fail closed 为 `NO_SKILL`，UI 显示异常，普通聊天继续。

Raw Skill 内容更新会重算 contentHash 和 generated metadata，同时保留 aliases、intents、examples、exclusions、role、composition、continuity、modality 和 sensitivity override。reset 只恢复 generated metadata。

## 4. Deterministic Router

`TeemoSkillRouter` Provider-neutral，候选仅来自当前 Registry。信号顺序为 explicit name/id、session continuity、positive example、intent、alias、attachment modality、domain/project enhancer、priority 和稳定 skillId。Domain 与 Project 不能单独触发 Skill。

Hard exclusion 先处理 disabled、needs_review auto route、invalid、modality impossible、manifest exclusion、missing required tool 和 dependency unavailable。required tool 只通过 Registry `has()` 检查；Router 不执行 Tool、不申请 Permission、不授予权限。sensitivity 只是 metadata，adult/sensitive Skill 使用同一 Router，既不自动禁用，也不会因敏感标签泄漏到无关请求。

不确定时返回正常 `NO_SKILL`。同 role 同证据候选返回 ambiguous/NO_SKILL，不随机选择。显式 `needs_review` Skill 仍可用；显式 disabled Skill 不会被静默启用。

## 5. Composition 与 Context

自动组合最多 3 个，Task/Domain/Brand/Utility 每类最多 1 个。存在 Task 候选时固定为 primary，Composer 按 Task、Domain、Brand、Utility 和稳定 skillId 排序。

`TeemoSkillComposer` 只加载被选中的 Raw Skill body，输出一个带 provenance 的 Skill Context。默认总预算 6,000 字符；预算不足时保留 primary 并跳过放不下的 supplement，不线性扩张。Manifest aliases、examples、hash 和 revision 不进入模型。

Agent Core 的实际顺序为 Skill、Cognition、Creative、Challenge、Current User。Skill Context 明确不能覆盖系统规则、当前用户要求、Project 硬约束、Tool Permission 或安全边界。Router/Composer 异常分别记录 `run.skillRoutingError` / `run.skillCompositionError`，不 fail open，不注入半截或全部 Skill，普通聊天继续。

## 6. Session Continuity

`TeemoSkillSessionState` 只存在于 runtime Map。状态使用稳定 sessionId 隔离；缺失 sessionId 可以按当前请求重新 route，但不能读取其他 session continuity。新 session、新窗口和重启默认无 active Skill；Registry 正常持久化。

明显 follow-up 且没有强新意图时可沿用 active Skill。强新意图替换旧 Skill；明确 non-task 或新任务 `NO_SKILL` 清除旧 continuity，避免后续模糊消息恢复无关 Skill。

## 7. UI 与双 Renderer

桌宠 Skill Center 与独立聊天设置页复用现有 Skill UI，显示 Auto Routing 状态、role 和“路由信息待完善”。Routing Metadata 编辑器可修改 status、role、aliases、intents、domains、positive/negative examples、exclusions、composition、continuity、input modality 和 sensitivity；所有修改只写 Registry override。

聊天消息附近显示轻量 `Skill · name` / `Skills · A + B` chip，hover 展示命中原因与高/中置信度，不显示伪概率。Ambiguous 情况可显示“未自动启用 Skill”。桌宠多模态路径已统一进入 Agent Core，独立窗口的旧直接 Skill 注入也已删除。

## 8. 测试、Benchmark 与隔离

新增脚本：

- `test:skill-manifest`
- `test:skill-legacy-import`
- `test:skill-router`
- `test:skill-composition`
- `test:skill-session`
- `test:skill-integration`
- `test:skill-benchmark`
- `test:skill-ui-smoke`

32 条 deterministic benchmark 覆盖 explicit、positive、intent、alias、modality、project enhancer、NO_SKILL、sensitive isolation、两/三 Skill composition 和普通代码/时间/数学问题。专项测试覆盖 Raw Skill byte preservation、hash、idempotent migration、revision、双窗口 newer override、source update、invalid/duplicate、corruption、required tool、permission zero-call、continuity/isolation/restart、message order、send/stream parity、Router/Composer failure。

Electron smoke 使用独立 `TEEMO_ASSISTANT_DATA_DIR` 和 userData，验证实际 Skill UI、why matched、NO_SKILL、multi-Skill、continuity、session isolation、override、Raw bytes、restart 和 unreadable fail closed。正式用户 Cognition、settings、history、projects、skills、authorized roots、credentials、Creative State 和素材库未参与测试。

## 9. 阶段边界

P2-5 未实现 LLM Router、Embedding、Vector DB、Semantic Search、自动学习 Router、行为追踪数据库、Safety Engine、Provider Capability Matrix、GUI Automation、Cloud Sync、Multi-Agent 或 P3 Inspiration。GPT 固定门禁 PASS 前不得创建 P2-5 recovery tag；PASS 后只能进入 P2 Final Acceptance。
