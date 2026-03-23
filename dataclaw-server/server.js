/**
 * DataClaw Server — 统一认证 & 存储中心
 * Port: 3470
 *
 * REST API (需 Bearer Token 认证，除 /api/auth/* 外):
 *   POST   /api/auth/login
 *   POST   /api/auth/logout
 *   GET    /api/auth/me
 *   GET    /api/auth/users        (admin)
 *   POST   /api/auth/users        (admin, 创建用户)
 *   DELETE /api/auth/users/:id    (admin)
 *   PUT    /api/auth/users/:id/password (admin or self)
 *
 *   GET    /api/data/:key         (key: messages|memories|kb|tasks)
 *   POST   /api/data/:key         (全量替换)
 *
 *   GET    /api/requests
 *   POST   /api/requests
 *   GET    /api/requests/:id
 *   PUT    /api/requests/:id
 *   DELETE /api/requests/:id
 *
 * MCP JSON-RPC (无需认证，供 AI Agent 调用):
 *   POST   /mcp
 */

const http     = require('http');
const crypto   = require('crypto');
const Database = require('better-sqlite3');
const path     = require('path');

const PORT    = 3470;
const DB_PATH = path.join(__dirname, 'dataclaw.db');

// ── Database ──────────────────────────────────────────────────────────────────
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT    UNIQUE NOT NULL,
    password   TEXT    NOT NULL,
    role       TEXT    NOT NULL DEFAULT 'user',
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT    PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT    NOT NULL
  );

  -- key-value storage per user (messages, memories, kb, tasks)
  CREATE TABLE IF NOT EXISTS user_data (
    user_id    INTEGER NOT NULL,
    key        TEXT    NOT NULL,
    value      TEXT    NOT NULL DEFAULT '[]',
    updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, key)
  );

  CREATE TABLE IF NOT EXISTS requests (
    id          TEXT    PRIMARY KEY,
    user_id     INTEGER NOT NULL DEFAULT 0,
    title       TEXT    NOT NULL DEFAULT '',
    background  TEXT    NOT NULL DEFAULT '',
    benefit     TEXT    NOT NULL DEFAULT '',
    owner       TEXT    NOT NULL DEFAULT '',
    priority    TEXT    NOT NULL DEFAULT 'medium',
    due_date    TEXT    NOT NULL DEFAULT '',
    status      TEXT    NOT NULL DEFAULT 'draft',
    dimensions  TEXT    NOT NULL DEFAULT '[]',
    metrics     TEXT    NOT NULL DEFAULT '[]',
    extra       TEXT    NOT NULL DEFAULT '{}',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

// Seed default admin
function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }
if (!db.prepare('SELECT id FROM users WHERE username=?').get('admin')) {
  db.prepare('INSERT INTO users (username,password,role) VALUES (?,?,?)').run('admin', sha256('admin'), 'admin');
  console.log('[dataclaw-server] Default user: admin / admin');
}

// ── Auth helpers ──────────────────────────────────────────────────────────────
function createSession(userId) {
  const token   = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)').run(token, userId, expires);
  return token;
}

function getUserByToken(token) {
  if (!token) return null;
  return db.prepare(`
    SELECT u.id, u.username, u.role
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token=? AND s.expires_at > datetime('now')
  `).get(token) || null;
}

function extractToken(req) {
  const h = req.headers['authorization'] || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

function requireAuth(req) { return getUserByToken(extractToken(req)); }

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

function json(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', c => b += c);
    req.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve(null); } });
    req.on('error', () => resolve(null));
  });
}

// ── MCP Request Tools ─────────────────────────────────────────────────────────
const MCP_TOOLS = [
  {
    name: 'create_request',
    description: '创建一个新的数据需求任务。返回创建的需求ID和详情。',
    inputSchema: {
      type: 'object',
      properties: {
        title:      { type: 'string' },
        background: { type: 'string' },
        benefit:    { type: 'string' },
        owner:      { type: 'string' },
        priority:   { type: 'string', enum: ['high','medium','low'] },
        due_date:   { type: 'string' },
        dimensions: { type: 'array', items: { type: 'object' } },
        metrics:    { type: 'array', items: { type: 'object' } }
      },
      required: ['title','background','owner']
    }
  },
  {
    name: 'list_requests',
    description: '查询所有需求任务列表，可按状态筛选。',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['draft','reviewing','in_dev','testing','published','all'] },
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
        id: { type: 'string' }, title: { type: 'string' }, background: { type: 'string' },
        benefit: { type: 'string' }, owner: { type: 'string' },
        priority: { type: 'string', enum: ['high','medium','low'] },
        due_date: { type: 'string' },
        status: { type: 'string', enum: ['draft','reviewing','in_dev','testing','published'] }
      },
      required: ['id']
    }
  }
];

const STATUS_LBL = { draft:'草稿', reviewing:'AI审核中', in_dev:'开发中', testing:'数据测试中', published:'已发布' };

