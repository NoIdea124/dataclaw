#!/bin/bash

DIR="$(cd "$(dirname "$0")" && pwd)"

# ── 清理旧进程 ────────────────────────────────────────────────
echo "清理旧进程..."
for PORT in 3458 3459 3461 3462 3464 3470 8080; do
  PID=$(lsof -ti :$PORT 2>/dev/null)
  [ -n "$PID" ] && kill -9 $PID 2>/dev/null && echo "  已释放端口 :$PORT"
done

# ── 检查并安装依赖 ────────────────────────────────────────────
echo "检查依赖..."
for SVC in dataclaw-server mcp-skills mcp-knowledge mcp-metrics mcp-data mcp-feishu; do
  if [ ! -d "$DIR/$SVC/node_modules" ]; then
    echo "  安装 $SVC 依赖..."
    npm install --prefix "$DIR/$SVC" --silent
  fi
done

# ── 启动后端服务 ──────────────────────────────────────────────
echo "启动 DataClaw Server（认证 & 存储 & 需求管理）..."
node "$DIR/dataclaw-server/server.js" &

echo "启动 MCP 服务..."
node "$DIR/mcp-skills/server.js" &        # 技能文件服务    :3458
node "$DIR/mcp-knowledge/server.js" &     # 外联知识库      :3459
node "$DIR/mcp-feishu/server.js" &        # 飞书文档        :3461
node "$DIR/mcp-data/server.js" &          # 数据资产目录    :3462
node "$DIR/mcp-metrics/server.js" &       # 指标库          :3464

echo "等待服务就绪..."
sleep 2

# ── 启动前端 ──────────────────────────────────────────────────
echo "启动前端..."
cd "$DIR" && python3 -m http.server 8080 &

sleep 1

# ── 启动完成 ──────────────────────────────────────────────────
echo ""
echo "✓ DataClaw 已启动"
echo ""
echo "  前端       http://localhost:8080"
echo "  认证/存储  http://localhost:3470"
echo "  技能服务   http://localhost:3458"
echo "  知识库     http://localhost:3459"
echo "  飞书文档   http://localhost:3461"
echo "  数据目录   http://localhost:3462"
echo "  指标库     http://localhost:3464"
echo ""
echo "  默认账号   admin / admin"
echo ""

open http://localhost:8080

wait
