# Teemo助理 P2-1 Cognition UI / Memory Center

> 状态：`CLOSED / PASS / BLOCKERS: 0`
> 分支：`Teemo/p2-personal-intelligence`
> 范围：只实现用户 Cognition 的查看与控制，不包含 P2-2 Agent Creative Profile、P2-3 Creative Director 或 P2-4 智能采集升级。

## 1. 产品目标与入口

独立聊天窗口侧栏新增一级入口「Teemo 对我的了解」。页面回答“Teemo 现在如何理解用户”，用户可以查看长期、近期、项目认知和历史依据，并可以手动新增、纠正、迁移或标记不再适用。

页面沿用 Teemo 的深色工具面板视觉，不展示 JSON、fingerprint、observationId 等工程字段。

## 2. 页面结构

- 长期认知：映射 `profile`，标签为“长期认知”。
- 最近变化：映射 `recentContext`，标签为“近期认知”。
- 项目认知：映射 `projectContexts[projectId]`，项目名称复用 `ProjectService`。
- 不再适用：集中展示 `status: superseded` 的历史认知。
- 历史依据：点击“为什么这么认为？”后展示相关 Observation、时间、scope、状态和证据次数。
- 搜索与过滤：支持全部、长期、最近、项目、不再适用和项目筛选。

可信度映射保持 UI 层展示：`>= 0.8` 为高，`>= 0.5` 为中，其余为低；底层 confidence 算法未改变。

## 3. Cognition 数据映射与保存

唯一数据文件仍为：

```text
<TeemoStorageService dataDir>/Teemo-cognition.json
```

默认位置：

```text
C:\Users\Teemo\.hellobike-pet\Teemo-cognition.json
```

Schema 从 version 1 兼容升级到 version 2，新增：

- `enabled`：个性化认知开关，默认 true。
- `revision`：每次持久化递增，用于检测旧 UI snapshot。

所有写入继续通过 `TeemoStorageService.writeJson`，保留临时文件、JSON 校验、原子替换和读取失败禁止覆盖保护。UI 不直接读写文件，也不获取 StorageService 或任意文件权限。

## 4. Cognition Management API

`TeemoCognitionService` 新增：

- `isEnabled()` / `getState()` / `setEnabled()`
- `getManagementSnapshot()`
- `manualCreate()`
- `updateCognitionEntry()`
- `supersedeCognitionEntry()`
- `moveCognitionEntry()`
- `getEvidenceForEntry()`

### 手动新增

用户选择长期、近期或项目 scope。项目 scope 必须包含 projectId；新增 Observation 与 Cognition 都标记 `source: user_manual`，confidence 为高可信。相同 fingerprint 已存在 active cognition 时返回 `COGNITION_DUPLICATE`，避免重复注入。

### 纠正与修改

编辑不会无痕覆盖旧内容。Service 创建新的 `user_manual_edit` Observation，将旧 Observation 和引用它的 Cognition 标记 superseded，再建立新的 active cognition。历史依据仍可查看。

### 不再适用

默认不提供 hard delete。`supersedeCognitionEntry()` 将关联 Observation 和所有相同认知引用标为 superseded，并记录 `supersededReason: user`。Context Builder 现有 active 过滤会排除它们。

### Scope migration

`moveCognitionEntry()` 执行：旧 cognition superseded → 新 scope Observation → 唯一 active cognition。迁移到 project 时没有 projectId 会返回 `PROJECT_REQUIRED`。相同 fingerprint 的其他 active 引用同时失效，避免 global/recent/project 重复注入。

## 5. Observation evidence

“为什么这么认为？”只读取 Cognition 已保存的 Observation，不反查 `chat-history.json`，也不保存新的完整聊天副本。手动修改和迁移通过 `sourceObservationId` 保留证据链。

## 6. 开关行为

关闭“启用个性化认知”后：

- Collector 在每轮开始时读取最新状态并停止新增 Observation。
- Context Builder 不注入 Profile、Recent 或 Project learned cognition。
- 已有 Cognition 数据不删除。
- 当前明确项目 metadata、Skill 和原会话仍按原链路工作。
- 重新启用后继续使用原数据。

Collector 的偏好识别、重复阈值、项目隔离、纠正规则和敏感信息算法没有改写，只增加开关与跨窗口 reload guard。

## 7. 并发与跨窗口

