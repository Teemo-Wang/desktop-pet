# Teemo Plugin 化改造评估

日期：2026-08-14  
性质：**只评估，不改代码**  
对照文件：

- `c:\Users\Teemo\Desktop\Teemo-Cursor-Optimization-Direction.md`（优化方向）
- `teemo/Teemo-进度与后续规划.md`（T1–T6 主线）
- 正式源码：`D:\Teemo助手\Teemo机器人项目\Teemo-source`（约 1.3.2，P0–P5 已封板）
- Cursor 开发目录：`I:\Vibe Coding\codex\Teemo-desktop-pet`（含更新的 ComfyUI 导入工作流）

给 Teemo 本人看：先说结论，再说现在像什么、缺什么、T1 怎么切、什么绝对不要动。

---

## 一句话结论

**值得做 Plugin 化，但只能做「薄封装」，禁止推倒重来。**

Teemo 已经有 Agent、Skill 路由、工具登记、权限、灵感连接器。缺的不是再写一套框架，而是中间少一层「能力」（Capability），以及把 ComfyUI / 云端生图从「聊天里写死的调用」改成「可替换的插件」。

T1（对话里用 Skill + 工作流出图）应当成为 **第一个真实 Plugin**，而不是先做插件市场。

---

## 目标架构（优化方向里要的）

```
你说话
  → Agent（听懂、编排）
    → Skill 路由（选专业做法）
    → Capability 路由（选「能做什么」）
      → Capability（例如：生图、洗图、跑工作流）
        → Provider 路由（选哪家来做）
          → Plugin（ComfyUI / 云端生图 / Eagle / 以后的 Figma）
```

职责要分开：

| 层 | 负责什么 | 不负责什么 |
|----|----------|------------|
| Agent | 听懂需求、编排步骤、调用能力 | 不管节点、采样器、CFG |
| Skill | 什么时候用、提示词怎么写、要哪些能力 | 不直接点名 ComfyUI |
| Capability | 系统能做什么，例如 `image.generate` | 不绑定某一家工具 |
| Plugin | 具体怎么做（ComfyUI、GPT Image、Eagle） | 不决定设计方法 |
| Permission | 能不能做、要不要问你 | 不改业务逻辑 |

正确关系：**Skill → Capability → Plugin**  
错误关系：Skill 直接写死「去调 ComfyUI」。

---

## 现在实际长什么样

现在更像两条路叠在一起，还没有完整的 Plugin 层。

### 已经有的（P0–P5，不要拆）

| 现有模块 | 更像目标里的哪一层 | 完整度 | 说明 |
|----------|--------------------|--------|------|
| `TeemoAgentCore` | Agent | 高 | 已有 Run/Step、要工具时发 `tool_request` |
| `TeemoSkillRouter` + `TeemoSkillComposer` | Skill 路由 | 中 | 能选出 Skill，把正文塞进对话；**不会选工作流，也不会出图** |
| `TeemoSkillManifestService` | Skill 登记 | 中 | 有清单、校验、导入；Skill 仍主要是 Markdown |
| `TeemoToolRegistry` | 执行边界（接近 Plugin 入口） | 中 | 工具有名字、参数、权限；但「工具 ≠ 插件」 |
| `TeemoPermissionService` | Permission | 高 | 已封板，**本次改造禁止改内核** |
| 灵感 Connector Registry | Plugin 登记的雏形 | 高 | Eagle / 本地文件夹已经是「登记后按能力调用」 |
| 认知 / 创作档案 | Agent 上下文 | 中 | 能用，但会误记长提示词（T2 再修） |
| 聊天产品化路由 | 部分 Capability 路由 | 中 | 只覆盖：普通聊天、安全读文件、灵感、规划、受控升级；**没有生图/工作流这条** |

### 生图现在怎么走（这是 T1 的卡点）

目前至少有 **三套互不相通的出图路径**：

1. **正式版安全工具**：`comfyui_builtin_render`  
   权限管得很好，但工作流写死成一条 SDXL，Agent 不能选你导入的 JSON。

2. **开发目录的 ComfyUI 服务**：`src/services/Teemo-comfyui.js`  
   已经能导入 API 工作流、聊天生图、识别输入输出。  
   **没有登记成 Plugin，也没有 Capability。** 聊天里直接调用。

3. **云端生图**：`ai.js` 的 `generateImage`  
   没参考图就优先 ComfyUI，有参考图走云端。  
   这是写死的 if/else，不是 Provider 路由。

