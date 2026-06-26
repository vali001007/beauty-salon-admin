import { Injectable } from '@nestjs/common';
import { AgentFieldScopeSanitizerService } from './agent-field-scope-sanitizer.service.js';
import { AgentPlannerService } from './agent-planner.service.js';
import { AgentResponseSafetyService } from './agent-response-safety.service.js';
import { AgentToolRegistryService } from './agent-tool-registry.service.js';
import type { AgentToolResult } from './agent.types.js';
import { DEFAULT_AGENT_EVAL_CASES, type AgentEvalCaseDefinition } from './agent-eval.cases.js';

export type AgentEvalCaseResult = {
  id: string;
  scenario: string;
  passed: boolean;
  expected: Record<string, unknown>;
  actual: Record<string, unknown>;
  errors: string[];
};

@Injectable()
export class AgentEvalService {
  constructor(
    private readonly planner: AgentPlannerService,
    private readonly toolRegistry: AgentToolRegistryService,
    private readonly fieldScopeSanitizer: AgentFieldScopeSanitizerService,
    private readonly responseSafety: AgentResponseSafetyService,
  ) {}

  async runDefaultCases(cases: AgentEvalCaseDefinition[] = DEFAULT_AGENT_EVAL_CASES) {
    const results: AgentEvalCaseResult[] = [];
    for (const testCase of cases) {
      const plan = await this.planner.plan({
        message: testCase.input,
        actor: { storeId: 1, userId: 1, role: testCase.role, entrypoint: 'eval' },
        context: testCase.context,
      });
      const firstTool = plan.toolPlan[0]?.tool;
      const tool = firstTool ? this.toolRegistry.get(firstTool) : undefined;
      const fieldScopeInspection = this.fieldScopeSanitizer.inspect(testCase.fieldScopes);
      const responseSafetyInspection = this.responseSafety.inspectPlanDisplay(plan);
      const runtimeResponseSafetyInspection = firstTool
        ? this.inspectRuntimeToolResult(firstTool, testCase)
        : { checked: false, passed: true, violations: [] as string[] };
      const actual = {
        intentType: plan.intentType,
        clarificationNeeded: plan.clarificationNeeded,
        firstTool,
        riskLevel: tool?.riskLevel,
        targetType: plan.toolPlan[0]?.args?.targetType,
        capabilityId: plan.capabilityPlan?.capabilityId,
        domain: this.getBusinessTaskDomain(plan.businessTask),
        roleToolAllowed: firstTool ? Boolean(tool?.allowedRoles?.includes(testCase.role)) : undefined,
        permissionAllowed: tool ? this.hasRequiredPermission(testCase.accountPermissions, tool.requiredPermissions) : undefined,
        fieldScopeProtected: fieldScopeInspection.enabled,
        protectedFieldScopes: fieldScopeInspection.protectedScopes,
        responseSafe: responseSafetyInspection.passed,
        responseSafetyViolations: responseSafetyInspection.violations.map((item) => `${item.path}:${item.matched}`),
        runtimeResponseSafe: runtimeResponseSafetyInspection.checked ? runtimeResponseSafetyInspection.passed : undefined,
        runtimeResponseSafetyViolations: runtimeResponseSafetyInspection.violations,
      };
      const expected = {
        intentType: testCase.expectedIntentType,
        clarificationNeeded: testCase.expectedClarification,
        firstTool: testCase.expectedTool,
        riskLevel: testCase.expectedRiskLevel,
        targetType: testCase.expectedTargetType,
        capabilityId: testCase.expectedCapabilityId,
        domain: testCase.expectedDomain,
        roleToolAllowed: testCase.expectedRoleToolAllowed,
        permissionAllowed: testCase.expectedPermissionAllowed,
        fieldScopeProtected: testCase.expectedFieldScopeProtected,
        protectedFieldScopes: testCase.expectedProtectedFieldScopes,
        responseSafe: testCase.expectedResponseSafe ?? true,
        runtimeResponseSafe: firstTool ? (testCase.expectedRuntimeResponseSafe ?? true) : undefined,
      };
      const errors = this.collectErrors(expected, actual);
      if (firstTool && actual.roleToolAllowed === false) {
        errors.push(`roleToolAllowed: tool ${firstTool} is not allowed for role ${testCase.role}`);
      }
      if (firstTool && actual.permissionAllowed === false && testCase.expectedPermissionAllowed !== false) {
        errors.push(`permissionAllowed: tool ${firstTool} is not allowed by account permissions`);
      }
      if (!responseSafetyInspection.passed) {
        errors.push(
          `responseSafety: ${responseSafetyInspection.violations
            .map((item) => `${item.path} matched ${item.matched}`)
            .join('; ')}`,
        );
      }
      if (!runtimeResponseSafetyInspection.passed) {
        errors.push(`runtimeResponseSafety: ${runtimeResponseSafetyInspection.violations.join('; ')}`);
      }
      results.push({
        id: testCase.id,
        scenario: testCase.scenario,
        passed: errors.length === 0,
        expected,
        actual,
        errors,
      });
    }
    return {
      total: results.length,
      passed: results.filter((item) => item.passed).length,
      failed: results.filter((item) => !item.passed).length,
      results,
    };
  }

