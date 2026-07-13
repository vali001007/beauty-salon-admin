import { BRAIN_P0_EVAL_CASES } from './brain-eval-mvp.seed.js';
import { BRAIN_MVP_DIMENSIONS, BRAIN_MVP_DOMAINS, BRAIN_MVP_METRICS, BRAIN_MVP_RELATIONS } from './brain-semantic-mvp.seed.js';

type BrainSkillSeedType = 'query' | 'analysis' | 'risk' | 'action' | 'prediction';
type BrainRiskLevelSeed = 'low' | 'medium' | 'high' | 'critical';

interface BrainMvpSkillSeed {
  skillKey: string;
  name: string;
  type: BrainSkillSeedType;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  permissions: string[];
  riskLevel: BrainRiskLevelSeed;
  enabled: boolean;
  version: number;
}

interface BrainMvpAgentProfileSeed {
  roleKey: string;
  name: string;
  systemPrompt: string;
  allowedSkills: string[];
  dataScopeRules: Record<string, unknown>;
  knowledgePack: Record<string, unknown>;
  enabled: boolean;
  version: number;
}

interface BrainMvpInspectionRuleSeed {
  ruleKey: string;
  name: string;
  domain: string;
  scheduleCron: string;
  eventTrigger: string | null;
  condition: Record<string, unknown>;
  suggestionTpl: Record<string, unknown>;
  riskLevel: BrainRiskLevelSeed;
  enabled: boolean;
  version: number;
}

const ROLE_KEYS = [
  ['store_manager', '店长经营专家'],
  ['receptionist', '前台预约专家'],
  ['beautician', '美容师履约专家'],
  ['marketing', '营销增长专家'],
  ['finance', '财务利润专家'],
  ['inventory', '库存供应专家'],
  ['customer_service', '客户服务专家'],
] as const;

const SKILLS: BrainMvpSkillSeed[] = [
  skill('query_revenue', '查询实收流水', 'query', ['core:finance:view']),
  skill('query_margin', '查询毛利表现', 'query', ['core:operation-profit:view']),
  skill('query_reservations', '查询预约与到店', 'query', ['core:store:reservations']),
  skill('query_inventory', '查询库存状态', 'query', ['core:inventory:stock']),
  skill('analyze_trend', '趋势对比分析', 'analysis', ['core:brain:use']),
  skill('analyze_attribution', '经营归因分析', 'analysis', ['core:brain:use']),
  skill('risk_customer_churn', '客户流失风险巡检', 'risk', ['core:marketing:analytics'], 'medium'),
  skill('risk_inventory_expiry', '临期库存风险巡检', 'risk', ['core:inventory:expiry'], 'medium'),
  skill('risk_finance_anomaly', '财务异常风险巡检', 'risk', ['core:finance:view'], 'high'),
  skill('predict_customer_churn', '客户流失预测解释', 'prediction', ['core:marketing:analytics'], 'medium'),
  skill('preview_reservation', '预约创建预览', 'action', ['core:store:reservations'], 'medium'),
  skill('preview_purchase_order', '采购单预览', 'action', ['core:inventory:purchase'], 'medium'),
  skill('preview_commission_settlement', '提成结算预览', 'action', ['core:finance:view'], 'high'),
];

const INSPECTION_RULES: BrainMvpInspectionRuleSeed[] = [
  inspectionRule('customer_churn_risk', '客户流失风险', 'customer', 'core:marketing:analytics', 'medium'),
  inspectionRule('finance_margin_drop', '毛利下滑风险', 'finance', 'core:operation-profit:view', 'high'),
  inspectionRule('inventory_expiry', '临期库存风险', 'inventory', 'core:inventory:expiry', 'medium'),
  inspectionRule('fulfillment_no_show', '预约未到风险', 'fulfillment', 'core:store:reservations', 'medium'),
  inspectionRule('marketing_low_roi', '营销 ROI 低效风险', 'marketing', 'core:marketing:analytics', 'medium'),
  inspectionRule('staff_productivity_drop', '美容师人效异常', 'staff', 'core:finance:view', 'medium'),
];

export function buildBrainMvpSeedPlan() {
  return {
    ontologyEntities: BRAIN_MVP_DOMAINS.flatMap((domain) =>
      domain.entities.map((entityKey) => ({
        domain: domain.domain,
        entityKey,
        name: entityKey,
        synonyms: [entityKey],
        attributes: { source: 'brain_mvp_seed' },
        tableMap: { strategy: 'semantic_layer_mapping_required' },
        status: 'active',
        version: 1,
      })),
    ),
    ontologyRelations: BRAIN_MVP_RELATIONS.map((relation) => ({
      relationKey: relation.relationKey,
      fromEntityKey: relation.from,
      toEntityKey: relation.to,
      name: relation.name,
      joinPath: { strategy: 'knowledge_graph_path', from: relation.from, to: relation.to },
      status: 'active',
      version: 1,
    })),
    metrics: BRAIN_MVP_METRICS.map((metric) => ({
      metricKey: metric.metricKey,
      name: metric.name,
      domain: metric.domain,
      formula: { type: 'semantic_metric', key: metric.metricKey },
      sourceTables: [],
      defaultFilters: null,
      permissions: metric.permissions,
      description: `${metric.name} 的 MVP 语义口径，真实公式由治理台版本化维护。`,
      status: 'active',
      version: 1,
    })),
    dimensions: BRAIN_MVP_DIMENSIONS.map((dimension) => ({
      dimensionKey: dimension.dimensionKey,
      name: dimension.name,
      domain: dimension.domain,
      source: { type: 'semantic_dimension', key: dimension.dimensionKey },
      permissions: ['core:brain:use'],
      status: 'active',
      version: 1,
    })),
    skills: SKILLS,
    agentProfiles: ROLE_KEYS.map(([roleKey, name]) => ({
      roleKey,
      name,
      systemPrompt: `${name}只处理授权范围内的美业经营问题，所有数值必须引用语义层结果。`,
      allowedSkills: SKILLS.filter((item) => item.type !== 'action' || ['store_manager', 'receptionist', 'finance', 'inventory'].includes(roleKey)).map(
        (item) => item.skillKey,
      ),
      dataScopeRules: { storeScope: 'current_user_visible_stores', permissionScope: 'current_user_permissions' },
      knowledgePack: { domains: ['beauty_store_operations'] },
      enabled: true,
      version: 1,
    })),
    inspectionRules: INSPECTION_RULES,
    evalCases: BRAIN_P0_EVAL_CASES,
  };
}

function skill(
  skillKey: string,
  name: string,
  type: BrainSkillSeedType,
  permissions: string[],
  riskLevel: BrainRiskLevelSeed = 'low',
): BrainMvpSkillSeed {
  return {
    skillKey,
    name,
    type,
    inputSchema: { type: 'object', additionalProperties: true },
    outputSchema: { type: 'object', required: ['citations'] },
    permissions,
    riskLevel,
    enabled: true,
    version: 1,
  };
}

function inspectionRule(
  ruleKey: string,
  name: string,
  domain: string,
  permission: string,
  riskLevel: BrainRiskLevelSeed,
): BrainMvpInspectionRuleSeed {
  return {
    ruleKey,
    name,
    domain,
    scheduleCron: '0 9 * * *',
    eventTrigger: null,
    condition: { metricRequired: true, permission },
    suggestionTpl: {
      structure: ['conclusion', 'evidence', 'action', 'benefit', 'entry'],
      entry: '/brain',
    },
    riskLevel,
    enabled: true,
    version: 1,
  };
}
