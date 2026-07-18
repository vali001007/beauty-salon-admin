import { Injectable } from '@nestjs/common';
import type { BrainQuestionIntentResult } from '../cognition/brain-question-intent.service.js';
import type {
  BrainDomainAdapterKey,
  BrainDomainGrounding,
  BrainDomainRole,
  BrainRoleIntentPlan,
} from './brain-domain-adapter.types.js';

interface BrainRoleIntentRouteInput {
  message: string;
  roleHint?: string;
  runtimeIntent: BrainQuestionIntentResult;
}

const DOMAIN_PERMISSIONS: Record<BrainDomainAdapterKey, string[]> = {
  store_manager: ['core:dashboard:view'],
  front_desk: ['core:store:reservations'],
  marketing_growth: ['core:marketing:create'],
  beautician_service: ['core:brain:beautician-view'],
  inventory_procurement: ['core:inventory:stock'],
  finance_risk: ['core:finance:view'],
  customer_service: ['core:customer:view'],
};

@Injectable()
export class BrainRoleIntentRouterService {
  route(input: BrainRoleIntentRouteInput): BrainRoleIntentPlan {
    const text = input.message.trim().toLowerCase();
    const runtime = input.runtimeIntent;
    if (runtime.allowsScalarMetric && runtime.expectedMetric) {
      return this.semanticMetricPlan(input, runtime.expectedMetric);
    }
    if ((runtime.intent === 'comparison' || runtime.intent === 'ranking') && runtime.expectedMetric) {
      return this.semanticMetricPlan(input, runtime.expectedMetric);
    }
    if (runtime.expectedMetric && runtime.expectedShape === 'scalar_metric') {
      return this.semanticMetricPlan(input, runtime.expectedMetric);
    }

    const customerServiceHint =
      input.roleHint === 'customer_service' &&
      (runtime.intent === 'draft' || runtime.intent === 'action' || runtime.intent === 'recommendation' || runtime.intent === 'list' || this.isCustomerService(text));
    const frontDeskCatalogHint = input.roleHint === 'receptionist' && this.isFrontDeskCatalogLookup(text);
    const frontDeskCustomerHint =
      input.roleHint === 'receptionist' &&
      this.isExactCustomerLookup(text) &&
      !this.isFrontDeskServiceAdvice(text) &&
      !frontDeskCatalogHint;
    const frontDeskOperationsHint = this.isSupportedFrontDeskOperations(text);
    const frontDeskActionHint = input.roleHint === 'receptionist' && /(打开收银|打开核销|客人要结账|客人要用次卡)/.test(text);
    const frontDeskServiceHint = input.roleHint === 'receptionist' && this.isFrontDeskServiceAdvice(text);
    const inventoryDetailHint = this.isSupportedInventoryDetail(text);
    const financeDetailHint = this.isSupportedFinanceDetail(text);
    const managerDetailHint = input.roleHint === 'store_manager' && this.isSupportedManagerDetail(text);
    const beauticianDetailHint = input.roleHint === 'beautician' && this.isSupportedBeauticianDetail(text);
    const marketingFactHint = this.isSupportedMarketingCustomerFact(text) || this.isSupportedMarketingAnalytics(text);
    const marketingAutomationHint = input.roleHint === 'marketing' && this.isSupportedMarketingAutomationPreview(text);
    const unsupportedForExplicitOtherRole =
      Boolean(
        input.roleHint &&
          input.roleHint !== 'customer_service' &&
          !frontDeskCustomerHint &&
          !frontDeskCatalogHint &&
          !frontDeskOperationsHint &&
          !frontDeskActionHint &&
          !frontDeskServiceHint &&
          !inventoryDetailHint &&
          !financeDetailHint &&
          !managerDetailHint &&
          !beauticianDetailHint &&
          !marketingFactHint &&
          !marketingAutomationHint,
      ) &&
      this.isKnownUnsupportedDomainDetail(text);
    const adapterKey = customerServiceHint
      ? 'customer_service'
      : frontDeskCatalogHint
        ? 'front_desk'
        : frontDeskCustomerHint
          ? 'front_desk'
          : frontDeskOperationsHint
            ? 'front_desk'
            : frontDeskActionHint
              ? 'front_desk'
              : frontDeskServiceHint
                ? 'front_desk'
                : inventoryDetailHint
                  ? 'inventory_procurement'
                  : financeDetailHint
                    ? 'finance_risk'
                    : managerDetailHint
                      ? 'store_manager'
                      : beauticianDetailHint
                        ? 'beautician_service'
                        : marketingFactHint
                          ? 'marketing_growth'
                          : marketingAutomationHint
                            ? 'marketing_growth'
                            : unsupportedForExplicitOtherRole
                              ? undefined
                              : this.detectAdapterKey(text);
    if (runtime.intent === 'unknown') {
      const inferred = this.inferUnknownIntentPlan(input, text, adapterKey);
      if (inferred) return inferred;
      return this.unsupportedPlan(input);
    }
    if (!adapterKey) {
      return this.unsupportedPlan(input);
    }

    return {
      role: this.roleForAdapter(adapterKey, input.roleHint),
      domain: this.domainForAdapter(adapterKey),
      intent: runtime.intent,
      answerShape: runtime.expectedShape,
      adapterKey,
      expectedMetric: runtime.expectedMetric,
      requiredPermissions: this.permissionsFor(adapterKey, runtime.intent),
      confidence: this.confidenceFor(text, input.roleHint, adapterKey),
      grounding: this.groundingFor(adapterKey, runtime.intent),
      reason: runtime.reason,
    };
  }

