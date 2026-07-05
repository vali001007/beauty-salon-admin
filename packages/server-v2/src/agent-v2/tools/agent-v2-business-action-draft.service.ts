import { Injectable } from '@nestjs/common';
import type { AgentEvidence, AgentToolExecutionContext, AgentToolResult } from '../../agent/agent.types.js';
import { PrismaService } from '../../prisma/prisma.service.js';

type StockOperationType = 'scrap_out' | 'manual_outbound' | 'stocktake' | 'adjustment';

@Injectable()
export class AgentV2BusinessActionDraftService {
  constructor(private readonly prisma: PrismaService) {}

  async execute(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const capabilityId = String(args.capabilityId ?? '');
    if (capabilityId === 'inventory.stock.operation.draft') return this.draftStockOperation(args, context);
    return {
      status: 'unsupported',
      title: '暂不支持的动作草稿',
      summary: `V2 动作草稿暂未支持 ${capabilityId || 'unknown'}。`,
      data: { capabilityId },
      evidence: this.evidence(['AgentV2CapabilityManifest'], '当前能力没有可执行动作草稿生成器。', [], 0),
      actions: [],
    };
  }

  private async draftStockOperation(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const question = String(args.question ?? '');
    const operationType = this.resolveStockOperationType(question);
    const quantity = this.extractQuantity(question);
    const productKeyword = this.extractProductKeyword(question);
    const candidates = productKeyword
      ? await (this.prisma as any).product.findMany({
          where: {
            storeId: context.storeId,
            OR: [{ name: { contains: productKeyword } }, { sku: { contains: productKeyword } }],
          },
          select: {
            id: true,
            sku: true,
            name: true,
            unit: true,
            specUnit: true,
            currentStock: true,
          },
          orderBy: { id: 'asc' },
          take: 5,
        })
      : [];
    const primaryProduct = Array.isArray(candidates) ? candidates[0] : null;
    const unit = quantity.unit || primaryProduct?.specUnit || primaryProduct?.unit || '';
    const actionDraft = {
      draftType: 'inventory_stock_operation',
      operationType,
      operationTypeLabel: this.stockOperationLabel(operationType),
      productId: primaryProduct?.id ?? null,
      productName: primaryProduct?.name ?? productKeyword ?? '待选择产品',
      sku: primaryProduct?.sku ?? '',
      quantity: quantity.value,
      quantityText: quantity.value ? `${quantity.value}${unit}` : '待填写数量',
      unit,
      reason: this.reasonFor(question, operationType),
      statusLabel: '待确认',
      approvalRequired: true,
      operatorSource: '当前登录用户',
    };
    const items = [
      {
        operationTypeLabel: actionDraft.operationTypeLabel,
        productName: actionDraft.productName,
        quantityText: actionDraft.quantityText,
        reason: actionDraft.reason,
        statusLabel: actionDraft.statusLabel,
      },
    ];
    const evidence = this.evidence(
      ['Product', 'StockMovementDraft'],
      '库存动作草稿 = 根据用户语义识别库存操作类型，并只读取 Product 候选项；不会直接写入 StockMovement。',
      [`storeId=${context.storeId}`, `operationType=${operationType}`, productKeyword ? `productKeyword=${productKeyword}` : 'productKeyword=未识别'],
      Array.isArray(candidates) ? candidates.length : 0,
      ['该能力只生成待确认草稿，不直接出库、报废、盘点或修改库存。'],
    );

    return {
      status: 'success',
      title: '库存操作草稿',
      summary: `已生成${actionDraft.operationTypeLabel}草稿：${actionDraft.productName}，${actionDraft.quantityText}；提交前需要人工确认。`,
      data: {
        actionDraft,
        items,
        candidates: (Array.isArray(candidates) ? candidates : []).map((product: any) => ({
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          currentStock: this.toNumber(product.currentStock),
          unit: product.specUnit ?? product.unit ?? '',
        })),
      },
      evidence,
      actions: [{ label: '提交库存审批', action: 'inventory:stock-operation-submit', riskLevel: 'medium' }],
    };
  }

  private resolveStockOperationType(question: string): StockOperationType {
    if (/报废|作废|损耗/.test(question)) return 'scrap_out';
    if (/盘点|盘盈|盘亏|校准/.test(question)) return 'stocktake';
    if (/出库|领用|消耗|扣减/.test(question)) return 'manual_outbound';
    return 'adjustment';
  }

  private extractQuantity(question: string) {
    const match = question.match(/(\d+(?:\.\d+)?)\s*(瓶|盒|片|支|个|包|袋|ml|g|kg|次)?/i);
    return {
      value: match ? Number(match[1]) : null,
      unit: match?.[2] ?? '',
    };
  }

  private extractProductKeyword(question: string) {
    const normalized = question.replace(/\s+/g, '');
    const match = normalized.match(/(?:报废|出库|领用|消耗|盘点|扣减)(?:一下|这批|一批|一些|过期|临期|库存|产品|商品|物料|耗材|的|了|：|:)*(?<name>[\u4e00-\u9fa5A-Za-z0-9_-]{2,20})/);
    const value = match?.groups?.name ?? '';
    const cleaned = value
      .replace(/草稿|记录|登记|处理|调整|数量|库存|产品|商品|耗材|物料/g, '')
      .replace(/^\d+(瓶|盒|片|支|个|包|袋|ml|g|kg|次)?/i, '');
    return cleaned || '';
  }

  private reasonFor(question: string, operationType: StockOperationType) {
    if (/过期|临期/.test(question)) return '过期或临期处理';
    if (/破损|损坏/.test(question)) return '破损处理';
    if (operationType === 'stocktake') return '盘点调整';
    if (operationType === 'manual_outbound') return '人工领用或服务消耗';
    return '人工确认后处理';
  }

  private stockOperationLabel(value: StockOperationType) {
    const map: Record<StockOperationType, string> = {
      scrap_out: '报废',
      manual_outbound: '出库',
      stocktake: '盘点调整',
      adjustment: '库存调整',
    };
    return map[value];
  }

  private evidence(source: string[], metricDefinition: string, filters: string[], sampleSize: number, limitations?: string[]): AgentEvidence {
    return {
      source,
      sourceTables: source,
      metricDefinition,
      filters,
      sampleSize,
      limitations: limitations ?? ['只生成动作草稿，不直接写入业务表。'],
    };
  }

  private toNumber(value: unknown) {
    const number = Number(value ?? 0);
    return Number.isFinite(number) ? number : 0;
  }
}
