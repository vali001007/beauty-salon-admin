import { Injectable } from '@nestjs/common';

export type BrainRuntimeQuestionIntent =
  | 'scalar_metric'
  | 'comparison'
  | 'ranking'
  | 'list'
  | 'draft'
  | 'action'
  | 'recommendation'
  | 'diagnosis'
  | 'unknown';

export type BrainRuntimeAnswerShape = 'scalar_metric' | 'comparison' | 'ranking' | 'list' | 'non_metric' | 'unknown';

export interface BrainQuestionIntentResult {
  intent: BrainRuntimeQuestionIntent;
  expectedShape: BrainRuntimeAnswerShape;
  allowsScalarMetric: boolean;
  expectedMetric?: string;
  reason: string;
  unsupportedAnswer?: string;
}

@Injectable()
export class BrainQuestionIntentService {
  classify(question: string): BrainQuestionIntentResult {
    const text = question.trim().toLowerCase();
    const nonMetricIntent = this.detectNonMetricIntent(text);
    if (nonMetricIntent) return nonMetricIntent;

    const metricIntent = this.detectStructuredMetricIntent(text);
    if (metricIntent) return metricIntent;

    const directScalarMetric = this.detectDirectScalarMetric(text);
    if (directScalarMetric) {
      return {
        intent: 'scalar_metric',
        expectedShape: 'scalar_metric',
        allowsScalarMetric: true,
        expectedMetric: directScalarMetric,
        reason: 'direct_scalar_metric_question',
      };
    }

    return {
      intent: 'unknown',
      expectedShape: 'unknown',
      allowsScalarMetric: false,
      reason: 'no_supported_question_intent_detected',
      unsupportedAnswer:
        '当前独立版 Ami Brain 已接入门店经营指标问答。请提问预约数、实收流水、复购率、毛利、会员卡负债、库存预警等已注册指标。',
    };
  }