  private semanticMetricPlan(input: BrainRoleIntentRouteInput, expectedMetric?: string): BrainRoleIntentPlan {
    return {
      role: this.normalizeRole(input.roleHint),
      domain: 'semantic_metric',
      intent: input.runtimeIntent.intent,
      answerShape: input.runtimeIntent.expectedShape,
      expectedMetric,
      requiredPermissions: [],
      confidence: 0.9,
      grounding: 'metric_query',
      reason: input.runtimeIntent.reason,
    };
  }

  private unsupportedPlan(input: BrainRoleIntentRouteInput): BrainRoleIntentPlan {
    return {
      role: this.normalizeRole(input.roleHint),
      domain: 'semantic_metric',
      intent: input.runtimeIntent.intent,
      answerShape: input.runtimeIntent.expectedShape,
      expectedMetric: input.runtimeIntent.expectedMetric,
      requiredPermissions: [],
      confidence: 0.4,
      grounding: 'none',
      unsupportedReason: input.runtimeIntent.unsupportedAnswer ?? '当前问题尚未接入可执行 domain adapter。',
      reason: input.runtimeIntent.reason,
    };
  }

  private detectAdapterKey(text: string): BrainDomainAdapterKey | undefined {
    if (this.isCustomerService(text)) return 'customer_service';
    if (this.isKnownUnsupportedDomainDetail(text)) return undefined;
    if (/搞一下活动|搞.*活动|客户生命周期.*(?:方案|运营)/.test(text)) return 'marketing_growth';
    if (/钱的事情|财务情况/.test(text)) return 'finance_risk';
    if (/不是今天.*预约.*明天|不是.*预约.*是明天/.test(text)) return 'front_desk';
    if (this.isBroadManagerRequest(text)) return 'store_manager';
    if (/(写|生成|编辑|拟一|拟个|文案|话术|短信|消息|通知|朋友圈|小红书)/.test(text)) {
      return 'marketing_growth';
    }
    if (/(策划|活动方案|促销活动|推广|召回|沉睡|流失|客群|客户分层|触达)/.test(text)) {
      return 'marketing_growth';
    }
    if (/(改约|改期|帮我约|预约到|安排.*预约|取消.*预约|收银|结账|核销)/.test(text)) {
      return 'front_desk';
    }
    if (this.isCustomerFact(text)) return 'marketing_growth';
    if (this.isFrontDesk(text)) return 'front_desk';
    if (this.isInventory(text)) return 'inventory_procurement';
    if (this.isFinance(text)) return 'finance_risk';
    if (this.isMarketing(text)) return 'marketing_growth';
    if (this.isBeautician(text)) return 'beautician_service';
    if (this.isStoreManager(text)) return 'store_manager';
    return undefined;
  }

