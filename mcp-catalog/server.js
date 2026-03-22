'use strict';

/**
 * DataClaw 数据资产目录 MCP Server
 *
 * 模拟电商数据平台的元数据目录，收录 40 张数据表/数据集
 * 端口：3463
 *
 * 在 DataClaw 设置 > MCP 中添加：
 *   名称：数据资产目录
 *   URL ：http://localhost:3463
 */

const http = require('http');
const PORT = 3463;

/* ── 资产目录数据 ── */

const CATALOG = [
  /* ═══ 用户域 ═══ */
  {
    id: 'dim_user_info',
    name: 'dim_user_info',
    display_name: '用户基础信息维表',
    layer: 'DIM', category: '用户域',
    description: '全量用户注册信息，含用户ID、手机号、注册时间、性别、年龄段、城市等基础属性字段。',
    tags: ['用户', '基础信息', '注册', '维度表', '画像'],
    owner: '用户中台', update_freq: '天', row_count: '8000万', field_count: 24,
    sensitivity: '机密', status: '正常',
  },
  {
    id: 'dwd_user_action_log_di',
    name: 'dwd_user_action_log_di',
    display_name: '用户行为日志明细表',
    layer: 'DWD', category: '用户域',
    description: '记录用户在APP/Web端的所有行为事件，包含点击、浏览、收藏、加购、搜索等操作的完整日志。',
    tags: ['用户', '行为', '点击', '浏览', '事件', '日志', '埋点'],
    owner: '数据采集组', update_freq: '小时', row_count: '50亿/天', field_count: 31,
    sensitivity: '内部', status: '正常',
  },
  {
    id: 'dws_user_trade_30d_di',
    name: 'dws_user_trade_30d_di',
    display_name: '用户近30天交易汇总',
    layer: 'DWS', category: '用户域',
    description: '按用户粒度汇总近30天的交易行为，包含购买次数、GMV、客单价、品类偏好、复购率等指标。',
    tags: ['用户', '交易', '购买', '汇总', '近30天', 'GMV', '客单价', '复购'],
    owner: '用户中台', update_freq: '天', row_count: '5000万', field_count: 18,
    sensitivity: '内部', status: '正常',
  },
  {
    id: 'dws_user_active_stat_di',
    name: 'dws_user_active_stat_di',
    display_name: '用户活跃统计表',
    layer: 'DWS', category: '用户域',
    description: '统计各日期用户DAU、MAU、新增、流失、留存等活跃度指标，支持按渠道、城市、设备类型拆分。',
    tags: ['用户', 'DAU', 'MAU', '活跃', '留存', '新增', '流失', '渠道'],
    owner: '增长分析组', update_freq: '天', row_count: '1000万', field_count: 22,
    sensitivity: '内部', status: '正常',
  },
  {
    id: 'ads_user_rfm_segment',
    name: 'ads_user_rfm_segment',
    display_name: '用户RFM分群标签',
    layer: 'ADS', category: '用户域',
    description: '基于Recency/Frequency/Monetary模型对用户进行分层，输出高价值、潜力、流失风险等标签用于精准营销。',
    tags: ['用户', 'RFM', '分群', '标签', '高价值', '流失', '营销', '画像'],
    owner: '用户运营组', update_freq: '周', row_count: '6000万', field_count: 12,
    sensitivity: '内部', status: '正常',
  },
  {
    id: 'dwd_user_register_di',
    name: 'dwd_user_register_di',
    display_name: '用户注册明细表',
    layer: 'DWD', category: '用户域',
    description: '记录每次用户注册的完整信息，含注册渠道、设备类型、推荐码、IP地理位置等，用于新客分析。',
    tags: ['用户', '注册', '新客', '渠道', '设备', '推荐'],
    owner: '增长分析组', update_freq: '实时', row_count: '8000万', field_count: 19,
    sensitivity: '机密', status: '正常',
  },
  {
    id: 'dws_user_browse_behavior_di',
    name: 'dws_user_browse_behavior_di',
    display_name: '用户浏览行为汇总',
    layer: 'DWS', category: '用户域',
    description: '汇总用户每日的浏览行为，含浏览商品数、停留时长、品类偏好、搜索词频次等，服务推荐算法。',
    tags: ['用户', '浏览', '偏好', '推荐', '停留时长', '品类'],
    owner: '推荐算法组', update_freq: '天', row_count: '4000万', field_count: 16,
    sensitivity: '内部', status: '正常',
  },

  /* ═══ 订单域 ═══ */
  {
    id: 'ods_order_info',
    name: 'ods_order_info',
    display_name: '订单信息原始表',
    layer: 'ODS', category: '订单域',
    description: '业务数据库同步的原始订单表，包含订单全生命周期状态，是订单域所有下游表的数据源。',
    tags: ['订单', '原始', '同步', '状态', 'ODS', '数据源'],
    owner: '数据集成组', update_freq: '实时', row_count: '5亿', field_count: 45,
    sensitivity: '机密', status: '正常',
  },
  {
    id: 'dwd_order_detail_di',
    name: 'dwd_order_detail_di',
    display_name: '订单明细表',
    layer: 'DWD', category: '订单域',
    description: '经过清洗标准化的订单明细，含买家ID、商品列表、实付金额、支付方式、优惠券、收货地址、物流单号等完整字段。',
    tags: ['订单', '明细', '交易', '买家', '金额', '支付', 'GMV', '收货'],
    owner: '交易中台', update_freq: '实时', row_count: '5亿', field_count: 38,
    sensitivity: '机密', status: '正常',
  },
  {
    id: 'dwd_order_item_di',
    name: 'dwd_order_item_di',
    display_name: '订单商品行明细',
    layer: 'DWD', category: '订单域',
    description: '订单拆行明细，每行对应一个订单中的一个商品SKU，含数量、单价、折扣、实付、是否退款等字段。',
    tags: ['订单', '商品', 'SKU', '明细', '单价', '折扣', '退款'],
    owner: '交易中台', update_freq: '实时', row_count: '12亿', field_count: 22,
    sensitivity: '内部', status: '正常',
  },
  {
    id: 'dws_order_daily_stats',
    name: 'dws_order_daily_stats',
    display_name: '订单日统计汇总',
    layer: 'DWS', category: '订单域',
    description: '按天汇总全站订单量、GMV、客单价、退款率、取消率等核心交易指标，支持按类目、渠道、区域多维下钻。',
    tags: ['订单', 'GMV', '日统计', '客单价', '退款率', '汇总', '大盘'],
    owner: '交易分析组', update_freq: '天', row_count: '365', field_count: 28,
    sensitivity: '内部', status: '正常',
  },
  {
    id: 'ads_order_gmv_realtime',
    name: 'ads_order_gmv_realtime',
    display_name: 'GMV实时大盘',
    layer: 'ADS', category: '订单域',
    description: '实时更新的GMV看板数据，按分钟粒度汇总当日GMV、订单量、UV转化率等指标，支持实时监控和活动大屏。',
    tags: ['GMV', '实时', '大盘', '订单量', '转化率', '监控', '大屏'],
    owner: '实时计算组', update_freq: '实时', row_count: '1440/天', field_count: 15,
    sensitivity: '内部', status: '正常',
  },
  {
    id: 'dwd_order_refund_di',
    name: 'dwd_order_refund_di',
    display_name: '退款订单明细表',
    layer: 'DWD', category: '订单域',
    description: '记录所有退款申请的完整信息，含退款原因、退款金额、处理时长、责任方（买家/卖家/平台）等关键字段。',
    tags: ['退款', '订单', '售后', '纠纷', '退货', '退款原因'],
    owner: '售后中台', update_freq: '实时', row_count: '3000万', field_count: 26,
    sensitivity: '内部', status: '正常',
  },
  {
    id: 'dws_order_region_stats',
    name: 'dws_order_region_stats',
    display_name: '订单地域分布统计',
    layer: 'DWS', category: '订单域',
    description: '按省市维度汇总订单量、GMV、用户数等指标，含城市等级（一二三线）拆分，用于区域运营分析。',
    tags: ['订单', '地域', '省市', '区域', '城市', 'GMV', '分布'],
    owner: '区域运营组', update_freq: '天', row_count: '400', field_count: 14,
    sensitivity: '内部', status: '正常',
  },

  /* ═══ 商品域 ═══ */
  {
    id: 'dim_product_info',
    name: 'dim_product_info',
    display_name: '商品基础信息维表',
    layer: 'DIM', category: '商品域',
    description: '商品全量维度信息，含商品ID、名称、品牌、类目（三级）、标签价、上下架状态、发布时间等属性。',
    tags: ['商品', '维度', '品牌', '类目', '上架', '属性'],
    owner: '商品中台', update_freq: '实时', row_count: '1500万', field_count: 32,
    sensitivity: '内部', status: '正常',
  },
  {
    id: 'dim_sku_info',
    name: 'dim_sku_info',
    display_name: 'SKU详情维表',
    layer: 'DIM', category: '商品域',
    description: 'SKU粒度的商品详情，含规格参数（颜色/尺码/型号）、重量、体积、成本价、供应商等信息。',
    tags: ['SKU', '规格', '商品', '规格参数', '成本', '供应商'],
    owner: '商品中台', update_freq: '天', row_count: '5000万', field_count: 28,
    sensitivity: '机密', status: '正常',
  },
  {
    id: 'dwd_product_view_di',
    name: 'dwd_product_view_di',
    display_name: '商品浏览明细',
    layer: 'DWD', category: '商品域',
    description: '记录用户浏览商品详情页的每次行为，含停留时长、来源页面、是否加购、是否下单等后续行为字段。',
    tags: ['商品', '浏览', 'PV', '详情页', '加购', '转化'],
    owner: '数据采集组', update_freq: '小时', row_count: '80亿/天', field_count: 18,
    sensitivity: '内部', status: '正常',
  },
  {
    id: 'dws_product_sales_di',
    name: 'dws_product_sales_di',
    display_name: '商品销售汇总',
    layer: 'DWS', category: '商品域',
    description: '按商品/SKU维度汇总每日销量、销售额、加购率、转化率、退款率等销售指标，用于选品和运营优化。',
    tags: ['商品', '销售', '销量', '转化率', '加购', 'SKU', '选品'],
    owner: '商品分析组', update_freq: '天', row_count: '1500万', field_count: 20,
    sensitivity: '内部', status: '正常',
  },
  {
    id: 'ads_product_rank',
    name: 'ads_product_rank',
    display_name: '商品销量排行榜',
    layer: 'ADS', category: '商品域',
    description: '按天/周/月更新的热销商品榜单，支持全站、类目、品牌多个榜单维度，含销量、销售额双排名。',
    tags: ['商品', '排行榜', '热销', '销量', 'TOP', '榜单', '选品'],
    owner: '商品分析组', update_freq: '天', row_count: '10万', field_count: 11,
    sensitivity: '公开', status: '正常',
  },
  {
    id: 'dwd_product_review_di',
    name: 'dwd_product_review_di',
    display_name: '商品评价明细',
    layer: 'DWD', category: '商品域',
    description: '商品评价内容明细，含星级、评价文本、追评、图片数量、是否晒单、评价标签，支持NLP分析。',
    tags: ['评价', '评分', '商品', '星级', 'NLP', '用户反馈', '口碑'],
    owner: '内容组', update_freq: '实时', row_count: '4亿', field_count: 16,
    sensitivity: '公开', status: '正常',
  },
  {
    id: 'dws_product_inventory_di',
    name: 'dws_product_inventory_di',
    display_name: '商品库存汇总',
    layer: 'DWS', category: '商品域',
    description: '汇总每日各仓库SKU库存快照，含在库量、在途量、锁定量、预警阈值等，支持库存监控和补货建议。',
    tags: ['库存', '仓库', 'SKU', '补货', '在途', '监控'],
    owner: '供应链组', update_freq: '小时', row_count: '5000万', field_count: 17,
    sensitivity: '机密', status: '正常',
  },

  /* ═══ 营销域 ═══ */
  {
    id: 'dwd_coupon_use_di',
    name: 'dwd_coupon_use_di',
    display_name: '优惠券使用明细',
    layer: 'DWD', category: '营销域',
    description: '记录每张优惠券的发放和使用情况，含券类型、面额、门槛、使用订单、核销时间、是否过期等字段。',
    tags: ['优惠券', '促销', '折扣', '营销', '核销', '满减'],
    owner: '营销中台', update_freq: '实时', row_count: '20亿', field_count: 21,
    sensitivity: '内部', status: '正常',
  },
  {
    id: 'dws_campaign_effect_di',
    name: 'dws_campaign_effect_di',
    display_name: '活动效果汇总',
    layer: 'DWS', category: '营销域',
    description: '汇总各营销活动（双11/618/日常促销）的曝光、点击、转化、GMV贡献等效果指标，支持活动复盘。',
    tags: ['活动', '促销', '双11', '618', '转化', 'ROI', '复盘', '效果'],
    owner: '营销分析组', update_freq: '天', row_count: '5万', field_count: 25,
    sensitivity: '内部', status: '正常',
  },
  {
    id: 'ads_marketing_roi',
    name: 'ads_marketing_roi',
    display_name: '营销ROI分析',
    layer: 'ADS', category: '营销域',
    description: '综合评估各营销渠道和活动的投入产出比，含广告费用、优惠成本、带来GMV、新客数等ROI计算结果。',
    tags: ['ROI', '营销', '广告', '投产比', '渠道', '预算'],
    owner: '营销分析组', update_freq: '天', row_count: '1000', field_count: 18,
    sensitivity: '机密', status: '正常',
  },
  {
    id: 'dwd_push_click_di',
    name: 'dwd_push_click_di',
    display_name: 'Push消息点击明细',
    layer: 'DWD', category: '营销域',
    description: '记录每条Push消息的推送和点击情况，含消息类型、触达率、点击率、转化率、用户分群等字段。',
    tags: ['Push', '消息推送', '触达', '点击率', '通知', '营销'],
    owner: '消息中台', update_freq: '小时', row_count: '10亿/天', field_count: 17,
    sensitivity: '内部', status: '正常',
  },
  {
    id: 'dws_ads_performance_di',
    name: 'dws_ads_performance_di',
    display_name: '广告投放效果汇总',
    layer: 'DWS', category: '营销域',
    description: '汇总站内外广告投放的曝光量、点击量、花费、ROI等指标，按广告位、商品、时段多维拆分。',
    tags: ['广告', '投放', '曝光', 'CPC', 'ROI', 'CTR', '花费'],
    owner: '广告组', update_freq: '小时', row_count: '50万', field_count: 23,
    sensitivity: '机密', status: '正常',
  },

  /* ═══ 物流域 ═══ */
  {
    id: 'dwd_shipment_tracking_di',
    name: 'dwd_shipment_tracking_di',
    display_name: '物流轨迹明细',
    layer: 'DWD', category: '物流域',
    description: '快递物流全程轨迹事件，含揽件、转运、派件、签收、异常等每个节点的时间戳和操作网点信息。',
    tags: ['物流', '快递', '轨迹', '签收', '揽件', '派件', '异常'],
    owner: '物流中台', update_freq: '实时', row_count: '30亿', field_count: 19,
    sensitivity: '内部', status: '正常',
  },
  {
    id: 'dws_delivery_stat_di',
    name: 'dws_delivery_stat_di',
    display_name: '配送时效统计',
    layer: 'DWS', category: '物流域',
    description: '统计各快递公司、区域的配送时效（48h达成率、72h达成率），含准时率、超时率、投诉率等KPI指标。',
    tags: ['物流', '配送', '时效', '准时率', '快递公司', 'KPI', '履约'],
    owner: '物流分析组', update_freq: '天', row_count: '20万', field_count: 15,
    sensitivity: '内部', status: '正常',
  },
  {
    id: 'ads_logistics_exception',
    name: 'ads_logistics_exception',
    display_name: '物流异常预警',
    layer: 'ADS', category: '物流域',
    description: '实时监测超时未签收、物流轨迹停滞、投诉率异常等物流问题，自动触发客服工单和供应商预警。',
    tags: ['物流', '异常', '预警', '超时', '投诉', '监控', '告警'],
    owner: '物流运营组', update_freq: '小时', row_count: '10万', field_count: 12,
    sensitivity: '内部', status: '正常',
  },

  /* ═══ 财务域 ═══ */
  {
    id: 'dwd_payment_detail_di',
    name: 'dwd_payment_detail_di',
    display_name: '支付流水明细',
    layer: 'DWD', category: '财务域',
    description: '每笔交易的支付明细，含支付渠道（支付宝/微信/银行卡）、支付金额、手续费、到账时间、支付状态。',
    tags: ['支付', '流水', '支付宝', '微信支付', '手续费', '到账', '交易'],
    owner: '财务中台', update_freq: '实时', row_count: '5亿', field_count: 28,
    sensitivity: '机密', status: '正常',
  },
  {
    id: 'dws_revenue_daily_di',
    name: 'dws_revenue_daily_di',
    display_name: '日收入汇总',
    layer: 'DWS', category: '财务域',
    description: '汇总每日平台总收入、各类目收入、佣金收入、广告收入的口径数据，与财务系统对账使用。',
    tags: ['收入', '财务', '佣金', '日结', '对账', '营收', '收益'],
    owner: '财务中台', update_freq: '天', row_count: '365', field_count: 19,
    sensitivity: '机密', status: '正常',
  },
  {
    id: 'ads_finance_dashboard',
    name: 'ads_finance_dashboard',
    display_name: '财务看板汇总',
    layer: 'ADS', category: '财务域',
    description: '面向管理层的财务综合看板，汇总GMV、净收入、毛利率、退款额、坏账等关键财务指标的月度数据。',
    tags: ['财务', '看板', '毛利率', 'GMV', '净收入', '管理层', '月报'],
    owner: '财务分析组', update_freq: '天', row_count: '120', field_count: 22,
    sensitivity: '机密', status: '正常',
  },
  {
    id: 'dwd_refund_settle_di',
    name: 'dwd_refund_settle_di',
    display_name: '退款结算明细',
    layer: 'DWD', category: '财务域',
    description: '退款资金的完整流转记录，含退款金额、优惠还原、到账时间、结算渠道，对接财务系统的退款处理。',
    tags: ['退款', '结算', '资金', '财务', '到账', '优惠还原'],
    owner: '财务中台', update_freq: '实时', row_count: '3000万', field_count: 21,
    sensitivity: '机密', status: '正常',
  },

  /* ═══ 流量域 ═══ */
  {
    id: 'dwd_page_view_di',
    name: 'dwd_page_view_di',
    display_name: '页面PV/UV明细',
    layer: 'DWD', category: '流量域',
    description: '全站页面访问明细，含页面路径、来源渠道、访问时长、设备类型、地域，是流量分析的基础数据源。',
    tags: ['PV', 'UV', '流量', '页面', '访问', '渠道', '设备'],
    owner: '数据采集组', update_freq: '实时', row_count: '100亿/天', field_count: 22,
    sensitivity: '内部', status: '正常',
  },
  {
    id: 'dws_traffic_funnel_di',
    name: 'dws_traffic_funnel_di',
    display_name: '流量转化漏斗汇总',
    layer: 'DWS', category: '流量域',
    description: '汇总展示→点击→加购→下单→支付各环节转化率，支持按渠道、品类、活动多维拆分分析流量质量。',
    tags: ['漏斗', '转化率', '流量', '加购', '下单', '渠道质量'],
    owner: '流量分析组', update_freq: '天', row_count: '10万', field_count: 18,
    sensitivity: '内部', status: '正常',
  },
  {
    id: 'dwd_search_keyword_di',
    name: 'dwd_search_keyword_di',
    display_name: '搜索词明细',
    layer: 'DWD', category: '流量域',
    description: '用户在站内搜索的完整记录，含搜索词、搜索时间、是否有结果、点击位置、后续转化，用于搜索优化。',
    tags: ['搜索', '关键词', '用户意图', 'NLP', '转化', 'SEO', '零结果'],
    owner: '搜索组', update_freq: '小时', row_count: '20亿/天', field_count: 15,
    sensitivity: '内部', status: '正常',
  },
  {
    id: 'dws_channel_traffic_di',
    name: 'dws_channel_traffic_di',
    display_name: '渠道流量汇总',
    layer: 'DWS', category: '流量域',
    description: '按天汇总各推广渠道（SEO/SEM/社交/直播/短视频）带来的UV、GMV、ROI，用于渠道预算分配决策。',
    tags: ['渠道', 'SEO', 'SEM', '直播', '短视频', '流量', 'ROI', '预算'],
    owner: '渠道运营组', update_freq: '天', row_count: '200', field_count: 20,
    sensitivity: '内部', status: '正常',
  },

  /* ═══ 供应链域 ═══ */
  {
    id: 'dim_supplier_info',
    name: 'dim_supplier_info',
    display_name: '供应商信息维表',
    layer: 'DIM', category: '供应链域',
    description: '供应商基础信息，含供应商ID、名称、类型（品牌商/经销商/工厂）、信用评级、主营类目、合作状态。',
    tags: ['供应商', '品牌', '采购', '供应链', '资质', '评级'],
    owner: '采购中台', update_freq: '天', row_count: '5万', field_count: 25,
    sensitivity: '机密', status: '正常',
  },
  {
    id: 'dwd_purchase_order_di',
    name: 'dwd_purchase_order_di',
    display_name: '采购订单明细',
    layer: 'DWD', category: '供应链域',
    description: '平台向供应商采购商品的订单明细，含采购价、数量、交货期、入库情况、质检结果等供应链核心数据。',
    tags: ['采购', '供应链', '入库', '质检', '采购价', '交货期'],
    owner: '采购中台', update_freq: '天', row_count: '1亿', field_count: 29,
    sensitivity: '机密', status: '正常',
  },
  {
    id: 'dws_supply_chain_stat',
    name: 'dws_supply_chain_stat',
    display_name: '供应链效率统计',
    layer: 'DWS', category: '供应链域',
    description: '汇总采购周期、库存周转率、供应商准时交货率、缺货率等供应链效率指标，用于供应链优化分析。',
    tags: ['供应链', '库存周转', '缺货', '交货率', '效率', '采购周期'],
    owner: '供应链分析组', update_freq: '周', row_count: '5万', field_count: 16,
    sensitivity: '内部', status: '正常',
  },
];