Skill 被选中后，只是把说明书塞给模型。模型再说话；真正出图靠聊天里的关键词 / 意图检测去调 `generateImage`。  
所以现在是：

```
Skill（写提示词）  ┐
关键词/意图检测    ├─ 各走各的
ComfyUI / 云端     ┘
```

不是优化方向要的：

```
Skill → Capability → Plugin
```

### 公司素材库 DesignHub

改图、搜车型图绑在旧聊天 `src/app.js` 的一长串关键词判断里。  
这是团队库，以后也不应和个人素材库、ComfyUI Plugin 混成一个插件。

---

## 和目标差在哪

| 目标要求 | 现在 | 差距 |
|----------|------|------|
| Skill 不绑定 Plugin | 基本做到：Skill 只是文案 | 还没声明「我需要哪些 Capability」 |
| Capability 层 | 没有独立层 | 缺 `image.generate` / `image.edit` / `workflow.execute` / `video.generate` |
| Plugin 登记 + 可替换 | 只有灵感 Connector 是这种写法 | ComfyUI、云端生图、DesignHub 都是聊天里写死的 |
| Provider 路由 | 现有「Provider」多半指 AI 供应商或权限决策 | 不是「同一能力选哪家插件」 |
| 三层路由：确定规则 → AI → 运行时校验 | 文件/权限已有确定规则；生图仍大量关键词 | T1 需要补：Skill 在不在、能力在不在、插件能不能用、权限允不允许 |
| Agent 不懂 checkpoint / CFG | 正式版内置工作流已隔离；导入工作流这条还把细节放在设置/服务里 | T1 应让 Agent 只看见「输入 prompt / 参考图，输出图片」 |
| 不为了参考项目重构 | — | **评估同意：禁止为了对齐 DeepSeek/Hermes 而重写 Agent** |

**总评：**  
骨架大约六成能复用。设计生产力这条链路大约两成。Plugin 化的正确姿势是 **在现有 Service 外包一层**，不是新建一套运行时。

---

## 现有模块怎么「变成」Plugin（只映射，不实施）

| 现有能力 | 建议变成的 Capability | 建议变成的 Plugin | T1 做不做 |
|----------|----------------------|-------------------|-----------|
| 导入的 ComfyUI 工作流 | `workflow.execute` + `image.generate` | `teemo-comfyui` | **做（T1 核心）** |
| 云端 GPT Image / Seedream | `image.generate` / `image.edit` | `teemo-cloud-image` | T1 可当 ComfyUI 不可用时的备选，不作为主路径 |
| 正式版内置 SDXL 工具 | `image.generate` | 并入 `teemo-comfyui` 的「内置工作流」 | 不单独立门户 |
| DesignHub 搜图/改图 | `material.search` / `image.edit` | `teemo-designhub` | 不做进 T1，且永不和个人库合并 |
| Eagle / 本地灵感 | `inspiration.search` | 已有 Connector，可视为已 Plugin 化 | 不动 |
| 语雀 | `docs.read` | 以后再说 | 不做 |
| 浏览器打开 ComfyUI | 本地控制，不是生图 Capability | 保持现有 | 不动 |
| Figma / Blender | 未来 Plugin | 不存在 | 明确延后 |
| 个人素材库 | `library.ingest` / `library.search` | T3 再立插件 | 不做进 T1 |

灵感 Connector 已经证明：Teemo **会写 Plugin 登记**。T1 应抄这个模式给 ComfyUI，而不是另起炉灶。

---

## T1 建议怎么切（仍不执行）

目标体验不变：你说「用 XX Skill 做一张科技感新品海报」→ 聊天里出图。

建议最小 Plugin 切片（只这 5 步）：

1. **先只定义 2 个 Capability**  
   `image.generate`、`workflow.execute`。  
   先不要 `video.generate`、不要插件市场。

2. **把现有 `TeemoComfyUIService` 包成第一个 Plugin**  
   输入：prompt、可选参考图、工作流 id。  
   输出：图片。  
   Agent 仍然看不见 checkpoint / 采样器。

3. **Skill 清单加两个可选字段**（没有就当普通聊天 Skill）  
   - 需要哪些 Capability  
   - 优先用哪条工作流（或工作流用途标签）  
   Skill 正文继续只负责「怎么写提示词」。

