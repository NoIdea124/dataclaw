/**
 * DataClaw Feishu MCP Server
 *
 * 实现 MCP JSON-RPC 2.0 协议，提供飞书文档写入工具
 * 使用飞书开放平台 Docx API（tenant_access_token）
 *
 * 运行：node server.js
 * 端点：http://localhost:3461
 *
 * 在 DataClaw 设置 > MCP 中添加：
 *   名称：飞书文档
 *   URL ：http://localhost:3461
 */

'use strict';

const http  = require('http');
const https = require('https');

const PORT       = 3461;
const APP_ID     = 'cli_a92864ea4ff85cb5';
const APP_SECRET = '9KFYTVyh1ExGPcqpDDuq4ZrufremawhL';
const API_BASE   = 'https://open.feishu.cn';

/* ── Token 缓存（有效期 7200s，提前 5 分钟刷新）── */
let _token     = null;
let _tokenExp  = 0;

async function getTenantToken() {
  if (_token && Date.now() < _tokenExp) return _token;

  const data = await postJSON('/open-apis/auth/v3/tenant_access_token/internal', {
    app_id: APP_ID, app_secret: APP_SECRET
  }, null);

  if (data.code !== 0) throw new Error(`获取 Token 失败: ${data.msg}`);
  _token    = data.tenant_access_token;
  _tokenExp = Date.now() + (data.expire - 300) * 1000; // 提前 5 分钟过期
  return _token;
}

/* ── HTTP 工具函数 ── */
function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const payload  = body ? JSON.stringify(body) : null;
    const headers  = { 'Content-Type': 'application/json; charset=utf-8' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);

    const opts = {
      hostname: 'open.feishu.cn',
      path,
      method,
      headers,
    };

    const req = https.request(opts, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch(e) { reject(new Error('JSON 解析失败: ' + raw.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('请求超时')); });
    if (payload) req.write(payload);
    req.end();
  });
}

function postJSON(path, body, token) { return request('POST', path, body, token); }
function getJSON(path, token)        { return request('GET',  path, null, token); }

/* ── Block 构建辅助 ── */
// content_type: text | heading1 | heading2 | heading3 | bullet | ordered | code | divider
function makeBlock(contentType, content) {
  const TYPE_MAP = {
    text:    2,
    heading1: 3, heading2: 4, heading3: 5,
    bullet:  12, ordered:  13,
    code:    14,
    divider: 22,
  };
  const KEY_MAP  = {
    2:'text', 3:'heading1', 4:'heading2', 5:'heading3',
    12:'bullet', 13:'ordered', 14:'code',
  };

  const blockType = TYPE_MAP[contentType] ?? 2;
  const block = { block_type: blockType };

  if (blockType === 22) { block.divider = {}; return block; } // 分割线

  const key = KEY_MAP[blockType] || 'text';
  const elements = [{ text_run: { content: String(content ?? '') } }];

  if (blockType === 14) {
    block.code = { elements, style: { language: 1, wrap: true } };
  } else {
    block[key] = { elements, style: {} };
  }
  return block;
}

/* ── 工具实现 ── */

// 1. 创建文档
async function createDocument(title, folderToken) {
  const token = await getTenantToken();
  const body  = { title };
  if (folderToken) body.folder_token = folderToken;

  const res = await postJSON('/open-apis/docx/v1/documents', body, token);
  if (res.code !== 0) throw new Error(`创建文档失败 (${res.code}): ${res.msg}`);

  const doc = res.data.document;
  const url = `https://feishu.cn/docx/${doc.document_id}`;

  return [
    `✅ 文档创建成功`,
    ``,
    `**标题**：${doc.title || title}`,
    `**文档 ID**：${doc.document_id}`,
    ``,
    `👉 [点击打开飞书文档](${url})`,
  ].join('\n');
}

// 2. 向文档追加内容块
async function writeContent(documentId, blocks) {
  if (!documentId) throw new Error('缺少 document_id');
  if (!Array.isArray(blocks) || blocks.length === 0) throw new Error('blocks 不能为空');

  const token    = await getTenantToken();
  const children = blocks.map(b => makeBlock(b.type || 'text', b.content));

  // 追加到文档根块（根块 ID 与 document_id 相同）
  const res = await postJSON(
    `/open-apis/docx/v1/documents/${documentId}/blocks/${documentId}/children`,
    { children }, // 不传 index 默认追加到末尾
    token
  );

  if (res.code !== 0) throw new Error(`写入内容失败 (${res.code}): ${res.msg}`);

  const added = res.data?.children?.length ?? children.length;
  const url = `https://feishu.cn/docx/${documentId}`;
  return [
    `✅ 内容写入成功（新增 ${added} 个块）`,
    ``,
    `👉 [点击打开飞书文档](${url})`,
  ].join('\n');
}