/* ── 搜索算法 ── */
const FIELD_WEIGHTS = [
  { key: 'display_name', w: 12 },
  { key: 'tags',         w: 10 },  // tags 是数组
  { key: 'description',  w:  6 },
  { key: 'category',     w:  8 },
  { key: 'name',         w:  5 },
  { key: 'owner',        w:  3 },
  { key: 'layer',        w:  4 },
];

function searchAssets(query, limit = 10) {
  const words = query.toLowerCase().split(/[\s,，。！？、]+/).filter(w => w.length > 0);
  const scored = CATALOG.map(asset => {
    let score = 0;
    for (const word of words) {
      for (const { key, w } of FIELD_WEIGHTS) {
        const val = Array.isArray(asset[key]) ? asset[key].join(' ') : (asset[key] || '');
        if (val.toLowerCase().includes(word)) score += w;
      }
    }
    return score > 0 ? { ...asset, score } : null;
  }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, limit);

  if (!scored.length) return scored;
  const maxScore = scored[0].score;
  return scored.map(a => ({ ...a, score: Math.round(a.score / maxScore * 100) }));
}

/* ── 工具实现 ── */
function toolSearchAssets(args) {
  const { query, limit = 10 } = args;
  if (!query) return '缺少 query 参数';
  const results = searchAssets(query, limit);
  if (!results.length) return `未找到与"${query}"相关的数据资产。`;

  const lines = [`找数结果：查询"${query}"，共找到 ${results.length} 条相关数据资产\n`];
  results.forEach((a, i) => {
    lines.push(`#${i + 1} [score:${a.score}] ${a.display_name} | ${a.name} | ${a.category} | ${a.layer} | ${a.owner} | 更新:${a.update_freq} | 规模:${a.row_count} | 敏感级:${a.sensitivity} | 状态:${a.status}`);
    lines.push(`    描述：${a.description}`);
    lines.push(`    标签：${a.tags.join(', ')}\n`);
  });
  return lines.join('\n');
}

