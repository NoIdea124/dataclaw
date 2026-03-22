'use strict';

/**
 * DataClaw 模拟订单数据库 MCP Server
 *
 * 内置 1000 条订单明细，提供查询与聚合分析工具
 * 端口：3462
 *
 * 在 DataClaw 设置 > MCP 中添加：
 *   名称：订单数据库
 *   URL ：http://localhost:3462
 */

const http = require('http');
const PORT = 3462;

/* ── 数据生成 ── */

// 简单 LCG 伪随机（固定种子，保证数据可复现）
function makePRNG(seed) {
  let s = seed;
  return function () {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
function randInt(rng, lo, hi) { return lo + Math.floor(rng() * (hi - lo + 1)); }
function randFloat(rng, lo, hi, dp = 2) {
  return parseFloat((lo + rng() * (hi - lo)).toFixed(dp));
}

const CATEGORIES = {
  '电子产品': { products: ['智能手机', '笔记本电脑', '平板电脑', '蓝牙耳机', '智能手表'], priceRange: [199, 8999] },
  '服装箱包':  { products: ['运动T恤', '牛仔裤', '运动鞋', '羽绒外套', '双肩背包'],    priceRange: [39, 899]  },
  '食品生鲜':  { products: ['坚果礼盒', '精品茶叶', '咖啡豆', '零食大礼包', '有机大米'], priceRange: [19, 399]  },
  '家居生活':  { products: ['床上四件套', '厨具套装', '空气净化器', '香薰蜡烛', '收纳箱'], priceRange: [29, 1299] },
  '图书音像':  { products: ['技术编程书', '畅销小说', '商业管理书', '儿童绘本', '历史传记'], priceRange: [19, 199]  },
};

const REGIONS = {
  '华东': ['上海', '杭州', '南京', '苏州', '宁波'],
  '华南': ['广州', '深圳', '厦门', '珠海', '福州'],
  '华北': ['北京', '天津', '石家庄', '济南', '青岛'],
  '华中': ['武汉', '长沙', '郑州', '合肥', '南昌'],
  '西南': ['成都', '重庆', '昆明', '贵阳', '西安'],
};

const STATUSES    = ['待付款', '已付款', '备货中', '已发货', '已完成', '已退款'];
const STATUS_W    = [0.06, 0.10, 0.12, 0.17, 0.48, 0.07]; // 权重
const PAYMENTS    = ['支付宝', '微信支付', '银行卡', '信用卡'];
const PAYMENT_W   = [0.40, 0.35, 0.12, 0.13];
const CHANNELS    = ['官网', '天猫', '京东', '拼多多', '抖音'];

const SURNAMES    = ['王', '李', '张', '刘', '陈', '杨', '赵', '黄', '周', '吴', '徐', '孙', '马', '朱', '胡'];
const GIVEN_NAMES = ['伟', '芳', '娜', '秀英', '敏', '静', '磊', '强', '洋', '艳', '勇', '军', '杰', '涛', '明'];

function weightedPick(rng, items, weights) {
  const r = rng();
  let cum = 0;
  for (let i = 0; i < items.length; i++) {
    cum += weights[i];
    if (r < cum) return items[i];
  }
  return items[items.length - 1];
}

function fmtDate(ts) {
  const d = new Date(ts);
  return d.toISOString().slice(0, 10);
}

function generateOrders() {
  const rng = makePRNG(42);
  const orders = [];
  const START = new Date('2024-01-01').getTime();
  const END   = new Date('2024-12-31').getTime();

  for (let i = 1; i <= 1000; i++) {
    const orderId    = 'ORD-' + String(100000 + i);
    const customerId = 'C' + String(10000 + randInt(rng, 1, 300)).slice(1);
    const surname    = pick(rng, SURNAMES);
    const given      = pick(rng, GIVEN_NAMES);
    const custName   = surname + given;

    const catName  = pick(rng, Object.keys(CATEGORIES));
    const cat      = CATEGORIES[catName];
    const product  = pick(rng, cat.products);
    const unitPrice = randFloat(rng, cat.priceRange[0], cat.priceRange[1], 2);
    const qty       = randInt(rng, 1, 5);
    const discount  = pick(rng, [1, 1, 1, 0.95, 0.9, 0.85, 0.8]);
    const amount    = parseFloat((unitPrice * qty * discount).toFixed(2));

    const region    = pick(rng, Object.keys(REGIONS));
    const city      = pick(rng, REGIONS[region]);
    const status    = weightedPick(rng, STATUSES, STATUS_W);
    const payment   = weightedPick(rng, PAYMENTS, PAYMENT_W);
    const channel   = pick(rng, CHANNELS);

    const createdTs = START + Math.floor(rng() * (END - START));
    const createdAt = fmtDate(createdTs);
    const shippedAt = ['已发货', '已完成'].includes(status)
      ? fmtDate(createdTs + randInt(rng, 1, 7) * 86400000)
      : null;

    orders.push({
      order_id:     orderId,
      customer_id:  customerId,
      customer_name: custName,
      product_name: product,
      category:     catName,
      unit_price:   unitPrice,
      quantity:     qty,
      discount:     discount,
      amount:       amount,
      status,
      payment,
      channel,
      region,
      city,
      created_at:   createdAt,
      shipped_at:   shippedAt,
    });
  }
  return orders;
}

const ORDERS = generateOrders();

/* ── 工具实现 ── */

const SCHEMA = `订单明细表（orders，共 ${ORDERS.length} 条）

字段说明：
  order_id       - 订单号 (ORD-XXXXXX)
  customer_id    - 客户ID
  customer_name  - 客户姓名
  product_name   - 商品名称
  category       - 商品类目（电子产品 / 服装箱包 / 食品生鲜 / 家居生活 / 图书音像）
  unit_price     - 单价（元）
  quantity       - 购买数量
  discount       - 折扣（0.8~1.0）
  amount         - 实付金额（元）
  status         - 订单状态（待付款 / 已付款 / 备货中 / 已发货 / 已完成 / 已退款）
  payment        - 支付方式（支付宝 / 微信支付 / 银行卡 / 信用卡）
  channel        - 销售渠道（官网 / 天猫 / 京东 / 拼多多 / 抖音）
  region         - 区域（华东 / 华南 / 华北 / 华中 / 西南）
  city           - 城市
  created_at     - 下单日期（YYYY-MM-DD）
  shipped_at     - 发货日期（YYYY-MM-DD，未发货为 null）`;

// 通用过滤
function applyFilters(rows, f) {
  return rows.filter(r => {
    if (f.status      && r.status      !== f.status)      return false;
    if (f.region      && r.region      !== f.region)      return false;
    if (f.category    && r.category    !== f.category)    return false;
    if (f.payment     && r.payment     !== f.payment)     return false;
    if (f.channel     && r.channel     !== f.channel)     return false;
    if (f.city        && r.city        !== f.city)        return false;
    if (f.customer_name && !r.customer_name.includes(f.customer_name)) return false;
    if (f.product_name  && !r.product_name.includes(f.product_name))   return false;
    if (f.date_from   && r.created_at < f.date_from)    return false;
    if (f.date_to     && r.created_at > f.date_to)      return false;
    if (f.min_amount  && r.amount < f.min_amount)        return false;
    if (f.max_amount  && r.amount > f.max_amount)        return false;
    return true;
  });
}

function fmtTable(rows, cols) {
  if (!rows.length) return '（无匹配记录）';
  const widths = cols.map(c => Math.max(c.length, ...rows.map(r => String(r[c] ?? '').length)));
  const header = cols.map((c, i) => c.padEnd(widths[i])).join('  ');
  const sep    = widths.map(w => '-'.repeat(w)).join('  ');
  const body   = rows.map(r => cols.map((c, i) => String(r[c] ?? '').padEnd(widths[i])).join('  ')).join('\n');
  return [header, sep, body].join('\n');
}

// 1. 查询订单
function queryOrders(args) {
  const limit  = Math.min(args.limit || 20, 100);
  const offset = args.offset || 0;
  const filtered = applyFilters(ORDERS, args);
  const page   = filtered.slice(offset, offset + limit);

  const cols = ['order_id', 'customer_name', 'product_name', 'category', 'amount', 'status', 'region', 'created_at'];
  const table = fmtTable(page, cols);

  return [
    `查询结果：共 ${filtered.length} 条，显示第 ${offset + 1}–${Math.min(offset + limit, filtered.length)} 条`,
    '',
    '```',
    table,
    '```',
  ].join('\n');
}

// 2. 聚合分析
function aggregateOrders(args) {
  const { group_by, metric = 'count', date_from, date_to, status, region, category, channel } = args;
  const VALID_GROUP = ['status', 'region', 'category', 'payment', 'channel', 'city', 'month', 'day'];
  if (!group_by || !VALID_GROUP.includes(group_by)) {
    return `group_by 必须是以下之一：${VALID_GROUP.join(' / ')}`;
  }

  const filtered = applyFilters(ORDERS, { date_from, date_to, status, region, category, channel });

  const buckets = {};
  for (const r of filtered) {
    const key = group_by === 'month' ? r.created_at.slice(0, 7)
              : group_by === 'day'   ? r.created_at
              : r[group_by];
    if (!buckets[key]) buckets[key] = { count: 0, sum: 0 };
    buckets[key].count++;
    buckets[key].sum += r.amount;
  }

  const rows = Object.entries(buckets).map(([k, v]) => {
    const avg = v.count ? parseFloat((v.sum / v.count).toFixed(2)) : 0;
    return { [group_by]: k, 订单数: v.count, 总金额: v.sum.toFixed(2), 均单价: avg };
  });

  // day/month 按日期升序，其余按指标降序
  if (group_by === 'day' || group_by === 'month') rows.sort((a, b) => a[group_by] < b[group_by] ? -1 : 1);
  else if (metric === 'count') rows.sort((a, b) => b['订单数'] - a['订单数']);
  else rows.sort((a, b) => parseFloat(b['总金额']) - parseFloat(a['总金额']));

  const cols = [group_by, '订单数', '总金额', '均单价'];
  const table = fmtTable(rows, cols);

  const totalOrders = filtered.length;
  const totalAmount = filtered.reduce((s, r) => s + r.amount, 0).toFixed(2);

  return [
    `聚合分析：按 ${group_by} 分组，过滤后共 ${totalOrders} 条，总金额 ¥${totalAmount}`,
    '',
    '```',
    table,
    '```',
  ].join('\n');
}

// 3. 查单条订单
function getOrderDetail(args) {
  const order = ORDERS.find(o => o.order_id === args.order_id);
  if (!order) return `未找到订单：${args.order_id}`;
  const lines = Object.entries(order).map(([k, v]) => `  ${k.padEnd(14)} ${v ?? 'null'}`);
  return ['```', ...lines, '```'].join('\n');
}

// 4. 数据摘要统计
function getSummary() {
  const total  = ORDERS.length;
  const amount = ORDERS.reduce((s, r) => s + r.amount, 0);
  const statusCount = {};
  const catCount    = {};
  ORDERS.forEach(r => {
    statusCount[r.status]   = (statusCount[r.status] || 0) + 1;
    catCount[r.category]    = (catCount[r.category]  || 0) + 1;
  });

  const statusLines = Object.entries(statusCount).map(([k, v]) =>
    `  ${k}：${v} 条（${(v / total * 100).toFixed(1)}%）`).join('\n');
  const catLines = Object.entries(catCount).map(([k, v]) =>
    `  ${k}：${v} 条`).join('\n');

  return [
    `📊 订单数据库摘要`,
    '',
    `总订单数：${total}`,
    `总交易额：¥${amount.toFixed(2)}`,
    `均单金额：¥${(amount / total).toFixed(2)}`,
    '',
    `订单状态分布：`,
    statusLines,
    '',
    `商品类目分布：`,
    catLines,
    '',
    `数据时间范围：${ORDERS.reduce((m, r) => r.created_at < m ? r.created_at : m, '9')} ～ ${ORDERS.reduce((m, r) => r.created_at > m ? r.created_at : m, '0')}`,
  ].join('\n');
}

/* ── 工具定义 ── */
const TOOLS = [
  {
    name: 'get_schema',
    description: '查看订单表结构和字段说明，使用前建议先调用此工具了解数据结构',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_summary',
    description: '获取订单数据的整体统计摘要，包括总量、总金额、状态分布、类目分布等',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'query_orders',
    description: '查询订单明细，支持多维度过滤，返回分页结果',
    inputSchema: {
      type: 'object',
      properties: {
        status:        { type: 'string', description: '订单状态：待付款/已付款/备货中/已发货/已完成/已退款' },
        region:        { type: 'string', description: '区域：华东/华南/华北/华中/西南' },
        category:      { type: 'string', description: '商品类目：电子产品/服装箱包/食品生鲜/家居生活/图书音像' },
        payment:       { type: 'string', description: '支付方式：支付宝/微信支付/银行卡/信用卡' },
        channel:       { type: 'string', description: '销售渠道：官网/天猫/京东/拼多多/抖音' },
        city:          { type: 'string', description: '城市名称' },
        customer_name: { type: 'string', description: '客户姓名（模糊匹配）' },
        product_name:  { type: 'string', description: '商品名称（模糊匹配）' },
        date_from:     { type: 'string', description: '下单日期起（YYYY-MM-DD）' },
        date_to:       { type: 'string', description: '下单日期止（YYYY-MM-DD）' },
        min_amount:    { type: 'number', description: '最小实付金额' },
        max_amount:    { type: 'number', description: '最大实付金额' },
        limit:         { type: 'number', description: '返回条数，最多 100，默认 20' },
        offset:        { type: 'number', description: '跳过条数，默认 0' },
      },
    },
  },
  {
    name: 'aggregate_orders',
    description: '对订单数据进行分组聚合分析，统计各维度的订单量和金额',
    inputSchema: {
      type: 'object',
      required: ['group_by'],
      properties: {
        group_by: {
          type: 'string',
          enum: ['status', 'region', 'category', 'payment', 'channel', 'city', 'month', 'day'],
          description: '分组维度：status=订单状态, region=区域, category=类目, payment=支付方式, channel=渠道, city=城市, month=月份, day=每天',
        },
        metric: {
          type: 'string',
          enum: ['count', 'amount'],
          description: '排序指标：count=按订单量降序（默认），amount=按金额降序',
        },
        status:   { type: 'string', description: '筛选订单状态' },
        region:   { type: 'string', description: '筛选区域' },
        category: { type: 'string', description: '筛选商品类目' },
        channel:  { type: 'string', description: '筛选销售渠道' },
        date_from: { type: 'string', description: '下单日期起（YYYY-MM-DD）' },
        date_to:   { type: 'string', description: '下单日期止（YYYY-MM-DD）' },
      },
    },
  },
  {
    name: 'get_order_detail',
    description: '根据订单号查询单条订单的完整信息',
    inputSchema: {
      type: 'object',
      required: ['order_id'],
      properties: {
        order_id: { type: 'string', description: '订单号，格式 ORD-XXXXXX' },
      },
    },
  },
];

/* ── 工具路由 ── */
async function callTool(name, args) {
  let text;
  switch (name) {
    case 'get_schema':       text = SCHEMA;                break;
    case 'get_summary':      text = getSummary();          break;
    case 'query_orders':     text = queryOrders(args);     break;
    case 'aggregate_orders': text = aggregateOrders(args); break;
    case 'get_order_detail': text = getOrderDetail(args);  break;
    default: throw { code: -32601, message: `未知工具: ${name}` };
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
        serverInfo: { name: 'database-mcp', version: '1.0.0' },
      };
    case 'initialized': return {};
    case 'tools/list':  return { tools: TOOLS };
    case 'tools/call':  return callTool(rpc.params?.name, rpc.params?.arguments ?? {});
    default: throw { code: -32601, message: `Method not found: ${rpc.method}` };
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
    res.end('Method Not Allowed'); return;
  }

  let body = '';
  req.on('data', c => body += c);
  req.on('end', async () => {
    let rpc;
    try { rpc = JSON.parse(body); }
    catch (_) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null }));
      return;
    }

    const isBatch  = Array.isArray(rpc);
    const requests = isBatch ? rpc : [rpc];
    const responses = [];

    for (const item of requests) {
      try {
        const result = await handleRPC(item);
        if (item.id !== undefined && item.id !== null)
          responses.push({ jsonrpc: '2.0', result, id: item.id });
      } catch (e) {
        const err = (e && e.code) ? e : { code: -32603, message: String(e?.message ?? e) };
        if (item.id !== undefined && item.id !== null)
          responses.push({ jsonrpc: '2.0', error: err, id: item.id });
        console.error(`[ERR] ${item.method}:`, err.message);
      }
    }

    const out = isBatch ? JSON.stringify(responses) : JSON.stringify(responses[0] ?? {});
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(out);
    console.log(`[${new Date().toLocaleTimeString()}] ${isBatch ? '[batch]' : (rpc.method ?? '?')}`);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  🗄️  订单数据库 MCP Server 已启动');
  console.log('');
  console.log(`  端口：http://localhost:${PORT}`);
  console.log(`  数据：${ORDERS.length} 条订单（2024年全年，固定种子可复现）`);
  console.log('');
  console.log('  工具列表：');
  TOOLS.forEach(t => console.log(`    · ${t.name}`));
  console.log('');
  console.log('  在 DataClaw 设置 > MCP 添加：');
  console.log('    名称：订单数据库');
  console.log(`    URL ：http://localhost:${PORT}`);
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