- 管理操作先 reload 最新文件，再比较调用方 `expectedRevision`。
- revision 不一致时返回 `COGNITION_CHANGED` 和最新安全 snapshot，旧 UI 不覆盖 Collector 或其他窗口的新数据。
- Context Builder 和 Collector 每轮操作前 reload，因此 Memory Center 修改后，桌宠或独立聊天的下一次请求会使用最新状态。
- Memory Center 提供手动刷新；P2-1 未建立复杂实时数据库或跨 renderer event bus。

## 8. 隐私与多模型

- 数据源保存在本机，不属于 GPT、Grok、DeepSeek 等 Provider，切换模型仍共享。
- 使用 Cognition 回答时，相关 Context 会成为当前模型 API 请求的一部分；页面明确展示这一事实。
- 手动新增/编辑继续调用 P1-2 敏感信息检测；API Key、Token、密码、Secret、Authorization 等内容会拒绝保存。
- 管理 snapshot 会过滤历史异常敏感条目，只返回隐藏数量，不向 UI 暴露原文。
- 数据不会进入 Git；测试只使用 `TEEMO_ASSISTANT_DATA_DIR` 隔离目录。

## 9. Context Builder 回归

- active manual global 正常注入。
- inactive/superseded 不注入。
- global → project 后，无项目聊天不注入，对应 projectId 才注入。
- UI 修改后的新内容由下一次 Builder reload 后使用。
- Cognition disabled 时不注入 learned cognition。

## 10. 测试

新增：

```powershell
npm.cmd run test:cognition-management
npm.cmd run test:cognition-ui-smoke
```

Management 测试覆盖读取四类数据、三种手动 scope、编辑历史、supersede、双向 scope migration、缺失 project、敏感信息、revision 并发冲突、开关、最新 Context Builder 和损坏 JSON 不覆盖。

Electron smoke 使用独立 `userData` 和 `TEEMO_ASSISTANT_DATA_DIR`，在真实独立聊天页面中完成：

1. 打开 Cognition Center。
2. empty state。
3. 新增 Recent。
4. 修改内容。
5. 提升为 global。
6. 查看历史依据。
7. 标记不再适用。
8. 关闭 Cognition。
9. 重开窗口验证持久化。

隔离 smoke 与视觉截图检查通过，没有读取或修改正式 settings、history、Cognition、skills、projects 或 authorized roots。

## 11. 人工体验验收

隔离数据中模拟“最近比较喜欢金属材质”，在页面中修改为“最近偏好高反射金属材质”，提升为长期认知，确认多条历史依据可见，再标记不再适用。页面层级、标签、操作反馈、空状态和隐私说明均可辨认。

## 12. 已知技术债

- P2-1 使用 reload + optimistic revision，未增加跨进程 OS 文件锁；极小的同时写盘竞态留待后续统一 Main data coordinator 评估。
- 打开的 Memory Center 不自动接收另一 renderer 的实时事件，用户可点击刷新；下一次模型请求始终 reload 最新数据。
- P1-2 重复证据按 fingerprint 聚合为一条 Observation，因此 UI 展示证据次数，不伪造多条聊天原文。
- 入口当前位于独立聊天窗口；桌宠通过共享文件和请求前 reload 使用同一事实源，但没有复制第二套管理 UI。

## 13. P2-2 边界

本页面只管理“Teemo 如何理解用户”。未增加 Teemo 自己的审美、Agent Creative Profile、Creative Director、Challenge Mode、LLM Collector、Embedding、Vector DB、RAG 或自动语义聚类。

## 14. GPT 严格审阅与恢复点

- 审阅结论：`P2-1 Cognition UI / Memory Center STATUS: PASS`。
- Blockers：`0`。
- Required fixes：无。
- 审阅确认结构化管理、软失效、作用域迁移、Observation 证据、开关、并发保护、敏感信息保护、Context Builder 回归与 P2-2/P2-4 边界均符合预期。
- 实现提交：`fa13978 Teemo: add P2-1 cognition center`。
- 封板提交：`Teemo: close P2-1 cognition center`。
- 阶段恢复标签：`v1.2.0-p2.1-cognition-ui`。
- 应用、界面、安装包版本继续为 `1.2.0`，与标签数字前缀一致。
- P2-2 未开始，等待新的明确任务书。
