import { NotFoundException } from '@nestjs/common';
import { AgentAutomationService } from './agent-automation.service.js';

describe('AgentAutomationService', () => {
  let prisma: any;
  let service: AgentAutomationService;

  beforeEach(() => {
    prisma = {
      agentAutomationDefinition: {
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      agentAutomationRun: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      agentAutomationEffect: {
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
      },
    };
    service = new AgentAutomationService(prisma);
  });

  it('exposes ten built-in beauty store automation triggers', () => {
    const triggers = service.listTriggerTemplates();

    expect(triggers).toHaveLength(10);
    expect(triggers.map((item) => item.code)).toEqual([
      'dormant_customer',
      'high_value_customer_arrival',
      'course_consumption_due',
      'inventory_stockout',
      'inventory_expiring',
      'campaign_low_conversion',
      'staff_exception',
      'reservation_exception',
      'finance_exception',
      'complaint_bad_review',
    ]);
    expect(triggers.find((item) => item.code === 'finance_exception')?.approvalPolicy.required).toBe(true);
  });

  it('creates a draft automation without executing external touch', async () => {
    prisma.agentAutomationDefinition.create.mockResolvedValue({ id: 1, status: 'draft' });

    await service.createDraft({
      storeId: 6,
      userId: 2,
      personaCode: 'marketing',
      goal: '沉睡客户自动召回',
      sourceRunId: 88,
    });

    expect(prisma.agentAutomationDefinition.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storeId: 6,
        personaCode: 'marketing',
        triggerType: 'dormant_customer',
        status: 'draft',
        sourceRunId: 88,
        createdBy: 2,
        riskLevel: 'medium',
        approvalPolicyJson: expect.objectContaining({ required: true }),
      }),
    });
  });

  it('records high-risk manual run as waiting approval', async () => {
    prisma.agentAutomationDefinition.findFirst.mockResolvedValue({
      id: 9,
      storeId: 6,
      personaCode: 'finance',
      triggerType: 'finance_exception',
      riskLevel: 'high',
      actionPlanJson: { steps: [] },
      approvalPolicyJson: { required: true },
    });
    prisma.agentAutomationRun.create.mockResolvedValue({ id: 21, status: 'waiting_approval' });
    prisma.agentAutomationEffect.create.mockResolvedValue({ id: 31, status: 'pending' });
    prisma.agentAutomationDefinition.update.mockResolvedValue({});

    const result = await service.runOnce({ storeId: 6, userId: 2, definitionId: 9 });

    expect(result.approvalRequired).toBe(true);
    expect(prisma.agentAutomationRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        definitionId: 9,
        storeId: 6,
        personaCode: 'finance',
        triggerType: 'finance_exception',
        mode: 'manual',
        status: 'waiting_approval',
        completedAt: null,
      }),
    });
    expect(prisma.agentAutomationEffect.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        definitionId: 9,
        runId: 21,
        effectType: 'approval_required',
        status: 'pending',
      }),
    });
  });

  it('throws when running an automation outside current store', async () => {
    prisma.agentAutomationDefinition.findFirst.mockResolvedValue(null);

    await expect(service.runOnce({ storeId: 6, definitionId: 100 })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.agentAutomationRun.create).not.toHaveBeenCalled();
  });

  it('runs due scheduled automations as safe dry-run triggers', async () => {
    prisma.agentAutomationDefinition.findMany
      .mockResolvedValueOnce([
        {
          id: 11,
          storeId: 6,
          triggerType: 'inventory_stockout',
          status: 'enabled',
          riskLevel: 'medium',
          scheduleJson: { mode: 'daily' },
          actionPlanJson: { steps: [] },
          approvalPolicyJson: { required: true },
          lastTriggeredAt: null,
        },
      ]);
    prisma.agentAutomationDefinition.findFirst.mockResolvedValue({
      id: 11,
      storeId: 6,
      triggerType: 'inventory_stockout',
      status: 'enabled',
      riskLevel: 'medium',
      actionPlanJson: { steps: [] },
      approvalPolicyJson: { required: true },
    });
    prisma.agentAutomationRun.create.mockResolvedValue({ id: 41, status: 'dry_run_completed' });
    prisma.agentAutomationEffect.create.mockResolvedValue({ id: 42 });
    prisma.agentAutomationDefinition.update.mockResolvedValue({});

    const result = await service.runDueAutomations({ storeId: 6, userId: 2, now: '2026-06-26T09:00:00Z' });

    expect(result.triggeredCount).toBe(1);
    expect(prisma.agentAutomationRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        mode: 'scheduled',
        status: 'dry_run_completed',
        inputJson: expect.objectContaining({ dryRun: true }),
      }),
    });
  });

  it('evaluates event and threshold triggers', async () => {
    prisma.agentAutomationDefinition.findMany.mockResolvedValue([
      {
        id: 12,
        storeId: 6,
        triggerType: 'finance_exception',
        status: 'enabled',
        riskLevel: 'high',
        triggerConfigJson: { metricKey: 'refund_amount', greaterThan: 1000 },
        actionPlanJson: { steps: [] },
        approvalPolicyJson: { required: true },
      },
    ]);
    prisma.agentAutomationDefinition.findFirst.mockResolvedValue({
      id: 12,
      storeId: 6,
      triggerType: 'finance_exception',
      status: 'enabled',
      riskLevel: 'high',
      actionPlanJson: { steps: [] },
      approvalPolicyJson: { required: true },
    });
    prisma.agentAutomationRun.create.mockResolvedValue({ id: 51, status: 'dry_run_completed' });
    prisma.agentAutomationEffect.create.mockResolvedValue({ id: 52 });
    prisma.agentAutomationDefinition.update.mockResolvedValue({});

    const result = await service.evaluateEvent({
      storeId: 6,
      userId: 2,
      eventType: 'metric_threshold',
      payload: { metricKey: 'refund_amount', value: 1200 },
    });

    expect(result.matchedCount).toBe(1);
    expect(prisma.agentAutomationRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        mode: 'event',
        inputJson: expect.objectContaining({
          input: expect.objectContaining({ eventType: 'metric_threshold' }),
        }),
      }),
    });
  });

  it('approves waiting automation run and records an approval effect', async () => {
    prisma.agentAutomationRun.findFirst.mockResolvedValue({
      id: 61,
      definitionId: 12,
      storeId: 6,
      status: 'waiting_approval',
      outputJson: { summary: '待确认' },
    });
    prisma.agentAutomationRun.update.mockResolvedValue({ id: 61, status: 'completed' });
    prisma.agentAutomationEffect.create.mockResolvedValue({ id: 62, effectType: 'approval_approved' });

    const result = await service.decideRunApproval({ storeId: 6, userId: 2, runId: 61, decision: 'approve' });

    expect(result.approved).toBe(true);
    expect(prisma.agentAutomationRun.update).toHaveBeenCalledWith({
      where: { id: 61 },
      data: expect.objectContaining({ status: 'completed', completedAt: expect.any(Date) }),
    });
    expect(prisma.agentAutomationEffect.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ effectType: 'approval_approved', status: 'recorded' }),
    });
  });

  it('pauses automation when consecutive failures reach fuse threshold', async () => {
    prisma.agentAutomationDefinition.findFirst.mockResolvedValue({ id: 12, storeId: 6, status: 'enabled' });
    prisma.agentAutomationRun.findMany.mockResolvedValue([
      { id: 1, status: 'failed' },
      { id: 2, status: 'failed' },
      { id: 3, status: 'failed' },
    ]);
    prisma.agentAutomationDefinition.update.mockResolvedValue({ id: 12, status: 'paused' });
    prisma.agentAutomationEffect.create.mockResolvedValue({ id: 71, effectType: 'fuse_paused' });

    const result = await service.recoverDefinition({ storeId: 6, userId: 2, definitionId: 12, maxFailures: 3 });

    expect(result.status).toBe('paused');
    expect(prisma.agentAutomationDefinition.update).toHaveBeenCalledWith({
      where: { id: 12 },
      data: { status: 'paused' },
    });
  });

  it('records attribution effect without mutating business data', async () => {
    prisma.agentAutomationEffect.create.mockResolvedValue({ id: 81, status: 'attributed' });

    await service.recordAttribution({
      storeId: 6,
      userId: 2,
      definitionId: 12,
      runId: 61,
      objectType: 'marketing_activity',
      objectId: 99,
      customerId: 1001,
      metricKey: 'attributed_revenue',
      impact: { revenue: 399 },
    });

    expect(prisma.agentAutomationEffect.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        definitionId: 12,
        runId: 61,
        storeId: 6,
        effectType: 'attribution',
        objectType: 'marketing_activity',
        objectId: 99,
        customerId: 1001,
        metricKey: 'attributed_revenue',
        status: 'attributed',
      }),
    });
  });

  it('returns empty automation list when automation tables are not migrated', async () => {
    prisma.agentAutomationDefinition.findMany.mockRejectedValue({ code: 'P2021', meta: { table: 'agent_automation_definitions' } });

    const result = await service.listDefinitions({ storeId: 6, personaCode: 'marketing' });

    expect(result).toEqual(expect.objectContaining({
      items: [],
      total: 0,
      migrationPending: true,
      reason: 'agent_automation_schema_pending',
    }));
  });

  it('returns empty scheduled run result when automation table is not migrated', async () => {
    prisma.agentAutomationDefinition.findMany.mockRejectedValue({ code: 'P2021', meta: { table: 'agent_automation_definitions' } });

    const result = await service.runDueAutomations({ storeId: 6, now: '2026-06-26T09:00:00Z' });

    expect(result).toEqual(expect.objectContaining({
      checkedCount: 0,
      triggeredCount: 0,
      migrationPending: true,
    }));
  });

  it('throws a clear unavailable error when creating draft before migration', async () => {
    prisma.agentAutomationDefinition.create.mockRejectedValue({ code: 'P2021', meta: { table: 'agent_automation_definitions' } });

    await expect(service.createDraft({ storeId: 6, goal: '沉睡客户自动召回' })).rejects.toThrow('Agent 自动化表尚未迁移');
  });
});
