/**
 * DataClaw Requirements Management MCP Server
 * Port: 3465  Protocol: JSON-RPC 2.0 over HTTP
 *
 * Tools:
 *   create_request   — create a new requirement task
 *   list_requests    — list all requirements (optional status filter)
 *   get_request      — get detail of a specific requirement by ID
 *   update_request   — update fields of a requirement (status, title, desc, etc.)
 */

const http = require('http');
const PORT = 3465;

// ── In-memory store ──────────────────────────────────────────────────────────
let requests = [];
let nextId = 1;

function generateId() {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 6);
  return `req_${ts}_${rnd}`;
}

// ── Tool definitions ─────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'create_request',
    description: '创建一个新的数据需求任务。返回创建的需求ID和详情。',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '需求标题，简短描述需求内容' },
        background: { type: 'string', description: '业务背景，说明为什么需要这个数据' },
        benefit: { type: 'string', description: '预期收益，数据能带来什么价值' },
        owner: { type: 'string', description: '业务负责人姓名' },
        priority: { type: 'string', enum: ['high', 'medium', 'low'], description: '优先级：high/medium/low' },
        due_date: { type: 'string', description: '期望完成日期，格式 YYYY-MM-DD' },
        dimensions: {
          type: 'array',
          description: '需要的维度列表',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              display_name: { type: 'string' },
              type: { type: 'string', enum: ['categorical', 'numerical', 'boolean'] },
              description: { type: 'string' }
            }
          }
        },
        metrics: {
          type: 'array',
          description: '需要的指标列表',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              display_name: { type: 'string' },
              unit: { type: 'string' },
              direction: { type: 'string', enum: ['up', 'down'] },
              description: { type: 'string' }
            }
          }
        }
      },
      required: ['title', 'background', 'owner']
    }
  },
  {
    name: 'list_requests',
    description: '查询所有需求任务列表，可按状态筛选。',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['draft', 'reviewing', 'in_dev', 'testing', 'published', 'all'],
          description: '按状态筛选，不传或传 all 返回全部'
        },
        limit: { type: 'number', description: '返回条数上限，默认20' }
      }
    }
  },
  {
    name: 'get_request',
    description: '根据需求ID获取需求任务详情。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '需求ID' }
      },
      required: ['id']
    }
  },
  {
    name: 'update_request',
    description: '更新需求任务的字段（仅草稿状态允许更新内容字段；状态字段任何时候都可更新）。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '需求ID' },
        title: { type: 'string' },
        background: { type: 'string' },
        benefit: { type: 'string' },
        owner: { type: 'string' },
        priority: { type: 'string', enum: ['high', 'medium', 'low'] },
        due_date: { type: 'string' },
        status: { type: 'string', enum: ['draft', 'reviewing', 'in_dev', 'testing', 'published'] }
      },
      required: ['id']
    }
  }
];

// ── Tool handlers ────────────────────────────────────────────────────────────
function createRequest(args) {
  const now = new Date().toISOString();
  const req = {
    id: generateId(),
    title: args.title || '未命名需求',
    background: args.background || '',
    benefit: args.benefit || '',
    owner: args.owner || '',
    priority: args.priority || 'medium',
    due_date: args.due_date || '',
    status: 'draft',
    dimensions: args.dimensions || [],
    metrics: args.metrics || [],
    created_at: now,
    updated_at: now
  };
  requests.push(req);
  return {
    success: true,
    id: req.id,
    message: `需求任务「${req.title}」已创建，状态：草稿`,
    request: req,
    detail_url: `http://localhost:8080/metric-dict/index.html#request:${req.id}`
  };
}

function listRequests(args) {
  const status = args.status || 'all';
  const limit = args.limit || 20;
  let result = requests;
  if (status !== 'all') {
    result = result.filter(r => r.status === status);
  }
  result = result.slice(-limit).reverse(); // newest first
  const STATUS_LBL = { draft:'草稿', reviewing:'AI审核中', in_dev:'开发中', testing:'数据测试中', published:'已发布' };
  return {
    total: result.length,
    items: result.map(r => ({
      id: r.id,
      title: r.title,
      owner: r.owner,
      priority: r.priority,
      status: r.status,
      status_label: STATUS_LBL[r.status] || r.status,
      due_date: r.due_date,
      created_at: r.created_at,
      dim_count: (r.dimensions || []).length,
      metric_count: (r.metrics || []).length,
      detail_url: `http://localhost:8080/metric-dict/index.html#request:${r.id}`
    }))
  };
}

function getRequest(args) {
  const req = requests.find(r => r.id === args.id);
  if (!req) return { error: `需求 ${args.id} 不存在` };
  const STATUS_LBL = { draft:'草稿', reviewing:'AI审核中', in_dev:'开发中', testing:'数据测试中', published:'已发布' };
  return {
    ...req,
    status_label: STATUS_LBL[req.status] || req.status,
    detail_url: `http://localhost:8080/metric-dict/index.html#request:${req.id}`
  };
}

function updateRequest(args) {
  const req = requests.find(r => r.id === args.id);
  if (!req) return { error: `需求 ${args.id} 不存在` };
  const allowedFields = ['title', 'background', 'benefit', 'owner', 'priority', 'due_date', 'status'];
  allowedFields.forEach(f => {
    if (args[f] !== undefined) req[f] = args[f];
  });
  req.updated_at = new Date().toISOString();
  return { success: true, id: req.id, updated: req };
}

// ── JSON-RPC dispatcher ──────────────────────────────────────────────────────
function handleRPC(rpc) {
  const { id, method, params } = rpc;
  try {
    if (method === 'initialize') {
      return { jsonrpc: '2.0', id, result: {
        protocolVersion: '2024-11-05',
        serverInfo: { name: 'mcp-requests', version: '1.0.0' },
        capabilities: { tools: {} }
      }};
    }
    if (method === 'tools/list') {
      return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
    }
    if (method === 'tools/call') {
      const { name, arguments: args } = params;
      let result;
      if (name === 'create_request')  result = createRequest(args || {});
      else if (name === 'list_requests') result = listRequests(args || {});
      else if (name === 'get_request')   result = getRequest(args || {});
      else if (name === 'update_request') result = updateRequest(args || {});
      else return { jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown tool: ${name}` } };
      return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] } };
    }
    return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
  } catch (e) {
    return { jsonrpc: '2.0', id, error: { code: -32603, message: e.message } };
  }
}

// ── HTTP server ──────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // REST: GET /api/requests — for metric-dict to sync
  if (req.method === 'GET' && req.url === '/api/requests') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(requests));
    return;
  }

  if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try {
      const parsed = JSON.parse(body);
      let response;
      if (Array.isArray(parsed)) {
        response = parsed.map(handleRPC);
      } else {
        response = handleRPC(parsed);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }));
    }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mcp-requests] listening on http://127.0.0.1:${PORT}`);
});
