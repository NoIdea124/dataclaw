/**
 * DataClaw Requirements Management MCP Server
 * Port: 3465  Protocol: JSON-RPC 2.0 over HTTP
 *
 * Tools:
 *   create_request   — create a new requirement task
 *   list_requests    — list all requirements (optional status filter)
 *   get_request      — get detail of a specific requirement by ID
 *   update_request   — update fields of a requirement
 *
 * REST:
 *   POST   /api/auth/login    — login, returns token
 *   POST   /api/auth/logout   — logout
 *   GET    /api/auth/me       — current user info
 *   GET    /api/requests      — list requests (auth required)
 *   DELETE /api/requests/:id  — delete request (auth required)
 */

const http = require('http');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const path = require('path');

const PORT = 3465;
const DB_PATH = path.join(__dirname, 'data.db');

// ── Database setup ────────────────────────────────────────────────────────────
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    username  TEXT    UNIQUE NOT NULL,
    password  TEXT    NOT NULL,
    role      TEXT    NOT NULL DEFAULT 'user',
    created_at TEXT   NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS requests (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL DEFAULT '',
    background  TEXT NOT NULL DEFAULT '',
    benefit     TEXT NOT NULL DEFAULT '',
    owner       TEXT NOT NULL DEFAULT '',
    priority    TEXT NOT NULL DEFAULT 'medium',
    due_date    TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'draft',
    dimensions  TEXT NOT NULL DEFAULT '[]',
    metrics     TEXT NOT NULL DEFAULT '[]',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Seed default admin user
function hashPassword(pw) {
  return crypto.createHash('sha256').update(pw).digest('hex');
}

const existingAdmin = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!existingAdmin) {
  db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run('admin', hashPassword('admin'), 'admin');
  console.log('[mcp-requests] Default user created: admin / admin');
}

// ── Auth helpers ──────────────────────────────────────────────────────────────
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function createSession(userId) {
  const token = generateToken();
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expires);
  return token;
}

function getUserByToken(token) {
  if (!token) return null;
  const session = db.prepare(`
    SELECT s.token, u.id, u.username, u.role
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `).get(token);
  return session || null;
}

function extractToken(req) {
  const auth = req.headers['authorization'] || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return null;
}

function requireAuth(req) {
  return getUserByToken(extractToken(req));
}

// ── Tool definitions ──────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'create_request',
    description: '创建一个新的数据需求任务。返回创建的需求ID和详情。',
    inputSchema: {
      type: 'object',
      properties: {
        title:      { type: 'string', description: '需求标题' },
        background: { type: 'string', description: '业务背景' },
        benefit:    { type: 'string', description: '预期收益' },
        owner:      { type: 'string', description: '业务负责人姓名' },
        priority:   { type: 'string', enum: ['high', 'medium', 'low'] },
        due_date:   { type: 'string', description: '期望完成日期 YYYY-MM-DD' },
        dimensions: { type: 'array', items: { type: 'object' } },
        metrics:    { type: 'array', items: { type: 'object' } }
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
        status: { type: 'string', enum: ['draft', 'reviewing', 'in_dev', 'testing', 'published', 'all'] },
        limit:  { type: 'number' }
      }
    }
  },
  {
    name: 'get_request',
    description: '根据需求ID获取需求任务详情。',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }
  },
  {
    name: 'update_request',
    description: '更新需求任务字段。',
    inputSchema: {
      type: 'object',
      properties: {
        id:         { type: 'string' },
        title:      { type: 'string' },
        background: { type: 'string' },
        benefit:    { type: 'string' },
        owner:      { type: 'string' },
        priority:   { type: 'string', enum: ['high', 'medium', 'low'] },
        due_date:   { type: 'string' },
        status:     { type: 'string', enum: ['draft', 'reviewing', 'in_dev', 'testing', 'published'] }
      },
      required: ['id']
    }
  }
];

// ── Tool handlers ─────────────────────────────────────────────────────────────
function generateId() {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 6);
  return `req_${ts}_${rnd}`;
}

const STATUS_LBL = { draft:'草稿', reviewing:'AI审核中', in_dev:'开发中', testing:'数据测试中', published:'已发布' };

function createRequest(args) {
  const now = new Date().toISOString();
  const id = generateId();
  db.prepare(`
    INSERT INTO requests (id, title, background, benefit, owner, priority, due_date, status, dimensions, metrics, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    args.title || '未命名需求',
    args.background || '',
    args.benefit || '',
    args.owner || '',
    args.priority || 'medium',
    args.due_date || '',
    'draft',
    JSON.stringify(args.dimensions || []),
    JSON.stringify(args.metrics || []),
    now, now
  );
  const req = db.prepare('SELECT * FROM requests WHERE id = ?').get(id);
  return {
    success: true, id,
    message: `需求任务「${req.title}」已创建，状态：草稿`,
    request: parseRow(req),
    detail_url: `http://localhost:8080/metric-dict/index.html#request:${id}`
  };
}

function parseRow(r) {
  if (!r) return null;
  return {
    ...r,
    dimensions: JSON.parse(r.dimensions || '[]'),
    metrics:    JSON.parse(r.metrics    || '[]')
  };
}

