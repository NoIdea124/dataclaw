const http = require('http');
const https = require('https');

const PORT = 3459;

const KB_SOURCES = [
  { id: 'wikipedia',         name: 'Wikipedia',          tool: 'search_wikipedia',         description: '维基百科 · 全球最大百科全书，支持中英文搜索' },
  { id: 'pubmed',            name: 'PubMed',              tool: 'search_pubmed',            description: '美国国立医学图书馆 · 生物医学文献 4000万+' },
  { id: 'arxiv',             name: 'arXiv',               tool: 'search_arxiv',             description: '康奈尔大学 · 物理/CS/数学预印本论文库' },
  { id: 'semantic_scholar',  name: 'Semantic Scholar',    tool: 'search_semantic_scholar',  description: 'Allen AI · 2亿+ 学术论文语义搜索' },
  { id: 'sec_edgar',         name: 'SEC EDGAR',           tool: 'search_sec_edgar',         description: '美国 SEC · 上市公司财报全文检索（无需 Key）' },
  { id: 'worldbank',         name: 'World Bank',          tool: 'search_worldbank',         description: '世界银行开放数据 · 全球宏观经济指标' },
  { id: 'courtlistener',     name: 'CourtListener',       tool: 'search_courtlistener',     description: '美国法院判决数据库 · 持续更新的联邦/州判决' },
];

