import { BrainCustomerCreateCapabilityExecutor } from './brain-customer-create-capability.executor.js';
import type { BrainCapabilityExecutionInput } from '../brain-capability-executor.registry.js';
import type { BrainCapabilityCard } from '../brain-capability.types.js';
import { createBrainActionSituationContext } from '../../cognition/brain-action-situation-context.js';

describe('BrainCustomerCreateCapabilityExecutor', () => {
  it('creates a persisted preview for BQ0211 without writing a customer', async () => {
    const actionConfirmation = {
      createPreview: jest.fn().mockResolvedValue({ actionId: 'brain_action_customer_1' }),
    };
    const executor = new BrainCustomerCreateCapabilityExecutor(actionConfirmation as never);

    // BQ0211 — 帮王静怡新建客户档案，电话138xxxx807
    const answer = await executor.execute(input('帮王静怡新建客户档案，电话138xxxx807'));

    expect(actionConfirmation.createPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 88,
        userId: 9,
        storeId: 6,
        skillKey: 'create_customer',
        riskLevel: 'high',
        payload: { name: '王静怡', phone: '138xxxx807' },
      }),
    );
    expect(actionConfirmation.createPreview.mock.calls[0][0].payload).not.toHaveProperty('storeId');
    expect(answer).toMatchObject({
      grounding: 'preview_action',
      metadata: {
        previewOnly: true,
        createsBusinessWrite: false,
        storeIdSource: 'server_context',
        phoneMasked: true,
        executionBlockedUntil: 'customer_phone_completed',
      },
      suggestedActions: [
        expect.objectContaining({
          actionId: 'brain_action_customer_1',
          skillKey: 'create_customer',
          actionType: 'create_customer',
          riskLevel: 'high',
          requiresConfirmation: true,
          customer: { name: '王静怡', phone: '138****807', phoneMasked: true },
          expectedReceipt: expect.objectContaining({
            businessObjectType: 'customer',
            message: expect.stringContaining('请补充完整手机号后重新生成预览'),
          }),
        }),
      ],
    });
  });

  it('keeps a complete phone eligible for a successful confirmation receipt', async () => {
    const actionConfirmation = {
      createPreview: jest.fn().mockResolvedValue({ actionId: 'brain_action_customer_complete' }),
    };
    const executor = new BrainCustomerCreateCapabilityExecutor(actionConfirmation as never);

    const answer = await executor.execute(input('创建客户李女士，手机号13800138000'));

    expect(actionConfirmation.createPreview).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { name: '李女士', phone: '13800138000' } }),
    );
    expect(answer).toMatchObject({
      metadata: { phoneMasked: false },
      suggestedActions: [
        expect.objectContaining({
          customer: { name: '李女士', phone: '138****8000', phoneMasked: false },
          expectedReceipt: expect.objectContaining({ message: expect.stringContaining('返回客户档案 ID') }),
        }),
      ],
    });
    expect(answer.metadata).not.toHaveProperty('executionBlockedUntil');
  });

  it('uses governed action slots instead of reparsing the latest user sentence', async () => {
    const actionConfirmation = {
      createPreview: jest.fn().mockResolvedValue({ actionId: 'brain_action_customer_governed' }),
    };
    const executor = new BrainCustomerCreateCapabilityExecutor(actionConfirmation as never);
    const governed = input('就按刚才的信息建档');
    governed.args = {
      actionModality: 'request',
      actionSlots: [
        { slotKey: 'name', source: 'conversation', rawValue: '王静怡', confidence: 1 },
        { slotKey: 'phone', source: 'conversation', rawValue: '13800138807', confidence: 1 },
      ],
    };
    governed.actionProvenance = provenance();

    await executor.execute(governed);

    expect(actionConfirmation.createPreview).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { name: '王静怡', phone: '13800138807' } }),
    );
  });

  it('does not create a new customer preview for a non-request action modality', async () => {
    const actionConfirmation = { createPreview: jest.fn() };
    const executor = new BrainCustomerCreateCapabilityExecutor(actionConfirmation as never);
    const governed = input('确认刚才的客户建档预览');
    governed.args = { actionModality: 'confirm', actionSlots: [] };
    governed.actionProvenance = provenance();

    const answer = await executor.execute(governed);

    expect(actionConfirmation.createPreview).not.toHaveBeenCalled();
    expect(answer).toMatchObject({
      grounding: 'none',
      metadata: { completion: expect.objectContaining({ missingCriteria: ['actionRequest'] }) },
    });
  });

  it.each([
    ['帮我新建客户档案，电话13800138000', 'customerName'],
    ['帮王静怡新建客户档案', 'customerPhone'],
  ])('returns structured clarification when %s is incomplete', async (question, missing) => {
    const actionConfirmation = { createPreview: jest.fn() };
    const executor = new BrainCustomerCreateCapabilityExecutor(actionConfirmation as never);

    const answer = await executor.execute(input(question));

    expect(actionConfirmation.createPreview).not.toHaveBeenCalled();
    expect(answer).toMatchObject({
      grounding: 'none',
      suggestedActions: [],
      blocks: [expect.objectContaining({ kind: 'clarification' })],
      metadata: {
        unsupportedReason: 'customer_create_target_requires_clarification',
        completion: expect.objectContaining({ missingCriteria: expect.arrayContaining([missing]) }),
      },
    });
  });
});

