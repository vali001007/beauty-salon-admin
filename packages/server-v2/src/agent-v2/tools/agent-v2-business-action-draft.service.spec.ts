import type { PrismaService } from '../../prisma/prisma.service.js';
import { AgentV2BusinessActionDraftService } from './agent-v2-business-action-draft.service.js';

describe('AgentV2BusinessActionDraftService', () => {
  it('creates an inventory stock operation draft without writing stock movement', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 9, sku: 'MASK-001', name: '舒缓修护面膜', unit: '片', specUnit: '片', currentStock: 12 },
    ]);
    const create = jest.fn();
    const service = new AgentV2BusinessActionDraftService({
      product: { findMany },
      stockMovement: { create },
    } as unknown as PrismaService);

    const result = await service.execute(
      { capabilityId: 'inventory.stock.operation.draft', question: '帮我报废2片舒缓修护面膜' },
      { runId: 1, storeId: 6, role: 'manager', userId: 1 },
    );

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ storeId: 6 }),
      take: 5,
    }));
    expect(create).not.toHaveBeenCalled();
    expect(result.status).toBe('success');
    expect((result.data as any).actionDraft).toMatchObject({
      draftType: 'inventory_stock_operation',
      operationType: 'scrap_out',
      productId: 9,
      productName: '舒缓修护面膜',
      quantity: 2,
      approvalRequired: true,
    });
    expect(result.actions?.[0]).toMatchObject({
      label: '提交库存审批',
      action: 'inventory:stock-operation-submit',
      riskLevel: 'medium',
    });
    expect(result.evidence?.metricDefinition).toContain('不会直接写入 StockMovement');
  });
});
