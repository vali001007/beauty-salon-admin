import type {
  BusinessDefinitionCandidateDraft,
  BusinessDefinitionCandidateEvidence,
  CanonicalOntologyCandidateIdentity,
} from './brain-semantic-candidate.types.js';
import { createBusinessActionInformationArtifactProfile } from '../brain/cognition/business-action-information-artifact.js';
import { createBusinessActionInstitutionalEffectProfile } from '../brain/cognition/business-action-institutional-effect.js';
import { createBusinessActionLexicalFrame } from '../brain/cognition/business-action-lexical-frame.js';
import { createBusinessActionModalityPolicy } from '../brain/cognition/business-action-modality-policy.js';
import { createBusinessActionParticipantProfile } from '../brain/cognition/business-action-participant-profile.js';
import { createBusinessActionRelationProfile } from '../brain/cognition/business-action-relation-profile.js';
import { createBusinessActionSideEffectInvariantProfile } from '../brain/cognition/business-action-side-effect-invariant.js';
import { createBusinessActionSituationContextProfile } from '../brain/cognition/business-action-situation-context.js';
import type {
  BusinessActionClass,
  BusinessActionLexicalContrast,
  BusinessActionRequiredStage,
  BusinessActionSemanticRole,
} from '../brain/cognition/business-definition-snapshot.types.js';
import {
  ACTION_EFFECT_OBSERVER_SYMBOL,
  ACTION_PREDICATE_EFFECT_EVALUATOR_SOURCE,
  ACTION_PREDICATE_EVALUATOR_SYMBOL,
  curatedActionEffectRef,
  curatedActionPredicateRef,
} from './brain-action-predicate-effect-catalog.js';
import { ACTION_INVARIANT_CATALOG_SOURCE, curatedActionInvariantRef } from './brain-action-invariant-catalog.js';
import { ACTION_RELATION_CATALOG_SOURCE } from './brain-action-relation-catalog.js';

export const CURATED_ACTION_CATALOG_SOURCE = 'packages/server-v2/src/semantic-data/brain-action-candidate-catalog.ts';
export const ACTION_SITUATION_CONTEXT_PROFILE_SOURCE =
  'packages/server-v2/src/brain/cognition/business-action-situation-context.ts';
export const ACTION_SITUATION_CONTEXT_REVALIDATION_SOURCE =
  'packages/server-v2/src/brain/cognition/brain-action-situation-context.ts';
export const ACTION_MODALITY_POLICY_SOURCE =
  'packages/server-v2/src/brain/cognition/business-action-modality-policy.ts';
export const ACTION_INFORMATION_ARTIFACT_PROFILE_SOURCE =
  'packages/server-v2/src/brain/cognition/business-action-information-artifact.ts';
export const ACTION_SIDE_EFFECT_INVARIANT_PROFILE_SOURCE =
  'packages/server-v2/src/brain/cognition/business-action-side-effect-invariant.ts';
export const ACTION_INSTITUTIONAL_EFFECT_PROFILE_SOURCE =
  'packages/server-v2/src/brain/cognition/business-action-institutional-effect.ts';
export const ACTION_PARTICIPANT_PROFILE_SOURCE =
  'packages/server-v2/src/brain/cognition/business-action-participant-profile.ts';
export const ACTION_RELATION_PROFILE_SOURCE =
  'packages/server-v2/src/brain/cognition/business-action-relation-profile.ts';

export interface CuratedActionCatalogEntry {
  readonly identity: CanonicalOntologyCandidateIdentity;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly storeScope: Readonly<{ mode: 'current_store' }>;
  readonly entityModels: Readonly<Record<string, string>>;
  readonly permissionContract: Readonly<{
    backendApi: string;
    capability: string;
    gateway: string;
  }>;
  readonly evidence: readonly BusinessDefinitionCandidateEvidence[];
}

