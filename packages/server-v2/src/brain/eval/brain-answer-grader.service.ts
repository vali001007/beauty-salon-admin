import { Injectable } from '@nestjs/common';

export type BrainQuestionIntent =
  | 'metric_query'
  | 'comparison'
  | 'ranking'
  | 'list'
  | 'draft'
  | 'action'
  | 'recommendation'
  | 'diagnosis'
  | 'clarify'
  | 'unknown';

export type BrainAnswerShape =
  | 'scalar_metric'
  | 'comparison'
  | 'ranking'
  | 'list'
  | 'clarification'
  | 'non_metric'
  | 'empty';
export type BrainGroundingType = 'metric_query' | 'db_skill' | 'template_skill' | 'preview_action' | 'none';

export type BrainAnswerGradeStatus =
  | 'usable_exact'
  | 'usable_partial'
  | 'false_positive_intent_mismatch'
  | 'false_positive_granularity_mismatch'
  | 'false_positive_metric_mismatch'
  | 'unsupported_intent'
  | 'unsupported_metric_formula'
  | 'metric_failed'
  | 'security_blocked'
  | 'permission_denied'
  | 'not_found'
  | 'provider_unavailable'
  | 'error';

export interface BrainAnswerGraderCitation {
  sourceType?: string;
  sourceId?: string;
  label?: string;
  definition?: string;
}

export interface BrainAnswerGraderInput {
  question: string;
  answer: string;
  citations: BrainAnswerGraderCitation[];
  blocks?: unknown[];
  expectedIntent?: BrainQuestionIntent;
  expectedMetric?: string;
  brainStatus?: string;
  error?: string;
}

export interface BrainAnswerGrade {
  status: BrainAnswerGradeStatus;
  expectedIntent: BrainQuestionIntent;
  actualIntent: BrainQuestionIntent;
  expectedShape: BrainAnswerShape;
  actualShape: BrainAnswerShape;
  expectedMetric?: string;
  actualMetric?: string;
  groundingType: BrainGroundingType;
  reason: string;
  legacyUsableWithCitation: boolean;
}

