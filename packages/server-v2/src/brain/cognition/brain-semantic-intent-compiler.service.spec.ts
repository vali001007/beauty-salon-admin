import { MODULE_METADATA } from '@nestjs/common/constants';
import { AiModule } from '../../ai/ai.module.js';
import {
  AiStructuredOutputError,
  type AiService,
  type AiStructuredOutputInput,
  type AiStructuredOutputResult,
} from '../../ai/ai.service.js';
import { BrainModule } from '../brain.module.js';
import type { BrainRuntimeConfigService } from '../config/brain-runtime-config.service.js';
import { BRAIN_SEMANTIC_INTENT_SYSTEM_PROMPT } from './brain-semantic-intent-compiler.prompt.js';
import {
  BrainSemanticIntentCompilerService,
  type BrainSemanticIntentCompilerInput,
} from './brain-semantic-intent-compiler.service.js';
import {
  BRAIN_SEMANTIC_INTENT_MODEL_JSON_SCHEMA,
  BRAIN_SEMANTIC_INTENT_PROMPT_SCHEMA,
} from './brain-semantic-intent.schema.js';
import type { BrainDefinitionRef, BrainSemanticIntent } from './brain-semantic-intent.types.js';
import { createTestBusinessActionInformationArtifactProfile } from './business-action-information-artifact.testing.js';
import { createTestBusinessActionLexicalFrame } from './business-action-lexical-frame.testing.js';
import { createTestBusinessActionModalityPolicy } from './business-action-modality-policy.testing.js';
import { createTestBusinessActionSideEffectInvariantProfile } from './business-action-side-effect-invariant.testing.js';
import { createTestBusinessActionSituationContextProfile } from './business-action-situation-context.testing.js';
import type { ProductionReadyBusinessDefinitionSnapshot } from './business-definition-snapshot.types.js';
import { BrainTimeRangeParserService } from './brain-time-range-parser.service.js';

const productEntityRef = {
  definitionType: 'entity',
  definitionKey: 'entity.product',
  definitionVersion: 3,
  definitionFingerprint: '1'.repeat(64),
  sourceFingerprint: '2'.repeat(64),
} as const;

const productSalesMetricRef = {
  definitionType: 'metric',
  definitionKey: 'metric.product_sales_amount',
  definitionVersion: 2,
  definitionFingerprint: '3'.repeat(64),
  sourceFingerprint: '4'.repeat(64),
} as const;

const productDimensionRef = {
  definitionType: 'dimension',
  definitionKey: 'dimension.product',
  definitionVersion: 4,
  definitionFingerprint: '5'.repeat(64),
  sourceFingerprint: '6'.repeat(64),
} as const;

const paidAmountMetricRef = {
  definitionType: 'metric',
  definitionKey: 'metric.paid_amount',
  definitionVersion: 8,
  definitionFingerprint: '7'.repeat(64),
  sourceFingerprint: '8'.repeat(64),
} as const;

const orderCountMetricRef = {
  definitionType: 'metric',
  definitionKey: 'metric.order_count',
  definitionVersion: 1,
  definitionFingerprint: '7b'.repeat(32),
  sourceFingerprint: '8b'.repeat(32),
} as const;

const paymentMethodDimensionRef = {
  definitionType: 'dimension',
  definitionKey: 'dimension.paymentMethod',
  definitionVersion: 2,
  definitionFingerprint: '9'.repeat(64),
  sourceFingerprint: 'a'.repeat(64),
} as const;

const cardNameDimensionRef = {
  definitionType: 'dimension',
  definitionKey: 'dimension.cardName',
  definitionVersion: 1,
  definitionFingerprint: '9c'.repeat(32),
  sourceFingerprint: 'ac'.repeat(32),
} as const;

const refundAmountMetricRef = {
  definitionType: 'metric',
  definitionKey: 'metric.refund_amount',
  definitionVersion: 1,
  definitionFingerprint: '9'.repeat(64),
  sourceFingerprint: 'a'.repeat(64),
} as const;

const customerEntityRef = {
  definitionType: 'entity',
  definitionKey: 'entity.customer',
  definitionVersion: 1,
  definitionFingerprint: 'b'.repeat(64),
  sourceFingerprint: 'c'.repeat(64),
} as const;

const purchaseOrderActionRef = {
  definitionType: 'action',
  definitionKey: 'action.create_purchase_order',
  definitionVersion: 1,
  definitionFingerprint: 'f'.repeat(64),
  sourceFingerprint: '0'.repeat(64),
} as const;

const projectEntityRef = {
  definitionType: 'entity',
  definitionKey: 'entity.project',
  definitionVersion: 1,
  definitionFingerprint: 'd'.repeat(64),
  sourceFingerprint: 'e'.repeat(64),
} as const;

const projectServiceCountMetricRef = {
  definitionType: 'metric',
  definitionKey: 'metric.project_service_count',
  definitionVersion: 1,
  definitionFingerprint: 'ab'.repeat(32),
  sourceFingerprint: 'cd'.repeat(32),
} as const;

const refundCountMetricRef = {
  definitionType: 'metric',
  definitionKey: 'metric.refund_count',
  definitionVersion: 2,
  definitionFingerprint: 'f'.repeat(64),
  sourceFingerprint: '0'.repeat(64),
} as const;

const grossProfitMetricRef = {
  definitionType: 'metric',
  definitionKey: 'metric.gross_profit_amount',
  definitionVersion: 1,
  definitionFingerprint: '1a'.repeat(32),
  sourceFingerprint: '2a'.repeat(32),
} as const;

const operatingProfitMetricRef = {
  definitionType: 'metric',
  definitionKey: 'metric.operating_profit_amount',
  definitionVersion: 1,
  definitionFingerprint: '3a'.repeat(32),
  sourceFingerprint: '4a'.repeat(32),
} as const;

const costIncomeRatioMetricRef = {
  definitionType: 'metric',
  definitionKey: 'metric.cost_income_ratio',
  definitionVersion: 1,
  definitionFingerprint: '5a'.repeat(32),
  sourceFingerprint: '6a'.repeat(32),
} as const;

const cashShiftReconciliationRateMetricRef = {
  definitionType: 'metric',
  definitionKey: 'metric.cash_shift_reconciliation_rate',
  definitionVersion: 1,
  definitionFingerprint: '7a'.repeat(32),
  sourceFingerprint: '8a'.repeat(32),
} as const;

const storedValueLiabilityMetricRef = {
  definitionType: 'metric',
  definitionKey: 'metric.stored_value_liability',
  definitionVersion: 1,
  definitionFingerprint: '9a'.repeat(32),
  sourceFingerprint: 'aa'.repeat(32),
} as const;

const unfulfilledCardLiabilityMetricRef = {
  definitionType: 'metric',
  definitionKey: 'metric.unfulfilled_card_liability',
  definitionVersion: 1,
  definitionFingerprint: 'ab'.repeat(32),
  sourceFingerprint: 'ac'.repeat(32),
} as const;

const cardRecognizedRevenueMetricRef = {
  definitionType: 'metric',
  definitionKey: 'metric.card_recognized_revenue_amount',
  definitionVersion: 1,
  definitionFingerprint: 'ad'.repeat(32),
  sourceFingerprint: 'ae'.repeat(32),
} as const;

const orderGrossProfitMetricRef = {
  definitionType: 'metric',
  definitionKey: 'metric.order_gross_profit_amount',
  definitionVersion: 1,
  definitionFingerprint: 'af'.repeat(32),
  sourceFingerprint: 'b0'.repeat(32),
} as const;

const negativeMarginOrderCountMetricRef = {
  definitionType: 'metric',
  definitionKey: 'metric.negative_margin_order_count',
  definitionVersion: 1,
  definitionFingerprint: 'b1'.repeat(32),
  sourceFingerprint: 'b2'.repeat(32),
} as const;

const prepaidOrderGrossProfitMetricRef = {
  definitionType: 'metric',
  definitionKey: 'metric.prepaid_order_gross_profit_amount',
  definitionVersion: 1,
  definitionFingerprint: 'b3'.repeat(32),
  sourceFingerprint: 'b4'.repeat(32),
} as const;

const productOrderTotalCostMetricRef = {
  definitionType: 'metric',
  definitionKey: 'metric.product_order_total_cost_amount',
  definitionVersion: 1,
  definitionFingerprint: 'b5'.repeat(32),
  sourceFingerprint: 'b6'.repeat(32),
} as const;

const productOrderGrossProfitMetricRef = {
  definitionType: 'metric',
  definitionKey: 'metric.product_order_gross_profit_amount',
  definitionVersion: 1,
  definitionFingerprint: 'b7'.repeat(32),
  sourceFingerprint: 'b8'.repeat(32),
} as const;

const staffCommissionMetricRef = {
  definitionType: 'metric',
  definitionKey: 'metric.staff_commission_amount',
  definitionVersion: 2,
  definitionFingerprint: '1'.repeat(64),
  sourceFingerprint: '2'.repeat(64),
} as const;

const staffCommissionComponentMetricRef = {
  definitionType: 'metric',
  definitionKey: 'metric.staff_commission_component_amount',
  definitionVersion: 1,
  definitionFingerprint: '12'.repeat(32),
  sourceFingerprint: '34'.repeat(32),
} as const;

const commissionTypeDimensionRef = {
  definitionType: 'dimension',
  definitionKey: 'dimension.commissionType',
  definitionVersion: 1,
  definitionFingerprint: '56'.repeat(32),
  sourceFingerprint: '78'.repeat(32),
} as const;

const staffServiceCountMetricRef = {
  definitionType: 'metric',
  definitionKey: 'metric.staff_service_count',
  definitionVersion: 3,
  definitionFingerprint: '3'.repeat(64),
  sourceFingerprint: '4'.repeat(64),
} as const;

const staffUniqueCustomerCountMetricRef = {
  definitionType: 'metric',
  definitionKey: 'metric.staff_unique_customer_count',
  definitionVersion: 1,
  definitionFingerprint: '4a'.repeat(32),
  sourceFingerprint: '4b'.repeat(32),
} as const;

const staffServiceRevenueMetricRef = {
  definitionType: 'metric',
  definitionKey: 'metric.staff_service_revenue',
  definitionVersion: 1,
  definitionFingerprint: '4c'.repeat(32),
  sourceFingerprint: '4d'.repeat(32),
} as const;

const beauticianEntityRef = {
  definitionType: 'entity',
  definitionKey: 'entity.beautician',
  definitionVersion: 1,
  definitionFingerprint: '4e'.repeat(32),
  sourceFingerprint: '4f'.repeat(32),
} as const;

const beauticianNameDimensionRef = {
  definitionType: 'dimension',
  definitionKey: 'dimension.beauticianName',
  definitionVersion: 1,
  definitionFingerprint: '5a'.repeat(32),
  sourceFingerprint: '5b'.repeat(32),
} as const;

const newCustomerCountMetricRef = {
  definitionType: 'metric',
  definitionKey: 'metric.new_customer_count',
  definitionVersion: 1,
  definitionFingerprint: '5'.repeat(64),
  sourceFingerprint: '6'.repeat(64),
} as const;

const newCustomerConversionCountMetricRef = {
  definitionType: 'metric',
  definitionKey: 'metric.new_customer_conversion_count',
  definitionVersion: 1,
  definitionFingerprint: '7'.repeat(64),
  sourceFingerprint: '8'.repeat(64),
} as const;

const newCustomerConversionRateMetricRef = {
  definitionType: 'metric',
  definitionKey: 'metric.new_customer_conversion_rate',
  definitionVersion: 1,
  definitionFingerprint: '9'.repeat(64),
  sourceFingerprint: 'a'.repeat(64),
} as const;

const dormantReactivationMetricRef = {
  definitionType: 'metric',
  definitionKey: 'metric.dormant_reactivation_customer_count',
  definitionVersion: 1,
  definitionFingerprint: 'd'.repeat(64),
  sourceFingerprint: 'e'.repeat(64),
} as const;

const customerAgeGroupDimensionRef = {
  definitionType: 'dimension',
  definitionKey: 'dimension.customerAgeGroup',
  definitionVersion: 1,
  definitionFingerprint: 'b'.repeat(64),
  sourceFingerprint: 'c'.repeat(64),
} as const;

const customerLevelDimensionRef = {
  definitionType: 'dimension',
  definitionKey: 'dimension.customerLevel',
  definitionVersion: 1,
  definitionFingerprint: 'c'.repeat(64),
  sourceFingerprint: 'd'.repeat(64),
} as const;

const stockRiskMetricRef = {
  definitionType: 'metric',
  definitionKey: 'metric.stock_risk_score',
  definitionVersion: 6,
  definitionFingerprint: 'b'.repeat(64),
  sourceFingerprint: 'c'.repeat(64),
} as const;

const productNameDimensionRef = {
  definitionType: 'dimension',
  definitionKey: 'dimension.productName',
  definitionVersion: 4,
  definitionFingerprint: 'd'.repeat(64),
  sourceFingerprint: 'e'.repeat(64),
} as const;

const productRankingIntent: BrainSemanticIntent = {
  schemaVersion: '1.0',
  objective: '按商品汇总销售额并从高到低排名',
  domains: ['product_sales'],
  intent: 'ranking',
  entities: [
    {
      entityType: 'product',
      mention: '商品',
      source: 'user',
      definitionRef: productEntityRef,
      confidence: 0.98,
    },
  ],
  metrics: [productSalesMetricRef],
  dimensions: [productDimensionRef],
  filters: [],
  timeRange: { preset: 'this_month', label: '本月', timezone: 'Asia/Shanghai' },
  orderBy: [{ definitionRef: productSalesMetricRef, direction: 'desc' }],
  limit: 10,
  answerShape: 'ranking',
  successCriteria: ['返回商品销售额降序排行'],
  ambiguities: [],
  missingSlots: [],
  assumptions: [],
  confidence: 0.96,
  decisionSummary: '用户要查看商品销售排行。',
};

const draftIntent: BrainSemanticIntent = {
  schemaVersion: '1.0',
  objective: '起草一条提醒客户预约的消息',
  domains: ['customer_service'],
  intent: 'draft',
  entities: [],
  metrics: [],
  dimensions: [],
  filters: [],
  orderBy: [],
  answerShape: 'draft',
  successCriteria: ['输出可供员工审核的预约提醒文案'],
  ambiguities: [],
  missingSlots: [],
  assumptions: [],
  confidence: 0.95,
  decisionSummary: '用户要起草预约提醒，不是在查询预约数量。',
};

const ontologySnapshot: ProductionReadyBusinessDefinitionSnapshot = {
  productionReady: true,
  fingerprint: 'ontology-snapshot-v7',
  entities: [
    {
      definitionKey: productEntityRef.definitionKey,
      version: productEntityRef.definitionVersion,
      definitionFingerprint: productEntityRef.definitionFingerprint,
      sourceFingerprint: productEntityRef.sourceFingerprint,
      domain: 'product_sales',
      entityKey: 'product',
      name: '商品',
      aliases: ['货品', '产品'],
      attributes: { category: true },
      tableMap: { model: 'SensitiveProductTable' },
    },
  ],
  relations: [],
  metrics: [
    {
      definitionKey: productSalesMetricRef.definitionKey,
      version: productSalesMetricRef.definitionVersion,
      definitionFingerprint: productSalesMetricRef.definitionFingerprint,
      sourceFingerprint: productSalesMetricRef.sourceFingerprint,
      metricKey: 'product_sales_amount',
      name: '商品销售额',
      domain: 'product_sales',
      formula: { sql: 'SUM(secret_amount)' },
      source: { model: 'SensitiveOrderTable' },
      defaultFilters: {},
      permissions: ['store:finance:read'],
      description: '商品实收销售金额',
    },
  ],
  dimensions: [
    {
      definitionKey: productDimensionRef.definitionKey,
      version: productDimensionRef.definitionVersion,
      definitionFingerprint: productDimensionRef.definitionFingerprint,
      sourceFingerprint: productDimensionRef.sourceFingerprint,
      dimensionKey: 'product',
      name: '商品',
      domain: 'product_sales',
      source: { model: 'SensitiveProductTable' },
      permissions: ['store:product:read'],
    },
  ],
  actions: [
    {
      definitionKey: purchaseOrderActionRef.definitionKey,
      version: purchaseOrderActionRef.definitionVersion,
      definitionFingerprint: purchaseOrderActionRef.definitionFingerprint,
      sourceFingerprint: purchaseOrderActionRef.sourceFingerprint,
      domain: 'product_sales',
      actionKey: purchaseOrderActionRef.definitionKey,
      name: '创建采购单',
      aliases: ['下采购单', '采购下单'],
      description: '为门店商品创建待确认采购单预览',
      actionClass: 'create',
      targetEntityRefs: [productEntityRef.definitionKey],
      inputSlots: [
        {
          slotKey: 'product',
          label: '商品',
          semanticRole: 'object',
          valueType: 'entity_ref',
          entityTypeRef: productEntityRef.definitionKey,
          requiredAt: ['recognition', 'preview', 'execution'],
          cardinality: 'one',
          sensitive: false,
          confirmationDisplay: true,
        },
        {
          slotKey: 'quantity',
          label: '采购数量',
          semanticRole: 'quantity',
          valueType: 'number',
          unitPolicy: 'product_purchase_unit',
          requiredAt: ['recognition', 'preview', 'execution'],
          cardinality: 'one',
          sensitive: false,
          confirmationDisplay: true,
        },
      ],
      preconditions: ['product_belongs_to_context_store', 'quantity_positive'],
      preconditionPredicateRefs: [
        { key: 'product_belongs_to_context_store', version: 1, fingerprint: 'a'.repeat(64) },
        { key: 'quantity_positive', version: 1, fingerprint: 'b'.repeat(64) },
      ],
      effects: ['purchase_order_created'],
      effectAssertionRefs: [{ key: 'purchase_order_created', version: 1, fingerprint: 'c'.repeat(64) }],
      lexicalFrame: createTestBusinessActionLexicalFrame({
        actionKey: purchaseOrderActionRef.definitionKey,
        name: '创建采购单',
        aliases: ['下采购单', '采购下单'],
        inputSlots: [
          { slotKey: 'product', semanticRole: 'object' },
          { slotKey: 'quantity', semanticRole: 'quantity' },
        ],
      }),
      situationContext: createTestBusinessActionSituationContextProfile(purchaseOrderActionRef.definitionKey),
      modalityPolicy: createTestBusinessActionModalityPolicy(purchaseOrderActionRef.definitionKey),
      informationArtifact: createTestBusinessActionInformationArtifactProfile(purchaseOrderActionRef.definitionKey),
      sideEffectInvariant: createTestBusinessActionSideEffectInvariantProfile(purchaseOrderActionRef.definitionKey, {
        preconditions: ['product_belongs_to_context_store', 'quantity_positive'],
        preconditionPredicateRefs: [
          { key: 'product_belongs_to_context_store', version: 1, fingerprint: 'a'.repeat(64) },
          { key: 'quantity_positive', version: 1, fingerprint: 'b'.repeat(64) },
        ],
        effects: ['purchase_order_created'],
        effectAssertionRefs: [{ key: 'purchase_order_created', version: 1, fingerprint: 'c'.repeat(64) }],
      }),
      triggeredByEventRefs: [],
      emitsEventRefs: ['event.purchase_order_created'],
      riskPolicy: 'high',
      confirmationPolicy: 'required',
      idempotencyPolicy: 'required',
      capabilityBindings: [
        {
          capabilityKey: 'purchase_order_draft',
          bindingMode: 'preview_and_execute',
          gatewayActionKey: 'create_purchase_order',
          priority: 0,
          enabled: true,
        },
      ],
      bindingFingerprint: 'e'.repeat(64),
    },
  ],
};

function compilerInput(question: string): BrainSemanticIntentCompilerInput {
  return {
    question,
    audit: { userId: 9, storeId: 6 },
    timezone: 'Asia/Shanghai',
    role: 'store_manager',
    conversationSlots: {
      lastEntity: 'product',
      lastTimeRange: 'this_month',
      userId: 998,
      nested: { storeId: 6, permissions: ['*'], safeSlot: 'keep-me' },
      user_id: 9,
      store_id: 6,
      permission: 'core:finance:view',
      requiredPermissions: ['*'],
      tenantId: 12,
      tenant: 'tenant-a',
      storeScope: 'all',
      visibleStoreIds: [6, 7],
      deniedPermissions: ['core:finance:view'],
      permissionCodes: ['*'],
      user: { id: 9 },
      store: { id: 6 },
      role: 'super_admin',
    },
    ontologySnapshot,
    ontologyCandidates: [],
    metricRefs: [productSalesMetricRef],
    dimensionRefs: [productDimensionRef],
    capabilitySummaries: [
      {
        key: 'product.sales.ranking',
        name: '商品销售排行',
        description: '按商品汇总并排序销售表现',
        domains: ['product_sales'],
        intents: ['ranking'],
        examples: ['本月商品销售排行'],
        readOnly: true,
      },
    ],
  };
}