export const CURATED_ACTION_CATALOG: readonly CuratedActionCatalogEntry[] = deepFreeze([
  action({
    actionKey: 'action.create_customer',
    domain: 'customer',
    name: '创建客户档案',
    aliases: ['客户建档', '创建客户资料', '新增客户档案', '新建客户档案'],
    description: '在当前门店创建新的客户档案；确认前只生成预览，确认后返回真实客户档案回执。',
    actionClass: 'create',
    targetEntityRefs: ['entity.customer'],
    entityModels: { 'entity.customer': 'Customer' },
    inputSlots: [
      slot('name', '客户姓名', 'object', 'text', ['recognition', 'preview', 'execution'], {
        sensitive: true,
        validationPolicy: 'customer_name_non_empty',
      }),
      slot('phone', '客户手机号', 'target', 'text', ['preview', 'execution'], {
        sensitive: true,
        validationPolicy: 'china_mobile_phone;masked_preview_full_execution',
      }),
    ],
    preconditions: ['context_store_resolved', 'customer_name_present', 'customer_phone_valid_before_execution'],
    effects: ['customer_created_in_context_store'],
    lexicalSemantics: {
      semanticPredicates: ['creates:entity.customer', 'scope:current_store', 'writes:new_customer_record'],
      contrasts: [
        contrast('action.find_customer', '查询客户', [
          discriminator('action_class', '创建新的客户档案', '只读取已有客户档案'),
          discriminator('effect', '产生新的 Customer 业务对象', '不产生客户写入效果'),
        ]),
        contrast('action.update_customer', '修改客户资料', [
          discriminator('target_entity', '目标是尚未存在的新客户档案', '目标是已存在的客户档案'),
          discriminator('state_transition', '客户档案从不存在变为已创建', '已有客户档案字段发生更新'),
        ]),
      ],
    },
    riskPolicy: 'high',
    capabilityKey: 'customer_create_preview',
    gatewayActionKey: 'create_customer',
    productEntry: ['src/app/pages/CustomerData.tsx', 'CustomerData.createCustomer'],
    backendApi: ['packages/server-v2/src/customers/customers.controller.ts', 'CustomersController.create'],
    capabilitySource: [
      'packages/server-v2/src/brain/capability/executors/brain-customer-create-capability.executor.ts',
      'BrainCustomerCreateCapabilityExecutor.customerCreatePreview',
    ],
    dataModels: ['Customer'],
    permissions: {
      backendApi: 'core:customer:create',
      capability: 'core:customer:create',
      gateway: 'core:customer:create',
    },
  }),
  action({
    actionKey: 'action.create_purchase_order',
    domain: 'inventory_procurement',
    name: '创建采购单',
    aliases: ['创建采购草稿', '创建采购单', '新建采购单'],
    description: '为当前门店商品创建采购草稿；确认前不写入采购数据，确认后只返回草稿采购单回执。',
    actionClass: 'create',
    targetEntityRefs: ['entity.product', 'entity.purchase_order'],
    entityModels: { 'entity.product': 'Product', 'entity.purchase_order': 'PurchaseOrder' },
    inputSlots: [
      entitySlot('product', '采购商品', 'object', 'entity.product', ['recognition', 'preview', 'execution']),
      slot('quantity', '采购数量', 'quantity', 'number', ['recognition', 'preview', 'execution'], {
        unitPolicy: 'product_purchase_unit',
        validationPolicy: 'positive_integer',
      }),
      slot('supplier', '供应商', 'counterparty', 'text', ['execution'], {
        validationPolicy: 'supplier_non_empty',
      }),
    ],
    preconditions: [
      'context_store_resolved',
      'product_belongs_to_context_store',
      'quantity_positive',
      'supplier_present_before_execution',
    ],
    effects: ['purchase_order_draft_created_in_context_store'],
    lexicalSemantics: {
      semanticPredicates: [
        'creates:entity.purchase_order',
        'resource_flow:external_supplier_to_current_store_pending',
        'state_transition:purchase_order_absent_to_draft',
      ],
      contrasts: [
        contrast('action.recommend_replenishment', '生成补货建议', [
          discriminator('modality', '请求创建真实采购单', '只请求分析或建议，不创建采购单'),
          discriminator('effect', '产生 PurchaseOrder 业务对象', '只产生建议或方案信息载体'),
        ]),
        contrast('action.receive_purchase_order', '采购收货入库', [
          discriminator('precondition', '采购单尚不存在', '必须已有可收货采购单'),
          discriminator('effect', '创建采购单，不增加现有库存', '增加库存并生成收货/库存流水'),
        ]),
        contrast('action.submit_purchase_order_for_approval', '提交采购单审核', [
          discriminator('target_entity', '创建尚不存在的采购单草稿', '目标是已经存在的草稿采购单'),
          discriminator('state_transition', '采购单从不存在变为草稿', '采购单从草稿变为待审核'),
        ]),
        contrast('action.transfer_inventory', '库存调拨', [
          discriminator('spatial_direction', '外部供应商到当前门店的采购承诺', '来源门店或仓位到目标门店或仓位'),
          discriminator('required_slot', '需要商品、数量和供应商', '需要来源、去向、商品和数量'),
        ]),
        contrast('action.adjust_inventory', '库存调整', [
          discriminator('action_class', '创建采购业务对象', '修正已有库存数量或批次事实'),
          discriminator('required_role', '供应商是交易相对方', '调整原因和责任人是审计要素'),
        ]),
        contrast('action.update_product_price', '修改商品价格', [
          discriminator('required_slot', '核心输入是采购数量和供应商', '核心输入是目标价格、币种和生效条件'),
          discriminator('effect', '创建采购单', '更新商品价格事实'),
        ]),
      ],
    },
    riskPolicy: 'high',
    capabilityKey: 'purchase_order_draft',
    gatewayActionKey: 'create_purchase_order',
    productEntry: ['src/app/pages/PurchaseManagement.tsx', 'PurchaseManagement.createPurchaseOrder'],
    backendApi: ['packages/server-v2/src/inventory/inventory.controller.ts', 'InventoryController.createPurchaseOrder'],
    capabilitySource: [
      'packages/server-v2/src/brain/capability/executors/brain-action-capability.executor.ts',
      'BrainActionCapabilityExecutor.purchaseOrderDraft',
    ],
    dataModels: ['Product', 'PurchaseOrder'],
    permissions: {
      backendApi: 'core:inventory:purchase',
      capability: 'core:inventory:purchase',
      gateway: 'core:inventory:purchase',
    },
  }),
  action({
    actionKey: 'action.submit_purchase_order_for_approval',
    domain: 'inventory_procurement',
    name: '提交采购单审核',
    aliases: ['采购单提交审核', '提交采购审批', '送审采购单'],
    description: '把当前门店已有且版本未变化的草稿采购单提交审核；确认后状态从草稿变为待审核。',
    actionClass: 'transition',
    targetEntityRefs: ['entity.purchase_order'],
    entityModels: { 'entity.purchase_order': 'PurchaseOrder' },
    inputSlots: [
      entitySlot(
        'purchaseOrder',
        '目标采购单',
        'object',
        'entity.purchase_order',
        ['recognition', 'preview', 'execution'],
      ),
    ],
    preconditions: ['context_store_resolved', 'purchase_order_draft_belongs_to_context_store'],
    effects: ['purchase_order_submitted_for_approval'],
    lexicalSemantics: {
      semanticPredicates: [
        'updates:entity.purchase_order.status',
        'requires:existing_purchase_order_draft',
        'state_transition:purchase_order_draft_to_pending_approval',
      ],
      contrasts: [
        contrast('action.create_purchase_order', '创建采购单', [
          discriminator('target_entity', '目标是已经存在的草稿采购单', '创建尚不存在的采购单草稿'),
          discriminator('state_transition', '采购单从草稿变为待审核', '采购单从不存在变为草稿'),
        ]),
        contrast('action.approve_purchase_order', '审核通过采购单', [
          discriminator('responsibility', '发起审核请求，不形成审核通过结论', '审批人作出审核结论'),
          discriminator('state_transition', '草稿变为待审核', '待审核变为已审核'),
        ]),
        contrast('action.confirm_purchase_order', '确认采购下单', [
          discriminator('commitment', '只进入内部审核流程', '形成对供应商的正式采购下单承诺'),
          discriminator('state_transition', '草稿变为待审核', '已审核变为已下单'),
        ]),
      ],
    },
    riskPolicy: 'high',
    capabilityKey: 'purchase_order_submit_for_approval_preview',
    gatewayActionKey: 'submit_purchase_order_for_approval',
    productEntry: ['src/app/pages/PurchaseManagement.tsx', 'PurchaseManagement.submitPurchaseOrderForApproval'],
    backendApi: [
      'packages/server-v2/src/inventory/inventory.controller.ts',
      'InventoryController.submitPurchaseOrderForApproval',
    ],
    capabilitySource: [
      'packages/server-v2/src/brain/capability/executors/brain-action-capability.executor.ts',
      'BrainActionCapabilityExecutor.purchaseOrderSubmitForApprovalPreview',
    ],
    dataModels: ['PurchaseOrder'],
    permissions: {
      backendApi: 'core:inventory:purchase',
      capability: 'core:inventory:purchase',
      gateway: 'core:inventory:purchase',
    },
  }),
  action({
    actionKey: 'action.create_reservation',
    domain: 'front_desk',
    name: '创建预约',
    aliases: ['安排预约', '创建预约', '新增预约'],
    description: '为当前门店客户创建待确认预约，明确项目和预约时间后才能进入执行。',
    actionClass: 'reserve',
    targetEntityRefs: ['entity.reservation'],
    entityModels: {
      'entity.reservation': 'Reservation',
      'entity.customer': 'Customer',
      'entity.project': 'Project',
      'entity.beautician': 'Beautician',
    },
    inputSlots: [
      entitySlot('customer', '预约客户', 'beneficiary', 'entity.customer', ['recognition', 'preview', 'execution']),
      entitySlot('project', '预约项目', 'object', 'entity.project', ['recognition', 'preview', 'execution']),
      slot('appointmentTime', '预约时间', 'time', 'time', ['recognition', 'preview', 'execution'], {
        validationPolicy: 'store_timezone_future_time',
      }),
      slot('duration', '预计时长', 'quantity', 'number', ['execution'], {
        unitPolicy: 'minute',
        defaultPolicy: 'resolved_project_duration',
      }),
      entitySlot('beautician', '服务美容师', 'service_provider', 'entity.beautician', ['execution'], {
        defaultPolicy: 'unassigned',
      }),
    ],
    preconditions: [
      'context_store_resolved',
      'customer_and_project_in_context_store',
      'appointment_time_resolved',
      'reservation_window_available',
    ],
    effects: ['reservation_created_in_context_store'],
    lexicalSemantics: {
      semanticPredicates: [
        'creates:entity.reservation',
        'reserves:service_time_window',
        'state_transition:reservation_absent_to_created',
      ],
      contrasts: [
        contrast('action.query_availability', '查询可预约时间', [
          discriminator('modality', '请求创建预约', '只查询资源或档期'),
          discriminator('effect', '产生 Reservation 业务对象', '不产生预约写入效果'),
        ]),
        contrast('action.reschedule_reservation', '预约改期', [
          discriminator('target_entity', '目标是尚未存在的新预约', '目标是已存在的预约'),
          discriminator('state_transition', '预约从不存在变为已创建', '已有预约时间发生更新'),
        ]),
        contrast('action.cancel_reservation', '取消预约', [
          discriminator('effect', '创建新的有效预约', '使已有预约进入取消状态'),
        ]),
      ],
    },
    riskPolicy: 'medium',
    capabilityKey: 'reservation_action_preview',
    gatewayActionKey: 'create_reservation',
    productEntry: ['src/app/pages/ProjectReservation.tsx', 'ProjectReservation.createReservation'],
    backendApi: ['packages/server-v2/src/reservations/reservations.controller.ts', 'ReservationsController.create'],
    capabilitySource: [
      'packages/server-v2/src/brain/capability/executors/brain-action-capability.executor.ts',
      'BrainActionCapabilityExecutor.reservationActionPreview',
    ],
    dataModels: ['Customer', 'Project', 'Beautician', 'Reservation'],
    permissions: {
      backendApi: 'core:store:reservations',
      capability: 'core:store:reservations',
      gateway: 'core:store:reservations',
    },
  }),
  action({
    actionKey: 'action.reschedule_reservation',
    domain: 'front_desk',
    name: '预约改期',
    aliases: ['调整预约时间', '改约', '预约改期'],
    description: '把当前门店已有预约调整到新的明确时间；目标预约和新时间必须可解析。',
    actionClass: 'transition',
    targetEntityRefs: ['entity.reservation'],
    entityModels: { 'entity.reservation': 'Reservation', 'entity.beautician': 'Beautician' },
    inputSlots: [
      entitySlot('reservation', '目标预约', 'object', 'entity.reservation', ['recognition', 'preview', 'execution']),
      slot('appointmentTime', '改期后时间', 'time', 'time', ['recognition', 'preview', 'execution'], {
        validationPolicy: 'store_timezone_future_time',
      }),
      slot('duration', '预计时长', 'quantity', 'number', ['execution'], { unitPolicy: 'minute' }),
      entitySlot('beautician', '服务美容师', 'service_provider', 'entity.beautician', ['execution']),
      slot('reason', '改期原因', 'condition', 'text', []),
    ],
    preconditions: [
      'context_store_resolved',
      'reservation_belongs_to_context_store',
      'appointment_time_resolved',
      'reservation_window_available',
    ],
    effects: ['reservation_time_updated'],
    lexicalSemantics: {
      semanticPredicates: [
        'updates:entity.reservation.time',
        'requires:existing_reservation',
        'state_transition:reservation_time_old_to_new',
      ],
      contrasts: [
        contrast('action.create_reservation', '创建预约', [
          discriminator('target_entity', '目标是已存在的预约', '目标是尚未存在的新预约'),
          discriminator('effect', '更新原预约时间并保留预约身份', '创建新的 Reservation 业务对象'),
        ]),
        contrast('action.cancel_reservation', '取消预约', [
          discriminator('state_transition', '预约保持可履约并更新到新时间', '预约进入取消状态'),
          discriminator('required_slot', '必须提供新的预约时间', '新的预约时间不是必需输入'),
        ]),
      ],
    },
    riskPolicy: 'high',
    capabilityKey: 'reservation_action_preview',
    gatewayActionKey: 'reschedule_reservation',
    productEntry: ['src/app/pages/ProjectReservation.tsx', 'ProjectReservation.updateReservation'],
    backendApi: ['packages/server-v2/src/reservations/reservations.controller.ts', 'ReservationsController.update'],
    capabilitySource: [
      'packages/server-v2/src/brain/capability/executors/brain-action-capability.executor.ts',
      'BrainActionCapabilityExecutor.reservationActionPreview',
    ],
    dataModels: ['Beautician', 'Reservation'],
    permissions: {
      backendApi: 'core:store:reservations',
      capability: 'core:store:reservations',
      gateway: 'core:store:reservations',
    },
  }),
  action({
    actionKey: 'action.cancel_reservation',
    domain: 'front_desk',
    name: '取消预约',
    aliases: ['撤销预约', '取消预约'],
    description: '取消当前门店尚未取消且可操作的预约；已取消预约不会生成新的取消动作预览。',
    actionClass: 'transition',
    targetEntityRefs: ['entity.reservation'],
    entityModels: { 'entity.reservation': 'Reservation' },
    inputSlots: [
      entitySlot('reservation', '目标预约', 'object', 'entity.reservation', ['recognition', 'preview', 'execution']),
      slot('reason', '取消原因', 'condition', 'text', []),
    ],
    preconditions: ['context_store_resolved', 'reservation_belongs_to_context_store'],
    effects: ['reservation_cancelled'],
    lexicalSemantics: {
      semanticPredicates: [
        'invalidates:reservation_fulfillment_plan',
        'requires:existing_reservation',
        'state_transition:reservation_active_to_cancelled',
      ],
      contrasts: [
        contrast('action.reschedule_reservation', '预约改期', [
          discriminator('state_transition', '预约进入取消状态', '预约保持可履约并更新到新时间'),
        ]),
        contrast('speech.cancel_action_request', '取消尚未执行的动作请求', [
          discriminator('target_entity', '目标是已经存在的预约业务对象', '目标是尚未执行的对话请求或确认记录'),
          discriminator('effect', '修改预约业务状态', '只终止待执行请求，不修改预约业务状态'),
        ]),
      ],
    },
    riskPolicy: 'high',
    capabilityKey: 'reservation_action_preview',
    gatewayActionKey: 'cancel_reservation',
    productEntry: ['src/app/pages/ProjectReservation.tsx', 'ProjectReservation.cancelReservation'],
    backendApi: ['packages/server-v2/src/reservations/reservations.controller.ts', 'ReservationsController.cancel'],
    capabilitySource: [
      'packages/server-v2/src/brain/capability/executors/brain-action-capability.executor.ts',
      'BrainActionCapabilityExecutor.reservationActionPreview',
    ],
    dataModels: ['Reservation'],
    permissions: {
      backendApi: 'core:store:reservations',
      capability: 'core:store:reservations',
      gateway: 'core:store:reservations',
    },
  }),
]);

