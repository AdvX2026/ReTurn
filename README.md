<div align="center">
  <img src="docs/assets/return-icon.png" width="168" alt="ReTurn mascot">

  # Re:Turn

  **一个住在你家里的第二大脑 Agent。**

  自动记住你做过什么，在需要时帮你找回来；<br>
  夜晚整理，醒来继续。

  <p>
    <img src="https://img.shields.io/badge/macOS-14%2B-111111?style=flat-square&logo=apple&logoColor=white" alt="macOS 14+">
    <img src="https://img.shields.io/badge/iOS-17%2B-111111?style=flat-square&logo=apple&logoColor=white" alt="iOS 17+">
    <img src="https://img.shields.io/badge/SwiftUI-Native-F05138?style=flat-square&logo=swift&logoColor=white" alt="SwiftUI">
    <img src="https://img.shields.io/badge/Orange%20Pi-Home%20Server-F58220?style=flat-square" alt="Orange Pi home server">
    <img src="https://img.shields.io/badge/Hackathon-48h-5794F2?style=flat-square" alt="48 hour hackathon">
  </p>
</div>

---

> **你的数据，住在你家。** 应用记录、浏览痕迹、对话和健康数据以家中的 Orange Pi 为唯一权威数据源；客户端只在局域网内连接它。需要智能推理时，仅由 Pi 发起无状态的模型调用，API Key 永远不会下发到客户端。

## 为什么是 Re:Turn？

收藏夹会吃灰，笔记会变成信息坟场，复盘很有价值，却很难每天坚持。

ReTurn 不要求你先养成一套复杂的记录习惯。它用轻量元数据理解你的工作上下文，让「记录」尽量自动发生，让「使用」只需要说一句话。它不靠持续截屏，也不把完整生活搬进某家公司的云端——你的第二大脑，物理地放在自己家里。

## 一天如何流动

| 白天 | 回来时 | 晚上 | 第二天 |
| :---: | :---: | :---: | :---: |
| 自动采集工作痕迹<br>随时对话或投喂资料 | **Resume**<br>快速找回刚才的上下文 | **Save**<br>结束今天，启动夜间整理 | 打开即见昨日 briefing<br>带着上下文继续 |

```text
Collect  ──▶  Ask  ──▶  Resume  ──▶  Save  ──▶  Ferment  ──▶  Return
  采集         使用       找回来       收尾        夜间整理        继续
```

## Before · Now · After

Re:Turn 的主界面不是文件夹，也不是聊天记录，而是一条以此刻为锚点的双向时间流。

| Before | Now | After |
| --- | --- | --- |
| 回看过去发生了什么 | 与第二大脑对话 | 看见接下来值得做什么 |
| Timeline、历史输入、Daily Briefing | 问候、Input、Task、Resume | 灵感、Todo 建议、健康建议 |
| 回答「我当时在做什么？」 | 回答「我现在需要什么？」 | 回答「下一步可以是什么？」 |

## ✨ 核心体验

- **轻量自动采集** — 记录前台应用、浏览器标签页、Coding Agent 会话等工作痕迹，不做持续截屏。
- **张口就能用** — Input 自动分诊灵感、检索和提问；可以直接问「我昨天下午在干什么？」。
- **可回溯时间线** — 将零散事件整理为 Point、Span、Ambient 与可下钻 Cluster，保留细节但不制造日志噪音。
- **Save / Resume 节奏** — Resume 帮你从短暂离开中恢复上下文；Save 告诉系统今天告一段落，并启动夜间发酵。
- **每日 Briefing** — 将一天整理为摘要、复盘要点、建议与可解释状态，而不是给生活打一个冷冰冰的分数。
- **高权重资料处理** — 会议纪要、文字与图片可进入异步 Task 管线，成为比自动采样更重要的上下文。
- **真实健康信号** — iPhone 通过 HealthKit 同步睡眠与步数，用于生成克制、可解释的精力与健康建议。
- **多设备、可离线** — 多台 Mac 与 iPhone 共享同一个 Pi 空间；短暂离线时先进入本地 outbox，恢复后幂等补传。

