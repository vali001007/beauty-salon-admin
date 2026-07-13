import { Injectable } from '@nestjs/common';
import type { AgentV2SemanticView, AgentV2TextToSqlPlan, AgentV2TextToSqlRequest } from './agent-v2-text-to-sql.types.js';
import { AgentV2SemanticViewRegistryService } from './agent-v2-semantic-view-registry.service.js';

@Injectable()
export class AgentV2TextToSqlPlannerService {
  constructor(private readonly registry: AgentV2SemanticViewRegistryService) {}

  plan(request: AgentV2TextToSqlRequest): AgentV2TextToSqlPlan {
    if (this.isRawSqlIntent(request.question)) {
      return {
        status: 'unable_to_plan',
        intent: { domain: 'unknown', type: 'unknown' },
        selectedViews: [],
        parameters: {},
        explanation: '受控 Text-to-SQL 不接受用户直接输入 SQL，只能由系统 Planner 基于白名单语义视图生成查询。',
        reasonCode: 'raw_sql_input_not_allowed',
      };
    }
    if (this.isWriteIntent(request.question)) {
      return {
        status: 'unable_to_plan',
        intent: { domain: 'unknown', type: 'unknown' },
        selectedViews: [],
        parameters: {},
        explanation: '受控 Text-to-SQL 只支持只读查询，不能处理写入、删除、发券或下发类问题。',
        reasonCode: 'write_intent_not_allowed',
      };
    }
    if (this.isSensitiveDataIntent(request.question)) {
      return {
        status: 'unable_to_plan',
        intent: { domain: 'unknown', type: 'unknown' },
        selectedViews: [],
        parameters: {},
        explanation: '受控 Text-to-SQL 不支持直接查询手机号、密码、token、openid、证件号等敏感字段。',
        reasonCode: 'sensitive_data_intent_not_allowed',
      };
    }
    if (this.isCrossStoreBypassIntent(request.question)) {
      return {
        status: 'unable_to_plan',
        intent: { domain: 'unknown', type: 'unknown' },
        selectedViews: [],
        parameters: {},
        explanation: '受控 Text-to-SQL 只能查询当前授权门店范围，不能按自然语言绕过门店范围。',
        reasonCode: 'cross_store_intent_not_allowed',
      };
    }
    if (this.isExcessiveRangeIntent(request.question)) {
      return {
        status: 'unable_to_plan',
        intent: { domain: 'unknown', type: 'unknown' },
        selectedViews: [],
        parameters: {},
        explanation: '查询时间范围超过受控 Text-to-SQL 的安全限制，请缩小到已授权的近期范围。',
        reasonCode: 'excessive_time_range_intent_not_allowed',
      };
    }
    const views = this.registry.recall(request.question, { includeAdmin: this.isAdmin(request), includePlanned: false });
    const primary = views[0];
    if (!primary) {
      return {
        status: 'unable_to_plan',
        intent: { domain: 'unknown', type: 'unknown' },
        selectedViews: [],
        parameters: {},
        explanation: '没有可用语义视图。',
        reasonCode: 'no_enabled_semantic_view',
      };
    }
    const sql = this.sqlFor(request.question, primary);
    if (!sql) {
      return {
        status: 'unable_to_plan',
        intent: { domain: primary.domain, type: 'unknown' },
        selectedViews: [primary.viewName],
        parameters: {},
        explanation: '当前问题需要的查询形态尚未支持。',
        reasonCode: 'unsupported_question_shape',
      };
    }
    return {
      status: 'planned',
      intent: this.intentFor(request.question, primary),
      selectedViews: [primary.viewName],
      generatedSql: sql,
      parameters: { allowedStoreIds: 'system:storeScope' },
      explanation: `使用 ${primary.viewName} 生成只读查询。`,
    };
  }

