import { ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { BrainDateRange } from '../../cognition/brain-time-range-parser.service.js';
import { BrainTimeRangeParserService } from '../../cognition/brain-time-range-parser.service.js';
import { BrainSkillRuntimeService } from '../../skills/brain-skill-runtime.service.js';
import type { BrainDomainAdapter, BrainDomainAdapterExecution, BrainDomainAnswer } from '../brain-domain-adapter.types.js';
import { defaultBrainDateRange } from '../brain-domain-formatters.js';
import { formatBrainMoney } from '../brain-domain-formatters.js';
import { BrainCustomerFactResolverService } from '../brain-customer-fact-resolver.service.js';
import { BrainActionTargetResolverService } from '../brain-action-target-resolver.service.js';
import { BrainActionConfirmationService } from '../../skills/brain-action-confirmation.service.js';

@Injectable()
export class BrainBeauticianDomainAdapter implements BrainDomainAdapter {
  readonly key = 'beautician_service' as const;
  readonly role = 'beautician' as const;
  readonly requiredPermissions = ['core:brain:beautician-view'];

  constructor(
    private readonly skillRuntime: BrainSkillRuntimeService,
    private readonly timeRangeParser: BrainTimeRangeParserService,
    private readonly customerFacts: BrainCustomerFactResolverService,
    @Optional() private readonly actionConfirmation?: BrainActionConfirmationService,
    @Optional() private readonly actionTargets?: BrainActionTargetResolverService,
  ) {}

  canHandle(plan: BrainDomainAdapterExecution['plan']) {
    return plan.adapterKey === this.key;
  }

  async execute(input: BrainDomainAdapterExecution): Promise<BrainDomainAnswer | undefined> {
    const message = input.dto.message;
    const range = this.resolveRange(message);
    if (/(保存|记录|完成).*(服务记录|护理记录|服务单)|服务完成.*记录/.test(message)) {
      return this.previewServiceRecord(input);
    }
    if (/为什么.*(?:护理|项目)?.*效果.*(?:没有|不如|不好|差)/.test(message)) {
      return {
        status: 'completed',
        answer: '要判断护理效果差异，需要先确认客户身份、本次项目、服务日期、操作参数、护理前后记录、居家护理和朋友所做项目。当前问题缺少这些事实，不能用通用话术判断原因或承诺补做；请先补充客户姓名或手机号后四位和本次项目。',
        citations: [],
        grounding: 'none',
        metadata: { adapterKey: this.key, unsupportedReason: 'customer_effect_diagnosis_requires_facts' },
      };
    }
    if (/(我的|我今天|我昨天|我这个月|我这周|个人|我).*(业绩|提成|收入|服务|客人|复购|时长|小时|进步|目标|最好.*项目|老客户|升单|客单价|满意度)|总共要服务几个小时/.test(message)) {
      const needsStoreBenchmark = /复购率.*(?:店里|店内).*(?:高|低)|(?:店里|店内).*(?:高|低).*复购率/.test(message);
      const [performance, storeStaff] = await Promise.all([
        this.skillRuntime.buildBeauticianPersonalPerformance({
          storeId: input.context.storeId,
          userId: input.context.userId,
          startDate: range.startDate,
          endDate: range.endDate,
        }),
        needsStoreBenchmark
          ? this.skillRuntime.buildManagerStaffAnalysis({
              storeId: input.context.storeId,
              startDate: range.startDate,
              endDate: range.endDate,
            })
          : Promise.resolve(undefined),
      ]);
      const projectText = performance.projectRanking.length
        ? performance.projectRanking.map((item, index) => `${index + 1}. ${item.name} ${item.count} 单`).join('；')
        : '暂无项目服务记录';
      const repeatRate = performance.uniqueCustomerCount > 0 ? performance.repeatCustomerCount / performance.uniqueCustomerCount : 0;
      const storeRates = (storeStaff?.staff ?? [])
        .filter((item) => item.uniqueCustomerCount > 0)
        .map((item) => item.repeatCustomerCount / item.uniqueCustomerCount);
      const storeAverage = storeRates.length ? storeRates.reduce((sum, value) => sum + value, 0) / storeRates.length : undefined;
      const benchmarkText =
        needsStoreBenchmark && storeAverage !== undefined
          ? `个人复购率 ${(repeatRate * 100).toFixed(1)}%，店内平均 ${(storeAverage * 100).toFixed(1)}%，${Math.abs(repeatRate - storeAverage) < 0.005 ? '与店内平均持平' : repeatRate > storeAverage ? '高于店内平均' : '低于店内平均'}。`
          : '';
      return {
        status: 'completed',
        answer: `${range.label}${performance.beauticianName ?? '当前账号'}个人服务分析：安排 ${performance.serviceCount} 单，完成 ${performance.completedCount} 单，计划服务 ${(performance.scheduledMinutes / 60).toFixed(1)} 小时，实际记录 ${(performance.actualMinutes / 60).toFixed(1)} 小时，关联业绩 ${formatBrainMoney(performance.revenueAmount)}，提成 ${formatBrainMoney(performance.commissionAmount)}，服务客户 ${performance.uniqueCustomerCount} 人，其中重复服务客户 ${performance.repeatCustomerCount} 人（${(repeatRate * 100).toFixed(1)}%）。${benchmarkText}项目排行：${projectText}。个人目标、升单额和满意度当前未建立统一事实表，不返回猜测值。`,
        citations: [{ sourceType: 'skill', sourceId: 'beautician_personal_performance', label: '美容师个人服务与提成分析' }],
        grounding: 'db_skill',
        metadata: { adapterKey: this.key, rangeLabel: range.label },
      };
    }
    if (this.isCareAdviceRequest(message)) {
      return {
        status: 'completed' as const,
        answer: this.composeCareAdvice(message),
        citations: [{ sourceType: 'skill', sourceId: 'beautician_follow_up_advice', label: '美容师护理与跟进建议' }],
        grounding: 'template_skill' as const,
        metadata: { adapterKey: this.key },
      };
    }
    if (/(这个客人|这个客户|她上次|她的疗程|过敏史|皮肤有|用什么产品|之前做过|护理历史)/.test(message)) {
      const answer = await this.customerFacts.answerExactCustomerQuestion({
        storeId: input.context.storeId,
        message,
        permissions: input.context.permissions,
      });
      return {
        status: 'completed',
        answer,
        citations: [{ sourceType: 'skill', sourceId: 'beautician_customer_care_facts', label: '客户护理与健康事实' }],
        grounding: 'db_skill',
        metadata: { adapterKey: this.key },
      };
    }
    const summary = await this.skillRuntime.buildBeauticianServiceSummary({
      storeId: input.context.storeId,
      userId: input.context.userId,
      startDate: range.startDate,
      endDate: range.endDate,
    });
    const includeAttention = /(过敏|注意事项|注意|情绪|状态|特别关心|关心|下一个|第一个|最后一个)/.test(message);
    const lines =
      summary.nextTasks.length > 0
        ? summary.nextTasks
            .slice(0, 10)
            .map((item, index) => {
              const attention = includeAttention
                ? `；注意事项：${item.attentionItems?.length ? item.attentionItems.join('；') : '当前客户档案未记录过敏、皮肤状态或情绪备注'}`
                : '';
              return `${index + 1}. ${item.appointmentTime} ${item.customerName} - ${item.projectName}${attention}`;
            })
            .join('\n')
        : '今天没有已排服务。';
    return {
      status: 'completed' as const,
      answer: `今日服务安排：共 ${summary.serviceCount} 个客人。\n${lines}`,
      citations: [{ sourceType: 'skill', sourceId: 'beautician_service_summary', label: '美容师服务安排' }],
      grounding: 'db_skill' as const,
      metadata: { adapterKey: this.key, rangeLabel: range.label },
    };
  }

  private async previewServiceRecord(input: BrainDomainAdapterExecution): Promise<BrainDomainAnswer> {
    if (!input.context.permissions.includes('*') && !input.context.permissions.includes('aura:service-record:create')) {
      throw new ForbiddenException('missing_permission:aura:service-record:create');
    }
    if (!this.actionConfirmation || !this.actionTargets) return this.actionClarification('服务记录动作依赖未就绪，请稍后重试。');
    const task = await this.actionTargets.resolveServiceTask({ storeId: input.context.storeId, message: input.dto.message });
    if (!task.ok) return this.actionClarification(task.message);
    const remark = input.dto.message.trim();
    if (remark.length < 8) return this.actionClarification('请补充本次服务结果、客户反应或护理备注后再保存。');
    const summary = `保存服务记录：${task.value.customerName} - ${task.value.projectName}（服务单 #${task.value.id}）`;
    const confirmation = await this.actionConfirmation.createPreview({
      runId: input.runId,
      userId: input.context.userId,
      storeId: input.context.storeId,
      skillKey: 'save_service_record',
      planId: input.plan.executionPlanId,
      riskLevel: 'high',
      preview: {
        actionType: 'save_service_record',
        summary,
        riskLevel: 'high',
        impactItems: [{ objectType: 'service_task', objectId: String(task.value.id), label: summary }],
      } as Prisma.InputJsonValue,
      payload: {
        taskId: task.value.id,
        remark,
        sourceMessage: input.dto.message,
      } as Prisma.InputJsonValue,
    });
    return {
      status: 'completed',
      answer: `${summary}。确认后将通过服务任务业务接口完成并保存记录。`,
      citations: [{ sourceType: 'skill', sourceId: 'beautician_service_record_preview', label: '服务记录执行预览' }],
      suggestedActions: [{
        actionId: confirmation.actionId,
        actionType: 'save_service_record',
        riskLevel: 'high',
        requiresConfirmation: true,
        summary,
      }],
      grounding: 'preview_action',
      metadata: { adapterKey: this.key },
    };
  }

  private actionClarification(answer: string): BrainDomainAnswer {
    return {
      status: 'completed',
      answer,
      citations: [],
      suggestedActions: [],
      grounding: 'none',
      metadata: { adapterKey: this.key, unsupportedReason: 'service_record_requires_exact_task' },
    };
  }

  private resolveRange(message: string): BrainDateRange {
    const parsed = this.timeRangeParser.parse(message);
    return parsed.range ?? defaultBrainDateRange();
  }

  private isCareAdviceRequest(message: string) {
    return (
      /(护理建议|建议|跟进|怎么回答|怎么建议|怎么分析|怎么调整|怎么介绍|怎么保养|保养|方案|调整|下次做|适合|推荐|抗老|升级|续卡|推荐项目|预约哪个项目|制定方案|护理方向|推荐朋友|间隔多久|下次应该做什么|应该用什么产品|需要注意什么|护理重点|效果没有|可以化妆吗)/.test(
        message,
      ) && !/(下一个|第一个|最后一个|今天.*安排|排班)/.test(message)
    );
  }

  private composeCareAdvice(message: string) {
    if (/过敏|敏感|发红|有点红|刺激/.test(message)) {
      return '过敏或敏感客户的护理建议：先复核过敏史和近期反应，避免强刺激、强酸和高能量项目；先做小范围耐受测试，过程中持续观察。若出现持续红肿、疼痛或呼吸不适，应立即停止服务并建议就医，不做医疗诊断。';
    }
    if (/干|缺水|屏障/.test(message)) {
      return '干燥或屏障偏弱的护理建议：本次以温和清洁、补水和屏障修护为主，减少去角质和高刺激叠加；居家阶段使用温和保湿并加强防晒，7 天内回访舒适度和泛红情况。';
    }
    if (/出油|油脂|痘|毛孔/.test(message)) {
      return '出油或毛孔问题的护理建议：先评估炎症和敏感程度，以温和清洁、控油补水和屏障稳定为主，避免过度清洁或一次叠加多个刺激项目；根据 7 天反馈再调整节奏。';
    }
    if (/色斑|暗沉|美白|抗老|年龄偏大/.test(message)) {
      return '色斑、暗沉或抗老护理建议：先确认防晒、敏感和既往项目反应，再选择温和提亮或抗老方案；不要承诺单次效果，建议按阶段记录肤况、照片和耐受反馈后再升级项目。';
    }
    if (/护理后|回家|化妆|保养/.test(message)) {
      return '护理后建议：24 小时内避免高温、剧烈摩擦和刺激性护肤，按项目要求决定是否化妆；加强保湿与防晒，如出现持续红肿、疼痛或明显不适应停止相关产品并及时联系门店或就医。';
    }
    if (/周期|间隔多久|多久来一次|预约哪个项目|下次做|推荐/.test(message)) {
      return '项目与周期建议：先结合本次肤况、既往反应和当前目标选择下一项目；在没有客户档案和项目参数时不直接给固定疗程，建议记录本次反应并在 7 天回访后确认下次项目与间隔。';
    }
    return this.skillRuntime.composeBeauticianFollowUpAdvice({});
  }
}
