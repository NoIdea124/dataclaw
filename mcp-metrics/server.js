'use strict';
/**
 * DataClaw 指标字典 MCP Server  —  端口 3464
 *
 * 工具:
 *   search_metrics(query, limit)                — 找指标
 *   get_metric_detail(metric_id)                — 查指标元数据
 *   get_metric_data(metric_id, date_from, date_to, group_by) — 查指标数据
 *   list_dimensions(metric_id)                  — 指标可用维度
 *   list_categories()                           — 指标分类统计
 */

const http = require('http');
const PORT = 3464;

/* ── 维度定义 ── */
const DIMENSIONS = [
  { id: 'date', name: '日期', display_name: '统计日期', type: 'time',
    description: '指标统计的自然日，格式 YYYY-MM-DD，支持按天/周/月聚合。',
    values_example: ['2024-12-01', '2024-12-15', '2024-12-30'], cardinality: '365+' },
  { id: 'channel', name: '渠道', display_name: '流量/推广渠道', type: 'categorical',
    description: '用户来源渠道，含自然流量、SEO、SEM付费、社交媒体、直播、短视频、联盟推广等。',
    values_example: ['organic', 'sem', 'social', 'live', 'short_video', 'affiliate'], cardinality: '20~50' },
  { id: 'category', name: '商品类目', display_name: '商品一级类目', type: 'categorical',
    description: '商品标准三级类目中的一级类目，如服装、电子、食品、美妆、家居等。',
    values_example: ['服装', '电子', '食品', '美妆', '家居', '运动', '母婴'], cardinality: '20~30' },
  { id: 'region', name: '地域', display_name: '收货省份/地区', type: 'categorical',
    description: '买家收货地址所在省份，可进一步聚合为城市等级（一线/新一线/二线/三线以下）。',
    values_example: ['北京', '上海', '广东', '浙江', '四川', '湖北', '江苏'], cardinality: '34' },
  { id: 'user_segment', name: '用户分群', display_name: 'RFM用户分群', type: 'categorical',
    description: '基于RFM模型的用户价值分层，含高价值、成长型、潜力、睡眠、流失风险等标签。',
    values_example: ['高价值', '成长型', '潜力用户', '睡眠用户', '流失风险'], cardinality: '5~8' },
  { id: 'device', name: '设备类型', display_name: '终端设备类型', type: 'categorical',
    description: '用户访问或下单使用的终端类型，区分 iOS、Android、PC Web、小程序等。',
    values_example: ['ios', 'android', 'pc_web', 'miniapp', 'pad'], cardinality: '5' },
  { id: 'platform', name: '平台', display_name: '站点/平台', type: 'categorical',
    description: '多平台运营场景下的平台标识，如主站、海外站、B2B平台、直播间等。',
    values_example: ['主站', '海外站', 'B2B', '直播间', '小程序商城'], cardinality: '5~10' },
  { id: 'payment_method', name: '支付方式', display_name: '支付渠道', type: 'categorical',
    description: '买家完成支付所使用的支付方式，含支付宝、微信支付、银行卡、货到付款等。',
    values_example: ['alipay', 'wechat_pay', 'bank_card', 'cod', 'huabei'], cardinality: '8~12' },
];