  private getBusinessTaskDomain(value: unknown) {
    if (!value || typeof value !== 'object') return undefined;
    const domain = (value as { domain?: unknown }).domain;
    return typeof domain === 'string' ? domain : undefined;
  }

  private collectErrors(expected: Record<string, unknown>, actual: Record<string, unknown>) {
    const errors: string[] = [];
    for (const [key, expectedValue] of Object.entries(expected)) {
      if (expectedValue === undefined) continue;
      if (!this.isExpectedValueMatched(expectedValue, actual[key])) {
        errors.push(`${key}: expected ${String(expectedValue)}, got ${String(actual[key])}`);
      }
    }
    return errors;
  }

  private isExpectedValueMatched(expected: unknown, actual: unknown) {
    if (Array.isArray(expected)) {
      return (
        Array.isArray(actual) &&
        expected.length === actual.length &&
        expected.every((item, index) => actual[index] === item)
      );
    }
    return actual === expected;
  }

  private hasRequiredPermission(accountPermissions: string[] | undefined, requiredPermissions: string[] | undefined) {
    if (!requiredPermissions?.length) return true;
    const permissions = accountPermissions ?? ['*'];
    if (permissions.includes('*')) return true;
    return requiredPermissions.some((permission) => permissions.includes(permission));
  }

  private inspectRuntimeToolResult(toolName: string, testCase: AgentEvalCaseDefinition) {
    const fixture = this.buildRuntimeToolResultFixture(toolName, testCase);
    if (!fixture) return { checked: false, passed: true, violations: [] as string[] };
    const displaySafeResult = this.responseSafety.sanitizeToolResult(fixture);
    const scopedResult = this.fieldScopeSanitizer.sanitize(displaySafeResult, testCase.fieldScopes);
    const inspection = this.responseSafety.inspectToolResultDisplay(scopedResult);
    return {
      checked: true,
      passed: inspection.passed,
      violations: inspection.violations.map((item) => `${item.path}:${item.matched}`),
    };
  }

