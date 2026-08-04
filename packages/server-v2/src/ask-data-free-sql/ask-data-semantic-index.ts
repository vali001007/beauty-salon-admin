import type { ReadOnlySqlView } from '../read-only-sql-kernel/read-only-sql-kernel.types.js';
import type { AskDataParsedIntent } from './ask-data-intent-parser.js';
import type { AskDataSemanticAnswerShape } from './ask-data-free-sql.types.js';
import {
  ASK_DATA_SEMANTIC_CONTRACTS,
  ASK_DATA_SEMANTIC_PATTERNS,
  normalizeSemanticText,
  type AskDataSemanticMetricContract,
} from './ask-data-semantic-contracts.js';

export type AskDataSemanticIndexMatch = {
  contract: AskDataSemanticMetricContract;
  view: ReadOnlySqlView;
  score: number;
  positiveSignals: string[];
  negativeSignals: string[];
};

const GOVERNED_OVERRIDES: Array<{ metricKey: string; patterns: RegExp[]; weight: number }> = [
  { metricKey: 'order_revenue', patterns: [/(?:收入趋势|营业额|订单收入|跟上个月比收入|最大的一笔消费|消耗和收入.*对比)/], weight: 90 },
  { metricKey: 'daily_net_receipts', patterns: [/(?:日结|收银汇总|结账金额|日结净收)/], weight: 110 },
  {
    metricKey: 'payment_flow',
    patterns: [
      /(?:实收流水|收款明细|刷卡消费|支付明细|退款流水|退款记录|收了多少钱|收了多少现金|储值卡消费)/,
      /(?:现金|微信|支付宝|银行卡|刷卡|会员余额|储值).*(?:各|分别)(?:收|收了|收款|支付).*?多少/,
      /(?:现金|微信|支付宝|银行卡|刷卡|会员余额|储值).*收了多少.*(?:现金|微信|支付宝|银行卡|刷卡|会员余额|储值).*(?:各|分别)?多少/,
    ],
    weight: 120,
  },
  { metricKey: 'payment_flow', patterns: [/退款.*(?:逐笔|分类)|逐笔.*退款/], weight: 220 },
  { metricKey: 'product_sales', patterns: [/(?:产品|商品).*(?:卖得最好|卖出去|件数|扣掉退款|退款后)|卖得最好.*(?:产品|商品)/, /(?:产品|商品).*动销|动销.*(?:产品|商品)|动销分析/], weight: 130 },
  { metricKey: 'project_sales', patterns: [/(?:哪个|哪些|各).*项目.*(?:做得最多|最受欢迎|最热门|销量|收入)/, /项目做得最多/, /项目订单/], weight: 120 },
  { metricKey: 'project_catalog', patterns: [/项目.*(?:价格|时长|类型|疗程|周期)/], weight: 120 },
  { metricKey: 'staff_performance', patterns: [/(?:各|每位)?美容师.*服务次数/, /员工.*(?:业绩|提成|客单价)/], weight: 115 },
  { metricKey: 'staff_capacity', patterns: [/(?:工作饱和度|超过接待能力|接待能力|工时利用率|产能利用率|超排)/], weight: 125 },
  {
    metricKey: 'reservation_metrics',
    patterns: [
      /(?:预约情况|预约数量|非取消预约量|有(?:几|多少)个预约)/,
      /(?:各项目|每个项目).*预约量/,
      /(?:各|每位)?(?:员工|美容师).*预约量/,
      /[\p{Script=Han}·]{2,4}(?:今年|本周末|本周|今天)?(?:接了哪些预约|预约的是什么项目)/u,
    ],
    weight: 180,
  },
  { metricKey: 'inventory_on_hand', patterns: [/(?:产品|商品).*(?:快过期|临期|效期|还有多少|当前库存)/, /(?:快过期|临期).*(?:产品|商品)/, /\d+天内.*过期.*(?:东西|商品|产品)?/, /仓库.*(?:还有多少|多少货|值多少钱)/, /哪些东西快没了/], weight: 125 },
  { metricKey: 'inventory_movement', patterns: [/(?:产品|商品|库存|耗材|精华|耗材包|调拨).*(?:消耗特别快|消耗和上个月|消耗趋势|用量趋势|入库|出库|流水|变化|变动)/], weight: 125 },
  {
    metricKey: 'inventory_slow_moving',
    patterns: [
      /(?:产品|商品).*(?:当前)?有库存.*(?:最近)?\s*90\s*天.*(?:没有|没|无).*(?:出库|消耗)/,
      /(?:产品|商品|库存)?(?:一直有|当前有库存|有库存|长期).*(?:90|九十)天.*(?:没有|没|无)出库/,
      /(?:近|最近)?(?:90|九十)天(?:没有|没|无)出库.*(?:产品|商品|库存)?/,
      /(?:运营)?周转率.*(?:低于|小于)\s*0?\.5.*(?:慢动销|产品|商品)|慢动销.*(?:运营)?周转率/,
    ],
    weight: 260,
  },
  {
    metricKey: 'inventory_demand_change',
    patterns: [/(?:需求|消耗).*(?:比|较).*(?:前\s*30\s*天|上个\s*30\s*天).*(?:增长|增加|上升).*(?:产品|商品|耗材)/],
    weight: 260,
  },
  {
    metricKey: 'inventory_procurement_coverage',
    patterns: [/(?:产品|商品).*(?:最近)?\s*90\s*天.*(?:有消耗|有出库).*(?:没有|没|无).*(?:采购|采购记录)/],
    weight: 260,
  },
  {
    metricKey: 'inventory_outbound_usage',
    patterns: [/(?:这|本)季度.*(?:每个|各)(?:产品|商品).*(?:累计)?出库用量/],
    weight: 260,
  },
  {
    metricKey: 'inventory_outbound_cost_estimate',
    patterns: [/(?:这|本)月.*(?:每日平均|每天平均|日均).*(?:耗材)?出库成本(?:估算)?/],
    weight: 260,
  },
  { metricKey: 'customer_balance', patterns: [/(?:现金|赠送|储值)余额.*(?:未用|没用).*次卡/], weight: 180 },
  { metricKey: 'card_assets', patterns: [/(?:现金|赠送|储值)余额.*(?:未用|没用).*次卡/], weight: 180 },
  { metricKey: 'customer_profile', patterns: [/没到店.*高价值.*高流失风险/], weight: 420 },
  { metricKey: 'operating_cost', patterns: [/(?:运营|经营|固定|变动).*成本/, /成本结构|费用结构|成本明细/], weight: 125 },
  { metricKey: 'reconciliation_issue', patterns: [/(?:漏收|多收|重复收费|双计费|收款和系统记录|对不上|对账异常|日结.*平不平)/], weight: 135 },
  { metricKey: 'card_assets', patterns: [/次卡.*快过期.*(?:还没核销完|没用完|未用完)/], weight: 320 },
  { metricKey: 'card_usage', patterns: [/次卡.*还没核销完/], weight: 125 },
  { metricKey: 'customer_feedback', patterns: [/(?:客诉|差评|负面反馈|投诉|项目.*反馈|反馈.*平均评分)/], weight: 150 },
  { metricKey: 'staff_capacity', patterns: [/排班.*预约.*空闲分钟|每位员工.*(?:排班|空闲分钟)/], weight: 220 },
  { metricKey: 'marketing_activity', patterns: [/进行中.*活动数量|活动数量.*优惠数量/], weight: 180 },
  { metricKey: 'promotion_offer', patterns: [/按(?:优惠|促销)类型.*活动数量|(?:优惠|促销)类型.*(?:活动数量|统计)/], weight: 420 },
  { metricKey: 'promotion_offer', patterns: [/活动数量.*优惠数量|仍有效优惠数量/], weight: 180 },
  { metricKey: 'marketing_roi', patterns: [/(?:营销投入回报|营销投产|营销roi|活动.*(?:亏钱|亏损|赔钱|不赚钱))/i], weight: 125 },
  { metricKey: 'supplier_performance', patterns: [/供应商.*(?:交货|交付).*稳定/], weight: 125 },
  { metricKey: 'supplier_latest_quote', patterns: [/供应商.*(?:最近|最新|上次|当前)?.*报价|(?:最近|最新|上次|当前)报价.*供应商/], weight: 210 },
  { metricKey: 'supplier_price_comparison', patterns: [/(?:比较|对比).*(?:两个|不同)?供应商.*(?:报价|价格)|供应商.*(?:报价|价格).*(?:比较|对比|最低|更低|差额|降低成本)|换(?:个)?供应商.*降低成本/], weight: 230 },
  { metricKey: 'supplier_minimum_order_quantity', patterns: [/(?:供应商|各品类|商品).*(?:最低采购量|最小采购量|起订量|MOQ)|(?:最低采购量|最小采购量|起订量|MOQ).*(?:供应商|各品类|商品)/i], weight: 220 },
  { metricKey: 'supplier_payment_terms', patterns: [/供应商.*(?:账期|结算方式|付款条件|月结条款)|(?:账期|结算方式|付款条件).*(?:供应商)/], weight: 220 },
  { metricKey: 'supplier_lead_time', patterns: [/供应商.*(?:报价交期|预计交付天数|供货要几天|交货周期)|(?:报价交期|预计交付天数|供货要几天|交货周期).*(?:供应商)/], weight: 220 },
  {
    metricKey: 'bom_variance',
    patterns: [
      /(?:缺少标准bom|标准bom缺失|标准缺失|消耗异常)/i,
      /bom.*(?:理论|标准).*(?:实际|出库|消耗).*(?:差|偏差)/i,
      /(?:实际耗材|实际用量|耗材|用量).*(?:偏差率|偏差趋势|偏差.*变化|偏离标准)/,
    ],
    weight: 180,
  },
  { metricKey: 'transfer_status', patterns: [/(?:对方门店.*调入|调入商品数量|调出商品数量)/], weight: 130 },
  { metricKey: 'staff_capacity', patterns: [/预约密度.*(?:空位|空档)/], weight: 100 },
  {
    metricKey: 'appointment_gap',
    patterns: [/预约密度.*(?:空位|空档)|哪里有空位/, /可加客容量|可用预约容量|空档候选客户/],
    weight: 220,
  },
  { metricKey: 'reservation_metrics', patterns: [/(?:预约|预订).*(?:项目|护理).*(?:客户|客人)|(?:预约|预订).*(?:客户|客人).*(?:项目|护理)/], weight: 150 },
];