## 🏠 架构

```text
┌─ Mac · SwiftUI ─────────────────┐       ┌─ Orange Pi 3B · Debian ─────────┐
│ UI App                          │       │ Fastify service                 │
│ Before / Now / After · Input    ├─ LAN ─▶ SQLite · workflows · ferment   │
│                                 │       │                                 │
│ Independent Node sampler        ├─ LAN ─▶ The only authoritative store   │
│ metadata collection · outbox    │       │ API keys live here only         │
└─────────────────────────────────┘       └───────────────┬─────────────────┘
                                                         │ stateless calls
┌─ iPhone · SwiftUI ──────────────┐                       ▼
│ Full experience · HealthKit     ├─ LAN ─────────── LLM / STT / Vision API
└─────────────────────────────────┘
```

macOS 的界面与采样器是两个独立进程：关闭窗口不会让采集消失，界面也永远不直接负责采样。采样器的本机控制面只绑定 `127.0.0.1`，不会暴露到局域网。

## 隐私边界

| 留在家中的 Pi | 可能发送给模型服务商 |
| --- | --- |
| 原始节点、浏览痕迹、应用记录 | 完成分诊或回答所需的上下文 |
| 对话、会议纪要、健康记录 | 夜间发酵所需的摘要与相关片段 |
| SQLite 数据库与全部 API Key | 明确提交的音频或图片处理请求 |

ReTurn 是 **local-first**，不是「永不联网」。当前版本会使用云端模型完成分诊、问答、转写、视觉理解与夜间发酵；数据主权和原始数据仍在用户自己的 Pi 上。长期方向是在 Pi NPU 或家用主机上运行本地模型。

## 技术栈

| 层 | 技术 |
| --- | --- |
| macOS / iOS | Swift 6 · SwiftUI · URLSession async/await · HealthKit |
| Home server | Node.js 22 · TypeScript · Fastify · `node:sqlite` |
| Sampler | 独立 Node 进程 · launchd · AppleScript · SQLite outbox |
| Contract | Zod schema + Swift Codable mirror |
| UI | 原生系统组件 · SF Symbols · Swift Charts / Canvas |

没有 Electron、Tauri、WebView、ORM、向量数据库或第三方 UI 框架。客户端保持原生而轻，Pi 保持简单而可控。

## 当前阶段

Re:Turn 是一个 **48 小时黑客松项目**，目前围绕 v0.6 产品方向快速开发。目标不是提前搭出一套庞大的平台，而是跑通一条真实、可演示的主线：

1. Mac 与 iPhone 将真实数据写入家中的 Pi；
2. 用户通过 Now 对话、检索与提交资料；
3. Before 可以回溯过去，After 给出灵感与建议；
4. Save 触发夜间整理，第二天打开即见 Daily Briefing。

部分 P1 能力（周/月视图、更丰富的软件接入、本地模型等）仍在路线图中。仓库状态以 [PRD](docs/PRD.md) 为准。

## 项目结构

```text
ReTurn/
├── apps/ReTurn/       SwiftUI macOS + iOS app
├── packages/shared/   Zod API contract
├── packages/server/   Orange Pi Fastify service
├── packages/sampler/  Independent macOS sampler
└── docs/              Product and deployment documents
```

## 开发文档

- [产品需求与范围](docs/PRD.md)
- [API 合同](docs/api.md)
- [Orange Pi 部署](docs/pi-deployment.md)
- [Server 说明](packages/server/README.md)
- [Sampler 说明](packages/sampler/README.md)
- [AI 协作约定](AGENTS.md)

---

<div align="center">
  <strong>ReTurn</strong><br>
  Your day leaves traces. ReTurn turns them into context.
</div>
