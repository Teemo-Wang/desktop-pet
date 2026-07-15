# 桌宠项目 · 继续优化指南（交接文档）

> 用途：在**新对话**里用 `#File` 引用本文件（或直接把内容粘给 AI），即可快速接上进度继续优化。
> 最后更新：2026-07（由上一轮长对话整理）

---

## 一、项目是什么

哈啰两轮设计中心的**桌面 AI 助手（桌宠"小哈"）**，Electron 应用。整合：AI 对话、钉钉机器人（实名 AI 助理）、语雀文档、待办、技能系统、DesignHub 素材库改图、AI 生图。

- 运行时：Electron 31，原生 HTML/CSS/JS（无框架）
- 数据/配置：`~/.hellobike-pet/`（settings.json、skills.json、task-context.json、chat-history.json 等）
- 启动：`cd docs/desktop-pet && npm start`
- 当前版本：v1.1.1

## 二、关键目录/文件

```
docs/desktop-pet/
├── main.js                 # 主进程：窗口/代理/语雀IPC/钉钉Stream/生图相关IPC/全局错误兜底
├── dingtalk-bridge.js      # 钉钉 Stream 长连接 + 单聊/群聊发消息/发图(oToMessages vs groupMessages)
├── material-bridge.js      # DesignHub：登录/搜索/AI改图(dhGenerateVariant)/图片下载
├── src/
│   ├── app.js              # 渲染进程总入口 + 钉钉回复核心 buildTakeoverReply（改图/生图/找素材/意图路由）
│   ├── services/
│   │   ├── ai.js           # 模型统一接入（send/stream/generateImage）；生图尺寸/模型family处理
│   │   ├── dingtalk-ai.js  # 钉钉消息 AI 层：decideAction(意图)/suggestReply/analyze
│   │   ├── skills.js       # 技能系统：getRules/getReferenceRules/findRelevantSkill
│   │   ├── material-service.js # DesignHub 渲染层：search/generateVariant/fetchImageAsDataUrl
│   │   ├── task-context.js # 会话任务上下文：改图任务/当前版本/参考图
│   │   └── yuque*.js        # 语雀读取/搜索
│   └── components/
│       ├── api-connect.js  # API 接入面板（供应商切换/生图模型多标签/独立Key地址）
│       ├── chat.js         # AI 对话面板（文生图/图生图/技能自动加载）
│       └── ...
```

## 三、本轮已完成的改动（重要）

1. **群聊发图修复**：群 @机器人发图走 `groupMessages/send`(openConversationId)，单聊走 `oToMessages/batchSend`(userId)。
2. **无关话题自由对话**：偏好设置加「允许闲聊」开关（work.allowChitchat），无关话题切通用 AI 对话。
3. **语雀全文检索**：main.js 新增 `yuque-search` IPC（官方 /api/v2/search），跨团队搜索。
4. **生图 API 入口开关**：`api-connect.js` 的 `SHOW_IMAGE_MODEL`（当前 true）。
5. **生图模型独立配置**：生图有独立 apiKey/baseUrl/options（多模型标签切换 + 删除×）。与对话供应商解耦。
6. **生图尺寸处理**（ai.js generateImage）：
   - 尺寸填 0/空 → 自适应；改图时按原图比例适配
   - 显式「宽x高」→ `_fitImageGenSize` 等比适配到 seedream 合规像素(≥368万)，再 `_resizeToExact` 降采样到精确尺寸
   - 模型 family 区分：**GPT-Image 系列不支持图生图/response_format**；seedream 支持
7. **全局错误兜底**（main.js）：`uncaughtException`/`unhandledRejection` 拦截网络类错误，关闭应用不再弹「A JavaScript error occurred」。
8. **AI 对话框文生图**：纯文字造图不再让聊天模型编造假图，改为真实调 generateImage。
9. **技能自动加载**：`skillService.findRelevantSkill(text)`，对话时命中技能名则注入该技能内容。
10. **规范 banner 全自动模板改图**（app.js `_specBannerFromTemplate`）：
    - 检测「按规范生成 banner」→ 自动搜 DesignHub「顶部氛围 1170_879」左文右图模板
    - 模板下载成图片 → 喂给 **seedream 图生图**（构图参考 + 内容/文字 AI 自由发挥）→ 出 2 版
    - DesignHub 改图作兜底
11. **意图理解提升**：有进行中改图任务时，画面描述型指令（"父与子/傍晚/背向/文案白色"）自动识别为改图迭代；`decideAction` 短超时 15s 快速回退关键词。

## 四、当前配置注意点（用户环境）

- **对话模型**：火山方舟 `doubao-seed-2-1-pro-260628`（地址 `https://ark.cn-beijing.volces.com/api/v3`）。⚠️ 之前用哈啰网关会频繁超时，务必用火山方舟。
- **生图模型**：哈啰生图服务，Key `sk-****（存本地，不入库）`，地址见内部生图服务网关，模型 Doubao-Seedream-4.5/5.0-lite（GPT-Image-2 只能纯文生图，不支持图生图）。
- **DesignHub**：需保持已登录（改图/搜模板依赖）。
- 生图 Key 和地址必须匹配同一平台，别混用（曾出现哈啰 Key 配火山地址的错配）。

## 五、已知限制 / 待办

| 方向 | 说明 | 优先级 |
|------|------|--------|
| **纯文生图无法精确还原版式** | seedream 做不到像素级"左文右图/安全区/logo位置"。已用「模板图生图」缓解 | 已缓解 |
| **方案 B：代码排版合成（未做）** | Canvas 按规范精确排版 logo/标题/按钮 + seedream 只生成右侧主视觉大图 → 像素级合规 + 高质量主视觉。**最彻底的规范落地方案** | 高（推荐下一步） |
| **规范→提示词缓存** | 每次扩写慢，可把规范扩写成的提示词缓存复用 | 中 |
| **模板选择优化** | 目前固定选第一张匹配模板，可按场景/随机/智能选 | 中 |
| **网络稳定性** | 火山方舟/外部 API 偶发 SSL 握手失败(net_error -100)，建议查代理 | 观察 |
| **打包自动更新** | Mac 未签名，自动更新装不上；需 Apple 开发者证书签名+公证 | 低 |

## 六、开发/调试习惯（沿用）

- 改完 JS：`node --check <file>` 校验语法。
- 重启看效果：`pkill -f "desktop-pet/node_modules/electron"` 后 `npm start`。
- 看运行日志：进程 stdout 有 `[renderer:WARN]`、`[buildReply]`、`[specBanner]`、`[dhGenerateVariant]` 等诊断日志。
- 打包：`npm run dist:mac`（target 已设 universal，产物在 dist/）。

## 七、新对话怎么快速开始

在新对话里说明诉求，并附上：
> 参考 #CONTINUE-HERE-继续优化指南.md，我要继续优化桌宠项目的 [具体功能]。

AI 就能据此快速定位相关文件继续。若要做「方案 B 代码排版合成」，直接说即可——那是当前最推荐的规范落地方向。
