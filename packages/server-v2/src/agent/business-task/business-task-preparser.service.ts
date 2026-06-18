import { Injectable } from '@nestjs/common';
import type {
  BusinessEntityRef,
  BusinessTask,
  BusinessTaskDomain,
  BusinessTaskPreparseResult,
  BusinessTaskType,
  BusinessTimeRange,
} from './business-task.types.js';
import type { AgentRole } from '../agent.types.js';

const CHINESE_NUMBERS: Record<string, number> = {
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

@Injectable()
export class BusinessTaskPreParserService {
  parse(input: { message: string; role?: AgentRole; context?: Record<string, unknown> } | string): BusinessTaskPreparseResult {
    const message = typeof input === 'string' ? input : input.message;
    const role = typeof input === 'string' ? undefined : input.role;
    const text = this.normalize(message);
    const limit = this.extractLimit(text);
    const timeRange = this.extractTimeRange(text);
    const domain = this.detectDomain(text);
    const taskType = this.detectTaskType(text);
    const metrics = this.detectMetrics(text, domain, taskType);
    const entities = this.extractEntities(text, domain);
    const requiresApproval = taskType === 'draft' || taskType === 'workflow';
    const outputMode = requiresApproval
      ? taskType === 'workflow'
        ? 'workflow'
        : 'draft'
      : (taskType === 'recommendation' || taskType === 'ranking') && (limit || /名单|列表|排行|排名|前|top/.test(text))
        ? 'ranked_list'
        : taskType === 'query'
          ? 'card'
          : 'summary';
    const missingSlots: string[] = [];

    if (domain === 'unknown') missingSlots.push('domain');
    if (taskType === 'clarify') missingSlots.push('taskType');
    if ((taskType === 'ranking' || taskType === 'recommendation') && !limit) missingSlots.push('limit');

    const task: BusinessTask = {
      taskType,
      domain,
      objective: message.trim(),
      entities,
      metrics,
      filters: this.detectFilters(text),
      timeRange,
      sort: this.detectSort(text, metrics),
      limit,
      outputMode,
      riskLevel: requiresApproval ? 'medium' : 'low',
      requiresApproval,
      missingSlots,
      confidence: this.scoreConfidence({ domain, taskType, limit, timeRange, metrics }),
      actorRole: role,
    };

    return {
      task,
      deterministicSlots: {
        domainMatched: domain !== 'unknown',
        taskTypeMatched: taskType !== 'clarify',
        limitMatched: Boolean(limit),
        timeRangeMatched: Boolean(timeRange),
        metricMatched: metrics.length > 0,
      },
      warnings: this.buildWarnings(task),
    };
  }

  private normalize(value: string) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
  }

  private extractLimit(text: string) {
    const topMatch = text.match(/(?:top|前)(\d{1,2})/i);
    if (topMatch) return this.clampLimit(Number(topMatch[1]));

    const numberMatch = text.match(/(\d{1,2})(?:个|位|条|名|款|项|件|种)/);
    if (numberMatch) return this.clampLimit(Number(numberMatch[1]));

    const chineseMatch = text.match(/([一二两三四五六七八九十]{1,3})(?:个|位|条|名|款|项|件|种)/);
    if (chineseMatch) return this.clampLimit(this.parseChineseNumber(chineseMatch[1]));

    if (/几个|一批|一组/.test(text)) return 10;
    return undefined;
  }

  private parseChineseNumber(value: string) {
    if (value === '十') return 10;
    if (value.startsWith('十')) return 10 + (CHINESE_NUMBERS[value.slice(1)] ?? 0);
    if (value.includes('十')) {
      const [tens, ones] = value.split('十');
      return (CHINESE_NUMBERS[tens] ?? 1) * 10 + (CHINESE_NUMBERS[ones] ?? 0);
    }
    return CHINESE_NUMBERS[value] ?? 0;
  }

  private clampLimit(value: number) {
    if (!Number.isFinite(value) || value <= 0) return undefined;
    return Math.min(Math.max(Math.trunc(value), 1), 50);
  }

  private extractTimeRange(text: string): BusinessTimeRange | undefined {
    if (/今天|今日|today/.test(text)) return { preset: 'today', label: '今天' };
    if (/昨天|昨日/.test(text)) return { preset: 'yesterday', label: '昨天' };
    if (/本周|这周|本星期|这星期/.test(text)) return { preset: 'this_week', label: '本周' };
    if (/下周|下星期/.test(text)) return { preset: 'next_week', label: '下周' };
    if (/本月|这个月|当月/.test(text)) return { preset: 'this_month', label: '本月' };
    if (/近7天|最近7天|近七天|最近七天|近一周|最近一周/.test(text)) return { preset: 'last_7_days', label: '近7天' };
    if (/近30天|最近30天|近三十天|最近三十天|近一个月|最近一个月/.test(text)) return { preset: 'last_30_days', label: '近30天' };
    if (/下30天|未来30天|接下来30天/.test(text)) return { preset: 'next_30_days', label: '未来30天' };
    const dateMatch = text.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
    if (dateMatch) {
      const date = `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`;
      return { preset: 'custom', startDate: date, endDate: date, label: date };
    }
    return undefined;
  }

  private detectDomain(text: string): BusinessTaskDomain {
    const hasStaffSubject = /员工|店员|顾问|美容师|人员/.test(text);
    const hasStaffPerformanceIntent = /表现|业绩|绩效|提成|服务质量|服务好|服务满意|服务次数|成交|销售|优秀|较好|最好|最多|最少|排行|排名|完成|贡献/.test(text);
    if (/我的.*(表现|业绩|绩效|提成|服务质量|服务|成交|销售|完成|贡献|复购)|我.*(表现|业绩|绩效|提成|服务质量|服务|成交|销售|完成|贡献|复购)/.test(text)) return 'staff';
    if (hasStaffSubject && hasStaffPerformanceIntent) return 'staff';
    if (/售后|退款|退费|退单|退货|投诉|纠纷/.test(text)) return 'afterSales';
    if (/供应商|供货|采购|入库|到货|交期|起订|供应链|结算供应商/.test(text)) return 'supplyChain';
    if (/自动化|自动触达|自动提醒|触达任务|自动任务|策略执行/.test(text)) return 'automation';
    if (/小程序|ami glow|客户端|会员端|绑定|openid|渠道来源/.test(text)) return /渠道|来源/.test(text) ? 'channel' : 'customerApp';
    if (/优惠券|权益|券|满减|满赠|折扣|促销|优惠码|活动权益/.test(text)) return 'promotion';
    if (/渠道|来源|投放|引流|转化路径/.test(text)) return 'channel';
    if (/营销|活动|推广|推广页|线索|归因|投放/.test(text)) return 'marketing';
    if (/终端|设备|平板|收银机|打印机|扫码器|摄像头|会话|对话失败|问答失败|高频问题/.test(text)) return 'terminal';
    if (/服务质量|服务评价|满意|客户满意|护理效果|护理记录|服务记录|服务任务|护理完成|服务完成|服务记录质量/.test(text)) return 'serviceQuality';
    if (/门店|多店|分店|店铺/.test(text)) return 'store';
    if (/(项目|护理|服务|疗程).*(毛利|耗材|成本|利润)|(毛利|耗材|成本|利润).*(项目|护理|服务|疗程)/.test(text)) return 'project';
    if (/(商品|产品|品项|sku).*(毛利|成本|利润)|(毛利|成本|利润).*(商品|产品|品项|sku)/.test(text)) return 'product';
    if (/会员卡|储值卡|余额|充值/.test(text)) return 'memberCard';
    if (/次卡|卡项|疗程卡|核销|剩余次数|到期卡/.test(text)) return 'card';
    if (/财务|现金流|毛利|成本|利润|盈利|亏损|净收入|实收|净额/.test(text)) return 'finance';
    if (/库存|补货|临期|缺货|耗材|批次|周转/.test(text)) return 'inventory';
    if (/客户|顾客|会员|老客|新客|沉睡|流失|高价值|复购|回访|邀约|唤醒/.test(text)) return 'customer';
    if (/商品|产品|品项|sku/.test(text)) return 'product';
    if (/项目|护理|服务|疗程/.test(text)) return 'project';
    if (/收入|营收|营业额|流水|业绩/.test(text)) return 'business';
    if (/预约|到店|爽约|改约/.test(text)) return 'reservation';
    if (/排班|班表|人手|请假|忙碌|美容师/.test(text)) return 'schedule';
    if (/订单|收银|开单|流水|消费|成交|客单价|支付方式/.test(text)) return 'order';
    if (/营销|活动|触达|转化|推广|推广页|线索/.test(text)) return 'marketing';
    if (/员工|店员|顾问|绩效|提成/.test(text)) return 'staff';
    if (/经营|收入|营收|营业额|业绩/.test(text)) return 'business';
    return 'unknown';
  }

  private detectTaskType(text: string): BusinessTaskType {
    if (/发布|上线|群发|发送|自动发|扣款|收款|直接退款|发起退款|确认退款|退款给|直接核销|帮.*核销|确认核销|核销次卡|划扣|确认收银|改排班|删除|下发/.test(text)) {
      return 'workflow';
    }
    if (/生成.*草稿|草稿|创建.*任务|生成.*任务|生成活动|创建活动|生成补货|创建补货|生成采购|创建采购/.test(text)) {
      return 'draft';
    }
    if (/为什么|原因|归因|怎么会|为何|异常|下降|诊断|复盘|影响|冲突|风险高|不稳定|慢/.test(text)) return 'diagnosis';
    if (/排行|排名|前\d+|top\d+|最多|最少|最高|最低|最快|最慢|最好|最差|较好|优秀|表现好|做得好|业绩好|服务好|成交高|销售高|销量好|销售好|卖得好|卖的好/.test(text)) return 'ranking';
    if (/可能|预计|预测|风险|预警|下周|未来/.test(text)) return 'forecast';
    if (/最值得|优先|重点|建议|适合|可以推|机会|推荐|怎么做|跟进|回访|邀约|唤醒/.test(text)) return 'recommendation';
    if (/查|查询|看|看看|分析|统计|多少|怎么样|情况|趋势|增长|不足|到期|空闲|忙碌|请假|占用率|缺口|时段|哪些|哪个|哪家|哪位|谁|效果|使用率|触达率|完成率|转化率|领取率|核销率|绑定率|退款率|毛利率|业绩|提成|表现|对比|问题|分类|质量|满意|链路|访问|浏览|活跃|成交|转化|领取|高吗|低吗|完成好/.test(text)) return 'query';
    return 'clarify';
  }

  private detectMetrics(text: string, domain: BusinessTaskDomain, taskType: BusinessTaskType) {
    const metrics = new Set<string>();
    if (domain === 'customer' && (taskType === 'recommendation' || /跟进|回访|邀约|最值得|优先/.test(text))) {
      metrics.add('follow_up_priority_score');
    }
    if (domain === 'customer' && /机会|最高|重点|名单|优先|跟进|回访|邀约|唤醒/.test(text)) metrics.add('follow_up_priority_score');
    if (/流失|沉睡/.test(text)) metrics.add('churn_risk_score');
    if (/复购/.test(text)) metrics.add('repurchase_opportunity_score');
    if (/ltv|累计价值|高价值/.test(text)) metrics.add('ltv');
    if (/rfm|活跃价值|活跃度/.test(text)) metrics.add('rfm_score');
    if (/销量|销售|增长|卖得|卖/.test(text) && domain === 'product') metrics.add('product_sales_growth');
    if (domain === 'product' && /销售额|收入|成交额/.test(text)) metrics.add('product_sales_amount');
    if (domain === 'product' && /毛利|利润/.test(text)) metrics.add('product_gross_margin');
    if (domain === 'product' && /卖不动|滞销|动销|清一清/.test(text)) metrics.add('slow_moving_days');
    if (domain === 'product' && /活动|营销|促销|适合|推荐|搭售/.test(text)) metrics.add('promotion_fit_score');
    if (/服务次数|服务|项目|护理|疗程|增长|最多|最热|趋势/.test(text) && domain === 'project') metrics.add('project_service_growth');
    if (domain === 'project' && /服务次数|服务|项目|护理|疗程/.test(text)) metrics.add('project_service_count');
    if (domain === 'project' && /毛利|利润/.test(text)) metrics.add('project_gross_margin');
    if ((domain === 'project' || domain === 'serviceQuality') && /完成|服务质量|满意|评价|服务记录/.test(text)) metrics.add('service_completion_rate');
    if (domain === 'project' && /适合|推荐|敏感肌|肤况|护理建议/.test(text)) metrics.add('care_fit_score');
    if (domain === 'card' && /到期|过期|剩余|余次|次数|风险|预警/.test(text)) metrics.add('card_expiry_risk');
    if (domain === 'card' && /核销|消耗|使用|划扣|次数|最多|排行|排名/.test(text)) metrics.add('card_usage_times');
    if (domain === 'card' && /核销率|使用率/.test(text)) metrics.add('card_writeoff_rate');
    if (domain === 'memberCard' && /余额|储值|沉淀|充值|消费|划扣|会员卡/.test(text)) metrics.add('member_balance');
    if (domain === 'memberCard' && /沉睡|未消费|沉淀/.test(text)) metrics.add('balance_inactive_days');
    if (/收入|营收|营业额|流水|业绩/.test(text)) metrics.add('revenue');
    if (/净收入|实收|净额/.test(text)) metrics.add('net_revenue');
    if (/客单价/.test(text)) metrics.add('average_order_value');
    if (/异常/.test(text)) metrics.add('business_anomaly_count');
    if (domain === 'finance' && /毛利|利润|盈利|亏损/.test(text)) metrics.add('gross_margin');
    if (domain === 'finance' && /成本|耗材/.test(text)) metrics.add('material_cost');
    if (domain === 'finance' && /提成/.test(text)) metrics.add('commission_cost');
    if (domain === 'finance' && /现金流|实收|收款|净额|净收入/.test(text)) metrics.add('net_revenue');
    if (/库存|补货|缺货|临期|不够|风险|预警/.test(text)) metrics.add('stock_risk_score');
    if (domain === 'inventory' && /周转/.test(text)) metrics.add('stock_turnover_days');
    if (domain === 'inventory' && /批次|临期|过期/.test(text)) metrics.add('batch_expiry_risk');
    if (/预约|到店|爽约/.test(text)) metrics.add('reservation_count');
    if (/到店|爽约|未到/.test(text)) metrics.add('arrival_rate');
    if (/未到|爽约/.test(text)) metrics.add('reservation_no_show_rate');
    if (/确认/.test(text) && domain === 'reservation') metrics.add('reservation_confirm_rate');
    if (/排班|班表|人手|请假|忙碌|空闲|美容师|占用率|缺口|时段/.test(text)) metrics.add('schedule_utilization_rate');
    if (domain === 'schedule' && /空闲|空位/.test(text)) metrics.add('staff_idle_hours');
    if (domain === 'schedule' && /技能|匹配/.test(text)) metrics.add('skill_match_rate');
    if (domain === 'staff' && /表现|业绩|绩效|提成|服务质量|服务|成交|销售|完成|贡献|优秀|较好|排行|排名/.test(text)) {
      metrics.add('staff_performance_score');
    }
    if (domain === 'staff' && /收入|业绩|销售|成交/.test(text)) metrics.add('staff_service_revenue');
    if (domain === 'staff' && /提成/.test(text)) metrics.add('staff_commission_amount');
    if (domain === 'staff' && /复购/.test(text)) metrics.add('staff_customer_repurchase_rate');
    if ((domain === 'order' || domain === 'afterSales') && /退款|退费|售后|退单/.test(text)) {
      metrics.add('refund_amount');
      metrics.add('refund_rate');
    }
    if (domain === 'order' && /支付方式|微信|支付宝|现金|储值/.test(text)) metrics.add('payment_method_ratio');
    if (domain === 'supplyChain' && /交期|到货|供货|周期|慢/.test(text)) metrics.add('supplier_delivery_cycle');
    if (domain === 'supplyChain' && /结算|应付|账款/.test(text)) metrics.add('supplier_settlement_amount');
    if (domain === 'supplyChain' && /采购|补货|供应商/.test(text)) metrics.add('supplier_purchase_score');
    if (domain === 'supplyChain' && !metrics.size) metrics.add('supplier_delivery_cycle');
    if (domain === 'marketing' && /转化|效果|漏斗|线索|活动/.test(text)) metrics.add('campaign_conversion_rate');
    if (domain === 'marketing' && /收入|成交|roi|归因/.test(text)) metrics.add('campaign_revenue');
    if (domain === 'promotion' && /领取|核销|使用|权益|券/.test(text)) metrics.add('promotion_claim_rate');
    if (domain === 'promotion' && /效果|转化|成交/.test(text)) metrics.add('campaign_conversion_rate');
    if (domain === 'promotion' && !metrics.size) metrics.add('promotion_claim_rate');
    if (domain === 'automation' && /触达|成功|执行|自动化/.test(text)) metrics.add('automation_touch_success_rate');
    if (domain === 'automation' && !metrics.size) metrics.add('automation_touch_success_rate');
    if ((domain === 'customerApp' || domain === 'channel') && /访问|活跃|打开|浏览/.test(text)) metrics.add('customer_app_active_count');
    if ((domain === 'customerApp' || domain === 'channel') && /绑定/.test(text)) metrics.add('customer_app_bind_rate');
    if ((domain === 'customerApp' || domain === 'channel') && /预约|成交|线索|转化|链路|权益|领取|带来/.test(text)) {
      metrics.add('customer_app_active_count');
      metrics.add('channel_conversion_rate');
    }
    if (domain === 'channel' && /转化|带来|成交|预约/.test(text)) metrics.add('channel_conversion_rate');
    if ((domain === 'customerApp' || domain === 'channel') && !metrics.size) metrics.add(domain === 'channel' ? 'channel_conversion_rate' : 'customer_app_active_count');
    if (domain === 'terminal' && /失败|异常|离线|设备|终端/.test(text)) metrics.add('terminal_failure_rate');
    if (domain === 'terminal' && /高频|问得多|对话|会话/.test(text)) metrics.add('terminal_conversation_count');
    if (domain === 'terminal' && !metrics.size) metrics.add('terminal_failure_rate');
    if (domain === 'store' && /排名|排行|对比|表现/.test(text)) metrics.add('store_rank_score');
    if (domain === 'store' && !metrics.size) metrics.add('store_rank_score');
    if (domain === 'serviceQuality' && !metrics.size) metrics.add('service_completion_rate');
    if (domain === 'finance' && !metrics.size) metrics.add('gross_margin');
    if (/毛利|利润/.test(text)) metrics.add('gross_margin');
    return Array.from(metrics);
  }

  private extractEntities(text: string, domain: BusinessTaskDomain): BusinessEntityRef[] {
    const entities: BusinessEntityRef[] = [];
    const segmentMap: Array<[RegExp, string]> = [
      [/老客/, '老客'],
      [/新客/, '新客'],
      [/沉睡/, '沉睡客户'],
      [/流失/, '流失风险客户'],
      [/高价值|vip/, '高价值客户'],
      [/会员/, '会员'],
    ];
    for (const [pattern, value] of segmentMap) {
      if (pattern.test(text)) entities.push({ type: 'customer_segment', value, confidence: 0.88 });
    }
    if (domain !== 'unknown') entities.push({ type: domain, value: domain, confidence: 0.72 });
    return entities;
  }

  private detectFilters(text: string): Record<string, unknown> {
    const filters: Record<string, unknown> = {};
    if (/老客/.test(text)) filters.customerSegment = 'existing';
    if (/新客/.test(text)) filters.customerSegment = 'new';
    if (/沉睡/.test(text)) filters.customerSegment = 'dormant';
    if (/流失/.test(text)) filters.customerSegment = 'churn_risk';
    if (/高价值|vip/.test(text)) filters.customerSegment = 'high_value';
    if (/本人|我的/.test(text)) filters.scope = 'self';
    if (/小程序|ami glow|客户端|会员端/.test(text)) filters.channel = 'customer_app';
    if (/微信/.test(text)) filters.channel = 'wechat';
    if (/售后|退款|退费/.test(text)) filters.afterSales = true;
    return filters;
  }

  private detectSort(text: string, metrics: string[]) {
    if (!metrics.length) return undefined;
    if (/最低|最少|最慢/.test(text)) return [{ field: metrics[0], direction: 'asc' as const }];
    if (/排行|排名|前|top|最多|最高|最快|最值得|优先|重点/.test(text)) {
      return [{ field: metrics[0], direction: 'desc' as const }];
    }
    return undefined;
  }

  private scoreConfidence(input: {
    domain: BusinessTaskDomain;
    taskType: BusinessTaskType;
    limit?: number;
    timeRange?: BusinessTimeRange;
    metrics: string[];
  }) {
    let score = 0.35;
    if (input.domain !== 'unknown') score += 0.2;
    if (input.taskType !== 'clarify') score += 0.2;
    if (input.metrics.length) score += 0.15;
    if (input.limit) score += 0.05;
    if (input.timeRange) score += 0.05;
    return Math.min(0.95, Number(score.toFixed(2)));
  }

  private buildWarnings(task: BusinessTask) {
    const warnings: string[] = [];
    if (task.domain === 'unknown') warnings.push('未识别明确业务领域');
    if (task.taskType === 'clarify') warnings.push('未识别明确任务类型');
    if (task.missingSlots.includes('limit')) warnings.push('推荐或排行任务未明确数量，执行层需使用默认 limit');
    return warnings;
  }
}