function listRequests(args) {
  const status = args.status || 'all';
  const limit  = args.limit  || 20;
  let rows;
  if (status === 'all') {
    rows = db.prepare('SELECT * FROM requests ORDER BY created_at DESC LIMIT ?').all(limit);
  } else {
    rows = db.prepare('SELECT * FROM requests WHERE status = ? ORDER BY created_at DESC LIMIT ?').all(status, limit);
  }
  return {
    total: rows.length,
    items: rows.map(r => ({
      id: r.id, title: r.title, owner: r.owner, priority: r.priority,
      status: r.status, status_label: STATUS_LBL[r.status] || r.status,
      due_date: r.due_date, created_at: r.created_at,
      dim_count:    JSON.parse(r.dimensions || '[]').length,
      metric_count: JSON.parse(r.metrics    || '[]').length,
      detail_url: `http://localhost:8080/metric-dict/index.html#request:${r.id}`
    }))
  };
}

function getRequest(args) {
  const row = db.prepare('SELECT * FROM requests WHERE id = ?').get(args.id);
  if (!row) return { error: `需求 ${args.id} 不存在` };
  return { ...parseRow(row), status_label: STATUS_LBL[row.status] || row.status,
    detail_url: `http://localhost:8080/metric-dict/index.html#request:${row.id}` };
}

function updateRequest(args) {
  const row = db.prepare('SELECT * FROM requests WHERE id = ?').get(args.id);
  if (!row) return { error: `需求 ${args.id} 不存在` };
  const fields = ['title','background','benefit','owner','priority','due_date','status'];
  const sets = []; const vals = [];
  fields.forEach(f => { if (args[f] !== undefined) { sets.push(`${f} = ?`); vals.push(args[f]); } });
  sets.push('updated_at = ?'); vals.push(new Date().toISOString()); vals.push(args.id);
  if (sets.length > 1) db.prepare(`UPDATE requests SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  return { success: true, id: args.id, updated: parseRow(db.prepare('SELECT * FROM requests WHERE id = ?').get(args.id)) };
}

function deleteRequest(id) {
  const info = db.prepare('DELETE FROM requests WHERE id = ?').run(id);
  return { success: info.changes > 0, id };
}

// ── JSON-RPC dispatcher ───────────────────────────────────────────────────────
function handleRPC(rpc) {
  const { id, method, params } = rpc;
  try {
    if (method === 'initialize') {
      return { jsonrpc: '2.0', id, result: {
        protocolVersion: '2024-11-05',
        serverInfo: { name: 'mcp-requests', version: '2.0.0' },
        capabilities: { tools: {} }
      }};
    }
    if (method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
    if (method === 'tools/call') {
      const { name, arguments: args } = params;
      let result;
      if      (name === 'create_request')  result = createRequest(args || {});
      else if (name === 'list_requests')   result = listRequests(args || {});
      else if (name === 'get_request')     result = getRequest(args || {});
      else if (name === 'update_request')  result = updateRequest(args || {});
      else return { jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown tool: ${name}` } };
      return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] } };
    }
    return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
  } catch (e) {
    return { jsonrpc: '2.0', id, error: { code: -32603, message: e.message } };
  }
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function json(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
    req.on('error', reject);
  });
}

// ── HTTP server ───────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = req.url.split('?')[0];

  // ── Auth endpoints ──
  if (req.method === 'POST' && url === '/api/auth/login') {
    const body = await readBody(req);
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(body.username || '');
    if (!user || user.password !== hashPassword(body.password || '')) {
      return json(res, 401, { error: '用户名或密码错误' });
    }
    const token = createSession(user.id);
    return json(res, 200, { token, username: user.username, role: user.role });
  }

  if (req.method === 'POST' && url === '/api/auth/logout') {
    const token = extractToken(req);
    if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return json(res, 200, { success: true });
  }

  if (req.method === 'GET' && url === '/api/auth/me') {
    const user = requireAuth(req);
    if (!user) return json(res, 401, { error: '未登录' });
    return json(res, 200, { username: user.username, role: user.role });
  }

  // ── Protected REST endpoints ──
  if (req.method === 'GET' && url === '/api/requests') {
    if (!requireAuth(req)) return json(res, 401, { error: '未登录' });
    const rows = db.prepare('SELECT * FROM requests ORDER BY created_at DESC').all();
    return json(res, 200, rows.map(parseRow));
  }

  if (req.method === 'DELETE' && url.startsWith('/api/requests/')) {
    if (!requireAuth(req)) return json(res, 401, { error: '未登录' });
    const id = url.slice('/api/requests/'.length);
    return json(res, 200, deleteRequest(id));
  }

  // ── MCP JSON-RPC (no auth required — called by AI agent) ──
  if (req.method === 'POST') {
    const body = await readBody(req);
    const response = Array.isArray(body) ? body.map(handleRPC) : handleRPC(body);
    return json(res, 200, response);
  }

  res.writeHead(404); res.end();
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mcp-requests] listening on http://127.0.0.1:${PORT}`);
});
