# FlowMatrix

FlowMatrix（流阵）是面向 ComfyUI 和在线生成 API 的工作流批量运行控制台。当前仓库处于 alpha 阶段，已建立 Nuxt 前端、SQLite 轻量任务队列、ComfyUI 执行后端，以及 OpenAI 兼容在线 Provider 适配层。

## 快速开始

```bash
npm install
npm run dev
```

在线 API 默认使用 OpenAI 标准 SDK。OpenAI 兼容服务商的 Base URL、模型和 API Key 在“系统设置”页面保存，不通过环境变量配置。

本地开发时，`npm run dev` 会同时启动 Nuxt Web 服务和本地 Worker。需要单独调试 Worker 时也可以直接运行：

```bash
npm run worker
```

只启动 Web 服务时使用：

```bash
npm run dev:web
```

## 许可

本项目以 AGPL-3.0-or-later 开源。后续商业授权将用于闭源集成、私有 SaaS、白标分发和企业交付。
