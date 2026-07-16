import { ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BrainActionConfirmationService } from '../../skills/brain-action-confirmation.service.js';
import { BrainCustomerFactResolverService } from '../brain-customer-fact-resolver.service.js';
import { BrainActionTargetResolverService } from '../brain-action-target-resolver.service.js';
import type { BrainDomainAdapter, BrainDomainAdapterExecution, BrainDomainAnswer } from '../brain-domain-adapter.types.js';

@Injectable()
export class BrainCustomerServiceDomainAdapter implements BrainDomainAdapter {
  readonly key = 'customer_service' as const;
  readonly role = 'customer_service' as const;
  readonly requiredPermissions = ['core:customer:view'];

  constructor(
    private readonly customerFacts: BrainCustomerFactResolverService,
    private readonly actionConfirmation: BrainActionConfirmationService,
    @Optional() private readonly actionTargets?: BrainActionTargetResolverService,
  ) {}

  canHandle(plan: BrainDomainAdapterExecution['plan']) {
    return plan.adapterKey === this.key;
  }

  async execute(input: BrainDomainAdapterExecution): Promise<BrainDomainAnswer | undefined> {
    if (input.plan.capabilityKey === 'customer_follow_up_draft') return this.previewAction(input);
    const message = input.dto.message;
    if (input.plan.intent === 'action' || /(建|创建).*(跟进任务)|群发|发券/.test(message)) {
      return this.previewAction(input);
    }

    if (/(名单|哪些客户|找出|生日客户|沉睡|流失|疗程快结束|好久没来)/.test(message) && !/(写|话术|消息|文案)/.test(message)) {
      const answer = await this.customerFacts.answerCustomerFactQuestion({ storeId: input.context.storeId, message });
      return {
        status: 'completed',
        answer,
        citations: [{ sourceType: 'skill', sourceId: 'customer_service_customer_facts', label: '客服客户事实' }],
        grounding: 'db_skill',
        metadata: { adapterKey: this.key },
      };
    }

    return {
      status: 'completed',
      answer: this.composeCareScript(message),
      citations: [{ sourceType: 'skill', sourceId: 'customer_service_care_script', label: '客服关怀话术' }],
      grounding: 'template_skill',
      metadata: { adapterKey: this.key, scriptType: this.scriptType(message) },
    };
  }

  private async previewAction(input: BrainDomainAdapterExecution): Promise<BrainDomainAnswer> {
    const message = input.dto.message;
    if (/群发|发券/.test(message)) {
      return {
        status: 'completed',
        answer: '批量群发和发券不在 Ami Brain 首批开放动作中，当前不会生成可确认按钮。请使用营销审批流程处理。',
        citations: [],
        suggestedActions: [],
        grounding: 'none',
        metadata: { adapterKey: this.key, unsupportedReason: 'high_risk_bulk_action_not_open' },
      };
    }
    if (!input.context.permissions.includes('*') && !input.context.permissions.includes('assist:followup:create')) {
      throw new ForbiddenException('missing_permission:assist:followup:create');
    }
    if (!this.actionTargets) return this.actionClarification('动作目标解析服务未就绪，请稍后重试。');
    const customer = await this.actionTargets.resolveCustomer({ storeId: input.context.storeId, message });
    if (!customer.ok) return this.actionClarification(customer.message);
    const actionType = 'create_customer_followup';
    const riskLevel = 'medium' as const;
    const script = this.composeCareScript(message);
    const summary = `创建客户跟进任务：${customer.value.name}；跟进内容：${script}`;
    const confirmation = await this.actionConfirmation.createPreview({
      runId: input.runId,
      userId: input.context.userId,
      storeId: input.context.storeId,
      skillKey: actionType,
      planId: input.plan.executionPlanId,
      riskLevel,
      preview: {
        actionType,
        summary,
        riskLevel,
        impactItems: [{ objectType: 'customer', objectId: String(customer.value.id), label: customer.value.name }],
      } as Prisma.InputJsonValue,
      payload: {
        customerId: customer.value.id,
        title: 'Ami Brain 客户跟进',
        note: script,
        script,
        channel: 'phone',
        sourceMessage: message,
      } as Prisma.InputJsonValue,
    });
    return {
      status: 'completed',
      answer: summary,
      citations: [{ sourceType: 'skill', sourceId: 'customer_service_action_preview', label: '客服动作预览' }],
      suggestedActions: [
        {
          actionId: confirmation.actionId,
          actionType,
          riskLevel,
          requiresConfirmation: true,
          summary,
        },
      ],
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
      metadata: { adapterKey: this.key, unsupportedReason: 'action_target_requires_clarification' },
    };
  }

  private composeCareScript(message: string) {
    if (/投诉|不满意|安抚/.test(message)) {
      return '投诉安抚话术：您好，感谢您把真实感受告诉我们。对于这次体验给您带来的困扰，我们先完整记录并马上复核预约、服务和消费记录。负责人会在约定时间内联系您说明处理结果，在确认前不会擅自修改权益或承诺补偿。';
    }
    if (/生日/.test(message)) {
      return '生日关怀话术：您好，提前祝您生日快乐。感谢您一直以来的信任，我们为您准备了一份到店关怀。方便时回复我，我会先根据您的护理记录确认合适时间和项目，不会直接替您预约。';
    }
    if (/疗程|周期|续购|快结束/.test(message)) {
      return '疗程周期提醒：您好，按照您上次的护理记录，近期可以安排下一次效果复核。是否继续疗程需要结合当前皮肤状态和剩余权益确认，您回复方便时间后，我们再为您准备建议。';
    }
    if (/满意度|回访|服务后|护理后/.test(message)) {
      return '服务后回访话术：您好，想跟进一下您上次服务后的感受。现在皮肤状态、舒适度或护理反应是否有变化？您的反馈会记录到服务档案，如有不适我们会优先安排专业人员复核。';
    }
    return '客户关怀话术：您好，最近想了解一下您的护理状态和到店安排。您可以直接回复当前需求或方便时间，我们会先核对历史记录，再给出合适建议，不会未经确认执行预约或权益操作。';
  }

  private scriptType(message: string) {
    if (/投诉|不满意|安抚/.test(message)) return 'complaint_care';
    if (/生日/.test(message)) return 'birthday_care';
    if (/疗程|周期|续购|快结束/.test(message)) return 'treatment_cycle';
    if (/满意度|回访|服务后|护理后/.test(message)) return 'service_follow_up';
    return 'general_care';
  }
}
