import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { BrainController } from './brain.controller.js';
import { BrainContextService } from './context/brain-context.service.js';

describe('BrainController', () => {
  const contextService = new BrainContextService();
  const chatService = {
    createConversation: jest.fn(),
    listConversations: jest.fn(),
    sendMessage: jest.fn(),
    listMessages: jest.fn(),
    listRunEvents: jest.fn(),
  };
  const controller = new BrainController(contextService, chatService as never);

  const request = {
    headers: {
      'x-store-id': '2',
      'x-request-id': 'req_test',
    },
    user: {
      id: 9,
      permissions: ['core:brain:use'],
      deniedPermissions: [],
      storeIds: [2],
    },
  } as never;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('activates permission checks for every brain endpoint', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, BrainController) ?? [];

    expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard, PermissionsGuard]));
  });

  it('creates a conversation through the real chat service with injected store context', async () => {
    chatService.createConversation.mockResolvedValue({ id: 42, title: '晨会经营复盘', storeId: 2 });

    const response = await controller.createConversation(request, { title: '晨会经营复盘' });

    expect(response).toEqual({ id: 42, title: '晨会经营复盘', storeId: 2 });
    expect(chatService.createConversation).toHaveBeenCalledWith(expect.objectContaining({ storeId: 2, userId: 9 }), {
      title: '晨会经营复盘',
    });
  });

  it('answers a message through the chat service instead of returning an empty queued shell', async () => {
    chatService.sendMessage.mockResolvedValue({
      conversationId: 12,
      runId: 77,
      status: 'completed',
      answer: '预约数为 3。',
      citations: [{ sourceType: 'metric', sourceId: 'appointment_count' }],
      suggestedActions: [],
      contextStoreId: 2,
    });

    const response = await controller.sendMessage(request, '12', {
      message: '今天预约多少？',
      timezone: 'Asia/Shanghai',
    });

    expect(response).toMatchObject({
      conversationId: 12,
      runId: 77,
      status: 'completed',
      answer: expect.stringContaining('预约数'),
      contextStoreId: 2,
    });
    expect(response.answer).not.toBe('');
    expect(chatService.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ storeId: 2, userId: 9, timezone: 'Asia/Shanghai' }),
      12,
      { message: '今天预约多少？', timezone: 'Asia/Shanghai' },
    );
  });

  it('streams lifecycle, answer deltas and the completed response over SSE', async () => {
    const completed = {
      conversationId: 12,
      runId: 78,
      status: 'completed',
      answer: '今天预约数为 3。',
      citations: [],
      suggestedActions: [],
      contextStoreId: 2,
    };
    chatService.sendMessage.mockImplementation(async (_context, _conversationId, _dto, options) => {
      options?.onAnswerReady?.(completed);
      return completed;
    });
    const streamRequest = {
      headers: {
        'x-store-id': '2',
        'x-request-id': 'req_stream_test',
      },
      user: {
        id: 9,
        permissions: ['core:brain:use'],
        deniedPermissions: [],
        storeIds: [2],
      },
      on: jest.fn(),
    } as never;
    const response = {
      status: jest.fn(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
      flush: jest.fn(),
    };

    await controller.streamMessage(streamRequest, response as never, '12', {
      message: '今天预约多少？',
      timezone: 'Asia/Shanghai',
    });

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream; charset=utf-8');
    expect(response.write).toHaveBeenCalledWith(expect.stringContaining('event: run_started'));
    expect(response.write).toHaveBeenCalledWith(expect.stringContaining('event: progress'));
    expect(response.write).toHaveBeenCalledWith(expect.stringContaining('event: step'));
    expect(response.write).toHaveBeenCalledWith(expect.stringContaining('event: answer_delta'));
    expect(response.write).toHaveBeenCalledWith(expect.stringContaining('event: completed'));
    expect(response.end).toHaveBeenCalled();
  });

  it('emits run_started before the asynchronous chat request completes', async () => {
    let resolveChat!: (value: {
      conversationId: number;
      runId: number;
      status: string;
      answer: string;
      citations: never[];
      suggestedActions: never[];
      contextStoreId: number;
    }) => void;
    chatService.sendMessage.mockReturnValue(
      new Promise((resolve) => {
        resolveChat = resolve;
      }),
    );
    const streamRequest = {
      headers: { 'x-store-id': '2', 'x-request-id': 'req_stream_deferred' },
      user: { id: 9, permissions: ['core:brain:use'], deniedPermissions: [], storeIds: [2] },
      on: jest.fn(),
    } as never;
    const response = {
      status: jest.fn(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
      flush: jest.fn(),
    };

    const pending = controller.streamMessage(streamRequest, response as never, '12', {
      message: '今天预约多少？',
      timezone: 'Asia/Shanghai',
    });

    expect(response.write).toHaveBeenCalledTimes(2);
    expect(response.write.mock.calls[0]?.[0]).toContain('event: run_started');
    expect(response.write.mock.calls[1]?.[0]).toContain('event: progress');
    expect(response.end).not.toHaveBeenCalled();

    resolveChat({
      conversationId: 12,
      runId: 79,
      status: 'completed',
      answer: '今天预约数为 3。',
      citations: [],
      suggestedActions: [],
      contextStoreId: 2,
    });
    await pending;

    expect(response.write).toHaveBeenCalledWith(expect.stringContaining('event: completed'));
    expect(response.end).toHaveBeenCalled();
  });

  it('exposes persisted conversation messages and run events contract endpoints', async () => {
    chatService.listMessages.mockResolvedValue({
      conversationId: 12,
      items: [{ role: 'assistant', content: '预约数为 3。' }],
    });
    chatService.listRunEvents.mockResolvedValue({ runId: 99, events: [{ stepKey: 'semantic_query' }] });

    await expect(controller.listMessages(request, '12')).resolves.toMatchObject({
      conversationId: 12,
      items: [{ role: 'assistant', content: '预约数为 3。' }],
    });
    await expect(controller.getRunEvents(request, '99')).resolves.toMatchObject({
      runId: 99,
      events: [{ stepKey: 'semantic_query' }],
    });
    expect(chatService.listRunEvents).toHaveBeenCalledWith(expect.objectContaining({ storeId: 2, userId: 9 }), 99);
  });

  function controllerWithActionService(actionConfirmationService: unknown) {
    return new BrainController(
      contextService,
      chatService as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      actionConfirmationService as never,
    );
  }

  it('executes confirmed actions with current user, store and permission context', async () => {
    const actionConfirmationService = {
      confirmAndExecute: jest.fn().mockResolvedValue({
        actionId: 'act_1',
        executionId: 31,
        status: 'succeeded',
        receipt: { businessObjectType: 'reservation', businessObjectId: 88 },
      }),
    };
    const actionController = controllerWithActionService(actionConfirmationService);

    await expect(
      actionController.confirmAction(request, 'act_1', { runId: 5, actionId: 'act_1' }),
    ).resolves.toMatchObject({
      actionId: 'act_1',
      runId: 5,
      executionId: 31,
      status: 'succeeded',
      storeId: 2,
      receipt: { businessObjectType: 'reservation', businessObjectId: 88 },
    });
    expect(actionConfirmationService.confirmAndExecute).toHaveBeenCalledWith({
      actionId: 'act_1',
      runId: 5,
      userId: 9,
      storeId: 2,
      permissions: ['core:brain:use'],
    });
  });

  it('supports rejecting action previews before execution', async () => {
    const actionConfirmationService = {
      rejectPreview: jest.fn().mockResolvedValue({ actionId: 'act_1', status: 'rejected' }),
    };
    const actionController = controllerWithActionService(actionConfirmationService);

    await expect(
      actionController.rejectAction(request, 'act_1', { runId: 5, actionId: 'act_1' }),
    ).resolves.toMatchObject({
      actionId: 'act_1',
      runId: 5,
      status: 'rejected',
      storeId: 2,
    });
    expect(actionConfirmationService.rejectPreview).toHaveBeenCalledWith({
      actionId: 'act_1',
      runId: 5,
      userId: 9,
      storeId: 2,
    });
  });

  it('retries a failed replay-safe action with current permission context', async () => {
    const actionConfirmationService = {
      retryFailedExecution: jest.fn().mockResolvedValue({
        actionId: 'act_1',
        executionId: 31,
        status: 'succeeded',
        retried: true,
        receipt: { businessObjectType: 'reservation', businessObjectId: 88 },
      }),
    };
    const actionController = controllerWithActionService(actionConfirmationService);

    await expect(
      actionController.retryAction(request, 'act_1', { runId: 5, actionId: 'act_1' }),
    ).resolves.toMatchObject({
      actionId: 'act_1',
      runId: 5,
      executionId: 31,
      status: 'succeeded',
      retried: true,
      storeId: 2,
    });
    expect(actionConfirmationService.retryFailedExecution).toHaveBeenCalledWith({
      actionId: 'act_1',
      runId: 5,
      userId: 9,
      storeId: 2,
      permissions: ['core:brain:use'],
    });
  });

  it('lists persisted action statuses for the current run, user and store', async () => {
    const actionConfirmationService = {
      listExecutionStatuses: jest.fn().mockResolvedValue([
        { actionId: 'act_1', executionId: 31, status: 'succeeded', receipt: { businessObjectId: 88 } },
      ]),
    };
    const actionController = controllerWithActionService(actionConfirmationService);

    await expect(actionController.listRunActionStatuses(request, '5')).resolves.toEqual({
      runId: 5,
      storeId: 2,
      items: [{
        actionId: 'act_1',
        executionId: 31,
        status: 'succeeded',
        receipt: { businessObjectId: 88 },
        runId: 5,
        storeId: 2,
      }],
    });
    expect(actionConfirmationService.listExecutionStatuses).toHaveBeenCalledWith({
      runId: 5,
      userId: 9,
      storeId: 2,
    });
  });

  it('exposes governance collection endpoints for the management console', async () => {
    await expect(controller.listTraces(request)).resolves.toMatchObject({ items: [], total: 0 });
    await expect(controller.listSemanticResource('metrics')).resolves.toMatchObject({ resource: 'metrics', items: [] });
    await expect(controller.listRoleProfiles()).resolves.toMatchObject({ items: [] });
    await expect(controller.listSkills()).resolves.toMatchObject({ items: [] });
    await expect(controller.listInspectionRules()).resolves.toMatchObject({ items: [] });
  });

  it('runs and manages store-scoped inspection findings', async () => {
    const inspectionService = {
      runInspection: jest.fn().mockResolvedValue({ runId: 11, storeId: 2, findingCount: 3, status: 'completed' }),
      listFindings: jest.fn().mockResolvedValue([{ id: 21, storeId: 2, status: 'open' }]),
      listInbox: jest.fn().mockResolvedValue({ items: [{ id: 21 }], summary: { total: 1 }, storeId: 2 }),
      updateFinding: jest.fn().mockResolvedValue({ id: 21, storeId: 2, status: 'in_progress', disposition: 'adopted' }),
    };
    const inspectionController = new BrainController(
      contextService,
      chatService as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      inspectionService as never,
    );

    await expect(inspectionController.runInspection(request)).resolves.toMatchObject({ runId: 11, storeId: 2 });
    await expect(inspectionController.listInspectionFindings(request, 'open')).resolves.toMatchObject({
      items: [{ id: 21 }],
    });
    await expect(inspectionController.listInspectionInbox(request, '3')).resolves.toMatchObject({
      items: [{ id: 21 }],
      storeId: 2,
    });
    await expect(
      inspectionController.updateInspectionFinding(request, '21', { disposition: 'adopted', note: '已分配负责人' }),
    ).resolves.toMatchObject({
      id: 21,
      status: 'in_progress',
    });
    expect(inspectionService.runInspection).toHaveBeenCalledWith({ storeId: 2, triggerType: 'manual' });
    expect(inspectionService.listFindings).toHaveBeenCalledWith({
      storeId: 2,
      status: 'open',
      permissions: ['core:brain:use'],
      deniedPermissions: [],
      userId: 9,
      roles: [],
      enabledRulesOnly: true,
    });
    expect(inspectionService.listInbox).toHaveBeenCalledWith({
      storeId: 2,
      permissions: ['core:brain:use'],
      deniedPermissions: [],
      userId: 9,
      roles: [],
      limit: 3,
    });
    expect(inspectionService.updateFinding).toHaveBeenCalledWith({
      storeId: 2,
      findingId: 21,
      disposition: 'adopted',
      note: '已分配负责人',
    });
  });

  it('returns and records store-scoped inspection repair previews', async () => {
    const repairPreviewService = {
      getPreview: jest.fn().mockResolvedValue({ findingId: 21, policy: { autoExecute: false } }),
      recordDecision: jest.fn().mockResolvedValue({ findingId: 21, decision: 'approve', status: 'in_progress' }),
    };
    const inspectionController = new BrainController(
      contextService,
      chatService as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      repairPreviewService as never,
    );

    await expect(inspectionController.getInspectionRepairPreview(request, '21')).resolves.toMatchObject({
      findingId: 21,
      policy: { autoExecute: false },
    });
    await expect(inspectionController.decideInspectionRepair(request, '21', {
      decision: 'modify',
      modifications: { safetyStock: 12 },
      note: '按 7 天用量调整',
    })).resolves.toMatchObject({ findingId: 21, status: 'in_progress' });
    expect(repairPreviewService.getPreview).toHaveBeenCalledWith({ storeId: 2, findingId: 21 });
    expect(repairPreviewService.recordDecision).toHaveBeenCalledWith({
      storeId: 2,
      findingId: 21,
      userId: 9,
      decision: 'modify',
      modifications: { safetyStock: 12 },
      note: '按 7 天用量调整',
    });
  });

  it('scopes governance traces to current store', async () => {
    const traceService = {
      listTraces: jest.fn().mockResolvedValue({ items: [{ id: 77, storeId: 2 }], total: 1 }),
      getRunTrace: jest.fn().mockResolvedValue({ id: 77, storeId: 2 }),
    };
    const scopedController = new BrainController(contextService, chatService as never, traceService as never);

    await expect(scopedController.listTraces(request)).resolves.toMatchObject({ total: 1 });
    await expect(scopedController.getTrace(request, '77')).resolves.toMatchObject({ id: 77, storeId: 2 });

    expect(traceService.listTraces).toHaveBeenCalledWith({ storeId: 2 });
    expect(traceService.getRunTrace).toHaveBeenCalledWith({ runId: 77, storeId: 2 });
  });

  it('scopes memory revision history to the current store and user', async () => {
    const memoryService = {
      listRevisions: jest.fn().mockResolvedValue({
        items: [{ id: 8, memoryId: 31, revisionType: 'user_correction' }],
        total: 1,
      }),
    };
    const governanceController = new BrainController(
      contextService,
      chatService as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      memoryService as never,
    );

    await expect(governanceController.listMemoryRevisions(request, '31')).resolves.toMatchObject({
      total: 1,
      items: [expect.objectContaining({ memoryId: 31, revisionType: 'user_correction' })],
    });
    expect(memoryService.listRevisions).toHaveBeenCalledWith({ id: 31, storeId: 2, userId: 9 });
  });

  it('exposes real eval, release and feedback governance endpoints', async () => {
    const evalService = {
      createEvalRun: jest.fn().mockResolvedValue({ id: 51, status: 'queued', caseCount: 1 }),
    };
    const releaseService = {
      createRelease: jest.fn().mockResolvedValue({ id: 61, releaseKey: 'brain-mvp-v1', status: 'draft', createdBy: 9 }),
    };
    const governanceController = new BrainController(
      contextService,
      chatService as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      evalService as never,
      releaseService as never,
    );

    await expect(
      governanceController.createEvalRun(request, { releaseId: 61, caseKeys: ['metric_001'] }),
    ).resolves.toMatchObject({
      id: 51,
      status: 'queued',
    });
    await expect(
      governanceController.createRelease(request, { releaseKey: 'brain-mvp-v1', resourceVersionIds: [11] }),
    ).resolves.toMatchObject({
      id: 61,
      status: 'draft',
    });
    expect(evalService.createEvalRun).toHaveBeenCalledWith(
      expect.objectContaining({ storeId: 2, userId: 9, releaseId: 61 }),
    );
    expect(releaseService.createRelease).toHaveBeenCalledWith(
      expect.objectContaining({ releaseKey: 'brain-mvp-v1', resourceVersionIds: [11], createdBy: 9 }),
    );
    expect(controller.createFeedback(request, { runId: 3, rating: 'helpful' })).toMatchObject({
      status: 'open',
      runId: 3,
      storeId: 2,
    });
  });

  it('exposes safe runtime settings and the complete release approval protocol', async () => {
    const releaseService = {
      createRolloutSequence: jest.fn().mockResolvedValue({
        stages: ['shadow', 'canary_5', 'canary_20', 'canary_50', 'full'],
        items: [{ id: 61 }],
      }),
      rejectRelease: jest.fn().mockResolvedValue({ id: 61, status: 'archived' }),
      rollbackToRules: jest.fn().mockResolvedValue({ id: 60, status: 'active' }),
      resolveRuntimeMode: jest.fn().mockResolvedValue({
        mode: 'shadow',
        release: { id: 60, releaseKey: 'brain-r1-shadow', rollout: { userPercentage: 100 } },
      }),
    };
    const approvalService = {
      submitModificationRequirement: jest.fn().mockResolvedValue({
        requestType: 'business_definition',
        redirectTo: '/system/business-definitions?definitionKey=change_request',
      }),
    };
    const runtimeConfig = {
      runtime: {
        cognitionMode: 'rules',
        plannerMode: 'rules',
        modelShadowPercent: 10,
        modelCanaryPercent: 5,
        minConfidence: 0.85,
        capabilityTopK: 8,
        capabilityMinConfidence: 0.3,
        maxPlanNodes: 8,
        maxReplans: 2,
        totalTimeoutMs: 20_000,
        modelTimeoutMs: 8_000,
        singleToolFastPath: true,
      },
    };
    const governanceController = new BrainController(
      contextService,
      chatService as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      releaseService as never,
      undefined,
      undefined,
      undefined,
      undefined,
      approvalService as never,
      runtimeConfig as never,
    );

    await expect(governanceController.getRuntimeConfig(request)).resolves.toMatchObject({
      configured: { cognitionMode: 'rules', plannerMode: 'rules' },
      effective: { mode: 'shadow', releaseKey: 'brain-r1-shadow' },
    });
    await expect(
      governanceController.createRolloutSequence(request, { releaseKey: 'brain-r1', resourceVersionIds: [11] }),
    ).resolves.toMatchObject({ stages: ['shadow', 'canary_5', 'canary_20', 'canary_50', 'full'] });
    await expect(governanceController.rejectRelease('61', { reason: '风险不可接受' })).resolves.toMatchObject({
      status: 'archived',
    });
    await expect(
      governanceController.rollbackReleaseToRules('61', { reason: 'emergency_rules_rollback' }),
    ).resolves.toMatchObject({ status: 'active' });
    await expect(
      governanceController.submitReleaseModification(request, '61', { requirement: '实收公式要排除退款' }),
    ).resolves.toMatchObject({ requestType: 'business_definition' });

    expect(releaseService.resolveRuntimeMode).toHaveBeenCalledWith({ storeId: 2, userId: 9, roleKey: 'store_manager' });
    expect(releaseService.createRolloutSequence).toHaveBeenCalledWith({
      releaseKey: 'brain-r1',
      resourceVersionIds: [11],
      createdBy: 9,
    });
    expect(releaseService.rejectRelease).toHaveBeenCalledWith({ releaseId: 61, reason: '风险不可接受' });
    expect(releaseService.rollbackToRules).toHaveBeenCalledWith({
      releaseId: 61,
      reason: 'emergency_rules_rollback',
    });
    expect(approvalService.submitModificationRequirement).toHaveBeenCalledWith({
      releaseId: 61,
      requirement: '实收公式要排除退款',
      createdBy: 9,
    });
  });
});
