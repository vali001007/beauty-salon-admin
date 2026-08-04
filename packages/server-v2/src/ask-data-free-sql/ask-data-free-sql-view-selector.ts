import { hasReadOnlySqlViewPermission } from '../read-only-sql-kernel/read-only-sql-guard.js';
import type { ReadOnlySqlView } from '../read-only-sql-kernel/read-only-sql-kernel.types.js';
import { ASK_DATA_FREE_SQL_VIEWS } from './ask-data-free-sql.catalog.js';
import type { AskDataFreeSqlContext } from './ask-data-free-sql.types.js';

const DEFAULT_VIEW_NAMES = [
  'agent_v3_order_summary_view',
  'agent_v3_daily_settlement_view',
  'ask_data_confirmed_profit_view',
  'agent_v3_reservation_view',
  'agent_v3_product_inventory_view',
  'ask_data_staff_performance_view',
  'ask_data_marketing_roi_view',
  'ask_data_customer_lifecycle_view',
];

const DOMAIN_HINTS: Array<{ pattern: RegExp; views: string[] }> = [
  {
    pattern: /营业额|净收|退款|收银|日结|结算/,
    views: ['agent_v3_daily_settlement_view', 'agent_v3_payment_refund_view', 'agent_v3_order_summary_view'],
  },
  { pattern: /次卡|卡项|核销|划扣|会员卡|剩余次数/, views: ['agent_v3_card_asset_view', 'agent_v3_card_usage_view'] },
  { pattern: /余额|储值|合同负债|履约负债|会员负债/, views: ['agent_v3_customer_balance_view', 'ask_data_member_liability_view'] },
  { pattern: /利润|毛利|成本率|利润率/, views: ['ask_data_confirmed_profit_view', 'ask_data_operating_cost_view'] },
  { pattern: /对账|账实|差异|异常/, views: ['ask_data_reconciliation_issue_view', 'agent_v3_daily_settlement_view'] },
  { pattern: /排班|产能|工时|空闲|超排|利用率/, views: ['ask_data_staff_capacity_view', 'agent_v3_appointment_gap_view'] },
  { pattern: /员工业绩|员工绩效|业绩排行|提成|客单价|人效/, views: ['ask_data_staff_performance_view'] },
  {
    pattern: /库存周转|周转率|还能用多久|还够用多久|可用天数|慢动销|库存积压|(?:90|九十)天.*(?:没有|没|无)出库|(?:一直有|当前有库存|长期).*(?:没有|没|无)出库|需求突然增加|快断货.*(?:没|未).*采购|采购覆盖|日均耗材(?:费用|成本)/,
    views: ['ask_data_inventory_turnover_view', 'agent_v3_product_inventory_view'],
  },
  { pattern: /调拨|调入|调出/, views: ['ask_data_transfer_status_view', 'agent_v3_stock_movement_view'] },
  { pattern: /bom|耗材|消耗偏差|标准用量/i, views: ['ask_data_bom_consumption_variance_view', 'agent_v3_stock_movement_view'] },
  { pattern: /反馈|投诉|满意|低评分|表扬/, views: ['ask_data_customer_feedback_view', 'agent_v3_service_quality_view'] },
  { pattern: /生命周期|流失|ltv|客户机会|触达疲劳/i, views: ['ask_data_customer_lifecycle_view', 'ask_data_customer_profile_summary_view'] },
  { pattern: /roi|投产|归因收入|营销成本|渠道效果/i, views: ['ask_data_marketing_roi_view', 'agent_v3_marketing_conversion_view'] },
  {
    pattern: /供应商.*(?:报价|价格|账期|结算方式|最低采购量|最小采购量|起订量|MOQ|交期)|(?:报价|价格|账期|结算方式|最低采购量|最小采购量|起订量|MOQ|交期).*供应商/i,
    views: ['ask_data_supplier_quote_terms_view'],
  },
  {
    pattern: /采购|到货|实际交付|供应商.*(?:采购金额|采购次数|采购表现|表现|排行|实际交付)/,
    views: ['agent_v3_purchase_procurement_view', 'agent_v3_supplier_performance_view'],
  },
  { pattern: /优惠|促销|优惠券/, views: ['agent_v3_promotion_offer_view', 'agent_v3_marketing_activity_view'] },
  { pattern: /活动|营销|触达|自动化/, views: ['agent_v3_marketing_activity_view', 'agent_v3_marketing_automation_view', 'agent_v3_marketing_conversion_view'] },
  { pattern: /项目目录|项目价格|护理周期|疗程/, views: ['agent_v3_project_catalog_view', 'agent_v3_project_service_sales_view'] },
  { pattern: /项目.*价格|价格.*项目|最高价|最低价/, views: ['agent_v3_project_catalog_view'] },
  { pattern: /服务质量|服务任务|护理完成/, views: ['agent_v3_service_quality_view', 'ask_data_customer_feedback_view'] },
];

export function authorizedAskDataViews(
  context: Pick<AskDataFreeSqlContext, 'permissions' | 'deniedPermissions'>,
  views: ReadOnlySqlView[] = ASK_DATA_FREE_SQL_VIEWS,
) {
  return views.filter((view) => hasReadOnlySqlViewPermission(view, context));
}

export function selectAskDataViews(
  question: string,
  context: Pick<AskDataFreeSqlContext, 'permissions' | 'deniedPermissions'>,
  maxCandidates = 8,
  views: ReadOnlySqlView[] = ASK_DATA_FREE_SQL_VIEWS,
) {
  const authorized = authorizedAskDataViews(context, views);
  const normalized = question.trim().toLowerCase();
  const hinted = new Map<string, number>();
  const matchedHintViews = new Set<string>();
  for (const hint of DOMAIN_HINTS) {
    if (!hint.pattern.test(normalized)) continue;
    hint.views.forEach((viewName, index) => {
      matchedHintViews.add(viewName);
      hinted.set(viewName, Math.max(hinted.get(viewName) ?? 0, 40 - index));
    });
  }

  if (matchedHintViews.size > 0 && !authorized.some((view) => matchedHintViews.has(view.viewName))) return [];
  if (authorized.length <= maxCandidates) return authorized;

  const scored = authorized
    .map((view) => {
      let score = hinted.get(view.viewName) ?? 0;
      const phrases = [view.label, view.domain, view.description, ...(view.keywords ?? [])]
        .map((item) => item.toLowerCase())
        .filter(Boolean);
      for (const phrase of phrases) {
        if (phrase.length >= 2 && normalized.includes(phrase)) score += 12;
        for (const token of phrase.split(/[\s,，。？?、/（）()：:]+/).filter((item) => item.length >= 2)) {
          if (normalized.includes(token)) score += 2;
        }
      }
      return { view, score };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.view.viewName.localeCompare(right.view.viewName));

  if (scored.length) return scored.slice(0, maxCandidates).map((item) => item.view);

  const byName = new Map(authorized.map((view) => [view.viewName, view]));
  const defaults = DEFAULT_VIEW_NAMES.map((viewName) => byName.get(viewName)).filter(
    (view): view is ReadOnlySqlView => Boolean(view),
  );
  return (defaults.length ? defaults : authorized).slice(0, maxCandidates);
}