@Injectable()
export class BrainAnswerGraderService {
  grade(input: BrainAnswerGraderInput): BrainAnswerGrade {
    const expectedIntent = input.expectedIntent ?? this.detectExpectedIntent(input.question);
    const actualIntent = this.detectActualIntent(input);
    const expectedShape = this.shapeForIntent(expectedIntent);
    const actualShape = this.detectActualShape(input, expectedShape);
    const expectedMetric = input.expectedMetric ?? this.detectExpectedMetric(input.question, expectedIntent);
    const actualMetric = this.detectActualMetric(input.citations);
    const groundingType = this.detectGroundingType(input.citations);
    const legacyUsableWithCitation = input.brainStatus === 'completed' && this.hasMetricCitation(input.citations);

    if (this.isSecurityBlocked(input)) {
      return this.buildGrade(input, {
        status: 'security_blocked',
        expectedIntent,
        actualIntent,
        expectedShape,
        actualShape,
        expectedMetric,
        actualMetric,
        reason: '安全策略拦截。',
        legacyUsableWithCitation,
      });
    }
    if (this.isPermissionDenied(input)) {
      return this.buildGrade(input, {
        status: 'permission_denied',
        expectedIntent,
        actualIntent,
        expectedShape,
        actualShape,
        expectedMetric,
        actualMetric,
        reason: '权限不足。',
        legacyUsableWithCitation,
      });
    }
    if (input.error?.includes('不存在') || input.answer.includes('不存在') || input.answer.includes('没有找到匹配客户')) {
      return this.buildGrade(input, {
        status: 'not_found',
        expectedIntent,
        actualIntent,
        expectedShape,
        actualShape,
        expectedMetric,
        actualMetric,
        reason: '会话或业务对象不存在。',
        legacyUsableWithCitation,
      });
    }
    if (input.brainStatus === 'failed') {
      return this.buildGrade(input, {
        status: 'metric_failed',
        expectedIntent,
        actualIntent,
        expectedShape,
        actualShape,
        expectedMetric,
        actualMetric,
        reason: '语义问数链路执行失败。',
        legacyUsableWithCitation,
      });
    }
    if (expectedIntent === 'clarify') {
      const matched = actualIntent === 'clarify' && actualShape === 'clarification';
      return this.buildGrade(input, {
        status: matched ? 'usable_exact' : 'false_positive_intent_mismatch',
        expectedIntent,
        actualIntent,
        expectedShape,
        actualShape,
        expectedMetric,
        actualMetric,
        reason: matched ? '返回了结构化合并式澄清。' : '问题需要澄清，但系统未返回可继续的澄清结果。',
        legacyUsableWithCitation,
      });
    }
    if (this.isUnsupportedFormula(input.answer)) {
      return this.buildGrade(input, {
        status: 'unsupported_metric_formula',
        expectedIntent,
        actualIntent,
        expectedShape,
        actualShape,
        expectedMetric,
        actualMetric,
        reason: '识别到指标，但真实口径尚未接入。',
        legacyUsableWithCitation,
      });
    }
    if (this.isUnsupportedIntent(input.answer)) {
      return this.buildGrade(input, {
        status: 'unsupported_intent',
        expectedIntent,
        actualIntent,
        expectedShape,
        actualShape,
        expectedMetric,
        actualMetric,
        reason: '当前能力明确说明该业务口径尚未注册。',
        legacyUsableWithCitation,
      });
    }
    if (this.isClarificationRequired(input.answer)) {
      return this.buildGrade(input, {
        status: 'unsupported_intent',
        expectedIntent,
        actualIntent,
        expectedShape,
        actualShape,
        expectedMetric,
        actualMetric,
        reason: '缺少客户身份或业务实体，需要用户补充后才能查询。',
        legacyUsableWithCitation,
      });
    }
    if (!this.hasAnswerCitation(input.citations)) {
      return this.buildGrade(input, {
        status: 'unsupported_intent',
        expectedIntent,
        actualIntent,
        expectedShape,
        actualShape,
        expectedMetric,
        actualMetric,
        reason: '当前能力未覆盖该意图或未返回指标引用。',
        legacyUsableWithCitation,
      });
    }
    if (this.isTemplateGroundingMismatch(expectedIntent, expectedShape, groundingType)) {
      return this.buildGrade(input, {
        status: 'false_positive_intent_mismatch',
        expectedIntent,
        actualIntent,
        expectedShape,
        actualShape,
        expectedMetric,
        actualMetric,
        reason: '问题要求事实数据或业务闭环，但系统返回模板技能回答。',
        legacyUsableWithCitation,
      });
    }
    if (expectedShape === 'scalar_metric' && !this.hasMetricCitation(input.citations) && this.isDbSkillScalarPartial(input, groundingType)) {
      return this.buildGrade(input, {
        status: 'usable_partial',
        expectedIntent,
        actualIntent,
        expectedShape,
        actualShape,
        expectedMetric,
        actualMetric,
        reason: '数据库技能返回了请求数值，并附带了扩展业务明细。',
        legacyUsableWithCitation,
      });
    }
    if (expectedShape === 'scalar_metric' && !this.hasMetricCitation(input.citations)) {
      return this.buildGrade(input, {
        status: 'false_positive_granularity_mismatch',
        expectedIntent,
        actualIntent,
        expectedShape,
        actualShape,
        expectedMetric,
        actualMetric,
        reason: '用户问题要求直接数值指标，但系统返回了非指标技能回答。',
        legacyUsableWithCitation,
      });
    }
    if (expectedShape !== 'scalar_metric' && expectedShape !== 'non_metric' && actualShape === 'scalar_metric') {
      return this.buildGrade(input, {
        status: 'false_positive_granularity_mismatch',
        expectedIntent,
        actualIntent,
        expectedShape,
        actualShape,
        expectedMetric,
        actualMetric,
        reason: '用户问题要求排行、名单或对比粒度，但系统返回了单个全店指标。',
        legacyUsableWithCitation,
      });
    }
    if (expectedShape === 'non_metric' && actualIntent === 'metric_query') {
      return this.buildGrade(input, {
        status: 'false_positive_intent_mismatch',
        expectedIntent,
        actualIntent,
        expectedShape,
        actualShape,
        expectedMetric,
        actualMetric,
        reason: '用户意图不是单指标问数，但系统返回了指标结果。',
        legacyUsableWithCitation,
      });
    }
    if (expectedShape !== 'scalar_metric' && actualShape === 'scalar_metric') {
      return this.buildGrade(input, {
        status: 'false_positive_granularity_mismatch',
        expectedIntent,
        actualIntent,
        expectedShape,
        actualShape,
        expectedMetric,
        actualMetric,
        reason: '用户问题要求排行、名单或对比粒度，但系统返回了单个全店指标。',
        legacyUsableWithCitation,
      });
    }
    if (expectedMetric && actualMetric && canonicalMetricKey(expectedMetric) !== canonicalMetricKey(actualMetric)) {
      return this.buildGrade(input, {
        status: 'false_positive_metric_mismatch',
        expectedIntent,
        actualIntent,
        expectedShape,
        actualShape,
        expectedMetric,
        actualMetric,
        reason: `问题期望指标 ${expectedMetric}，系统引用指标 ${actualMetric}。`,
        legacyUsableWithCitation,
      });
    }

    return this.buildGrade(input, {
      status: 'usable_exact',
      expectedIntent,
      actualIntent,
      expectedShape,
      actualShape,
      expectedMetric,
      actualMetric,
      reason: '意图、指标引用和回答粒度匹配。',
      legacyUsableWithCitation,
    });
  }