  private inferUnknownIntentPlan(
    input: BrainRoleIntentRouteInput,
    text: string,
    adapterKey?: BrainDomainAdapterKey,
  ): BrainRoleIntentPlan | undefined {
    const hintedRole = this.normalizeRole(input.roleHint);
    if ((adapterKey === 'front_desk' || hintedRole === 'receptionist') && this.isFrontDeskCatalogLookup(text)) {
      return this.adapterPlan(input, 'front_desk', 'list', 'list', 'front_desk_catalog_snapshot');
    }
    if ((adapterKey === 'front_desk' || hintedRole === 'receptionist') && this.isSupportedFrontDeskOperations(text)) {
      return this.adapterPlan(input, 'front_desk', 'list', 'list', 'front_desk_operations_snapshot');
    }
    if ((adapterKey === 'front_desk' || hintedRole === 'receptionist') && this.isFrontDeskServiceAdvice(text)) {
      return this.adapterPlan(input, 'front_desk', 'recommendation', 'non_metric', 'front_desk_service_advice');
    }
    if ((adapterKey === 'front_desk' || hintedRole === 'receptionist') && this.isExactCustomerLookup(text)) {
      return this.adapterPlan(input, 'front_desk', 'list', 'list', 'front_desk_exact_customer_lookup');
    }
    if (adapterKey === 'customer_service' || hintedRole === 'customer_service') {
      if (/(建|创建).*(跟进任务)|群发|发券/.test(text)) {
        return this.adapterPlan(input, 'customer_service', 'action', 'non_metric', 'customer_service_controlled_action');
      }
      if (/(名单|哪些客户|找出|生日客户|沉睡|流失|疗程快结束|好久没来)/.test(text) && !/(写|话术|消息|文案)/.test(text)) {
        return this.adapterPlan(input, 'customer_service', 'list', 'list', 'customer_service_customer_list');
      }
      return this.adapterPlan(input, 'customer_service', 'draft', 'non_metric', 'customer_service_care_script');
    }
    if ((adapterKey === 'beautician_service' || hintedRole === 'beautician') && this.isStrongBeauticianSchedule(text)) {
      return this.adapterPlan(input, 'beautician_service', 'list', 'list', 'strong_beautician_schedule_phrase');
    }
    if ((adapterKey === 'beautician_service' || hintedRole === 'beautician') && this.isStrongBeauticianAdvice(text)) {
      return this.adapterPlan(input, 'beautician_service', 'recommendation', 'non_metric', 'strong_beautician_advice_phrase');
    }
    if ((adapterKey === 'beautician_service' || hintedRole === 'beautician') && this.isSupportedBeauticianDetail(text)) {
      return this.adapterPlan(
        input,
        'beautician_service',
        /(业绩|提成|收入|时长|小时|几个客人)/.test(text) ? 'diagnosis' : 'list',
        /(业绩|提成|收入|时长|小时|几个客人)/.test(text) ? 'non_metric' : 'list',
        'beautician_personal_or_customer_facts',
      );
    }
    if ((adapterKey === 'inventory_procurement' || hintedRole === 'inventory') && this.isStrongInventoryList(text)) {
      return this.adapterPlan(input, 'inventory_procurement', 'list', 'list', 'strong_inventory_list_phrase');
    }
    if ((adapterKey === 'inventory_procurement' || hintedRole === 'inventory') && this.isSupportedInventoryDetail(text)) {
      return this.adapterPlan(input, 'inventory_procurement', 'list', 'list', 'inventory_detail_analysis');
    }
    if ((adapterKey === 'finance_risk' || hintedRole === 'finance') && this.isStrongFinanceDiagnosis(text)) {
      return this.adapterPlan(input, 'finance_risk', 'diagnosis', 'non_metric', 'strong_finance_diagnosis_phrase');
    }
    if ((adapterKey === 'finance_risk' || hintedRole === 'finance') && this.isSupportedFinanceDetail(text)) {
      return this.adapterPlan(input, 'finance_risk', 'list', 'list', 'finance_income_analysis');
    }
    if ((adapterKey === 'finance_risk' || hintedRole === 'finance') && /钱的事情|财务情况/.test(text)) {
      return this.adapterPlan(input, 'finance_risk', 'diagnosis', 'non_metric', 'finance_income_analysis');
    }
    if ((adapterKey === 'store_manager' || hintedRole === 'store_manager') && this.isSupportedManagerDetail(text)) {
      return this.adapterPlan(input, 'store_manager', 'diagnosis', 'non_metric', 'store_manager_operations_analysis');
    }
    if ((adapterKey === 'store_manager' || hintedRole === 'store_manager') && this.isBroadManagerRequest(text)) {
      return this.adapterPlan(input, 'store_manager', 'diagnosis', 'non_metric', 'store_manager_broad_analysis');
    }
    if ((adapterKey === 'marketing_growth' || hintedRole === 'marketing') && this.isSupportedMarketingCustomerFact(text)) {
      return this.adapterPlan(input, 'marketing_growth', 'list', 'list', 'marketing_customer_fact_analysis');
    }
    if ((adapterKey === 'marketing_growth' || hintedRole === 'marketing') && this.isSupportedMarketingAnalytics(text)) {
      return this.adapterPlan(input, 'marketing_growth', 'diagnosis', 'non_metric', 'marketing_attribution_analytics');
    }
    if ((adapterKey === 'marketing_growth' || hintedRole === 'marketing') && this.isSupportedMarketingAutomationPreview(text)) {
      return this.adapterPlan(input, 'marketing_growth', 'action', 'non_metric', 'marketing_automation_rule_preview');
    }
    if ((adapterKey === 'marketing_growth' || hintedRole === 'marketing') && /搞一下活动|搞.*活动|客户生命周期.*(?:方案|运营)/.test(text)) {
      return this.adapterPlan(input, 'marketing_growth', 'recommendation', 'non_metric', 'marketing_campaign_plan');
    }
    if ((adapterKey === 'front_desk' || hintedRole === 'receptionist') && /不是今天.*预约.*明天|不是.*预约.*是明天/.test(text)) {
      return this.adapterPlan(input, 'front_desk', 'list', 'list', 'front_desk_reservation_time_correction');
    }
    return undefined;
  }

