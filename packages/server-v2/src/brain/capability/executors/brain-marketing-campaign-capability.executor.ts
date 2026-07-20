import { Injectable } from '@nestjs/common';
import type { BrainDomainAnswer } from '../../domain/brain-domain-adapter.types.js';
import { BrainSkillRuntimeService } from '../../skills/brain-skill-runtime.service.js';
import type {
  BrainCapabilityExecutionInput,
  BrainCapabilityExecutor,
  BrainCapabilityToolArgs,
} from '../brain-capability-executor.registry.js';
import { BrainCapability } from '../brain-capability.decorator.js';

@Injectable()
export class BrainMarketingCampaignCapabilityExecutor implements BrainCapabilityExecutor {
  readonly kind = 'domain' as const;
  readonly capabilityKeys = ['marketing_campaign_plan'] as const;

  constructor(private readonly skillRuntime: BrainSkillRuntimeService) {}

  @BrainCapability({
    key: 'marketing_campaign_plan',
    name: '营销活动方案草稿',
    description:
      '根据用户表达的活动目标、客群、主题、季节节点或权益方向，生成可编辑的门店营销活动方案草稿或活动建议，包含目标客群、权益设计、执行节奏和上线前风险检查。目标或参数未明确时直接给出可选方向和占位符，不要求用户先补齐；该能力不查询经营结果、不发布活动、不创建自动化规则，也不发送消息。',
    intents: ['draft', 'recommendation'],
    examples: [
      '为节日设计一套门店促销方案',
      '设计老带新活动机制',
      '夏天适合推什么季节性项目',
      '夏天快来了，有什么适合推的季节性项目',
      '年底应该提前准备哪些营销节点',
      '制定疗程套餐的权益方案',
      '设计线上引流到店体验活动',
    ],
    negativeExamples: [
      '分析上次活动转化效果',
      '查询活动带来的收入',
      '立即发布并执行营销活动',
      '查看当前自动化规则运行情况',
      '系统自动识别客户节假日并发送关怀',
      '新美容师自动分配客户建立客源',
    ],
    synonyms: ['活动策划草稿', '促销方案', '老带新方案', '套餐权益设计', '引流活动方案'],
    businessDefinitionKeys: ['entity.customer', 'entity.project', 'entity.product'],
    readOnly: true,
    storeScope: 'required',
    permissions: ['core:brain:use', 'core:marketing:create'],
    allowedRoles: ['marketing', 'store_manager'],
    requiresConfirmation: false,
    idempotency: 'not_applicable',
  })
  marketingCampaignPlan(
    _args: BrainCapabilityToolArgs,
    input: BrainCapabilityExecutionInput,
  ): Promise<BrainDomainAnswer> {
    return this.buildAnswer(input);
  }

  execute(input: BrainCapabilityExecutionInput): Promise<BrainDomainAnswer> {
    if (input.card.key !== 'marketing_campaign_plan') {
      throw new Error(`unsupported_marketing_campaign_capability:${input.card.key}`);
    }
    return this.marketingCampaignPlan(input.args as BrainCapabilityToolArgs, input);
  }

  private async buildAnswer(input: BrainCapabilityExecutionInput): Promise<BrainDomainAnswer> {
    const objective = input.question
      .trim()
      .replace(/[。！？!?]+$/u, '')
      .slice(0, 80);
    const answer = this.skillRuntime.draftCampaignPlan({
      theme: objective ? `围绕“${objective}”` : undefined,
    });
    const citation = { sourceType: 'skill', sourceId: 'marketing_campaign_plan', label: '营销活动方案模板' };
    return {
      status: 'completed',
      answer,
      citations: [citation],
      grounding: 'template_skill',
      blocks: [
        { kind: 'text', text: answer, citationIds: [citation.sourceId] },
        {
          kind: 'limitations',
          items: [
            '这是可编辑活动方案草稿，尚未发布活动、创建自动化规则或发送消息；上线前需由用户确认权益、毛利、库存、档期和执行范围。',
          ],
        },
      ],
      metadata: {
        capabilityKey: 'marketing_campaign_plan',
        deliveryStatus: 'draft_only',
        completionCriteria: ['campaign_plan_generated', 'risk_checks_disclosed', 'no_activity_published'],
      },
    };
  }
}