export function createCuratedActionCandidates(): BusinessDefinitionCandidateDraft[] {
  return CURATED_ACTION_CATALOG.map((entry) => ({
    definitionKey: entry.identity.definitionKey,
    kind: 'action',
    domain: entry.identity.domain,
    name: entry.identity.name,
    ownerType: entry.identity.ownerType,
    ownerId: entry.identity.ownerId,
    lifecycleStatus: 'candidate',
    schemaVersion: entry.identity.schemaVersion,
    payload: structuredClone(entry.payload) as Record<string, unknown>,
    storeScope: structuredClone(entry.storeScope) as Record<string, unknown>,
    evidence: entry.evidence.map((item) => ({ ...item })),
  }));
}

export function findCuratedActionCatalogEntry(definitionKey: string) {
  return CURATED_ACTION_CATALOG.find((entry) => entry.identity.definitionKey === definitionKey);
}

interface ActionInput {
  actionKey: string;
  domain: string;
  name: string;
  aliases: string[];
  description: string;
  actionClass: string;
  targetEntityRefs: string[];
  entityModels: Record<string, string>;
  inputSlots: Array<Record<string, unknown>>;
  preconditions: string[];
  effects: string[];
  lexicalSemantics: {
    semanticPredicates: string[];
    contrasts: LexicalContrastInput[];
  };
  riskPolicy: 'medium' | 'high';
  capabilityKey: string;
  gatewayActionKey: string;
  productEntry: readonly [string, string];
  backendApi: readonly [string, string];
  capabilitySource: readonly [string, string];
  dataModels: string[];
  permissions: {
    backendApi: string;
    capability: string;
    gateway: string;
  };
}

