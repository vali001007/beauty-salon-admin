import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AgentRunResult } from '@/types/agent';
import type { BusinessQueryResponse } from '@/types/businessQuery';
import { AgentRunResultCard, BusinessQueryResultCard } from './RoleDashboards';

function countText(html: string, text: string) {
  return html.split(text).length - 1;
}

const INTERNAL_TEXT_BLOCKLIST = [
  'Run：',
  '工具计划',
  '统计周期：',
  '对比周期：',
  '数据来源：',
  '统计口径：',
  '过滤：',
  '样本量：',
  '限制：',
  'recommended',
  'opportunity',
  'urgent',
  'scope=',
  'limit=',
  'timeRange=',
  'completed/paid',
  'PredictionSnapshot',
  'CustomerPredictionSnapshot',
  'TerminalFollowUpTask',
  'FollowUpTask',
  'product_sales_amount',
  'staff_performance_score',
  'customer_growth_opportunity',
  'terminal_failure_rate',
  'device_auth_missing',
  'failureCategory',
  'uniqueVisitorCount',
  'appCustomerRevenue',
  'refundOrderRate',
  'supplier_delivery_cycle',
  'pageTitle',
  'triggeredCount',
  'storeRankScore',
  'salesAmount',
  'attributedRevenue',
  'ProductOrder',
  'RefundRecord',
  'TerminalDevice',
  'MarketingAttribution',
  'miniapp',
  'ami_glow',
  'wechat',
  'token',
];

function expectNoInternalText(html: string, extraTexts: string[] = []) {
  for (const text of [...INTERNAL_TEXT_BLOCKLIST, ...extraTexts]) {
    expect(html).not.toContain(text);
  }
}

vi.hoisted(() => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    },
  });
});