  private buildRuntimeToolResultFixture(toolName: string, testCase: AgentEvalCaseDefinition): AgentToolResult | undefined {
    const commonEvidence = (source: string[], metricDefinition: string): AgentToolResult['evidence'] => ({
      source,
      dateRange: 'next_week',
      metricDefinition,
      filters: ['timeRange=next_week', 'storeId=当前门店', 'limit=10'],
      sampleSize: 10,
      limitations: ['只读取当前门店数据，不自动触达客户。'],
    });

    const fixtures: Record<string, AgentToolResult> = {
      'customer.priority.rank': {
        status: 'success',
        title: '客户优先跟进',
        summary: '已按 follow_up_priority_score 返回 recommended 客户。',
        data: {
          items: [
            {
              customerName: '杨晓雯',
              customerPhone: '18800003187',
              priority: 'recommended',
              opportunityType: 'opportunity',
              lastVisitDate: '2026-05-20T02:00:00.000Z',
              lastVisitDays: 28,
              churnScore: 75,
              churnLevel: 'urgent',
              totalSpent: 18097,
              reason: '流失风险高，建议安排专属护理邀约。',
            },
          ],
        },
        evidence: commonEvidence(['Customer', 'PredictionSnapshot', 'Reservation', 'FollowUpTask'], 'follow_up_priority_score 综合流失风险、复购机会和预约状态。'),
        actions: [{ label: '生成 agent:tool:customer.followup.task.draft', action: 'agent:tool:customer.followup.task.draft', riskLevel: 'medium' }],
      },
      'business.query.ask': {
        status: 'success',
        title: '经营问数',
        summary: '通过 business-query:product_sales_trend 查询 product_sales_growth。',
        data: {
          card: {
            items: [
              {
                productName: '氨基酸洁面乳',
                priority: 'recommended',
                salesAmount: 256,
                growthRateText: '+100%',
              },
            ],
          },
        },
        evidence: commonEvidence(['ProductOrder', 'OrderItem', 'Product'], 'product_sales_growth 按订单明细商品销量对比。'),
        actions: [{ label: '查看 business-query:product_sales_trend', action: 'business-query:product_sales_trend', riskLevel: 'low' }],
      },
      'revenue.diagnose': {
        status: 'success',
        title: '收入诊断',
        summary: '近 30 天收入按 product_sales_amount 和订单状态汇总。',
        data: { items: [{ payMethod: 'wechat', totalRevenue: 5800, orderCount: 18, status: 'paid' }] },
        evidence: commonEvidence(['ProductOrder', 'OrderItem'], 'product_sales_amount 汇总已支付和已完成订单。'),
        actions: [{ label: '查看收入明细', action: 'agent:tool:revenue.diagnose', riskLevel: 'low' }],
      },
      'finance.revenue.summary': {
        status: 'success',
        title: '财务收入汇总',
        summary: '本月收入汇总按订单实收、订单数和客单价展示。',
        data: { reportType: 'finance_revenue_summary', current: { revenue: 12800, orderCount: 32, averageOrderValue: 400 } },
        evidence: commonEvidence(['ProductOrder', 'OrderItem'], '有效订单 totalAmount 和支付记录汇总。'),
        actions: [{ label: '查看财务日结', action: 'finance:daily-settlement:open', riskLevel: 'low' }],
      },
      'manager.daily.briefing': {
        status: 'success',
        title: '今日经营简报',
        summary: '今日建议优先关注预约确认、库存预警和高价值客户到店准备。',
        data: {
          kpis: [
            { label: '今日预约', value: 18, trend: '较昨日 +3' },
            { label: '待确认预约', value: 2, trend: '需前台跟进' },
            { label: '库存预警', value: 4, trend: '建议补货复核' },
          ],
          actions: ['确认今日预约', '查看库存预警', '安排高价值客户接待'],
        },
        evidence: commonEvidence(['Reservation', 'Product', 'Customer', 'ProductOrder'], '今日经营简报汇总预约、库存、客户和订单信号。'),
        actions: [{ label: '查看今日预约', action: 'reception.reservation.today', riskLevel: 'low' }],
      },
      'reception.customer.lookup': {
        status: 'success',
        title: '客户资料查询',
        summary: '已找到张女士的客户资料：金卡会员，最近一次到店为 2026-06-20。',
        data: {
          customer: {
            customerName: '张女士',
            phoneMasked: '138****0000',
            memberLevel: '金卡',
            lastVisitDate: '2026-06-20',
          },
        },
        evidence: commonEvidence(['Customer', 'Reservation', 'ProductOrder'], '前台客户查询只展示必要资料并脱敏手机号。'),
        actions: [{ label: '查看卡项权益', action: 'reception.card.benefit.summary', riskLevel: 'low' }],
      },
      'reception.reservation.today': {
        status: 'success',
        title: '今日预约',
        summary: '今日共有 18 条预约，其中 2 条待确认，建议优先电话确认。',
        data: {
          items: [
            { customerName: '张女士', startTime: '10:00', projectName: '深层补水护理', beauticianName: '沈晴', status: '待确认' },
          ],
        },
        evidence: commonEvidence(['Reservation', 'Customer', 'Project', 'Beautician'], '今日预约列表来自未取消预约和排班信息。'),
        actions: [{ label: '确认待确认预约', action: 'reception.reservation.today', riskLevel: 'low' }],
      },
      'reception.card.benefit.summary': {
        status: 'success',
        title: '卡项权益摘要',
        summary: '张女士当前有 2 张可用次卡，补水护理剩余 3 次，最近到期日为 2026-07-15。',
        data: {
          items: [
            { cardName: '补水护理次卡', remainingTimes: 3, expireDate: '2026-07-15', status: '可用' },
          ],
        },
        evidence: commonEvidence(['CustomerCard', 'CardUsageRecord', 'CustomerBalanceAccount'], '只读查询客户卡项、剩余次数和有效期，不执行核销。'),
        actions: [{ label: '查看客户资料', action: 'reception.customer.lookup', riskLevel: 'low' }],
      },
      'product.sales.rank': {
        status: 'success',
        title: '商品销售排行',
        summary: '按 product_sales_growth 返回近 30 天销量增长商品。',
        data: { items: [{ productName: '滋养手膜', priority: 'opportunity', salesQuantity: 8, salesAmount: 236 }] },
        evidence: commonEvidence(['ProductOrder', 'OrderItem', 'Product'], 'product_sales_growth 按商品销量增长率排序。'),
        actions: [{ label: '加入 marketing:activity:12', action: 'marketing:activity:12', riskLevel: 'low' }],
      },
      'marketing.opportunity.discover': {
        status: 'success',
        title: '营销机会发现',
        summary: '发现 opportunity 商品，建议设计专属活动。',
        data: { items: [{ productName: '补水精华', opportunityType: 'opportunity', fitScore: 86, suggestedCampaign: '会员专属护理组合' }] },
        evidence: commonEvidence(['Product', 'StockBatch', 'ProductOrder', 'OrderItem'], 'customer_growth_opportunity 与库存压力综合判断。'),
        actions: [{ label: '生成 marketing:activity:12', action: 'marketing:activity:12', riskLevel: 'medium' }],
      },
      'marketing.activity.draft': {
        status: 'success',
        title: '活动草稿',
        summary: '已生成 marketing:activity:12 草稿，等待确认。',
        data: { items: [{ title: '补水精华会员活动', status: 'draft', targetType: 'product' }] },
        evidence: commonEvidence(['AgentApproval', 'MarketingActivity'], '根据营销机会生成活动草稿。'),
        actions: [{ label: '确认 agent:tool:marketing.activity.draft', action: 'agent:tool:marketing.activity.draft', riskLevel: 'medium' }],
      },
      'marketing.customer.segment.discover': {
        status: 'success',
        title: '营销客群发现',
        summary: '发现 45 位沉睡客户，建议优先做温和召回。',
        data: {
          items: [
            { segment: '45 天未到店客户', count: 45, priority: 'high', reason: '近期未到店但历史消费稳定。' },
            { segment: '高价值未复购客户', count: 12, priority: 'medium', reason: '客单价高，适合顾问一对一邀约。' },
          ],
        },
        evidence: commonEvidence(['Customer', 'CustomerPredictionSnapshot'], '按最近到店、历史消费和复购机会识别营销客群。'),
        actions: [{ label: '匹配权益', action: 'agent:tool:promotion.offer.match', riskLevel: 'low' }],
      },
      'promotion.offer.match': {
        status: 'success',
        title: '权益匹配',
        summary: '建议给沉睡客户匹配低成本护理券，避免过度折扣。',
        data: {
          items: [
            { promotionName: '护理券', promotionType: 'coupon', estimatedCost: 1200, marginGuard: '控制折扣力度' },
          ],
        },
        evidence: commonEvidence(['Promotion'], '根据客群和活动目标匹配可用权益。'),
        actions: [{ label: '生成触达话术', action: 'agent:tool:marketing.copy.generate', riskLevel: 'low' }],
      },
      'marketing.copy.generate': {
        status: 'success',
        title: '营销话术生成',
        summary: '已生成 3 条沉睡客户召回话术。',
        data: { target: '沉睡客户', offer: '护理券', copies: ['温和提醒话术', '权益邀约话术', '专属回访话术'] },
        evidence: commonEvidence([], '基于目标客群和权益生成触达话术。'),
        actions: [{ label: '生成活动草稿', action: 'agent:tool:marketing.activity.draft', riskLevel: 'medium' }],
      },
      'marketing.effect.diagnose': {
        status: 'success',
        title: '活动效果复盘',
        summary: '近 30 天触达 100 人，转化 12 人，带来收入 3600 元。',
        data: {
          total: 100,
          responded: 28,
          booked: 16,
          converted: 12,
          revenue: 3600,
          funnel: [
            { name: '触达', value: 100, valueText: '100人', rateText: '100%' },
            { name: '响应', value: 28, valueText: '28人', rateText: '28%' },
            { name: '预约', value: 16, valueText: '16人', rateText: '16%' },
            { name: '核销/转化', value: 12, valueText: '12人', rateText: '12%' },
            { name: '收入贡献', value: 12, valueText: '¥3,600', rateText: '12%' },
          ],
        },
        evidence: commonEvidence(['MarketingAutomationTouch'], '触达、响应、预约、转化和收入漏斗。'),
        actions: [{ label: '生成话术优化', action: 'agent:tool:marketing.copy.generate', riskLevel: 'low' }],
      },
      'customer.followup.task.draft': {
        status: 'success',
        title: '跟进任务草稿',
        summary: '已生成 recommended 客户跟进任务草稿。',
        data: { items: [{ customerName: '马美琳', customerPhone: '18800001234', priority: 'urgent', status: 'pending' }] },
        evidence: commonEvidence(['AgentApproval', 'Customer', 'CustomerPredictionSnapshot', 'TerminalFollowUpTask'], 'follow_up_priority_score 作为任务优先级依据。'),
        actions: [{ label: '确认 agent:tool:customer.followup.task.draft', action: 'agent:tool:customer.followup.task.draft', riskLevel: 'medium' }],
      },
      'inventory.replenishment.draft': {
        status: 'success',
        title: '补货草稿',
        summary: '已根据 stock_risk_score 生成补货建议。',
        data: { items: [{ productName: '补水面膜', currentStock: 2, safetyStock: 8, suggestedQty: 12, status: 'draft' }] },
        evidence: commonEvidence(['AgentApproval', 'Product', 'ProductSupplier', 'PurchaseOrder'], 'stock_risk_score 综合库存、安全库存和销量。'),
        actions: [{ label: '确认 agent:tool:inventory.replenishment.draft', action: 'agent:tool:inventory.replenishment.draft', riskLevel: 'medium' }],
      },
      'inventory.risk.rank': {
        status: 'success',
        title: '库存风险排序',
        summary: '按 stock_risk_score 返回低库存商品。',
        data: { items: [{ productName: '舒缓喷雾', currentStock: 1, safetyStock: 6, riskLevel: 'high', status: 'active' }] },
        evidence: commonEvidence(['Product', 'StockBatch', 'ProductOrder', 'OrderItem'], 'stock_risk_score 综合库存缺口和消耗速度。'),
        actions: [{ label: '生成补货草稿', action: 'agent:tool:inventory.replenishment.draft', riskLevel: 'medium' }],
      },
      'inventory.consumption.trend': {
        status: 'success',
        title: '库存消耗趋势',
        summary: '近30天消耗最高的是补水面膜，累计消耗 80片，预计可用 8 天。',
        data: { items: [{ productName: '补水面膜', consumeQty: 80, dailyConsumption: 2.67, projectedDaysLeft: 8, riskLevel: 'medium' }] },
        evidence: commonEvidence(['StockMovement', 'Product'], '库存消耗趋势按负数库存流水聚合，只读分析。'),
        actions: [{ label: '生成补货草稿', action: 'agent:tool:inventory.replenishment.draft', riskLevel: 'medium' }],
      },
      'inventory.project.bom.risk': {
        status: 'success',
        title: '项目耗材 BOM 风险',
        summary: '项目耗材风险最高的是深层补水护理：补水面膜预计 14 天缺口 12片。',
        data: { items: [{ projectName: '深层补水护理', serviceCount: 30, topRiskProductName: '补水面膜', riskLevel: 'high' }] },
        evidence: commonEvidence(['Project', 'ProjectBomItem', 'Product', 'ProductOrder', 'OrderItem'], '项目 BOM 风险按服务次数和标准耗材用量估算。'),
        actions: [{ label: '生成补货草稿', action: 'agent:tool:inventory.replenishment.draft', riskLevel: 'medium' }],
      },
      'inventory.expiring.clearance.draft': {
        status: 'success',
        title: '临期库存处理草稿',
        summary: '发现 3 个临期处理建议，优先处理玻尿酸精华，12 天后到期。',
        data: { items: [{ productName: '玻尿酸精华', daysToExpiry: 12, riskLevel: 'high', suggestedAction: '顾问定向邀约或护理搭赠' }] },
        evidence: commonEvidence(['StockBatch', 'Product'], '临期处理草稿不自动调价、不发布活动、不触达客户。'),
        actions: [{ label: '生成营销活动草稿', action: 'agent:tool:marketing.activity.draft', riskLevel: 'medium' }],
      },
      'supplier.purchase.link': {
        status: 'success',
        title: '供应商采购链接',
        summary: '已整理 5 个采购建议，优先处理补水面膜：已绑定华东耗材。',
        data: { items: [{ productName: '补水面膜', supplierName: '华东耗材', supplyPriceText: '¥12', leadDays: 3, status: 'linked' }] },
        evidence: commonEvidence(['Product', 'ProductSupplier', 'Supplier'], '供应商采购链接只返回建议，不创建采购单。'),
        actions: [{ label: '生成补货草稿', action: 'agent:tool:inventory.replenishment.draft', riskLevel: 'medium' }],
      },
      'service.record.draft': {
        status: 'success',
        title: '服务记录草稿',
        summary: '已根据 ServiceTask 生成服务记录草稿。',
        data: { items: [{ taskNo: 'ST20260617001', customerName: '李伟明', status: 'draft', projectName: '深层补水护理' }] },
        evidence: commonEvidence(['ServiceTask', 'Customer', 'Project', 'ProjectBomItem'], '根据服务任务和项目耗材生成记录。'),
        actions: [{ label: '保存服务记录草稿', action: 'agent:tool:service.record.draft', riskLevel: 'low' }],
      },
      'beautician.today.service.list': {
        status: 'success',
        title: '我今天的服务客户',
        summary: '本人今日共 3 条服务/预约记录，下一位客户是李伟明，10:00 做深层补水护理。',
        data: {
          items: [
            { customerName: '李伟明', projectName: '深层补水护理', startTime: '10:00', status: 'pending', prepSuggestion: '服务前确认今日肤感。' },
          ],
        },
        evidence: commonEvidence(['ServiceTask', 'Reservation', 'Customer', 'Project'], '今日服务客户来自服务任务和未取消预约。'),
        actions: [{ label: '生成服务记录草稿', action: 'agent:tool:service.record.draft', riskLevel: 'low' }],
      },
      'beautician.customer.care.brief': {
        status: 'success',
        title: '客户护理摘要',
        summary: '李伟明 10:00 做深层补水护理；重点关注肤况反馈和服务后保湿建议。',
        data: {
          customer: { customerName: '李伟明', memberLevel: '金卡' },
          carePoints: ['肤质：敏感肌', '有卡项临期或剩余次数较少，可在服务后做温和续卡提醒。'],
          recommendedSteps: ['服务前确认客户今日肤感。', '服务后记录客户反馈。'],
        },
        evidence: commonEvidence(['ServiceTask', 'Customer', 'CustomerHealthProfile', 'CustomerCard', 'CardUsageRecord'], '护理摘要来自客户档案、卡项和服务任务；不构成医疗诊断。'),
        actions: [{ label: '生成服务记录草稿', action: 'agent:tool:service.record.draft', riskLevel: 'low' }],
      },
      'beautician.performance.progress': {
        status: 'success',
        title: '我的业绩进度',
        summary: '本人本月销售额 ¥3,600，服务 3次，提成 ¥360，表现分 82。',
        data: {
          items: [{ beauticianName: '本人', salesAmount: 3600, salesAmountText: '¥3,600', serviceCount: 3, commissionAmountText: '¥360', performanceScore: 82 }],
          progress: { targetAmount: null, gapAmount: null },
        },
        evidence: commonEvidence(['Beautician', 'OrderItem', 'CommissionRecord', 'Reservation', 'ServiceTask', 'CardUsageRecord'], '美容师业绩进度仅查询本人服务、销售和提成数据。'),
        actions: [{ label: '查看服务记录', action: 'beautician.record', riskLevel: 'low' }],
      },
      'beautician.repurchase.opportunity': {
        status: 'success',
        title: '复购续卡机会',
        summary: '本人服务客户识别到 2 个复购/续卡机会，优先跟进李伟明：卡项剩余 1 次。',
        data: {
          items: [{ customerName: '李伟明', opportunityType: '续卡/卡项提醒', opportunityScore: 88, suggestedAction: '服务后做卡项续费提醒' }],
        },
        evidence: commonEvidence(['ServiceTask', 'CardUsageRecord', 'CustomerCard', 'Customer'], '复购续卡机会只生成建议，不自动创建任务或触达客户。'),
        actions: [{ label: '生成跟进任务草稿', action: 'agent:tool:customer.followup.task.draft', riskLevel: 'medium' }],
      },
      'scheduling.optimization.preview': {
        status: 'success',
        title: '排班优化预览',
        summary: '根据 SmartSchedulingRun 生成排班预览。',
        data: { items: [{ beauticianName: '沈晴', status: 'busy', startTime: '10:00', endTime: '11:00' }] },
        evidence: commonEvidence(['Reservation', 'Schedule', 'Beautician', 'BeauticianAvailability', 'BeauticianTimeOff', 'SmartSchedulingRun'], '按预约和美容师可约时段生成预览。'),
        actions: [{ label: '查看排班预览', action: 'agent:tool:scheduling.optimization.preview', riskLevel: 'low' }],
      },
      'schedule.diagnose': {
        status: 'success',
        title: '预约排班诊断',
        summary: '根据 Schedule 和 Reservation 诊断忙碌时段。',
        data: { items: [{ beauticianName: '沈晴', status: 'busy', reservationCount: 4, completionRate: 0.75 }] },
        evidence: commonEvidence(['Schedule', 'Reservation', 'Beautician'], '预约数、已到店数和排班状态。'),
        actions: [{ label: '检查排班', action: 'agent:tool:schedule.diagnose', riskLevel: 'low' }],
      },
      'project.diagnose': {
        status: 'success',
        title: '项目经营诊断',
        summary: '按项目服务次数和 materialCost 诊断毛利。',
        data: { items: [{ projectName: '深层补水护理', serviceCount: 18, materialCost: 320, grossMargin: 1680, marginRate: 0.72 }] },
        evidence: commonEvidence(['ProductOrder', 'OrderItem', 'Project', 'ProjectBomItem', 'Product'], '项目收入扣除项目耗材成本。'),
        actions: [{ label: '查看项目明细', action: 'agent:tool:project.diagnose', riskLevel: 'low' }],
      },
      'card.diagnose': {
        status: 'success',
        title: '卡项与会员卡诊断',
        summary: '按 member_balance 和剩余次数识别卡项风险。',
        data: { items: [{ customerName: '周梦瑶', memberLevel: 'gold', priority: 'recommended', cardUsageTimes: 3, balance: 1200 }] },
        evidence: commonEvidence(['CustomerCard', 'CardUsageRecord', 'CustomerBalanceAccount', 'CustomerBalanceTransaction', 'Customer'], 'member_balance 与卡项核销记录。'),
        actions: [{ label: '生成跟进建议', action: 'agent:tool:customer.followup.task.draft', riskLevel: 'medium' }],
      },
      'finance.margin.diagnose': {
        status: 'success',
        title: '财务毛利诊断',
        summary: '按 netRevenue、materialCost 和 commissionTotal 诊断毛利。',
        data: { items: [{ totalRevenue: 12800, materialCost: 2600, commissionTotal: 1800, netRevenue: 8400, grossMarginRate: 0.66 }] },
        evidence: commonEvidence(['ProductOrder', 'OrderItem', 'Product', 'ProjectBomItem', 'CommissionRecord', 'DailySettlement'], '净收入扣除耗材成本和提成成本。'),
        actions: [{ label: '查看财务明细', action: 'agent:tool:finance.margin.diagnose', riskLevel: 'low' }],
      },
      'finance.profit.diagnose': {
        status: 'success',
        title: '利润与毛利诊断',
        summary: '利润诊断：按 netRevenue、materialCost 和 commissionTotal 解释毛利变化。',
        data: { reportType: 'finance_profit_diagnosis', current: { netRevenue: 8400, grossProfit: 5600, grossMarginRate: 0.66 } },
        evidence: commonEvidence(['ProductOrder', 'OrderItem', 'Product', 'ProjectBomItem', 'CommissionRecord', 'DailySettlement'], '净收入扣除耗材成本和提成成本。'),
        actions: [{ label: '查看低毛利风险', action: 'agent:tool:finance.margin.risk.rank', riskLevel: 'low' }],
      },
      'finance.margin.risk.rank': {
        status: 'success',
        title: '毛利风险排行',
        summary: '毛利风险最高的是 高成本修护，毛利率 18%。',
        data: { reportType: 'finance_margin_risk_rank', items: [{ itemName: '高成本修护', marginRate: 0.18, riskLevel: 'high' }] },
        evidence: commonEvidence(['ProductOrder', 'OrderItem', 'Product', 'ProjectBomItem', 'CommissionRecord', 'DailySettlement'], '按项目/商品收入、耗材成本和提成成本计算毛利率。'),
        actions: [{ label: '查看日结报表', action: 'finance:daily-settlement:open', riskLevel: 'low' }],
      },
      'finance.refund.discount.audit': {
        status: 'success',
        title: '退款折扣审计',
        summary: '发现 2 条退款或折扣风控线索，需复核手工优惠和退款原因。',
        data: { reportType: 'finance_refund_discount_audit', items: [{ auditType: 'discount', orderNo: 'PO001', riskLevel: 'high' }] },
        evidence: commonEvidence(['ProductOrder', 'RefundRecord'], '订单折扣金额、折扣来源、退款金额和退款占比。'),
        actions: [{ label: '查看退款订单', action: 'orders:refunds:open', riskLevel: 'low' }],
      },
      'finance.beautician.performance.audit': {
        status: 'success',
        title: '美容师绩效审计',
        summary: '发现 1 位美容师存在提成或服务记录完整率审计风险。',
        data: { reportType: 'finance_beautician_performance_audit', items: [{ beauticianName: '宋乔', riskLevel: 'medium' }] },
        evidence: commonEvidence(['Beautician', 'OrderItem', 'CommissionRecord', 'Reservation', 'ServiceTask'], '销售、提成、服务记录和预约完成率。'),
        actions: [{ label: '查看提成记录', action: 'finance:commission:open', riskLevel: 'low' }],
      },
      'finance.report.draft': {
        status: 'success',
        title: '财务报告草稿',
        summary: '本月财务经营报告草稿已生成，包含收入、利润、退款折扣和员工绩效风险。',
        data: { reportType: 'finance_report_draft', document: { title: '本月财务经营报告草稿', content: '# 本月财务经营报告草稿\n\n## 收入概览\n收入稳定。', downloadable: true } },
        evidence: commonEvidence(['ProductOrder', 'RefundRecord', 'CommissionRecord', 'ServiceTask'], '财务报告草稿由多个只读财务诊断结果汇总。'),
        actions: [{ label: '查看日结报表', action: 'finance:daily-settlement:open', riskLevel: 'low' }],
      },
      'staff.performance.rank': {
        status: 'success',
        title: '员工表现排行',
        summary: testCase.role === 'beautician' ? '本人近 30 天 staff_performance_score 较高。' : '按 staff_performance_score 返回表现较好的员工。',
        data: {
          items: [
            {
              beauticianName: testCase.role === 'beautician' ? '本人' : '宋乔',
              performanceScore: 91,
              performanceLevel: 'high',
              serviceCount: 21,
              commissionAmount: 1680,
              customerRepurchaseRate: 0.38,
              priority: 'recommended',
            },
          ],
        },
        evidence: commonEvidence(['Beautician', 'OrderItem', 'CommissionRecord', 'Reservation', 'ServiceTask', 'CardUsageRecord'], 'staff_performance_score 综合服务、成交、复购和记录完整度。'),
        actions: [{ label: '查看员工详情', action: 'agent:tool:staff.performance.rank', riskLevel: 'low' }],
      },
      'supply_chain.diagnose': {
        status: 'success',
        title: '供应链采购诊断',
        summary: '按 supplier_delivery_cycle 和 supplier_settlement_amount 识别供应商风险。',
        data: { items: [{ supplierName: '华东美业供应商', averageDeliveryDays: 8, receiveRate: 0.72, settlementAmount: 5600, riskLevel: 'medium' }] },
        evidence: commonEvidence(['Supplier', 'SupplierOrder', 'SupplierOrderItem', 'SupplierSettlement'], '供应商交付周期、到货率和结算金额。'),
        actions: [{ label: '联系供应商', action: 'agent:tool:supply_chain.diagnose', riskLevel: 'low' }],
      },
      'marketing.conversion.diagnose': {
        status: 'success',
        title: '营销转化诊断',
        summary: '按 campaign_conversion_rate 和 campaign_revenue 复盘活动。',
        data: { items: [{ pageTitle: '夏季补水活动', channel: 'h5', conversionRate: 0.12, attributedRevenue: 3200, status: 'active' }] },
        evidence: commonEvidence(['MarketingPage', 'MarketingPageEvent', 'MarketingPageLead', 'MarketingPageAttribution'], '活动访问、线索、转化和归因收入。'),
        actions: [{ label: '查看推广页', action: 'agent:tool:marketing.conversion.diagnose', riskLevel: 'low' }],
      },
      'automation.execution.diagnose': {
        status: 'success',
        title: '自动化执行复盘',
        summary: '按 automation_touch_success_rate 复盘自动化。',
        data: { items: [{ strategyName: '沉睡客户唤醒', triggeredCount: 80, reachedCount: 62, convertedCount: 8, failedExecutionCount: 3 }] },
        evidence: commonEvidence(['MarketingAutomationExecution', 'MarketingAutomationTouch', 'MarketingAttribution'], '自动化触达、失败和归因结果。'),
        actions: [{ label: '优化策略', action: 'agent:tool:automation.execution.diagnose', riskLevel: 'low' }],
      },
      'customer_app.funnel.analyze': {
        status: 'success',
        title: '客户小程序渠道漏斗',
        summary: '按 customer_app_bind_rate 和 channel_conversion_rate 分析小程序。',
        data: { items: [{ channel: 'ami_glow', identityCount: 120, boundCount: 90, reservationCount: 18, appCustomerRevenue: 5200 }] },
        evidence: commonEvidence(['CustomerAppIdentity', 'CustomerAppEvent', 'MarketingPageLead', 'MarketingPageAttribution', 'Reservation', 'ProductOrder'], '客户小程序访问、绑定、预约和成交。'),
        actions: [{ label: '查看渠道明细', action: 'agent:tool:customer_app.funnel.analyze', riskLevel: 'low' }],
      },
      'promotion.effect.analyze': {
        status: 'success',
        title: '权益活动效果',
        summary: '按 promotion_claim_rate 和使用率分析权益。',
        data: { items: [{ promotionName: '满 300 减 50', promotionType: 'money_off', issuedCount: 80, usedCount: 21, claimRate: 0.46 }] },
        evidence: commonEvidence(['Promotion'], '权益领取、使用和成本估算。'),
        actions: [{ label: '调整权益', action: 'agent:tool:promotion.effect.analyze', riskLevel: 'low' }],
      },
      'terminal.health.diagnose': {
        status: 'success',
        title: '终端健康诊断',
        summary: '按 terminal_failure_rate 识别终端高频失败。',
        data: { items: [{ deviceName: '前台平板', failureCategoryLabel: '设备认证失败', failureCount: 12, sampleMessage: '缺少设备认证令牌', status: 'offline' }] },
        evidence: commonEvidence(['TerminalDevice', 'TerminalConversation'], '终端设备状态、会话失败和异常信号。'),
        actions: [{ label: '检查终端设备', action: 'agent:tool:terminal.health.diagnose', riskLevel: 'low' }],
      },
      'order.refund.diagnose': {
        status: 'success',
        title: '售后退款诊断',
        summary: '按 refund_amount 和 refund_rate 诊断退款。',
        data: { items: [{ refundNo: 'RF20260617001', amount: 680, refundRate: 0.08, status: 'refunded' }] },
        evidence: commonEvidence(['RefundRecord', 'ProductOrder'], '退款金额、订单金额和退款率。'),
        actions: [{ label: '查看退款明细', action: 'agent:tool:order.refund.diagnose', riskLevel: 'low' }],
      },
      'service.quality.diagnose': {
        status: 'success',
        title: '服务质量诊断',
        summary: '按 service_completion_rate 和记录完整度诊断服务质量。',
        data: { items: [{ taskNo: 'ST20260617002', customerName: '黄雅婷', riskScore: 72, riskLevel: 'medium', status: 'completed' }] },
        evidence: commonEvidence(['ServiceTask', 'Customer', 'Project', 'Beautician'], '服务完成率、记录完整度和客户反馈。'),
        actions: [{ label: '补齐服务记录', action: 'agent:tool:service.quality.diagnose', riskLevel: 'low' }],
      },
      'store.comparison.diagnose': {
        status: 'success',
        title: '门店对比诊断',
        summary: '按门店收入、到店率和 stock_risk_score 进行对比。',
        data: { items: [{ storeName: 'Ami 全量演示门店', salesAmount: 32800, arrivalRate: 0.82, lowStockCount: 4, storeRankScore: 88 }] },
        evidence: commonEvidence(['UserStore', 'Store', 'ProductOrder', 'Reservation', 'Customer', 'Product'], '多门店授权范围内的经营指标。'),
        actions: [{ label: '查看门店对比', action: 'agent:tool:store.comparison.diagnose', riskLevel: 'low' }],
      },
    };

    return fixtures[toolName];
  }
}