  private adapterPlan(
    input: BrainRoleIntentRouteInput,
    adapterKey: BrainDomainAdapterKey,
    intent: BrainRoleIntentPlan['intent'],
    answerShape: BrainRoleIntentPlan['answerShape'],
    reason: string,
  ): BrainRoleIntentPlan {
    return {
      role: this.roleForAdapter(adapterKey, input.roleHint),
      domain: this.domainForAdapter(adapterKey),
      intent,
      answerShape,
      adapterKey,
      expectedMetric: input.runtimeIntent.expectedMetric,
      requiredPermissions: this.permissionsFor(adapterKey, intent),
      confidence: this.confidenceFor(input.message.trim().toLowerCase(), input.roleHint, adapterKey),
      grounding: this.groundingFor(adapterKey, intent),
      reason,
    };
  }

  private adapterForRoleHint(roleHint?: string): BrainDomainAdapterKey | undefined {
    const map: Record<string, BrainDomainAdapterKey> = {
      store_manager: 'store_manager',
      receptionist: 'front_desk',
      customer_service: 'customer_service',
      marketing: 'marketing_growth',
      beautician: 'beautician_service',
      inventory: 'inventory_procurement',
      finance: 'finance_risk',
    };
    return roleHint ? map[roleHint] : undefined;
  }

  private permissionsFor(adapterKey: BrainDomainAdapterKey, intent: BrainRoleIntentPlan['intent']) {
    if (adapterKey === 'marketing_growth') {
      return intent === 'action' || intent === 'draft' || intent === 'recommendation'
        ? ['core:marketing:create']
        : ['core:marketing:analytics'];
    }
    return DOMAIN_PERMISSIONS[adapterKey];
  }

  private normalizeRole(roleHint?: string): BrainDomainRole {
    const allowed: BrainDomainRole[] = [
      'store_manager',
      'receptionist',
      'marketing',
      'beautician',
      'inventory',
      'finance',
      'customer_service',
    ];
    return allowed.includes(roleHint as BrainDomainRole) ? (roleHint as BrainDomainRole) : 'store_manager';
  }

  private roleForAdapter(adapterKey: BrainDomainAdapterKey, roleHint?: string): BrainDomainRole {
    if (adapterKey === 'front_desk') return 'receptionist';
    if (adapterKey === 'marketing_growth') return 'marketing';
    if (adapterKey === 'beautician_service') return 'beautician';
    if (adapterKey === 'inventory_procurement') return 'inventory';
    if (adapterKey === 'finance_risk') return 'finance';
    if (adapterKey === 'customer_service') return 'customer_service';
    return this.normalizeRole(roleHint);
  }