// 3. 查询文档信息
async function getDocumentInfo(documentId) {
  if (!documentId) throw new Error('缺少 document_id');
  const token = await getTenantToken();
  const res   = await getJSON(`/open-apis/docx/v1/documents/${documentId}`, token);
  if (res.code !== 0) throw new Error(`获取文档信息失败 (${res.code}): ${res.msg}`);

  const doc = res.data.document;
  const url = `https://feishu.cn/docx/${doc.document_id}`;
  return [
    `📄 **${doc.title || '（无标题）'}**`,
    ``,
    `文档 ID：${doc.document_id}  ·  版本：${doc.revision_id}`,
    ``,
    `👉 [点击打开飞书文档](${url})`,
  ].join('\n');
}

/* ── 工具定义 ── */
const TOOLS = [
  {
    name: 'create_document',
    description: '在飞书中创建一篇新文档，返回文档 ID 和访问链接。创建后可用 write_content 工具写入内容。',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: '文档标题',
        },
        folder_token: {
          type: 'string',
          description: '目标文件夹的 token（可选，不填则创建在根目录）',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'write_content',
    description: '向指定飞书文档追加内容块。支持正文、多级标题、无序列表、有序列表、代码块、分割线。',
    inputSchema: {
      type: 'object',
      properties: {
        document_id: {
          type: 'string',
          description: '文档 ID（由 create_document 返回）',
        },
        blocks: {
          type: 'array',
          description: '内容块数组，按顺序追加到文档末尾',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['text','heading1','heading2','heading3','bullet','ordered','code','divider'],
                description: 'text=正文, heading1/2/3=标题, bullet=无序列表, ordered=有序列表, code=代码块, divider=分割线',
              },
              content: {
                type: 'string',
                description: '块内容文本（divider 类型可不填）',
              },
            },
            required: ['type'],
          },
        },
      },
      required: ['document_id', 'blocks'],
    },
  },
  {
    name: 'get_document_info',
    description: '查询飞书文档的基本信息，包括标题、版本号和访问链接',
    inputSchema: {
      type: 'object',
      properties: {
        document_id: {
          type: 'string',
          description: '文档 ID',
        },
      },
      required: ['document_id'],
    },
  },
];

/* ── 工具路由 ── */
async function callTool(name, args) {
  let text;
  if (name === 'create_document') {
    text = await createDocument(args.title, args.folder_token);
  } else if (name === 'write_content') {
    text = await writeContent(args.document_id, args.blocks);
  } else if (name === 'get_document_info') {
    text = await getDocumentInfo(args.document_id);
  } else {
    throw { code: -32601, message: `未知工具: ${name}` };
  }
  return { content: [{ type: 'text', text }] };
}

/* ── JSON-RPC 路由 ── */
async function handleRPC(rpc) {
  switch (rpc.method) {
    case 'initialize':
      return {
        protocolVersion: '2024-11-05',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'feishu-mcp', version: '1.0.0' },
      };
    case 'initialized':
      return {};
    case 'tools/list':
      return { tools: TOOLS };
    case 'tools/call':
      return callTool(rpc.params?.name, rpc.params?.arguments ?? {});
    default:
      throw { code: -32601, message: `Method not found: ${rpc.method}` };
  }
}

/* ── HTTP 服务器 ── */
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method Not Allowed — 请使用 POST'); return;
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    let rpc;
    try { rpc = JSON.parse(body); }
    catch(_) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc:'2.0', error:{ code:-32700, message:'Parse error' }, id:null }));
      return;
    }

    const isBatch  = Array.isArray(rpc);
    const requests = isBatch ? rpc : [rpc];
    const responses = [];

    for (const item of requests) {
      try {
        const result = await handleRPC(item);
        if (item.id !== undefined && item.id !== null) {
          responses.push({ jsonrpc:'2.0', result, id:item.id });
        }
      } catch(e) {
        const err = (e && e.code) ? e : { code:-32603, message: String(e?.message ?? e) };
        if (item.id !== undefined && item.id !== null) {
          responses.push({ jsonrpc:'2.0', error:err, id:item.id });
        }
        console.error(`[ERR] ${item.method}:`, err.message);
      }
    }

    const out = isBatch ? JSON.stringify(responses) : JSON.stringify(responses[0] ?? {});
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(out);

    const label = isBatch ? '[batch]' : (rpc.method ?? '?');
    console.log(`[${new Date().toLocaleTimeString()}] ${label}`);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  📄  Feishu MCP Server 已启动');
  console.log('');
  console.log(`  端点：http://localhost:${PORT}`);
  console.log('');
  console.log('  工具列表：');
  TOOLS.forEach(t => console.log(`    · ${t.name}`));
  console.log('');
  console.log('  在 DataClaw 设置 > MCP 添加：');
  console.log('    名称：飞书文档');
  console.log(`    URL ：http://localhost:${PORT}`);
  console.log('');
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ 端口 ${PORT} 已被占用，请修改 PORT 变量后重试`);
  } else {
    console.error('❌ 服务器错误:', err.message);
  }
  process.exit(1);
});