const TOOLS = [
  {
    name: 'search_wikipedia',
    description: '在维基百科中搜索文章，支持中英文。适合查询百科知识、人物、事件、概念等。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
        lang:  { type: 'string', description: '语言代码，zh=中文，en=英文，默认 zh', default: 'zh' },
        limit: { type: 'number', description: '返回结果数，默认 3', default: 3 },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_pubmed',
    description: '在 PubMed 搜索生物医学文献，返回标题、摘要、作者、期刊。适合医学研究问题。',
    inputSchema: {
      type: 'object',
      properties: {
        query:       { type: 'string', description: '搜索关键词（支持 MeSH 词汇）' },
        max_results: { type: 'number', description: '返回结果数，默认 5', default: 5 },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_arxiv',
    description: '在 arXiv 搜索预印本论文（物理、计算机科学、数学、经济学等），返回标题、摘要、作者。',
    inputSchema: {
      type: 'object',
      properties: {
        query:       { type: 'string', description: '搜索关键词' },
        max_results: { type: 'number', description: '返回结果数，默认 5', default: 5 },
        category:    { type: 'string', description: 'arXiv 分类，如 cs.AI, q-fin.ST 等（可选）' },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_semantic_scholar',
    description: '在 Semantic Scholar 搜索学术论文，返回标题、摘要、引用数、年份。适合学术研究。',
    inputSchema: {
      type: 'object',
      properties: {
        query:       { type: 'string', description: '搜索关键词' },
        max_results: { type: 'number', description: '返回结果数，默认 5', default: 5 },
        year_filter: { type: 'string', description: '年份范围，如 2020-2024（可选）' },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_sec_edgar',
    description: '搜索 SEC EDGAR 美国上市公司财务报告（10-K 年报、10-Q 季报、8-K 等）。无需 API Key。',
    inputSchema: {
      type: 'object',
      properties: {
        query:       { type: 'string', description: '搜索关键词，公司名称或财务术语' },
        form_type:   { type: 'string', description: '报告类型：10-K, 10-Q, 8-K 等（可选）' },
        max_results: { type: 'number', description: '返回结果数，默认 5', default: 5 },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_worldbank',
    description: '查询世界银行开放数据，获取各国宏观经济指标（GDP、人口、贸易等）。',
    inputSchema: {
      type: 'object',
      properties: {
        query:     { type: 'string', description: '自然语言搜索，如"中国 GDP"、"美国人口"' },
        indicator: { type: 'string', description: '世界银行指标代码，如 NY.GDP.MKTP.CD（可选）' },
        country:   { type: 'string', description: '国家代码，如 CN=中国，US=美国，默认 CN', default: 'CN' },
      },
    },
  },
  {
    name: 'search_courtlistener',
    description: '搜索美国法院判决（联邦和州法院），返回案件名、法院、日期、摘要。',
    inputSchema: {
      type: 'object',
      properties: {
        query:       { type: 'string', description: '搜索关键词或法律术语' },
        max_results: { type: 'number', description: '返回结果数，默认 5', default: 5 },
      },
      required: ['query'],
    },
  },
];

// ── HTTP helper ──────────────────────────────────────────────────────────────
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': 'DataClaw-Knowledge/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.setTimeout(12000, () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

// ── Tool implementations ─────────────────────────────────────────────────────
async function searchWikipedia({ query, lang = 'zh', limit = 3 }) {
  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=${limit}&format=json&origin=*`;
  const { data } = await httpGet(url);
  const pages = JSON.parse(data).query?.search || [];
  if (!pages.length) return '未找到相关词条';

  const articles = await Promise.all(pages.slice(0, limit).map(async (p) => {
    const sumUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(p.title)}`;
    try {
      const { data: sd } = await httpGet(sumUrl);
      const s = JSON.parse(sd);
      return `**${s.title}**\n${(s.extract || '').slice(0, 500)}\n来源: ${s.content_urls?.desktop?.page || ''}`;
    } catch {
      return `**${p.title}**\n${(p.snippet || '').replace(/<[^>]+>/g, '')}\n来源: https://${lang}.wikipedia.org/wiki/${encodeURIComponent(p.title)}`;
    }
  }));
  return articles.join('\n\n---\n\n');
}

async function searchPubmed({ query, max_results = 5 }) {
  const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${max_results}&retmode=json`;
  const { data } = await httpGet(searchUrl);
  const ids = JSON.parse(data).esearchresult?.idlist || [];
  if (!ids.length) return '未找到相关文献';

  const sumUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json`;
  const { data: sd } = await httpGet(sumUrl);
  const result = JSON.parse(sd);

  return ids.map(id => {
    const doc = result.result?.[id];
    if (!doc) return '';
    const authors = (doc.authors || []).slice(0, 3).map(a => a.name).join(', ') + ((doc.authors?.length > 3) ? ' 等' : '');
    return `**${doc.title}**\n作者: ${authors}\n期刊: ${doc.source} (${doc.pubdate})\nPMID: ${id} · https://pubmed.ncbi.nlm.nih.gov/${id}/`;
  }).filter(Boolean).join('\n\n---\n\n');
}

async function searchArxiv({ query, max_results = 5, category }) {
  const q = category ? `cat:${category} AND ${query}` : query;
  const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(q)}&start=0&max_results=${max_results}&sortBy=relevance`;
  const { data } = await httpGet(url);

  const entries = data.match(/<entry>([\s\S]*?)<\/entry>/g) || [];
  if (!entries.length) return '未找到相关论文';

  return entries.slice(0, max_results).map(e => {
    const title     = (e.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '').trim().replace(/\n/g, ' ');
    const summary   = (e.match(/<summary>([\s\S]*?)<\/summary>/)?.[1] || '').trim().slice(0, 300);
    const published = (e.match(/<published>(.*?)<\/published>/)?.[1] || '').slice(0, 10);
    const arxivId   = e.match(/<id>(.*?)<\/id>/)?.[1] || '';
    const authors   = [...e.matchAll(/<name>(.*?)<\/name>/g)].slice(0, 3).map(m => m[1]).join(', ');
    return `**${title}** (${published})\n作者: ${authors}\n摘要: ${summary}…\n链接: ${arxivId}`;
  }).join('\n\n---\n\n');
}

async function searchSemanticScholar({ query, max_results = 5, year_filter }) {
  let url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${max_results}&fields=title,abstract,year,authors,citationCount,url`;
  if (year_filter) url += `&year=${year_filter}`;
  const { data } = await httpGet(url);
  const papers = JSON.parse(data).data || [];
  if (!papers.length) return '未找到相关论文';

  return papers.map(p => {
    const authors  = (p.authors || []).slice(0, 3).map(a => a.name).join(', ') + (p.authors?.length > 3 ? ' 等' : '');
    const abstract = (p.abstract || '无摘要').slice(0, 300);
    return `**${p.title}** (${p.year})\n作者: ${authors} · 引用: ${p.citationCount}\n摘要: ${abstract}…\n链接: ${p.url}`;
  }).join('\n\n---\n\n');
}

async function searchSecEdgar({ query, form_type, max_results = 5 }) {
  let url = `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent('"' + query + '"')}&dateRange=custom&startdt=2019-01-01&enddt=2025-12-31`;
  if (form_type) url += `&forms=${form_type}`;
  const { data } = await httpGet(url);
  const hits = JSON.parse(data).hits?.hits || [];
  if (!hits.length) return '未找到相关文件';

  return hits.slice(0, max_results).map(h => {
    const s = h._source || {};
    return `**${s.entity_name || '未知公司'}** · ${s.form_type || ''}\n报告期: ${s.period_of_report || '-'} · 提交: ${s.file_date || '-'}\n链接: https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${encodeURIComponent(s.entity_name || '')}&type=${s.form_type || ''}`;
  }).join('\n\n---\n\n');
}

async function searchWorldbank({ query, indicator, country = 'CN' }) {
  // If no indicator code, search for matching indicator
  if (!indicator && query) {
    const searchUrl = `https://api.worldbank.org/v2/indicator?format=json&per_page=5&source=2&q=${encodeURIComponent(query)}`;
    const { data } = await httpGet(searchUrl);
    const list = JSON.parse(data)[1] || [];
    if (!list.length) return '未找到相关指标，请尝试使用英文关键词';
    indicator = list[0].id;
  }
  if (!indicator) return '请提供 query 或 indicator 参数';

  const url = `https://api.worldbank.org/v2/country/${country}/indicator/${indicator}?format=json&mrv=5&per_page=5`;
  const { data } = await httpGet(url);
  const records = JSON.parse(data)[1] || [];
  if (!records.length) return '未找到数据';

  const name = records[0]?.indicator?.value || indicator;
  const cname = records[0]?.country?.value || country;
  const rows = records.filter(r => r.value !== null).map(r => `${r.date}年: ${Number(r.value).toLocaleString()}`);
  return `**${name} · ${cname}**\n${rows.join('\n')}\n数据来源: 世界银行 (${indicator})`;
}

async function searchCourtlistener({ query, max_results = 5 }) {
  const url = `https://www.courtlistener.com/api/rest/v4/search/?q=${encodeURIComponent(query)}&type=o&format=json&page_size=${max_results}`;
  const { data } = await httpGet(url);
  const results = JSON.parse(data).results || [];
  if (!results.length) return '未找到相关判决';

  return results.slice(0, max_results).map(r => {
    const snippet = (r.snippet || '').replace(/<[^>]+>/g, '').slice(0, 300);
    return `**${r.caseName}**\n法院: ${r.court} · 日期: ${r.dateFiled}\n${snippet}\n链接: https://www.courtlistener.com${r.absolute_url}`;
  }).join('\n\n---\n\n');
}

async function executeTool(name, args) {
  switch (name) {
    case 'search_wikipedia':        return searchWikipedia(args);
    case 'search_pubmed':           return searchPubmed(args);
    case 'search_arxiv':            return searchArxiv(args);
    case 'search_semantic_scholar': return searchSemanticScholar(args);
    case 'search_sec_edgar':        return searchSecEdgar(args);
    case 'search_worldbank':        return searchWorldbank(args);
    case 'search_courtlistener':    return searchCourtlistener(args);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

// ── JSON-RPC handler ─────────────────────────────────────────────────────────
async function handleRPC(body) {
  const { method, params, id } = body;

  if (method === 'initialize') {
    return { jsonrpc: '2.0', id, result: {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'dataclaw-knowledge', version: '1.0.0' }
    }};
  }

  if (method === 'tools/list') {
    return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
  }

  if (method === 'tools/call') {
    const { name, arguments: args } = params;
    try {
      const text = await executeTool(name, args || {});
      return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } };
    } catch (e) {
      return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `错误: ${e.message}` }], isError: true } };
    }
  }

  return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } };
}

// ── HTTP server ──────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Metadata endpoint for DataClaw UI
  if (req.method === 'GET' && req.url === '/api/sources') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(KB_SOURCES));
    return;
  }

  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const response = await handleRPC(JSON.parse(body));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  res.writeHead(404); res.end();
});

server.listen(PORT, () => {
  console.log(`DataClaw Knowledge MCP Server running on port ${PORT}`);
  console.log(`Sources: ${KB_SOURCES.map(s => s.name).join(', ')}`);
});