  private detectExpectedIntent(question: string): BrainQuestionIntent {
    const text = this.normalize(question);

    if (/(写|生成|编辑|拟一|拟个|文案|话术|短信|消息|通知|朋友圈|小红书)/.test(text)) return 'draft';
    if (/(临时来了没预约|临时到店).*(还能|能否|可以|安排)/.test(text)) return 'recommendation';
    if (/(如果|假设).*(打|折扣).*(毛利|利润)|打[一二三四五六七八九0-9].*折.*(毛利|利润)|毛利还剩多少/.test(text)) {
      return 'recommendation';
    }
    if (/(做一个|策划|活动方案|专属活动|促销活动|做什么活动|拉动一下).*(活动|促销|客户)|(?:活动|促销).*(方案|策划|专属|拉动)/.test(text)) {
      return 'recommendation';
    }
    if (/(快过期|临期|过期).*(怎么|如何|处理|规定|办法|方案|消化|优惠|减少|合适)/.test(text)) {
      return 'recommendation';
    }
    if (
      /(不是今天.*预约.*明天|所有.*预约|所有到店客人|到店客人.*基本信息|预约.*列|预约清单|预约.*情况|预约.*安排|预约密度|哪里有空位|特别准备.*预约|准备物品.*预约|可能爽约.*(?:预约|提前联系)|预约.*可能爽约|预约.*没到|预约了但还没来|预约.*改期.*客人|那个预约|有预约|预约.*找不到|第一个客人|最后一个客人|下一个客人|下一个.*几点|哪个客人|那个客人|下午两点|分别几点|服务安排|排班|空档|首次|vip|提前到了|流程安排|护理历史|只剩最后|低于安全库存|安全库存|快没|快缺|缺货|断货|库存不够|快过期|30天内.*过期|已经过期|过期.*(损耗|产品|库存)|临期.*(货品|损失金额|库存)|采购.*清单|要买什么|补什么货|需要.*采购|马上采购)/.test(
        text,
      )
    ) {
      return 'list';
    }
    if (/(推荐|建议|适合|下次做|该做|预约哪个项目|搭配什么|策划|活动方案|促销|怎么|如何|处理|规定|保养|怎么回答|调整|合适|办法|消化方案|做什么活动|专属活动|欢迎礼包|销售下滑.*活动|拉动一下|护理重点|护理方案|哪种方式效果更好|赠品.*打折|不用打折|吸引客户)/.test(text)) {
      return 'recommendation';
    }
    if (/(新建|创建|下单|开单|改约|取消|发券|发送|导出|调整|保存|确认|执行|帮我约|打开收银|打开核销|核销|结账)/.test(text)) return 'action';
    if (/(爽约率|到店率|超时服务|超时.*影响.*预约|爽约.*高不高)/.test(text)) return 'diagnosis';
    if (
      /(按支付方式|支付方式.*(?:多少|拆分)|现金.*(?:微信|支付宝)|微信.*(?:现金|支付宝)|支付宝.*(?:现金|微信)|(?:现金|微信|支付宝|银行卡|储值).*(?:各|分别).*(?:多少|金额))/.test(text)
    ) {
      return 'list';
    }
    if (
      /(为什么|原因|诊断|分析一下|异常|怎么回事|总结|情况怎么样|风险|报告|复盘|核对|退款|折扣|优惠|漏收|多收|不正常|画像|渠道|对不上|利润.*降|收入.*利润|成本.*上涨|问题出在哪)/.test(
        text,
      )
    ) {
      return 'diagnosis';
    }
    if (/(同比|环比|对比|比上|比下|跟.*比|和.*比|相比|差多少|去年同期)/.test(text)) return 'comparison';
    if (/(排行|排名|top|前\d|前十|谁.*(最好|最高|最多|最低|最差)|最高|最多|最好|最低|最差)/i.test(text)) {
      return 'ranking';
    }
    if (/(几个客人|分别几点|下一个客人|服务安排|排班|预约.*几点|几点.*预约)/.test(text)) return 'list';
    if (/(哪些|哪几个|名单|列出|明细|找一下.*(客户|客人|新客|老客)|办了卡.*(?:没|还没).*预约|客户.*(用了|没用|消费|没来)|有没有.*客户)/.test(text)) return 'list';
    if (/(库存.*(?:整体|情况|概览)|整体.*库存)/.test(text)) return 'diagnosis';
    if (this.detectExpectedMetric(question, 'metric_query')) return 'metric_query';

    return 'unknown';
  }

