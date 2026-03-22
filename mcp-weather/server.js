/**
 * DataClaw Weather MCP Server
 *
 * 实现 MCP JSON-RPC 2.0 协议，提供天气查询工具
 * 数据来源：Open-Meteo（完全免费，无需 API Key）
 *
 * 运行：node server.js
 * 端点：http://localhost:3456
 *
 * 在 DataClaw 设置 > MCP 中添加：
 *   名称：天气查询
 *   URL ：http://localhost:3456
 */

'use strict';

const http  = require('http');
const https = require('https');

const PORT = 3456;

/* ── WMO 天气代码 → 中文描述 ── */
const WMO = {
  0:'晴天', 1:'大部晴天', 2:'部分多云', 3:'阴天',
  45:'雾', 48:'雾凇',
  51:'轻度毛毛雨', 53:'毛毛雨', 55:'浓毛毛雨',
  56:'冻毛毛雨', 57:'强冻毛毛雨',
  61:'小雨', 63:'中雨', 65:'大雨',
  66:'小冻雨', 67:'大冻雨',
  71:'小雪', 73:'中雪', 75:'大雪', 77:'冰粒',
  80:'阵雨', 81:'较强阵雨', 82:'强阵雨',
  85:'阵雪', 86:'强阵雪',
  95:'雷暴', 96:'雷暴伴小冰雹', 99:'雷暴伴大冰雹',
};

const WIND_DIRS = ['北','东北','东','东南','南','西南','西','西北'];

function wmoDesc(code) {
  return WMO[code] ?? `未知(${code})`;
}

function windDir(deg) {
  return WIND_DIRS[Math.round((deg ?? 0) / 45) % 8];
}

/* ── HTTP 工具函数 ── */
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': 'DataClaw-WeatherMCP/1.0' } }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch(e) { reject(new Error('JSON 解析失败: ' + raw.slice(0, 120))); }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('请求超时')); });
  });
}

/* ── 地理编码：城市名 → 经纬度 ── */
async function geocode(city) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=3&language=zh&format=json`;
  const data = await fetchJSON(url);
  const loc = data.results?.[0];
  if (!loc) throw new Error(`找不到城市「${city}」，请尝试英文名或更换城市`);
  return loc; // { name, latitude, longitude, country, admin1 }
}

/* ── 当前天气 ── */
async function getCurrentWeather(city) {
  const loc = await geocode(city);
  const url = [
    `https://api.open-meteo.com/v1/forecast`,
    `?latitude=${loc.latitude}&longitude=${loc.longitude}`,
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature`,
    `,precipitation,weather_code,wind_speed_10m,wind_direction_10m`,
    `,surface_pressure,visibility`,
    `&timezone=auto`,
  ].join('');
  const data = await fetchJSON(url);
  const c = data.current;
  const region = [loc.admin1, loc.country].filter(Boolean).join('·');

  const lines = [
    `📍 ${loc.name}（${region}）`,
    ``,
    `天气状况  ${wmoDesc(c.weather_code)}`,
    `气    温  ${c.temperature_2m}°C（体感 ${c.apparent_temperature}°C）`,
    `湿    度  ${c.relative_humidity_2m}%`,
    `风    速  ${c.wind_speed_10m} km/h  方向 ${windDir(c.wind_direction_10m)}`,
    `降    水  ${c.precipitation} mm`,
    `气    压  ${c.surface_pressure} hPa`,
    `能见度    ${c.visibility != null ? (c.visibility / 1000).toFixed(1) + ' km' : 'N/A'}`,
    ``,
    `更新时间  ${c.time}  (${data.timezone})`,
  ];
  return lines.join('\n');
}

/* ── 天气预报 ── */
async function getForecast(city, days) {
  const loc = await geocode(city);
  const d = Math.min(Math.max(parseInt(days) || 7, 1), 16);
  const url = [
    `https://api.open-meteo.com/v1/forecast`,
    `?latitude=${loc.latitude}&longitude=${loc.longitude}`,
    `&daily=weather_code,temperature_2m_max,temperature_2m_min`,
    `,precipitation_sum,wind_speed_10m_max,uv_index_max`,
    `&timezone=auto&forecast_days=${d}`,
  ].join('');
  const data = await fetchJSON(url);
  const dl = data.daily;
  const region = [loc.admin1, loc.country].filter(Boolean).join('·');

  const header = [
    `📍 ${loc.name}（${region}） — ${d} 天预报`,
    ``,
    `日期          天气        气温(低~高)     降水      UV  风速`,
    `${'─'.repeat(62)}`,
  ];
  const rows = dl.time.map((date, i) => {
    const cond  = wmoDesc(dl.weather_code[i]).padEnd(8);
    const temps = `${dl.temperature_2m_min[i]}~${dl.temperature_2m_max[i]}°C`.padEnd(12);
    const rain  = `${dl.precipitation_sum[i]}mm`.padEnd(8);
    const uv    = String(dl.uv_index_max[i] ?? '-').padEnd(4);
    const wind  = `${dl.wind_speed_10m_max[i]}km/h`;
    return `${date}    ${cond}  ${temps}  ${rain}  ${uv}  ${wind}`;
  });
  return [...header, ...rows].join('\n');
}