function action(input: ActionInput): CuratedActionCatalogEntry {
  const identity: CanonicalOntologyCandidateIdentity = {
    definitionKey: input.actionKey,
    domain: input.domain,
    name: input.name,
    ownerType: 'ami_core_action_catalog',
    ownerId: `curated_action:${input.actionKey}`,
    schemaVersion: '1.1',
  };
  const preconditionPredicateRefs = input.preconditions.map(curatedActionPredicateRef);
  const effectAssertionRefs = input.effects.map(curatedActionEffectRef);
  const participantProfile = createBusinessActionParticipantProfile({
    actionKey: input.actionKey,
    inputSlots: input.inputSlots.map((item) => ({
      slotKey: String(item.slotKey ?? ''),
      semanticRole: String(item.semanticRole ?? '') as BusinessActionSemanticRole,
      requiredAt: Array.isArray(item.requiredAt)
        ? item.requiredAt.map(String).filter(isBusinessActionRequiredStage)
        : [],
    })),
  });
  const relationProfile = createBusinessActionRelationProfile({
    actionKey: input.actionKey,
    actionClass: input.actionClass as BusinessActionClass,
    targetEntityRefs: input.targetEntityRefs,
    participantProfile,
  });
  const institutionalEffect = createBusinessActionInstitutionalEffectProfile({
    actionKey: input.actionKey,
    preconditions: input.preconditions,
  });
  return {
    identity,
    payload: {
      actionKey: input.actionKey,
      aliases: [...input.aliases].sort(),
      description: input.description,
      actionClass: input.actionClass,
      targetEntityRefs: [...input.targetEntityRefs],
      inputSlots: input.inputSlots.map((item) => ({ ...item })),
      preconditions: [...input.preconditions],
      preconditionPredicateRefs,
      effects: [...input.effects],
      effectAssertionRefs,
      lexicalFrame: actionLexicalFrame(input),
      situationContext: createBusinessActionSituationContextProfile(input.actionKey),
      modalityPolicy: createBusinessActionModalityPolicy(input.actionKey),
      informationArtifact: createBusinessActionInformationArtifactProfile(input.actionKey),
      sideEffectInvariant: createBusinessActionSideEffectInvariantProfile({
        actionKey: input.actionKey,
        preconditions: input.preconditions,
        preconditionPredicateRefs,
        effects: input.effects,
        effectAssertionRefs,
        invariantContractRef: curatedActionInvariantRef(input.actionKey),
      }),
      participantProfile,
      relationProfile,
      ...(institutionalEffect ? { institutionalEffect } : {}),
      triggeredByEventRefs: [],
      emitsEventRefs: [],
      riskPolicy: input.riskPolicy,
      confirmationPolicy: 'required',
      idempotencyPolicy: 'required',
      capabilityBindings: [
        {
          capabilityKey: input.capabilityKey,
          bindingMode: 'preview_and_execute',
          gatewayActionKey: input.gatewayActionKey,
          priority: 0,
          enabled: true,
        },
      ],
    },
    storeScope: { mode: 'current_store' },
    entityModels: { ...input.entityModels },
    permissionContract: { ...input.permissions },
    evidence: actionEvidence(input),
  };
}