  private sqlFor(question: string, viewDef: AgentV2SemanticView) {
    const limit = this.limit(question);
    if (viewDef.viewName === 'agent_v2_order_item_sales_view') {
      const orderBy = /销售额|销售金额|净销售|成交额|金额|收入|营收/i.test(question)
        ? 'ORDER BY net_sales_amount DESC, quantity_sold DESC'
        : 'ORDER BY quantity_sold DESC, net_sales_amount DESC';
      return [
        'SELECT product_id, product_name, sku, SUM(quantity) AS quantity_sold, SUM(net_amount) AS net_sales_amount',
        `FROM ${viewDef.viewName}`,
        'WHERE order_status = ANY(:paidStatuses)',
        'GROUP BY product_id, product_name, sku',
        orderBy,
        `LIMIT ${limit}`,
      ].join(' ');
    }
    if (viewDef.viewName === 'agent_v2_inventory_scrap_view') {
      return [
        'SELECT product_id, product_name, sku, SUM(scrap_quantity) AS scrap_quantity',
        `FROM ${viewDef.viewName}`,
        'GROUP BY product_id, product_name, sku',
        'ORDER BY scrap_quantity DESC',
        `LIMIT ${limit}`,
      ].join(' ');
    }
    if (viewDef.viewName === 'agent_v2_order_summary_view' || viewDef.viewName === 'agent_v2_daily_settlement_view') {
      const timeField = viewDef.defaultTimeField ?? 'order_created_at';
      return [
        `SELECT ${timeField}, SUM(paid_amount) AS paid_amount, SUM(refund_amount) AS refund_amount, SUM(net_amount) AS net_amount`,
        `FROM ${viewDef.viewName}`,
        `GROUP BY ${timeField}`,
        `ORDER BY ${timeField} DESC`,
        `LIMIT ${limit}`,
      ].join(' ');
    }
    if (viewDef.viewName === 'agent_v2_staff_performance_view') {
      return [
        'SELECT staff_id, staff_name, SUM(paid_amount) AS paid_amount, AVG(average_order_amount) AS average_order_amount',
        `FROM ${viewDef.viewName}`,
        'GROUP BY staff_id, staff_name',
        'ORDER BY average_order_amount DESC',
        `LIMIT ${limit}`,
      ].join(' ');
    }
    if (viewDef.viewName === 'agent_v2_customer_profile_summary_view') {
      return [
        'SELECT customer_id, customer_name_masked, member_level, total_paid_amount, order_count, last_visit_at, last_order_at',
        `FROM ${viewDef.viewName}`,
        'WHERE total_paid_amount > 0',
        'ORDER BY total_paid_amount DESC, last_order_at ASC NULLS FIRST',
        `LIMIT ${limit}`,
      ].join(' ');
    }
    const fields = viewDef.fields.filter((field) => field.policy !== 'deny').slice(0, 6).map((field) => field.name);
    if (!fields.length) return null;
    return `SELECT ${fields.join(', ')} FROM ${viewDef.viewName} LIMIT ${limit}`;
  }

  private intentFor(question: string, viewDef: AgentV2SemanticView) {
    const type = /最高|最多|最好|排行|排名|top/i.test(question) ? 'ranking' : /趋势|相比|变化/i.test(question) ? 'trend' : 'metric';
    return {
      domain: viewDef.domain,
      type,
      metric: this.metric(question),
    } as AgentV2TextToSqlPlan['intent'];
  }

  private metric(question: string) {
    if (/销量|销售数量/.test(question)) return 'quantity_sold';
    if (/营业额|营收|实收/.test(question)) return 'paid_amount';
    if (/退款/.test(question)) return 'refund_amount';
    if (/报废/.test(question)) return 'scrap_quantity';
    if (/客单价/.test(question)) return 'average_order_amount';
    return undefined;
  }

  private limit(question: string) {
    const match = question.match(/(?:top|前)\s*(\d+)/i) ?? question.match(/(\d+)\s*(?:个|条|名)/);
    const parsed = match ? Number(match[1]) : 10;
    return Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), 1), 50) : 10;
  }

  private isWriteIntent(question: string) {
    return /删除|删掉|写入|新增|创建|修改|更新|发券|下发|推送|通知|充值|退款|核销|作废|导入|导出|\b(drop|delete|update|insert|alter|create)\b/i.test(question);
  }

  private isRawSqlIntent(question: string) {
    return /\bselect\b.+\bfrom\b/i.test(question) || /\bunion\s+select\b/i.test(question);
  }

  private isSensitiveDataIntent(question: string) {
    return /手机号|电话|密码|token|secret|openid|证件|身份证|地址|住址|union\s+select\s+password/i.test(question);
  }

  private isCrossStoreBypassIntent(question: string) {
    return /其他门店|别的门店|全部门店|所有门店|跨门店|不限门店|绕过门店/.test(question);
  }

  private isExcessiveRangeIntent(question: string) {
    return /最近\s*(?:10|十)\s*年|近\s*(?:10|十)\s*年|过去\s*(?:10|十)\s*年|所有历史|全部历史|不限时间/.test(question);
  }

  private isAdmin(request: AgentV2TextToSqlRequest) {
    return request.permissions.includes('*') || request.permissions.includes('core:agent-governance:view') || request.roleCodes.includes('super_admin');
  }
}
