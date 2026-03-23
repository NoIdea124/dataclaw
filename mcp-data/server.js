'use strict';
/**
 * DataClaw 数据资产目录 MCP Server  —  端口 3462
 *
 * 工具:
 *   search_tables(query, layer, limit)   — 按关键词搜索数据表
 *   get_table_detail(table_name)         — 查表元数据与关联指标
 *   list_tables(layer)                   — 列出所有/指定层级的表
 *   list_layers()                        — 数据层级统计
 */

const http = require('http');
const PORT = 3462;

/* ── 数据表资产 ── */
const TABLES = [
  /* ─ ODS ─ */
  {
    name: 'ods_order_info',
    display_name: '订单基础信息表',
    layer: 'ODS',
    category: '订单域',
    description: '来源于业务系统的原始订单数据，包含订单号、买家 ID、商品列表、下单时间、支付状态、实付金额等核心字段，未经清洗，保留原始值。',
    owner: '交易中台',
    update_freq: '实时',
    row_count: '10亿+',
    sensitivity: '机密',
    status: '生产',
    tags: ['订单', '原始', '交易', 'ODS'],
    fields: ['order_id','buyer_id','seller_id','goods_list','amount','pay_status','create_time','pay_time'],
    metrics: ['gmv','order_cnt','avg_order_value','pay_rate'],
    partitions: ['dt(日期)'],
  },
  {
    name: 'ods_product_info',
    display_name: '商品基础信息表',
    layer: 'ODS',
    category: '商品域',
    description: '同步自商品中台的原始商品档案，包含商品 ID、名称、类目、价格、库存、上架状态、品牌等字段，T+1 全量更新。',
    owner: '商品中台',
    update_freq: '天',
    row_count: '5000万',
    sensitivity: '内部',
    status: '生产',
    tags: ['商品', '类目', '价格', '库存', 'ODS'],
    fields: ['goods_id','goods_name','category_id','price','stock','status','brand','create_time'],
    metrics: ['inventory_turnover_rate'],
    partitions: ['dt(日期)'],
  },

  /* ─ DWD ─ */
  {
    name: 'dwd_user_action_log_di',
    display_name: '用户行为明细日表',
    layer: 'DWD',
    category: '用户域',
    description: '经过清洗去噪的用户行为事件明细，覆盖浏览、搜索、加购、下单、支付等全链路行为，按自然日分区，支持漏斗分析和路径分析。',
    owner: '增长分析组',
    update_freq: '天',
    row_count: '50亿',
    sensitivity: '机密',
    status: '生产',
    tags: ['用户', '行为', '日活', '漏斗', 'DAU', 'MAU'],
    fields: ['user_id','event_type','page_name','item_id','channel','device','platform','region','ts','dt'],
    metrics: ['dau','mau','new_user_cnt'],
    partitions: ['dt(日期)'],
  },
  {
    name: 'dwd_order_detail_di',
    display_name: '订单明细日表',
    layer: 'DWD',
    category: '订单域',
    description: '清洗标准化后的订单明细，含买家 ID、商品列表、实付金额、优惠信息、支付方式、物流单号等完整字段，是 GMV、客单价等交易指标的核算基础。',
    owner: '交易中台',
    update_freq: '天',
    row_count: '5亿',
    sensitivity: '机密',
    status: '生产',
    tags: ['订单', '交易', 'GMV', '客单价', '支付'],
    fields: ['order_id','buyer_id','goods_list','amount','discount','pay_method','logistics_no','order_status','dt'],
    metrics: ['gmv','order_cnt','avg_order_value','pay_rate'],
    partitions: ['dt(日期)'],
  },
  {
    name: 'dwd_order_item_di',
    display_name: '订单商品明细日表',
    layer: 'DWD',
    category: '订单域',
    description: '订单维度拆解到 SKU 级别的明细表，每行为一笔订单中的一件商品，含商品 ID、数量、单价、优惠金额等，用于商品维度的销售分析。',
    owner: '交易中台',
    update_freq: '天',
    row_count: '15亿',
    sensitivity: '机密',
    status: '生产',
    tags: ['订单', '商品', 'SKU', '销售额', '数量'],
    fields: ['order_id','goods_id','sku_id','qty','unit_price','discount_amount','category_id','dt'],
    metrics: ['gmv','sales_volume'],
    partitions: ['dt(日期)'],
  },
  {
    name: 'dwd_payment_di',
    display_name: '支付流水日表',
    layer: 'DWD',
    category: '财务域',
    description: '来自支付系统的支付流水明细，记录每笔交易的支付金额、支付方式、支付状态、退款情况等，用于账款核对和财务分析。',
    owner: '财务技术组',
    update_freq: '实时',
    row_count: '3亿',
    sensitivity: '机密',
    status: '生产',
    tags: ['支付', '流水', '退款', '财务', '收入'],
    fields: ['pay_id','order_id','user_id','amount','pay_method','pay_status','refund_amount','pay_time','dt'],
    metrics: ['net_revenue','refund_rate'],
    partitions: ['dt(日期)'],
  },
  {
    name: 'dwd_product_behavior_di',
    display_name: '商品行为明细日表',
    layer: 'DWD',
    category: '商品域',
    description: '用户对商品的行为事件明细，包含商品详情页浏览、加购、收藏、分享等事件，是商品转化率、加购率等指标的计算基础。',
    owner: '商品增长组',
    update_freq: '天',
    row_count: '20亿',
    sensitivity: '内部',
    status: '生产',
    tags: ['商品', '加购', '转化', '浏览', '收藏'],
    fields: ['user_id','goods_id','action_type','category_id','device','channel','ts','dt'],
    metrics: ['cart_rate','product_page_cvr','uv_cvr'],
    partitions: ['dt(日期)'],
  },
  {
    name: 'dwd_traffic_log_di',
    display_name: '流量日志日表',
    layer: 'DWD',
    category: '流量域',
    description: '来自 Nginx/CDN 的原始访问日志经过解析后的明细表，记录每次页面访问的渠道、设备、停留时长、跳出行为等，用于流量漏斗和来源分析。',
    owner: '流量分析组',
    update_freq: '天',
    row_count: '100亿',
    sensitivity: '内部',
    status: '生产',
    tags: ['流量', '访问', '跳出', '渠道', 'UV', 'PV'],
    fields: ['session_id','user_id','page_name','channel','device','platform','duration','is_bounce','dt'],
    metrics: ['uv','bounce_rate','uv_cvr'],
    partitions: ['dt(日期)'],
  },
  {
    name: 'dwd_logistics_info',
    display_name: '物流信息明细表',
    layer: 'DWD',
    category: '物流域',
    description: '从物流系统同步的包裹轨迹明细，记录揽收、在途、派件、签收、异常等状态及时间节点，是物流时效和履约率指标的数据来源。',
    owner: '物流技术组',
    update_freq: '小时',
    row_count: '8亿',
    sensitivity: '内部',
    status: '生产',
    tags: ['物流', '配送', '签收', '时效', '履约'],
    fields: ['logistics_no','order_id','status','city','carrier','pickup_time','deliver_time','sign_time','dt'],
    metrics: ['delivery_timeliness','logistics_satisfaction'],
    partitions: ['dt(日期)'],
  },
  {
    name: 'dwd_coupon_usage_di',
    display_name: '优惠券核销明细日表',
    layer: 'DWD',
    category: '营销域',
    description: '记录每张优惠券的发放、领取、使用、过期全生命周期明细，是优惠券核销率、营销 ROI 分析的基础数据。',
    owner: '营销技术组',
    update_freq: '天',
    row_count: '5亿',
    sensitivity: '内部',
    status: '生产',
    tags: ['优惠券', '营销', '核销', '促销', 'ROI'],
    fields: ['coupon_id','user_id','order_id','face_value','discount_amount','channel','status','issue_time','use_time','dt'],
    metrics: ['coupon_redemption_rate','marketing_roi'],
    partitions: ['dt(日期)'],
  },

  /* ─ DWS ─ */
  {
    name: 'dws_user_trade_30d_di',
    display_name: '用户近30日交易汇总日表',
    layer: 'DWS',
    category: '用户域',
    description: '以用户为粒度汇总近30天的交易行为，包含下单次数、实付金额、最近购买时间、RFM 分层标签等，用于用户价值分析和留存建模。',
    owner: '用户运营组',
    update_freq: '天',
    row_count: '5000万',
    sensitivity: '机密',
    status: '生产',
    tags: ['用户', '留存', '复购', 'RFM', '价值分层'],
    fields: ['user_id','order_cnt_30d','gmv_30d','last_order_date','r_score','f_score','m_score','user_segment','dt'],
    metrics: ['user_retention_d7','repurchase_rate_30d','high_value_user_rate'],
    partitions: ['dt(日期)'],
  },
  {
    name: 'dws_order_daily_agg',
    display_name: '订单每日聚合宽表',
    layer: 'DWS',
    category: '订单域',
    description: '按日期 × 渠道 × 类目 × 地域等维度组合聚合的订单宽表，覆盖 GMV、订单数、客单价、转化率等核心指标，供报表层直接查询。',
    owner: '交易中台',
    update_freq: '天',
    row_count: '2000万',
    sensitivity: '内部',
    status: '生产',
    tags: ['订单', 'GMV', '聚合', '宽表', '日报'],
    fields: ['dt','channel','category','region','gmv','order_cnt','user_cnt','avg_price','cvr'],
    metrics: ['gmv','order_cnt','avg_order_value'],
    partitions: ['dt(日期)'],
  },
  {
    name: 'dws_product_sales_agg',
    display_name: '商品销售聚合宽表',
    layer: 'DWS',
    category: '商品域',
    description: '以商品 SKU 为粒度聚合的销售宽表，包含每日/近7日/近30日销售额、销量、退货率、库存周转等字段，支持商品销售分析。',
    owner: '商品增长组',
    update_freq: '天',
    row_count: '1亿',
    sensitivity: '内部',
    status: '生产',
    tags: ['商品', '销售额', '销量', '库存', '周转率'],
    fields: ['goods_id','category_id','sales_1d','sales_7d','sales_30d','qty_1d','refund_rate','stock','dt'],
    metrics: ['sales_volume','inventory_turnover_rate'],
    partitions: ['dt(日期)'],
  },
  {
    name: 'dws_traffic_channel_agg',
    display_name: '流量渠道聚合宽表',
    layer: 'DWS',
    category: '流量域',
    description: '按渠道 × 设备 × 平台聚合的流量宽表，含 UV、PV、跳出率、平均停留时长、转化率等，是流量分析看板的核心数据源。',
    owner: '流量分析组',
    update_freq: '天',
    row_count: '500万',
    sensitivity: '内部',
    status: '生产',
    tags: ['流量', 'UV', 'PV', '渠道', '跳出率', '转化'],
    fields: ['dt','channel','device','platform','uv','pv','bounce_rate','avg_duration','cvr'],
    metrics: ['uv','bounce_rate','uv_cvr'],
    partitions: ['dt(日期)'],
  },
  {
    name: 'dws_promo_effect_agg',
    display_name: '大促效果聚合宽表',
    layer: 'DWS',
    category: '营销域',
    description: '大促活动维度的聚合表，按活动 × 渠道 × 用户分群聚合活动 GMV、参与人数、拉新数量、优惠让利金额、ROI 等核心指标。',
    owner: '营销技术组',
    update_freq: '天',
    row_count: '100万',
    sensitivity: '内部',
    status: '生产',
    tags: ['大促', '营销', '活动', 'ROI', '拉新', '渠道'],
    fields: ['promo_id','channel','user_segment','gmv','user_cnt','new_user_cnt','discount_amount','roi','dt'],
    metrics: ['marketing_roi','coupon_redemption_rate','promo_new_user_rate'],
    partitions: ['dt(日期)'],
  },
  {
    name: 'dws_finance_daily',
    display_name: '财务每日汇总表',
    layer: 'DWS',
    category: '财务域',
    description: '财务口径的每日收入、成本、利润汇总，包含平台服务费、商品毛利、退款总额、净收入等，与财务系统口径对齐。',
    owner: '财务技术组',
    update_freq: '天',
    row_count: '1000',
    sensitivity: '机密',
    status: '生产',
    tags: ['财务', '收入', '利润', '毛利', '净收入'],
    fields: ['dt','gross_revenue','service_fee','refund_amount','net_revenue','cogs','gross_profit','net_profit'],
    metrics: ['net_revenue','gross_profit_margin','refund_rate'],
    partitions: ['dt(日期)'],
  },

  /* ─ ADS ─ */
  {
    name: 'ads_gmv_dashboard',
    display_name: 'GMV 大盘看板',
    layer: 'ADS',
    category: '订单域',
    description: '面向业务决策层的 GMV 大盘汇总表，包含日/周/月 GMV 趋势、同环比、分渠道/类目拆解，直接支撑管理驾驶舱展示。',
    owner: '数据产品组',
    update_freq: '天',
    row_count: '10万',
    sensitivity: '内部',
    status: '生产',
    tags: ['GMV', '大盘', '看板', '同比', '环比'],
    fields: ['dt','gmv_day','gmv_wow','gmv_yoy','gmv_by_channel','gmv_by_category'],
    metrics: ['gmv'],
    partitions: ['dt(日期)'],
  },
  {
    name: 'ads_user_rfm_segment',
    display_name: '用户 RFM 分层结果表',
    layer: 'ADS',
    category: '用户域',
    description: '基于 R（最近购买）、F（购买频次）、M（消费金额）三个维度对全量用户进行分层打标的结果表，直接供运营圈选人群使用。',
    owner: '用户运营组',
    update_freq: '周',
    row_count: '5000万',
    sensitivity: '机密',
    status: '生产',
    tags: ['用户', 'RFM', '分层', '人群', '运营', '高价值'],
    fields: ['user_id','r_score','f_score','m_score','rfm_label','user_segment','update_date'],
    metrics: ['high_value_user_rate','repurchase_rate_30d'],
    partitions: ['update_date(更新日期)'],
  },
  {
    name: 'ads_marketing_roi',
    display_name: '营销 ROI 分析表',
    layer: 'ADS',
    category: '营销域',
    description: '营销活动归因后的 ROI 分析结果，按渠道 × 活动维度汇总归因 GMV、营销投入、ROI、拉新数、CAC 等，供营销决策使用。',
    owner: '营销分析组',
    update_freq: '天',
    row_count: '50万',
    sensitivity: '内部',
    status: '生产',
    tags: ['营销', 'ROI', '渠道', '归因', 'CAC', '拉新'],
    fields: ['dt','channel','promo_id','attributed_gmv','marketing_cost','roi','new_user_cnt','cac'],
    metrics: ['marketing_roi','promo_new_user_rate','cac'],
    partitions: ['dt(日期)'],
  },
  {
    name: 'ads_funnel_analysis',
    display_name: '全域转化漏斗分析表',
    layer: 'ADS',
    category: '流量域',
    description: '从曝光到支付的全链路转化漏斗结果表，按渠道 × 类目 × 设备分组，展示各环节转化率，支持漏斗诊断和薄弱环节定位。',
    owner: '流量分析组',
    update_freq: '天',
    row_count: '200万',
    sensitivity: '内部',
    status: '生产',
    tags: ['漏斗', '转化率', 'UV', '加购', '支付', '跳出'],
    fields: ['dt','channel','category','device','uv','view_uv','cart_uv','pay_uv','uv_cvr','cart_rate'],
    metrics: ['uv','bounce_rate','cart_rate','product_page_cvr','uv_cvr'],
    partitions: ['dt(日期)'],
  },
  {
    name: 'ads_profit_analysis',
    display_name: '利润分析宽表',
    layer: 'ADS',
    category: '财务域',
    description: '商品 × 渠道维度的毛利分析宽表，包含收入、成本、毛利率、净利率等，帮助业务识别高利润商品和渠道。',
    owner: '财务技术组',
    update_freq: '天',
    row_count: '500万',
    sensitivity: '机密',
    status: '生产',
    tags: ['利润', '毛利', '财务', '成本', '净利率'],
    fields: ['dt','goods_id','channel','revenue','cogs','gross_profit','gross_margin','net_profit','net_margin'],
    metrics: ['gross_profit_margin','net_revenue'],
    partitions: ['dt(日期)'],
  },
  {
    name: 'ads_hot_product_rank',
    display_name: '热销商品排行榜',
    layer: 'ADS',
    category: '商品域',
    description: '按日/周/月统计维度输出各类目热销 TOP 商品排行，含销量、销售额、增速、库存预警等字段，供选品和运营使用。',
    owner: '商品增长组',
    update_freq: '天',
    row_count: '10万',
    sensitivity: '内部',
    status: '生产',
    tags: ['热销', '排行', '商品', '销量', '爆款', '选品'],
    fields: ['dt','category','rank','goods_id','goods_name','sales_qty','sales_amount','wow_growth','stock'],
    metrics: ['sales_volume'],
    partitions: ['dt(日期)'],
  },
  {
    name: 'ads_delivery_performance',
    display_name: '物流履约表现看板',
    layer: 'ADS',
    category: '物流域',
    description: '物流服务质量的综合评估看板，按承运商 × 城市维度汇总时效达成率、签收率、异常率、用户满意度等，支撑物流 SLA 考核。',
    owner: '物流技术组',
    update_freq: '天',
    row_count: '5万',
    sensitivity: '内部',
    status: '生产',
    tags: ['物流', '配送', '时效', '履约', '满意度', 'SLA'],
    fields: ['dt','carrier','city','on_time_rate','sign_rate','exception_rate','nps','avg_deliver_days'],
    metrics: ['delivery_timeliness','logistics_satisfaction'],
    partitions: ['dt(日期)'],
  },
];