interface LexicalContrastInput {
  conceptKey: string;
  name: string;
  discriminators: LexicalDiscriminatorInput[];
}

interface LexicalDiscriminatorInput {
  dimension: string;
  currentActionValue: string;
  contrastActionValue: string;
}

function actionLexicalFrame(input: ActionInput) {
  return createBusinessActionLexicalFrame({
    actionKey: input.actionKey,
    actionClass: input.actionClass as BusinessActionClass,
    name: input.name,
    aliases: input.aliases,
    targetEntityRefs: input.targetEntityRefs,
    inputSlots: input.inputSlots.map((item) => ({
      slotKey: String(item.slotKey ?? ''),
      semanticRole: String(item.semanticRole ?? '') as BusinessActionSemanticRole,
    })),
    semanticPredicates: input.lexicalSemantics.semanticPredicates,
    preconditions: input.preconditions,
    effects: input.effects,
    contrasts: input.lexicalSemantics.contrasts as BusinessActionLexicalContrast[],
  });
}

function contrast(conceptKey: string, name: string, discriminators: LexicalDiscriminatorInput[]): LexicalContrastInput {
  return { conceptKey, name, discriminators };
}

function discriminator(
  dimension: string,
  currentActionValue: string,
  contrastActionValue: string,
): LexicalDiscriminatorInput {
  return { dimension, currentActionValue, contrastActionValue };
}