/* ── 指标定义 ── */
const METRICS = [
  /* 用户域 */
  { id:'dau', name:'dau', display_name:'日活跃用户数 (DAU)', category:'用户域', unit:'万人',
    formula:'COUNT(DISTINCT user_id) WHERE last_active_date = 统计日期',
    description:'统计日内在APP/Web端产生任意有效行为的去重用户数，是衡量平台日常活跃度的核心指标。',
    source_table:'dwd_user_action_log_di', direction:'up', update_freq:'天', owner:'增长分析组',
    tags:['用户','活跃','DAU','日活','大盘'],
    available_dimensions:['date','channel','device','platform','region'],
    sim:{base:320,variance:0.12,trend:0.08} },
  { id:'mau', name:'mau', display_name:'月活跃用户数 (MAU)', category:'用户域', unit:'万人',
    formula:'COUNT(DISTINCT user_id) WHERE last_active_month = 统计月份',
    description:'统计自然月内产生任意有效行为的去重用户数，用于衡量平台月度用户规模和长期增长趋势。',
    source_table:'dwd_user_action_log_di', direction:'up', update_freq:'天', owner:'增长分析组',
    tags:['用户','活跃','MAU','月活','增长'],
    available_dimensions:['date','channel','device','platform','region'],
    sim:{base:2800,variance:0.06,trend:0.10} },
  { id:'new_user_cnt', name:'new_user_cnt', display_name:'新增用户数', category:'用户域', unit:'人',
    formula:'COUNT(user_id) WHERE register_date = 统计日期',
    description:'当日完成注册的新用户总数，是衡量拉新效果和增长健康度的基础指标，需结合渠道拆分分析获客质量。',
    source_table:'dwd_user_action_log_di', direction:'up', update_freq:'天', owner:'增长分析组',
    tags:['用户','新增','注册','拉新','增长'],
    available_dimensions:['date','channel','device','platform','region'],
    sim:{base:45000,variance:0.20,trend:0.05} },
  { id:'user_retention_d7', name:'user_retention_d7', display_name:'7日用户留存率', category:'用户域', unit:'%',
    formula:'COUNT(DISTINCT user_id WHERE active_on_d7) / COUNT(DISTINCT user_id WHERE register_on_d0) * 100',
    description:'注册后第7天仍有活跃行为的用户占该批新注册用户的比例，反映产品粘性和新用户体验质量，目标值 ≥ 30%。',
    source_table:'dws_user_trade_30d_di', direction:'up', update_freq:'天', owner:'用户运营组',
    tags:['用户','留存率','7日留存','粘性','新用户'],
    available_dimensions:['date','channel','device','user_segment'],
    sim:{base:32,variance:0.08,trend:0.02} },
  { id:'repurchase_rate_30d', name:'repurchase_rate_30d', display_name:'30日复购率', category:'用户域', unit:'%',
    formula:'COUNT(DISTINCT user_id WHERE order_cnt_30d >= 2) / COUNT(DISTINCT user_id WHERE order_cnt_30d >= 1) * 100',
    description:'近30天内产生2次及以上购买行为的用户占全部购买用户的比例，反映用户忠诚度和平台品类丰富度。',
    source_table:'dws_user_trade_30d_di', direction:'up', update_freq:'天', owner:'用户运营组',
    tags:['用户','复购率','忠诚度','留存','购买'],
    available_dimensions:['date','category','user_segment','region'],
    sim:{base:38,variance:0.07,trend:0.03} },
  { id:'rfm_high_value_ratio', name:'rfm_high_value_ratio', display_name:'高价值用户占比', category:'用户域', unit:'%',
    formula:'COUNT(user_id WHERE rfm_segment = "高价值") / COUNT(user_id) * 100',
    description:'RFM模型识别的高价值用户占全量活跃用户的比例，反映用户资产质量。',
    source_table:'ads_user_rfm_segment', direction:'up', update_freq:'周', owner:'用户运营组',
    tags:['用户','RFM','高价值','分群','用户质量'],
    available_dimensions:['date','channel','region','category'],
    sim:{base:12,variance:0.10,trend:0.01} },
  /* 订单域 */
  { id:'gmv', name:'gmv', display_name:'GMV（商品交易总额）', category:'订单域', unit:'万元',
    formula:'SUM(order_amount) WHERE order_status NOT IN ("已取消","无效")',
    description:'统计周期内所有有效订单的支付金额总和（含优惠后实付，不扣退款），是电商平台最核心的规模指标。',
    source_table:'ads_gmv_dashboard', direction:'up', update_freq:'天', owner:'交易分析组',
    tags:['GMV','订单','交易额','核心指标','大盘'],
    available_dimensions:['date','channel','category','region','platform','payment_method'],
    sim:{base:8500,variance:0.15,trend:0.12} },
  { id:'order_cnt', name:'order_cnt', display_name:'有效订单量', category:'订单域', unit:'单',
    formula:'COUNT(order_id) WHERE order_status NOT IN ("已取消","无效")',
    description:'统计周期内产生的有效订单总数，反映平台交易活跃度和用户购买频次。',
    source_table:'dws_order_daily_agg', direction:'up', update_freq:'天', owner:'交易分析组',
    tags:['订单','订单量','交易','购买','大盘'],
    available_dimensions:['date','channel','category','region','platform','payment_method','device'],
    sim:{base:125000,variance:0.14,trend:0.10} },
  { id:'avg_order_value', name:'avg_order_value', display_name:'客单价', category:'订单域', unit:'元',
    formula:'SUM(order_amount) / COUNT(DISTINCT order_id) WHERE order_status = "已完成"',
    description:'每笔有效订单的平均支付金额，是GMV分解（订单量 × 客单价）的核心因子。',
    source_table:'dws_order_daily_agg', direction:'up', update_freq:'天', owner:'交易分析组',
    tags:['客单价','订单','消费','GMV拆解','用户价值'],
    available_dimensions:['date','channel','category','region','user_segment','payment_method'],
    sim:{base:168,variance:0.09,trend:0.04} },
  { id:'refund_rate', name:'refund_rate', display_name:'退款率', category:'订单域', unit:'%',
    formula:'COUNT(order_id WHERE refund_status = "已退款") / COUNT(order_id WHERE order_status = "已完成") * 100',
    description:'已完成订单中发生退款的比例，高退款率是用户体验的重要预警信号。',
    source_table:'dwd_order_detail_di', direction:'down', update_freq:'天', owner:'交易分析组',
    tags:['退款率','订单','售后','质量','体验'],
    available_dimensions:['date','category','region','channel','payment_method'],
    sim:{base:4.2,variance:0.15,trend:-0.02} },
  { id:'cancel_rate', name:'cancel_rate', display_name:'订单取消率', category:'订单域', unit:'%',
    formula:'COUNT(order_id WHERE order_status = "已取消") / COUNT(order_id) * 100',
    description:'所有订单中被取消的比例，高取消率可能指向支付流程障碍或商品信息误导。',
    source_table:'ods_order_info', direction:'down', update_freq:'天', owner:'交易分析组',
    tags:['取消率','订单','支付','流失','体验'],
    available_dimensions:['date','category','region','channel','device'],
    sim:{base:8.5,variance:0.12,trend:-0.01} },
  { id:'items_per_order', name:'items_per_order', display_name:'笔单件数', category:'订单域', unit:'件/单',
    formula:'SUM(item_quantity) / COUNT(DISTINCT order_id)',
    description:'每笔有效订单平均包含的商品件数，反映用户的连带购买能力。',
    source_table:'dwd_order_item_di', direction:'up', update_freq:'天', owner:'商品分析组',
    tags:['连带率','订单','商品','客单价','购物车'],
    available_dimensions:['date','category','channel','user_segment'],
    sim:{base:2.3,variance:0.08,trend:0.02} },
  /* 商品域 */
  { id:'product_conversion_rate', name:'product_conversion_rate', display_name:'商品详情页转化率', category:'商品域', unit:'%',
    formula:'COUNT(DISTINCT user_id WHERE action="下单") / COUNT(DISTINCT user_id WHERE action="浏览详情页") * 100',
    description:'浏览商品详情页后产生下单行为的用户比例，反映商品内容质量、价格竞争力和页面体验。',
    source_table:'dwd_product_behavior_di', direction:'up', update_freq:'天', owner:'商品分析组',
    tags:['商品','转化率','详情页','选品','运营'],
    available_dimensions:['date','category','channel','device','platform'],
    sim:{base:3.8,variance:0.18,trend:0.03} },
  { id:'add_to_cart_rate', name:'add_to_cart_rate', display_name:'加购率', category:'商品域', unit:'%',
    formula:'COUNT(DISTINCT user_id WHERE action="加购") / COUNT(DISTINCT user_id WHERE action="浏览详情页") * 100',
    description:'浏览商品后将其加入购物车的用户比例，是购买意向的中间信号。',
    source_table:'dwd_product_behavior_di', direction:'up', update_freq:'天', owner:'商品分析组',
    tags:['加购率','商品','购物车','购买意向','转化'],
    available_dimensions:['date','category','channel','device','user_segment'],
    sim:{base:12.5,variance:0.14,trend:0.02} },
  { id:'product_sales_volume', name:'product_sales_volume', display_name:'商品销售量', category:'商品域', unit:'件',
    formula:'SUM(item_quantity) WHERE order_status NOT IN ("已取消","已退款")',
    description:'统计周期内各商品/SKU的实际售出件数，用于选品分析、库存补货决策和热销榜单生成。',
    source_table:'dws_product_sales_agg', direction:'up', update_freq:'天', owner:'商品分析组',
    tags:['商品','销量','SKU','选品','热销'],
    available_dimensions:['date','category','channel','region','platform'],
    sim:{base:380000,variance:0.16,trend:0.09} },
  { id:'product_gmv_contribution', name:'product_gmv_contribution', display_name:'商品GMV贡献', category:'商品域', unit:'万元',
    formula:'SUM(item_amount) WHERE order_status NOT IN ("已取消","无效")',
    description:'各类目/品牌贡献的GMV金额，用于识别GMV结构分布，支持资源向高贡献品类倾斜的运营决策。',
    source_table:'ads_hot_product_rank', direction:'up', update_freq:'天', owner:'商品分析组',
    tags:['商品','GMV','类目','品牌','贡献度'],
    available_dimensions:['date','category','channel','region'],
    sim:{base:1200,variance:0.17,trend:0.11} },
  { id:'product_avg_rating', name:'product_avg_rating', display_name:'商品平均评分', category:'商品域', unit:'分',
    formula:'AVG(review_score) WHERE review_status = "已审核"',
    description:'已审核评价的商品平均星级（1-5分），影响搜索排名和推荐权重。',
    source_table:'ods_product_info', direction:'up', update_freq:'天', owner:'内容组',
    tags:['评分','商品','评价','满意度','口碑','质量'],
    available_dimensions:['date','category','channel','user_segment'],
    sim:{base:4.3,variance:0.03,trend:0.005} },
  /* 营销域 */
  { id:'marketing_roi', name:'marketing_roi', display_name:'营销ROI', category:'营销域', unit:'倍',
    formula:'SUM(gmv_attributed) / SUM(marketing_cost)',
    description:'营销投入带来的GMV与营销总费用的比值。ROI > 3 通常视为健康水位，大促期间可放宽至 2。',
    source_table:'ads_marketing_roi', direction:'up', update_freq:'天', owner:'营销分析组',
    tags:['ROI','营销','投产比','效率','广告','渠道'],
    available_dimensions:['date','channel','category','platform','user_segment'],
    sim:{base:3.8,variance:0.20,trend:0.04} },
  { id:'coupon_usage_rate', name:'coupon_usage_rate', display_name:'优惠券核销率', category:'营销域', unit:'%',
    formula:'COUNT(coupon_id WHERE usage_status="已使用") / COUNT(coupon_id WHERE issue_status="已发放") * 100',
    description:'已发放优惠券中实际被使用的比例，反映券的吸引力和触达效率。',
    source_table:'dwd_coupon_usage_di', direction:'up', update_freq:'天', owner:'营销分析组',
    tags:['优惠券','核销率','促销','营销','折扣'],
    available_dimensions:['date','channel','category','user_segment'],
    sim:{base:42,variance:0.15,trend:0.01} },
  { id:'promo_gmv_ratio', name:'promo_gmv_ratio', display_name:'促销GMV占比', category:'营销域', unit:'%',
    formula:'SUM(gmv WHERE has_promo=true) / SUM(gmv) * 100',
    description:'通过促销活动产生的GMV占全部GMV的比例，过高时需警惕用户对折扣的依赖性。',
    source_table:'dws_promo_effect_agg', direction:'up', update_freq:'天', owner:'营销分析组',
    tags:['促销','GMV','活动','折扣','占比'],
    available_dimensions:['date','channel','category','platform'],
    sim:{base:55,variance:0.12,trend:0.02} },
  { id:'coupon_discount_amount', name:'coupon_discount_amount', display_name:'优惠券让利金额', category:'营销域', unit:'万元',
    formula:'SUM(discount_amount) WHERE coupon_usage_status = "已使用"',
    description:'统计周期内因优惠券核销导致的GMV减少金额总量，是营销预算消耗的直接体现。',
    source_table:'dwd_coupon_usage_di', direction:'down', update_freq:'天', owner:'营销分析组',
    tags:['优惠券','让利','成本','营销','折扣'],
    available_dimensions:['date','channel','category','user_segment'],
    sim:{base:380,variance:0.18,trend:0.05} },
  { id:'customer_acquisition_cost', name:'customer_acquisition_cost', display_name:'获客成本 (CAC)', category:'营销域', unit:'元/人',
    formula:'SUM(marketing_cost) / COUNT(DISTINCT new_user_id WHERE source=营销渠道)',
    description:'通过付费营销渠道获取每位新用户的平均成本，目标与LTV比例 ≥ 1:3。',
    source_table:'ads_marketing_roi', direction:'down', update_freq:'天', owner:'增长分析组',
    tags:['获客成本','CAC','新用户','营销','渠道效率'],
    available_dimensions:['date','channel','platform','device'],
    sim:{base:28,variance:0.22,trend:0.03} },
  { id:'promo_new_buyer_ratio', name:'promo_new_buyer_ratio', display_name:'活动拉新率', category:'营销域', unit:'%',
    formula:'COUNT(DISTINCT user_id WHERE is_new=true AND participated_promo=true) / COUNT(DISTINCT user_id WHERE participated_promo=true) * 100',
    description:'参与营销活动的用户中，首次购买新用户占比，衡量活动在拉新方面的效果。',
    source_table:'dws_promo_effect_agg', direction:'up', update_freq:'天', owner:'营销分析组',
    tags:['活动','拉新','新用户','促销','增长'],
    available_dimensions:['date','channel','category','platform'],
    sim:{base:18,variance:0.20,trend:0.02} },
  /* 物流域 */
  { id:'delivery_on_time_rate', name:'delivery_on_time_rate', display_name:'48小时时效达成率', category:'物流域', unit:'%',
    formula:'COUNT(order_id WHERE delivery_hours<=48) / COUNT(order_id WHERE delivery_completed=true) * 100',
    description:'订单从付款成功到签收完成在48小时内的比例，直接影响用户满意度和好评率。',
    source_table:'ads_delivery_performance', direction:'up', update_freq:'天', owner:'物流分析组',
    tags:['物流','时效','48小时','准时率','KPI','履约'],
    available_dimensions:['date','region','channel','category'],
    sim:{base:87,variance:0.05,trend:0.01} },
  { id:'logistics_complaint_rate', name:'logistics_complaint_rate', display_name:'物流投诉率', category:'物流域', unit:'%',
    formula:'COUNT(complaint_id WHERE type="物流") / COUNT(order_id WHERE delivery_completed=true) * 100',
    description:'完成配送的订单中产生物流相关投诉的比例，含超时、破损、丢失等。',
    source_table:'dwd_logistics_info', direction:'down', update_freq:'天', owner:'物流运营组',
    tags:['物流','投诉率','满意度','超时','破损','售后'],
    available_dimensions:['date','region','category'],
    sim:{base:1.2,variance:0.20,trend:-0.02} },
  { id:'avg_delivery_days', name:'avg_delivery_days', display_name:'平均配送天数', category:'物流域', unit:'天',
    formula:'AVG(DATEDIFF(sign_date, pay_date)) WHERE delivery_status = "已签收"',
    description:'从用户付款到签收的平均天数，需按区域（跨省/省内/同城）分层分析。',
    source_table:'dwd_logistics_info', direction:'down', update_freq:'天', owner:'物流分析组',
    tags:['物流','配送','时效','天数','履约'],
    available_dimensions:['date','region','category','channel'],
    sim:{base:2.8,variance:0.10,trend:-0.03} },
  { id:'sign_rate', name:'sign_rate', display_name:'快递签收率', category:'物流域', unit:'%',
    formula:'COUNT(order_id WHERE delivery_status="已签收") / COUNT(order_id WHERE delivery_status IN ("已签收","拒签","丢失")) * 100',
    description:'发出包裹中成功签收的比例，低签收率可能源于地址问题、用户拒签或物流丢失。',
    source_table:'ads_delivery_performance', direction:'up', update_freq:'天', owner:'物流运营组',
    tags:['物流','签收率','履约','包裹','快递'],
    available_dimensions:['date','region','category'],
    sim:{base:97.5,variance:0.02,trend:0.001} },
  /* 财务域 */
  { id:'net_revenue', name:'net_revenue', display_name:'平台净收入', category:'财务域', unit:'万元',
    formula:'SUM(commission_income + ad_income + service_fee) - SUM(refund_cost + coupon_cost)',
    description:'平台实际确认收入，含佣金收入和广告收入，扣除退款成本和优惠让利后的净额。',
    source_table:'ads_profit_analysis', direction:'up', update_freq:'天', owner:'财务分析组',
    tags:['收入','净收入','财务','佣金','广告','营收'],
    available_dimensions:['date','category','platform','channel'],
    sim:{base:420,variance:0.12,trend:0.10} },
  { id:'gross_margin_rate', name:'gross_margin_rate', display_name:'毛利率', category:'财务域', unit:'%',
    formula:'(SUM(revenue) - SUM(cost_of_goods)) / SUM(revenue) * 100',
    description:'营收减去商品成本后占营收的比例，反映平台商业模式的盈利能力。',
    source_table:'ads_profit_analysis', direction:'up', update_freq:'天', owner:'财务分析组',
    tags:['毛利率','财务','盈利','成本','品类'],
    available_dimensions:['date','category','platform','channel'],
    sim:{base:22,variance:0.08,trend:0.02} },
  { id:'payment_success_rate', name:'payment_success_rate', display_name:'支付成功率', category:'财务域', unit:'%',
    formula:'COUNT(pay_id WHERE pay_status="成功") / COUNT(pay_id WHERE pay_status IN ("成功","失败","超时")) * 100',
    description:'发起支付后最终成功的比例，低于98%时需联合支付渠道方排查技术问题。',
    source_table:'dwd_payment_di', direction:'up', update_freq:'天', owner:'财务中台',
    tags:['支付','成功率','财务','订单','渠道'],
    available_dimensions:['date','payment_method','device','platform','channel'],
    sim:{base:98.8,variance:0.01,trend:0.0005} },
  { id:'daily_revenue', name:'daily_revenue', display_name:'日收入', category:'财务域', unit:'万元',
    formula:'SUM(confirmed_revenue) WHERE settle_date = 统计日期',
    description:'财务系统确认的每日实收金额（现金流口径），扣除了未完成结算订单和在途退款。',
    source_table:'dws_finance_daily', direction:'up', update_freq:'天', owner:'财务中台',
    tags:['收入','日收入','财务','结算','现金流'],
    available_dimensions:['date','category','payment_method','platform'],
    sim:{base:680,variance:0.13,trend:0.09} },
  /* 流量域 */
  { id:'uv', name:'uv', display_name:'日独立访客数 (UV)', category:'流量域', unit:'万人',
    formula:'COUNT(DISTINCT visitor_id) WHERE visit_date = 统计日期',
    description:'当日访问平台的去重用户/访客数（含未登录），是流量规模的基础度量，UV × 转化率 × 客单价 = GMV。',
    source_table:'dws_traffic_channel_agg', direction:'up', update_freq:'天', owner:'流量分析组',
    tags:['UV','流量','访客','大盘','渠道'],
    available_dimensions:['date','channel','device','platform','region'],
    sim:{base:850,variance:0.13,trend:0.07} },
  { id:'pv', name:'pv', display_name:'日页面访问量 (PV)', category:'流量域', unit:'万次',
    formula:'COUNT(page_view_id) WHERE visit_date = 统计日期',
    description:'当日全站所有页面被访问的总次数，PV/UV 比值反映用户在站内的探索深度。',
    source_table:'dwd_traffic_log_di', direction:'up', update_freq:'天', owner:'流量分析组',
    tags:['PV','流量','页面','访问量','深度'],
    available_dimensions:['date','channel','device','platform','region'],
    sim:{base:4200,variance:0.14,trend:0.06} },
  { id:'bounce_rate', name:'bounce_rate', display_name:'跳出率', category:'流量域', unit:'%',
    formula:'COUNT(session_id WHERE page_view_cnt=1) / COUNT(session_id) * 100',
    description:'只访问一个页面即离开的会话占比，过高时需优化首屏内容和加载性能。',
    source_table:'dwd_traffic_log_di', direction:'down', update_freq:'天', owner:'流量分析组',
    tags:['跳出率','流量','落地页','用户体验','会话'],
    available_dimensions:['date','channel','device','platform'],
    sim:{base:38,variance:0.10,trend:-0.01} },
  { id:'uv_to_order_rate', name:'uv_to_order_rate', display_name:'UV转化率', category:'流量域', unit:'%',
    formula:'COUNT(DISTINCT user_id WHERE has_order=true) / COUNT(DISTINCT visitor_id) * 100',
    description:'当日访客中产生有效订单的比例，下降时需通过漏斗分析定位转化断点。',
    source_table:'ads_funnel_analysis', direction:'up', update_freq:'天', owner:'流量分析组',
    tags:['转化率','UV','流量','漏斗','大盘','效率'],
    available_dimensions:['date','channel','category','device','platform','user_segment'],
    sim:{base:2.8,variance:0.12,trend:0.03} },
  { id:'avg_session_duration', name:'avg_session_duration', display_name:'平均会话时长', category:'流量域', unit:'秒',
    formula:'AVG(session_end_time - session_start_time) WHERE session_duration > 0',
    description:'用户每次访问会话的平均停留时长，时长越长通常表示用户粘性和购买意愿越强。',
    source_table:'dws_traffic_channel_agg', direction:'up', update_freq:'天', owner:'流量分析组',
    tags:['会话时长','流量','粘性','用户体验','停留'],
    available_dimensions:['date','channel','device','platform','user_segment'],
    sim:{base:420,variance:0.11,trend:0.02} },
];