function exactCustomerCompilerInput(question: string): BrainSemanticIntentCompilerInput {
  const input = compilerInput(question);
  input.ontologySnapshot = {
    ...ontologySnapshot,
    entities: [
      ...ontologySnapshot.entities,
      {
        definitionKey: customerEntityRef.definitionKey,
        version: customerEntityRef.definitionVersion,
        definitionFingerprint: customerEntityRef.definitionFingerprint,
        sourceFingerprint: customerEntityRef.sourceFingerprint,
        domain: 'customer',
        entityKey: 'customer',
        name: '客户',
        aliases: ['顾客', '会员'],
        attributes: {},
        tableMap: { model: 'Customer' },
      },
    ],
  };
  input.capabilitySummaries = [
    {
      key: 'customer_facts',
      name: '客户事实与客群查询',
      description: '查询当前门店的精确客户事实和基于事实的只读建议',
      domains: ['customer'],
      intents: ['query', 'ranking', 'comparison', 'diagnosis'],
      examples: ['帮我查一下张女士的客户资料'],
      readOnly: true,
      sideEffect: false,
      definitionRefs: [customerEntityRef],
    },
  ];
  input.ontologyCandidates = [
    {
      definitionRef: customerEntityRef,
      name: '客户',
      domain: 'customer',
      aliases: ['顾客', '会员'],
      entityKey: 'customer',
    },
  ];
  return input;
}

function fakeAiService(
  generate: (input: AiStructuredOutputInput) => Promise<AiStructuredOutputResult<BrainSemanticIntent>>,
) {
  return {
    generateStructured: jest.fn(generate),
  } as unknown as AiService;
}

function structuredResult(data: BrainSemanticIntent): AiStructuredOutputResult<BrainSemanticIntent> {
  return {
    data,
    rawText: JSON.stringify(data),
    provider: 'fake-provider',
    model: 'fake-model',
    usage: {
      provider: 'fake-provider',
      model: 'fake-model',
      inputTokens: 120,
      outputTokens: 80,
    },
  };
}

function createCompiler(aiService: AiService) {
  const config = {
    runtime: { modelTimeoutMs: 4321 },
  } as BrainRuntimeConfigService;
  return new BrainSemanticIntentCompilerService(aiService, config, new BrainTimeRangeParserService());
}

function financeMetricDefinition(
  ref: BrainDefinitionRef<'metric'>,
  metricKey: string,
  name: string,
  aliases: string[] = [],
) {
  return {
    definitionKey: ref.definitionKey,
    version: ref.definitionVersion,
    definitionFingerprint: ref.definitionFingerprint,
    sourceFingerprint: ref.sourceFingerprint,
    metricKey,
    name,
    aliases,
    domain: 'finance',
    formula: { sql: 'governed-test-metric' },
    source: { model: 'DailySettlement' },
    defaultFilters: {},
    permissions: ['core:finance:view'],
    description: name,
  };
}

