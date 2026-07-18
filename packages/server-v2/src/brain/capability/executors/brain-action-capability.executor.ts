import { Injectable } from '@nestjs/common';
import type { BrainCognitionResult } from '../../cognition/brain-cognition.service.js';
import type { BrainQuestionIntentResult } from '../../cognition/brain-question-intent.service.js';
import { BrainDomainAdapterRegistryService } from '../../domain/brain-domain-adapter-registry.service.js';
import type {
  BrainDomainAdapterKey,
  BrainDomainAnswer,
  BrainDomainRole,
  BrainRoleIntentPlan,
} from '../../domain/brain-domain-adapter.types.js';
import type {
  BrainCapabilityExecutionInput,
  BrainCapabilityExecutor,
  BrainCapabilityToolArgs,
} from '../brain-capability-executor.registry.js';
import { BrainCapability } from '../brain-capability.decorator.js';
import { structuredEntityMentions } from '../brain-capability-structured-args.js';

interface ActionCapabilityDefinition {
  adapterKey: BrainDomainAdapterKey;
  role: BrainDomainRole;
  domain: BrainRoleIntentPlan['domain'];
}

const CAPABILITIES: Record<string, ActionCapabilityDefinition> = {
  reservation_action_preview: { adapterKey: 'front_desk', role: 'receptionist', domain: 'front_desk' },
  card_usage_action_preview: { adapterKey: 'front_desk', role: 'receptionist', domain: 'front_desk' },
  customer_follow_up_draft: { adapterKey: 'customer_service', role: 'customer_service', domain: 'customer_service' },
  purchase_order_draft: { adapterKey: 'inventory_procurement', role: 'inventory', domain: 'inventory_procurement' },
  marketing_touch_draft: { adapterKey: 'marketing_growth', role: 'marketing', domain: 'marketing_growth' },
  gap_fill_touch_preview: { adapterKey: 'marketing_growth', role: 'store_manager', domain: 'marketing_growth' },
};

@Injectable()
export class BrainActionCapabilityExecutor implements BrainCapabilityExecutor {
  readonly kind = 'action' as const;
  readonly capabilityKeys = Object.freeze(Object.keys(CAPABILITIES));

  constructor(private readonly adapterRegistry: BrainDomainAdapterRegistryService) {}

  @BrainCapability({
    key: 'reservation_action_preview',
    name: '预约创建改期取消预览',
    description: '解析当前门店内的客户、预约、项目与目标时间，生成预约创建、改期或取消的待确认预览。解析不到唯一目标时返回具体追问，确认前不写入业务数据。创建预约确认后使用业务表级幂等键，同键重放返回原预约回执，不创建重复预约。',
    intents: ['action'],
    examples: ['把一位客户的预约改到明天下午三点', '预览取消指定客户下一次预约', '为指定客户准备一个新预约方案'],
    negativeExamples: ['直接执行改约不要确认', '操作其他门店预约', '只查询明天预约清单'],
    synonyms: ['预约改期预览', '预约改约方案', '取消预约预览', '创建预约预览'],
    businessDefinitionKeys: ['entity.customer', 'entity.reservation', 'entity.project'],
    readOnly: false,
    storeScope: 'required',
    permissions: ['core:brain:use', 'core:store:reservations'],
    allowedRoles: ['receptionist', 'store_manager'],
    requiresConfirmation: true,
    idempotency: 'required',
  })
  reservationActionPreview(args: BrainCapabilityToolArgs, input: BrainCapabilityExecutionInput) {
    return this.executeDeclared('reservation_action_preview', args, input);
  }

  @BrainCapability({
    key: 'card_usage_action_preview',
    name: '次卡核销预览',
    description: '解析当前门店内的唯一客户、有效次卡、卡内项目、核销次数和服务美容师，生成关键风险待确认预览。确认后复用统一 CardsService 完成扣次、核销流水、耗材、收入和提成；同一幂等键可安全重放并返回原核销回执，不重复扣次、扣库存或计提成。',
    intents: ['action'],
    examples: ['给张女士的补水次卡核销深层补水护理 1 次，服务人员是王美容师', '预览为指定客户划扣一次卡项并归属到指定美容师'],
    negativeExamples: ['直接核销不要确认', '核销其他门店客户的卡', '没有客户卡项和服务人员也直接扣次', '只查询客户次卡剩余次数'],
    synonyms: ['次卡扣次预览', '卡项核销确认', '疗程卡划扣预览'],
    businessDefinitionKeys: ['entity.customer', 'entity.project', 'entity.beautician'],
    readOnly: false,
    storeScope: 'required',
    permissions: ['core:brain:use', 'core:order:card-usage'],
    allowedRoles: ['receptionist', 'store_manager'],
    requiresConfirmation: true,
    idempotency: 'required',
  })
  cardUsageActionPreview(args: BrainCapabilityToolArgs, input: BrainCapabilityExecutionInput) {
    return this.executeDeclared('card_usage_action_preview', args, input);
  }