/* ── 工具定义 ── */
const TOOLS = [
  {
    name: 'search_tables',
    description: '按关键词全文搜索数据表，支持按业务词、表名、中文名、业务域、标签检索，返回匹配的数据表列表和相关度得分。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词，如"订单"、"用户行为"、"营销ROI"' },
        layer: { type: 'string', enum: ['ODS','DWD','DWS','ADS','all'], description: '按数据层级过滤，默认 all' },
        limit: { type: 'number', description: '返回条数上限，默认 10' }
      },
      required: ['query']
    }
  },
  {
    name: 'get_table_detail',
    description: '获取指定数据表的完整元数据，包括字段列表、关联指标、分区信息、业务描述等。',
    inputSchema: {
      type: 'object',
      properties: {
        table_name: { type: 'string', description: '数据表英文名称，如 dwd_order_detail_di' }
      },
      required: ['table_name']
    }
  },
  {
    name: 'list_tables',
    description: '列出所有数据表，可按数据层级筛选（ODS/DWD/DWS/ADS）。',
    inputSchema: {
      type: 'object',
      properties: {
        layer: { type: 'string', enum: ['ODS','DWD','DWS','ADS','all'], description: '数据层级筛选' }
      }
    }
  },
  {
    name: 'list_layers',
    description: '统计各数据层级的表数量和业务域分布。',
    inputSchema: { type: 'object', properties: {} }
  }
];