4. **聊天 / Agent 接一条新流水线**  
   Skill 路由已选中 → 看它要不要 `image.generate` → 检查 ComfyUI Plugin 是否可用 → 权限按现有规则走 → 执行 → 图回聊天。  
   现有 `generateImage` 内部的 if ComfyUI 逐步让位给这一层，而不是再加一套关键词。

5. **运行时校验用中文报错**  
   Skill 不存在 / 工作流没导入 / ComfyUI 没开 / 缺参考图入口 / 权限不允许。  
   不报英文堆栈。

**T1 完成标准（和规划一致）：**  
1 个 Skill + 1 条你常用的导入工作流，一句话到出图。这同时也是 Plugin 化的验收标准。

**明确不放进 T1：**

- Embedding / 向量库 / 多 Agent / 插件商店  
- 把 DesignHub、Eagle、语雀、钉钉都改成 Plugin  
- 改 Permission 内核  
- 拆掉 Agent Core / Skill Router  
- 为了「架构好看」统一两个聊天窗口（旧 `chat.js` 和 `Teemo-chat-window`）——T1 只打通你日常在用的那一个

---

## 风险（动手前必须知道）

| 风险 | 为什么危险 | 建议 |
|------|------------|------|
| 两套源码 | Cursor 目录和正式 1.3.2 不完全一样；导入工作流主要在 Cursor 目录 | T1 以「能导入工作流的那份」为准，做完再同步正式源码 |
| 两套聊天 | 旧面板关键词改图 vs 新窗口 Agent 路由 | 只改你正在用的聊天入口，避免修一处另一处还是旧逻辑 |
| 两套 ComfyUI | 权限工具是死工作流；聊天服务是活工作流 | Plugin 包「活工作流」；内置 SDXL 当默认后备，不要删权限工具 |
| Skill 直接写 ComfyUI 名字 | 以后换模型/换工作流会全碎 | Skill 只写 Capability 和工作流用途 |
| 把 DesignHub 和个人库做成同一个 Plugin | 违反「公司库 / 私人库分开」 | 永远分两个 Plugin |
| 借 Plugin 化重写权限 | P0–P5 会回退 | Permission 只被调用，不被改 |
| 先做完整 Runtime | 拖死 T1 | 先 1 个 Plugin 跑通，再抽象登记表 |

---

## 和 T2–T6 的衔接（先记在纸上）

| 阶段 | Plugin 化怎么用，而不提前做 |
|------|------------------------------|
| T2 反推 / 洗图 | 加 Capability：`image.inspect`、`image.edit`；仍走 ComfyUI Plugin，换工作流标签 |
| T3 个人素材库 | 新 Plugin：`teemo-private-library`，不复用 DesignHub |
| T4 类似图 | 库 Plugin 提供参考 → 再调 `image.generate` |
| T5 视频 | 加 `video.generate`，仍是同一个 ComfyUI Plugin 的另一种工作流 |
| T6 手机 | 手机只遥控同一套 Capability，不在手机上再做一个 Plugin 运行时 |

原则仍然是：电脑干活，手机遥控；Capability 稳定，Plugin 可换。

---

## Cursor 以后每次开工前的判断（沿用优化方向）

这个需求属于哪一层？

- Skill？只改做法和提示词。  
- Capability？只加「能做什么」的名字，不写具体接口实现。  
- Plugin？只包现有 Service。  
- Provider？同一 Capability 下选哪家。  
- Agent？只编排，不碰节点。

五条硬规则：

1. 优先复用已有 Service。  
2. 不修改稳定 Permission。  
3. 不破坏 P0–P5。  
4. 新能力优先 Plugin 化（从 T1 生图开始）。  
5. 不为了对齐参考项目做无关重构。

---

## 最终建议

| 问题 | 答案 |
|------|------|
| 要不要 Plugin 化？ | 要，作为 T1 的实现方式，不是单独大工程 |
| 要不要现在重构？ | 不要 |
| 第一个 Plugin 是谁？ | ComfyUI（导入工作流） |
| 第一个 Capability 是什么？ | `image.generate` + `workflow.execute` |
| 什么时候做插件市场？ | 个人闭环（至少 T4）之后 |
| 下一步文档？ | 你点头后，再写「T1 执行说明」（仍可先不改代码） |

Teemo 不应变成「聊天版 ComfyUI 控制器」。  
Plugin 化的目的，是让它成为：听懂设计需求，自动组合 Skill、工作流、插件，把结果交回给你的私人助理。