  private domainForAdapter(adapterKey: BrainDomainAdapterKey): BrainRoleIntentPlan['domain'] {
    const map: Record<BrainDomainAdapterKey, BrainRoleIntentPlan['domain']> = {
      store_manager: 'store_operation',
      front_desk: 'front_desk',
      marketing_growth: 'marketing_growth',
      beautician_service: 'beautician_service',
      inventory_procurement: 'inventory_procurement',
      finance_risk: 'finance_risk',
      customer_service: 'customer_service',
    };
    return map[adapterKey];
  }

  private groundingFor(adapterKey: BrainDomainAdapterKey, intent: BrainRoleIntentPlan['intent']): BrainDomainGrounding {
    if (intent === 'action') return 'preview_action';
    if (intent === 'draft' || intent === 'recommendation') return 'template_skill';
    if (adapterKey === 'marketing_growth') return 'db_skill';
    return 'db_skill';
  }

  private confidenceFor(text: string, roleHint: string | undefined, adapterKey: BrainDomainAdapterKey) {
    const hintMatched = this.adapterForRoleHint(roleHint) === adapterKey ? 0.15 : 0;
    const domainMatched = this.detectAdapterKey(text) === adapterKey ? 0.2 : 0;
    return Math.min(0.95, 0.65 + hintMatched + domainMatched);
  }

  private isFrontDesk(text: string) {
    return /(预约清单|所有.*预约|预约.*列|预约.*情况|下一个预约|明天.*预约|下午.*预约|改约|改期|帮我约|预约到|安排.*预约|取消.*预约|到店|在店|排班|空档|空余|空着|在忙|床位|收银|结账|核销|发票|投诉|礼品卡|洗手间|怎么回应|怎么处理|怎么操作|解释一下)/.test(text);
  }

  private isInventory(text: string) {
    return /(库存|产品|货品|耗材|sku|安全库存|缺货|断货|积压|周转|补货|采购|临期|过期|损耗|供应商|快没了|最后几瓶|买什么)/i.test(text);
  }

  private isFinance(text: string) {
    return /(退款|折扣|优惠|优惠券|漏收|多收|对账|核对|现金|微信|支付宝|支付|收款|欠款|挂账|负债|储值|次卡|会员卡|毛利|利润|财务|风险|风险点|合规|流水|日结|成本|手续费|预付款|超权限)/.test(text);
  }

  private isMarketing(text: string) {
    return /(文案|话术|短信|消息|通知|朋友圈|小红书|活动|促销|推广|召回|沉睡|流失|客群|客源|营销|roi|投产|权益|客户分层|触达)/i.test(text);
  }

  private isBeautician(text: string) {
    return /(护理|美容师|技师|皮肤|肤质|过敏|服务安排|服务记录|跟进|下次做|项目推荐|推荐项目|注意事项|客人状态|下一个客人|第一个客人|最后一个客人|下午.*客人|几个客人|分别几点|排班|vip|特别对待|续卡|抗老|升级|仪器|预约哪个项目|制定方案|护理方向|推荐朋友|间隔多久|应该用什么产品|推荐她做什么|怎么介绍)/.test(text);
  }

  private isStoreManager(text: string) {
    return /(店里情况|经营概览|来个总结|经营.*总结|总结|异常情况|特别注意.*风险|需要.*风险|需要.*注意|马上处理|紧急事项|目标完成率|目标.*完成|还差多远)/.test(text) || this.isBroadManagerRequest(text);
  }

  private isBroadManagerRequest(text: string) {
    return /(最近情况怎么样|有什么问题|来一个报告|来个报告|所有数据.*分析|全年.*分析|今年.*分析|预测.*(?:营业额|营收|收入))/.test(text);
  }