/* ── 搜索评分 ── */
function scoreTable(t, kw) {
  const kwLower = kw.toLowerCase();
  let score = 0;
  if (t.name.toLowerCase().includes(kwLower))         score += 40;
  if (t.display_name.includes(kw))                    score += 35;
  if (t.category.includes(kw))                        score += 25;
  if (t.description.includes(kw))                     score += 20;
  if (t.tags.some(g => g.includes(kw)))               score += 20;
  if ((t.fields||[]).some(f => f.toLowerCase().includes(kwLower))) score += 10;
  if ((t.metrics||[]).some(m => m.toLowerCase().includes(kwLower))) score += 10;
  if (t.owner.includes(kw))                           score += 5;
  return score;
}

/* ── 工具处理 ── */
function searchTables(args) {
  const query = (args.query||'').trim();
  const layer = (args.layer||'all').toUpperCase();
  const limit = args.limit || 10;

  let pool = TABLES;
  if (layer !== 'ALL') pool = pool.filter(t => t.layer === layer);

  const keywords = query.split(/\s+/).filter(Boolean);
  let results = pool.map(t => {
    const raw = keywords.reduce((s, kw) => s + scoreTable(t, kw), 0);
    const score = Math.min(100, Math.round(raw * 100 / (keywords.length * 60)));
    return { ...t, score };
  }).filter(t => t.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    query,
    total: results.length,
    items: results.map(t => ({
      name:         t.name,
      display_name: t.display_name,
      score:        t.score,
      layer:        t.layer,
      category:     t.category,
      description:  t.description,
      tags:         t.tags,
      owner:        t.owner,
      update_freq:  t.update_freq,
      row_count:    t.row_count,
      sensitivity:  t.sensitivity,
      status:       t.status,
    }))
  };
}

