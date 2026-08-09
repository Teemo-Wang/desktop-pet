# Teemo助理 P2-4 Cognition Intelligence

> 状态：`IMPLEMENTED / WAITING REVIEW`
> 分支：`Teemo/p2-personal-intelligence`
> 应用版本：`1.2.1`
> 边界：只实现 P2-4；未实现 P2-5、P3、Embedding、Vector DB、LLM Collector、Cloud Sync、Multi-Agent 或 GUI Automation。

## 1. 目标与 v2 兼容

P2-4 在既有 Cognition v2 上增加确定性 Intelligence 层，使上下文选择更相关、更及时、更可信，同时保持唯一事实源为 `Teemo-cognition.json`。顶层 `version` 仍为 `2`，没有第二套 Cognition 数据库，也没有启动时或读取时迁移。

旧 v2 文件可以原样读取。freshness、effective confidence、conflict、promotion eligibility、relevance 和 UI state 都在运行时派生，不写回历史条目。新证据或用户操作发生写入时，可向对应 Observation/Knowledge 增加向后兼容的 `evidenceDays` 最小日期数组，用于跨自然日晋升保护；日期格式为 UTC `YYYY-MM-DD`、去重排序并最多保留最近 64 天。缺失该字段的旧条目使用 `createdAt`、`lastObservedAt`、`updatedAt` 回退，不会因读取而改写。

## 2. Intelligence Architecture

新增 `src/cognition/TeemoCognitionIntelligence.js`，它是 Provider-neutral 的纯确定性模块，负责：

- 安全 normalization 与 content fingerprint。
- `content + scope + category + projectId` composite identity。
- exact dedup、自然日证据和 freshness bands。
- effective confidence、明确同目标冲突和 promotion eligibility。
- 基于当前用户文本与近期对话的轻量 relevance/ranking。
- Management Snapshot 的运行时 derived metadata。

`TeemoCognitionService` 仍负责 v2 数据和结构化管理 API；Collector 只解析用户真实输入并提交一次原子业务 mutation；Context Builder 只消费派生候选，不调用 Provider、LLM、Embedding 或网络服务。

## 3. Normalization 与 Dedup

Normalization 只做 NFKC、首尾空白、连续空白、data URI 过滤和 fingerprint 层标点统一，不摘要、不改写同义词、不猜测意图。手动保存正文仍走现有长文本路径，Context 截断不会反向修改 Storage 原文。

自动 exact identity 为：

```text
normalized content + scope + category + projectId（仅 project）
```

相同 identity 的重复证据只增加 `evidenceCount`、`lastObservedAt` 和 `evidenceDays`，不创建重复 active cognition。不同 scope、category 或 projectId 不会被模糊合并；“喜欢简洁科技感”和“偏爱克制未来视觉”不会被规则判断为同一条。

## 4. Scope 与自动采集

Collector 保持保守 deterministic，并继续只分析用户输入或 P2-3 parser 返回的 `remainingUserContent`：

- 明确 Project 或 active project 下的设计域内容进入当前 projectId。
- 明确 Recent / 临时表达进入 Recent。
- 无 active project 的明确长期表达可直接进入 Profile。
- active project 下普通“以后默认”仍归 Project；只有“所有项目 / 跨项目”等明确跨项目表达进入 Global。
- 普通偏好默认 Recent；Project Cognition 永不自动晋升。
- Creative Profile、Challenge runtime、Skill 正文和未来 Inspiration 数据都不参与 scope 推断。

凭据过滤只拦截 credential-like value，例如赋值形态 API Key/Token/Password、Bearer 和已知 token 格式。“密码学风格视觉”、成人向/NSFW 项目题材不会仅因关键词失效；系统不保存原始图片或附件 bytes。

## 5. Evidence、Confidence 与 Freshness

Stored Confidence 保持 v2 原语义，不批量改写。Effective Confidence 由 stored confidence、freshness 和 conflict 状态确定性计算并限制在 `0..1`；UI 只显示高/中/低。手动认知原有 stored confidence 为 1，因此保持高可信，但不覆盖当前用户、项目或 Skill 约束。

Recent freshness 使用最新有效证据时间：

- `fresh`：0-14 天
- `current`：15-45 天
- `aging`：46-90 天
- `stale`：大于 90 天

Profile 始终 `stable`，不做时间衰减；Project 只按 projectId 隔离。stale Recent 保留在 Memory Center，普通 Context 默认排除；重新确认同一 exact identity 后恢复 fresh。freshness 变化不会触发文件写入。

## 6. Correction、Conflict 与 Promotion