  private detectActualIntent(input: BrainAnswerGraderInput): BrainQuestionIntent {
    if (this.hasClarificationBlock(input.blocks) || this.isGeneralClarification(input.answer)) return 'clarify';
    const blockKinds = this.blockKinds(input.blocks);
    if (blockKinds.has('action_preview')) return 'action';
    if (blockKinds.has('diagnosis')) return 'diagnosis';
    if (blockKinds.has('comparison')) return 'comparison';
    if (blockKinds.has('ranking')) return 'ranking';
    if (blockKinds.has('table')) return 'list';
    if (this.hasMetricCitation(input.citations)) return 'metric_query';
    const skillId = this.detectActualSkill(input.citations);
    if (skillId?.includes('draft')) return 'draft';
    if (skillId?.includes('action')) return 'action';
    if (skillId?.includes('recommend') || skillId?.includes('campaign') || skillId?.includes('advice') || skillId?.includes('plan')) {
      return 'recommendation';
    }
    if (skillId?.includes('risk') || skillId?.includes('overview') || skillId?.includes('summary')) return 'diagnosis';
    if (this.isUnsupportedFormula(input.answer) || this.isUnsupportedIntent(input.answer)) return 'unknown';
    return 'unknown';
  }

  private shapeForIntent(intent: BrainQuestionIntent): BrainAnswerShape {
    if (intent === 'clarify') return 'clarification';
    if (intent === 'comparison') return 'comparison';
    if (intent === 'ranking') return 'ranking';
    if (intent === 'list') return 'list';
    if (intent === 'draft' || intent === 'action' || intent === 'recommendation' || intent === 'diagnosis' || intent === 'unknown') return 'non_metric';
    return 'scalar_metric';
  }

  private detectActualShape(input: BrainAnswerGraderInput, expectedShape: BrainAnswerShape): BrainAnswerShape {
    const answer = this.normalize(input.answer);
    const skillId = this.detectActualSkill(input.citations);
    const blockKinds = (input.blocks ?? []).flatMap((value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
      const kind = (value as Record<string, unknown>).kind;
      return typeof kind === 'string' ? [kind] : [];
    });
    if (blockKinds.includes('clarification') || blockKinds.includes('clarification_card')) return 'clarification';
    if (blockKinds.includes('diagnosis')) return 'non_metric';
    if (blockKinds.includes('ranking')) return 'ranking';
    if (blockKinds.includes('comparison')) return 'comparison';
    if (blockKinds.includes('table') && expectedShape === 'list') return 'list';
    if (blockKinds.includes('table') && expectedShape === 'ranking') return 'ranking';
    if (blockKinds.includes('kpi') && expectedShape === 'scalar_metric') return 'scalar_metric';
    if (!answer && !blockKinds.length) return 'empty';
    if (
      skillId?.includes('service_summary') ||
      skillId?.includes('reservation_schedule') ||
      skillId?.includes('inventory_risk') ||
      skillId?.includes('purchase_suggestion')
    ) {
      return 'list';
    }
    const hasComparison = /(差值|变化率|环比|同比|相比|增长|下降).*\d/.test(answer);
    const hasRanking = /(第[一二三四五六七八九十]|top\s*\d|排行榜|排行|排名)/i.test(input.answer);
    const hasList = /(\n\s*\d+\.|\n\s*-\s*|\n\s*\||名单|明细|客户列表|项目列表|低库存产品|预约清单|今日服务安排|到店客户.*当前在店)/.test(
      input.answer,
    );
    if (expectedShape === 'comparison' && hasComparison) return 'comparison';
    if (expectedShape === 'ranking' && hasRanking) return 'ranking';
    if (expectedShape === 'list' && hasList) return 'list';
    if (hasComparison) return 'comparison';
    if (hasRanking) return 'ranking';
    if (hasList) return 'list';
    if (!this.hasMetricCitation(input.citations)) return 'non_metric';
    return 'scalar_metric';
  }