  @BrainCapability({
    key: 'customer_follow_up_draft',
    name: '客户跟进任务预览',
    description: '解析当前门店内的唯一客户并生成待确认的客户跟进任务预览；确认后通过统一跟进任务事实的强幂等合同创建并支持安全重放。',
    intents: ['action'],
    examples: ['给指定客户准备一个待确认跟进任务', '生成客户回访任务预览'],
    negativeExamples: ['直接创建客户任务不要确认', '操作其他门店客户', '只写一段通用回访文案'],
    synonyms: ['客户跟进预览', '客户回访任务草稿', '跟进任务方案'],
    businessDefinitionKeys: ['entity.customer'],
    readOnly: false,
    storeScope: 'required',
    permissions: ['core:brain:use', 'core:customer:view'],
    allowedRoles: ['customer_service', 'receptionist', 'store_manager'],
    requiresConfirmation: true,
    idempotency: 'required',
  })
  customerFollowUpDraft(args: BrainCapabilityToolArgs, input: BrainCapabilityExecutionInput) {
    return this.executeDeclared('customer_follow_up_draft', args, input);
  }

  @BrainCapability({
    key: 'purchase_order_draft',
    name: '采购单预览',
    description: '基于当前门店库存与商品目标生成待确认采购单预览，缺少唯一商品或采购数量时返回具体追问；确认后通过采购业务表级强幂等合同创建并支持安全重放。',
    intents: ['action'],
    examples: ['根据补货建议准备采购单预览', '为指定商品生成采购草稿'],
    negativeExamples: ['直接提交采购单', '使用查看权限创建采购单', '查询低库存商品名单'],
    synonyms: ['采购单草稿', '补货单预览', '采购方案待确认'],
    businessDefinitionKeys: ['entity.product'],
    readOnly: false,
    storeScope: 'required',
    permissions: ['core:brain:use', 'core:supply:manage'],
    allowedRoles: ['inventory', 'store_manager'],
    requiresConfirmation: true,
    idempotency: 'required',
  })
  purchaseOrderDraft(args: BrainCapabilityToolArgs, input: BrainCapabilityExecutionInput) {
    return this.executeDeclared('purchase_order_draft', args, input);
  }

  @BrainCapability({
    key: 'marketing_touch_draft',
    name: '单客户营销触达预览',
    description: '解析当前门店内的唯一客户并生成单客户营销触达任务预览，包含可编辑话术和风险提示；确认后只创建强幂等跟进草稿，不自动群发。',
    intents: ['action'],
    examples: ['给指定客户准备一条待确认的邀约任务', '生成单客户召回触达预览'],
    negativeExamples: ['直接给全部客户群发', '操作其他门店客户', '只生成通用文案'],
    synonyms: ['营销触达预览', '单客户邀约任务', '召回任务草稿'],
    businessDefinitionKeys: ['entity.customer'],
    readOnly: false,
    storeScope: 'required',
    permissions: ['core:brain:use', 'core:marketing:create'],
    allowedRoles: ['marketing', 'store_manager'],
    requiresConfirmation: true,
    idempotency: 'required',
  })
  marketingTouchDraft(args: BrainCapabilityToolArgs, input: BrainCapabilityExecutionInput) {
    return this.executeDeclared('marketing_touch_draft', args, input);
  }

  @BrainCapability({
    key: 'gap_fill_touch_preview',
    name: '空档补位客户匹配与触达预览',
    description: '读取当前门店排班、预约、客户、卡项、历史偏好和已发布预测快照，识别空档并匹配候选客户，自动选择最高分候选生成待确认触达任务预览。确认前不创建任务、不发送消息、不修改预约。',
    intents: ['workflow', 'action'],
    examples: [
      '找出明天下午空档、筛合适客户、写提醒并生成触达预览',
      '把明日空闲时段和可召回客户配对，再准备邀约',
      '先看预约资源，再选客户，最后给我触达草稿',
      '规划一个补齐明天下午空档的完整流程',
      '组合预约清单、客户筛选和提醒文案，生成待确认方案',
    ],
    negativeExamples: ['直接给候选客户发送消息', '自动修改客户预约', '读取其他门店的空档与客户'],
    synonyms: ['空档补位方案', '空闲时段客户匹配', '补位邀约预览', '预约空档触达计划'],
    businessDefinitionKeys: ['entity.customer', 'entity.reservation', 'entity.project', 'entity.beautician'],
    readOnly: false,
    storeScope: 'required',
    permissions: ['core:brain:use', 'core:store:scheduling', 'core:marketing:create'],
    allowedRoles: ['store_manager', 'marketing'],
    requiresConfirmation: true,
    idempotency: 'required',
  })
  gapFillTouchPreview(args: BrainCapabilityToolArgs, input: BrainCapabilityExecutionInput) {
    if (input.card.grounding !== 'preview_action') {
      throw new Error('gap_fill_touch_preview_grounding_contract_invalid');
    }
    return this.executeDeclared('gap_fill_touch_preview', args, input);
  }