function genId() {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`;
}

function parseReq(r) {
  if (!r) return null;
  return { ...r, dimensions: JSON.parse(r.dimensions||'[]'), metrics: JSON.parse(r.metrics||'[]'), extra: JSON.parse(r.extra||'{}') };
}

function mcpCreateRequest(args) {
  const now = new Date().toISOString();
  const id  = genId();
  db.prepare(`
    INSERT INTO requests (id,title,background,benefit,owner,priority,due_date,status,dimensions,metrics,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(id, args.title||'未命名需求', args.background||'', args.benefit||'', args.owner||'',
         args.priority||'medium', args.due_date||'', 'draft',
         JSON.stringify(args.dimensions||[]), JSON.stringify(args.metrics||[]), now, now);
  return { success:true, id, message:`需求「${args.title}」已创建`, request: parseReq(db.prepare('SELECT * FROM requests WHERE id=?').get(id)),
    detail_url:`http://localhost:8080/metric-dict/index.html#request:${id}` };
}

function mcpListRequests(args) {
  const status = args.status||'all', limit = args.limit||20;
  const rows = status==='all'
    ? db.prepare('SELECT * FROM requests ORDER BY created_at DESC LIMIT ?').all(limit)
    : db.prepare('SELECT * FROM requests WHERE status=? ORDER BY created_at DESC LIMIT ?').all(status, limit);
  return { total: rows.length, items: rows.map(r => ({
    id:r.id, title:r.title, owner:r.owner, priority:r.priority, status:r.status,
    status_label: STATUS_LBL[r.status]||r.status, due_date:r.due_date, created_at:r.created_at,
    dim_count: JSON.parse(r.dimensions||'[]').length, metric_count: JSON.parse(r.metrics||'[]').length,
    detail_url: `http://localhost:8080/metric-dict/index.html#request:${r.id}`
  })) };
}

function mcpGetRequest(args) {
  const r = db.prepare('SELECT * FROM requests WHERE id=?').get(args.id);
  if (!r) return { error:`需求 ${args.id} 不存在` };
  return { ...parseReq(r), status_label: STATUS_LBL[r.status]||r.status,
    detail_url:`http://localhost:8080/metric-dict/index.html#request:${r.id}` };
}

function mcpUpdateRequest(args) {
  const r = db.prepare('SELECT id FROM requests WHERE id=?').get(args.id);
  if (!r) return { error:`需求 ${args.id} 不存在` };
  const fields = ['title','background','benefit','owner','priority','due_date','status'];
  const sets=[]; const vals=[];
  fields.forEach(f => { if (args[f]!==undefined) { sets.push(`${f}=?`); vals.push(args[f]); } });
  sets.push('updated_at=?'); vals.push(new Date().toISOString()); vals.push(args.id);
  if (sets.length>1) db.prepare(`UPDATE requests SET ${sets.join(',')} WHERE id=?`).run(...vals);
  return { success:true, id:args.id, updated: parseReq(db.prepare('SELECT * FROM requests WHERE id=?').get(args.id)) };
}

function handleMCP(rpc) {
  const { id, method, params } = rpc;
  try {
    if (method==='initialize')  return { jsonrpc:'2.0', id, result:{ protocolVersion:'2024-11-05', serverInfo:{ name:'dataclaw-server', version:'1.0.0' }, capabilities:{ tools:{} } } };
    if (method==='tools/list')  return { jsonrpc:'2.0', id, result:{ tools: MCP_TOOLS } };
    if (method==='tools/call') {
      const { name, arguments: args } = params;
      let result;
      if      (name==='create_request') result = mcpCreateRequest(args||{});
      else if (name==='list_requests')  result = mcpListRequests(args||{});
      else if (name==='get_request')    result = mcpGetRequest(args||{});
      else if (name==='update_request') result = mcpUpdateRequest(args||{});
      else return { jsonrpc:'2.0', id, error:{ code:-32601, message:`Unknown tool: ${name}` } };
      return { jsonrpc:'2.0', id, result:{ content:[{ type:'text', text: JSON.stringify(result,null,2) }] } };
    }
    return { jsonrpc:'2.0', id, error:{ code:-32601, message:`Unknown method: ${method}` } };
  } catch(e) {
    return { jsonrpc:'2.0', id, error:{ code:-32603, message: e.message } };
  }
}

// ── HTTP Server ───────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  cors(res);
  if (req.method==='OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = req.url.split('?')[0];

  // ── MCP JSON-RPC (no auth) ──
  if (req.method==='POST' && url==='/mcp') {
    const body = await readBody(req);
    if (!body) return json(res, 400, { error:'Invalid JSON' });
    const response = Array.isArray(body) ? body.map(handleMCP) : handleMCP(body);
    return json(res, 200, response);
  }

  // ── Auth ──
  if (req.method==='POST' && url==='/api/auth/login') {
    const body = await readBody(req);
    const user = db.prepare('SELECT * FROM users WHERE username=?').get((body||{}).username||'');
    if (!user || user.password !== sha256((body||{}).password||''))
      return json(res, 401, { error:'用户名或密码错误' });
    const token = createSession(user.id);
    return json(res, 200, { token, username:user.username, role:user.role });
  }

  if (req.method==='POST' && url==='/api/auth/logout') {
    const token = extractToken(req);
    if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(token);
    return json(res, 200, { success:true });
  }

  if (req.method==='GET' && url==='/api/auth/me') {
    const user = requireAuth(req);
    if (!user) return json(res, 401, { error:'未登录' });
    return json(res, 200, { id:user.id, username:user.username, role:user.role });
  }

  // ── User management (admin only) ──
  if (url==='/api/auth/users') {
    const user = requireAuth(req);
    if (!user) return json(res, 401, { error:'未登录' });
    if (user.role !== 'admin') return json(res, 403, { error:'无权限' });
    if (req.method==='GET') {
      const users = db.prepare('SELECT id,username,role,created_at FROM users').all();
      return json(res, 200, users);
    }
    if (req.method==='POST') {
      const body = await readBody(req);
      if (!body||!body.username||!body.password) return json(res, 400, { error:'缺少参数' });
      if (db.prepare('SELECT id FROM users WHERE username=?').get(body.username))
        return json(res, 409, { error:'用户名已存在' });
      const info = db.prepare('INSERT INTO users (username,password,role) VALUES (?,?,?)').run(body.username, sha256(body.password), body.role||'user');
      return json(res, 200, { id:info.lastInsertRowid, username:body.username, role:body.role||'user' });
    }
  }

  if (url.startsWith('/api/auth/users/')) {
    const user = requireAuth(req);
    if (!user) return json(res, 401, { error:'未登录' });
    const targetId = parseInt(url.split('/')[4]);
    if (url.endsWith('/password') && req.method==='PUT') {
      if (user.role !== 'admin' && user.id !== targetId) return json(res, 403, { error:'无权限' });
      const body = await readBody(req);
      db.prepare('UPDATE users SET password=? WHERE id=?').run(sha256((body||{}).password||''), targetId);
      return json(res, 200, { success:true });
    }
    if (req.method==='DELETE') {
      if (user.role !== 'admin') return json(res, 403, { error:'无权限' });
      if (targetId === user.id) return json(res, 400, { error:'不能删除自己' });
      db.prepare('DELETE FROM users WHERE id=?').run(targetId);
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(targetId);
      return json(res, 200, { success:true });
    }
  }

  // ── Key-Value data store ──
  if (url.startsWith('/api/data/')) {
    const user = requireAuth(req);
    if (!user) return json(res, 401, { error:'未登录' });
    const key = url.slice('/api/data/'.length);
    const ALLOWED = new Set(['messages','memories','kb','tasks']);
    if (!ALLOWED.has(key)) return json(res, 400, { error:'Unknown key' });

    if (req.method==='GET') {
      const row = db.prepare('SELECT value FROM user_data WHERE user_id=? AND key=?').get(user.id, key);
      return json(res, 200, row ? JSON.parse(row.value) : []);
    }
    if (req.method==='POST') {
      const body = await readBody(req);
      const value = JSON.stringify(body ?? []);
      db.prepare("INSERT INTO user_data (user_id,key,value,updated_at) VALUES (?,?,?,datetime('now')) ON CONFLICT(user_id,key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at").run(user.id, key, value);
      return json(res, 200, { success:true });
    }
  }

  // ── Requests CRUD ──
  if (url==='/api/requests') {
    const user = requireAuth(req);
    if (!user) return json(res, 401, { error:'未登录' });
    if (req.method==='GET') {
      const rows = db.prepare('SELECT * FROM requests ORDER BY created_at DESC').all();
      return json(res, 200, rows.map(parseReq));
    }
    if (req.method==='POST') {
      const body = await readBody(req);
      const r = mcpCreateRequest(body||{});
      return json(res, 200, r);
    }
  }

  if (url.startsWith('/api/requests/')) {
    const user = requireAuth(req);
    if (!user) return json(res, 401, { error:'未登录' });
    const id = url.slice('/api/requests/'.length);
    if (req.method==='GET') {
      const r = db.prepare('SELECT * FROM requests WHERE id=?').get(id);
      return json(res, r ? 200 : 404, r ? parseReq(r) : { error:'不存在' });
    }
    if (req.method==='PUT') {
      const body = await readBody(req);
      return json(res, 200, mcpUpdateRequest({ id, ...(body||{}) }));
    }
    if (req.method==='DELETE') {
      const info = db.prepare('DELETE FROM requests WHERE id=?').run(id);
      return json(res, 200, { success: info.changes>0, id });
    }
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[dataclaw-server] http://127.0.0.1:${PORT}  (REST + MCP at /mcp)`);
});