  private detectExpectedMetric(question: string, intent: BrainQuestionIntent): string | undefined {
    if (intent !== 'metric_query' && intent !== 'comparison' && intent !== 'ranking' && intent !== 'list') return undefined;

    const text = this.normalize(question);
    if (/(预约|到店|空档|排班)/.test(text)) return 'appointment_count';
    if (/(商品|产品).*(销售额|销售金额)|(销售额|销售金额).*(商品|产品)/.test(text)) return 'product_sales_amount';
    if (/(耗材|物料|产品|商品).*(消耗|用量|出库).*(最快|最多|排行|排名)/.test(text)) return 'inventory_consumption_quantity';
    if (/(收入|流水|业绩|实收|营收|营业额|收款|收了|销售额)/.test(text)) return 'paid_revenue';
    if (/(谁|员工|美容师).*(客户复购率)|客户复购率.*(谁|员工|美容师)/.test(text)) return 'staff_customer_repurchase_rate';
    if (/(复购|回购|再次消费|回头率)/.test(text)) return 'repurchase_rate';
    if (/平均多久回来|回访间隔|回店间隔/.test(text)) return 'average_return_interval_days';
    if (/(折扣|优惠|让利).*(多少|金额|送出去)/.test(text)) return 'discount_amount';
    if (/提成/.test(text)) return 'staff_commission_amount';
    if (/毛利率/.test(text)) return 'gross_margin_rate';
    if (/(毛利|利润)/.test(text)) return 'gross_margin';
    if (/(次卡|储值|负债|会员卡|剩余次数|卡项余额)/.test(text)) return 'card_liability';
    if (/(缺货|临期|过期|库存预警|库存货值)/.test(text)) return 'expiring_stock_value';
    if (/(roi|投产|活动效果|营销效果)/i.test(text)) return 'marketing_roi';
    if (/(最值得|优先).*(联系|跟进)|(?:联系|跟进).*(优先级|优先)/.test(text)) return 'follow_up_priority_score';
    if (/沉睡客户/.test(text) && /(?:唤醒|回流).*(?:迹象|信号)|(?:迹象|信号).*(?:唤醒|回流)/.test(text)) {
      return 'dormant_reactivation_customer_count';
    }
    if (/(流失|沉睡|召回)/.test(text)) return 'churn_risk_count';

    return undefined;
  }

  private detectActualMetric(citations: BrainAnswerGraderCitation[]) {
    const sourceId = citations.find((citation) => this.isMetricCitation(citation) && citation.sourceId)?.sourceId;
    if (!sourceId) return undefined;
    const key = sourceId.replace(/^metric\./, '').replace(/@\d+$/, '');
    return key;
  }

  private detectGroundingType(citations: BrainAnswerGraderCitation[]): BrainGroundingType {
    if (citations.some((citation) => citation.sourceType === 'db_skill' && citation.sourceId)) return 'db_skill';
    if (citations.some((citation) => citation.sourceType === 'template_skill' && citation.sourceId)) return 'template_skill';
    if (citations.some((citation) => citation.sourceType === 'preview_action' && citation.sourceId)) return 'preview_action';
    const metric = citations.find((citation) => this.isMetricCitation(citation) && citation.sourceId);
    if (metric) return 'metric_query';

    const skillId = this.detectActualSkill(citations) ?? '';
    if (!skillId) return 'none';
    if (/preview/.test(skillId)) return 'preview_action';
    if (
      /overview|summary|schedule|risk|operations_analysis|operations_snapshot|exact_lookup|income_analysis|inventory_detail_analysis|personal_performance|customer_care_facts|marketing_attribution_analytics|customer_facts|customer_segment|staff_analysis|procurement_analysis|cost_liability_analysis|catalog_snapshot|service_overrun_analysis|walk_in_availability|discount_margin_simulation|forecast_baseline/.test(
        skillId,
      )
    ) {
      return 'db_skill';
    }
    if (/draft|campaign|advice|plan/.test(skillId)) return 'template_skill';

    return 'template_skill';
  }