function actionEvidence(input: ActionInput): BusinessDefinitionCandidateEvidence[] {
  return [
    evidence('curated_action_catalog', CURATED_ACTION_CATALOG_SOURCE, input.actionKey, 'action_catalog_declaration'),
    evidence('product_ui', input.productEntry[0], input.productEntry[1], 'product_management_entry'),
    evidence('backend_controller', input.backendApi[0], input.backendApi[1], 'backend_api_contract'),
    evidence(
      'backend_permission',
      input.backendApi[0],
      `${input.backendApi[1]}:${input.permissions.backendApi}`,
      'backend_permission_contract',
    ),
    ...input.dataModels.map((model) =>
      evidence('prisma_schema_ast', 'packages/server-v2/prisma/schema.prisma', model, 'business_data_model'),
    ),
    evidence(
      'brain_capability_declaration',
      input.capabilitySource[0],
      input.capabilitySource[1],
      'capability_binding_contract',
    ),
    evidence(
      'brain_capability_permission',
      input.capabilitySource[0],
      `${input.capabilitySource[1]}:${input.permissions.capability}`,
      'capability_permission_contract',
    ),
    evidence(
      'brain_gateway_contract',
      'packages/server-v2/src/brain/skills/brain-capability-gateway.service.ts',
      `CAPABILITY_MAP.${input.gatewayActionKey}`,
      'gateway_execution_contract',
    ),
    evidence(
      'brain_gateway_permission',
      'packages/server-v2/src/brain/skills/brain-capability-gateway.service.ts',
      `CAPABILITY_MAP.${input.gatewayActionKey}:${input.permissions.gateway}`,
      'gateway_permission_contract',
    ),
    evidence(
      'brain_action_predicate_evaluator',
      ACTION_PREDICATE_EFFECT_EVALUATOR_SOURCE,
      ACTION_PREDICATE_EVALUATOR_SYMBOL,
      'action_predicate_evaluator_contract',
    ),
    evidence(
      'brain_action_effect_observer',
      ACTION_PREDICATE_EFFECT_EVALUATOR_SOURCE,
      ACTION_EFFECT_OBSERVER_SYMBOL,
      'action_effect_observer_contract',
    ),
    evidence(
      'brain_action_situation_context_profile',
      ACTION_SITUATION_CONTEXT_PROFILE_SOURCE,
      'createBusinessActionSituationContextProfile',
      'action_situation_context_profile_contract',
    ),
    evidence(
      'brain_action_situation_context_revalidation',
      ACTION_SITUATION_CONTEXT_REVALIDATION_SOURCE,
      'brainActionSituationContextIssue',
      'action_situation_context_execution_gate',
    ),
    evidence(
      'brain_action_modality_policy',
      ACTION_MODALITY_POLICY_SOURCE,
      'createBusinessActionModalityPolicy',
      'action_modality_policy_contract',
    ),
    evidence(
      'brain_action_information_artifact_profile',
      ACTION_INFORMATION_ARTIFACT_PROFILE_SOURCE,
      'createBusinessActionInformationArtifactProfile',
      'action_information_artifact_profile_contract',
    ),
    evidence(
      'brain_action_side_effect_invariant_profile',
      ACTION_SIDE_EFFECT_INVARIANT_PROFILE_SOURCE,
      'createBusinessActionSideEffectInvariantProfile',
      'action_side_effect_invariant_profile_contract',
    ),
    evidence(
      'brain_action_invariant_catalog',
      ACTION_INVARIANT_CATALOG_SOURCE,
      'curatedActionInvariantRef',
      'action_invariant_catalog_contract',
    ),
    evidence(
      'brain_action_participant_profile',
      ACTION_PARTICIPANT_PROFILE_SOURCE,
      'createBusinessActionParticipantProfile',
      'action_participant_profile_contract',
    ),
    evidence(
      'brain_action_relation_profile',
      ACTION_RELATION_PROFILE_SOURCE,
      'createBusinessActionRelationProfile',
      'action_relation_profile_contract',
    ),
    evidence(
      'brain_action_relation_catalog',
      ACTION_RELATION_CATALOG_SOURCE,
      'CURATED_ACTION_RELATION_DEFINITIONS',
      'action_relation_catalog_contract',
    ),
    evidence(
      'brain_action_institutional_effect_profile',
      ACTION_INSTITUTIONAL_EFFECT_PROFILE_SOURCE,
      'createBusinessActionInstitutionalEffectProfile',
      'action_institutional_effect_profile_contract',
    ),
  ];
}

