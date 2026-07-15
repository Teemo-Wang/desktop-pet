# 哈啰桌面 AI 助手 — 项目进度与规划

> 最后更新：2026-06-08
> 仓库：https://github.com/Teemo-Wang/desktop-pet
> 版本：v1.0.0（功能 Demo 阶段）

## 一、项目定位

面向哈啰两轮事业部视觉设计师的**桌面端 AI 工作助手**，以桌面宠物「小哈」为交互入口，将 AI 对话、钉钉消息、语雀文档、待办管理、技能调用、视觉生成等日常工作流整合到一个常驻桌面的悬浮窗中，减少多工具切换成本。

核心理念：**所有需求来源（钉钉/语雀/对话）先各自完成信息提取和总结，再统一汇总到 AI Dock 作为智能处理与生图执行中枢。**

## 二、技术架构

| 维度 | 方案 |
|------|------|
| 运行时 | Electron 31+ |
| 渲染层 | 原生 HTML/CSS/JS（无框架，模块化组织） |
| 窗口形态 | 全屏透明窗 + 鼠标穿透（forward 模式） |
| AI 协议 | OpenAI 兼容协议（DeepSeek/通义/智谱/Kimi/火山方舟/OpenAI/Claude） |
| 生图能力 | 火山方舟 seedream（images/generations 端点） |
| 数据持久化 | 本地 JSON（`~/.hellobike-pet/`）+ localStorage |
| 网络代理 | config.json / 环境变量 / 系统代理 三级回退 |