明确且唯一的 correction target 会把旧 Observation/Knowledge 标记 superseded，保留历史，不 hard delete。指代可能对应多个候选时不猜测，旧候选保持 active，新 correction 处于待确认状态，交由后续明确输入或 Memory Center 操作解决。

冲突检测只覆盖同 scope/project、同确定性 target、明确正反 polarity 的状态，不做开放式语义矛盾推断。unresolved conflict 会降低 effective confidence、显示“有冲突”并阻止自动 promotion。

普通 Recent 自动晋升必须同时满足：

- 同一 active composite identity 至少 3 次证据。
- 证据跨至少 2 个自然日。
- 仍未 stale。
- 没有 unresolved conflict。
- 不是 correction 或 temporary。

同一天连续重复只增加 evidence，不会晋升。Manual Recent 尊重用户选择，不自动晋升；Project 无论重复多少次都不自动晋升。

## 7. Context Ranking 与 Prompt Injection Boundary

总预算仍为默认 `5200` 字符，没有扩大。候选优先级是：

```text
当前用户明确指令 > Current Project > Relevant Recent > Relevant Profile
```

每层内部使用 keyword overlap、design domain、personal-profile query、effective confidence、freshness 和 updated time 排序。generic follow-up 可结合最近六条对话恢复相关关键词，但 Skill 正文不作为偏好事实参与 query。无 active project 时不读取任何 Project Cognition；Project A 永不召回 Project B。普通无关问题不会因为 Profile 数量少而无条件注入；Profile 只有在当前请求达到设计域/关键词相关阈值、用户明确询问自身偏好，或已有相关对话支持 generic follow-up 时才进入 Context。

Cognition 以 `<teemo_cognition_data>` 包裹的 JSON data rows 注入，并明确声明为不可信用户派生数据。`System:`、`assistant:`、`developer:`、命令和代码只保留为字符串，不改变 message role，不获得系统、工具、权限或安全规则的权力。Context 超预算时按完整 data row 跳过，不产生破损结构。

## 8. Concurrency、Enabled 与失败降级

Collector 一轮把 correction、Observation、Recent/Project、promotion 合并为一次锁内持久化和一次 revision 增量。六个 P2-1 Management 写 API 与 Collector 使用同一文件锁；锁内重新读取并检查 expectedRevision。Collector 冲突时重新读取、重算并最多 retry 1 次；第二次仍冲突返回非致命 `COGNITION_CONCURRENT_CHANGE`，不会无限重试或重复 evidence。

P2-1 management API 和 stale expectedRevision 的 `COGNITION_CHANGED` 行为保持。跨 renderer 下一次 Builder/Collector/Refresh 仍 latest-read 同一事实源。

`enabled=false` 时 Collector 0 写入、Builder 不注入 Cognition、Memory Center 仍可查看已有数据。损坏 JSON 标记 `unreadable` 并 fail closed：Collector skip、Context 不注入 Cognition、UI 显示异常、Storage 拒绝覆盖原文件。Intelligence/Builder 异常由 Agent Core 记录 `CONTEXT_BUILD_FAILED`，普通 send/stream 继续且不会把未排序的全部 Memory 当作 fallback 注入。

## 9. Memory Center UI

继续使用现有“Teemo 对我的了解”，没有新增一级导航或 Analytics Dashboard。卡片轻量增加：

- 状态：稳定、近期、逐渐陈旧、已陈旧、有冲突、待确认。
- Effective Confidence 的高/中/低标签。
- 最后确认日期与 evidence count。

新增、编辑、迁移、不再适用、查看 evidence、搜索过滤、enabled 开关和 12,000 字符批量输入保持可用。管理 snapshot 中的 `intelligence` 只是运行时派生数据，不是事实源。

## 10. 隔离、隐私与正式数据

所有 Node 测试使用 `mkdtemp`；Electron smoke 同时隔离 `TEEMO_ASSISTANT_DATA_DIR` 和 `--user-data-dir`。测试 fixture 为人工构造，未读取或修改正式 Cognition、settings、history、skills、projects、authorized roots、credentials、Creative State 或个人素材库。

P2-4 不新增聊天日志、行为追踪、Embedding Store、chain-of-thought、图片或附件存储。测试中的 unreadable 文件操作只发生在临时目录。

## 11. 自动测试与 Electron Smoke

新增：

- `test:cognition-intelligence`
- `test:cognition-ranking`
- `test:cognition-intelligence-integration`
- `test:cognition-intelligence-ui-smoke`