  async execute(input: BrainCapabilityExecutionInput): Promise<BrainDomainAnswer> {
    const definition = CAPABILITIES[input.card.key];
    if (!definition) throw new Error(`unsupported_action_capability:${input.card.key}`);

    const plan: BrainRoleIntentPlan = {
      role: definition.role,
      domain: definition.domain,
      intent: 'action',
      answerShape: 'non_metric',
      adapterKey: definition.adapterKey,
      capabilityKey: input.card.key,
      capabilityVersion: input.card.version,
      executionPlanId: input.planId,
      requiredPermissions: [...input.card.requiredPermissions],
      confidence: 1,
      grounding: 'preview_action',
      reason: `capability_executor:${input.card.key}`,
    };
    const adapter = this.adapterRegistry.resolve(plan);
    if (!adapter) return this.clarification(definition.adapterKey, 'capability_not_open');

    const answer = await adapter.execute({
      context: input.context,
      dto: { message: input.question, timezone: input.context.timezone },
      runId: input.runId,
      cognition: this.actionCognition(input.question, input.args as BrainCapabilityToolArgs),
      runtimeIntent: this.actionRuntimeIntent(),
      plan,
    });
    if (!answer) return this.clarification(definition.adapterKey, 'capability_not_open');
    this.assertPreviewOnly(answer);
    return answer;
  }

  private assertPreviewOnly(answer: BrainDomainAnswer) {
    if (answer.grounding === 'none') {
      const reason = String(answer.metadata?.unsupportedReason ?? '');
      if (!/(target|capability|not_open|requires|missing|high_risk)/i.test(reason)) {
        throw new Error('action_executor_invalid_clarification');
      }
      return;
    }
    if (answer.grounding === 'db_skill') {
      const actions = Array.isArray(answer.suggestedActions) ? answer.suggestedActions : [];
      const noActionReason = String(answer.metadata?.noActionReason ?? '');
      if (!actions.length && noActionReason) return;
      throw new Error('action_executor_invalid_grounded_no_action');
    }
    if (answer.grounding !== 'preview_action') {
      throw new Error(`action_executor_non_preview_result:${answer.grounding}`);
    }

    const actions = Array.isArray(answer.suggestedActions) ? answer.suggestedActions : [];
    if (!actions.length) throw new Error('action_preview_missing_suggested_action');
    for (const action of actions) {
      if (!action || typeof action !== 'object') throw new Error('action_preview_invalid_suggested_action');
      const value = action as Record<string, unknown>;
      if (value.requiresConfirmation !== true || typeof value.actionId !== 'string' || !value.actionId.trim()) {
        throw new Error('action_preview_invalid_suggested_action');
      }
    }

    const serialized = JSON.stringify(answer);
    if (/\breceipt\b|already executed|successfully executed|\u5df2\u6267\u884c|\u6267\u884c\u6210\u529f/i.test(serialized)) {
      throw new Error('action_preview_contains_execution_receipt');
    }
  }

  private clarification(adapterKey: BrainDomainAdapterKey, unsupportedReason: string): BrainDomainAnswer {
    return {
      status: 'completed',
      answer: '当前动作目标或能力尚未就绪，请补充缺失目标后再生成操作预览。',
      citations: [],
      suggestedActions: [],
      grounding: 'none',
      metadata: { adapterKey, unsupportedReason },
    };
  }

  private actionCognition(question: string, args: BrainCapabilityToolArgs): BrainCognitionResult {
    return {
      normalizedText: question.trim(),
      terms: [],
      metrics: Array.isArray(args.metrics)
        ? args.metrics.flatMap((value) => this.definitionKey(value, 'metric.'))
        : [],
      dimensions: Array.isArray(args.dimensions)
        ? args.dimensions.flatMap((value) => this.definitionKey(value, 'dimension.'))
        : [],
      entities: structuredEntityMentions(args).map((entity) => ({
        slot: entity.entityType,
        entityKey: entity.entityKey ?? entity.mention,
        label: entity.mention,
      })),
      unsupportedTerms: [],
      intent: { key: 'general_assistant', confidence: 1, reason: 'capability_action_execution' },
      needsClarification: false,
    };
  }

  private definitionKey(value: unknown, prefix: string): string[] {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const key = (value as Record<string, unknown>).definitionKey;
    return typeof key === 'string' && key.startsWith(prefix) ? [key.slice(prefix.length)] : [];
  }

  private actionRuntimeIntent(): BrainQuestionIntentResult {
    return {
      intent: 'action',
      expectedShape: 'non_metric',
      allowsScalarMetric: false,
      reason: 'capability_action_execution',
    };
  }

  private executeDeclared(
    key: keyof typeof CAPABILITIES,
    args: BrainCapabilityToolArgs,
    input: BrainCapabilityExecutionInput,
  ) {
    if (input.card.key !== key) throw new Error(`capability_contract_key_mismatch:${key}:${input.card.key}`);
    return this.execute({ ...input, args });
  }
}