function input(question: string): BrainCapabilityExecutionInput {
  return {
    card: card(),
    context: {
      userId: 9,
      storeId: 6,
      visibleStoreIds: [6],
      roles: ['store_manager'],
      permissions: ['core:brain:use', 'core:customer:create'],
      deniedPermissions: [],
      requestId: 'request-customer-create',
      timezone: 'Asia/Shanghai',
      conversationId: 12,
    },
    runId: 88,
    planId: 'plan-customer-create',
    question,
    args: {},
  };
}

function provenance(): NonNullable<BrainCapabilityExecutionInput['actionProvenance']> {
  return {
    schemaVersion: '1.0',
    actionRef: {
      definitionType: 'action',
      definitionKey: 'action.create_customer',
      definitionVersion: 1,
      definitionFingerprint: 'b'.repeat(64),
      sourceFingerprint: 'c'.repeat(64),
    },
    actionBindingFingerprint: 'd'.repeat(64),
    actionSituationContextProfileFingerprint: 'a'.repeat(64),
    actionModalityPolicyFingerprint: '1'.repeat(64),
    actionInformationArtifactProfileFingerprint: '2'.repeat(64),
    actionSideEffectInvariantProfileFingerprint: '3'.repeat(64),
    ontologySnapshotFingerprint: 'e'.repeat(64),
    situationContext: createBrainActionSituationContext({
      profileFingerprint: 'a'.repeat(64),
      runId: 88,
      conversationId: 12,
      context: input('').context,
      qualifiedRole: 'store_manager',
    }),
    informationArtifacts: [],
    capability: { key: 'customer_create_preview', version: 1, sourceFingerprint: 'f'.repeat(64) },
    gatewayActionKey: 'create_customer',
  };
}

function card(): BrainCapabilityCard {
  return {
    key: 'customer_create_preview',
    version: 1,
    name: '客户建档预览',
    description: '客户建档预览',
    domains: ['customer'],
    intents: ['action'],
    inputSchema: {},
    outputSchema: {},
    requiredPermissions: ['core:brain:use', 'core:customer:create'],
    allowedRoles: ['receptionist', 'customer_service', 'store_manager'],
    readOnly: false,
    sideEffect: true,
    riskLevel: 'high',
    requiresConfirmation: true,
    idempotency: 'required',
    timeoutMs: 10_000,
    grounding: 'preview_action',
    examples: [],
    sourceFingerprint: 'a'.repeat(64),
    definitionRefs: [],
    synonyms: [],
    negativeExamples: [],
    successSchema: {},
  };
}