function toolGetAssetDetail(args) {
  const asset = CATALOG.find(a => a.id === args.asset_id || a.name === args.asset_id);
  if (!asset) return `未找到资产：${args.asset_id}`;
  const lines = [
    `📋 ${asset.display_name} (${asset.name})`,
    ``,
    `层级：${asset.layer}  ·  类目：${asset.category}  ·  负责团队：${asset.owner}`,
    `更新频率：${asset.update_freq}  ·  估计行数：${asset.row_count}  ·  字段数：${asset.field_count}`,
    `数据敏感级：${asset.sensitivity}  ·  状态：${asset.status}`,
    ``,
    `描述：${asset.description}`,
    ``,
    `标签：${asset.tags.join(' · ')}`,
  ];
  return lines.join('\n');
}

function toolListCategories() {
  const cats = {};
  CATALOG.forEach(a => { cats[a.category] = (cats[a.category] || 0) + 1; });
  const layers = {};
  CATALOG.forEach(a => { layers[a.layer] = (layers[a.layer] || 0) + 1; });
  const lines = [
    `数据资产目录概览：共 ${CATALOG.length} 个数据资产\n`,
    `按类目：`,
    ...Object.entries(cats).map(([k, v]) => `  ${k}：${v} 个`),
    `\n按数据层：`,
    ...Object.entries(layers).map(([k, v]) => `  ${k}：${v} 个`),
  ];
  return lines.join('\n');
}