describe('RoleDashboards business result cards', () => {
  it('renders Agent structured values as business-facing Chinese text', () => {
    const data: AgentRunResult = {
      runId: 1001,
      runNo: 'AG202606170001',
      status: 'completed',
      plan: {
        intentType: 'analysis_and_recommendation',
        goal: '今天最值得跟进的客户',
        toolPlan: [{ tool: 'customer.priority.rank', args: { limit: 10 } }],
        confidence: 0.9,
        clarificationNeeded: false,
      },
      answer: '已按要求返回优先跟进客户。',
      toolResults: [
        {
          status: 'success',
          title: '今日优先跟进客户',
          summary: '已按要求返回 2 位客户。',
          data: {
            items: [
              {
                customerName: '杨晓雯',
                phone: '188****3187',
                memberLevel: '银卡会员',
                priority: 'recommended',
                lastVisitDays: 226,
                lastVisitDate: '2025-11-02T02:00:00.000Z',
                totalSpent: 18097,
                churnScore: 75,
              },
              {
                customerName: '刘若兰',
                phone: '188****0223',
                priority: 'opportunity',
                lastVisitDate: '2025-11-06T02:00:00.000Z',
              },
            ],
          },
          evidence: {
            source: ['Customer', 'CustomerPredictionSnapshot', 'Reservation', 'TerminalFollowUpTask'],
            filters: ['storeId=当前门店', 'timeRange=下周', 'limit=10'],
            metricDefinition: 'follow_up_priority_score 综合评分',
          },
        },
      ],
      actions: [],
      evidence: {
        source: ['Customer'],
        filters: ['storeId=当前门店'],
        metricDefinition: 'follow_up_priority_score 综合评分',
      },
    };

    const html = renderToStaticMarkup(<AgentRunResultCard data={data} />);

    expect(html).toContain('Ami 智能问答');
    expect(html).toContain('概述');
    expect(html).toContain('明细');
    expect(html).toContain('下一步动作');
    expect(html).toContain('建议优先跟进');
    expect(html).toContain('可培育机会');
    expect(html).toContain('2025-11-02');
    expect(html).toContain('￥18,097');
    expect(html).not.toContain('客户跟进优先评分');
    expect(html).not.toContain('follow_up_priority_score 综合评分');
    expect(html).not.toContain('2025-11-02T02:00:00.000Z');
    expectNoInternalText(html);
  });

  it('renders nested business query card items inside Agent tool results', () => {
    const data: AgentRunResult = {
      runId: 1002,
      runNo: 'AG202606170002',
      status: 'completed',
      plan: {
        intentType: 'analysis_and_recommendation',
        goal: '近期表现较好的员工',
        toolPlan: [{ tool: 'business.query.ask', args: { question: '近期表现较好的员工' } }],
        confidence: 0.86,
        clarificationNeeded: false,
      },
      answer: '已按员工表现返回排行。',
      toolResults: [
        {
          status: 'success',
          title: '员工表现排行',
          summary: '当前周期表现较好的是沈晴。',
          data: {
            card: {
              items: [
                {
                  beauticianName: '沈晴',
                  performanceScore: 86,
                  performanceLevel: '表现突出',
                  serviceCount: 8,
                  serviceTaskCount: 6,
                  completedTaskCount: 5,
                  serviceRecordCompleteCount: 4,
                  serviceRecordCompletionRateText: '67%',
                  salesAmount: 12800,
                  commissionAmount: 980,
                  commissionAmountText: '¥980',
                  repeatCustomerCount: 3,
                  customerRepurchaseRateText: '38%',
                  completionRateText: '80%',
                },
              ],
            },
          },
          evidence: {
            source: ['Beautician', 'OrderItem', 'CommissionRecord'],
            filters: ['storeId=当前门店', 'scope=全店员工', '订单状态 in completed/paid', 'limit=10'],
            metricDefinition: 'staff_performance_score 综合评分',
          },
        },
      ],
      actions: [],
      evidence: {
        source: ['Beautician'],
        filters: ['storeId=当前门店'],
        metricDefinition: 'staff_performance_score 综合评分',
      },
    };

    const html = renderToStaticMarkup(<AgentRunResultCard data={data} />);

    expect(html).toContain('沈晴');
    expect(html).toContain('概述');
    expect(html).toContain('明细');
    expect(html).toContain('下一步动作');
    expect(html).toContain('表现分');
    expect(html).toContain('表现突出');
    expect(html).toContain('服务任务');
    expect(html).toContain('服务记录完整率');
    expect(html).toContain('复购客户');
    expect(html).toContain('客户复购率');
    expect(html).not.toContain('员工表现评分');
    expect(html).not.toContain('全店员工');
    expect(html).not.toContain('订单状态为已完成或已支付');
    expect(html).not.toContain('最多返回 10 条');
    expect(html).toContain('￥12,800');
    expect(html).toContain('￥980');
    expect(html).not.toContain('performanceScore');
    expect(html).not.toContain('commissionAmount');
    expect(html).not.toContain('serviceRecordCompletionRateText');
    expect(html).not.toContain('repeatCustomerCount');
    expectNoInternalText(html);
  });

  it('deduplicates Agent detail fields when raw values and display text values both exist', () => {
    const data: AgentRunResult = {
      runId: 1006,
      runNo: 'AG202606170006',
      status: 'completed',
      plan: {
        intentType: 'analysis_and_recommendation',
        goal: '最近销量好的商品有哪些',
        toolPlan: [{ tool: 'product.sales.rank', args: { limit: 10 } }],
        confidence: 0.91,
        clarificationNeeded: false,
      },
      answer: '已返回商品排行。',
      toolResults: [
        {
          status: 'success',
          title: '商品销售排行',
          summary: '氨基酸洁面乳近期表现较好。',
          data: {
            items: [
              {
                productName: '氨基酸洁面乳',
                quantity: 2,
                growthRateText: '+100%',
                salesAmount: 256,
                salesAmountText: '￥256',
                attributedRevenue: 1680,
                attributedRevenueText: '￥1,680',
              },
            ],
          },
          evidence: {
            source: ['Product', 'OrderItem'],
            filters: ['storeId=当前门店'],
            metricDefinition: 'product_sales_amount 与 product_sales_growth 综合排序。',
          },
        },
      ],
      actions: [],
    };

    const html = renderToStaticMarkup(<AgentRunResultCard data={data} />);

    expect(html).toContain('概述');
    expect(html).toContain('明细');
    expect(html).toContain('下一步动作');
    expect(html).toContain('氨基酸洁面乳');
    expect(html).toContain('￥256');
    expect(html).toContain('￥1,680');
    expect(countText(html, '>销售额</span>')).toBe(1);
    expect(countText(html, '>归因收入</span>')).toBe(1);
    expectNoInternalText(html);
  });

  it('renders BusinessQuery metadata and row values as Chinese text', () => {
    const data: BusinessQueryResponse = {
      requestId: 'BQ202606170001',
      status: 'success',
      domain: 'customer',
      capability: 'customer_growth_opportunity',
      queryPlan: {
        requestId: 'BQ202606170001',
        originalQuestion: '哪些客户适合跟进',
        domain: 'customer',
        capability: 'customer_growth_opportunity',
        intent: 'query',
        metrics: ['follow_up_priority_score'],
        dimensions: [],
        filters: {},
        limit: 10,
        needClarification: false,
      },
      card: {
        type: 'customerGrowthOpportunity',
        title: '客户增长机会',
        summary: '筛选出建议优先跟进客户。',
        items: [
          {
            customerName: '周梦瑶',
            priority: 'urgent',
            daysSinceVisit: 90,
            totalSpent: 5564,
          },
        ],
      },
      answer: '建议顾问优先跟进周梦瑶。',
      evidence: {
        source: ['Customer'],
        filters: ['storeId=当前门店'],
        metricDefinition: 'follow_up_priority_score 综合评分',
      },
      actions: [],
    };

    const html = renderToStaticMarkup(<BusinessQueryResultCard data={data} />);

    expect(html).toContain('Ami 智能问答');
    expect(html).toContain('概述');
    expect(html).toContain('明细');
    expect(html).toContain('下一步动作');
    expect(html).toContain('能力：客户增长机会');
    expect(html).toContain('领域：客户');
    expect(html).toContain('需立即跟进');
    expect(html).toContain('90 天');
    expect(html).toContain('￥5,564');
    expect(html).not.toContain('查询结果');
    expect(html).not.toContain('客户跟进优先评分');
    expectNoInternalText(html);
  });

  it('deduplicates BusinessQuery detail fields when formatted text fields are present', () => {
    const data: BusinessQueryResponse = {
      requestId: 'BQ202606170002',
      status: 'success',
      domain: 'product',
      capability: 'product_sales_trend',
      queryPlan: {
        requestId: 'BQ202606170002',
        originalQuestion: '最近销量好的商品有哪些',
        domain: 'product',
        capability: 'product_sales_trend',
        intent: 'query',
        metrics: ['product_sales_amount', 'product_sales_growth'],
        dimensions: [],
        filters: {},
        limit: 10,
        needClarification: false,
      },
      card: {
        type: 'productSalesTrend',
        title: '商品销量排行',
        summary: '氨基酸洁面乳近期表现较好。',
        items: [
          {
            productName: '氨基酸洁面乳',
            quantity: 2,
            growthRateText: '+100%',
            salesAmount: 256,
            salesAmountText: '￥256',
            attributedRevenue: 1680,
            attributedRevenueText: '￥1,680',
          },
        ],
      },
      answer: '已返回商品排行。',
      evidence: {
        source: ['Product', 'OrderItem'],
        filters: ['storeId=当前门店'],
        metricDefinition: 'product_sales_amount 与 product_sales_growth 综合排序。',
      },
      actions: [],
    };

    const html = renderToStaticMarkup(<BusinessQueryResultCard data={data} />);

    expect(html).toContain('概述');
    expect(html).toContain('明细');
    expect(html).toContain('下一步动作');
    expect(html).toContain('能力：商品销量趋势');
    expect(html).toContain('领域：商品');
    expect(html).toContain('￥256');
    expect(html).toContain('￥1,680');
    expect(countText(html, '>销售额</span>')).toBe(1);
    expect(countText(html, '>归因收入</span>')).toBe(1);
    expectNoInternalText(html);
  });

  it('renders customer app funnel chain fields as business-facing Chinese text', () => {
    const data: AgentRunResult = {
      runId: 1005,
      runNo: 'AG202606170005',
      status: 'completed',
      plan: {
        intentType: 'analysis_and_recommendation',
        goal: '小程序最近带来多少客户和成交',
        toolPlan: [{ tool: 'customer_app.funnel.analyze', args: {} }],
        confidence: 0.9,
        clarificationNeeded: false,
      },
      answer: '已返回客户小程序渠道漏斗。',
      toolResults: [
        {
          status: 'success',
          title: '客户小程序渠道漏斗',
          summary: '访问 1 人，留资 1 条，预约事件 1 次，归因成交 1 笔。',
          data: {
            items: [
              {
                channel: 'miniapp',
                eventCount: 4,
                uniqueVisitorCount: 1,
                activeCustomerCount: 1,
                promotionClaimCount: 1,
                promotionReservedCount: 1,
                reservationEventCount: 1,
                reservationCount: 1,
                checkedInReservationCount: 1,
                leadCount: 1,
                leadConvertedCount: 1,
                attributedOrderCount: 1,
                attributedRevenueText: '¥1,680',
                appCustomerOrderCount: 1,
                appCustomerRevenueText: '¥1,980',
                attributionConversionRateText: '100%',
              },
              {
                channel: 'ami_glow',
                eventCount: 0,
                uniqueVisitorCount: 0,
                activeCustomerCount: 0,
                attributedOrderCount: 0,
                attributedRevenueText: '¥0',
                appCustomerOrderCount: 0,
                appCustomerRevenueText: '¥0',
              },
            ],
          },
          evidence: {
            source: ['CustomerAppIdentity', 'CustomerAppEvent', 'MarketingPageLead', 'MarketingPageAttribution', 'Reservation', 'ProductOrder'],
            filters: ['storeId=当前门店'],
            metricDefinition: 'customer_app_active_count、customer_app_bind_rate、channel_conversion_rate 共同判断小程序成交链路。',
          },
        },
      ],
      actions: [],
    };

    const html = renderToStaticMarkup(<AgentRunResultCard data={data} />);

    expect(html).toContain('小程序');
    expect(html).toContain('Ami Glow 小程序');
    expect(html).toContain('访问人数');
    expect(html).toContain('权益领取');
    expect(html).toContain('权益预约');
    expect(html).toContain('小程序预约');
    expect(html).toContain('归因订单');
    expect(html).toContain('归因收入');
    expect(html).toContain('小程序客户成交');
    expect(html).toContain('￥1,980');
    expect(html).not.toContain('客户小程序活跃数');
    expect(html).not.toContain('CustomerAppIdentity');
    expect(html).not.toContain('ProductOrder');
    expectNoInternalText(html);
  });

  it('renders newly added agent tool fields without leaking internal keys or enum values', () => {
    const data: AgentRunResult = {
      runId: 1003,
      runNo: 'AG202606170003',
      status: 'completed',
      plan: {
        intentType: 'analysis_and_recommendation',
        goal: '售后和终端风险诊断',
        toolPlan: [
          { tool: 'order.refund.diagnose', args: {} },
          { tool: 'terminal.health.diagnose', args: {} },
        ],
        confidence: 0.88,
        clarificationNeeded: false,
      },
      answer: '已返回售后退款和终端健康风险。',
      toolResults: [
        {
          status: 'success',
          title: '售后退款诊断',
          summary: '近30天退款 2 笔。',
          data: {
            items: [
              {
                refundNo: 'RF001',
                customerName: '陈女士',
                amountText: '¥500',
                refundOrderRateText: '50%',
                refundedAt: '2026-06-17T10:00:00.000Z',
                status: 'refunded',
              },
            ],
          },
          evidence: {
            source: ['RefundRecord', 'ProductOrder'],
            filters: ['storeId=当前门店'],
            metricDefinition: 'refund_rate = 退款金额 / 有效订单金额；terminal_failure_rate 作为终端风险指标。',
          },
        },
        {
          status: 'success',
          title: '终端设备与对话诊断',
          summary: '发现 1 台终端离线。',
          data: {
            items: [
              {
                failureCategory: 'device_auth_missing',
                failureCategoryLabel: '设备认证或会话初始化异常',
                failureCount: 2,
                affectedDeviceCount: 1,
                topDeviceName: '前台终端',
                sampleMessage: '缺少设备认证令牌，会话初始化失败。',
                candidateCapabilityName: '设备认证令牌修复',
                recommendation: '检查设备登录和设备认证令牌保存。',
              },
            ],
          },
          evidence: {
            source: ['TerminalDevice', 'TerminalConversation'],
            filters: ['storeId=当前门店'],
            metricDefinition: 'terminal_failure_rate = 异常终端数 / 终端数。',
          },
        },
      ],
      actions: [],
    };

    const html = renderToStaticMarkup(<AgentRunResultCard data={data} />);

    expect(html).toContain('退款单号');
    expect(html).toContain('单笔退款占比');
    expect(html).toContain('2026-06-17');
    expect(html).toContain('已退款');
    expect(html).toContain('设备');
    expect(html).toContain('设备认证或会话初始化异常');
    expect(html).toContain('候选能力');
    expect(html).toContain('设备认证令牌修复');
    expect(html).toContain('样例消息');
    expect(html).not.toContain('退款率 =');
    expect(html).not.toContain('终端失败率');
    expectNoInternalText(html);
  });

  it('renders supply chain marketing automation and store comparison fields as Chinese text', () => {
    const data: AgentRunResult = {
      runId: 1004,
      runNo: 'AG202606170004',
      status: 'completed',
      plan: {
        intentType: 'analysis_and_recommendation',
        goal: '全域经营诊断',
        toolPlan: [
          { tool: 'supply_chain.diagnose', args: {} },
          { tool: 'marketing.conversion.diagnose', args: {} },
          { tool: 'automation.execution.diagnose', args: {} },
          { tool: 'store.comparison.diagnose', args: {} },
        ],
        confidence: 0.9,
        clarificationNeeded: false,
      },
      answer: '已返回供应链、营销、自动化和门店对比诊断。',
      toolResults: [
        {
          status: 'success',
          title: '供应链采购诊断',
          summary: '供应链风险最高的是本地用品。',
          data: {
            items: [
              {
                supplierName: '本地用品',
                pendingOrderCount: 1,
                overdueOrderCount: 1,
                averageDeliveryDaysText: '4 天',
                receiveRateText: '0%',
                settlementAmountText: '¥1,200',
                unpaidSettlementCount: 1,
              },
            ],
          },
          evidence: {
            source: ['SupplierOrderItem', 'SupplierSettlement'],
            filters: ['storeId=当前门店'],
            metricDefinition: 'supplier_delivery_cycle 与 supplier_settlement_amount 只读聚合。',
          },
        },
        {
          status: 'success',
          title: '营销转化诊断',
          summary: '补水活动页效果最好。',
          data: {
            items: [
              {
                pageTitle: '补水活动页',
                channel: 'wechat',
                viewCount: 20,
                clickCount: 8,
                shareCount: 2,
                leadCount: 3,
                leadConvertedCount: 1,
                attributedOrderCount: 1,
                conversionRateText: '33%',
              },
            ],
          },
          evidence: {
            source: ['MarketingPage', 'MarketingAttribution'],
            filters: ['storeId=当前门店'],
            metricDefinition: 'campaign_conversion_rate 和 campaign_revenue 聚合。',
          },
        },
        {
          status: 'success',
          title: '自动化执行复盘',
          summary: '沉睡客户唤醒表现最好。',
          data: {
            items: [
              {
                strategyName: '沉睡客户唤醒',
                executionCount: 1,
                triggeredCount: 20,
                reachedCount: 16,
                reachRateText: '80%',
                convertedCount: 1,
                attributedRevenueText: '¥980',
              },
            ],
          },
          evidence: {
            source: ['MarketingAutomationExecution', 'MarketingAutomationTouch'],
            filters: ['executedAt=查询周期'],
            metricDefinition: 'automation_touch_success_rate 触达成功率。',
          },
        },
        {
          status: 'success',
          title: '多门店对比诊断',
          summary: 'Ami 一店表现最高。',
          data: {
            items: [
              {
                storeName: 'Ami 一店',
                salesAmountText: '¥5,000',
                orderCount: 1,
                arrivalRateText: '100%',
                lowStockCount: 1,
                storeRankScore: 88,
              },
            ],
          },
          evidence: {
            source: ['UserStore', 'Store', 'ProductOrder'],
            filters: ['storeId in 当前用户授权门店'],
            metricDefinition: 'store_rank_score 门店综合评分。',
          },
        },
      ],
      actions: [],
    };

    const html = renderToStaticMarkup(<AgentRunResultCard data={data} />);

    expect(html).toContain('供应商');
    expect(html).toContain('超期未到货');
    expect(html).toContain('平均交付天数');
    expect(html).toContain('推广页');
    expect(html).toContain('访问数');
    expect(html).toContain('微信');
    expect(html).toContain('触发人数');
    expect(html).toContain('触达率');
    expect(html).toContain('门店评分');
    expect(html).not.toContain('供应商订单明细');
    expect(html).toContain('销售额');
    expectNoInternalText(html);
  });
});
