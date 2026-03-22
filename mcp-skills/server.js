/**
 * DataClaw Skills Server
 *
 * 扫描 ../skills/*.md 目录，提供技能文件的 REST API
 *
 * MD 文件格式：
 *   ---
 *   name: 技能名称
 *   trigger: 触发词1, 触发词2
 *   description: 简短描述（可选）
 *   enabled: true          （可选，默认 true）
 *   ---
 *   ## 指令正文（Markdown）
 *   ...
 *
 * API:
 *   GET  /api/skills            列出所有技能
 *   GET  /api/skills/:filename  获取单个技能原始内容
 *   POST /api/skills            创建技能 { name, trigger, description, instructions }
 *   PUT  /api/skills/:filename  更新技能 { name, trigger, description, instructions, enabled }
 *   DELETE /api/skills/:filename 删除技能
 *
 * 运行：node server.js
 * 端口：http://localhost:3458
 */

'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT       = 3458;
const SKILLS_DIR = path.join(__dirname, '..', 'skills');

if (!fs.existsSync(SKILLS_DIR)) fs.mkdirSync(SKILLS_DIR, { recursive: true });

/* ── Frontmatter 解析 / 生成 ── */
function parseMD(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) {
    return { name: '', trigger: '', description: '', enabled: true, instructions: content.trim() };
  }
  const meta = {};
  m[1].split(/\r?\n/).forEach(line => {
    const colon = line.indexOf(':');
    if (colon < 0) return;
    meta[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  });
  const skill = {
    name:         meta.name        || '',
    trigger:      meta.trigger     || '',
    description:  meta.description || '',
    enabled:      meta.enabled !== 'false',
    instructions: m[2].trim(),
  };
  if (meta.output_type) skill.output_type = meta.output_type;
  return skill;
}

function buildMD({ name, trigger, description, enabled, output_type, instructions }) {
  const lines = ['---'];
  if (name)        lines.push(`name: ${name}`);
  if (trigger)     lines.push(`trigger: ${trigger}`);
  if (description) lines.push(`description: ${description}`);
  if (output_type) lines.push(`output_type: ${output_type}`);
  if (enabled === false) lines.push(`enabled: false`);
  lines.push('---', '', instructions || '');
  return lines.join('\n');
}

/* ── 文件名安全处理 ── */
function toFilename(name) {
  const slug = name
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 60);
  return (slug || 'skill_' + Date.now()) + '.md';
}

function safeName(filename) {
  const base = path.basename(filename);
  return base.endsWith('.md') ? base : base + '.md';
}

/* ── 技能列表 ── */
function getSkillList() {
  return fs.readdirSync(SKILLS_DIR)
    .filter(f => f.endsWith('.md'))
    .map(filename => {
      try {
        const content = fs.readFileSync(path.join(SKILLS_DIR, filename), 'utf8');
        const parsed  = parseMD(content);
        const stat    = fs.statSync(path.join(SKILLS_DIR, filename));
        return { id: filename, filename, ...parsed, mtime: stat.mtime.toISOString() };
      } catch(_) { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => a.filename.localeCompare(b.filename, 'zh'));
}

/* ── HTTP 请求体读取 ── */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch(_) { resolve({}); }
    });
    req.on('error', reject);
  });
}

/* ── HTTP 服务器 ── */
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = req.url.split('?')[0];

  const json = (data, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };
  const err = (msg, status = 400) => json({ error: msg }, status);

  // GET /api/skills — 列出全部技能
  if (req.method === 'GET' && url === '/api/skills') {
    return json(getSkillList());
  }

  // GET /api/skills/:filename — 返回原始 MD
  if (req.method === 'GET' && url.startsWith('/api/skills/')) {
    const filename = safeName(decodeURIComponent(url.slice(12)));
    const filepath = path.join(SKILLS_DIR, filename);
    if (!fs.existsSync(filepath)) return err('Not found', 404);
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end(fs.readFileSync(filepath, 'utf8'));
  }

  // POST /api/skills — 创建技能
  if (req.method === 'POST' && url === '/api/skills') {
    const body = await readBody(req);
    const { name, trigger, description, instructions } = body;
    if (!name || !instructions) return err('name 和 instructions 必填');
    const filename = toFilename(name);
    const filepath = path.join(SKILLS_DIR, filename);
    if (fs.existsSync(filepath)) return err(`文件已存在: ${filename}`, 409);
    fs.writeFileSync(filepath, buildMD({ name, trigger: trigger || '', description: description || '', enabled: true, instructions }), 'utf8');
    console.log(`[新建] ${filename}`);
    return json({ ok: true, filename });
  }

  // PUT /api/skills/:filename — 更新技能
  if (req.method === 'PUT' && url.startsWith('/api/skills/')) {
    const filename = safeName(decodeURIComponent(url.slice(12)));
    const filepath = path.join(SKILLS_DIR, filename);
    if (!fs.existsSync(filepath)) return err('Not found', 404);
    const body = await readBody(req);
    const existing = parseMD(fs.readFileSync(filepath, 'utf8'));
    const merged = {
      name:         body.name         ?? existing.name,
      trigger:      body.trigger      ?? existing.trigger,
      description:  body.description  ?? existing.description,
      enabled:      body.enabled      ?? existing.enabled,
      output_type:  body.output_type  ?? existing.output_type,
      instructions: body.instructions ?? existing.instructions,
    };
    fs.writeFileSync(filepath, buildMD(merged), 'utf8');
    console.log(`[更新] ${filename}`);
    return json({ ok: true, filename });
  }

  // DELETE /api/skills/:filename — 删除技能
  if (req.method === 'DELETE' && url.startsWith('/api/skills/')) {
    const filename = safeName(decodeURIComponent(url.slice(12)));
    const filepath = path.join(SKILLS_DIR, filename);
    if (!fs.existsSync(filepath)) return err('Not found', 404);
    fs.unlinkSync(filepath);
    console.log(`[删除] ${filename}`);
    return json({ ok: true });
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  🎯  Skills Server 已启动');
  console.log('');
  console.log(`  API  端点：http://localhost:${PORT}/api/skills`);
  console.log(`  技能目录：${SKILLS_DIR}`);
  console.log('');
  const files = fs.readdirSync(SKILLS_DIR).filter(f => f.endsWith('.md'));
  console.log(`  已扫描 ${files.length} 个技能文件：`);
  files.forEach(f => console.log(`    · ${f}`));
  console.log('');
  console.log('  在 DataClaw 启动此服务器后，技能面板将自动同步');
  console.log('');
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ 端口 ${PORT} 已被占用`);
  } else {
    console.error('❌ 服务器错误:', err.message);
  }
  process.exit(1);
});