/* ── 工具定义 ── */
const TOOLS = [
  {
    name: 'search_assets',
    description: '根据关键词搜索数据资产目录，返回最匹配的数据表/数据集列表及其元数据',
    inputSchema: {
      type: 'object', required: ['query'],
      properties: {
        query: { type: 'string', description: '搜索关键词，如"用户购买行为"、"GMV数据"、"退款明细"' },
        limit: { type: 'number', description: '返回条数，默认 10，最多 20' },
      },
    },
  },
  {
    name: 'get_asset_detail',
    description: '获取指定数据资产的完整详情，包括字段说明、更新策略、敏感级别等',
    inputSchema: {
      type: 'object', required: ['asset_id'],
      properties: {
        asset_id: { type: 'string', description: '资产ID或技术名称（如 dwd_order_detail_di）' },
      },
    },
  },
  {
    name: 'list_categories',
    description: '列出数据资产目录的类目统计和概览信息',
    inputSchema: { type: 'object', properties: {} },
  },
];

/* ── JSON-RPC ── */
async function handleRPC(rpc) {
  switch (rpc.method) {
    case 'initialize':
      return { protocolVersion: '2024-11-05', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'catalog-mcp', version: '1.0.0' } };
    case 'initialized': return {};
    case 'tools/list':  return { tools: TOOLS };
    case 'tools/call': {
      const { name, arguments: args = {} } = rpc.params;
      let text;
      if      (name === 'search_assets')   text = toolSearchAssets(args);
      else if (name === 'get_asset_detail') text = toolGetAssetDetail(args);
      else if (name === 'list_categories')  text = toolListCategories();
      else throw { code: -32601, message: `未知工具: ${name}` };
      return { content: [{ type: 'text', text }] };
    }
    default: throw { code: -32601, message: `Method not found: ${rpc.method}` };
  }
}