export function rankAskDataSemanticIndex(input: {
  question: string;
  parsed: AskDataParsedIntent;
  authorizedViews: ReadOnlySqlView[];
  maxCandidates?: number;
}): AskDataSemanticIndexMatch[] {
  const normalized = normalizeSemanticText(input.question);
  const authorizedByName = new Map(input.authorizedViews.map((view) => [view.viewName, view]));
  const parsedScores = new Map(input.parsed.matchedContracts.map((item) => [item.contract.metricKey, item.score]));
  const explicitCombination = hasExplicitMetricCombination(input.question, input.parsed.semanticIntent.answerShape);
  const matches: AskDataSemanticIndexMatch[] = [];

  for (const contract of ASK_DATA_SEMANTIC_CONTRACTS) {
    const view = authorizedByName.get(contract.preferredView);
    if (!view) continue;
    const positiveSignals: string[] = [];
    const negativeSignals: string[] = [];
    let score = parsedScores.get(contract.metricKey) ?? 0;
    if (score > 0) positiveSignals.push('intent_parser');

    for (const override of GOVERNED_OVERRIDES) {
      if (override.metricKey !== contract.metricKey) continue;
      const hits = override.patterns.filter((pattern) => pattern.test(normalized)).length;
      if (hits) {
        score += override.weight * hits;
        positiveSignals.push('governed_override');
      }
    }

    const aliasHits = contract.aliases.filter((alias) => normalized.includes(normalizeSemanticText(alias)));
    if (aliasHits.length) {
      score += aliasHits.reduce((total, alias) => total + Math.max(12, normalizeSemanticText(alias).length * 4), 0);
      positiveSignals.push(...aliasHits.map((alias) => `alias:${alias}`));
    }
    const patternHits = (ASK_DATA_SEMANTIC_PATTERNS[contract.metricKey] ?? []).filter((pattern) => pattern.test(normalized));
    if (patternHits.length) {
      score += patternHits.length * 30;
      positiveSignals.push('semantic_pattern');
    }

    const viewKeywordHits = (view.keywords ?? []).filter((keyword) => normalized.includes(normalizeSemanticText(keyword)));
    if (viewKeywordHits.length) {
      score += viewKeywordHits.length * 8;
      positiveSignals.push('catalog_keyword');
    }
    if (!positiveSignals.length) continue;
    if (contract.answerShapes.includes(input.parsed.semanticIntent.answerShape)) score += 4;
    else score -= 18;
    score += input.parsed.semanticIntent.dimensionKeys.filter((key) => contract.dimensions.includes(key)).length * 4;

    const negativeAliasHits = contract.negativeAliases.filter((alias) => normalized.includes(normalizeSemanticText(alias)));
    const negativePatternHits = contract.negativePatterns.filter((pattern) => pattern.test(normalized));
    if (!explicitCombination && (negativeAliasHits.length || negativePatternHits.length)) {
      score -= negativeAliasHits.length * 95 + negativePatternHits.length * 95;
      negativeSignals.push(...negativeAliasHits.map((alias) => `negative_alias:${alias}`));
      if (negativePatternHits.length) negativeSignals.push('negative_pattern');
    }

    if (score > 0) matches.push({ contract, view, score, positiveSignals, negativeSignals });
  }

  return matches
    .sort((left, right) => right.score - left.score || left.contract.metricKey.localeCompare(right.contract.metricKey))
    .slice(0, input.maxCandidates ?? 8);
}

export function hasExplicitMetricCombination(question: string, answerShape?: AskDataSemanticAnswerShape) {
  if (/库存变动.*前后数量都要|变动前后数量都要/.test(question)) return false;
  if (/(?:更低.*供应商.*报价|供应商.*报价.*(?:差额|更低))/.test(question)) return false;
  if (answerShape === 'comparison') return true;
  return /(?:同时|一并)(?:(?:查询|统计|分析|查看)|有)|以及|放在?一起|一块看|也(?:带上|一起)|(?:和|与|、|，|,|且).*(?:各(?:占)?多少|分别|都要|差额)|(?:现金|赠送|储值)?余额.*(?:且|并且|同时|还).*(?:未用|没用).*次卡|有预约的美容师.*空闲|未到货采购单.*平均交付|预估毛利.*耗材偏差|未完成服务.*反馈|活动数量.*优惠数量|调出单.*出库流水/.test(question);
}
