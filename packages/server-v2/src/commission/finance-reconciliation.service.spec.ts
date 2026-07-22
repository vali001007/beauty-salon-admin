import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { CommissionService } from './commission.service.js';
import { FinanceReconciliationService } from './finance-reconciliation.service.js';

describe('FinanceReconciliationService', () => {
  let prisma: any;
  let commissionService: any;
  let service: FinanceReconciliationService;

  const settlement = {
    id: 31,
    storeId: 3,
    settleDate: '2026-07-13T00:00:00.000Z',
    status: 'draft',
    totalRevenue: 1000,
    cashRevenue: 200,
    wechatRevenue: 500,
    alipayRevenue: 300,
    cardRevenue: 0,
    balanceRevenue: 0,
    rechargeIncome: 0,
    refundAmount: 0,
    materialCost: 100,
    commissionTotal: 50,
    grossProfit: 850,
    grossMargin: 85,
    summary: { total: 1000, dataQuality: { status: 'complete' } },
  };

  beforeEach(() => {
    prisma = {
      dailySettlement: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
      dailySettlementSnapshot: {
        findFirst: jest.fn(),
      },
      financeReconciliationRun: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 71, status: 'running' }),
        update: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 71, ...data })),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      financeReconciliationIssue: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        upsert: jest.fn().mockImplementation(async ({ create }: any) => ({ id: 81, ...create })),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
      },
      dailySettlementAdjustment: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      financeAuditLog: { create: jest.fn() },
    };
    commissionService = {
      generateDailySettlement: jest.fn().mockResolvedValue(settlement),
      getReconciliationExceptions: jest.fn().mockResolvedValue({
        items: [{ type: 'daily_unconfirmed', severity: 'medium', title: '日结未确认', detail: '草稿', date: '2026-07-13' }],
      }),
      confirmDailySettlement: jest.fn().mockResolvedValue({ ...settlement, status: 'confirmed', version: 1 }),
    };
    service = new FinanceReconciliationService(prisma, commissionService);
  });

  it('resolves its runtime dependencies through the Nest container', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        FinanceReconciliationService,
        { provide: PrismaService, useValue: {} },
        { provide: CommissionService, useValue: {} },
      ],
    }).compile();

    expect(moduleRef.get(FinanceReconciliationService)).toBeInstanceOf(FinanceReconciliationService);
    await moduleRef.close();
  });

  it('auto confirms a clean daily settlement and ignores auto-healable draft warnings', async () => {
    const result = await service.runDailyClose(3, '2026-07-13', { triggerType: 'scheduled', autoConfirm: true });

    expect(commissionService.generateDailySettlement).toHaveBeenCalledWith(3, '2026-07-13');
    expect(commissionService.confirmDailySettlement).toHaveBeenCalledWith(
      31,
      undefined,
      3,
      expect.objectContaining({ confirmationMode: 'auto', reconciliationRunId: 71 }),
    );
    expect(result).toEqual(expect.objectContaining({ status: 'passed', autoConfirmed: true }));
  });

  it('assigns late facts to the Asia Shanghai business date instead of the UTC date', async () => {
    const occurredAt = new Date('2026-07-13T16:30:00.000Z');

    await service.runDailyClose(3, occurredAt, { triggerType: 'late_fact', autoConfirm: true });

    expect(commissionService.generateDailySettlement).toHaveBeenCalledWith(3, '2026-07-14');
  });

  it('keeps the settlement draft and persists a blocking cash-flow issue', async () => {
    commissionService.getReconciliationExceptions.mockResolvedValue({
      items: [{
        type: 'daily_amount_mismatch',
        severity: 'high',
        title: '日结金额不一致',
        detail: '支付差额 10 元',
        date: '2026-07-13',
        amountDiff: 10,
        actionTarget: 'daily',
      }],
    });

    const result = await service.runDailyClose(3, '2026-07-13', { triggerType: 'scheduled', autoConfirm: true });

    expect(commissionService.confirmDailySettlement).not.toHaveBeenCalled();
    expect(prisma.financeReconciliationIssue.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ code: 'daily_amount_mismatch', category: 'operating_exception', status: 'open' }),
    }));
    expect(result).toEqual(expect.objectContaining({ status: 'blocked', blockingIssueCount: 1 }));
  });

  it('auto confirms when only profit quality warnings exist', async () => {
    commissionService.generateDailySettlement.mockResolvedValue({
      ...settlement,
      summary: { ...settlement.summary, dataQuality: { status: 'partial', missingBomCount: 2 } },
      dataQuality: { status: 'partial', missingBomCount: 2 },
    });

    const result = await service.runDailyClose(3, '2026-07-13', { triggerType: 'scheduled', autoConfirm: true });

    expect(prisma.financeReconciliationIssue.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ code: 'profit_data_quality_warning', severity: 'low' }),
    }));
    expect(commissionService.confirmDailySettlement).toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ status: 'warning', autoConfirmed: true, blockingIssueCount: 0 }));
  });

  it('does not auto confirm when an applied manual adjustment exists', async () => {
    prisma.dailySettlementAdjustment.findMany.mockResolvedValue([{ effectField: 'cashRevenue', amount: 10, status: 'applied' }]);

    const result = await service.runDailyClose(3, '2026-07-13', { triggerType: 'scheduled', autoConfirm: true });

    expect(commissionService.confirmDailySettlement).not.toHaveBeenCalled();
    expect(prisma.financeReconciliationIssue.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ code: 'manual_adjustment_pending', category: 'operating_exception' }),
    }));
    expect(result.status).toBe('blocked');
  });

  it('returns the existing completed run for the same source digest without another confirmation', async () => {
    prisma.financeReconciliationRun.findUnique.mockResolvedValue({
      id: 70,
      status: 'passed',
      summary: { autoConfirmed: true, blockingIssueCount: 0, warningCount: 0 },
    });

    const result = await service.runDailyClose(3, '2026-07-13', { triggerType: 'scheduled', autoConfirm: true });

    expect(prisma.financeReconciliationRun.create).not.toHaveBeenCalled();
    expect(commissionService.confirmDailySettlement).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ id: 70, status: 'passed' }));
  });

  it('creates an adjustment ledger entry and keeps system and final amounts separate', async () => {
    prisma.dailySettlement.findUnique.mockResolvedValue(settlement);
    prisma.dailySettlementAdjustment.create.mockResolvedValue({
      id: 91,
      dailySettlementId: 31,
      storeId: 3,
      effectField: 'cashRevenue',
      amount: 20,
      status: 'applied',
      createdBy: 9,
    });
    prisma.dailySettlementAdjustment.findMany.mockResolvedValue([{ effectField: 'cashRevenue', amount: 20, status: 'applied' }]);
    prisma.dailySettlement.update.mockImplementation(async ({ data }: any) => ({ ...settlement, ...data }));

    const result = await service.createAdjustment(31, {
      adjustmentType: 'cash_correction',
      effectField: 'cashRevenue',
      amount: 20,
      reason: '补录当班现金盘点差额',
      voucherNo: 'V-001',
    }, { userId: 9, storeIds: [3], roles: ['store_finance'], permissions: ['core:finance:manage'] });

    expect(prisma.dailySettlementAdjustment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ dailySettlementId: 31, storeId: 3, createdBy: 9, amount: 20 }),
    });
    expect(prisma.dailySettlement.update).toHaveBeenCalledWith({
      where: { id: 31 },
      data: expect.objectContaining({
        systemSummary: expect.objectContaining({ cashRevenue: 200 }),
        adjustmentSummary: expect.objectContaining({ cashRevenue: 20 }),
        finalSummary: expect.objectContaining({ cashRevenue: 220 }),
        cashRevenue: 220,
        reconciliationStatus: 'blocked',
      }),
    });
    expect(result).toEqual(expect.objectContaining({ adjustment: expect.objectContaining({ id: 91 }) }));
  });

  it('allows manual confirmation with an adjustment but refuses unresolved data integrity failures', async () => {
    prisma.dailySettlement.findUnique.mockResolvedValue(settlement);
    prisma.financeReconciliationIssue.findMany.mockResolvedValue([
      { id: 82, code: 'refund_without_items', category: 'data_integrity', status: 'open' },
    ]);

    await expect(service.confirmDailySettlementManually(31, {
      userId: 9,
      storeIds: [3],
      roles: ['store_finance'],
      permissions: ['core:finance:manage'],
    })).rejects.toThrow('数据完整性故障');
    expect(commissionService.confirmDailySettlement).not.toHaveBeenCalled();

    prisma.financeReconciliationIssue.findMany.mockResolvedValue([
      { id: 83, code: 'manual_adjustment_pending', category: 'operating_exception', status: 'open' },
    ]);
    commissionService.confirmDailySettlement.mockResolvedValue({ ...settlement, status: 'confirmed', confirmationMode: 'manual' });

    const result = await service.confirmDailySettlementManually(31, {
      userId: 9,
      storeIds: [3],
      roles: ['store_finance'],
      permissions: ['core:finance:manage'],
    });

    expect(commissionService.confirmDailySettlement).toHaveBeenCalledWith(31, 9, 3, { confirmationMode: 'manual' });
    expect(prisma.financeReconciliationIssue.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ dailySettlementId: 31, code: 'manual_adjustment_pending' }),
    }));
    expect(result.status).toBe('confirmed');
  });

  it('persists an automation failure issue when daily close generation fails', async () => {
    commissionService.generateDailySettlement.mockRejectedValue(new Error('metrics unavailable'));
    prisma.financeReconciliationRun.upsert = jest.fn().mockResolvedValue({ id: 72, status: 'failed' });

    const result = await service.runDailyClose(3, '2026-07-13', { triggerType: 'scheduled', autoConfirm: true });

    expect(prisma.financeReconciliationRun.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ storeId: 3, status: 'failed', errorMessage: 'metrics unavailable' }),
    }));
    expect(prisma.financeReconciliationIssue.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ runId: 72, code: 'auto_task_failure', category: 'automation_failure', status: 'open' }),
    }));
    expect(result).toEqual(expect.objectContaining({ id: 72, status: 'failed', autoConfirmed: false }));
  });

  it('does not leave a confirmed settlement reopened when a duplicate late fact is replayed', async () => {
    prisma.dailySettlement.findUnique.mockResolvedValue({ ...settlement, status: 'confirmed', confirmedBy: 7, confirmationMode: 'auto' });
    prisma.financeReconciliationRun.findUnique.mockResolvedValue({ id: 70, status: 'passed', summary: { autoConfirmed: true } });
    prisma.dailySettlementSnapshot.findFirst.mockResolvedValue({ confirmedBy: null, confirmedAt: new Date('2026-07-14T01:00:00.000Z'), confirmationMode: 'auto' });

    const result = await service.runDailyClose(3, '2026-07-13', { triggerType: 'late_fact', autoConfirm: true });

    expect(prisma.dailySettlement.update).toHaveBeenLastCalledWith({
      where: { id: 31 },
      data: expect.objectContaining({ status: 'confirmed', confirmationMode: 'auto' }),
    });
    expect(commissionService.confirmDailySettlement).not.toHaveBeenCalled();
    expect(result.id).toBe(70);
  });

  it('rejects cross-store access to reconciliation issues and daily adjustments', async () => {
    prisma.financeReconciliationIssue.findUnique.mockResolvedValue({ id: 81, storeId: 4, status: 'open' });
    prisma.dailySettlement.findUnique.mockResolvedValue({ ...settlement, storeId: 4 });
    const context = { userId: 9, storeIds: [3], roles: ['store_finance'], permissions: ['core:finance:manage'] };

    await expect(service.acknowledgeIssue(81, context)).rejects.toThrow('无权访问该门店');
    await expect(service.createAdjustment(31, {
      adjustmentType: 'cash_correction',
      effectField: 'cashRevenue',
      amount: 10,
      reason: '补录现金差额凭证',
    }, context)).rejects.toThrow('无权访问该门店');

    expect(prisma.financeReconciliationIssue.update).not.toHaveBeenCalled();
    expect(prisma.dailySettlementAdjustment.create).not.toHaveBeenCalled();
  });
});
