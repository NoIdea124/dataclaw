# DataClaw

运行在浏览器里的个人 AI 智能体，单文件架构，零依赖部署。

## 功能特性

- **联网搜索** — 发问前自动检索，将实时结果作为参考资料注入上下文（支持 Tavily / Serper / Brave）
- **长短期记忆** — AI 自动提炼或手动添加记忆条目，跨会话持久化，语义检索注入上下文
- **技能系统** — 通过 `@` 触发预定义技能，支持自定义技能文件（Markdown 格式）
- **外联知识库** — 接入 Wikipedia、PubMed、arXiv、Semantic Scholar、SEC EDGAR、World Bank、CourtListener
- **MCP 工具调用** — 支持任意 MCP 服务（JSON-RPC 2.0），自动工具循环调用
- **复杂任务规划** — AI 分解多步计划，支持顺序/并行执行，HTTP·代码·AI 三种步骤类型
- **多模态上传** — 支持图片视觉问答、TXT/MD/CSV 等文档内容询问
- **流式渲染** — SSE 实时输出，Markdown 代码高亮，思考链折叠展示
- **开发者模式** — 隐藏 API Key、模型配置、搜索配置，普通用户无感知

## 项目结构

```
dataclaw/
├── index.html          # 主应用（单文件，含全部 UI + 逻辑）
├── mcp-weather/        # 天气查询 MCP 服务 (端口 3456)
│   ├── server.js
│   └── package.json
├── mcp-skills/         # 技能文件 REST API 服务 (端口 3458)
│   ├── server.js
│   └── package.json
├── mcp-knowledge/      # 外联知识库 MCP 服务 (端口 3459)
│   ├── server.js
│   └── package.json
└── skills/             # 技能文件目录
    ├── 代码审查.md
    └── 数据分析.md
```

## 快速启动

**1. 启动 MCP 服务**

```bash
node mcp-weather/server.js &
node mcp-skills/server.js &
node mcp-knowledge/server.js &
```

**2. 启动前端**

```bash
python3 -m http.server 8080
```

**3. 打开浏览器访问** `http://localhost:8080`

## MCP 服务说明

| 服务 | 端口 | 提供能力 |
|------|------|---------|
| mcp-weather | 3456 | 当前天气、天气预报、空气质量（Open-Meteo，无需 Key）|
| mcp-skills | 3458 | 技能文件 CRUD REST API |
| mcp-knowledge | 3459 | 学术/财经/法律等 7 个外联知识库检索 |

## 配置说明

### 基础配置

打开设置面板（右上角齿轮图标）可配置：

- **系统提示词** — 自定义 AI 角色和行为
- **外观** — 深色/浅色主题

### 开发者模式

在设置面板开启"开发者模式"后可配置：

- **API Key** — 兼容 OpenAI 格式的任意服务商
- **Base URL** — 默认 `https://api.deepseek.com/v1/chat/completions`
- **模型** — deepseek-chat / deepseek-reasoner / gpt-4o / 自定义
- **Temperature / Max Tokens / 上下文条数**
- **联网搜索** — 搜索引擎选择与 API Key 配置

### 联网搜索

提问框左侧"联网"按钮可一键开启/关闭。开启后每次提问会先检索，结果作为参考资料传给 AI。

默认使用 Tavily，可在「开发者模式 → 搜索」中切换引擎和配置 Key：

| 引擎 | 免费额度 |
|------|---------|
| Tavily | 1000 次/月 · tavily.com |
| Serper | 2500 次/月 · serper.dev |
| Brave | 2000 次/月 · api.search.brave.com |

## 技能文件格式

在 `skills/` 目录下创建 Markdown 文件：

```markdown
---
name: 技能名称
trigger: 触发词1, 触发词2
description: 简短描述
enabled: true
---

## 指令正文

在此描述 AI 执行该技能时的具体行为…
```

对话中输入 `@技能名` 或触发词即可引用。

## 依赖说明

- **运行时** — Node.js ≥ 14（仅 MCP 服务需要）
- **前端** — 无构建步骤，纯浏览器运行
- **外部库**（CDN 加载）— highlight.js · marked.js · Google Fonts

## 数据存储

所有数据存储在浏览器 `localStorage`，包括：对话记录、记忆库、设置、MCP 配置、知识库配置。清除浏览器数据会同时清除所有本地存储。