  private detectNonMetricIntent(text: string): BrainQuestionIntentResult | undefined {
    if (/(写|生成|编辑|拟一|拟个|文案|话术|短信|消息|通知|朋友圈|小红书)/.test(text)) {
      return {
        intent: 'draft',
        expectedShape: 'non_metric',
        allowsScalarMetric: false,
        reason: 'draft_request_before_metric_keyword',
        unsupportedAnswer: '当前独立版 Ami Brain 尚未接入文案生成技能，不会用预约数、流水等指标替代文案回答。',
      };
    }
    if (/(新建|创建|下单|开单|改约|改期|取消|发券|发送|导出|调整|保存|确认|执行|帮我约|打开|提醒)/.test(text)) {
      return {
        intent: 'action',
        expectedShape: 'non_metric',
        allowsScalarMetric: false,
        reason: 'action_request_before_metric_keyword',
        unsupportedAnswer: '当前独立版 Ami Brain 尚未接入操作执行技能，不会绕过确认流程直接执行动作。',
      };
    }
    if (/(现在几点|几点了|当前时间)/.test(text)) {
      return {
        intent: 'unknown',
        expectedShape: 'unknown',
        allowsScalarMetric: false,
        reason: 'clock_time_not_supported',
        unsupportedAnswer: '当前独立版 Ami Brain 尚未接入实时时钟与排班联合查询，不会只返回预约数替代回答。',
      };
    }
    if (/(哪天.*(最忙|空档|空余)|空档|空余|空位|临时来了|安排吗|特别准备|vip|物品|面部|身体|找不到记录)/.test(text)) {
      return {
        intent: 'list',
        expectedShape: 'list',
        allowsScalarMetric: false,
        reason: 'appointment_schedule_detail_requires_list_shape',
        unsupportedAnswer: '预约空档、项目分类、VIP 准备和临时安排尚未接入真实列表口径，Ami Brain 不会用预约总数替代回答。',
      };
    }
    if (/(收款记录|核对|第一笔|完整流水|不正常|私自收款|服务记录|对不上|现金收入.*核对)/.test(text)) {
      return {
        intent: 'diagnosis',
        expectedShape: 'non_metric',
        allowsScalarMetric: false,
        reason: 'finance_reconciliation_requires_detail_or_diagnosis',
        unsupportedAnswer: '收款明细、对账和财务异常诊断尚未接入真实口径，Ami Brain 不会用总流水替代回答。',
      };
    }
    if (/^(我|我的|我今天|我这个月|我这周|我在店里|我还需要).*(业绩|复购率|排名|空档|排班|目标|收入|做了|客人)/.test(text)) {
      return {
        intent: 'unknown',
        expectedShape: 'unknown',
        allowsScalarMetric: false,
        reason: 'personal_staff_scope_not_supported',
        unsupportedAnswer: '个人员工视角尚未接入身份绑定和目标口径，Ami Brain 不会用全店指标替代回答。',
      };
    }
    if (/(库存整体|整体情况|还有多少|低于安全库存|安全库存|补水系列|门店和仓库|已经过期|还在用|损耗|退换货|提醒.*规则)/.test(text)) {
      return {
        intent: 'list',
        expectedShape: 'list',
        allowsScalarMetric: false,
        reason: 'inventory_detail_or_workflow_not_supported',
        unsupportedAnswer: '库存明细、门店/仓库合计、安全库存和处置流程尚未接入真实口径，Ami Brain 不会用临期库存金额替代回答。',
      };
    }
    if (/(库存金额|库存.*金额|周转率|库存周转|周转怎么样)/.test(text) && !/(临期库存金额|过期库存金额|库存预警金额)/.test(text)) {
      return {
        intent: 'unknown',
        expectedShape: 'unknown',
        allowsScalarMetric: false,
        reason: 'inventory_value_or_turnover_not_registered',
        unsupportedAnswer: '库存金额和周转率尚未接入真实口径，Ami Brain 不会用临期库存金额替代回答。',
      };
    }
    if (/(活动).*(花了多少钱|带来.*收入|成本|roi|投产|投入产出)/i.test(text)) {
      return {
        intent: 'unknown',
        expectedShape: 'unknown',
        allowsScalarMetric: false,
        reason: 'marketing_activity_cost_and_attribution_not_registered',
        unsupportedAnswer: '活动成本和归因收入尚未接入真实口径，Ami Brain 不会用全店流水替代回答。',
      };
    }
    if (
      (/(快过期|临期).*(数量|几个|多少)|缺货.*(最紧急|是什么|哪些|哪个|排行|排名)/.test(text) &&
        !/(临期库存金额|过期库存金额|库存预警金额)/.test(text))
    ) {
      return {
        intent: 'list',
        expectedShape: 'list',
        allowsScalarMetric: false,
        reason: 'inventory_detail_or_priority_requires_list_shape',
        unsupportedAnswer: '库存明细、数量和优先级尚未接入真实列表口径，Ami Brain 不会用总数或金额替代回答。',
      };
    }
    if (/(爽约率|爽约|没到|没来|未到|超时服务|影响.*预约|成本.*上涨|上涨.*毛利|影响毛利|高不高)/.test(text)) {
      return {
        intent: 'diagnosis',
        expectedShape: 'non_metric',
        allowsScalarMetric: false,
        reason: 'risk_or_exception_requires_diagnosis',
        unsupportedAnswer: '爽约、超时、成本异常等风险诊断尚未接入真实口径，Ami Brain 不会用单个指标替代回答。',
      };
    }
    if (/(怎么|如何|方案|设计|策划|促销|推广|活动主题|活动方案|合适|比较好|愿意|能不能|自动|处理|打.*折|如果|模拟|还剩|需要|入手|提升)/.test(text)) {
      return {
        intent: 'recommendation',
        expectedShape: 'non_metric',
        allowsScalarMetric: false,
        reason: 'advice_or_simulation_requires_skill',
        unsupportedAnswer: '该问题需要方案、建议或模拟计算技能，当前独立版 Ami Brain 不会用单个指标替代回答。',
      };
    }
    if (/(画像|年龄段|客群|客户结构|客户画像)/.test(text)) {
      return {
        intent: 'diagnosis',
        expectedShape: 'non_metric',
        allowsScalarMetric: false,
        reason: 'customer_profile_requires_profile_analysis',
        unsupportedAnswer: '客户画像分析尚未接入真实口径，Ami Brain 不会用到店数或预约数替代回答。',
      };
    }
    if (
      /((查|找|搜|看).*(客人|客户|预约))|(所有.*预约.*列)|(预约.*(是谁|几点|什么项目|做什么))|(这个客人|这个客户|张美丽)/.test(
        text,
      )
    ) {
      return {
        intent: 'list',
        expectedShape: 'list',
        allowsScalarMetric: false,
        reason: 'detail_lookup_requires_list_shape',
        unsupportedAnswer: '客户或预约明细查询尚未接入真实列表口径，Ami Brain 不会用总数替代回答。',
      };
    }
    if (/(储值卡|储值|次卡|会员卡).*(消耗|充值|新充值|使用|核销|销售|收款|退款)/.test(text)) {
      return {
        intent: 'unknown',
        expectedShape: 'unknown',
        allowsScalarMetric: false,
        reason: 'prepaid_card_flow_metric_not_registered',
        unsupportedAnswer: '储值卡消耗和充值流水尚未接入真实口径，Ami Brain 不会用会员卡负债替代回答。',
      };
    }
    if (/(下滑|下降|异常|波动).*(业绩|收入|流水)|((业绩|收入|流水).*(下滑|下降|异常|波动))/.test(text)) {
      return {
        intent: 'diagnosis',
        expectedShape: 'non_metric',
        allowsScalarMetric: false,
        reason: 'performance_decline_requires_diagnosis',
        unsupportedAnswer: '员工业绩下滑诊断尚未接入真实口径，Ami Brain 不会用单期流水替代回答。',
      };
    }
    if (/(排班|空档|空余|在忙|空着)/.test(text) && /(美容师|员工|技师|床位|时段|各|我)/.test(text)) {
      return {
        intent: 'list',
        expectedShape: 'list',
        allowsScalarMetric: false,
        reason: 'staff_schedule_requires_schedule_list',
        unsupportedAnswer: '美容师排班和空档明细尚未接入真实口径，Ami Brain 不会用预约总数替代回答。',
      };
    }
    if (/(推荐|建议|适合|下次做|该做|预约哪个项目|搭配什么)/.test(text)) {
      return {
        intent: 'recommendation',
        expectedShape: 'non_metric',
        allowsScalarMetric: false,
        reason: 'recommendation_request_before_metric_keyword',
        unsupportedAnswer: '当前独立版 Ami Brain 尚未接入项目/商品推荐技能，不会用预约数等指标替代推荐结果。',
      };
    }
    if (/(为什么|原因|诊断|分析一下|异常|怎么回事)/.test(text)) {
      return {
        intent: 'diagnosis',
        expectedShape: 'non_metric',
        allowsScalarMetric: false,
        reason: 'diagnosis_requires_analysis_skill',
        unsupportedAnswer: '当前独立版 Ami Brain 尚未接入经营诊断技能，不会用单个指标替代原因分析。',
      };
    }

    return undefined;
  }