  private isKnownUnsupportedDomainDetail(text: string) {
    return /(客诉|投诉|活动.*响应.*客户|上次活动.*客户|帮我找下.*生日|只做过基础项目|没有升单|办了卡但还没预约|三个月没来消费|45天没来|满意度|消防安全|请假|迟到早退|提成|升单能力|哪个美容师接的客人最多|美容师.*接.*客人最多|她的皮肤有没有什么过敏|有过敏史.*注意什么|皮肤有色斑|最新的护理项目|建一个跟进任务|上次给这个客人做护理时记了什么|产品不满意.*记录|(找一下|查一下).*预约.*改期|预约了但是要改期|所有到店客人的基本信息|赵美容师.*预约安排|到店率.*爽约|用次卡核销.*次卡情况|打开收银界面|打开核销界面|上周某天的收款记录|某个日期的收款记录|收款没有对应服务记录|完整流水|第一笔收款|这个客人.*储值余额|储值余额.*还有多少|次卡有效期|之前有没有欠款|现在在忙吗|空余的床位|过敏.*记录了什么|财务漏洞|税务方面|长期未消耗.*大额储值|库存整体情况|精华液.*库存.*多少|补水系列产品.*库存|防晒产品.*还有多少|门店和仓库.*库存.*多少|库存损耗率|每个月.*损耗.*货值|供应商.*临期.*退换货|资质问题|接待量增加.*库存够用|疗程.*需要多少耗材|(如果|假设).*打.*折|打[一二三四五六七八九0-9].*折.*毛利|毛利还剩|储值赠送方案.*比例|更愿意储值|哪个渠道.*客户质量|渠道.*客户质量|客户质量最好|新客来店三天后自动跟进|疗程快结束.*自动提醒续购|活动后自动复盘效果|员工空档.*自动推送|填满档期|自动升级会员|升级会员|会员等级|仓库里.*还有多少|护肤品.*还有多少|爽约率|超时服务|储值卡消耗|新充值|现金收了多少|微信支付宝|最大的一笔消费)/.test(text);
  }

  private isStrongBeauticianSchedule(text: string) {
    return /(今天有几个客人|分别几点|下一个客人|第一个客人|下午.*客人|下午两点.*客人|最后一个客人|今天的客人里.*新客|今天的客人里.*vip|有没有.*注意事项|下一个几点来|服务完.*下一个.*几点|提前到了|这周的排班|整体的服务流程安排|结束后还有没有安排)/.test(text);
  }

  private isStrongBeauticianAdvice(text: string) {
    return /(续卡.*推荐项目|推荐项目|下次应该做什么|间隔多久|推荐朋友|护理方向.*怎么记录)/.test(text);
  }

  private isStrongInventoryList(text: string) {
    return /(哪些东西快没了|产品只剩最后几瓶|下次采购.*买什么|采购.*清单)/.test(text);
  }

  private isStrongFinanceDiagnosis(text: string) {
    return /(退款|折扣|漏收|多收|日结|不正常.*流水|财务健康|风险点|超权限|折扣总金额|折扣率|成本项目异常|成本利润分析|降低成本|支付渠道.*手续费|优惠券核销|跨月.*预付款)/.test(text);
  }

  private isCustomerFact(text: string) {
    if (!/(客户|客人|老客|新客|vip|会员|卡里|生日|消费频率|高价值|活跃|沉睡|流失|续购|分层)/i.test(text)) {
      return false;
    }
    return /(哪些|哪几个|哪个.*客户|哪个.*客群|哪个.*新客|哪个.*渠道|哪个.*时间段|名单|列一下|列出|有没有哪些|有没有.*客户|客户.*分层|按消费金额分|高价值|不活跃|好久没来|卡里.*次数|次数快用完|快到生日|消费频率.*下降|只来一次|潜力|续购|重要客户|特别关注|优惠.*敏感|等打折|打折才来|新客.*渠道|渠道.*新客|新客最多|时间段.*新客)/.test(
      text,
    );
  }

  private isCustomerService(text: string) {
    return /(客服|回访|生日关怀|生日祝福|疗程周期|疗程提醒|疗程.*快结束|满意度(?:回访|跟进|话术|消息|调查)|投诉.*安抚|安抚.*投诉|售后|服务后跟进|护理后跟进|关怀消息|关怀话术)/.test(text);
  }

  private isExactCustomerLookup(text: string) {
    if (/(升级会员|消费满多少|会员规则)/.test(text)) return false;
    if (/(预约情况|预约安排|预约密度|预约最多|赵美容师|李美容师|哪个美容师)/.test(text)) return false;
    return (
      (/(这个客人|这个客户|这位客人|她上次|她的皮肤|她喜欢|手机尾号|会员等级|消费记录|储值余额|办过卡|标签和备注|叫[\u4e00-\u9fa5]{2,4})/.test(text) &&
        /(客人|客户|她|姓名|叫|尾号|会员|消费|储值|卡|预约|皮肤|过敏|标签|备注)/.test(text)) ||
      this.hasAnchoredCustomerReservation(text)
    );
  }