function getTableDetail(args) {
  const t = TABLES.find(t => t.name === args.table_name);
  if (!t) return { error: `表 ${args.table_name} 不存在` };
  return { ...t };
}

function listTables(args) {
  const layer = ((args||{}).layer||'all').toUpperCase();
  const pool = layer === 'ALL' ? TABLES : TABLES.filter(t => t.layer === layer);
  return {
    total: pool.length,
    items: pool.map(t => ({
      name: t.name, display_name: t.display_name, layer: t.layer,
      category: t.category, update_freq: t.update_freq,
      row_count: t.row_count, status: t.status
    }))
  };
}

function listLayers() {
  const layers = ['ODS','DWD','DWS','ADS'];
  return {
    layers: layers.map(l => {
      const tables = TABLES.filter(t => t.layer === l);
      const cats = [...new Set(tables.map(t => t.category))];
      return { layer: l, count: tables.length, categories: cats };
    })
  };
}

/* ── JSON-RPC ── */
function handleRPC(rpc) {
  const { id, method, params } = rpc;
  try {
    if (method === 'initialize') {
      return { jsonrpc:'2.0', id, result:{
        protocolVersion:'2024-11-05',
        serverInfo:{ name:'mcp-data', version:'1.0.0' },
        capabilities:{ tools:{} }
      }};
    }
    if (method === 'tools/list') return { jsonrpc:'2.0', id, result:{ tools: TOOLS } };
    if (method === 'tools/call') {
      const { name, arguments: args } = params;
      let result;
      if      (name === 'search_tables')   result = searchTables(args||{});
      else if (name === 'get_table_detail') result = getTableDetail(args||{});
      else if (name === 'list_tables')     result = listTables(args||{});
      else if (name === 'list_layers')     result = listLayers();
      else return { jsonrpc:'2.0', id, error:{ code:-32601, message:`Unknown tool: ${name}` } };
      return { jsonrpc:'2.0', id, result:{ content:[{ type:'text', text: JSON.stringify(result,null,2) }] } };
    }
    return { jsonrpc:'2.0', id, error:{ code:-32601, message:`Unknown method: ${method}` } };
  } catch(e) {
    return { jsonrpc:'2.0', id, error:{ code:-32603, message: e.message } };
  }
}

/* ── HTTP Server ── */
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method !== 'POST')   { res.writeHead(405); res.end(); return; }

  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    try {
      const parsed = JSON.parse(body);
      const response = Array.isArray(parsed) ? parsed.map(handleRPC) : handleRPC(parsed);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
    } catch(e) {
      res.writeHead(400); res.end(JSON.stringify({ error:'Parse error' }));
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[mcp-data] listening on http://0.0.0.0:${PORT}`);
});