  private detectDirectScalarMetric(text: string): string | undefined {
    if (/(产品销售额|项目收入|每个项目|各项目|项目.*占比|占总收入|占比|比例|净利润|盈亏|退款损失|成本利润|分析报告|耗材成本)/.test(text)) {
      return undefined;
    }
    if (/(预约数|预约量|预约.*多少|多少.*预约|有[几多少]+个预约|几个预约)/.test(text)) {
      return 'appointment_count';
    }
    if (
      /(实收流水|流水.*(多少|是多少)|收入.*(多少|是多少)|业绩.*(多少|是多少)|收款.*(多少|是多少)|营收.*(多少|是多少)|营业额.*(多少|是多少)|收了多少钱)/.test(
        text,
      )
    ) {
      return 'paid_revenue';
    }
    if (/(复购率.*(多少|是多少)|复购.*(多少|是多少))/.test(text)) {
      return 'repurchase_rate';
    }
    if (/毛利率.*(多少|是多少)/.test(text)) {
      return 'gross_margin_rate';
    }
    if (/(毛利额.*(多少|是多少)|毛利.*(多少|是多少))/.test(text)) {
      return 'gross_margin';
    }
    if (/((次卡|储值|会员卡|卡项).*(负债|余额|剩余).*(多少|是多少))|((次卡|储值|会员卡|卡项)负债)/.test(text)) {
      return 'card_liability';
    }
    if (/(临期库存金额|过期库存金额|库存预警金额).*(多少|是多少)?/.test(text)) {
      return 'expiring_stock_value';
    }

    return undefined;
  }

