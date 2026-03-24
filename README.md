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
- **用户系统** — 登录认证 + 服务端持久化，数据跨设备同步，离线时自动降级为本地存储

## 项目结构

```
dataclaw/
├── index.html              # 主应用（单文件，含全部 UI + 逻辑）
├── start.sh                # 一键启动脚本
├── ecosystem.config.js     # PM2 进程管理配置（生产部署）
├── nginx.conf              # Nginx 静态文件服务配置（生产部署）
├── metric-dict/
│   └── index.html          # 资产库（独立应用）
├── dataclaw-server/        # 统一认证 & 存储服务 (端口 3470)
│   ├── server.js
│   └── package.json
├── mcp-metrics/            # 资产库 MCP 服务 (端口 3464)
│   ├── server.js
│   └── package.json
├── mcp-data/               # 数据资产目录 MCP 服务 (端口 3462)
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

脚本会自动启动所有服务和前端，并打开浏览器。

**手动启动**

```bash
node dataclaw-server/server.js &
node mcp-metrics/server.js &
node mcp-data/server.js &
node mcp-skills/server.js &
node mcp-knowledge/server.js &
node mcp-feishu/server.js &

python3 -m http.server 8080
```

**打开浏览器访问** `http://localhost:8080`，默认账号 `admin / admin`。

## 服务说明

| 服务 | 端口 | 提供能力 |
|------|------|---------|
| dataclaw-server | 3470 | 用户认证、数据持久化、需求管理 MCP（`/mcp`） |
| mcp-metrics | 3464 | 指标检索：`search_metrics` · `get_metric_detail` · `get_metric_data` |
| mcp-data | 3462 | 数据表资产搜索：`search_tables` · `get_table_detail` · `list_tables` |
| mcp-skills | 3458 | 技能文件 CRUD REST API |
| mcp-knowledge | 3459 | 学术/财经/法律等 7 个外联知识库检索 |
| mcp-feishu | 3461 | 飞书文档创建、内容写入、文档信息查询 |

## 资产库

资产库（`metric-dict/index.html`）是独立的数据资产管理应用，可从 DataClaw 顶栏「资产库」下拉菜单跳转，也可单独访问。

### 三大模块

**指标管理**（`#search`）

收录 35 个核心指标 × 8 个公共维度，覆盖用户、订单、商品、营销、物流、财务、流量 7 大业务域。支持全文搜索、业务域筛选、维度拆解，点击指标卡查看计算口径、模拟时序数据和可拆解维度详情。

**需求管理**（`#request`）

数据需求全生命周期管理，支持两步工作流：
1. **业务负责人** 创建需求任务，填写背景收益，录入维度/指标元数据，AI 审核通过后提交开发
2. **技术负责人** 补录来源表信息，AI 测试验证后一键发布，指标/维度自动进入指标管理可检索

元数据表格为类 Excel 组件，支持列宽拖拽调整、文字加粗、插入超链接，文本列支持实时自动补全已有指标/维度名称。

**数据管理**（`#assets`）

以资产字典视图展示所有数据表，按 ODS → DWD → DWS → ADS 数据层级归类，展示每张表关联的指标数量、业务域分布和更新频率，支持按数据层级筛选、中英文名称搜索。

## 技能

DataClaw 提供 5 个快捷入口触发内置技能：

| 技能 | 说明 |
|------|------|
| **找数** | 在数据资产目录中搜索匹配的数据表，推荐最优分层 |
| **提需** | 引导整理数据需求背景、口径、维度/指标，生成结构化需求草稿 |
| **取数** | 调用指标库取数，支持按日期范围和维度拆解 |
| **问答** | 通用数据问题咨询 |
| **分析** | 数据趋势分析与异动归因 |

在 `skills/` 目录下创建 Markdown 文件可添加自定义技能：

```markdown
---
name: 技能名称
trigger: 触发词1, 触发词2
description: 简短描述
---

## 指令正文

在此描述 AI 执行该技能时的具体行为…
```

对话中输入 `@技能名` 或触发词即可引用。

## 配置说明

打开设置面板（右上角齿轮图标）可配置：

- **系统提示词** — 自定义 AI 角色和行为
- **外观** — 深色/浅色主题
- **API Key / Base URL / 模型** — 兼容 OpenAI 格式的任意服务商
- **联网搜索** — 引擎选择与 API Key（Tavily / Serper / Brave）
- **MCP 服务** — 添加、启用/禁用任意 MCP 服务

## 生产部署

```bash
# 1. 安装依赖
for d in dataclaw-server mcp-metrics mcp-data mcp-skills mcp-knowledge mcp-feishu; do
  npm install --prefix $d
done

# 2. 修改 ecosystem.config.js 中的 SITE_URL 为服务器地址
# 3. 启动所有服务
pm2 start ecosystem.config.js && pm2 save

# 4. 配置 Nginx（静态文件服务）
sudo cp nginx.conf /etc/nginx/sites-available/dataclaw
sudo ln -s /etc/nginx/sites-available/dataclaw /etc/nginx/sites-enabled/
sudo systemctl reload nginx
```

开放防火墙端口：`80, 3458, 3459, 3461, 3462, 3464, 3470`

## 依赖说明

- **运行时** — Node.js ≥ 18（MCP 服务及 dataclaw-server）
- **前端** — 无构建步骤，纯浏览器运行
- **外部库**（CDN 加载）— highlight.js · marked.js · Google Fonts
- **数据库** — SQLite（better-sqlite3，dataclaw-server 使用）