  private hasAnchoredCustomerReservation(text: string) {
    const prefix = text.match(/^([\u4e00-\u9fa5]{2,4})的预约/)?.[1];
    return Boolean(prefix && !/(今天|明天|昨天|不是|这个|那个|所有|本周|上周|下周)/.test(prefix));
  }

  private isSupportedInventoryDetail(text: string) {
    return /(库存整体|库存金额|库存货值|还有多少|库存加起来|用了多少|用量|消耗|够用多久|够用多少|周转|进出库|需求突然增加|系列产品|精华液|洗面奶|防晒产品|仓库里有多少货|有什么产品可以卖|产品可以卖)/.test(text);
  }

  private isSupportedFinanceDetail(text: string) {
    return /(收入汇总|收入情况|收款|现金|微信|支付宝|支付方式|收入趋势|收入明细|客单价|项目收入|产品销售|最大的一笔|储值收款|储值卡消费|次卡销售|到账的钱|开单的钱|打[一二三四五六七八九0-9].*折.*毛利|毛利还剩|耗材成本|材料成本|员工提成|房租|水电|经营成本|实际毛利|毛利情况|储值负债|未消耗余额|预付.*未使用|卡项负债)/.test(text);
  }

  private isSupportedManagerDetail(text: string) {
    if (/(客诉|投诉)/.test(text)) return false;
    return /(目标完成率|目标.*完成|还差多远|来了几个客人|还有几个在店|客单价|新客老客|哪个项目做得最多|最大的一笔消费|营业额趋势|哪天特别差|现金收了多少|微信支付宝|(美容师|员工|技师).*(接客|客人|服务|业绩|提成|复购|请假|迟到|排名|排行|最多|最高|下滑)|谁.*(接客|服务|业绩|提成|复购|请假))/.test(text);
  }

  private isSupportedFrontDeskOperations(text: string) {
    return /(还没来|未到店|爽约|取消了|临时取消|到店|(?:还有|当前|现在|几个).*在店|客人.*在店|空余.*床位|空闲.*床位|床位.*空|预约确认|预约.*改期|待到店|下一个预约|预约了但还没确认|超时.*预约|临时来了没预约|特别准备.*预约|预约情况|预约安排|预约密度|预约最多|带朋友.*同时安排|哪个时段可以加客|在忙|可以接新单|没到岗)/.test(text);
  }

  private isFrontDeskServiceAdvice(text: string) {
    return /(等待时间|补偿|安抚|新客人.*介绍|新客.*介绍|停车指引|门店位置|投诉|发票|收据|效果不好|退款|退卡|换一个美容师|更换美容师|新项目.*适合)/.test(text);
  }

  private isFrontDeskCatalogLookup(text: string) {
    return /(充值套餐|卡项套餐|办卡套餐|有哪些卡|优惠活动|最近.*活动)/.test(text);
  }

  private isSupportedBeauticianDetail(text: string) {
    if (/(记录|记了什么|建.*任务|创建.*任务|保存|写入)/.test(text)) return false;
    return /(我的|我今天|我昨天|我这个月|我这周|个人|我).*(业绩|提成|收入|服务|客人|复购|时长|小时|进步|目标|最好.*项目|老客户|升单|客单价|满意度)|总共要服务几个小时|这个客人.*(过敏|皮肤|疗程|历史)|她上次.*(项目|护理)|她的疗程|过敏史|皮肤有|之前做过/.test(text);
  }

  private isSupportedMarketingCustomerFact(text: string) {
    return /(\d+天没来|三个月没来|快过生日|生日客户|活动.*响应.*客户|上次活动.*客户|办了卡.*还没预约|有卡.*没有预约)/.test(text);
  }

  private isSupportedMarketingAnalytics(text: string) {
    if (/(设置|创建|新建|做一个).*(自动|规则|流程)/.test(text)) return false;
    return /(活动.*收入|归因收入|投产|roi|转化率|渠道质量|渠道.*效果|活动复盘|查看.*自动化规则|有哪些.*自动化规则|触达规则.*情况)/i.test(text);
  }

  private isSupportedMarketingAutomationPreview(text: string) {
    return /(设置|创建|新建|设计|做一个|能不能).*(自动|规则|流程)|自动.*(送|跟进|提醒|推荐|升级|复盘|推送)/.test(text);
  }
}