function isBusinessActionRequiredStage(value: string): value is BusinessActionRequiredStage {
  return value === 'recognition' || value === 'preview' || value === 'execution';
}

function evidence(
  sourceType: string,
  sourcePath: string,
  sourceSymbol: string,
  evidenceKind: string,
): BusinessDefinitionCandidateEvidence {
  return { sourceType, sourcePath, sourceSymbol, evidenceKind, confidence: 1 };
}

function entitySlot(
  slotKey: string,
  label: string,
  semanticRole: string,
  entityTypeRef: string,
  requiredAt: string[],
  options: Record<string, unknown> = {},
) {
  return slot(slotKey, label, semanticRole, 'entity_ref', requiredAt, { entityTypeRef, ...options });
}

function slot(
  slotKey: string,
  label: string,
  semanticRole: string,
  valueType: string,
  requiredAt: string[],
  options: Record<string, unknown> = {},
) {
  return {
    slotKey,
    label,
    semanticRole,
    valueType,
    requiredAt: [...requiredAt],
    cardinality: 'one',
    sensitive: options.sensitive === true,
    ...(typeof options.entityTypeRef === 'string' ? { entityTypeRef: options.entityTypeRef } : {}),
    ...(typeof options.unitPolicy === 'string' ? { unitPolicy: options.unitPolicy } : {}),
    ...(typeof options.resolutionPolicy === 'string' ? { resolutionPolicy: options.resolutionPolicy } : {}),
    ...(typeof options.validationPolicy === 'string' ? { validationPolicy: options.validationPolicy } : {}),
    ...(typeof options.defaultPolicy === 'string' ? { defaultPolicy: options.defaultPolicy } : {}),
    confirmationDisplay: options.confirmationDisplay !== false,
  };
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return value;
}