/* ── 空气质量（仅支持部分城市，Open-Meteo Air Quality API）── */
async function getAirQuality(city) {
  const loc = await geocode(city);
  const url = [
    `https://air-quality-api.open-meteo.com/v1/air-quality`,
    `?latitude=${loc.latitude}&longitude=${loc.longitude}`,
    `&current=pm10,pm2_5,carbon_dioxide,us_aqi`,
    `&timezone=auto`,
  ].join('');
  const data = await fetchJSON(url);
  const c = data.current;
  const region = [loc.admin1, loc.country].filter(Boolean).join('·');

  function aqiLevel(aqi) {
    if (aqi == null) return 'N/A';
    if (aqi <= 50)  return `${aqi} 优`;
    if (aqi <= 100) return `${aqi} 良`;
    if (aqi <= 150) return `${aqi} 轻度污染`;
    if (aqi <= 200) return `${aqi} 中度污染`;
    if (aqi <= 300) return `${aqi} 重度污染`;
    return `${aqi} 严重污染`;
  }

  const lines = [
    `📍 ${loc.name}（${region}）空气质量`,
    ``,
    `AQI（美标）  ${aqiLevel(c.us_aqi)}`,
    `PM2.5       ${c.pm2_5 != null ? c.pm2_5 + ' μg/m³' : 'N/A'}`,
    `PM10        ${c.pm10  != null ? c.pm10  + ' μg/m³' : 'N/A'}`,
    `CO₂         ${c.carbon_dioxide != null ? c.carbon_dioxide + ' ppm' : 'N/A'}`,
    ``,
    `更新时间  ${c.time}  (${data.timezone})`,
  ];
  return lines.join('\n');
}

/* ── 工具定义 ── */
const TOOLS = [
  {
    name: 'get_current_weather',
    description: '查询指定城市当前实时天气，包括气温、体感温度、湿度、风速风向、降水量、气压、能见度',
    inputSchema: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: '城市名称，支持中英文，如：北京、上海、广州、London、Tokyo、New York',
        },
      },
      required: ['city'],
    },
  },
  {
    name: 'get_weather_forecast',
    description: '查询指定城市未来 1~16 天天气预报，包含每日最高最低气温、天气状况、降水量、UV 指数、最大风速',
    inputSchema: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: '城市名称，支持中英文',
        },
        days: {
          type: 'number',
          description: '预报天数，1~16，默认 7 天',
        },
      },
      required: ['city'],
    },
  },
  {
    name: 'get_air_quality',
    description: '查询指定城市当前空气质量，包括 AQI（美标）、PM2.5、PM10、CO₂ 浓度',
    inputSchema: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: '城市名称，支持中英文',
        },
      },
      required: ['city'],
    },
  },
];

/* ── 工具路由 ── */
async function callTool(name, args) {
  let text;
  if (name === 'get_current_weather') {
    text = await getCurrentWeather(args.city);
  } else if (name === 'get_weather_forecast') {
    text = await getForecast(args.city, args.days);
  } else if (name === 'get_air_quality') {
    text = await getAirQuality(args.city);
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
        serverInfo: { name: 'weather-mcp', version: '1.0.0' },
      };
    case 'initialized':
      return {}; // notification ACK
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
  // CORS — 允许浏览器直接调用
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204); res.end(); return;
  }
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

    const isBatch = Array.isArray(rpc);
    const requests = isBatch ? rpc : [rpc];
    const responses = [];

    for (const req_item of requests) {
      try {
        const result = await handleRPC(req_item);
        // notifications (no id) don't get responses
        if (req_item.id !== undefined && req_item.id !== null) {
          responses.push({ jsonrpc: '2.0', result, id: req_item.id });
        }
      } catch(e) {
        const err = (e && e.code) ? e : { code: -32603, message: String(e?.message ?? e) };
        if (req_item.id !== undefined && req_item.id !== null) {
          responses.push({ jsonrpc: '2.0', error: err, id: req_item.id });
        }
        console.error(`[ERR] ${req_item.method}:`, err.message);
      }
    }

    const body_out = isBatch ? JSON.stringify(responses) : JSON.stringify(responses[0] ?? {});
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(body_out);

    // Access log
    const id = isBatch ? '[batch]' : (rpc.method ?? '?');
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${id}`);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  🌤  Weather MCP Server 已启动');
  console.log('');
  console.log(`  端点：http://localhost:${PORT}`);
  console.log('');
  console.log('  工具列表：');
  TOOLS.forEach(t => console.log(`    · ${t.name}`));
  console.log('');
  console.log('  数据来源：Open-Meteo（免费，无需 API Key）');
  console.log('');
  console.log('  在 DataClaw 设置 > MCP 添加：');
  console.log(`    名称：天气查询`);
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