/* ── HTTP Server ── */
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method !== 'POST') { res.writeHead(405); res.end('Method Not Allowed'); return; }

  let body = '';
  req.on('data', c => body += c);
  req.on('end', async () => {
    let rpc;
    try { rpc = JSON.parse(body); } catch (_) {
      res.writeHead(400); res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null })); return;
    }
    const isBatch = Array.isArray(rpc);
    const responses = [];
    for (const item of (isBatch ? rpc : [rpc])) {
      try {
        const result = await handleRPC(item);
        if (item.id != null) responses.push({ jsonrpc: '2.0', result, id: item.id });
      } catch (e) {
        const err = e.code ? e : { code: -32603, message: String(e?.message ?? e) };
        if (item.id != null) responses.push({ jsonrpc: '2.0', error: err, id: item.id });
      }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(isBatch ? JSON.stringify(responses) : JSON.stringify(responses[0] ?? {}));
    console.log(`[${new Date().toLocaleTimeString()}] ${isBatch ? '[batch]' : rpc.method}`);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  📚  数据资产目录 MCP Server 已启动');
  console.log('');
  console.log(`  端点：http://localhost:${PORT}`);
  console.log(`  资产：${CATALOG.length} 个（${[...new Set(CATALOG.map(a => a.category))].join(' / ')}）`);
  console.log('');
  console.log('  在 DataClaw 设置 > MCP 添加：');
  console.log('    名称：数据资产目录');
  console.log(`    URL ：http://localhost:${PORT}`);
  console.log('');
});

server.on('error', err => {
  console.error(err.code === 'EADDRINUSE' ? `❌ 端口 ${PORT} 已被占用` : `❌ ${err.message}`);
  process.exit(1);
});