  private detectStructuredMetricIntent(text: string): BrainQuestionIntentResult | undefined {
    if (/(同比|环比|对比|比上|比下|跟.*比|和.*比|相比|差多少|去年同期)/.test(text)) {
      return {
        intent: 'comparison',
        expectedShape: 'comparison',
        allowsScalarMetric: false,
        expectedMetric: this.detectExpectedMetric(text),
        reason: 'comparison_question_requires_comparison_shape',
        unsupportedAnswer: '这个问题需要对比口径。当前独立版 Ami Brain 尚未接入对比计算，不会返回单期或全量数值。',
      };
    }
    if (/(排行|排名|top|前\d|前十|谁.*(最好|最高|最多|最低|最差)|最高|最多|最好|最低|最差)/i.test(text)) {
      return {
        intent: 'ranking',
        expectedShape: 'ranking',
        allowsScalarMetric: false,
        expectedMetric: this.detectExpectedMetric(text),
        reason: 'ranking_question_requires_grouped_shape',
        unsupportedAnswer: '这个问题需要分组排行口径。当前独立版 Ami Brain 不会用全店单值替代排行结果。',
      };
    }
    if (/(哪些|哪几个|名单|列出|明细|客户.*(用了|没用|消费|没来)|有没有.*客户)/.test(text)) {
      return {
        intent: 'list',
        expectedShape: 'list',
        allowsScalarMetric: false,
        expectedMetric: this.detectExpectedMetric(text),
        reason: 'list_question_requires_detail_shape',
        unsupportedAnswer: '这个问题需要名单或明细口径。当前独立版 Ami Brain 不会用全店单值替代客户/项目列表。',
      };
    }

    return undefined;
  }

  private detectExpectedMetric(text: string): string | undefined {
    if (/(预约|到店|空档|排班)/.test(text)) return 'appointment_count';
    if (/(次卡|储值|负债|会员卡|剩余次数|卡项余额)/.test(text)) return 'card_liability';
    if (/(收入|流水|业绩|实收|营收|收款|销售额|消费了钱|营业额|收了多少钱)/.test(text)) return 'paid_revenue';
    if (/(复购|回购|再次消费)/.test(text)) return 'repurchase_rate';
    if (/毛利率/.test(text)) return 'gross_margin_rate';
    if (/(毛利|利润)/.test(text)) return 'gross_margin';
    if (/(缺货|库存|临期|过期|库存预警)/.test(text)) return 'expiring_stock_value';
    if (/(roi|投产|活动效果|营销效果)/i.test(text)) return 'marketing_roi';
    if (/(流失|沉睡|召回)/.test(text)) return 'churn_risk_count';
    return undefined;
  }
}