专项测试覆盖 normalization、composite identity、exact dedup、freshness 边界、effective confidence、conflict、跨日 promotion、单日 burst、Project isolation、Manual Recent、明确/模糊 correction、stale exclusion、generic follow-up、prompt injection data-wrap、role-like text、enabled OFF、unreadable、一次 retry、retry exhaustion、send/stream 一致、Provider 上游失败降级、restart 不重写和双窗口 latest-read。

完整回归已运行并通过：Agent Core、Cognition、Cognition Management、两套 Cognition Electron smoke、Creative Profile、Creative Context、Creative UI smoke、Creative Director、Challenge Context、Creative Director UI smoke、Tool Registry、Permission、File、Git 和 Execute。

## 12. Scenario A-L 验收记录

- A 近期趋势：明确 Recent，UI 显示近期/待确认，不直接进入 Profile。
- B 稳定长期偏好：三次以上且跨两天、无冲突后可晋升 Profile。
- C 单日 Burst：evidence 增加，Profile 不晋升。
- D Project Isolation：Project A 内容不进入 Project B 或 Global。
- E 明确纠正：唯一旧目标 superseded，新内容按新 scope 处理。
- F 模糊纠正：保留多个候选，不替用户选择，显示待确认。
- G Stale Recent：Memory Center 可见，普通 Context 排除。
- H Prompt Injection：恶意 role-like 文本保留为 JSON data，mandatory boundary 明确禁止执行。
- I 长文本：批量保存、编辑、刷新/重启保持；Context 仅按预算选择。
- J Challenge Mixed Command：P2-3 回归证明只采集 remaining content，纯命令 0 写入。
- K 敏感题材兼容：成人向/NSFW 项目文字可按 Project scope 保存，不保存原始图片；credential value 仍拒绝。
- L 普通非设计问题：多 Profile 时无相关匹配不注入大量设计 Cognition。

## 13. Known Risks 与阶段边界

- Correction/Conflict 只处理明确规则目标，不提供语义级冲突理解；这属于保守设计，不使用 LLM 猜测。
- relevance 是关键词与近期对话规则，不等同于语义检索；无 Embedding 时可能少召回，但不会跨项目扩大召回。
- 新 `evidenceDays` 只在新 mutation 时最小增量记录；历史 v2 若没有足够时间证据，不会被冒进自动晋升。
- 文件锁使用 30 秒 stale 回收；异常退出不会永久阻塞下一次 Collector。

当前未实现 P2-5 Skill Specification/Router，也未实现 P3 Inspiration Connector、Embedding、Vector DB、Cloud Sync、Multi-Agent、GUI Automation 或 Provider Native Tool Calling。等待 GPT P2-4 strict review；未创建 P2-4 recovery tag。

## 14. GPT 首轮审阅修复

首轮 Gate 为 `STATUS: FAIL / BLOCKERS: 3`。本轮仅处理 P2-4 blocker：

- 显式跨项目信号（如“这不只适用于当前项目，以后所有项目……”）现在优先于 active project 默认归属进入 Profile；“这个项目以后默认……”仍保持 Project，并有正反测试。
- 删除 single Profile 的无条件无关请求 fallback；日期、数学、程序等无关 send/stream 不注入，明确 personal-profile query、相关设计请求或已有相关 generic follow-up 才注入。
- 导出本地 implementation patch 与带实际命令/退出码的测试结果，供无需 remote push 的源码复审。
- Management 六个写 API 与 Collector 统一参与同一文件锁，避免 UI/Collector 临界区交叉覆盖；保留 optimistic revision 与 `COGNITION_CHANGED`。

首轮要求的 review bundle 与 blocker fix commit 完成后再提交复审；当前仍未标记 PASS/CLOSED。

第二轮源码复审 Gate 仍为 `STATUS: FAIL / BLOCKERS: 3`，本轮继续只修 P2-4：

- `promotionEligible` 明确排除 `user_manual`、`user_manual_edit`、`user_manual_scope` 的 Recent lineage；后台同文证据可以增加，但不能改变用户手动选择的 Recent scope。后续明确长期/跨项目表达仍可建立新的 Global cognition。
- correction 先收集 anchor candidates：仅 1 个时 supersede，0 个不处理，大于 1 个保持全部 active，并让 correction 本身以 pending/ambiguous 状态等待用户确认。
- broad design-domain 只作为 ranking boost，不再单独获得 relevance admission；准入要求实际 keyword/concept overlap、明确 personal-profile query 或带真实相关对话的 generic follow-up。
- 补充成人向 Profile vs 儿童教育 UI、像素海报 Profile vs 金融后台 UI 的负向 send/stream 测试，以及金属内容相关和 personal-profile query 正向测试。

当前等待第二轮 blocker fix commit 与更新后的完整 review bundle 复审。
