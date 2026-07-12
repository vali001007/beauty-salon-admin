import { ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { BrainDateRange } from '../../cognition/brain-time-range-parser.service.js';
import { BrainTimeRangeParserService } from '../../cognition/brain-time-range-parser.service.js';
import { BrainSkillRuntimeService } from '../../skills/brain-skill-runtime.service.js';
import type { BrainDomainAdapter, BrainDomainAdapterExecution, BrainDomainAnswer } from '../brain-domain-adapter.types.js';
import { defaultBrainDateRange, formatBrainMoney } from '../brain-domain-formatters.js';
import { BrainActionConfirmationService } from '../../skills/brain-action-confirmation.service.js';

@Injectable()
export class BrainInventoryDomainAdapter implements BrainDomainAdapter {
  readonly key = 'inventory_procurement' as const;
  readonly role = 'inventory' as const;
  readonly requiredPermissions = ['core:inventory:stock'];

  constructor(
    private readonly skillRuntime: BrainSkillRuntimeService,
    private readonly timeRangeParser: BrainTimeRangeParserService,
    @Optional() private readonly actionConfirmation?: BrainActionConfirmationService,
  ) {}

  canHandle(plan: BrainDomainAdapterExecution['plan']) {
    return plan.adapterKey === this.key;
  }

  async execute(input: BrainDomainAdapterExecution): Promise<BrainDomainAnswer | undefined> {
    const message = input.dto.message;
    if (/(临期|过期|快过期).*(怎么|如何|处理|规定|办法|方案|消化|优惠|减少|合适)/.test(message)) {
      return {
        status: 'completed' as const,
        answer: this.skillRuntime.composeInventoryDisposalAdvice(),
        citations: [{ sourceType: 'skill', sourceId: 'inventory_disposal_advice', label: '临期过期处理建议' }],
        grounding: 'template_skill' as const,
        metadata: { adapterKey: this.key },
      };
    }

    const range = this.resolveRange(message);
    if (/(采购|补货|供应商|报价|交货|物流|买多少|下单|采购了什么|采购.*花了多少)/.test(message)) {
      const analysis = await this.skillRuntime.buildInventoryProcurementAnalysis({
        storeId: input.context.storeId,
        keyword: this.extractProductKeyword(message),
      });
      const suggestionLines = analysis.suggestions.length
        ? analysis.suggestions
            .slice(0, 12)
            .map(
              (item, index) =>
                `${index + 1}. ${item.productName}：当前 ${item.currentStock}，安全库存 ${item.safetyStock}，建议采购 ${item.suggestedQty}${item.supplierName ? `；候选 ${item.supplierName}` : '；暂无已映射供应商报价'}${item.unitPrice != null ? `，单价 ${formatBrainMoney(item.unitPrice)}` : ''}${item.estimatedCost != null ? `，预计 ${formatBrainMoney(item.estimatedCost)}` : ''}${item.leadDays != null ? `，交期约 ${item.leadDays} 天` : ''}。`,
            )
            .join('\n')
        : '当前没有命中需要补货或可报价的产品。';
      const orderLines = analysis.recentOrders.length
        ? analysis.recentOrders
            .slice(0, 8)
            .map((item, index) => `${index + 1}. ${item.createdAt} ${item.orderNo}，${item.supplierName}，${formatBrainMoney(item.amount)}，${item.status}。`)
            .join('\n')
        : '当前门店没有采购订单记录。';
      if (/(创建|生成|新建|提交|下单).*(采购单|采购订单)|采购单.*(创建|生成|提交|审批)/.test(message)) {
        return this.previewPurchaseOrder(input, analysis);
      }
      return {
        status: 'completed',
        answer: `采购与供应商分析：\n${suggestionLines}\n最近采购：\n${orderLines}\n建议数量按“补到约 2 倍安全库存、最低采购量和报价 MOQ 取最大值”计算；提交采购前仍需人工确认库存占用和预算。`,
        citations: [{ sourceType: 'skill', sourceId: 'inventory_procurement_analysis', label: '采购数量、报价与供应商分析' }],
        grounding: 'db_skill',
        metadata: { adapterKey: this.key, rangeLabel: range.label },
      };
    }
    if (/(库存整体|库存金额|库存货值|还有多少|库存加起来|用了多少|用量|消耗|够用多久|够用多少|周转|进出库|需求突然增加|系列产品|精华液|洗面奶|防晒产品|仓库里有多少货|有什么产品可以卖|产品可以卖)/.test(message)) {
      const detail = await this.skillRuntime.buildInventoryDetailAnalysis({
        storeId: input.context.storeId,
        startDate: range.startDate,
        endDate: range.endDate,
        keyword: this.extractProductKeyword(message),
      });
      const productLines = detail.products.length
        ? detail.products
            .slice(0, 12)
            .map(
              (item, index) =>
                `${index + 1}. ${item.name}（${item.sku}）：库存 ${item.stock}，安全库存 ${item.safetyStock}，本期入库 ${item.inboundQty}、出库/消耗 ${item.outboundQty}，货值 ${formatBrainMoney(item.stockValue)}${item.coverageDays != null ? `，预计覆盖 ${item.coverageDays} 天` : ''}。`,
            )
            .join('\n')
        : '当前门店没有找到匹配产品。';
      const movementLines = detail.movements.length
        ? detail.movements
            .slice(0, 10)
            .map((item, index) => `${index + 1}. ${item.occurredAt.slice(0, 16).replace('T', ' ')} ${item.productName} ${item.type} ${item.quantity}`)
            .join('\n')
        : '当前时间范围没有进出库记录。';
      return {
        status: 'completed',
        answer: `库存明细：共 ${detail.totalSku} 个 SKU，当前估算库存货值 ${formatBrainMoney(detail.totalStockValue)}。\n${productLines}\n进出库记录：\n${movementLines}`,
        citations: [{ sourceType: 'skill', sourceId: 'inventory_detail_analysis', label: '库存 SKU、消耗与进出库分析' }],
        grounding: 'db_skill',
        metadata: { adapterKey: this.key, rangeLabel: range.label },
      };
    }
    const summary = await this.skillRuntime.buildInventoryRiskSummary({
      storeId: input.context.storeId,
      expiringBefore: range.endDate,
    });
    if (/(采购|补货|要买什么|补什么货|采购.*清单|马上采购|需要.*采购)/.test(message)) {
      const lines =
        summary.lowStockProducts.length > 0
          ? summary.lowStockProducts
              .slice(0, 10)
              .map((item, index) => `${index + 1}. ${item.name}：当前 ${item.currentStock}，安全库存 ${item.safetyStock}，建议人工复核后补货。`)
              .join('\n')
          : '1. 当前没有低于安全库存的产品。';
      return {
        status: 'completed' as const,
        answer: `采购建议清单：\n${lines}\n${summary.suggestedAction}`,
        citations: [{ sourceType: 'skill', sourceId: 'inventory_risk_summary', label: '库存采购建议' }],
        grounding: 'db_skill' as const,
        metadata: { adapterKey: this.key, rangeLabel: range.label },
      };
    }

    const lowStockLines =
      summary.lowStockProducts.length > 0
        ? summary.lowStockProducts
            .slice(0, 10)
            .map((item, index) => `${index + 1}. ${item.name}：当前 ${item.currentStock}，安全库存 ${item.safetyStock}。`)
            .join('\n')
        : '当前没有低于安全库存的产品。';
    const expiryLines =
      summary.expiringProducts.length > 0
        ? summary.expiringProducts
            .slice(0, 10)
            .map((item, index) => `${index + 1}. ${item.name}：剩余 ${item.stock}，到期日 ${item.expiryDate ?? '未记录'}，估算货值 ${formatBrainMoney(item.estimatedValue)}。`)
            .join('\n')
        : '当前没有命中临期或过期库存批次。';
    return {
      status: 'completed' as const,
      answer: /(临期|过期|快过期)/.test(message)
        ? `临期/过期库存清单：\n${expiryLines}\n临期库存金额 ${formatBrainMoney(summary.expiringStockValue)}。`
        : `低库存产品：\n${lowStockLines}\n临期库存金额 ${formatBrainMoney(summary.expiringStockValue)}。${summary.suggestedAction}`,
      citations: [{ sourceType: 'skill', sourceId: 'inventory_risk_summary', label: '库存风险摘要' }],
      grounding: 'db_skill' as const,
      metadata: { adapterKey: this.key, rangeLabel: range.label },
    };
  }

  private async previewPurchaseOrder(
    input: BrainDomainAdapterExecution,
    analysis: Awaited<ReturnType<BrainSkillRuntimeService['buildInventoryProcurementAnalysis']>>,
  ): Promise<BrainDomainAnswer> {
    if (!input.context.permissions.includes('*') && !input.context.permissions.includes('core:supply:manage')) {
      throw new ForbiddenException('missing_permission:core:supply:manage');
    }
    if (!this.actionConfirmation) return this.actionClarification('动作确认服务未就绪，请稍后重试。');
    const first = analysis.suggestions.find((item) => item.supplierName && item.unitPrice != null && item.suggestedQty > 0);
    if (!first?.supplierName) return this.actionClarification('当前采购建议缺少已映射供应商或有效报价，不能生成采购单。');
    const items = analysis.suggestions
      .filter((item) => item.supplierName === first.supplierName && item.unitPrice != null && item.suggestedQty > 0)
      .map((item) => ({
        productId: item.productId,
        productName: item.productName,
        sku: item.sku,
        quantity: item.suggestedQty,
        unitPrice: item.unitPrice!,
      }));
    if (!items.length) return this.actionClarification('当前没有同时具备产品、数量、供应商和报价的采购项。');
    const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const submitForApproval = /提交|审批/.test(input.dto.message);
    const summary = `${submitForApproval ? '创建并提交审批' : '创建草稿'}：供应商 ${first.supplierName}，${items.length} 个 SKU，预计 ${formatBrainMoney(totalAmount)}`;
    const confirmation = await this.actionConfirmation.createPreview({
      runId: input.runId,
      userId: input.context.userId,
      storeId: input.context.storeId,
      skillKey: 'create_purchase_order',
      riskLevel: 'high',
      preview: {
        actionType: 'create_purchase_order',
        summary,
        riskLevel: 'high',
        amount: totalAmount,
        impactItems: items.map((item) => ({ objectType: 'product', objectId: String(item.productId), label: `${item.productName} x ${item.quantity}` })),
      } as Prisma.InputJsonValue,
      payload: {
        supplier: first.supplierName,
        items,
        submitForApproval,
        sourceMessage: input.dto.message,
      } as Prisma.InputJsonValue,
    });
    return {
      status: 'completed',
      answer: `采购单预览：${summary}。确认后将通过采购业务服务创建，不会直接修改库存。`,
      citations: [{ sourceType: 'skill', sourceId: 'inventory_purchase_order_preview', label: '采购单执行预览' }],
      suggestedActions: [{
        actionId: confirmation.actionId,
        actionType: 'create_purchase_order',
        riskLevel: 'high',
        requiresConfirmation: true,
        summary,
      }],
      grounding: 'preview_action',
      metadata: { adapterKey: this.key, amount: totalAmount },
    };
  }

  private actionClarification(answer: string): BrainDomainAnswer {
    return {
      status: 'completed',
      answer,
      citations: [],
      suggestedActions: [],
      grounding: 'none',
      metadata: { adapterKey: this.key, unsupportedReason: 'purchase_action_requires_complete_quote' },
    };
  }

  private resolveRange(message: string): BrainDateRange {
    const parsed = this.timeRangeParser.parse(message);
    return parsed.range ?? defaultBrainDateRange();
  }

  private extractProductKeyword(message: string) {
    const candidates = ['洗面奶', '精华液', '补水', '防晒', '一次性耗材', '理疗仪器耗材', '护肤品'];
    return candidates.find((candidate) => message.includes(candidate));
  }
}