  private detectActualSkill(citations: BrainAnswerGraderCitation[]) {
    return citations.find(
      (citation) =>
        (citation.sourceType === 'skill' ||
          citation.sourceType === 'db_skill' ||
          citation.sourceType === 'template_skill' ||
          citation.sourceType === 'preview_action') &&
        citation.sourceId,
    )?.sourceId;
  }

  private hasAnswerCitation(citations: BrainAnswerGraderCitation[]) {
    return citations.some(
      (citation) =>
        (citation.sourceType === 'metric' ||
          citation.sourceType === 'skill' ||
          citation.sourceType === 'db_skill' ||
          citation.sourceType === 'template_skill' ||
          citation.sourceType === 'preview_action') &&
        Boolean(citation.sourceId),
    ) || citations.some((citation) => this.isMetricCitation(citation));
  }

  private hasMetricCitation(citations: BrainAnswerGraderCitation[]) {
    return citations.some((citation) => this.isMetricCitation(citation));
  }

  private isMetricCitation(citation: BrainAnswerGraderCitation) {
    return Boolean(
      citation.sourceId &&
      (citation.sourceType === 'metric' ||
        (citation.sourceType === 'business_definition' && citation.sourceId.startsWith('metric.'))),
    );
  }

  private isTemplateGroundingMismatch(
    expectedIntent: BrainQuestionIntent,
    expectedShape: BrainAnswerShape,
    groundingType: BrainGroundingType,
  ) {
    if (groundingType !== 'template_skill') return false;
    if (expectedIntent === 'draft' || expectedIntent === 'recommendation') return false;
    return expectedShape === 'scalar_metric' || expectedShape === 'comparison' || expectedShape === 'ranking' || expectedShape === 'list' || expectedIntent === 'diagnosis';
  }

  private isUnsupportedFormula(answer: string) {
    return answer.includes('尚未完成门店级真实口径接入');
  }

  private isUnsupportedIntent(answer: string) {
    return answer.includes('尚未注册') ||
      /^(?:当前[^。\n]{0,40})?尚未接入/.test(answer.trim()) ||
      answer.includes('已接入门店经营指标问答') ||
      answer.includes('不会编造回答');
  }

  private isClarificationRequired(answer: string) {
    return answer.includes('请提供客户姓名或手机号后四位') || answer.includes('请补充完整姓名或手机号后四位');
  }

  private isGeneralClarification(answer: string) {
    return /^(?:请|需要你|需要您)(?:确认|补充|说明|选择|提供|明确)/.test(answer.trim());
  }

  private hasClarificationBlock(blocks: unknown[] | undefined) {
    return (blocks ?? []).some((value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
      const kind = (value as Record<string, unknown>).kind;
      return kind === 'clarification' || kind === 'clarification_card';
    });
  }

  private blockKinds(blocks: unknown[] | undefined) {
    return new Set((blocks ?? []).flatMap((value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
      const kind = (value as Record<string, unknown>).kind;
      return typeof kind === 'string' ? [kind] : [];
    }));
  }

  private isDbSkillScalarPartial(input: BrainAnswerGraderInput, groundingType: BrainGroundingType) {
    if (groundingType !== 'db_skill' || !/\d/.test(input.answer)) return false;
    if (/尚未配置|尚未接入|不会自行编造|不会编造/.test(input.answer)) return false;
    const skillId = this.detectActualSkill(input.citations) ?? '';
    return /operations_analysis|income_analysis|inventory_detail_analysis|personal_performance|exact_lookup|operations_snapshot|marketing_attribution_analytics|customer_care_facts|staff_analysis|procurement_analysis|cost_liability_analysis|catalog_snapshot|service_overrun_analysis|walk_in_availability|discount_margin_simulation|forecast_baseline|member_balance_flow_summary/.test(
      skillId,
    );
  }

  private isSecurityBlocked(input: BrainAnswerGraderInput) {
    return input.answer.includes('已拦截') || input.error?.includes('已拦截') === true;
  }

  private isPermissionDenied(input: BrainAnswerGraderInput) {
    return input.answer.includes('缺少') && input.answer.includes('权限');
  }

  private normalize(value: string) {
    return value.trim().toLowerCase();
  }

  private buildGrade(
    input: BrainAnswerGraderInput,
    grade: Omit<BrainAnswerGrade, 'groundingType'>,
  ): BrainAnswerGrade {
    return { ...grade, groundingType: this.detectGroundingType(input.citations) };
  }
}

function canonicalMetricKey(metricKey: string) {
  if (metricKey === 'paid_revenue') return 'paid_amount';
  return metricKey;
}
