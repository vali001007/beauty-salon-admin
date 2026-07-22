import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BrainInspectionRepairPreviewService } from './brain-inspection-repair-preview.service.js';

describe('BrainInspectionRepairPreviewService', () => {
  const prisma = {
    brainInspectionFinding: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };
  const service = new BrainInspectionRepairPreviewService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['reception_in_store_state_stale', { status: 'checked_in' }, ['actualStatus']],
    ['service_task_state_inconsistent', { status: 'in_progress', startedAt: null, completedAt: null }, ['actualStatus', 'startedAt', 'completedAt']],
    ['inventory_safety_stock_invalid', { safetyStock: 0, currentStock: -1, minPurchaseQty: -2 }, ['safetyStock', 'currentStock', 'minPurchaseQty']],
    ['procurement_evidence_missing', { supplierName: null, unitPrice: null }, ['supplierName', 'unitPrice']],
  ])('builds a preview-only contract for %s', async (ruleKey, evidence, expectedKeys) => {
    prisma.brainInspectionFinding.findFirst.mockResolvedValueOnce(finding({ ruleKey, evidence }));

    const preview = await service.getPreview({ storeId: 6, findingId: 21 });

    expect(preview.changes.map((item) => item.inputKey)).toEqual(expectedKeys);
    expect(preview.policy).toEqual({
      mode: 'preview_only',
      autoExecute: false,
      createsBusinessWrite: false,
      requiresSeparateBusinessAction: true,
    });
    expect(preview.previewFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(prisma.brainInspectionFinding.update).not.toHaveBeenCalled();
  });

  it('records approval as governance metadata without executing a business write', async () => {
    prisma.brainInspectionFinding.findFirst.mockResolvedValueOnce(finding());
    prisma.brainInspectionFinding.update.mockImplementationOnce(({ data }) => ({ id: 21, ...data }));

    const result = await service.recordDecision({
      storeId: 6,
      findingId: 21,
      userId: 9,
      decision: 'approve',
      note: '已确认进入商品资料维护',
    });

    expect(result).toMatchObject({
      decision: 'approve',
      status: 'in_progress',
      nextAction: { type: 'open_business_screen', entry: '/inventory/products', autoExecute: false },
    });
    expect(prisma.brainInspectionFinding.update).toHaveBeenCalledWith({
      where: { id: 21, storeId: 6 },
      data: expect.objectContaining({
        disposition: 'adopted',
        status: 'in_progress',
        resolvedAt: null,
        suggestion: expect.objectContaining({
          repairReview: expect.objectContaining({
            decision: 'approve',
            executionStatus: 'not_executed',
            reviewedBy: 9,
          }),
        }),
      }),
    });
  });

  it('accepts only declared modification fields', async () => {
    prisma.brainInspectionFinding.findFirst.mockResolvedValue(finding());
    prisma.brainInspectionFinding.update.mockImplementation(({ data }) => ({ id: 21, ...data }));

    await expect(service.recordDecision({
      storeId: 6,
      findingId: 21,
      userId: 9,
      decision: 'modify',
      modifications: { safetyStock: 12 },
    })).resolves.toMatchObject({ decision: 'modify', status: 'in_progress' });

    await expect(service.recordDecision({
      storeId: 6,
      findingId: 21,
      userId: 9,
      decision: 'modify',
      modifications: { storeId: 99 },
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('closes a rejected preview without executing anything', async () => {
    prisma.brainInspectionFinding.findFirst.mockResolvedValueOnce(finding());
    prisma.brainInspectionFinding.update.mockImplementationOnce(({ data }) => ({ id: 21, ...data }));

    await expect(service.recordDecision({
      storeId: 6,
      findingId: 21,
      userId: 9,
      decision: 'reject',
    })).resolves.toMatchObject({ decision: 'reject', status: 'closed', nextAction: null });
    expect(prisma.brainInspectionFinding.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ disposition: 'ignored', status: 'closed' }),
    }));
  });

  it('fails closed for a cross-store or missing finding', async () => {
    prisma.brainInspectionFinding.findFirst.mockResolvedValueOnce(null);
    await expect(service.getPreview({ storeId: 6, findingId: 999 })).rejects.toBeInstanceOf(NotFoundException);
  });
});

function finding(overrides: Record<string, unknown> = {}) {
  return {
    id: 21,
    storeId: 6,
    ruleKey: 'inventory_safety_stock_invalid',
    title: '商品安全库存无效',
    severity: 'high',
    objectType: 'product',
    objectId: '88',
    evidence: { safetyStock: 0, currentStock: 4, minPurchaseQty: 1 },
    suggestion: { action: '补齐安全库存', entry: '/inventory/products' },
    status: 'open',
    ...overrides,
  };
}