/* ── 确定性伪随机 ── */
function hashKey(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = Math.imul((h << 5) + h, 1) ^ s.charCodeAt(i);
  return (h >>> 0);
}
function simValue(metric, dateStr, extra) {
  const h = hashKey(metric.id + '|' + dateStr + '|' + (extra || ''));
  const rand = (h % 100000) / 100000;
  const daysFrom = (new Date(dateStr) - new Date('2024-01-01')) / 86400000;
  const v = metric.sim.base * (1 + metric.sim.trend * daysFrom / 365) * (1 + (rand - 0.5) * metric.sim.variance);
  return Math.round(v * 100) / 100;
}

/* ── 搜索 ── */
const FIELD_WEIGHTS = { display_name: 12, tags: 10, name: 8, category: 6, description: 5 };
function scoreMetric(metric, terms) {
  let score = 0;
  for (const term of terms) {
    const t = term.toLowerCase();
    if (metric.display_name.toLowerCase().includes(t)) score += FIELD_WEIGHTS.display_name;
    if (metric.name.toLowerCase().includes(t))         score += FIELD_WEIGHTS.name;
    if (metric.category.toLowerCase().includes(t))     score += FIELD_WEIGHTS.category;
    if (metric.description.toLowerCase().includes(t))  score += FIELD_WEIGHTS.description;
    if (metric.tags.some(tag => tag.toLowerCase().includes(t))) score += FIELD_WEIGHTS.tags;
  }
  return score;
}
function searchMetrics(query, limit = 10) {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return METRICS.slice(0, limit).map(m => ({ ...m, score: 0 }));
  const maxRaw = FIELD_WEIGHTS.display_name + FIELD_WEIGHTS.tags + FIELD_WEIGHTS.name + FIELD_WEIGHTS.category + FIELD_WEIGHTS.description;
  return METRICS
    .map(m => ({ ...m, score: Math.round(scoreMetric(m, terms) / maxRaw * 100) }))
    .filter(m => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/* ── 工具实现 ── */
function toolSearchMetrics(args) {
  const { query, limit = 10 } = args;
  if (!query) return '缺少 query 参数';
  const results = searchMetrics(query, limit);
  if (!results.length) return `未找到与"${query}"相关的指标。`;
  const lines = [`找指标结果：查询"${query}"，共找到 ${results.length} 条\n`];
  results.forEach((m, i) => {
    lines.push(`#${i + 1} [score:${m.score}] ${m.display_name} (${m.name}) | ${m.category} | 单位:${m.unit} | 方向:${m.direction === 'up' ? '↑正向' : '↓负向'} | 取数表:${m.source_table}`);
    lines.push(`    ${m.description}`);
    lines.push(`    标签：${m.tags.join(', ')}\n`);
  });
  return lines.join('\n');
}

function toolGetMetricDetail(args) {
  const m = METRICS.find(x => x.id === args.metric_id || x.name === args.metric_id);
  if (!m) return `未找到指标：${args.metric_id}`;
  return [
    `📐 ${m.display_name} (${m.name})`,
    ``,
    `类别：${m.category}  ·  单位：${m.unit}  ·  方向：${m.direction === 'up' ? '↑ 越高越好' : '↓ 越低越好'}`,
    `取数来源：${m.source_table}  ·  更新频率：${m.update_freq}  ·  负责团队：${m.owner}`,
    ``,
    `计算口径：\n  ${m.formula}`,
    ``,
    `指标说明：${m.description}`,
    ``,
    `可拆解维度：${m.available_dimensions.join(' / ')}`,
    `标签：${m.tags.join(' · ')}`,
  ].join('\n');
}

function toolGetMetricData(args) {
  const { metric_id, date_from = '2024-12-01', date_to = '2024-12-30', group_by = 'date' } = args;
  const m = METRICS.find(x => x.id === metric_id || x.name === metric_id);
  if (!m) return `未找到指标：${metric_id}`;
  if (group_by === 'date') {
    const data = [];
    const d0 = new Date(date_from), d1 = new Date(date_to);
    for (let d = new Date(d0); d <= d1; d.setDate(d.getDate() + 1)) {
      const ds = d.toISOString().slice(0, 10);
      data.push({ date: ds, value: simValue(m, ds) });
    }
    const vals = data.map(r => r.value);
    const total = vals.reduce((a, b) => a + b, 0);
    const avg = Math.round(total / vals.length * 100) / 100;
    const lines = [
      `指标数据：${m.display_name}（${date_from} ~ ${date_to}，按日）`,
      `汇总：合计=${Math.round(total * 100) / 100} ${m.unit}，均值=${avg} ${m.unit}，最高=${Math.max(...vals)} ${m.unit}，最低=${Math.min(...vals)} ${m.unit}`,
      ``,
      ...data.map(r => `  ${r.date}  ${r.value} ${m.unit}`),
    ];
    return JSON.stringify({
      metric: { id: m.id, display_name: m.display_name, unit: m.unit, direction: m.direction },
      group_by: 'date', date_from, date_to,
      data: data.map(r => ({ label: r.date.slice(5), value: r.value })),
      summary: { total: Math.round(total * 100) / 100, avg, max: Math.max(...vals), min: Math.min(...vals) },
      _text: lines.join('\n'),
    });
  }
  // dimension breakdown
  const dim = DIMENSIONS.find(d => d.id === group_by);
  if (!dim) return `不支持的 group_by 维度：${group_by}`;
  if (!m.available_dimensions.includes(group_by)) return `指标 ${m.display_name} 不支持按 ${dim.name} 拆解`;
  const dimValues = dim.values_example;
  const midDate = date_from;
  const total = simValue(m, midDate);
  // Assign proportions deterministically
  const props = dimValues.map((v, i) => {
    const h = hashKey(m.id + '|' + group_by + '|' + v);
    return (h % 100) + 10;
  });
  const propSum = props.reduce((a, b) => a + b, 0);
  const data = dimValues.map((v, i) => ({
    label: v,
    value: Math.round(total * props[i] / propSum * 100) / 100,
  })).sort((a, b) => b.value - a.value);
  const lines = [
    `指标数据：${m.display_name} 按 ${dim.name} 拆解（参考日期 ${date_from}）`,
    ``,
    ...data.map((r, i) => `  #${i + 1} ${r.label}：${r.value} ${m.unit}`),
  ];
  return JSON.stringify({
    metric: { id: m.id, display_name: m.display_name, unit: m.unit, direction: m.direction },
    group_by, dimension_name: dim.name, date_from, date_to,
    data,
    _text: lines.join('\n'),
  });
}

function toolListDimensions(args) {
  const { metric_id } = args;
  if (metric_id) {
    const m = METRICS.find(x => x.id === metric_id || x.name === metric_id);
    if (!m) return `未找到指标：${metric_id}`;
    const dims = m.available_dimensions.map(id => DIMENSIONS.find(d => d.id === id)).filter(Boolean);
    const lines = [`指标 "${m.display_name}" 可按以下 ${dims.length} 个维度拆解：\n`];
    dims.forEach(d => lines.push(`  · ${d.display_name}（${d.name}）— ${d.description}`));
    return lines.join('\n');
  }
  const lines = [`全部 ${DIMENSIONS.length} 个公共维度：\n`];
  DIMENSIONS.forEach(d => {
    lines.push(`  ${d.display_name}（${d.name}）[${d.type}]`);
    lines.push(`    示例值：${d.values_example.slice(0, 4).join(' / ')}  |  基数：${d.cardinality}`);
  });
  return lines.join('\n');
}

function toolListCategories() {
  const cats = {};
  METRICS.forEach(m => { cats[m.category] = (cats[m.category] || 0) + 1; });
  const lines = [`指标字典概览：共 ${METRICS.length} 个指标 / ${DIMENSIONS.length} 个维度\n按类别：`];
  Object.entries(cats).forEach(([k, v]) => lines.push(`  ${k}：${v} 个`));
  lines.push(`\n使用 search_metrics 搜索指标，get_metric_data 查询数据，list_dimensions 查看可拆解维度。`);
  return lines.join('\n');
}

/* ── 工具定义 ── */
const TOOLS = [
  { name: 'search_metrics',
    description: '根据关键词搜索指标字典，返回最匹配的电商指标列表及其元数据',
    inputSchema: { type: 'object', required: ['query'], properties: {
      query: { type: 'string', description: '搜索关键词，如"GMV"、"用户留存"、"转化率"' },
      limit: { type: 'number', description: '返回条数，默认 10，最多 20' },
    }}},
  { name: 'get_metric_detail',
    description: '获取指定指标的完整元数据，包含计算口径、取数来源、可拆解维度等',
    inputSchema: { type: 'object', required: ['metric_id'], properties: {
      metric_id: { type: 'string', description: '指标ID，如 gmv、dau、uv_to_order_rate' },
    }}},
  { name: 'get_metric_data',
    description: '查询指标的模拟时序数据或维度拆解数据',
    inputSchema: { type: 'object', required: ['metric_id'], properties: {
      metric_id: { type: 'string', description: '指标ID' },
      date_from: { type: 'string', description: '开始日期 YYYY-MM-DD，默认 2024-12-01' },
      date_to:   { type: 'string', description: '结束日期 YYYY-MM-DD，默认 2024-12-30' },
      group_by:  { type: 'string', description: '分组维度：date（默认按日）/ channel / category / region / device / platform 等' },
    }}},
  { name: 'list_dimensions',
    description: '查看指标可按哪些维度拆解，或列出所有公共维度定义',
    inputSchema: { type: 'object', properties: {
      metric_id: { type: 'string', description: '指标ID，为空则列出全部维度' },
    }}},
  { name: 'list_categories',
    description: '列出指标字典的分类统计和概览信息',
    inputSchema: { type: 'object', properties: {} }},
];

/* ── JSON-RPC Handler ── */
function handleRPC(rpc) {
  const { method, params = {} } = rpc;
  if (method === 'initialize') return { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'mcp-metrics', version: '1.0.0' } };
  if (method === 'tools/list') return { tools: TOOLS };
  if (method === 'tools/call') {
    const { name, arguments: args = {} } = params;
    let text;
    if      (name === 'search_metrics')   text = toolSearchMetrics(args);
    else if (name === 'get_metric_detail') text = toolGetMetricDetail(args);
    else if (name === 'get_metric_data')  text = toolGetMetricData(args);
    else if (name === 'list_dimensions')  text = toolListDimensions(args);
    else if (name === 'list_categories')  text = toolListCategories();
    else throw { code: -32601, message: `未知工具: ${name}` };
    return { content: [{ type: 'text', text }] };
  }
  if (method === 'notifications/initialized') return null;
  throw { code: -32601, message: `未知方法: ${method}` };
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
  req.on('end', () => {
    let rpc;
    try { rpc = JSON.parse(body); } catch (_) {
      res.writeHead(400); res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null })); return;
    }
    const isBatch = Array.isArray(rpc);
    const responses = [];
    for (const item of (isBatch ? rpc : [rpc])) {
      try {
        const result = handleRPC(item);
        if (result !== null && item.id != null) responses.push({ jsonrpc: '2.0', result, id: item.id });
      } catch (e) {
        const err = e.code ? e : { code: -32603, message: String(e?.message ?? e) };
        if (item.id != null) responses.push({ jsonrpc: '2.0', error: err, id: item.id });
      }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(isBatch ? JSON.stringify(responses) : JSON.stringify(responses[0] ?? {}));
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n  📐  指标字典 MCP Server 已启动\n');
  console.log(`  端点：http://localhost:${PORT}`);
  console.log(`  指标：${METRICS.length} 个  |  维度：${DIMENSIONS.length} 个\n`);
});
server.on('error', e => { console.error('❌ 服务器错误:', e.message); process.exit(1); });