describe('BrainSemanticIntentCompilerService', () => {
  it.each([
    ['何思琪累计消费了多少钱', '何思琪', 'query', 'list'],
    ['何思琪是从哪个渠道来的', '何思琪', 'query', 'list'],
    ['王思琪适合推荐什么项目，为什么', '王思琪', 'recommendation', 'diagnosis'], // BQ0152
  ])(
    'uses the governed exact-customer fast path without waiting for model entity extraction: %s',
    async (question, customerName, intent, answerShape) => {
      const aiService = fakeAiService(async () => {
        throw new Error('exact customer fast path must not call the model');
      });
      const compiler = createCompiler(aiService);

      const result = await compiler.compile(exactCustomerCompilerInput(question));

      expect(result).toMatchObject({
        status: 'completed',
        provider: 'governed_contract',
        model: 'customer_facts_fast_path',
        selectedCapabilityKey: 'customer_facts',
        intent: {
          intent,
          answerShape,
          domains: ['customer'],
          entities: [
            expect.objectContaining({
              entityType: 'customer',
              mention: customerName,
              source: 'user',
              definitionRef: customerEntityRef,
            }),
          ],
          missingSlots: [],
          ambiguities: [],
        },
      });
      expect(aiService.generateStructured).not.toHaveBeenCalled();
    },
  );

  it.each(['本月商品销售排行', '哪些货卖得最好'])(
    'compiles product ranking paraphrase into the same governed semantic intent: %s',
    async (question) => {
      const routedResult =
        question === '本月商品销售排行'
          ? {
              ...structuredResult(productRankingIntent),
              provider: 'deepseek(fallback)',
              model: 'deepseek-v4-flash',
              routing: {
                primarySkipped: false,
                fallbackUsed: true,
                primaryErrorCode: 'PROVIDER_UNAVAILABLE' as const,
                primaryCircuitState: 'closed' as const,
                fallbackCircuitState: 'closed' as const,
                redundancyMode: 'independent_route' as const,
              },
            }
          : structuredResult(productRankingIntent);
      const aiService = fakeAiService(async () => routedResult);
      const compiler = createCompiler(aiService);

      const result = await compiler.compile(compilerInput(question));

      expect(result).toMatchObject({
        status: 'completed',
        intent: productRankingIntent,
        provider: question === '本月商品销售排行' ? 'deepseek(fallback)' : 'fake-provider',
        model: question === '本月商品销售排行' ? 'deepseek-v4-flash' : 'fake-model',
      });
      if (question === '本月商品销售排行') {
        expect(result).toMatchObject({
          routing: { fallbackUsed: true, primaryErrorCode: 'PROVIDER_UNAVAILABLE' },
        });
      }
      const request = (aiService.generateStructured as jest.Mock).mock.calls[0][0] as AiStructuredOutputInput;
      expect(request.messages[1].content).toContain(question);
    },
  );

  it('hydrates compact model definition keys from the published Ontology snapshot', async () => {
    const compactIntent = {
      ...productRankingIntent,
      intent: ['ranking', 'query'],
      answerShape: ['ranking', 'list'],
      entities: productRankingIntent.entities.map((entity) => ({
        ...entity,
        source: 'question',
        definitionRef: { definitionType: 'entity', definitionKey: productEntityRef.definitionKey },
      })),
      metrics: [{ definitionType: 'metric', definitionKey: productSalesMetricRef.definitionKey }],
      dimensions: [{ definitionType: 'dimension', definitionKey: productDimensionRef.definitionKey }],
      orderBy: [
        {
          definitionRef: { definitionType: 'metric', definitionKey: productSalesMetricRef.definitionKey },
          direction: 'desc',
        },
      ],
    } as unknown as BrainSemanticIntent;
    const compiler = createCompiler(fakeAiService(async () => structuredResult(compactIntent)));

    const result = await compiler.compile(compilerInput('本月商品销售排行'));

    expect(result).toMatchObject({
      status: 'completed',
      intent: {
        intent: 'ranking',
        answerShape: 'ranking',
        entities: [expect.objectContaining({ source: 'user', definitionRef: productEntityRef })],
        metrics: [productSalesMetricRef],
        dimensions: [productDimensionRef],
        orderBy: [{ definitionRef: productSalesMetricRef, direction: 'desc' }],
      },
    });
  });

  it('keeps appointment reminder copy as draft intent without appointment_count metric', async () => {
    const aiService = fakeAiService(async () => structuredResult(draftIntent));
    const compiler = createCompiler(aiService);

    const result = await compiler.compile(compilerInput('写一条提醒客户预约消息'));

    expect(result.status).toBe('completed');
    if (result.status === 'completed') {
      expect(result.intent.intent).toBe('draft');
      expect(result.intent.answerShape).toBe('draft');
      expect(result.intent.metrics).toEqual([]);
      expect(result.intent.metrics.some((ref) => ref.definitionKey === 'appointment_count')).toBe(false);
    }
  });

  it('fills an explicit question time range and removes a false model missing slot', async () => {
    const modelIntent: BrainSemanticIntent = {
      ...productRankingIntent,
      timeRange: undefined,
      missingSlots: ['timeRange'],
    };
    const compiler = createCompiler(fakeAiService(async () => structuredResult(modelIntent)));

    const result = await compiler.compile(compilerInput('本月商品销售排行'));

    expect(result).toMatchObject({
      status: 'completed',
      intent: {
        timeRange: { preset: 'this_month', label: '本月', timezone: 'Asia/Shanghai' },
        missingSlots: [],
      },
    });
  });

  it('removes a natural-language time missing slot when the intent already contains a governed range', async () => {
    const modelIntent: BrainSemanticIntent = {
      ...productRankingIntent,
      timeRange: {
        label: '最近30天',
        timezone: 'Asia/Shanghai',
        startDate: '2026-06-17',
        endDate: '2026-07-16',
      },
      missingSlots: ['用户未指定时间范围，默认使用最近周期（如本月）'],
    };
    const compiler = createCompiler(fakeAiService(async () => structuredResult(modelIntent)));

    const result = await compiler.compile(compilerInput('最近卖得最好的产品是什么'));

    expect(result).toMatchObject({
      status: 'completed',
      intent: {
        timeRange: { label: '最近30天', timezone: 'Asia/Shanghai' },
        missingSlots: [],
      },
    });
  });

  it('removes a time ambiguity after a deterministic inactivity threshold was resolved', async () => {
    const modelIntent: BrainSemanticIntent = {
      ...productRankingIntent,
      objective: '统计45天未到店客户',
      intent: 'query',
      metrics: [],
      dimensions: [],
      orderBy: [],
      answerShape: 'scalar',
      timeRange: undefined,
      ambiguities: [{ slot: 'timeRange', reason: '需要确认时间基准', candidates: ['当前时间', '指定日期'] }],
      missingSlots: ['timeRange'],
    };
    const compiler = createCompiler(fakeAiService(async () => structuredResult(modelIntent)));

    const result = await compiler.compile(compilerInput('帮我找一下45天没来的客户，大概有多少人'));

    expect(result).toMatchObject({
      status: 'completed',
      intent: {
        timeRange: { label: '45天未活跃阈值', timezone: 'Asia/Shanghai' },
        ambiguities: [],
        missingSlots: [],
      },
    });
  });

  it('materializes explicit current and previous periods after the model identifies a comparison', async () => {
    const modelIntent: BrainSemanticIntent = {
      ...productRankingIntent,
      objective: '找出本周与上周销售额差距最大的日期',
      intent: 'comparison',
      answerShape: 'comparison',
      timeRange: undefined,
      comparisonTarget: undefined,
      missingSlots: ['comparisonTarget', 'timeRange'],
    };
    const compiler = createCompiler(fakeAiService(async () => structuredResult(modelIntent)));

    const result = await compiler.compile(compilerInput('本周跟上周比，哪天销售额差距最大'));

    expect(result).toMatchObject({
      status: 'completed',
      intent: {
        timeRange: { preset: 'this_week', label: '本周', timezone: 'Asia/Shanghai' },
        comparisonTarget: {
          type: 'time',
          timeRange: { preset: 'last_week', label: '上周', timezone: 'Asia/Shanghai' },
        },
        missingSlots: [],
      },
    });
  });

  it('resolves a generic month-over-month comparison and removes model time ambiguities', async () => {
    const modelIntent: BrainSemanticIntent = {
      ...productRankingIntent,
      objective: '判断收入环比涨跌和差额',
      intent: 'comparison',
      metrics: [],
      dimensions: [],
      orderBy: [],
      answerShape: 'comparison',
      timeRange: undefined,
      comparisonTarget: undefined,
      ambiguities: [{ slot: 'timeRange', reason: '未指定环比周期', candidates: [] }],
      missingSlots: ['timeRange', 'comparisonTarget'],
    };
    const compiler = createCompiler(fakeAiService(async () => structuredResult(modelIntent)));

    const result = await compiler.compile(compilerInput('收入环比是涨了还是跌了，差额多少'));

    expect(result).toMatchObject({
      status: 'completed',
      intent: {
        timeRange: { preset: 'this_month', label: '本月', timezone: 'Asia/Shanghai' },
        comparisonTarget: {
          type: 'time',
          timeRange: { preset: 'last_month', label: '上月', timezone: 'Asia/Shanghai' },
        },
        ambiguities: [],
        missingSlots: [],
      },
    });
  });

  it('aligns a query intent with its model-selected diagnosis shape and referenced definition domains', async () => {
    const modelIntent: BrainSemanticIntent = {
      ...productRankingIntent,
      intent: 'query',
      domains: ['finance'],
      answerShape: 'diagnosis',
      orderBy: [],
    };
    const compiler = createCompiler(fakeAiService(async () => structuredResult(modelIntent)));

    const result = await compiler.compile(compilerInput('本月商品经营情况有什么异常'));

    expect(result).toMatchObject({
      status: 'completed',
      intent: {
        intent: 'diagnosis',
        domains: expect.arrayContaining(['finance', 'product_sales']),
      },
    });
  });

  it('materializes the governed usual baseline for an average-ticket comparison', async () => {
    const modelIntent: BrainSemanticIntent = {
      ...productRankingIntent,
      intent: 'comparison',
      metrics: [],
      dimensions: [],
      orderBy: [],
      answerShape: 'comparison',
      comparisonTarget: undefined,
    };
    const compiler = createCompiler(fakeAiService(async () => structuredResult(modelIntent)));

    const result = await compiler.compile(compilerInput('今天客单价多少，跟平时比怎么样'));

    expect(result).toMatchObject({
      status: 'completed',
      intent: {
        timeRange: { preset: 'today', label: '今天', timezone: 'Asia/Shanghai' },
        comparisonTarget: {
          type: 'time',
          timeRange: {
            label: '最近30个完整自然日',
            timezone: 'Asia/Shanghai',
            startDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
            endDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          },
        },
      },
    });
  });

  it('inherits the previous metric for a named-period follow-up and asks for formal dates without calling the model', async () => {
    const aiService = fakeAiService(async () => structuredResult(productRankingIntent));
    const compiler = createCompiler(aiService);
    const input = compilerInput('跟双十一期间比呢');
    input.conversationSlots = {
      modelContext: {
        version: 1,
        objective: '查询本月商品销售排行',
        metrics: [productSalesMetricRef],
        dimensions: [productDimensionRef],
        entities: productRankingIntent.entities,
        intent: 'ranking',
        answerShape: 'ranking',
        timeRange: { preset: 'this_month', label: '本月', timezone: 'Asia/Shanghai' },
        capability: { key: 'product.sales.ranking', version: 2 },
      },
      turnDirectives: {
        mode: 'continue',
        inherit: ['objective', 'entities', 'metrics', 'dimensions', 'timeRange', 'capability'],
        doNotInherit: [],
        corrections: [],
      },
    };

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      provider: 'governed_contract',
      model: 'conversation_continuation_fast_path',
      intent: {
        intent: 'comparison',
        metrics: [productSalesMetricRef],
        timeRange: { preset: 'this_month', label: '本月', timezone: 'Asia/Shanghai' },
        missingSlots: ['comparisonTarget'],
        ambiguities: [expect.objectContaining({ slot: 'comparisonTarget' })],
      },
    });
    expect(aiService.generateStructured).not.toHaveBeenCalled();
  });

  it('compiles the exact BQ1933 follow-up by inheriting paid amount and last week while comparing yesterday', async () => {
    const aiService = fakeAiService(async () => structuredResult(productRankingIntent));
    const compiler = createCompiler(aiService);
    const input = compilerInput('跟昨天比呢'); // BQ1933
    input.metricRefs = [paidAmountMetricRef];
    input.dimensionRefs = [];
    input.capabilitySummaries = [
      {
        key: 'order_revenue_analysis',
        name: '订单收入与客单价分析',
        description: '查询当前门店指定周期的实收金额',
        domains: ['product_order', 'payment'],
        intents: ['query', 'comparison'],
        readOnly: true,
        definitionRefs: [paidAmountMetricRef],
      },
    ];
    input.conversationSlots = {
      modelContext: {
        version: 1,
        objective: '查询上周实收流水',
        metrics: [paidAmountMetricRef],
        dimensions: [],
        entities: [],
        intent: 'query',
        answerShape: 'scalar',
        timeRange: { preset: 'last_week', label: '上周', timezone: 'Asia/Shanghai' },
        capability: { key: 'order_revenue_analysis', version: 22 },
      },
      turnDirectives: {
        mode: 'continue',
        inherit: ['objective', 'entities', 'metrics', 'dimensions', 'timeRange', 'capability'],
        doNotInherit: [],
        resolve: {
          comparisonTarget: { preset: 'yesterday', label: '昨天', timezone: 'Asia/Shanghai' },
        },
        corrections: [],
      },
    };

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      provider: 'governed_contract',
      model: 'conversation_continuation_fast_path',
      intent: {
        objective: '查询上周实收流水',
        intent: 'comparison',
        answerShape: 'comparison',
        metrics: [paidAmountMetricRef],
        timeRange: { preset: 'last_week', label: '上周', timezone: 'Asia/Shanghai' },
        comparisonTarget: {
          type: 'time',
          timeRange: { preset: 'yesterday', label: '昨天', timezone: 'Asia/Shanghai' },
        },
        missingSlots: [],
        ambiguities: [],
      },
    });
    expect(aiService.generateStructured).not.toHaveBeenCalled();
  });

  it('removes internal ambiguities for an exact governed capability example', async () => {
    const modelIntent: BrainSemanticIntent = {
      ...productRankingIntent,
      intent: 'query',
      metrics: [],
      dimensions: [],
      orderBy: [],
      answerShape: 'scalar',
      ambiguities: [
        {
          slot: '到店定义',
          reason: '需要确认到店定义',
          candidates: ['预约签到', '订单创建'],
        },
      ],
    };
    const input = compilerInput('今天来了几个客人，现在还有几个在店');
    input.capabilitySummaries = [
      {
        key: 'store_operations_overview',
        name: '店长经营概览',
        description: '包含预约到店和当前在店人数',
        domains: ['reservation'],
        intents: ['query'],
        examples: ['今天来了几个客人，现在还有几个在店'],
        readOnly: true,
      },
    ];
    const compiler = createCompiler(fakeAiService(async () => structuredResult(modelIntent)));

    const result = await compiler.compile(input);

    expect(result).toMatchObject({ status: 'completed', intent: { ambiguities: [] } });
  });

  it('keeps the governed collection coverage metric when an exact fact query depends on it', async () => {
    const longWaitRef = {
      definitionType: 'metric' as const,
      definitionKey: 'metric.customer_long_wait_departure_count',
      definitionVersion: 1,
      definitionFingerprint: '1'.repeat(64),
      sourceFingerprint: '2'.repeat(64),
    };
    const coverageRef = {
      definitionType: 'metric' as const,
      definitionKey: 'metric.customer_waiting_collection_coverage_rate',
      definitionVersion: 1,
      definitionFingerprint: '3'.repeat(64),
      sourceFingerprint: '4'.repeat(64),
    };
    const input = compilerInput('最近有没有客户因为等待时间长而离开');
    input.capabilitySummaries = [
      {
        key: 'customer_waiting_loss_overview',
        name: '客户等待流失分析',
        description: '查询等待过久离店和等待记录覆盖率',
        domains: ['customer_waiting_episode'],
        intents: ['query', 'diagnosis'],
        examples: ['最近有没有客户因为等待时间长而离开'],
        readOnly: true,
        definitionRefs: [longWaitRef, coverageRef],
      },
    ];
    input.ontologySnapshot = {
      ...ontologySnapshot,
      metrics: [
        {
          ...ontologySnapshot.metrics[0],
          definitionKey: longWaitRef.definitionKey,
          version: longWaitRef.definitionVersion,
          definitionFingerprint: longWaitRef.definitionFingerprint,
          sourceFingerprint: longWaitRef.sourceFingerprint,
          metricKey: 'customer_long_wait_departure_count',
          name: '等待过久离店人数',
          aliases: ['等待时间长而离开'],
        },
        {
          ...ontologySnapshot.metrics[0],
          definitionKey: coverageRef.definitionKey,
          version: coverageRef.definitionVersion,
          definitionFingerprint: coverageRef.definitionFingerprint,
          sourceFingerprint: coverageRef.sourceFingerprint,
          metricKey: 'customer_waiting_collection_coverage_rate',
          name: '等待记录采集覆盖率',
          aliases: ['等待记录覆盖率'],
        },
      ],
    };
    const aiService = fakeAiService(async () => {
      throw new Error('exact governed example should not call the model');
    });
    const compiler = createCompiler(aiService);

    const result = await compiler.compile(input);

    expect(result).toMatchObject({
      status: 'completed',
      intent: {
        metrics: expect.arrayContaining([
          expect.objectContaining({ definitionKey: longWaitRef.definitionKey }),
          expect.objectContaining({ definitionKey: coverageRef.definitionKey }),
        ]),
      },
    });
    expect(aiService.generateStructured).not.toHaveBeenCalled();
  });

  it.each([
    ['帮我设计一个新客专属的欢迎礼包', 'draft', 'draft'],
    ['给首次办卡的客户写一条欢迎词', 'draft', 'draft'],
    ['储值赠送方案定在什么比例客户更愿意储值', 'draft', 'draft'],
    ['帮我设计一套完整的客户生命周期运营方案', 'draft', 'draft'],
    ['我想让系统自动给快过期次卡的客户发消息', 'action', 'action_preview'],
    ['如何让系统自动识别高流失风险的客户并提醒我', 'diagnosis', 'diagnosis'],
  ] as const)('normalizes the model speech act contract for %s', async (question, expectedIntent, expectedShape) => {
    const modelIntent: BrainSemanticIntent = {
      ...productRankingIntent,
      intent: 'recommendation',
      answerShape: 'list',
    };
    const compiler = createCompiler(fakeAiService(async () => structuredResult(modelIntent)));

    const result = await compiler.compile(compilerInput(question));

    expect(result).toMatchObject({
      status: 'completed',
      intent: { intent: expectedIntent, answerShape: expectedShape },
    });
  });

  it('keeps the most urgent inventory question as a sorted list instead of a scalar metric', async () => {
    const input = compilerInput('现在缺货最紧急的是什么');
    input.capabilitySummaries = [
      {
        key: 'inventory_risk_ranking',
        name: '库存缺货风险排行',
        description: '返回最紧急的库存风险商品',
        domains: ['inventory'],
        intents: ['ranking', 'query'],
        examples: ['现在缺货最紧急的是什么'],
        readOnly: true,
        definitionRefs: [productSalesMetricRef],
      },
    ];
    const compiler = createCompiler(
      fakeAiService(async () => {
        throw new Error('exact governed example should not call the model');
      }),
    );

    const result = await compiler.compile(input);

    expect(result).toMatchObject({
      status: 'completed',
      intent: {
        intent: 'query',
        answerShape: 'list',
        orderBy: [{ definitionRef: productSalesMetricRef, direction: 'desc' }],
      },
    });
  });

  it('adds a governed descending order when ranking has one metric and no explicit order', async () => {
    const modelIntent: BrainSemanticIntent = {
      ...productRankingIntent,
      orderBy: [],
      missingSlots: ['orderBy'],
    };
    const compiler = createCompiler(fakeAiService(async () => structuredResult(modelIntent)));

    const result = await compiler.compile(compilerInput('本月商品销售排行'));

    expect(result).toMatchObject({
      status: 'completed',
      intent: {
        orderBy: [{ definitionRef: productRankingIntent.metrics[0], direction: 'desc' }],
        missingSlots: [],
      },
    });
  });

  it('passes validator repair feedback to the governed model context', async () => {
    const aiService = fakeAiService(async () => structuredResult(productRankingIntent));
    const compiler = createCompiler(aiService);
    const input = compilerInput('本月商品销售排行');
    input.repairFeedback = {
      previousIntent: productRankingIntent,
      issues: [{ code: 'UNKNOWN_DOMAIN', slot: 'domain', message: 'Domain service is not active.' }],
    };

    await compiler.compile(input);

    const request = (aiService.generateStructured as jest.Mock).mock.calls[0][0] as AiStructuredOutputInput;
    expect(request.messages[1].content).toContain('repairFeedback');
    expect(request.messages[1].content).toContain('UNKNOWN_DOMAIN');
  });

  it('removes a fabricated key from a generic ontology entity mention', async () => {
    const modelIntent: BrainSemanticIntent = {
      ...productRankingIntent,
      entities: [{ ...productRankingIntent.entities[0], entityKey: 'product-unknown' }],
    };
    const compiler = createCompiler(fakeAiService(async () => structuredResult(modelIntent)));

    const result = await compiler.compile(compilerInput('本月商品销售排行'));

    expect(result.status).toBe('completed');
    if (result.status === 'completed') expect(result.intent.entities[0].entityKey).toBeUndefined();
  });

  it('never treats an ontology type key as a resolved business instance', async () => {
    const modelIntent: BrainSemanticIntent = {
      ...productRankingIntent,
      entities: [{ ...productRankingIntent.entities[0], mention: '低库存产品', entityKey: 'product' }],
    };
    const compiler = createCompiler(fakeAiService(async () => structuredResult(modelIntent)));

    const result = await compiler.compile(compilerInput('现在哪些产品库存不够了'));

    expect(result.status).toBe('completed');
    if (result.status === 'completed') expect(result.intent.entities[0].entityKey).toBeUndefined();
  });

  it('drops only a redundant governed-entity identity filter emitted by the model', async () => {
    const modelIntent: BrainSemanticIntent = {
      ...productRankingIntent,
      entities: [{ ...productRankingIntent.entities[0], mention: '抗衰眼霜', entityKey: '抗衰眼霜' }],
      filters: [
        {
          fieldRef: {
            definitionType: 'field',
            definitionKey: 'field.product_name',
            definitionVersion: 1,
            definitionFingerprint: '7'.repeat(64),
            sourceFingerprint: '8'.repeat(64),
          },
          operator: 'eq',
          value: '抗衰眼霜',
        },
      ],
    };
    const compiler = createCompiler(fakeAiService(async () => structuredResult(modelIntent)));

    const result = await compiler.compile(compilerInput('本月抗衰眼霜销售排行'));

    expect(result.status).toBe('completed');
    if (result.status === 'completed') expect(result.intent.filters).toEqual([]);
  });

  it('hydrates a model-selected published dimension value filter with the active snapshot identity', async () => {
    const modelIntent: BrainSemanticIntent = {
      ...productRankingIntent,
      filters: [
        {
          fieldRef: {
            ...productDimensionRef,
            definitionVersion: 999,
            definitionFingerprint: 'a'.repeat(64),
            sourceFingerprint: 'b'.repeat(64),
          },
          operator: 'eq',
          value: '护理',
        },
      ],
    };
    const compiler = createCompiler(fakeAiService(async () => structuredResult(modelIntent)));

    // ami-brain-historical-only: historical regression fixture; excluded from release gate and pass-rate denominator
    const result = await compiler.compile(compilerInput('本月护理商品销售排行'));

    expect(result.status).toBe('completed');
    if (result.status === 'completed') {
      expect(result.intent.filters).toEqual([{ fieldRef: productDimensionRef, operator: 'eq', value: '护理' }]);
    }
  });

  it('infers an explicit customer member-level value as a governed dimension filter', async () => {
    const modelIntent: BrainSemanticIntent = {
      ...productRankingIntent,
      objective: '统计钻石会员客户数量',
      domains: ['customer'],
      intent: 'query',
      entities: [
        {
          entityType: 'customer',
          mention: '客户',
          source: 'user',
          definitionRef: customerEntityRef,
          confidence: 0.98,
        },
      ],
      metrics: [],
      dimensions: [],
      filters: [],
      orderBy: [],
      answerShape: 'scalar',
      successCriteria: ['返回钻石会员客户数量'],
      decisionSummary: '用户要统计钻石会员数量。',
    };
    const compiler = createCompiler(fakeAiService(async () => structuredResult(modelIntent)));

    const result = await compiler.compile({
      // ami-brain-historical-only: historical regression fixture; excluded from release gate and pass-rate denominator
      ...compilerInput('一共有多少个钻石会员'),
      metricRefs: [],
      dimensionRefs: [],
      capabilitySummaries: [
        {
          key: 'customer_facts',
          name: '客户事实与客群查询',
          description: '查询当前门店客户事实与会员等级客户数量',
          domains: ['customer'],
          intents: ['query'],
          readOnly: true,
          definitionRefs: [customerEntityRef, customerLevelDimensionRef],
        },
      ],
    });

    expect(result.status).toBe('completed');
    if (result.status === 'completed') {
      expect(result.intent.filters).toEqual([
        { fieldRef: customerLevelDimensionRef, operator: 'eq', value: '钻石会员' },
      ]);
    }
  });

  it('infers customer member-level filters for an exact customer-facts fast path', async () => {
    const aiService = fakeAiService(async () => {
      throw new Error('model must not be called for an exact frozen contract');
    });
    const compiler = createCompiler(aiService);

    const result = await compiler.compile({
      // ami-brain-historical-only: historical regression fixture; excluded from release gate and pass-rate denominator
      ...compilerInput('一共有多少个钻石会员'),
      metricRefs: [],
      dimensionRefs: [],
      capabilitySummaries: [
        {
          key: 'customer_facts',
          name: '客户事实与客群查询',
          description: '查询当前门店客户事实与会员等级客户数量',
          domains: ['customer'],
          intents: ['query'],
          examples: ['一共有多少个钻石会员'],
          readOnly: true,
          definitionRefs: [customerEntityRef, customerLevelDimensionRef],
        },
      ],
    });

    expect(result.status).toBe('completed');
    if (result.status === 'completed') {
      expect(result.model).toBe('exact_example_fast_path');
      expect(result.intent.filters).toEqual([
        { fieldRef: customerLevelDimensionRef, operator: 'eq', value: '钻石会员' },
      ]);
    }
    expect(aiService.generateStructured).not.toHaveBeenCalled();
  });

  it('uses the governed customer-facts fast path for member-level count questions', async () => {
    const aiService = fakeAiService(async () => {
      throw new Error('model must not be called for governed customer facts');
    });
    const compiler = createCompiler(aiService);

    const result = await compiler.compile({
      // ami-brain-historical-only: historical regression fixture; excluded from release gate and pass-rate denominator
      ...compilerInput('截至2026/07/29 12:45:40，一共有多少个钻石会员'),
      metricRefs: [],
      dimensionRefs: [customerLevelDimensionRef],
      rankedCapabilityKeys: ['customer_facts'],
      capabilitySummaries: [
        {
          key: 'customer_facts',
          name: '客户事实与客群查询',
          description: '查询当前门店客户事实与会员等级客户数量',
          domains: ['customer'],
          intents: ['query'],
          readOnly: true,
          definitionRefs: [customerEntityRef, customerLevelDimensionRef],
        },
      ],
    });

    expect(result.status).toBe('completed');
    if (result.status === 'completed') {
      expect(result.model).toBe('customer_facts_fast_path');
      expect(result.selectedCapabilityKey).toBe('customer_facts');
      expect(result.intent).toMatchObject({
        intent: 'query',
        domains: ['customer'],
        answerShape: 'scalar',
        filters: [{ fieldRef: customerLevelDimensionRef, operator: 'eq', value: '钻石会员' }],
      });
    }
    expect(aiService.generateStructured).not.toHaveBeenCalled();
  });

  it('uses the governed customer-facts fast path for card holders without visits without inventing project filters', async () => {
    const aiService = fakeAiService(async () => {
      throw new Error('model must not be called for governed customer card facts');
    });
    const compiler = createCompiler(aiService);

    const result = await compiler.compile({
      // ami-brain-historical-only: historical regression fixture; excluded from release gate and pass-rate denominator
      ...compilerInput('办了综合养护 20 次卡但2026年6月15日至21日没来的客户名单'),
      metricRefs: [],
      dimensionRefs: [customerLevelDimensionRef],
      rankedCapabilityKeys: ['customer_facts'],
      capabilitySummaries: [
        {
          key: 'customer_facts',
          name: '客户事实与客群查询',
          description: '查询客户卡项持有、预约与到店事实',
          domains: ['customer'],
          intents: ['query'],
          readOnly: true,
          definitionRefs: [customerEntityRef, customerLevelDimensionRef],
        },
      ],
    });

    expect(result.status).toBe('completed');
    if (result.status === 'completed') {
      expect(result.model).toBe('customer_facts_fast_path');
      expect(result.selectedCapabilityKey).toBe('customer_facts');
      expect(result.intent).toMatchObject({
        intent: 'query',
        domains: ['customer'],
        answerShape: 'list',
        filters: [],
      });
      expect(result.intent.dimensions.map((dimension) => dimension.definitionKey)).not.toContain(
        'dimension.projectName',
      );
    }
    expect(aiService.generateStructured).not.toHaveBeenCalled();
  });

  it('drops ungoverned field filters and treats an unordered list as query rather than ranking', async () => {
    const modelIntent: BrainSemanticIntent = {
      ...productRankingIntent,
      objective: '列出库存不足的产品',
      intent: 'ranking',
      metrics: [],
      orderBy: [],
      answerShape: 'list',
      filters: [
        {
          fieldRef: {
            definitionType: 'field',
            definitionKey: 'field.product_stock_quantity',
            definitionVersion: 1,
            definitionFingerprint: '7'.repeat(64),
            sourceFingerprint: '8'.repeat(64),
          },
          operator: 'lt',
          value: 10,
        },
      ],
    };
    const compiler = createCompiler(fakeAiService(async () => structuredResult(modelIntent)));

    const result = await compiler.compile(compilerInput('现在哪些产品库存不够了'));

    expect(result.status).toBe('completed');
    if (result.status === 'completed') {
      expect(result.intent).toMatchObject({ intent: 'query', answerShape: 'list', filters: [], orderBy: [] });
    }
  });

  it('keeps an exact customer fact lookup executable without a second field-definition registry', async () => {
    const customerRef = {
      definitionType: 'entity' as const,
      definitionKey: 'entity.customer',
      definitionVersion: 1,
      definitionFingerprint: '9'.repeat(64),
      sourceFingerprint: 'a'.repeat(64),
    };
    const modelIntent: BrainSemanticIntent = {
      ...draftIntent,
      objective: '查询客户张三的姓名',
      domains: ['customer'],
      intent: 'query',
      answerShape: 'list',
      entities: [
        {
          entityType: 'customer',
          entityKey: 'customer:zhang-san',
          mention: '张三',
          source: 'user',
          confidence: 0.98,
        },
      ],
      filters: [
        {
          fieldRef: {
            definitionType: 'field',
            definitionKey: 'field.customer_name',
            definitionVersion: 1,
            definitionFingerprint: 'b'.repeat(64),
            sourceFingerprint: 'c'.repeat(64),
          },
          operator: 'eq',
          value: '张三',
        },
      ],
      ambiguities: [
        {
          slot: 'entity.customer.identity',
          reason: '可能存在重名客户',
          candidates: ['张三'],
        },
      ],
      missingSlots: ['customer_field'],
    };
    const input = compilerInput('查询客户张三的姓名');
    input.ontologySnapshot = {
      ...ontologySnapshot,
      entities: [
        ...ontologySnapshot.entities,
        {
          definitionKey: customerRef.definitionKey,
          version: customerRef.definitionVersion,
          definitionFingerprint: customerRef.definitionFingerprint,
          sourceFingerprint: customerRef.sourceFingerprint,
          domain: 'customer',
          entityKey: 'customer',
          name: '客户',
          aliases: ['顾客'],
          attributes: {},
          tableMap: { model: 'Customer' },
        },
      ],
    };
    const compiler = createCompiler(fakeAiService(async () => structuredResult(modelIntent)));

    const result = await compiler.compile(input);

    expect(result.status).toBe('completed');
    if (result.status === 'completed') {
      expect(result.intent.filters).toEqual([]);
      expect(result.intent.ambiguities).toEqual([]);
      expect(result.intent.missingSlots).toEqual([]);
      expect(result.intent.entities[0].definitionRef).toEqual(customerRef);
    }
  });

  it('sends governed context, canonical schema, scenario and configured timeout to AiService', async () => {
    const aiService = fakeAiService(async () => structuredResult(productRankingIntent));
    const compiler = createCompiler(aiService);

    await compiler.compile(compilerInput('本月商品销售排行'));

    expect(aiService.generateStructured).toHaveBeenCalledTimes(1);
    const request = (aiService.generateStructured as jest.Mock).mock.calls[0][0] as AiStructuredOutputInput;
    expect(request.scenario).toBe('brain.semantic_intent.v1');
    expect(request.schema).toBe(BRAIN_SEMANTIC_INTENT_MODEL_JSON_SCHEMA);
    expect(request.promptSchema).toBe(BRAIN_SEMANTIC_INTENT_PROMPT_SCHEMA);
    expect(request.timeoutMs).toBe(4321);
    expect(request.userId).toBe(9);
    expect(request.storeId).toBe(6);
    expect(request.repairMessages).toBeDefined();
    expect(request.allowFallback).toBe(true);
    expect(request.fallbackMessages).toEqual(request.messages);
    const serializedMessages = JSON.stringify(request.messages);
    expect(serializedMessages).toContain('store_manager');
    expect(serializedMessages).toContain('Asia/Shanghai');
    expect(serializedMessages).toContain('lastEntity');
    expect(request.messages[1].content).toContain('safeSlot');
    expect(request.messages[1].content).not.toContain('"userId"');
    expect(request.messages[1].content).not.toContain('"storeId"');
    expect(request.messages[1].content).not.toContain('"permissions"');
    expect(request.messages[1].content).not.toContain('"user_id"');
    expect(request.messages[1].content).not.toContain('"store_id"');
    expect(request.messages[1].content).not.toContain('"requiredPermissions"');
    expect(request.messages[1].content).not.toContain('"tenantId"');
    expect(request.messages[1].content).not.toContain('"tenant"');
    expect(request.messages[1].content).not.toContain('"storeScope"');
    expect(request.messages[1].content).not.toContain('"visibleStoreIds"');
    expect(request.messages[1].content).not.toContain('"deniedPermissions"');
    expect(request.messages[1].content).not.toContain('"permissionCodes"');
    const modelContext = JSON.parse(request.messages[1].content.split('\n').slice(1).join('\n')) as Record<string, any>;
    expect(modelContext.role).toBe('store_manager');
    expect(modelContext).not.toHaveProperty('audit');
    expect(modelContext.conversationSlots).not.toHaveProperty('role');
    expect(serializedMessages).toContain(productEntityRef.definitionKey);
    expect(serializedMessages).toContain(productSalesMetricRef.definitionKey);
    expect(serializedMessages).toContain(productDimensionRef.definitionKey);
    expect(serializedMessages).toContain('product.sales.ranking');
    expect(modelContext.capabilitySummaries[0]).toMatchObject({
      key: 'product.sales.ranking',
      definitionRefs: [],
      grounding: null,
    });
    expect(serializedMessages).toContain(ontologySnapshot.fingerprint);
    expect(serializedMessages).toContain(purchaseOrderActionRef.definitionKey);
    expect(serializedMessages).not.toContain('one_of:draft,submit_for_approval');
    expect(modelContext.ontology.actions[0].inputSlots).toEqual(
      expect.not.arrayContaining([expect.objectContaining({ slotKey: 'submissionMode' })]),
    );
    expect(modelContext.ontology.actions[0].lexicalFrame).toMatchObject({
      frameKey: `${purchaseOrderActionRef.definitionKey}.lexical_frame`,
      lexicalUnits: expect.arrayContaining(['创建采购单', '下采购单']),
      semanticPredicates: expect.arrayContaining([`occurrence_of:${purchaseOrderActionRef.definitionKey}`]),
      contrasts: expect.arrayContaining([expect.objectContaining({ conceptKey: 'action.semantic_contrast_fixture' })]),
    });
    expect(modelContext.ontology.actions[0].lexicalFrame).not.toHaveProperty('fingerprint');
    expect(modelContext.ontology.actions[0].situationContext).toEqual({
      tenantBoundary: 'current_store',
      requestChannelPolicy: 'bind_if_present',
      devicePolicy: 'bind_if_present',
      conversationPolicy: 'same_conversation',
      businessTimePolicy: {
        timezone: 'Asia/Shanghai',
        businessDatePolicy: 'same_business_date',
        clockSource: 'server',
      },
      actorPolicy: {
        subjectPolicy: 'same_authenticated_user',
        qualificationPolicy: 'revalidate_current_role_and_permission',
      },
    });
    expect(modelContext.ontology.actions[0].situationContext).not.toHaveProperty('fingerprint');
    expect(modelContext.ontology.actions[0].sideEffectInvariant).toEqual({
      undeclaredSideEffectPolicy: 'forbid',
      gatewayEffectPolicy: 'exact_declared_effect_match',
      successEvidencePolicy: 'all_declared_effects_observed',
      partialSuccessPolicy: 'explicit_partially_succeeded',
      recoveryPolicy: 'gateway_declared_strategy_only',
      compensationPolicy: 'explicit_compensation_action_required',
      outcomeObservationPolicy: 'required_for_async_effects',
    });
    expect(modelContext.ontology.actions[0].sideEffectInvariant).not.toHaveProperty('fingerprint');
    expect(serializedMessages).not.toContain('SensitiveProductTable');
    expect(serializedMessages).not.toContain('SensitiveOrderTable');
    expect(serializedMessages).not.toContain('store:finance:read');
    expect(serializedMessages).not.toContain('secret_amount');
  });

  it('returns a model-selected read-only delivery contract only when it is in Top-K and covers the hydrated intent', async () => {
    // ami-brain-historical-only: historical regression fixture; excluded from release gate and pass-rate denominator
    const question = '晒后舒缓修护项目利润归因';
    const modelIntent = {
      ...productRankingIntent,
      objective: question,
      domains: ['finance', 'project', 'product_order'],
      intent: 'query',
      entities: [
        {
          entityType: 'project',
          entityKey: '晒后舒缓修护',
          mention: '晒后舒缓修护',
          source: 'user',
          definitionRef: projectEntityRef,
          confidence: 0.99,
        },
      ],
      metrics: [],
      dimensions: [],
      orderBy: [],
      answerShape: 'scalar',
      successCriteria: ['返回指定项目利润归因'],
      decisionSummary: '需要财务风险能力承接利润归因。',
      selectedCapabilityKey: 'finance_risk_overview',
    } as BrainSemanticIntent & { selectedCapabilityKey: string };
    const aiService = fakeAiService(async () => structuredResult(modelIntent));
    const compiler = createCompiler(aiService);
    const input = compilerInput(question);
    input.ontologySnapshot = {
      ...ontologySnapshot,
      entities: [
        ...ontologySnapshot.entities,
        {
          definitionKey: projectEntityRef.definitionKey,
          version: projectEntityRef.definitionVersion,
          definitionFingerprint: projectEntityRef.definitionFingerprint,
          sourceFingerprint: projectEntityRef.sourceFingerprint,
          domain: 'project',
          entityKey: 'project',
          name: '项目',
          aliases: ['服务项目'],
          attributes: {},
          tableMap: { model: 'Project' },
        },
      ],
    };
    input.capabilitySummaries = [
      {
        key: 'project_margin_analysis',
        name: '项目毛利与成本排行',
        description: '返回项目级汇总收入、成本、贡献毛利和毛利率',
        domains: ['project'],
        intents: ['query', 'diagnosis'],
        readOnly: true,
        definitionRefs: [projectEntityRef],
      },
      {
        key: 'finance_risk_overview',
        name: '财务经营风险概览',
        description: '覆盖订单利润以及项目、订单、成本和毛利的交叉查询',
        domains: ['finance', 'project', 'product_order'],
        intents: ['query', 'diagnosis'],
        readOnly: true,
        definitionRefs: [projectEntityRef],
      },
    ];
    input.rankedCapabilityKeys = ['project_margin_analysis', 'finance_risk_overview'];

    const result = await compiler.compile(input);

    expect(result).toMatchObject({
      status: 'completed',
      selectedCapabilityKey: 'finance_risk_overview',
      intent: {
        intent: 'query',
        entities: [expect.objectContaining({ definitionRef: projectEntityRef })],
      },
    });
    expect(result.status === 'completed' ? result.intent : {}).not.toHaveProperty('selectedCapabilityKey');
    const request = (aiService.generateStructured as jest.Mock).mock.calls[0][0] as AiStructuredOutputInput;
    const modelContext = JSON.parse(request.messages[1].content.split('\n').slice(1).join('\n')) as Record<string, any>;
    expect(modelContext.capabilitySummaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'finance_risk_overview',
          definitionRefs: [{ definitionType: 'entity', definitionKey: projectEntityRef.definitionKey }],
        }),
      ]),
    );
  });

  it('discards a model capability selection that is outside Top-K or does not cover the governed definitions', async () => {
    const modelIntent = {
      ...productRankingIntent,
      selectedCapabilityKey: 'finance_risk_overview',
    } as BrainSemanticIntent & { selectedCapabilityKey: string };
    const aiService = fakeAiService(async () => structuredResult(modelIntent));
    const compiler = createCompiler(aiService);
    // ami-brain-historical-only: historical regression fixture; excluded from release gate and pass-rate denominator
    const input = compilerInput('最近哪些商品卖得最好');
    input.capabilitySummaries = [
      {
        key: 'finance_risk_overview',
        name: '财务经营风险概览',
        description: '财务风险',
        domains: ['finance'],
        intents: ['ranking'],
        readOnly: true,
        definitionRefs: [projectEntityRef],
      },
      {
        key: 'product.sales.ranking',
        name: '商品销售排行',
        description: '商品销售排行',
        domains: ['product_sales'],
        intents: ['ranking'],
        readOnly: true,
        definitionRefs: [productEntityRef, productSalesMetricRef, productDimensionRef],
      },
    ];
    input.rankedCapabilityKeys = ['product.sales.ranking'];

    await expect(compiler.compile(input)).resolves.toEqual(
      expect.not.objectContaining({ selectedCapabilityKey: expect.anything() }),
    );
  });

  it('sends only the Ontology subgraph referenced by Top-K capability contracts to the model', async () => {
    const aiService = fakeAiService(async () => structuredResult(productRankingIntent));
    const compiler = createCompiler(aiService);
    // ami-brain-historical-only: historical regression fixture; excluded from release gate and pass-rate denominator
    const input = compilerInput('最近哪些商品卖得最好');
    input.capabilitySummaries = [
      {
        key: 'product.sales.ranking',
        name: '商品销售排行',
        description: '按商品汇总并排序销售表现',
        domains: ['product_sales'],
        intents: ['ranking'],
        readOnly: true,
        definitionRefs: [productEntityRef, productSalesMetricRef, productDimensionRef],
      },
    ];
    input.rankedCapabilityKeys = ['product.sales.ranking'];

    await compiler.compile(input);

    const request = (aiService.generateStructured as jest.Mock).mock.calls[0][0] as AiStructuredOutputInput;
    const context = JSON.parse(request.messages[1].content.split('\n').slice(1).join('\n')) as {
      ontology: {
        entities: Array<{ definitionRef: { definitionKey: string } }>;
        metrics: Array<{ definitionRef: { definitionKey: string } }>;
        dimensions: Array<{ definitionRef: { definitionKey: string } }>;
        actions: unknown[];
      };
      rankedCapabilityKeys: string[];
    };
    expect(context.ontology.entities.map((item) => item.definitionRef.definitionKey)).toEqual([
      productEntityRef.definitionKey,
    ]);
    expect(context.ontology.metrics.map((item) => item.definitionRef.definitionKey)).toEqual([
      productSalesMetricRef.definitionKey,
    ]);
    expect(context.ontology.dimensions.map((item) => item.definitionRef.definitionKey)).toEqual([
      productDimensionRef.definitionKey,
    ]);
    expect(context.ontology.actions).toEqual([]);
    expect(context.rankedCapabilityKeys).toEqual(['product.sales.ranking']);
  });

  it('states the semantic compiler safety boundaries in the system prompt', () => {
    expect(BRAIN_SEMANTIC_INTENT_SYSTEM_PROMPT).toContain('只理解用户在问什么');
    expect(BRAIN_SEMANTIC_INTENT_SYSTEM_PROMPT).toContain('definitionKey');
    expect(BRAIN_SEMANTIC_INTENT_SYSTEM_PROMPT).toContain('版本号与指纹由服务端');
    expect(BRAIN_SEMANTIC_INTENT_SYSTEM_PROMPT).toContain('不得创造指标、实体、维度或动作');
    expect(BRAIN_SEMANTIC_INTENT_SYSTEM_PROMPT).toContain('ActionDefinition.lexicalFrame');
    expect(BRAIN_SEMANTIC_INTENT_SYSTEM_PROMPT).toContain('ActionDefinition.situationContext');
    expect(BRAIN_SEMANTIC_INTENT_SYSTEM_PROMPT).toContain('ActionDefinition.sideEffectInvariant');
    expect(BRAIN_SEMANTIC_INTENT_SYSTEM_PROMPT).toContain('禁止输出通用 value 字段');
    expect(BRAIN_SEMANTIC_INTENT_SYSTEM_PROMPT).toContain('不是关键词规则');
    expect(BRAIN_SEMANTIC_INTENT_SYSTEM_PROMPT).toContain('selectedCapabilityKey');
    expect(BRAIN_SEMANTIC_INTENT_SYSTEM_PROMPT).toContain('不得只看能力名称或单个关键词');
    expect(BRAIN_SEMANTIC_INTENT_SYSTEM_PROMPT).toContain('不得输出 SQL 或表名');
    expect(BRAIN_SEMANTIC_INTENT_SYSTEM_PROMPT).toContain('不得决定 userId、storeId、permissions 或 data scope');
    expect(BRAIN_SEMANTIC_INTENT_SYSTEM_PROMPT).toContain('不得输出隐藏推理');
    expect(BRAIN_SEMANTIC_INTENT_SYSTEM_PROMPT).toContain('decisionSummary');
    expect(BRAIN_SEMANTIC_INTENT_SYSTEM_PROMPT).toContain('不得输出 timeRange 或 comparisonTarget');
    expect(BRAIN_SEMANTIC_INTENT_SYSTEM_PROMPT).toContain('本月商品销售排行');
    expect(BRAIN_SEMANTIC_INTENT_SYSTEM_PROMPT).toContain('哪些货卖得最好');
    expect(BRAIN_SEMANTIC_INTENT_SYSTEM_PROMPT).toContain('等价');
    expect(BRAIN_SEMANTIC_INTENT_SYSTEM_PROMPT).toContain('comparisonTarget');
    expect(BRAIN_SEMANTIC_INTENT_PROMPT_SCHEMA.fieldContract).not.toHaveProperty('timeRange');
    expect(BRAIN_SEMANTIC_INTENT_PROMPT_SCHEMA.fieldContract).not.toHaveProperty('comparisonTarget');
  });

  it.each(['SCHEMA_INVALID', 'JSON_INVALID', 'PROVIDER_UNAVAILABLE'] as const)(
    'returns typed unavailable when AiService reports %s',
    async (errorCode) => {
      const aiService = fakeAiService(async () => {
        throw new AiStructuredOutputError(errorCode, `${errorCode} from fake provider`);
      });
      const compiler = createCompiler(aiService);

      await expect(compiler.compile(compilerInput('这个月商品卖得怎么样'))).resolves.toEqual({
        status: 'unavailable',
        errorCode,
        reason: `${errorCode} from fake provider`,
      });
    },
  );

  it('retries one schema-invalid model response before returning unavailable', async () => {
    const aiService = fakeAiService(
      jest
        .fn()
        .mockRejectedValueOnce(new AiStructuredOutputError('SCHEMA_INVALID', 'first invalid response'))
        .mockResolvedValueOnce(structuredResult(productRankingIntent)),
    );
    const compiler = createCompiler(aiService);

    await expect(compiler.compile(compilerInput('本月商品销售排行'))).resolves.toMatchObject({
      status: 'completed',
      intent: productRankingIntent,
    });
    expect(aiService.generateStructured).toHaveBeenCalledTimes(2);
    expect((aiService.generateStructured as jest.Mock).mock.calls[1][0].scenario).toBe(
      'brain.semantic_intent.retry1.v1',
    );
  });

  it('shares one absolute deadline across semantic compiler retries', async () => {
    let now = 1_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const generate = jest
      .fn()
      .mockImplementationOnce(async () => {
        now = 1_190;
        throw new AiStructuredOutputError('SCHEMA_INVALID', 'first invalid response');
      })
      .mockResolvedValueOnce(structuredResult(productRankingIntent));
    const aiService = fakeAiService(generate);
    const compiler = createCompiler(aiService);
    const input = compilerInput('本月商品销售排行');
    input.deadlineAt = 1_200;

    await expect(compiler.compile(input)).resolves.toMatchObject({ status: 'completed' });

    expect(generate.mock.calls[0][0].timeoutMs).toBe(200);
    expect(generate.mock.calls[1][0].timeoutMs).toBe(10);
  });

  it('does not call the provider after the semantic compiler deadline has expired', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(2_000);
    const aiService = fakeAiService(async () => structuredResult(productRankingIntent));
    const compiler = createCompiler(aiService);
    const input = compilerInput('这个月商品卖得怎么样');
    input.deadlineAt = 1_999;

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'unavailable',
      errorCode: 'BUDGET_EXCEEDED',
    });
    expect(aiService.generateStructured).not.toHaveBeenCalled();
  });

  it('falls back only to an exact read-only governed capability example when the model budget is exhausted', async () => {
    const aiService = fakeAiService(async () => {
      throw new AiStructuredOutputError('BUDGET_EXCEEDED', 'structured budget exhausted');
    });
    const compiler = createCompiler(aiService);
    const input = compilerInput('本月我的服务和业绩怎么样');
    input.role = 'beautician';
    input.capabilitySummaries = [
      {
        key: 'beautician_service_overview',
        name: '美容师个人服务概览',
        description: '个人服务和业绩',
        domains: ['beautician', 'staff'],
        intents: ['query', 'diagnosis', 'recommendation'],
        examples: ['本月我的服务和业绩怎么样'],
        readOnly: true,
      },
    ];

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      provider: 'governed_contract',
      model: 'exact_example_fallback',
      intent: {
        intent: 'diagnosis',
        answerShape: 'diagnosis',
        domains: ['beautician', 'staff'],
        timeRange: { preset: 'this_month', label: '本月', timezone: 'Asia/Shanghai' },
        missingSlots: [],
      },
    });
  });

  it('materializes both periods for an exact governed comparison fallback', async () => {
    const aiService = fakeAiService(async () => {
      throw new AiStructuredOutputError('BUDGET_EXCEEDED', 'structured budget exhausted');
    });
    const compiler = createCompiler(aiService);
    const input = compilerInput('本周跟上周比，哪天差距最大');
    input.role = 'store_manager';
    input.capabilitySummaries = [
      {
        key: 'store_operations_overview',
        name: '店长经营概览',
        description: '经营周期对比，未指定指标时按实收金额比较',
        domains: ['order', 'payment'],
        intents: ['query', 'comparison', 'diagnosis'],
        examples: ['本周跟上周比，哪天差距最大'],
        readOnly: true,
      },
    ];

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      provider: 'governed_contract',
      model: 'exact_example_fallback',
      intent: {
        intent: 'comparison',
        answerShape: 'comparison',
        timeRange: { preset: 'this_week', label: '本周', timezone: 'Asia/Shanghai' },
        comparisonTarget: {
          type: 'time',
          timeRange: { preset: 'last_week', label: '上周', timezone: 'Asia/Shanghai' },
        },
        missingSlots: [],
      },
    });
  });

  it('falls back to one uniquely matched published metric definition when the model is unavailable', async () => {
    const aiService = fakeAiService(async () => {
      throw new AiStructuredOutputError('BUDGET_EXCEEDED', 'structured budget exhausted');
    });
    const compiler = createCompiler(aiService);
    const input = compilerInput('本月实收多少');
    input.metricRefs = [paidAmountMetricRef];
    input.ontologySnapshot = {
      ...ontologySnapshot,
      metrics: [
        ...ontologySnapshot.metrics,
        {
          definitionKey: paidAmountMetricRef.definitionKey,
          version: paidAmountMetricRef.definitionVersion,
          definitionFingerprint: paidAmountMetricRef.definitionFingerprint,
          sourceFingerprint: paidAmountMetricRef.sourceFingerprint,
          metricKey: 'paid_amount',
          name: '实收金额',
          aliases: ['实收', '流水'],
          domain: 'payment',
          formula: { sql: 'SUM(paid_amount)' },
          source: { model: 'PaymentRecord' },
          defaultFilters: {},
          permissions: ['core:finance:view'],
          description: '支付成功记录的实收金额',
        },
      ],
    };
    input.capabilitySummaries = [
      {
        key: 'order_revenue_analysis',
        name: '订单收入与客单价分析',
        description: '查询当前门店指定周期的实收金额和平均客单价',
        domains: ['product_order', 'payment'],
        intents: ['diagnosis', 'query'],
        examples: ['查询本月订单实收金额'],
        readOnly: true,
        definitionRefs: [paidAmountMetricRef],
      },
    ];

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      provider: 'governed_contract',
      model: 'definition_match_fallback',
      intent: {
        intent: 'query',
        answerShape: 'scalar',
        metrics: [paidAmountMetricRef],
        timeRange: { preset: 'this_month', label: '本月', timezone: 'Asia/Shanghai' },
        missingSlots: [],
      },
    });
  });

  it('compiles a time range plus one governed metric phrase without calling the model', async () => {
    const aiService = fakeAiService(async () => {
      throw new Error('model_should_not_be_called');
    });
    const compiler = createCompiler(aiService);
    const input = compilerInput('最近三个月的实收流水');
    input.metricRefs = [paidAmountMetricRef];
    input.ontologySnapshot = {
      ...ontologySnapshot,
      metrics: [
        ...ontologySnapshot.metrics,
        {
          definitionKey: paidAmountMetricRef.definitionKey,
          version: paidAmountMetricRef.definitionVersion,
          definitionFingerprint: paidAmountMetricRef.definitionFingerprint,
          sourceFingerprint: paidAmountMetricRef.sourceFingerprint,
          metricKey: 'paid_amount',
          name: '实收金额',
          aliases: ['实收', '实收流水'],
          domain: 'payment',
          formula: { sql: 'SUM(paid_amount)' },
          source: { model: 'PaymentRecord' },
          defaultFilters: {},
          permissions: ['core:finance:view'],
          description: '支付成功记录的实收金额',
        },
      ],
    };
    input.capabilitySummaries = [
      {
        key: 'finance_payment_breakdown',
        name: '实收与储值流水拆分',
        description: '实收查询、趋势与周期对比',
        domains: ['finance', 'payment'],
        intents: ['query', 'ranking', 'comparison', 'trend'],
        examples: ['本月实收多少'],
        readOnly: true,
        definitionRefs: [paidAmountMetricRef],
      },
      {
        key: 'order_revenue_analysis',
        name: '订单收入与客单价分析',
        description: '查询当前门店指定周期的实收金额',
        domains: ['product_order', 'payment'],
        intents: ['query', 'diagnosis'],
        examples: ['查询本月订单实收金额'],
        readOnly: true,
        definitionRefs: [paidAmountMetricRef],
      },
    ];

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      provider: 'governed_contract',
      model: 'metric_phrase_fast_path',
      intent: {
        intent: 'query',
        answerShape: 'scalar',
        metrics: [paidAmountMetricRef],
        dimensions: [],
        timeRange: { label: '过去3个月', timezone: 'Asia/Shanghai' },
      },
    });
    expect(aiService.generateStructured).not.toHaveBeenCalled();
  });

  it('uses the unique minimum-sufficient contract when broader capabilities share the same metric and dimension', async () => {
    const aiService = fakeAiService(async () => {
      throw new Error('model_should_not_be_called');
    });
    const compiler = createCompiler(aiService);
    const input = compilerInput('今天各支付方式的金额分别多少'); // BQ0705
    input.metricRefs = [paidAmountMetricRef];
    input.dimensionRefs = [paymentMethodDimensionRef];
    input.ontologySnapshot = {
      ...ontologySnapshot,
      metrics: [
        ...ontologySnapshot.metrics,
        {
          definitionKey: paidAmountMetricRef.definitionKey,
          version: paidAmountMetricRef.definitionVersion,
          definitionFingerprint: paidAmountMetricRef.definitionFingerprint,
          sourceFingerprint: paidAmountMetricRef.sourceFingerprint,
          metricKey: 'paid_amount',
          name: '实收金额',
          aliases: ['实收', '实收流水'],
          domain: 'payment',
          formula: { sql: 'SUM(paid_amount)' },
          source: { model: 'PaymentRecord' },
          defaultFilters: {},
          permissions: ['core:finance:view'],
          description: '支付成功记录的实收金额',
          runtimeQuery: {
            dimensions: ['paymentMethod'],
            capabilityKeys: [
              'order_revenue_analysis',
              'finance_risk_overview',
              'finance_payment_breakdown',
              'store_operations_overview',
            ],
          } as never,
        },
      ],
      dimensions: [
        ...ontologySnapshot.dimensions,
        {
          definitionKey: paymentMethodDimensionRef.definitionKey,
          version: paymentMethodDimensionRef.definitionVersion,
          definitionFingerprint: paymentMethodDimensionRef.definitionFingerprint,
          sourceFingerprint: paymentMethodDimensionRef.sourceFingerprint,
          dimensionKey: 'paymentMethod',
          name: '支付方式',
          aliases: ['收款渠道'],
          domain: 'payment',
          source: { model: 'PaymentRecord' },
          permissions: ['core:finance:view'],
        },
      ],
    };
    input.capabilitySummaries = [
      {
        key: 'finance_payment_breakdown',
        name: '支付拆分',
        description: '按支付方式拆分实收',
        domains: ['finance', 'payment'],
        intents: ['query'],
        readOnly: true,
        definitionRefs: [paidAmountMetricRef, paymentMethodDimensionRef],
      },
      {
        key: 'order_revenue_analysis',
        name: '订单收入与客单价分析',
        description: '查询当前门店指定周期的实收金额并按支付方式拆分',
        domains: ['product_order', 'payment'],
        intents: ['query', 'diagnosis'],
        examples: ['查询本月订单实收金额'],
        readOnly: true,
        definitionRefs: [paidAmountMetricRef, paymentMethodDimensionRef, productDimensionRef],
      },
      {
        key: 'finance_risk_overview',
        name: '财务风险概览',
        description: '财务风险和实收拆分',
        domains: ['finance', 'payment'],
        intents: ['query', 'diagnosis'],
        readOnly: true,
        definitionRefs: [paidAmountMetricRef, paymentMethodDimensionRef, customerEntityRef, projectEntityRef],
      },
      {
        key: 'store_operations_overview',
        name: '门店经营概览',
        description: '门店经营和实收拆分',
        domains: ['store_operations', 'payment'],
        intents: ['query'],
        readOnly: true,
        definitionRefs: [
          paidAmountMetricRef,
          paymentMethodDimensionRef,
          productDimensionRef,
          customerEntityRef,
          projectEntityRef,
          productEntityRef,
        ],
      },
    ];
    input.rankedCapabilityKeys = [
      'order_revenue_analysis',
      'finance_risk_overview',
      'finance_payment_breakdown',
      'store_operations_overview',
    ];

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      provider: 'governed_contract',
      model: 'metric_dimension_fast_path',
      intent: {
        intent: 'query',
        answerShape: 'list',
        metrics: [paidAmountMetricRef],
        dimensions: [paymentMethodDimensionRef],
        timeRange: { preset: 'today', label: '今天', timezone: 'Asia/Shanghai' },
        assumptions: [expect.stringContaining('finance_payment_breakdown')],
      },
    });
    expect(aiService.generateStructured).not.toHaveBeenCalled();
  });

  it('does not use the metric-dimension fast path when two metrics support the same dimension', async () => {
    const aiService = fakeAiService(async () => {
      throw new AiStructuredOutputError('BUDGET_EXCEEDED', 'structured budget exhausted');
    });
    const compiler = createCompiler(aiService);
    const input = compilerInput('今天各支付方式的金额分别多少'); // BQ0705
    input.metricRefs = [paidAmountMetricRef, refundCountMetricRef];
    input.dimensionRefs = [paymentMethodDimensionRef];
    const runtimeMetric = (
      ref: typeof paidAmountMetricRef | typeof refundCountMetricRef,
      metricKey: string,
      name: string,
    ) => ({
      definitionKey: ref.definitionKey,
      version: ref.definitionVersion,
      definitionFingerprint: ref.definitionFingerprint,
      sourceFingerprint: ref.sourceFingerprint,
      metricKey,
      name,
      aliases: ['金额'],
      domain: 'payment',
      formula: {},
      source: {},
      defaultFilters: {},
      permissions: [],
      description: metricKey,
      runtimeQuery: {
        dimensions: ['paymentMethod'],
        capabilityKeys: ['order_revenue_analysis'],
      } as never,
    });
    input.ontologySnapshot = {
      ...ontologySnapshot,
      metrics: [
        ...ontologySnapshot.metrics,
        runtimeMetric(paidAmountMetricRef, 'paid_amount', '支付金额'),
        runtimeMetric(refundCountMetricRef, 'payment_count', '收款金额'),
      ],
      dimensions: [
        {
          definitionKey: paymentMethodDimensionRef.definitionKey,
          version: paymentMethodDimensionRef.definitionVersion,
          definitionFingerprint: paymentMethodDimensionRef.definitionFingerprint,
          sourceFingerprint: paymentMethodDimensionRef.sourceFingerprint,
          dimensionKey: 'paymentMethod',
          name: '支付方式',
          aliases: [],
          domain: 'payment',
          source: {},
          permissions: [],
        },
      ],
    };
    input.preferredCapabilityKey = 'order_revenue_analysis';
    input.capabilitySummaries = [
      {
        key: 'order_revenue_analysis',
        name: '订单收入分析',
        description: '支付方式金额与笔数',
        domains: ['payment'],
        intents: ['query'],
        readOnly: true,
        definitionRefs: [paidAmountMetricRef, refundCountMetricRef, paymentMethodDimensionRef],
      },
    ];

    const result = await compiler.compile(input);
    expect(result).toMatchObject({ status: 'completed' });
    expect(result.status === 'completed' ? result.model : null).not.toBe('metric_dimension_fast_path');
    expect(aiService.generateStructured).toHaveBeenCalled();
  });

  it('does not use definition fallback when more than one capability matches the same metric', async () => {
    const aiService = fakeAiService(async () => {
      throw new AiStructuredOutputError('BUDGET_EXCEEDED', 'structured budget exhausted');
    });
    const compiler = createCompiler(aiService);
    const input = compilerInput('本月退款多少');
    input.metricRefs = [refundAmountMetricRef];
    input.capabilitySummaries = [
      {
        key: 'finance_refund_overview',
        name: '退款概览',
        description: '退款金额',
        domains: ['finance'],
        intents: ['query'],
        readOnly: true,
        definitionRefs: [refundAmountMetricRef],
      },
      {
        key: 'finance_risk_overview',
        name: '财务风险概览',
        description: '退款风险',
        domains: ['finance'],
        intents: ['query', 'diagnosis'],
        readOnly: true,
        definitionRefs: [refundAmountMetricRef],
      },
    ];

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'unavailable',
      errorCode: 'BUDGET_EXCEEDED',
    });
  });

  it('keeps an exact governed month-over-month example as comparison instead of query', async () => {
    const aiService = fakeAiService(async () => {
      throw new AiStructuredOutputError('BUDGET_EXCEEDED', 'structured budget exhausted');
    });
    const compiler = createCompiler(aiService);
    const input = compilerInput('收入环比是涨了还是跌了，差额多少');
    input.capabilitySummaries = [
      {
        key: 'finance_payment_breakdown',
        name: '实收与储值流水拆分',
        description: '实收查询、趋势与周期对比',
        domains: ['finance', 'payment'],
        intents: ['query', 'ranking', 'comparison', 'trend'],
        examples: ['收入环比是涨了还是跌了，差额多少'],
        readOnly: true,
        definitionRefs: [paidAmountMetricRef],
      },
    ];

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      provider: 'governed_contract',
      intent: {
        intent: 'comparison',
        answerShape: 'comparison',
        timeRange: { preset: 'this_month', label: '本月' },
        comparisonTarget: { type: 'time', timeRange: { preset: 'last_month', label: '上月' } },
      },
    });
  });

  it('uses the governed payment ranking example without calling the model', async () => {
    const aiService = fakeAiService(async () => {
      throw new Error('model_should_not_be_called');
    });
    const compiler = createCompiler(aiService);
    const input = compilerInput('其中哪种支付方式最多？');
    input.capabilitySummaries = [
      {
        key: 'finance_payment_breakdown',
        name: '实收与储值流水拆分',
        description: '实收查询、趋势与周期对比',
        domains: ['finance', 'payment'],
        intents: ['query', 'ranking', 'comparison', 'trend'],
        examples: ['其中哪种支付方式最多'],
        readOnly: true,
        definitionRefs: [paidAmountMetricRef, paymentMethodDimensionRef],
      },
    ];

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      provider: 'governed_contract',
      model: 'exact_example_fast_path',
      intent: {
        intent: 'ranking',
        answerShape: 'ranking',
        metrics: [expect.objectContaining({ definitionKey: 'metric.paid_amount' })],
        dimensions: [expect.objectContaining({ definitionKey: 'dimension.paymentMethod' })],
        orderBy: [expect.objectContaining({ direction: 'desc' })],
      },
    });
  });

  it('uses the unique governed payment dimension when the model budget is unavailable', async () => {
    const aiService = fakeAiService(async () => {
      throw new AiStructuredOutputError('BUDGET_EXCEEDED', 'structured budget exhausted');
    });
    const compiler = createCompiler(aiService);
    const input = compilerInput('本月支付方式拆分');
    input.ontologySnapshot = {
      ...ontologySnapshot,
      dimensions: [
        ...ontologySnapshot.dimensions,
        {
          definitionKey: paymentMethodDimensionRef.definitionKey,
          version: paymentMethodDimensionRef.definitionVersion,
          definitionFingerprint: paymentMethodDimensionRef.definitionFingerprint,
          sourceFingerprint: paymentMethodDimensionRef.sourceFingerprint,
          dimensionKey: 'paymentMethod',
          name: '支付方式',
          aliases: ['收款渠道'],
          domain: 'payment',
          source: { model: 'Payment' },
          permissions: ['core:finance:view'],
        },
      ],
    };
    input.capabilitySummaries = [
      {
        key: 'finance_payment_breakdown',
        name: '实收与储值流水拆分',
        description: '实收查询、趋势与周期对比',
        domains: ['finance', 'payment'],
        intents: ['query', 'ranking', 'comparison', 'trend'],
        examples: ['本月实收按支付方式怎么分'],
        readOnly: true,
        definitionRefs: [paidAmountMetricRef, paymentMethodDimensionRef],
      },
      {
        key: 'store_operations_overview',
        name: '门店经营概览',
        description: '宽泛经营概览也包含支付方式信息',
        domains: ['store_operations', 'payment'],
        intents: ['query'],
        examples: ['本月经营情况怎么样'],
        readOnly: true,
        definitionRefs: [paidAmountMetricRef, paymentMethodDimensionRef, productEntityRef],
      },
    ];

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      provider: 'governed_contract',
      model: 'definition_match_fallback',
      intent: {
        intent: 'query',
        answerShape: 'list',
        dimensions: [expect.objectContaining({ definitionKey: 'dimension.paymentMethod' })],
      },
    });

    input.question = '这个月各种收款渠道分别收了多少';
    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      provider: 'governed_contract',
      model: 'definition_match_fallback',
      intent: {
        dimensions: [expect.objectContaining({ definitionKey: 'dimension.paymentMethod' })],
        assumptions: [expect.stringContaining('finance_payment_breakdown')],
      },
    });
  });

  it.each([
    {
      caseId: 'BQ0464',
      question: '有哪些焕肤清洁 12 次卡在售', // BQ0464
      capabilityKey: 'finance_risk_overview',
      intents: ['query', 'comparison', 'diagnosis'],
      definitionRefs: [paidAmountMetricRef, cardNameDimensionRef],
      expected: {
        intent: 'query',
        answerShape: 'list',
        dimensions: [expect.objectContaining({ definitionKey: 'dimension.cardName' })],
        successCriteria: [expect.stringContaining('在售 Card')],
      },
    },
    {
      caseId: 'BQ0621',
      question: '最近三个月一共有多少笔订单', // BQ0621
      capabilityKey: 'finance_payment_breakdown',
      intents: ['query', 'ranking', 'comparison', 'trend'],
      definitionRefs: [paidAmountMetricRef, orderCountMetricRef],
      expected: {
        intent: 'query',
        answerShape: 'scalar',
        timeRange: { label: '过去3个月' },
        metrics: [expect.objectContaining({ definitionKey: 'metric.order_count' })],
        successCriteria: [expect.stringContaining('ProductOrder')],
      },
    },
    {
      caseId: 'BQ0661',
      // BQ0661
      question: '最近三个月各支付方式的金额分别多少',
      capabilityKey: 'finance_payment_breakdown',
      intents: ['query', 'ranking', 'comparison', 'trend'],
      definitionRefs: [paidAmountMetricRef, paymentMethodDimensionRef],
      expected: {
        intent: 'query',
        answerShape: 'list',
        timeRange: { label: '过去3个月' },
        dimensions: [expect.objectContaining({ definitionKey: 'dimension.paymentMethod' })],
      },
    },
    {
      caseId: 'BQ0706',
      // BQ0706
      question: '最近三个月营业额和最近7天比怎么样',
      capabilityKey: 'finance_payment_breakdown',
      intents: ['query', 'ranking', 'comparison', 'trend'],
      definitionRefs: [paidAmountMetricRef, paymentMethodDimensionRef],
      expected: {
        intent: 'comparison',
        answerShape: 'comparison',
        timeRange: { label: '过去3个月' },
        comparisonTarget: { type: 'time', timeRange: { label: '最近7天' } },
      },
    },
    {
      caseId: 'BQ0707',
      // BQ0707
      question: '最近三个月订单量的趋势',
      capabilityKey: 'finance_payment_breakdown',
      intents: ['query', 'ranking', 'comparison', 'trend'],
      definitionRefs: [paidAmountMetricRef, orderCountMetricRef],
      expected: {
        intent: 'trend',
        answerShape: 'trend',
        timeRange: { label: '过去3个月' },
        metrics: [expect.objectContaining({ definitionKey: 'metric.order_count' })],
      },
    },
    {
      caseId: 'BQ0747',
      // BQ0747
      question: '最近三个月有订单支付和金额对不上吗',
      capabilityKey: 'finance_risk_overview',
      intents: ['query', 'comparison', 'diagnosis'],
      definitionRefs: [paidAmountMetricRef],
      expected: {
        intent: 'diagnosis',
        answerShape: 'diagnosis',
        timeRange: { label: '过去3个月' },
      },
    },
  ])(
    '$caseId routes the release-core finance question through an exact governed contract',
    async ({ question, capabilityKey, intents, definitionRefs, expected }) => {
      const aiService = fakeAiService(async () => {
        throw new Error('model_should_not_be_called');
      });
      const compiler = createCompiler(aiService);
      const input = compilerInput(question);
      input.capabilitySummaries = [
        {
          key: capabilityKey,
          name: capabilityKey === 'finance_risk_overview' ? '财务经营风险概览' : '实收与储值流水拆分',
          description: '财务查询与风险核对',
          domains: ['finance', 'payment', 'order'],
          intents,
          examples: ['这是一条不相关的财务能力示例'],
          readOnly: true,
          definitionRefs,
        },
      ];

      await expect(compiler.compile(input)).resolves.toMatchObject({
        status: 'completed',
        selectedCapabilityKey: capabilityKey,
        provider: 'governed_contract',
        model: 'finance_release_core_fast_path',
        intent: expected,
      });
      expect(aiService.generateStructured).not.toHaveBeenCalled();
    },
  );

  it('keeps an exact paid amount question scalar instead of adding payment grouping', async () => {
    const aiService = fakeAiService(async () => {
      throw new Error('model_should_not_be_called');
    });
    const compiler = createCompiler(aiService);
    const input = compilerInput('本月实收多少');
    input.capabilitySummaries = [
      {
        key: 'finance_payment_breakdown',
        name: '实收与储值流水拆分',
        description: '实收查询、趋势与周期对比',
        domains: ['finance', 'payment'],
        intents: ['query', 'ranking', 'comparison', 'trend'],
        examples: ['本月实收多少'],
        readOnly: true,
        definitionRefs: [paidAmountMetricRef, paymentMethodDimensionRef],
      },
    ];

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      provider: 'governed_contract',
      model: 'exact_example_fast_path',
      intent: {
        intent: 'query',
        answerShape: 'scalar',
        metrics: [expect.objectContaining({ definitionKey: 'metric.paid_amount' })],
        dimensions: [],
        orderBy: [],
      },
    });
  });

  it.each([
    {
      // ami-brain-historical-only: historical regression fixture; excluded from release gate and pass-rate denominator
      question: '2026年1月1日至6月30日的毛利是多少',
      metricRefs: [grossProfitMetricRef],
    },
    {
      // ami-brain-historical-only: historical regression fixture; excluded from release gate and pass-rate denominator
      question: '2026年6月29日的经营利润是多少',
      metricRefs: [operatingProfitMetricRef],
    },
    {
      // ami-brain-historical-only: historical regression fixture; excluded from release gate and pass-rate denominator
      question: '2026年6月成本占收入的比例',
      metricRefs: [costIncomeRatioMetricRef],
    },
    {
      // ami-brain-historical-only: historical regression fixture; excluded from release gate and pass-rate denominator
      question: '2026年6月的收银班次对平了吗',
      metricRefs: [cashShiftReconciliationRateMetricRef],
    },
    {
      // ami-brain-historical-only: historical regression fixture; excluded from release gate and pass-rate denominator
      question: '截至2026/07/29 12:45:41的储值负债总额',
      metricRefs: [storedValueLiabilityMetricRef],
    },
    {
      // ami-brain-historical-only: historical regression fixture; excluded from release gate and pass-rate denominator
      question: '2026年6月30日次卡核销确认的收入有多少',
      metricRefs: [cardRecognizedRevenueMetricRef],
    },
    {
      // ami-brain-historical-only: historical regression fixture; excluded from release gate and pass-rate denominator
      question: '截至2026/07/29 12:45:41，综合养护 20 次卡的确认收入进度',
      metricRefs: [cardRecognizedRevenueMetricRef],
    },
  ])(
    'uses the governed finance scalar fast path before calling the model: $question',
    async ({ question, metricRefs }) => {
      const aiService = fakeAiService(async () => {
        throw new Error('model_should_not_be_called');
      });
      const compiler = createCompiler(aiService);
      const input = compilerInput(question);
      input.metricRefs = metricRefs;
      input.dimensionRefs = [];
      input.capabilitySummaries = [
        {
          key: 'finance_material_cost_summary',
          name: '耗材成本问数摘要',
          description: '查询耗材成本及耗材成本率',
          domains: ['finance', 'inventory'],
          intents: ['query'],
          readOnly: true,
          definitionRefs: [productEntityRef],
        },
        {
          key: 'finance_risk_overview',
          name: '财务经营风险概览',
          description: '查询毛利、经营利润、成本收入比、收银对平和会员卡负债',
          domains: ['finance', 'operating_cost', 'payment'],
          intents: ['query', 'diagnosis'],
          readOnly: true,
          definitionRefs: [...metricRefs],
        },
      ];
      input.rankedCapabilityKeys = ['finance_material_cost_summary', 'finance_risk_overview'];

      await expect(compiler.compile(input)).resolves.toMatchObject({
        status: 'completed',
        selectedCapabilityKey: 'finance_risk_overview',
        provider: 'governed_contract',
        model: 'finance_scalar_fast_path',
        intent: {
          intent: 'query',
          answerShape: 'scalar',
          metrics: metricRefs,
          dimensions: [],
          assumptions: [expect.stringContaining('finance_risk_overview')],
        },
      });
      expect(aiService.generateStructured).not.toHaveBeenCalled();
    },
  );

  it('keeps multiple generic finance scalar metrics on the finance risk capability', async () => {
    const aiService = fakeAiService(async () => {
      throw new Error('model_should_not_be_called');
    });
    const compiler = createCompiler(aiService);
    // ami-brain-historical-only: historical regression fixture; excluded from release gate and pass-rate denominator
    const input = compilerInput('本月毛利、经营利润和储值负债分别多少');
    const metricRefs = [grossProfitMetricRef, operatingProfitMetricRef, storedValueLiabilityMetricRef];
    input.metricRefs = metricRefs;
    input.dimensionRefs = [];
    input.capabilitySummaries = [
      {
        key: 'finance_risk_overview',
        name: '财务经营风险概览',
        description: '查询毛利、经营利润和储值负债',
        domains: ['finance', 'operating_cost'],
        intents: ['query', 'diagnosis'],
        readOnly: true,
        definitionRefs: metricRefs,
      },
    ];

    const result = await compiler.compile(input);

    expect(result).toMatchObject({
      status: 'completed',
      selectedCapabilityKey: 'finance_risk_overview',
      provider: 'governed_contract',
      model: 'finance_scalar_fast_path',
      intent: {
        intent: 'query',
        answerShape: 'scalar',
        dimensions: [],
      },
    });
    expect(result.status === 'completed' ? result.intent.metrics.map((ref) => ref.definitionKey).sort() : []).toEqual(
      metricRefs.map((ref) => ref.definitionKey).sort(),
    );
    expect(aiService.generateStructured).not.toHaveBeenCalled();
  });

  it('routes card recognized revenue to the finance risk capability', async () => {
    const aiService = fakeAiService(async () => {
      throw new Error('model_should_not_be_called');
    });
    const compiler = createCompiler(aiService);
    // ami-brain-historical-only: historical regression fixture; excluded from release gate and pass-rate denominator
    const input = compilerInput('截至2026/07/29 12:45:41，综合养护 20 次卡的确认收入进度');
    input.metricRefs = [cardRecognizedRevenueMetricRef];
    input.dimensionRefs = [];
    input.capabilitySummaries = [
      {
        key: 'finance_risk_overview',
        name: '财务经营风险概览',
        description: '查询次卡核销确认收入',
        domains: ['finance'],
        intents: ['query', 'diagnosis'],
        readOnly: true,
        definitionRefs: [cardRecognizedRevenueMetricRef],
      },
    ];

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      selectedCapabilityKey: 'finance_risk_overview',
      provider: 'governed_contract',
      model: 'finance_scalar_fast_path',
      intent: {
        intent: 'query',
        answerShape: 'scalar',
        metrics: [expect.objectContaining({ definitionKey: 'metric.card_recognized_revenue_amount' })],
      },
    });
  });

  it('keeps project order profit questions on the finance risk capability instead of project margin analysis', async () => {
    const aiService = fakeAiService(async () => {
      throw new Error('model_should_not_be_called');
    });
    const compiler = createCompiler(aiService);
    // ami-brain-historical-only: historical regression fixture; excluded from release gate and pass-rate denominator
    const input = compilerInput('晒后舒缓修护订单2026年6月17日至30日的利润情况'); // BQ0846
    input.metricRefs = [];
    input.dimensionRefs = [];
    input.capabilitySummaries = [
      {
        key: 'project_margin_analysis',
        name: '项目毛利分析',
        description: '分析项目汇总毛利',
        domains: ['project', 'finance'],
        intents: ['query', 'diagnosis'],
        readOnly: true,
        definitionRefs: [projectEntityRef],
      },
      {
        key: 'finance_risk_overview',
        name: '财务经营风险概览',
        description: '查询项目下订单粒度利润',
        domains: ['finance', 'order', 'project'],
        intents: ['query', 'diagnosis'],
        readOnly: true,
        definitionRefs: [],
      },
    ];
    input.rankedCapabilityKeys = ['project_margin_analysis', 'finance_risk_overview'];

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      selectedCapabilityKey: 'finance_risk_overview',
      provider: 'governed_contract',
      model: 'finance_order_profit_fast_path',
      intent: {
        intent: 'query',
        answerShape: 'scalar',
        metrics: [],
      },
    });
    expect(aiService.generateStructured).not.toHaveBeenCalled();
  });

  it.each([
    {
      // ami-brain-historical-only: historical regression fixture; excluded from release gate and pass-rate denominator
      question: '2026年6月30日每张订单的毛利分别多少',
      metricRefs: [orderGrossProfitMetricRef],
      answerShape: 'list',
    },
    {
      // ami-brain-historical-only: historical regression fixture; excluded from release gate and pass-rate denominator
      question: '2026年6月30日哪些订单毛利为负',
      metricRefs: [negativeMarginOrderCountMetricRef],
      answerShape: 'list',
    },
    {
      // ami-brain-historical-only: historical regression fixture; excluded from release gate and pass-rate denominator
      question: '2026年6月30日开卡订单的利润分析',
      metricRefs: [prepaidOrderGrossProfitMetricRef],
      answerShape: 'scalar',
    },
    {
      // ami-brain-historical-only: historical regression fixture; excluded from release gate and pass-rate denominator
      question: '2026年6月30日产品订单的成本和毛利',
      metricRefs: [productOrderTotalCostMetricRef, productOrderGrossProfitMetricRef],
      answerShape: 'scalar',
    },
  ])(
    'routes order profit governed metrics to finance risk: $question',
    async ({ question, metricRefs, answerShape }) => {
      const aiService = fakeAiService(async () => {
        throw new Error('model_should_not_be_called');
      });
      const compiler = createCompiler(aiService);
      const input = compilerInput(question);
      input.metricRefs = metricRefs;
      input.dimensionRefs = [];
      input.capabilitySummaries = [
        {
          key: 'finance_risk_overview',
          name: '财务经营风险概览',
          description: '查询订单粒度收入、成本和利润',
          domains: ['finance', 'order'],
          intents: ['query', 'diagnosis'],
          readOnly: true,
          definitionRefs: metricRefs,
        },
      ];

      const result = await compiler.compile(input);

      expect(result).toMatchObject({
        status: 'completed',
        selectedCapabilityKey: 'finance_risk_overview',
        provider: 'governed_contract',
        model: 'finance_order_profit_fast_path',
        intent: {
          intent: 'query',
          answerShape,
        },
      });
      expect(result.status === 'completed' ? result.intent.metrics.map((ref) => ref.definitionKey).sort() : []).toEqual(
        metricRefs.map((ref) => ref.definitionKey).sort(),
      );
      expect(aiService.generateStructured).not.toHaveBeenCalled();
    },
  );

  it('routes staff commission composition questions to the finance risk capability before calling the model', async () => {
    const aiService = fakeAiService(async () => {
      throw new Error('model_should_not_be_called');
    });
    const compiler = createCompiler(aiService);
    // ami-brain-historical-only: historical regression fixture; excluded from release gate and pass-rate denominator
    const input = compilerInput('顾然2026年6月22日至28日的提成构成'); // BQ1332
    input.metricRefs = [staffCommissionComponentMetricRef];
    input.dimensionRefs = [commissionTypeDimensionRef];
    input.capabilitySummaries = [
      {
        key: 'manager_staff_overview',
        name: '员工经营概览',
        description: '员工绩效与提成排行',
        domains: ['staff', 'beautician'],
        intents: ['ranking'],
        readOnly: true,
        definitionRefs: [staffCommissionMetricRef],
      },
      {
        key: 'finance_risk_overview',
        name: '财务经营风险概览',
        description: '查询员工提成构成',
        domains: ['finance', 'staff', 'beautician'],
        intents: ['query'],
        readOnly: true,
        definitionRefs: [staffCommissionComponentMetricRef, commissionTypeDimensionRef],
      },
    ];
    input.rankedCapabilityKeys = ['manager_staff_overview', 'finance_risk_overview'];

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      selectedCapabilityKey: 'finance_risk_overview',
      provider: 'governed_contract',
      model: 'finance_staff_commission_composition_fast_path',
      intent: {
        intent: 'query',
        answerShape: 'list',
        metrics: [staffCommissionComponentMetricRef],
        dimensions: [commissionTypeDimensionRef],
      },
    });
    expect(aiService.generateStructured).not.toHaveBeenCalled();
  });

  it.each([
    {
      // BQ0181
      question: '预测马欣怡的流失风险有多高',
      expectedIntent: 'query',
      expectedShape: 'list',
      expectedCustomerName: '马欣怡',
    },
    {
      // BQ0183
      question: '本周末哪些客户最可能复购',
      expectedIntent: 'query',
      expectedShape: 'ranking',
    },
    {
      // BQ0185
      question: '对营销触达响应度最高的是哪些客户',
      expectedIntent: 'query',
      expectedShape: 'ranking',
    },
    {
      // BQ0184
      question: '预测黄婉清的12个月生命周期价值',
      expectedIntent: 'query',
      expectedShape: 'list',
      expectedCustomerName: '黄婉清',
    },
  ])(
    'routes customer prediction assets without spending model budget: $question',
    async ({ question, expectedIntent, expectedShape, expectedCustomerName }) => {
      const aiService = fakeAiService(async () => {
        throw new AiStructuredOutputError('BUDGET_EXCEEDED', 'structured budget exhausted');
      });
      const compiler = createCompiler(aiService);
      const input = compilerInput(question);
      input.capabilitySummaries = [
        {
          key: 'marketing_customer_segment',
          name: '营销客户分群摘要',
          description: '读取客户分群与最新预测快照',
          domains: ['customer', 'marketing'],
          intents: ['query', 'diagnosis'],
          readOnly: true,
          definitionRefs: [customerEntityRef],
        },
      ];
      input.rankedCapabilityKeys = ['marketing_customer_segment'];

      const result = await compiler.compile(input);

      expect(result).toMatchObject({
        status: 'completed',
        selectedCapabilityKey: 'marketing_customer_segment',
        provider: 'governed_contract',
        model: 'customer_prediction_fast_path',
        intent: { intent: expectedIntent, answerShape: expectedShape, missingSlots: [] },
      });
      if (expectedCustomerName) {
        expect(result.status === 'completed' ? result.intent.entities : []).toEqual([
          expect.objectContaining({ entityType: 'customer', mention: expectedCustomerName }),
        ]);
      }
      expect(aiService.generateStructured).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      // BQ0276
      question: '顾然这半年服务了多少个客户',
      metricRef: staffUniqueCustomerCountMetricRef,
      expectedIntent: 'query',
      expectedShape: 'scalar',
    },
    {
      // BQ0277
      question: '这半年哪个美容师业绩最高',
      metricRef: staffServiceRevenueMetricRef,
      expectedIntent: 'ranking',
      expectedShape: 'ranking',
    },
  ])(
    'routes governed staff cross-table metrics before customer or model fallback: $question',
    async ({ question, metricRef, expectedIntent, expectedShape }) => {
      const aiService = fakeAiService(async () => {
        throw new Error('model_should_not_be_called');
      });
      const compiler = createCompiler(aiService);
      const input = compilerInput(question);
      input.capabilitySummaries = [
        {
          key: 'customer_facts',
          name: '客户事实',
          description: '客户事实查询',
          domains: ['customer'],
          intents: ['query'],
          readOnly: true,
          definitionRefs: [customerEntityRef],
        },
        {
          key: 'manager_staff_overview',
          name: '店长员工运营分析',
          description: '员工服务客户数和关联业绩排行',
          domains: ['staff', 'beautician'],
          intents: ['query', 'ranking'],
          readOnly: true,
          definitionRefs: [
            beauticianEntityRef,
            beauticianNameDimensionRef,
            staffUniqueCustomerCountMetricRef,
            staffServiceRevenueMetricRef,
          ],
        },
      ];
      input.rankedCapabilityKeys = ['customer_facts', 'manager_staff_overview'];

      const result = await compiler.compile(input);

      expect(result).toMatchObject({
        status: 'completed',
        selectedCapabilityKey: 'manager_staff_overview',
        provider: 'governed_contract',
        model: 'manager_staff_metric_fast_path',
        intent: {
          intent: expectedIntent,
          answerShape: expectedShape,
          metrics: [metricRef],
          missingSlots: [],
        },
      });
      if (expectedIntent === 'ranking') {
        expect(result.status === 'completed' ? result.intent.orderBy : []).toEqual([
          { definitionRef: metricRef, direction: 'desc' },
        ]);
      }
      expect(aiService.generateStructured).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      // ami-brain-unit-only: employee trend paraphrase
      question: '顾然的业绩走势如何',
      expectedIntent: 'query',
      expectedShape: 'comparison',
      expectedEntity: '顾然',
    },
    {
      // ami-brain-unit-only: cross-sell paraphrase
      question: '对比去年同期各美容师的连带率',
      expectedIntent: 'ranking',
      expectedShape: 'comparison',
    },
    {
      // ami-brain-unit-only: staff-level revenue paraphrase
      question: '去年同期按职级看，哪个层级的业绩产出最高',
      expectedIntent: 'ranking',
      expectedShape: 'ranking',
    },
    {
      // ami-brain-unit-only: primary-staff decline paraphrase
      question: '本周主力员工中有没有人实收下降',
      expectedIntent: 'diagnosis',
      expectedShape: 'diagnosis',
    },
    {
      // ami-brain-unit-only: skill coverage paraphrase
      question: '项目技能配置有没有缺口，哪些护理只有一人或没人能做',
      expectedIntent: 'diagnosis',
      expectedShape: 'diagnosis',
    },
    {
      // ami-brain-unit-only: named decline advice paraphrase
      question: '唐伊业绩下降了，如何帮她改善',
      expectedIntent: 'diagnosis',
      expectedShape: 'diagnosis',
      expectedEntity: '唐伊',
    },
    {
      // BQ0412
      question: '昨天排班怎么优化能提升产能',
      expectedIntent: 'diagnosis',
      expectedShape: 'diagnosis',
    },
    {
      // BQ0414
      question: '给宋乔制定成长建议',
      expectedIntent: 'diagnosis',
      expectedShape: 'diagnosis',
      expectedEntity: '宋乔',
    },
    {
      // BQ0415
      question: '技能缺口怎么补，要不要培训',
      expectedIntent: 'diagnosis',
      expectedShape: 'diagnosis',
    },
  ])(
    'routes release-core staff analysis to the governed manager capability: $question',
    async ({ question, expectedIntent, expectedShape, expectedEntity }) => {
      const aiService = fakeAiService(async () => {
        throw new Error('model_should_not_be_called');
      });
      const compiler = createCompiler(aiService);
      const input = compilerInput(question);
      input.capabilitySummaries = [
        {
          key: 'customer_facts',
          name: '客户事实',
          description: '客户事实查询',
          domains: ['customer'],
          intents: ['query'],
          readOnly: true,
          definitionRefs: [customerEntityRef],
        },
        {
          key: 'manager_staff_overview',
          name: '店长员工运营分析',
          description: '员工趋势、连带销售、职级产出、技能覆盖与下滑诊断',
          domains: ['staff', 'beautician'],
          intents: ['query', 'ranking', 'comparison', 'diagnosis'],
          readOnly: true,
          definitionRefs: [
            beauticianEntityRef,
            beauticianNameDimensionRef,
            staffServiceCountMetricRef,
            staffUniqueCustomerCountMetricRef,
            staffServiceRevenueMetricRef,
          ],
        },
      ];
      input.rankedCapabilityKeys = ['customer_facts', 'manager_staff_overview'];

      const result = await compiler.compile(input);

      expect(result).toMatchObject({
        status: 'completed',
        selectedCapabilityKey: 'manager_staff_overview',
        provider: 'governed_contract',
        model: 'manager_staff_metric_fast_path',
        intent: { intent: expectedIntent, answerShape: expectedShape, missingSlots: [] },
      });
      if (expectedEntity) {
        expect(result.status === 'completed' ? result.intent.entities : []).toEqual([
          expect.objectContaining({ entityType: 'beautician', mention: expectedEntity }),
        ]);
      }
      expect(aiService.generateStructured).not.toHaveBeenCalled();
    },
  );

  it('routes a card-package sales superlative to the governed finance read path', async () => {
    const aiService = fakeAiService(async () => {
      throw new Error('model_should_not_be_called');
    });
    const compiler = createCompiler(aiService);
    const input = compilerInput('本月卖得最好的焕肤清洁 12 次卡是哪个'); // BQ0499
    input.capabilitySummaries = [
      {
        key: 'customer_facts',
        name: '客户事实',
        description: '客户持卡事实查询',
        domains: ['customer'],
        intents: ['query'],
        readOnly: true,
        definitionRefs: [customerEntityRef],
      },
      {
        key: 'finance_risk_overview',
        name: '财务经营风险概览',
        description: '读取次卡开卡销售张数与实收排行',
        domains: ['finance', 'order'],
        intents: ['query', 'ranking'],
        readOnly: true,
        definitionRefs: [],
      },
    ];
    input.rankedCapabilityKeys = ['customer_facts', 'finance_risk_overview'];

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      selectedCapabilityKey: 'finance_risk_overview',
      provider: 'governed_contract',
      model: 'card_package_sales_ranking_fast_path',
      intent: {
        intent: 'query',
        answerShape: 'ranking',
        missingSlots: [],
        assumptions: [expect.stringContaining('开卡张数降序')],
      },
    });
    expect(aiService.generateStructured).not.toHaveBeenCalled();
  });

  it('prioritizes aggregate project margin analysis over customer facts, finance and project BOM routing', async () => {
    const aiService = fakeAiService(async () => {
      throw new Error('model_should_not_be_called');
    });
    const compiler = createCompiler(aiService);
    const input = compilerInput('分析下最近三个月各项目的毛利'); // BQ0536
    input.capabilitySummaries = [
      {
        key: 'customer_facts',
        name: '客户事实',
        description: '客户事实查询',
        domains: ['customer'],
        intents: ['query'],
        readOnly: true,
        definitionRefs: [customerEntityRef],
      },
      {
        key: 'project_material_consumption_analysis',
        name: '项目耗材分析',
        description: '读取项目 BOM 和实际耗材',
        domains: ['project', 'inventory'],
        intents: ['query', 'ranking'],
        readOnly: true,
        definitionRefs: [projectEntityRef],
      },
      {
        key: 'finance_risk_overview',
        name: '财务经营风险概览',
        description: '财务风险与订单利润',
        domains: ['finance'],
        intents: ['query', 'diagnosis'],
        readOnly: true,
        definitionRefs: [],
      },
      {
        key: 'project_margin_analysis',
        name: '项目毛利分析',
        description: '返回各项目收入、成本、贡献毛利和毛利率',
        domains: ['project', 'finance'],
        intents: ['query', 'ranking', 'diagnosis'],
        readOnly: true,
        definitionRefs: [projectEntityRef],
      },
    ];
    input.rankedCapabilityKeys = [
      'customer_facts',
      'project_material_consumption_analysis',
      'finance_risk_overview',
      'project_margin_analysis',
    ];

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      selectedCapabilityKey: 'project_margin_analysis',
      provider: 'governed_contract',
      model: 'project_margin_fast_path',
      intent: {
        intent: 'query',
        answerShape: 'ranking',
        entities: [expect.objectContaining({ entityType: 'project' })],
        missingSlots: [],
      },
    });
    expect(aiService.generateStructured).not.toHaveBeenCalled();
  });

  it.each([
    ['BQ0537', '哪些项目叫好不叫座'],
    ['BQ0540', '紧致抗衰护理最近7天的复购情况分析'],
    ['BQ0566', '想提升客单价该主推哪些项目'],
    ['BQ0567', '射频紧致提升护理卖不动，建议怎么办'],
    ['BQ0568', '该不该给眼周紧致护理调价'],
    ['BQ0611', '全身精油 SPA是不是卖不动了'],
    ['BQ0613', '有哪些项目毛利过低'],
    ['BQ0616', '有没有项目长期零销量'],
  ])('routes release-core project operating case %s through governed project facts', async (_caseId, question) => {
    const aiService = fakeAiService(async () => {
      throw new Error('model_should_not_be_called');
    });
    const compiler = createCompiler(aiService);
    const input = compilerInput(question);
    input.capabilitySummaries = [
      {
        key: 'project_margin_analysis',
        name: '项目经营与毛利分析',
        description: '返回项目销量、价格、收入、成本、贡献毛利与成本缺口',
        domains: ['project', 'finance'],
        intents: ['query', 'ranking', 'diagnosis'],
        readOnly: true,
        definitionRefs: [projectEntityRef],
      },
    ];

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      selectedCapabilityKey: 'project_margin_analysis',
      provider: 'governed_contract',
      model: 'project_margin_fast_path',
      intent: {
        entities: [expect.objectContaining({ entityType: 'project' })],
        missingSlots: [],
        assumptions: expect.arrayContaining([expect.stringContaining('只读经营判断')]),
      },
    });
    expect(aiService.generateStructured).not.toHaveBeenCalled();
  });

  it('BQ0614 routes project sales demand and BOM stock coverage to the read-only inventory capability', async () => {
    const aiService = fakeAiService(async () => {
      throw new Error('model_should_not_be_called');
    });
    const compiler = createCompiler(aiService);
    const input = compilerInput('紧致抗衰护理的库存耗材跟得上销量吗'); // BQ0614
    input.capabilitySummaries = [
      {
        key: 'project_margin_analysis',
        name: '项目经营与毛利分析',
        description: '返回项目销量、收入和毛利',
        domains: ['project', 'finance'],
        intents: ['query', 'diagnosis'],
        readOnly: true,
        definitionRefs: [projectEntityRef],
      },
      {
        key: 'inventory_operations_overview',
        name: '库存采购运营概览',
        description: '核对项目销量需求、标准 BOM 与当前耗材库存',
        domains: ['inventory', 'project', 'product'],
        intents: ['query', 'diagnosis'],
        readOnly: true,
        definitionRefs: [projectEntityRef, productNameDimensionRef],
      },
    ];

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      selectedCapabilityKey: 'inventory_operations_overview',
      provider: 'governed_contract',
      model: 'project_material_coverage_fast_path',
      intent: {
        intent: 'diagnosis',
        answerShape: 'diagnosis',
        domains: ['project', 'inventory', 'product'],
        successCriteria: expect.arrayContaining([expect.stringContaining('不创建采购单')]),
      },
    });
    expect(aiService.generateStructured).not.toHaveBeenCalled();
  });

  it('routes governed order profit even when finance risk is missing from the retrieved Top-K summaries', async () => {
    const aiService = fakeAiService(async () => {
      throw new Error('model_should_not_be_called');
    });
    const compiler = createCompiler(aiService);
    // ami-brain-historical-only: historical regression fixture; excluded from release gate and pass-rate denominator
    const input = compilerInput('2026年6月30日哪些订单毛利为负'); // BQ0857
    input.metricRefs = [];
    input.dimensionRefs = [];
    input.capabilitySummaries = [
      {
        key: 'project_margin_analysis',
        name: '项目毛利分析',
        description: '分析项目汇总毛利',
        domains: ['project', 'finance'],
        intents: ['query', 'diagnosis'],
        readOnly: true,
        definitionRefs: [projectEntityRef],
      },
    ];
    input.rankedCapabilityKeys = ['project_margin_analysis'];

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      selectedCapabilityKey: 'finance_risk_overview',
      provider: 'governed_contract',
      model: 'finance_order_profit_fast_path',
      intent: {
        intent: 'query',
        answerShape: 'list',
        metrics: [],
        ambiguities: [],
        missingSlots: [],
      },
    });
    expect(aiService.generateStructured).not.toHaveBeenCalled();
  });

  it('keeps an exact governed root-cause example as diagnosis instead of query', async () => {
    const aiService = fakeAiService(async () => {
      throw new AiStructuredOutputError('BUDGET_EXCEEDED', 'structured budget exhausted');
    });
    const compiler = createCompiler(aiService);
    const input = compilerInput('最近毛利掉下来的主要原因是什么');
    input.capabilitySummaries = [
      {
        key: 'finance_risk_overview',
        name: '财务经营风险概览',
        description: '诊断收入、退款、折扣、成本和毛利变化',
        domains: ['finance', 'operating_cost', 'payment', 'refund'],
        intents: ['query', 'diagnosis'],
        examples: ['最近毛利掉下来的主要原因是什么'],
        readOnly: true,
        definitionRefs: [paidAmountMetricRef, refundAmountMetricRef],
      },
    ];

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      provider: 'governed_contract',
      intent: {
        intent: 'diagnosis',
        answerShape: 'diagnosis',
        timeRange: { label: '最近30天' },
      },
    });
  });

  it('hydrates governed metric, grouping dimension and ordering for an exact ranking fallback', async () => {
    const aiService = fakeAiService(async () => {
      throw new AiStructuredOutputError('BUDGET_EXCEEDED', 'structured budget exhausted');
    });
    const compiler = createCompiler(aiService);
    const input = compilerInput('本月商品销售排行');
    input.capabilitySummaries = [
      {
        key: 'product_sales_ranking',
        name: '商品销售排行',
        description: '按商品汇总销量并降序排序',
        domains: ['product_sales'],
        intents: ['ranking'],
        examples: ['本月商品销售排行'],
        readOnly: true,
        definitionRefs: [productEntityRef, productSalesMetricRef],
      },
    ];

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      provider: 'governed_contract',
      intent: {
        intent: 'ranking',
        entities: [expect.objectContaining({ entityType: 'product', definitionRef: productEntityRef })],
        metrics: [productSalesMetricRef],
        dimensions: [productDimensionRef],
        orderBy: [{ definitionRef: productSalesMetricRef, direction: 'desc' }],
        missingSlots: [],
      },
    });
  });

  it('executes an exact read-only published example from its frozen contract without calling the model', async () => {
    const aiService = fakeAiService(async () => {
      throw new Error('model must not be called for an exact frozen contract');
    });
    const compiler = createCompiler(aiService);
    const input = compilerInput('本月商品销售排行');
    input.capabilitySummaries[0] = {
      ...input.capabilitySummaries[0],
      definitionRefs: [productEntityRef, productSalesMetricRef],
    };

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      provider: 'governed_contract',
      model: 'exact_example_fast_path',
      intent: {
        intent: 'ranking',
        metrics: [productSalesMetricRef],
        dimensions: [productDimensionRef],
      },
    });
    expect(aiService.generateStructured).not.toHaveBeenCalled();
  });

  it('hydrates the paid amount metric for an exact comparison example from published aliases', async () => {
    const aiService = fakeAiService(async () => {
      throw new Error('model must not be called for an exact frozen contract');
    });
    const compiler = createCompiler(aiService);
    const input = compilerInput('今天和昨天比营业额差多少');
    input.ontologySnapshot = {
      ...ontologySnapshot,
      metrics: [
        ...ontologySnapshot.metrics,
        {
          definitionKey: paidAmountMetricRef.definitionKey,
          version: paidAmountMetricRef.definitionVersion,
          definitionFingerprint: paidAmountMetricRef.definitionFingerprint,
          sourceFingerprint: paidAmountMetricRef.sourceFingerprint,
          metricKey: 'paid_amount',
          name: '实收金额',
          aliases: ['实收', '营业额', '营收', '流水'],
          domain: 'payment',
          formula: {},
          source: {},
          defaultFilters: {},
          permissions: [],
          description: '支付成功记录的实收金额',
        },
        {
          definitionKey: refundAmountMetricRef.definitionKey,
          version: refundAmountMetricRef.definitionVersion,
          definitionFingerprint: refundAmountMetricRef.definitionFingerprint,
          sourceFingerprint: refundAmountMetricRef.sourceFingerprint,
          metricKey: 'refund_amount',
          name: '退款金额',
          aliases: ['退款', '退回金额'],
          domain: 'refund',
          formula: {},
          source: {},
          defaultFilters: {},
          permissions: [],
          description: '已完成退款记录的退款金额',
        },
      ],
    };
    input.capabilitySummaries = [
      {
        key: 'store_operations_overview',
        name: '店长经营概览',
        description: '经营概览与对比',
        domains: ['payment', 'refund'],
        intents: ['query', 'comparison'],
        examples: [input.question],
        readOnly: true,
        definitionRefs: [paidAmountMetricRef, refundAmountMetricRef],
      },
    ];

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      model: 'exact_example_fast_path',
      intent: {
        intent: 'comparison',
        metrics: [paidAmountMetricRef],
      },
    });
    expect(aiService.generateStructured).not.toHaveBeenCalled();
  });

  it('hydrates the refund metric for an exact refund example without adding unrelated store metrics', async () => {
    const aiService = fakeAiService(async () => {
      throw new Error('model must not be called for an exact frozen contract');
    });
    const compiler = createCompiler(aiService);
    const input = compilerInput('今天退款有几笔，金额多少');
    input.ontologySnapshot = {
      ...ontologySnapshot,
      metrics: [
        ...ontologySnapshot.metrics,
        {
          definitionKey: paidAmountMetricRef.definitionKey,
          version: paidAmountMetricRef.definitionVersion,
          definitionFingerprint: paidAmountMetricRef.definitionFingerprint,
          sourceFingerprint: paidAmountMetricRef.sourceFingerprint,
          metricKey: 'paid_amount',
          name: '实收金额',
          aliases: ['营业额'],
          domain: 'payment',
          formula: {},
          source: {},
          defaultFilters: {},
          permissions: [],
          description: '支付成功记录的实收金额',
        },
        {
          definitionKey: refundAmountMetricRef.definitionKey,
          version: refundAmountMetricRef.definitionVersion,
          definitionFingerprint: refundAmountMetricRef.definitionFingerprint,
          sourceFingerprint: refundAmountMetricRef.sourceFingerprint,
          metricKey: 'refund_amount',
          name: '退款金额',
          aliases: ['退款', '退回金额'],
          domain: 'refund',
          formula: {},
          source: {},
          defaultFilters: {},
          permissions: [],
          description: '已完成退款记录的退款金额',
        },
      ],
    };
    input.capabilitySummaries = [
      {
        key: 'store_operations_overview',
        name: '店长经营概览',
        description: '经营概览与退款风险',
        domains: ['payment', 'refund'],
        intents: ['query', 'comparison'],
        examples: [input.question],
        readOnly: true,
        definitionRefs: [paidAmountMetricRef, refundAmountMetricRef],
      },
    ];

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      model: 'exact_example_fast_path',
      intent: {
        intent: 'query',
        metrics: [refundAmountMetricRef],
      },
    });
  });

  it('uses the governed sales-amount default when a generic product sales ranking exposes amount and quantity', async () => {
    const quantityRef = {
      definitionType: 'metric' as const,
      definitionKey: 'metric.product_sales_quantity',
      definitionVersion: 1,
      definitionFingerprint: 'a'.repeat(64),
      sourceFingerprint: 'b'.repeat(64),
    };
    const aiService = fakeAiService(async () => {
      throw new Error('model must not be called for an exact frozen contract');
    });
    const compiler = createCompiler(aiService);
    const input = compilerInput('本月商品销售排行');
    input.ontologySnapshot = {
      ...ontologySnapshot,
      metrics: [
        ...ontologySnapshot.metrics,
        {
          definitionKey: quantityRef.definitionKey,
          version: quantityRef.definitionVersion,
          definitionFingerprint: quantityRef.definitionFingerprint,
          sourceFingerprint: quantityRef.sourceFingerprint,
          metricKey: 'product_sales_quantity',
          name: '商品销售数量',
          aliases: ['商品销售', '销量'],
          domain: 'product_sales',
          formula: { sql: 'SUM(quantity)' },
          source: { model: 'SensitiveOrderTable' },
          defaultFilters: {},
          permissions: ['store:finance:read'],
          description: '商品销售数量',
        },
      ],
    } as never;
    input.capabilitySummaries = [
      {
        key: 'product_sales_ranking',
        name: '商品销售排行',
        description: '按商品汇总销售金额和销售数量并排序',
        domains: ['product_sales'],
        intents: ['ranking'],
        examples: ['本月商品销售排行'],
        readOnly: true,
        definitionRefs: [productEntityRef, productDimensionRef, productSalesMetricRef, quantityRef],
      },
    ];

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      provider: 'governed_contract',
      intent: {
        metrics: [productSalesMetricRef],
        orderBy: [{ definitionRef: productSalesMetricRef, direction: 'desc' }],
      },
    });
    expect(aiService.generateStructured).not.toHaveBeenCalled();
  });

  it('uses a read-only recommendation preview contract even when the capability also declares workflow intents', async () => {
    const aiService = fakeAiService(async () => {
      throw new Error('model must not be called for an exact frozen preview contract');
    });
    const compiler = createCompiler(aiService);
    const input = compilerInput('能不能在客户消费后自动给她推荐下一个适合的项目');
    input.capabilitySummaries = [
      {
        key: 'marketing_automation_rule_preview',
        name: '营销自动化规则预览',
        description: '生成可审阅规则预览，不发布规则或发送消息',
        domains: ['customer', 'project'],
        intents: ['workflow', 'recommendation', 'draft', 'action'],
        examples: [input.question],
        readOnly: true,
        definitionRefs: [customerEntityRef, projectEntityRef],
      },
    ];

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      provider: 'governed_contract',
      model: 'exact_example_fast_path',
      intent: {
        intent: 'recommendation',
        answerShape: 'diagnosis',
      },
    });
    expect(aiService.generateStructured).not.toHaveBeenCalled();
  });

  it('infers scalar shape for an exact governed numeric question without inventing a metric definition', async () => {
    const aiService = fakeAiService(async () => {
      throw new Error('model must not be called for an exact frozen contract');
    });
    const compiler = createCompiler(aiService);
    const input = compilerInput('本月耗材成本是多少');
    input.capabilitySummaries = [
      {
        key: 'finance_material_cost_summary',
        name: '耗材成本摘要',
        description: '按业务服务返回耗材成本',
        domains: ['product_sales'],
        intents: ['query'],
        examples: [input.question],
        readOnly: true,
        definitionRefs: [productEntityRef],
      },
    ];

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      model: 'exact_example_fast_path',
      intent: { intent: 'query', answerShape: 'scalar', metrics: [] },
    });
    expect(aiService.generateStructured).not.toHaveBeenCalled();
  });

  it('hydrates candidate refund metrics from an exact governed contract before they enter the published ontology', async () => {
    const aiService = fakeAiService(async () => {
      throw new Error('model must not be called for an exact frozen contract');
    });
    const compiler = createCompiler(aiService);
    const input = compilerInput('今天退款有几笔，金额多少');
    input.ontologySnapshot = {
      ...ontologySnapshot,
      metrics: [
        ...ontologySnapshot.metrics,
        {
          definitionKey: refundAmountMetricRef.definitionKey,
          version: refundAmountMetricRef.definitionVersion,
          definitionFingerprint: refundAmountMetricRef.definitionFingerprint,
          sourceFingerprint: refundAmountMetricRef.sourceFingerprint,
          metricKey: 'refund_amount',
          name: '退款金额',
          aliases: ['退回金额'],
          domain: 'refund',
          formula: {},
          source: {},
          defaultFilters: {},
          permissions: [],
          description: '退款金额',
        },
        {
          definitionKey: refundCountMetricRef.definitionKey,
          version: refundCountMetricRef.definitionVersion,
          definitionFingerprint: refundCountMetricRef.definitionFingerprint,
          sourceFingerprint: refundCountMetricRef.sourceFingerprint,
          metricKey: 'refund_count',
          name: '退款笔数',
          aliases: ['退款次数'],
          domain: 'refund',
          formula: {},
          source: {},
          defaultFilters: {},
          permissions: [],
          description: '退款记录笔数',
        },
      ],
    };
    input.capabilitySummaries = [
      {
        key: 'finance_risk_overview',
        name: '财务风控概览',
        description: '退款金额与笔数',
        domains: ['refund'],
        intents: ['query'],
        examples: [input.question],
        readOnly: true,
        definitionRefs: [paidAmountMetricRef, refundAmountMetricRef, refundCountMetricRef],
      },
    ];

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      model: 'exact_example_fast_path',
      intent: {
        intent: 'query',
        answerShape: 'scalar',
        metrics: [refundAmountMetricRef, refundCountMetricRef],
      },
    });
    expect(aiService.generateStructured).not.toHaveBeenCalled();
  });

  it('hydrates only the candidate commission metric for an exact governed staff ranking contract', async () => {
    const aiService = fakeAiService(async () => {
      throw new Error('model must not be called for an exact frozen contract');
    });
    const compiler = createCompiler(aiService);
    const input = compilerInput('本月员工提成排行');
    input.capabilitySummaries = [
      {
        key: 'manager_staff_overview',
        name: '员工经营概览',
        description: '员工绩效与提成排行',
        domains: ['staff_performance'],
        intents: ['ranking'],
        examples: [input.question],
        readOnly: true,
        definitionRefs: [staffServiceCountMetricRef, staffCommissionMetricRef],
      },
    ];

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      model: 'exact_example_fast_path',
      intent: {
        intent: 'ranking',
        metrics: [staffCommissionMetricRef],
        orderBy: [{ definitionRef: staffCommissionMetricRef, direction: 'desc' }],
      },
    });
    expect(aiService.generateStructured).not.toHaveBeenCalled();
  });

  it('hydrates the governed new-customer conversion funnel from an exact candidate contract', async () => {
    const aiService = fakeAiService(async () => {
      throw new Error('model must not be called for an exact frozen contract');
    });
    const compiler = createCompiler(aiService);
    const input = compilerInput('上个月新来了多少新客，转化了多少');
    input.capabilitySummaries = [
      {
        key: 'customer_facts',
        name: '客户事实与客群查询',
        description: '周期新客与首单转化漏斗',
        domains: ['customer'],
        intents: ['query'],
        examples: [input.question],
        readOnly: true,
        definitionRefs: [
          newCustomerCountMetricRef,
          newCustomerConversionCountMetricRef,
          newCustomerConversionRateMetricRef,
        ],
      },
    ];

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      model: 'exact_example_fast_path',
      intent: {
        intent: 'query',
        answerShape: 'scalar',
        metrics: [newCustomerCountMetricRef, newCustomerConversionCountMetricRef, newCustomerConversionRateMetricRef],
      },
    });
    expect(aiService.generateStructured).not.toHaveBeenCalled();
  });

  it('hydrates a candidate age-group dimension for an exact arrived-customer profile contract', async () => {
    const aiService = fakeAiService(async () => {
      throw new Error('model must not be called for an exact frozen contract');
    });
    const compiler = createCompiler(aiService);
    const input = compilerInput('帮我看一下今天到店客人的画像，主要是什么年龄段');
    input.ontologySnapshot = {
      ...ontologySnapshot,
      dimensions: [
        ...ontologySnapshot.dimensions,
        {
          definitionKey: customerAgeGroupDimensionRef.definitionKey,
          version: customerAgeGroupDimensionRef.definitionVersion,
          definitionFingerprint: customerAgeGroupDimensionRef.definitionFingerprint,
          sourceFingerprint: customerAgeGroupDimensionRef.sourceFingerprint,
          dimensionKey: 'customerAgeGroup',
          name: '到店客户年龄段',
          aliases: ['年龄画像'],
          domain: 'customer',
          source: { model: 'Customer' },
          permissions: ['core:customer:view'],
        },
      ],
    };
    input.capabilitySummaries = [
      {
        key: 'customer_facts',
        name: '客户事实与客群查询',
        description: '实际到店客户年龄画像',
        domains: ['customer'],
        intents: ['query'],
        examples: [input.question],
        readOnly: true,
        definitionRefs: [customerAgeGroupDimensionRef],
      },
    ];

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      model: 'exact_example_fast_path',
      intent: {
        intent: 'query',
        answerShape: 'list',
        metrics: [],
        dimensions: [customerAgeGroupDimensionRef],
      },
    });
    expect(aiService.generateStructured).not.toHaveBeenCalled();
  });

  it('hydrates the governed dormant-customer reactivation metric from an exact customer-facts contract', async () => {
    const aiService = fakeAiService(async () => {
      throw new Error('model must not be called for an exact frozen contract');
    });
    const compiler = createCompiler(aiService);
    const input = compilerInput('哪些沉睡客户最近有点被唤醒的迹象');
    input.ontologySnapshot = {
      ...ontologySnapshot,
      metrics: [
        ...ontologySnapshot.metrics,
        {
          definitionKey: dormantReactivationMetricRef.definitionKey,
          version: dormantReactivationMetricRef.definitionVersion,
          definitionFingerprint: dormantReactivationMetricRef.definitionFingerprint,
          sourceFingerprint: dormantReactivationMetricRef.sourceFingerprint,
          metricKey: 'dormant_reactivation_customer_count',
          name: '沉睡客户唤醒迹象',
          aliases: ['沉睡客户回流信号'],
          domain: 'customer',
          formula: {},
          source: {},
          defaultFilters: {},
          permissions: [],
          description: '沉睡客户触达后出现有效回流信号的人数',
        },
      ],
    };
    input.capabilitySummaries = [
      {
        key: 'customer_facts',
        name: '客户事实与客群查询',
        description: '查询沉睡客户触达后的预约、到店、消费和互动信号',
        domains: ['customer'],
        intents: ['query', 'diagnosis'],
        examples: [input.question],
        readOnly: true,
        definitionRefs: [dormantReactivationMetricRef],
      },
    ];

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      model: 'exact_example_fast_path',
      intent: {
        intent: 'query',
        answerShape: 'list',
        metrics: [dormantReactivationMetricRef],
      },
    });
    expect(aiService.generateStructured).not.toHaveBeenCalled();
  });

  it('hydrates runtime grouping dimensions for an exact low-stock example', async () => {
    const aiService = fakeAiService(async () => {
      throw new Error('model must not be called for an exact frozen contract');
    });
    const compiler = createCompiler(aiService);
    const input = compilerInput('现在哪些产品库存不够了');
    input.ontologySnapshot = {
      ...ontologySnapshot,
      metrics: [
        ...ontologySnapshot.metrics,
        {
          definitionKey: stockRiskMetricRef.definitionKey,
          version: stockRiskMetricRef.definitionVersion,
          definitionFingerprint: stockRiskMetricRef.definitionFingerprint,
          sourceFingerprint: stockRiskMetricRef.sourceFingerprint,
          metricKey: 'stock_risk_score',
          name: '库存风险评分',
          aliases: ['库存风险', '缺货风险'],
          domain: 'product',
          formula: {},
          source: {},
          defaultFilters: {},
          permissions: [],
          description: '当前库存低于安全库存的缺口数量',
          runtimeQuery: { dimensions: ['productName'] } as never,
        },
      ],
      dimensions: [
        ...ontologySnapshot.dimensions,
        {
          definitionKey: productNameDimensionRef.definitionKey,
          version: productNameDimensionRef.definitionVersion,
          definitionFingerprint: productNameDimensionRef.definitionFingerprint,
          sourceFingerprint: productNameDimensionRef.sourceFingerprint,
          dimensionKey: 'productName',
          name: '商品名称',
          aliases: ['商品', '产品名称'],
          domain: 'product',
          source: {},
          permissions: [],
        },
      ],
    };
    input.capabilitySummaries = [
      {
        key: 'inventory_operations_overview',
        name: '库存运营概览',
        description: '低库存和临期风险',
        domains: ['product'],
        intents: ['query', 'diagnosis', 'ranking'],
        examples: [input.question],
        readOnly: true,
        definitionRefs: [stockRiskMetricRef],
      },
    ];

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      model: 'exact_example_fast_path',
      intent: {
        metrics: [stockRiskMetricRef],
        dimensions: [productNameDimensionRef],
      },
    });
  });

  it('recognizes an exact governed superlative top-N example as ranking during budget fallback', async () => {
    const aiService = fakeAiService(async () => {
      throw new AiStructuredOutputError('BUDGET_EXCEEDED', 'structured budget exhausted');
    });
    const compiler = createCompiler(aiService);
    const question = '本月1日至31日，本店服务次数最多的前5个项目';
    const input = compilerInput(question);
    input.capabilitySummaries = [
      {
        key: 'project_service_ranking',
        name: '项目服务次数排行',
        description: '按项目汇总服务次数并降序排序',
        domains: ['project', 'order'],
        intents: ['ranking'],
        examples: [question],
        readOnly: true,
      },
    ];

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      provider: 'governed_contract',
      model: 'exact_example_fallback',
      intent: {
        intent: 'ranking',
        answerShape: 'ranking',
        missingSlots: [],
      },
    });
  });

  it('routes specific project sales questions to the project service ranking capability', async () => {
    const aiService = fakeAiService(async () => {
      throw new AiStructuredOutputError('PROVIDER_UNAVAILABLE', 'all providers unavailable');
    });
    const compiler = createCompiler(aiService);
    // ami-brain-historical-only: historical regression fixture; excluded from release gate and pass-rate denominator
    const input = compilerInput('背部净透护理在2026年6月1日至30日一共卖了几单');
    input.metricRefs = [projectServiceCountMetricRef];
    input.capabilitySummaries = [
      {
        key: 'project_service_ranking',
        name: '项目服务次数排行',
        description: '按项目汇总服务次数并降序排序',
        domains: ['project', 'order'],
        intents: ['ranking'],
        examples: ['某个护理项目本月服务次数是多少'],
        readOnly: true,
        definitionRefs: [projectEntityRef, projectServiceCountMetricRef],
      },
    ];

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      provider: 'governed_contract',
      model: 'project_catalog_fast_path',
      selectedCapabilityKey: 'project_service_ranking',
      intent: {
        intent: 'query',
        answerShape: 'scalar',
      },
    });
  });

  it('routes project BOM list questions to the project BOM capability', async () => {
    const aiService = fakeAiService(async () => {
      throw new AiStructuredOutputError('PROVIDER_UNAVAILABLE', 'all providers unavailable');
    });
    const compiler = createCompiler(aiService);
    // ami-brain-historical-only: historical regression fixture; excluded from release gate and pass-rate denominator
    const input = compilerInput('胶原焕活提拉标准配置了哪些耗材');
    input.metricRefs = [];
    input.capabilitySummaries = [
      {
        key: 'project_material_consumption_analysis',
        name: '项目实际耗材消耗覆盖分析',
        description: '按项目读取 BOM 明细',
        domains: ['project', 'catalog', 'inventory'],
        intents: ['query', 'ranking'],
        examples: ['某个项目的标准 BOM 明细有哪些'],
        readOnly: true,
        definitionRefs: [projectEntityRef, productEntityRef],
      },
    ];

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      provider: 'governed_contract',
      model: 'project_catalog_fast_path',
      selectedCapabilityKey: 'project_material_consumption_analysis',
      intent: {
        intent: 'query',
        answerShape: 'list',
      },
    });
  });

  it('uses the exact governed fast path before either model provider is needed', async () => {
    const aiService = fakeAiService(async () => {
      throw new AiStructuredOutputError('PROVIDER_UNAVAILABLE', 'all providers unavailable');
    });
    const compiler = createCompiler(aiService);
    const input = compilerInput('本月商品销售排行');
    input.capabilitySummaries = [
      {
        key: 'product_sales_ranking',
        name: '商品销售排行',
        description: '按商品汇总销量并降序排序',
        domains: ['product_sales'],
        intents: ['ranking'],
        examples: ['本月商品销售排行'],
        readOnly: true,
        definitionRefs: [productEntityRef, productSalesMetricRef],
      },
    ];

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      provider: 'governed_contract',
      model: 'exact_example_fast_path',
      intent: {
        metrics: [productSalesMetricRef],
        dimensions: [productDimensionRef],
        orderBy: [{ definitionRef: productSalesMetricRef, direction: 'desc' }],
      },
    });
  });

  it('uses the model-selected governed actionRef instead of an exact capability example fast path', async () => {
    const question = '给舒缓修护面膜下一个采购单，采156件'; // BQ1231
    const modelIntent: BrainSemanticIntent = {
      ...productRankingIntent,
      schemaVersion: '1.1',
      objective: question,
      domains: ['product_sales'],
      intent: 'action',
      entities: [],
      metrics: [],
      dimensions: [],
      orderBy: [],
      answerShape: 'action_preview',
      actionRef: purchaseOrderActionRef,
      actionPolarity: 'affirmative',
      actionModality: 'request',
      actionSlots: [
        { slotKey: 'product', source: 'question' as never, rawValue: '舒缓修护面膜', confidence: 0.99 },
        { slotKey: 'quantity', source: 'user', numericValue: 156, unit: '件', confidence: 0.99 },
      ],
      missingSlots: [],
    };
    const aiService = fakeAiService(async () => structuredResult(modelIntent));
    const compiler = createCompiler(aiService);
    const input = compilerInput(question);
    input.preferredCapabilityKey = 'purchase_order_draft';
    input.capabilitySummaries = [
      {
        key: 'purchase_order_draft',
        name: '采购单预览',
        description: '生成高风险待确认采购单预览',
        domains: ['product_sales'],
        intents: ['action'],
        examples: [question],
        readOnly: false,
        sideEffect: true,
        requiresConfirmation: true,
        riskLevel: 'high',
        idempotency: 'required',
        grounding: 'preview_action',
        definitionRefs: [productEntityRef, purchaseOrderActionRef],
      },
    ];

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      provider: 'fake-provider',
      model: 'fake-model',
      intent: {
        schemaVersion: '1.1',
        intent: 'action',
        answerShape: 'action_preview',
        actionRef: purchaseOrderActionRef,
        actionPolarity: 'affirmative',
        actionSlots: [
          expect.objectContaining({ slotKey: 'product', semanticRole: 'object', source: 'user' }),
          expect.objectContaining({ slotKey: 'quantity', semanticRole: 'quantity', numericValue: 156 }),
        ],
        missingSlots: [],
      },
    });
  });

  it('hydrates a model-judged negated action without inventing execution slots', async () => {
    const question = '别下采购单'; // ami-brain-unit-only
    const modelIntent = {
      ...productRankingIntent,
      schemaVersion: '1.1',
      objective: question,
      domains: ['product_sales'],
      intent: 'action',
      entities: [],
      metrics: [],
      dimensions: [],
      orderBy: [],
      answerShape: 'action_preview',
      actionRef: { definitionType: 'action', definitionKey: purchaseOrderActionRef.definitionKey },
      actionPolarity: 'negated',
      actionModality: 'request',
      actionSlots: [],
      successCriteria: [],
      missingSlots: [],
    } as unknown as BrainSemanticIntent;
    const compiler = createCompiler(fakeAiService(async () => structuredResult(modelIntent)));

    await expect(compiler.compile(compilerInput(question))).resolves.toMatchObject({
      status: 'completed',
      intent: {
        actionRef: purchaseOrderActionRef,
        actionPolarity: 'negated',
        actionSlots: [],
        missingSlots: [],
      },
    });
  });

  it('hydrates every published correction ref without hiding duplicates from the validator', async () => {
    const transferActionRef = {
      definitionType: 'action' as const,
      definitionKey: 'action.transfer_inventory',
      definitionVersion: 2,
      definitionFingerprint: '7'.repeat(64),
      sourceFingerprint: '8'.repeat(64),
    };
    const question = '不是下采购单，是调拨'; // ami-brain-unit-only
    const modelIntent = {
      ...productRankingIntent,
      schemaVersion: '1.1',
      objective: question,
      domains: ['product_sales'],
      intent: 'action',
      entities: [],
      metrics: [],
      dimensions: [],
      orderBy: [],
      answerShape: 'action_preview',
      actionRef: { definitionType: 'action', definitionKey: transferActionRef.definitionKey },
      actionPolarity: 'affirmative',
      negatedActionRefs: [
        { definitionType: 'action', definitionKey: purchaseOrderActionRef.definitionKey },
        { definitionType: 'action', definitionKey: purchaseOrderActionRef.definitionKey },
      ],
      actionModality: 'request',
      actionSlots: [],
      missingSlots: [],
    } as unknown as BrainSemanticIntent;
    const compiler = createCompiler(fakeAiService(async () => structuredResult(modelIntent)));
    const input = compilerInput(question);
    input.ontologySnapshot = {
      ...ontologySnapshot,
      actions: [
        ...ontologySnapshot.actions,
        {
          ...ontologySnapshot.actions[0]!,
          definitionKey: transferActionRef.definitionKey,
          version: transferActionRef.definitionVersion,
          definitionFingerprint: transferActionRef.definitionFingerprint,
          sourceFingerprint: transferActionRef.sourceFingerprint,
          actionKey: transferActionRef.definitionKey,
          name: '跨店调拨',
        },
      ],
    };

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      intent: {
        actionRef: transferActionRef,
        actionPolarity: 'affirmative',
        negatedActionRefs: [purchaseOrderActionRef, purchaseOrderActionRef],
      },
    });
  });

  it.each([
    ['查一下舒缓修护面膜还剩多少', 'query', undefined, undefined],
    ['舒缓修护面膜要不要补货，给我建议', 'recommendation', undefined, undefined],
    ['给舒缓修护面膜下一个采购单，采156件', 'action', 'action.create_purchase_order', undefined],
    ['舒缓修护面膜到了，入库156件', 'action', undefined, 'actionDefinition'],
    ['把舒缓修护面膜调到二店', 'action', undefined, 'actionDefinition'],
    ['把舒缓修护面膜库存改成156件', 'action', undefined, 'actionDefinition'],
    ['把舒缓修护面膜进价改成20元', 'action', undefined, 'actionDefinition'],
    ['不是入库，是调拨到二店', 'action', undefined, 'actionDefinition'],
  ] as const)(
    'keeps action semantics distinct without text-similarity routing: %s',
    async (question, intentKind, expectedActionKey, expectedMissingSlot) => {
      const modelIntent = {
        ...productRankingIntent,
        schemaVersion: intentKind === 'action' ? '1.1' : '1.0',
        objective: question,
        domains: ['product_sales'],
        intent: intentKind,
        entities: [],
        metrics: [],
        dimensions: [],
        orderBy: [],
        answerShape:
          intentKind === 'action' ? 'action_preview' : intentKind === 'recommendation' ? 'diagnosis' : 'list',
        ...(expectedActionKey
          ? {
              actionRef: { definitionType: 'action', definitionKey: expectedActionKey },
              actionPolarity: 'affirmative',
              actionModality: 'request',
              actionSlots: [
                { slotKey: 'product', source: 'question', rawValue: '舒缓修护面膜', confidence: 0.99 },
                { slotKey: 'quantity', source: 'question', numericValue: 156, unit: '件', confidence: 0.99 },
              ],
            }
          : {}),
        missingSlots: expectedMissingSlot ? [expectedMissingSlot] : [],
        decisionSummary: '按模型语义区分查询、建议和具体业务动作。',
      } as unknown as BrainSemanticIntent;
      const aiService = fakeAiService(async () => structuredResult(modelIntent));
      const compiler = createCompiler(aiService);

      const result = await compiler.compile(compilerInput(question));

      expect(aiService.generateStructured).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        status: 'completed',
        intent: {
          intent: intentKind,
          ...(expectedActionKey
            ? {
                actionRef: purchaseOrderActionRef,
                actionPolarity: 'affirmative',
                actionSlots: [
                  expect.objectContaining({ slotKey: 'product', semanticRole: 'object' }),
                  expect.objectContaining({ slotKey: 'quantity', semanticRole: 'quantity', numericValue: 156 }),
                ],
              }
            : {}),
          missingSlots: expectedMissingSlot ? [expectedMissingSlot] : [],
        },
      });
      if (!expectedActionKey) {
        expect(result.status === 'completed' ? result.intent.actionRef : undefined).toBeUndefined();
      }
    },
  );

  it('does not fast-path an action contract without confirmation and idempotency controls', async () => {
    const question = '帮王静怡新建客户档案，电话138xxxx807'; // BQ0211
    const modelIntent: BrainSemanticIntent = {
      ...productRankingIntent,
      objective: question,
      domains: ['customer'],
      intent: 'action',
      entities: [],
      metrics: [],
      dimensions: [],
      orderBy: [],
      answerShape: 'action_preview',
    };
    const aiService = fakeAiService(async () => structuredResult(modelIntent));
    const compiler = createCompiler(aiService);
    const input = compilerInput(question);
    input.preferredCapabilityKey = 'customer_create_preview';
    input.capabilitySummaries = [
      {
        key: 'customer_create_preview',
        name: '客户建档预览',
        description: '不完整动作合同',
        domains: ['customer'],
        intents: ['action'],
        examples: [question],
        readOnly: false,
        sideEffect: true,
        requiresConfirmation: false,
        riskLevel: 'high',
        idempotency: 'not_applicable',
        grounding: 'preview_action',
        definitionRefs: [customerEntityRef],
      },
    ];

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      provider: 'fake-provider',
      model: 'fake-model',
    });
  });

  it('does not use governed fallback for a paraphrase when the model budget is exhausted', async () => {
    const aiService = fakeAiService(async () => {
      throw new AiStructuredOutputError('BUDGET_EXCEEDED', 'structured budget exhausted');
    });
    const compiler = createCompiler(aiService);

    await expect(compiler.compile(compilerInput('这个月商品卖得怎么样'))).resolves.toEqual({
      status: 'unavailable',
      errorCode: 'BUDGET_EXCEEDED',
      reason: 'structured budget exhausted',
    });
  });

  it('uses a high-confidence capability catalog candidate when the model budget is exhausted', async () => {
    const aiService = fakeAiService(async () => {
      throw new AiStructuredOutputError('BUDGET_EXCEEDED', 'structured budget exhausted');
    });
    const compiler = createCompiler(aiService);
    const input = compilerInput('这个月商品卖得怎么样');
    input.capabilitySummaries = [
      {
        ...input.capabilitySummaries[0],
        key: 'product_sales_ranking',
        definitionRefs: [productEntityRef, productSalesMetricRef, productDimensionRef],
      },
    ];
    input.preferredCapabilityKey = 'product_sales_ranking';

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'completed',
      provider: 'governed_contract',
      model: 'capability_catalog_fallback',
      intent: {
        intent: 'ranking',
        metrics: [productSalesMetricRef],
        dimensions: [productDimensionRef],
      },
    });
  });

  it('returns MODEL_UNAVAILABLE for an untyped model failure without fabricating intent', async () => {
    const aiService = fakeAiService(async () => {
      throw new Error('model connection reset');
    });
    const compiler = createCompiler(aiService);

    await expect(compiler.compile(compilerInput('本月商品销售排行'))).resolves.toEqual({
      status: 'unavailable',
      errorCode: 'MODEL_UNAVAILABLE',
      reason: 'model connection reset',
    });
  });

  it('does not retry a provider authentication failure', async () => {
    const aiService = fakeAiService(async () => {
      throw new AiStructuredOutputError(
        'PROVIDER_AUTH_FAILED',
        'invalid provider credential',
        'kimi',
        'fallback-model',
      );
    });
    const compiler = createCompiler(aiService);

    await expect(compiler.compile(compilerInput('这个月商品卖得怎么样'))).resolves.toEqual({
      status: 'unavailable',
      errorCode: 'PROVIDER_AUTH_FAILED',
      reason: 'invalid provider credential',
    });
    expect(aiService.generateStructured).toHaveBeenCalledTimes(1);
  });

  it('uses a PII-masked context for the single structured repair request', async () => {
    const aiService = fakeAiService(async () => structuredResult(draftIntent));
    const compiler = createCompiler(aiService);

    await compiler.compile(compilerInput('请联系 13800138000 或 owner@example.com 提醒预约'));

    const request = (aiService.generateStructured as jest.Mock).mock.calls[0][0] as AiStructuredOutputInput;
    const repairText = JSON.stringify(request.repairMessages);
    expect(repairText).toContain('***');
    expect(repairText).not.toContain('13800138000');
    expect(repairText).not.toContain('owner@example.com');
    expect(JSON.stringify(request.messages)).toContain('13800138000');
  });

  it('fails closed without calling AI for cyclic or oversized governed context', async () => {
    const aiService = fakeAiService(async () => structuredResult(productRankingIntent));
    const compiler = createCompiler(aiService);
    const cyclic: Record<string, unknown> = { safe: 'value' };
    cyclic.self = cyclic;
    const cyclicInput = compilerInput('本月商品销售排行');
    cyclicInput.conversationSlots = cyclic;

    await expect(compiler.compile(cyclicInput)).resolves.toMatchObject({
      status: 'unavailable',
      errorCode: 'CONTEXT_LIMIT_EXCEEDED',
    });

    const oversizedInput = compilerInput('本月商品销售排行');
    oversizedInput.capabilitySummaries = Array.from({ length: 101 }, (_, index) => ({
      key: `capability.${index}`,
      name: `能力${index}`,
      description: 'x',
      domains: ['product_sales'],
      intents: ['ranking'],
      readOnly: true,
    }));
    await expect(compiler.compile(oversizedInput)).resolves.toMatchObject({
      status: 'unavailable',
      errorCode: 'CONTEXT_LIMIT_EXCEEDED',
    });
    expect(aiService.generateStructured).not.toHaveBeenCalled();
  });

  it.each([
    [{ userId: 0, storeId: 6 }, 'userId'],
    [{ userId: 9, storeId: -1 }, 'storeId'],
    [{ userId: 1.5, storeId: 6 }, 'userId'],
  ])('fails closed before AI when audit identity is invalid: %j', async (audit, field) => {
    const aiService = fakeAiService(async () => structuredResult(productRankingIntent));
    const compiler = createCompiler(aiService);
    const input = compilerInput('本月商品销售排行');
    input.audit = audit;

    await expect(compiler.compile(input)).resolves.toMatchObject({
      status: 'unavailable',
      errorCode: 'INVALID_AUDIT_CONTEXT',
      reason: expect.stringContaining(field),
    });
    expect(aiService.generateStructured).not.toHaveBeenCalled();
  });

  it('is registered through BrainModule with AiModule as its only AI provider source', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, BrainModule) as unknown[];
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, BrainModule) as unknown[];
    const exports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, BrainModule) as unknown[];

    expect(imports).toContain(AiModule);
    expect(providers).toContain(BrainSemanticIntentCompilerService);
    expect(exports).toContain(BrainSemanticIntentCompilerService);
  });
});
