#!/bin/bash

DIR="$(cd "$(dirname "$0")" && pwd)"

echo "启动 DataClaw Server（认证 & 存储）..."
node "$DIR/dataclaw-server/server.js" &

echo "启动 MCP 服务..."
node "$DIR/mcp-knowledge/server.js" &
node "$DIR/mcp-skills/server.js" &
node "$DIR/mcp-metrics/server.js" &
node "$DIR/mcp-feishu/server.js" &

echo "等待服务就绪..."
sleep 2

echo "启动前端..."
cd "$DIR" && python3 -m http.server 8080 &

sleep 1
echo "DataClaw 已启动，打开 http://localhost:8080"
open http://localhost:8080

wait
