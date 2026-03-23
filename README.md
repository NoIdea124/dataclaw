# DataClaw

运行在浏览器里的个人 AI 智能体，单文件架构，零依赖部署。

## 功能特性

- **联网搜索** — 发问前 AI 自主决策是否检索，将实时结果注入上下文（支持 Tavily / Serper / Brave）
- **长短期记忆** — AI 自动提炼或手动添加记忆条目，跨会话持久化，语义检索注入上下文
- **技能系统** — 通过 `@` 触发预定义技能，支持自定义技能文件（Markdown 格式）
- **外联知识库** — 接入 Wikipedia、PubMed、arXiv、Semantic Scholar、SEC EDGAR、World Bank、CourtListener
- **MCP 工具调用** — 支持任意 MCP 服务（JSON-RPC 2.0），自动工具循环调用，最多 8 轮
- **飞书文档** — 通过 MCP 服务直接创建并写入飞书文档，生成后可一键打开
- **思考过程展示** — 每条回复气泡内置可折叠思考模块，记录工具调用全过程，支持历史查看
- **复杂任务规划** — AI 分解多步计划，支持顺序/并行执行，HTTP·代码·AI 三种步骤类型
- **多模态上传** — 支持图片视觉问答、TXT/MD/CSV 等文档内容询问
- **流式渲染** — SSE 实时输出，Markdown 代码高亮，思考链折叠展示
- **资产库** — 内置独立的数据资产管理应用，含指标管理、需求管理、数据管理三大模块

## 项目结构

```
dataclaw/
├── index.html              # 主应用（单文件，含全部 UI + 逻辑）
├── start.sh                # 一键启动脚本
├── metric-dict/
│   └── index.html          # 资产库（独立应用）
├── mcp-metrics/            # 资产库 MCP 服务 (端口 3464)
│   ├── server.js
│   └── package.json
├── mcp-skills/             # 技能文件 REST API 服务 (端口 3458)
│   ├── server.js
│   └── package.json
├── mcp-knowledge/          # 外联知识库 MCP 服务 (端口 3459)
│   ├── server.js
│   └── package.json
├── mcp-feishu/             # 飞书文档 MCP 服务 (端口 3461)
│   ├── server.js
│   └── package.json
├── mcp-requests/           # 需求管理 MCP 服务 (端口 3465)
│   ├── server.js
│   └── package.json
└── skills/                 # 技能文件目录
    ├── 取数.md
    ├── 找数.md
    └── 提需.md
```

## 快速启动

**一键启动（推荐）**

```bash
bash start.sh
```

脚本会自动启动所有 MCP 服务和前端，并打开浏览器。

**手动启动**

```bash
# 启动 MCP 服务
node mcp-metrics/server.js &
node mcp-skills/server.js &
node mcp-knowledge/server.js &
node mcp-feishu/server.js &
node mcp-requests/server.js &

# 启动前端
python3 -m http.server 8080
```

**打开浏览器访问** `http://localhost:8080`

## MCP 服务说明

| 服务 | 端口 | 提供能力 |
|------|------|---------|
| mcp-metrics | 3464 | 资产库指标检索：`search_metrics` · `get_metric_detail` · `get_metric_data` · `list_dimensions` · `list_categories` |
| mcp-skills | 3458 | 技能文件 CRUD REST API |
| mcp-knowledge | 3459 | 学术/财经/法律等 7 个外联知识库检索 |
| mcp-feishu | 3461 | 飞书文档创建、内容写入、文档信息查询 |
| mcp-requests | 3465 | 需求管理：`create_request` · `list_requests` · `get_request` · `update_request` |

## 资产库

资产库（`metric-dict/index.html`）是独立的数据资产管理应用，可从 DataClaw 顶栏「资产库」下拉菜单直接跳转，也可单独打开。

### 三大模块

**指标管理**（`metric-dict/index.html#search`）

收录 35 个核心指标 × 8 个公共维度，覆盖用户、订单、商品、营销、物流、财务、流量 7 大业务域。支持按名称/取数表/标签全文搜索、业务域筛选、维度拆解，点击指标卡查看计算口径、模拟时序数据和可拆解维度详情。

**需求管理**

数据需求全生命周期管理，支持两步工作流：
1. **业务负责人** 创建需求任务，填写背景收益，录入维度/指标元数据，AI 审核通过后提交开发
2. **技术负责人** 补录来源表信息，AI 测试验证后一键发布，指标/维度自动进入指标管理可检索

元数据表格为类 Excel 组件，支持列宽拖拽调整、文字加粗、插入超链接，文本列支持实时自动补全已有指标/维度名称。

**数据管理**（`metric-dict/index.html#assets`）

以资产字典视图展示所有数据表，按 ODS → DWD → DWS → ADS 数据层级归类，展示每张表关联的指标数量、业务域分布和更新频率，支持按数据层级筛选。

## 配置说明

### 基础配置

打开设置面板（右上角齿轮图标）可配置：

- **系统提示词** — 自定义 AI 角色和行为
- **外观** — 深色/浅色主题

### 开发者模式

在设置面板开启「开发者模式」后可配置：

- **API Key** — 兼容 OpenAI 格式的任意服务商
- **Base URL** — 默认 `https://api.deepseek.com/v1/chat/completions`
- **模型** — deepseek-chat / deepseek-reasoner / gpt-4o / 自定义
- **Temperature / Max Tokens / 上下文条数**
- **联网搜索** — 搜索引擎选择与 API Key 配置

### 联网搜索

提问框左侧「联网」按钮可一键开启/关闭。开启后 AI 自主决策是否检索，结果作为参考资料传入上下文。

默认使用 Tavily，可在「开发者模式 → 搜索」中切换引擎和配置 Key：

| 引擎 | 免费额度 |
|------|---------|
| Tavily | 1000 次/月 · tavily.com |
| Serper | 2500 次/月 · serper.dev |
| Brave | 2000 次/月 · api.search.brave.com |

### 飞书文档

在「设置 → MCP」中添加飞书服务后，AI 可自动创建和写入飞书文档：

1. 启动 `node mcp-feishu/server.js`
2. 在 MCP 设置中添加：名称 `飞书文档`，URL `http://localhost:3461`
3. 对话中指示 AI 创建飞书文档，完成后点击链接直接打开

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
