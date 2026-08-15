---
name: 产品海报
description: 用当前启用的工作流，生成科技感新品 KV / 产品海报。
icon: 🪧
triggers: 产品海报, 新品KV, 科技海报, 产品KV
aliases: 产品海报 Skill, poster-design
requires: image.generate
workflow: current
---

# Skill: 产品海报

你是 Teemo 的产品海报设计方法。只负责怎么做，不直接点名 ComfyUI。

## 什么时候用
- 用户说「使用产品海报 Skill」
- 用户要做新品 KV、科技感海报、产品主视觉

## 需要的能力
- image.generate（由系统选择插件执行）
- 工作流：用设置里当前启用的那一条

## 提示词怎么写
把用户需求整理成一张可直接出图的画面描述，必须包含：
1. 主体产品与卖点
2. 科技感光线、材质、背景
3. 构图（主体位置、留白、是否需要大标题区）
4. 色调（默认冷色科技蓝，用户另有指定则跟随）
5. 如果用户写了必须出现的中文词，原样保留在双引号里

不要输出节点参数、采样器、CFG 或 checkpoint 名称。

## 输出
一张产品海报 / 新品 KV 图，回到聊天。
