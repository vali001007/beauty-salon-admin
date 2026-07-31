import { BrainActionConfirmationService } from './skills/brain-action-confirmation.service.js';
import { createBrainActionSituationContext } from './cognition/brain-action-situation-context.js';
import { BrainResultReferenceService } from './context/brain-result-reference.service.js';
import { curatedActionInvariantRef } from '../semantic-data/brain-action-invariant-catalog.js';
import { createTestBusinessDatabaseWriteSetEvidence } from '../common/database-write-set.testing.js';

function actionProvenanceFor(
  runId: number,
  definitionKey = 'action.create_reservation',
  gatewayActionKey = 'create_reservation',
) {
  const actionSituationContextProfileFingerprint =
    definitionKey === 'action.create_reservation' ? '8'.repeat(64) : '7'.repeat(64);
  const actionModalityPolicyFingerprint =
    definitionKey === 'action.create_reservation' ? '6'.repeat(64) : '5'.repeat(64);
  const actionInformationArtifactProfileFingerprint =
    definitionKey === 'action.create_reservation' ? '4'.repeat(64) : '3'.repeat(64);
  const actionSideEffectInvariantProfileFingerprint =
    definitionKey === 'action.create_reservation' ? '2'.repeat(64) : '1'.repeat(64);
  return {
    schemaVersion: '1.0' as const,
    actionRef: {
      definitionType: 'action' as const,
      definitionKey,
      definitionVersion: 3,
      definitionFingerprint: 'a'.repeat(64),
      sourceFingerprint: 'b'.repeat(64),
    },
    actionBindingFingerprint: 'c'.repeat(64),
    actionSituationContextProfileFingerprint,
    actionModalityPolicyFingerprint,
    actionInformationArtifactProfileFingerprint,
    actionSideEffectInvariantProfileFingerprint,
    ontologySnapshotFingerprint: 'd'.repeat(64),
    situationContext: createBrainActionSituationContext({
      profileFingerprint: actionSituationContextProfileFingerprint,
      runId,
      conversationId: 12,
      context: {
        userId: 9,
        storeId: 6,
        visibleStoreIds: [6],
        roles: ['store_manager'],
        permissions: ['core:store:reservations'],
        deniedPermissions: [],
        requestId: 'request-test',
        timezone: 'Asia/Shanghai',
      },
      qualifiedRole: 'store_manager',
    }),
    informationArtifacts: [],
    capability: {
      key: 'reservation_action_preview',
      version: 12,
      sourceFingerprint: 'e'.repeat(64),
    },
    gatewayActionKey,
    release: { releaseId: 417, releaseFingerprint: 'f'.repeat(64) },
  };
}
const actionProvenance = actionProvenanceFor(7);
const rescheduleActionProvenance = actionProvenanceFor(7, 'action.reschedule_reservation', 'reschedule_reservation');

function previewGovernanceDependencies() {
  return {
    executionIdentity: {
      assertCurrent: jest.fn().mockResolvedValue({
        action: {
          actionKey: 'action.create_reservation',
          effects: ['reservation_created_in_context_store'],
          situationContext: { fingerprint: actionProvenance.actionSituationContextProfileFingerprint },
          modalityPolicy: { fingerprint: actionProvenance.actionModalityPolicyFingerprint },
          informationArtifact: { fingerprint: actionProvenance.actionInformationArtifactProfileFingerprint },
          sideEffectInvariant: {
            fingerprint: actionProvenance.actionSideEffectInvariantProfileFingerprint,
            gatewayEffectPolicy: 'exact_declared_effect_match',
            invariantContractRef: curatedActionInvariantRef('action.create_reservation'),
          },
        },
        card: {},
      }),
    },
    predicateEffectEvaluator: { assertPreconditions: jest.fn().mockResolvedValue([]) },
  };
}

describe('BrainActionConfirmationService', () => {
  it('stores a versioned approval envelope instead of loose model payload', async () => {
    const prisma = {
      brainActionConfirmation: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data })),
      },
    };
    const gateway = {
      validateForExecution: jest.fn().mockReturnValue({
        descriptor: { key: 'create_reservation', version: 2, riskLevel: 'medium' },
        payload: { customerId: 11, projectId: 22, appointmentTime: '2026-07-12T10:00:00+08:00' },
      }),
    };
    const service = new BrainActionConfirmationService(prisma as never, gateway as never);

    await service.createPreview({
      runId: 7,
      userId: 9,
      storeId: 6,
      skillKey: 'create_reservation',
      capabilityVersion: 2,
      riskLevel: 'medium',
      planId: 'plan-7',
      idempotencyKey: 'idem-7',
      preview: { summary: '创建预约' },
      payload: {
        customerId: 11,
        projectId: 22,
        appointmentTime: '2026-07-12T10:00:00+08:00',
        roleHint: 'finance',
      },
    } as never);

    expect(prisma.brainActionConfirmation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        skillKey: 'create_reservation',
        payload: expect.objectContaining({
          protocolVersion: '1.0',
          capabilityKey: 'create_reservation',
          capabilityVersion: 2,
          validatedArgs: expect.not.objectContaining({ roleHint: expect.anything() }),
          actor: { userId: 9 },
          store: { storeId: 6 },
          riskLevel: 'medium',
          idempotencyKey: 'idem-7',
          planId: 'plan-7',
          argsDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
          expiresAt: expect.any(String),
        }),
      }),
    });
  });

  it('fails closed before persisting a governed preview whose preconditions are not satisfied', async () => {
    const prisma = { brainActionConfirmation: { create: jest.fn() } };
    const gateway = {
      validateForExecution: jest.fn().mockReturnValue({
        descriptor: { key: 'create_reservation', version: 2, riskLevel: 'medium' },
        payload: { customerId: 11, projectId: 22 },
      }),
    };
    const executionIdentity = previewGovernanceDependencies().executionIdentity;
    const predicateEffectEvaluator = {
      assertPreconditions: jest.fn().mockRejectedValue(new Error('action_precondition_violated')),
    };
    const service = new BrainActionConfirmationService(
      prisma as never,
      gateway as never,
      undefined,
      undefined,
      executionIdentity as never,
      predicateEffectEvaluator as never,
    );

    await expect(
      service.createPreview({
        runId: 7,
        userId: 9,
        storeId: 6,
        skillKey: 'create_reservation',
        capabilityVersion: 2,
        riskLevel: 'medium',
        preview: { summary: '创建预约' },
        payload: { customerId: 11, projectId: 22 },
        actionProvenance,
      }),
    ).rejects.toThrow('action_precondition_violated');
    expect(prisma.brainActionConfirmation.create).not.toHaveBeenCalled();
  });

  it('freezes the reservation object version into the governed approval envelope', async () => {
    const prisma = {
      brainActionConfirmation: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data })),
      },
    };
    const gateway = {
      validateForExecution: jest.fn().mockReturnValue({
        descriptor: { key: 'reschedule_reservation', version: 1, riskLevel: 'high' },
        payload: { reservationId: 31, appointmentTime: '2026-08-01T10:00:00.000Z' },
      }),
    };
    const executionIdentity = previewGovernanceDependencies().executionIdentity;
    const predicateEffectEvaluator = {
      captureApprovalEvidence: jest.fn().mockResolvedValue({
        reservationId: 31,
        appointmentTime: '2026-08-01T10:00:00.000Z',
        expectedReservationUpdatedAt: '2026-07-30T10:00:00.000Z',
      }),
      assertPreconditions: jest.fn().mockResolvedValue([]),
    };
    const service = new BrainActionConfirmationService(
      prisma as never,
      gateway as never,
      undefined,
      undefined,
      executionIdentity as never,
      predicateEffectEvaluator as never,
    );

    await service.createPreview({
      runId: 7,
      userId: 9,
      storeId: 6,
      skillKey: 'reschedule_reservation',
      capabilityVersion: 1,
      riskLevel: 'high',
      preview: { summary: '改期' },
      payload: { reservationId: 31, appointmentTime: '2026-08-01T10:00:00.000Z' },
      actionProvenance: rescheduleActionProvenance,
    });

    expect(predicateEffectEvaluator.assertPreconditions).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.objectContaining({ expectedReservationUpdatedAt: '2026-07-30T10:00:00.000Z' }),
      }),
    );
    expect(prisma.brainActionConfirmation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        payload: expect.objectContaining({
          validatedArgs: expect.objectContaining({
            expectedReservationUpdatedAt: '2026-07-30T10:00:00.000Z',
          }),
          argsDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      }),
    });
  });

  it('persists immutable Action Ontology and action-invariant provenance in approval protocol 1.5', async () => {
    const prisma = {
      brainActionConfirmation: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data })),
      },
    };
    const gateway = {
      validateForExecution: jest.fn().mockReturnValue({
        descriptor: { key: 'create_reservation', version: 2, riskLevel: 'medium' },
        payload: { customerId: 11, projectId: 22 },
      }),
    };
    const { executionIdentity, predicateEffectEvaluator } = previewGovernanceDependencies();
    const service = new BrainActionConfirmationService(
      prisma as never,
      gateway as never,
      undefined,
      undefined,
      executionIdentity as never,
      predicateEffectEvaluator as never,
    );

    await service.createPreview({
      runId: 7,
      userId: 9,
      storeId: 6,
      skillKey: 'create_reservation',
      capabilityVersion: 2,
      riskLevel: 'medium',
      preview: { summary: '创建预约' },
      payload: { customerId: 11, projectId: 22 },
      actionProvenance,
    });

    expect(prisma.brainActionConfirmation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actionDefinitionKey: 'action.create_reservation',
        actionDefinitionVersion: 3,
        actionDefinitionFingerprint: 'a'.repeat(64),
        actionSourceFingerprint: 'b'.repeat(64),
        actionBindingFingerprint: 'c'.repeat(64),
        actionModalityPolicyFingerprint: actionProvenance.actionModalityPolicyFingerprint,
        informationArtifactProfileFingerprint: actionProvenance.actionInformationArtifactProfileFingerprint,
        sideEffectInvariantProfileFingerprint: actionProvenance.actionSideEffectInvariantProfileFingerprint,
        informationArtifactFingerprints: [],
        boundCapabilityKey: 'reservation_action_preview',
        capabilityVersion: 12,
        capabilitySourceFingerprint: 'e'.repeat(64),
        ontologySnapshotFingerprint: 'd'.repeat(64),
        releaseId: 417,
        releaseFingerprint: 'f'.repeat(64),
        payload: expect.objectContaining({
          protocolVersion: '1.5',
          actionProvenance,
        }),
      }),
    });
    expect(executionIdentity.assertCurrent).toHaveBeenCalledWith(actionProvenance);
    expect(predicateEffectEvaluator.assertPreconditions).toHaveBeenCalledTimes(1);
  });

  it('requires a new preview for governed approval protocol 1.3', async () => {
    const action = {
      actionId: 'act_protocol_13',
      runId: 7,
      userId: 9,
      storeId: 6,
      skillKey: 'create_reservation',
      riskLevel: 'medium',
      status: 'pending',
      result: null,
      preview: {},
      payload: {
        protocolVersion: '1.3',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
      createdAt: new Date(),
    };
    const prisma = {
      brainActionConfirmation: { findFirst: jest.fn().mockResolvedValue(action) },
      brainActionExecution: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const gateway = {
      resolve: jest.fn().mockReturnValue({ version: 1, permission: 'core:store:reservations', riskLevel: 'medium' }),
    };
    const service = new BrainActionConfirmationService(prisma as never, gateway as never);

    await expect(
      service.confirmAndExecute({
        actionId: action.actionId,
        runId: 7,
        userId: 9,
        storeId: 6,
        permissions: ['core:store:reservations'],
      }),
    ).rejects.toThrow('action_side_effect_invariant_upgrade_required');
  });

  it('requires a new preview for approval protocol 1.4 without the action invariant contract', async () => {
    const action = {
      actionId: 'act_protocol_14',
      runId: 7,
      userId: 9,
      storeId: 6,
      skillKey: 'create_reservation',
      riskLevel: 'medium',
      status: 'pending',
      result: null,
      preview: {},
      payload: {
        protocolVersion: '1.4',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
      createdAt: new Date(),
    };
    const prisma = {
      brainActionConfirmation: { findFirst: jest.fn().mockResolvedValue(action) },
      brainActionExecution: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const gateway = {
      resolve: jest.fn().mockReturnValue({ version: 1, permission: 'core:store:reservations', riskLevel: 'medium' }),
    };
    const service = new BrainActionConfirmationService(prisma as never, gateway as never);

    await expect(
      service.confirmAndExecute({
        actionId: action.actionId,
        runId: action.runId,
        userId: action.userId,
        storeId: action.storeId,
        permissions: ['core:store:reservations'],
      }),
    ).rejects.toThrow('action_invariant_contract_upgrade_required');
  });

  it('fails closed when the Gateway declared effect boundary drifts from the ActionDefinition', async () => {
    const gateway = {
      validateForExecution: jest.fn().mockImplementation((_key, _version, payload) => ({
        descriptor: {
          key: 'create_reservation',
          version: 2,
          permission: 'core:store:reservations',
          riskLevel: 'medium',
          effectKeys: ['reservation_cancelled'],
        },
        payload,
      })),
      resolve: jest.fn().mockReturnValue({
        key: 'create_reservation',
        version: 2,
        permission: 'core:store:reservations',
        riskLevel: 'medium',
        effectKeys: ['reservation_cancelled'],
      }),
    };
    const governance = previewGovernanceDependencies();
    const bootstrapPrisma = {
      brainActionConfirmation: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 1, createdAt: new Date(), ...data })),
      },
    };
    const created = await new BrainActionConfirmationService(
      bootstrapPrisma as never,
      gateway as never,
      undefined,
      undefined,
      governance.executionIdentity as never,
      governance.predicateEffectEvaluator as never,
    ).createPreview({
      runId: 7,
      userId: 9,
      storeId: 6,
      skillKey: 'create_reservation',
      capabilityVersion: 2,
      riskLevel: 'medium',
      preview: { summary: '创建预约' },
      payload: { customerId: 11, projectId: 22 },
      actionProvenance,
    });
    const prisma = {
      brainActionConfirmation: { findFirst: jest.fn().mockResolvedValue({ ...created, status: 'pending' }) },
      brainActionExecution: { findUnique: jest.fn().mockResolvedValue(null) },
      brainRun: { findFirst: jest.fn().mockResolvedValue({ conversationId: 12 }) },
      $transaction: jest.fn(),
    };
    const service = new BrainActionConfirmationService(
      prisma as never,
      gateway as never,
      undefined,
      undefined,
      governance.executionIdentity as never,
      governance.predicateEffectEvaluator as never,
    );

    await expect(
      service.confirmAndExecute({
        actionId: created.actionId,
        runId: 7,
        userId: 9,
        storeId: 6,
        permissions: ['core:store:reservations'],
        roles: ['store_manager'],
      }),
    ).rejects.toThrow('action_gateway_effect_contract_drift');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('fails closed when persisted action provenance no longer matches the approval envelope', async () => {
    const bootstrapPrisma = {
      brainActionConfirmation: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 1, createdAt: new Date(), ...data })),
      },
    };
    const gateway = {
      validateForExecution: jest.fn().mockReturnValue({
        descriptor: {
          key: 'create_reservation',
          version: 2,
          riskLevel: 'medium',
          permission: 'core:store:reservations',
          effectKeys: ['reservation_created_in_context_store'],
        },
        payload: { customerId: 11, projectId: 22 },
      }),
      resolve: jest.fn().mockReturnValue({
        key: 'create_reservation',
        version: 2,
        riskLevel: 'medium',
        permission: 'core:store:reservations',
      }),
    };
    const previewGovernance = previewGovernanceDependencies();
    const created = await new BrainActionConfirmationService(
      bootstrapPrisma as never,
      gateway as never,
      undefined,
      undefined,
      previewGovernance.executionIdentity as never,
      previewGovernance.predicateEffectEvaluator as never,
    ).createPreview({
      runId: 7,
      userId: 9,
      storeId: 6,
      skillKey: 'create_reservation',
      capabilityVersion: 2,
      riskLevel: 'medium',
      preview: { summary: '创建预约' },
      payload: { customerId: 11, projectId: 22 },
      actionProvenance,
    });
    const action = {
      ...created,
      status: 'pending',
      actionBindingFingerprint: '0'.repeat(64),
    };
    const prisma = {
      brainActionConfirmation: { findFirst: jest.fn().mockResolvedValue(action) },
      brainActionExecution: { findUnique: jest.fn().mockResolvedValue(null) },
      brainRun: { findFirst: jest.fn().mockResolvedValue({ conversationId: 12 }) },
      $transaction: jest.fn(),
    };
    const service = new BrainActionConfirmationService(prisma as never, gateway as never);

    await expect(
      service.confirmAndExecute({
        actionId: action.actionId,
        runId: 7,
        userId: 9,
        storeId: 6,
        permissions: ['core:store:reservations'],
      }),
    ).rejects.toThrow('action_provenance_mismatch:actionBindingFingerprint');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('requires a new preview when the authenticated action role changes before confirmation', async () => {
    const gateway = {
      validateForExecution: jest.fn().mockReturnValue({
        descriptor: {
          key: 'create_reservation',
          version: 2,
          riskLevel: 'medium',
          permission: 'core:store:reservations',
          effectKeys: ['reservation_created_in_context_store'],
        },
        payload: { customerId: 11, projectId: 22 },
      }),
      resolve: jest.fn().mockReturnValue({
        key: 'create_reservation',
        version: 2,
        riskLevel: 'medium',
        permission: 'core:store:reservations',
      }),
    };
    const bootstrapPrisma = {
      brainActionConfirmation: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 1, createdAt: new Date(), ...data })),
      },
    };
    const previewGovernance = previewGovernanceDependencies();
    const created = await new BrainActionConfirmationService(
      bootstrapPrisma as never,
      gateway as never,
      undefined,
      undefined,
      previewGovernance.executionIdentity as never,
      previewGovernance.predicateEffectEvaluator as never,
    ).createPreview({
      runId: 7,
      userId: 9,
      storeId: 6,
      skillKey: 'create_reservation',
      capabilityVersion: 2,
      riskLevel: 'medium',
      preview: { summary: '创建预约' },
      payload: { customerId: 11, projectId: 22 },
      actionProvenance,
    });
    const action = { ...created, status: 'pending' };
    const prisma = {
      brainActionConfirmation: { findFirst: jest.fn().mockResolvedValue(action) },
      brainActionExecution: { findUnique: jest.fn().mockResolvedValue(null) },
      brainRun: { findFirst: jest.fn().mockResolvedValue({ conversationId: 12 }) },
      $transaction: jest.fn(),
    };
    const service = new BrainActionConfirmationService(
      prisma as never,
      gateway as never,
      undefined,
      undefined,
      previewGovernance.executionIdentity as never,
      previewGovernance.predicateEffectEvaluator as never,
    );

    await expect(
      service.confirmAndExecute({
        actionId: action.actionId,
        runId: 7,
        userId: 9,
        storeId: 6,
        permissions: ['core:store:reservations'],
        roles: ['finance'],
      }),
    ).rejects.toThrow('action_situation_role_mismatch');
    await expect(
      service.confirmAndExecute({
        actionId: action.actionId,
        runId: 7,
        userId: 9,
        storeId: 6,
        permissions: ['core:store:reservations'],
        roles: [],
      }),
    ).rejects.toThrow('action_situation_role_mismatch');
    await expect(
      service.confirmAndExecute({
        actionId: action.actionId,
        runId: 7,
        userId: 9,
        storeId: 6,
        permissions: ['core:store:reservations'],
      }),
    ).rejects.toThrow('action_situation_role_mismatch');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('requires a new preview when a referenced result item changes before confirmation', async () => {
    const resultReferenceService = new BrainResultReferenceService();
    const mappingOutputs = {
      productRanking: [{ productId: 82, productName: '玻尿酸保湿精华', suggestedQuantity: 12 }],
    };
    const resultSets = resultReferenceService.buildResultSets({
      runId: 191,
      conversationId: 12,
      userId: 9,
      storeId: 6,
      capabilityKey: 'inventory_risk_ranking',
      capabilityVersion: 19,
      adapterMetadata: { mappingOutputs },
    });
    const artifact = resultReferenceService.createInformationArtifact({
      refId: 'run:191:productRanking:1',
      resultSets,
      scope: { conversationId: 12, userId: 9, storeId: 6 },
      profileFingerprint: actionProvenance.actionInformationArtifactProfileFingerprint,
    })!;
    const artifactProvenance = { ...actionProvenance, informationArtifacts: [artifact] };
    const gateway = {
      validateForExecution: jest.fn().mockReturnValue({
        descriptor: {
          key: 'create_reservation',
          version: 2,
          riskLevel: 'medium',
          permission: 'core:store:reservations',
          effectKeys: ['reservation_created_in_context_store'],
        },
        payload: { customerId: 11, projectId: 22 },
      }),
      resolve: jest.fn().mockReturnValue({
        key: 'create_reservation',
        version: 2,
        riskLevel: 'medium',
        permission: 'core:store:reservations',
      }),
    };
    const bootstrapPrisma = {
      brainActionConfirmation: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 1, createdAt: new Date(), ...data })),
      },
    };
    const previewGovernance = previewGovernanceDependencies();
    const created = await new BrainActionConfirmationService(
      bootstrapPrisma as never,
      gateway as never,
      undefined,
      undefined,
      previewGovernance.executionIdentity as never,
      previewGovernance.predicateEffectEvaluator as never,
      resultReferenceService,
    ).createPreview({
      runId: 7,
      userId: 9,
      storeId: 6,
      skillKey: 'create_reservation',
      capabilityVersion: 2,
      riskLevel: 'medium',
      preview: { summary: '创建预约' },
      payload: { customerId: 11, projectId: 22 },
      actionProvenance: artifactProvenance,
    });
    const action = { ...created, status: 'pending' };
    const prisma = {
      brainActionConfirmation: { findFirst: jest.fn().mockResolvedValue(action) },
      brainActionExecution: { findUnique: jest.fn().mockResolvedValue(null) },
      brainRun: {
        findFirst: jest.fn().mockResolvedValue({ conversationId: 12 }),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 191,
            output: {
              adapterMetadata: {
                mappingOutputs: {
                  productRanking: [{ productId: 82, productName: '玻尿酸保湿精华', suggestedQuantity: 99 }],
                },
                resultSets,
              },
            },
          },
        ]),
      },
      $transaction: jest.fn(),
    };
    const service = new BrainActionConfirmationService(
      prisma as never,
      gateway as never,
      undefined,
      undefined,
      previewGovernance.executionIdentity as never,
      previewGovernance.predicateEffectEvaluator as never,
      resultReferenceService,
    );

    await expect(
      service.confirmAndExecute({
        actionId: action.actionId,
        runId: 7,
        userId: 9,
        storeId: 6,
        permissions: ['core:store:reservations'],
        roles: ['store_manager'],
      }),
    ).rejects.toThrow(`action_information_artifact_drift:${artifact.artifactKey}`);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('copies Action Ontology provenance and accepts reordered multi-role identity when the qualified role remains', async () => {
    const gateway = {
      validateForExecution: jest.fn().mockImplementation((_key, _version, payload) => ({
        descriptor: {
          key: 'create_reservation',
          version: 2,
          riskLevel: 'medium',
          permission: 'core:store:reservations',
          effectKeys: ['reservation_created_in_context_store'],
        },
        payload,
      })),
      resolve: jest.fn().mockReturnValue({
        key: 'create_reservation',
        version: 2,
        riskLevel: 'medium',
        permission: 'core:store:reservations',
      }),
      execute: jest.fn().mockResolvedValue({
        capabilityKey: 'create_reservation',
        businessObjectType: 'reservation',
        businessObjectId: 101,
        result: { id: 101 },
      }),
    };
    const bootstrapPrisma = {
      brainActionConfirmation: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 1, createdAt: new Date(), ...data })),
      },
    };
    const previewGovernance = previewGovernanceDependencies();
    const created = await new BrainActionConfirmationService(
      bootstrapPrisma as never,
      gateway as never,
      undefined,
      undefined,
      previewGovernance.executionIdentity as never,
      previewGovernance.predicateEffectEvaluator as never,
    ).createPreview({
      runId: 7,
      userId: 9,
      storeId: 6,
      skillKey: 'create_reservation',
      capabilityVersion: 2,
      riskLevel: 'medium',
      preview: { summary: '创建预约' },
      payload: { customerId: 11, projectId: 22 },
      actionProvenance,
    });
    const action = { ...created, status: 'pending' };
    const tx = {
      brainActionConfirmation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      brainActionExecution: { create: jest.fn().mockResolvedValue({ id: 71, status: 'executing' }) },
    };
    const prisma = {
      brainActionConfirmation: {
        findFirst: jest.fn().mockResolvedValue(action),
        update: jest.fn().mockResolvedValue({}),
      },
      brainActionExecution: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      brainRun: { findFirst: jest.fn().mockResolvedValue({ conversationId: 12 }) },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const executionIdentity = previewGovernanceDependencies().executionIdentity;
    const predicateEffectEvaluator = {
      assertPreconditions: jest.fn().mockResolvedValue([]),
      observeEffects: jest.fn().mockResolvedValue([]),
    };
    const service = new BrainActionConfirmationService(
      prisma as never,
      gateway as never,
      undefined,
      undefined,
      executionIdentity as never,
      predicateEffectEvaluator as never,
    );

    await service.confirmAndExecute({
      actionId: action.actionId,
      runId: 7,
      userId: 9,
      storeId: 6,
      permissions: ['core:store:reservations'],
      roles: ['finance', 'store_manager'],
    });

    expect(predicateEffectEvaluator.assertPreconditions).toHaveBeenCalledTimes(1);
    expect(predicateEffectEvaluator.observeEffects).toHaveBeenCalledTimes(1);
    expect(prisma.brainRun.findFirst).toHaveBeenCalledWith({
      where: { id: 7, userId: 9, storeId: 6 },
      select: { conversationId: true },
    });

    expect(tx.brainActionExecution.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        capabilityKey: 'create_reservation',
        boundCapabilityKey: 'reservation_action_preview',
        capabilityVersion: 12,
        capabilitySourceFingerprint: 'e'.repeat(64),
        actionDefinitionKey: 'action.create_reservation',
        actionDefinitionVersion: 3,
        actionBindingFingerprint: 'c'.repeat(64),
        ontologySnapshotFingerprint: 'd'.repeat(64),
        releaseId: 417,
        releaseFingerprint: 'f'.repeat(64),
      }),
    });
    expect(executionIdentity.assertCurrent).toHaveBeenCalledWith(actionProvenance);
  });

  it('rejects model-authored confirmation claims before a preview is persisted', async () => {
    const prisma = { brainActionConfirmation: { create: jest.fn() } };
    const service = new BrainActionConfirmationService(prisma as never);

    await expect(
      service.createPreview({
        runId: 7,
        userId: 9,
        storeId: 6,
        skillKey: 'create_reservation',
        riskLevel: 'medium',
        preview: { summary: '创建预约' },
        payload: { customerId: 11, projectId: 22, appointmentTime: '2026-07-12', confirmed: true },
      } as never),
    ).rejects.toThrow('model_confirmation_claim_forbidden:confirmed');
    expect(prisma.brainActionConfirmation.create).not.toHaveBeenCalled();
  });

  it('requires confirmation for high-risk actions', () => {
    const service = new BrainActionConfirmationService({} as never);
    expect(service.requiresConfirmation('high')).toBe(true);
    expect(service.requiresConfirmation('critical')).toBe(true);
    expect(service.requiresConfirmation('low')).toBe(false);
  });

  it('restores run action statuses only for the current user and store', async () => {
    const prisma = {
      brainActionConfirmation: {
        findMany: jest.fn().mockResolvedValue([
          { actionId: 'act_pending', skillKey: 'create_reservation', status: 'pending', result: null },
          { actionId: 'act_failed', skillKey: 'reschedule_reservation', status: 'failed', result: null },
        ]),
      },
      brainActionExecution: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 31,
            actionId: 'act_failed',
            status: 'failed',
            receiptPayload: null,
            errorCode: 'upstream_timeout',
            errorMessage: '改约回执超时',
            createdAt: new Date('2026-07-18T10:00:00.000Z'),
          },
        ]),
      },
    };
    const gateway = {
      resolve: jest.fn().mockImplementation((key: string) => ({
        key,
        failureRecovery: key === 'reschedule_reservation' ? 'safe_replay' : 'manual_reconcile',
      })),
    };
    const service = new BrainActionConfirmationService(prisma as never, gateway as never);

    const result = await service.listExecutionStatuses({ runId: 5, userId: 9, storeId: 2 });

    expect(prisma.brainActionConfirmation.findMany).toHaveBeenCalledWith({
      where: { runId: 5, userId: 9, storeId: 2 },
      orderBy: { createdAt: 'asc' },
    });
    expect(prisma.brainActionExecution.findMany).toHaveBeenCalledWith({
      where: { runId: 5, userId: 9, storeId: 2, actionId: { in: ['act_pending', 'act_failed'] } },
      orderBy: { createdAt: 'desc' },
    });
    expect(result).toEqual([
      { actionId: 'act_pending', status: 'pending' },
      {
        actionId: 'act_failed',
        executionId: 31,
        status: 'failed',
        receipt: null,
        retryable: true,
        recovery: 'safe_replay',
        error: { code: 'upstream_timeout', message: '改约回执超时' },
      },
    ]);
  });

  it('exposes deadline-exhausted effect verification as non-retryable manual reconciliation', async () => {
    const prisma = {
      brainActionConfirmation: {
        findMany: jest.fn().mockResolvedValue([
          {
            actionId: 'act_effect_manual',
            skillKey: 'cancel_reservation',
            status: 'partially_succeeded',
            result: null,
          },
        ]),
      },
      brainActionExecution: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 39,
            actionId: 'act_effect_manual',
            status: 'partially_succeeded',
            receiptPayload: {
              status: 'partially_succeeded',
              effectReconciliation: {
                status: 'manual_reconcile_required',
                attemptCount: 3,
                maxAttempts: 3,
                verificationDeadline: '2026-07-30T10:00:05.000Z',
                lastAttemptAt: '2026-07-30T10:00:01.000Z',
                nextAttemptAt: null,
                reasonCode: 'effect_observation_attempts_exhausted',
              },
            },
            errorCode: 'action_effect_reconciliation_required',
            errorMessage: '预期效果仍未观测到。',
            createdAt: new Date('2026-07-30T10:00:00.000Z'),
          },
        ]),
      },
    };
    const gateway = {
      resolve: jest.fn().mockReturnValue({ failureRecovery: 'safe_replay' }),
    };
    const service = new BrainActionConfirmationService(prisma as never, gateway as never);

    const result = await service.listExecutionStatuses({ runId: 5, userId: 9, storeId: 6 });

    expect(result).toEqual([
      expect.objectContaining({
        actionId: 'act_effect_manual',
        executionId: 39,
        status: 'partially_succeeded',
        retryable: false,
        recovery: 'manual_reconcile',
        // ami-brain-unit-only: persisted reconciliation response contract, not a product question.
        error: { code: 'action_effect_reconciliation_required', message: '预期效果仍未观测到。' },
      }),
    ]);
  });

  it('reconciles queued marketing execution receipts with the current business status', async () => {
    const confirmation = {
      actionId: 'act_marketing',
      skillKey: 'execute_marketing_strategy',
      status: 'executing',
      result: null,
    };
    const execution = {
      id: 41,
      actionId: 'act_marketing',
      status: 'executing',
      businessObjectType: 'marketing_automation_execution',
      businessObjectId: '91',
      receiptPayload: {
        capabilityKey: 'execute_marketing_strategy',
        businessObjectType: 'marketing_automation_execution',
        businessObjectId: 91,
        result: { id: 91, status: 'pending', queuedCount: 3, reachedCount: 0, failedCount: 0 },
      },
      createdAt: new Date('2026-07-18T10:00:00.000Z'),
    };
    const prisma = {
      brainActionConfirmation: {
        findMany: jest.fn().mockResolvedValue([confirmation]),
        update: jest.fn().mockResolvedValue({}),
      },
      brainActionExecution: {
        findMany: jest.fn().mockResolvedValue([execution]),
        update: jest.fn().mockResolvedValue({}),
      },
      marketingAutomationExecution: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 91,
            storeId: 6,
            status: 'success',
            triggeredCount: 3,
            queuedCount: 3,
            reachedCount: 3,
            failedCount: 0,
            channel: 'in_app',
            executedAt: new Date('2026-07-18T10:00:00.000Z'),
            startedAt: new Date('2026-07-18T10:00:01.000Z'),
            completedAt: new Date('2026-07-18T10:00:02.000Z'),
          },
        ]),
      },
    };
    const gateway = {
      resolve: jest.fn().mockReturnValue({ key: 'execute_marketing_strategy', failureRecovery: 'safe_replay' }),
    };
    const service = new BrainActionConfirmationService(prisma as never, gateway as never);

    const result = await service.listExecutionStatuses({ runId: 5, userId: 9, storeId: 6 });

    expect(prisma.marketingAutomationExecution.findMany).toHaveBeenCalledWith({
      where: { id: { in: [91] }, storeId: 6 },
    });
    expect(prisma.brainActionExecution.update).toHaveBeenCalledWith({
      where: { id: 41 },
      data: expect.objectContaining({ status: 'succeeded', errorCode: null, completedAt: expect.any(Date) }),
    });
    expect(prisma.brainActionConfirmation.update).toHaveBeenCalledWith({
      where: { actionId: 'act_marketing' },
      data: expect.objectContaining({ status: 'succeeded', executedAt: expect.any(Date) }),
    });
    expect(result).toEqual([
      expect.objectContaining({
        actionId: 'act_marketing',
        status: 'succeeded',
        receipt: expect.objectContaining({
          message: '自动触达执行完成：已触达 3 人，失败 0 人。',
          result: expect.objectContaining({ status: 'success', reachedCount: 3 }),
        }),
      }),
    ]);
  });

  it('promotes a governed partial action only after a bounded read-only effect recheck succeeds', async () => {
    const effectProvenance = actionProvenanceFor(51);
    const effectObservation = {
      effectKey: 'reservation_created_in_context_store',
      version: 3,
      fingerprint: '1'.repeat(64),
      status: 'unobserved',
      evidenceCode: 'reservation_creation_payload_mismatch',
      observedAt: '2026-07-30T10:00:00.000Z',
      verificationDeadline: '2026-07-30T10:00:05.000Z',
    };
    const reconciliation = {
      status: 'pending',
      attemptCount: 1,
      maxAttempts: 3,
      verificationDeadline: '2026-07-30T10:00:05.000Z',
      lastAttemptAt: '2026-07-30T10:00:00.000Z',
      nextAttemptAt: '2026-07-30T10:00:00.500Z',
      reasonCode: 'effect_recheck_pending',
    };
    const action = {
      actionId: 'act_effect_pending',
      runId: 51,
      userId: 9,
      storeId: 6,
      skillKey: 'create_reservation',
      riskLevel: 'medium',
      status: 'partially_succeeded',
      result: null,
      payload: {
        protocolVersion: '1.5',
        capabilityKey: 'create_reservation',
        capabilityVersion: 2,
        validatedArgs: { customerId: 11, projectId: 22, appointmentTime: '2026-08-01T10:00:00.000Z' },
        actor: { userId: 9 },
        store: { storeId: 6 },
        riskLevel: 'medium',
        idempotencyKey: 'effect-pending-1',
        planId: 'run:51',
        argsDigest: '9'.repeat(64),
        expiresAt: '2026-07-30T10:15:00.000Z',
        actionProvenance: effectProvenance,
      },
      createdAt: new Date('2026-07-30T10:00:00.000Z'),
      actionDefinitionKey: effectProvenance.actionRef.definitionKey,
      actionDefinitionVersion: effectProvenance.actionRef.definitionVersion,
      actionDefinitionFingerprint: effectProvenance.actionRef.definitionFingerprint,
      actionSourceFingerprint: effectProvenance.actionRef.sourceFingerprint,
      actionBindingFingerprint: effectProvenance.actionBindingFingerprint,
      actionModalityPolicyFingerprint: effectProvenance.actionModalityPolicyFingerprint,
      informationArtifactProfileFingerprint: effectProvenance.actionInformationArtifactProfileFingerprint,
      sideEffectInvariantProfileFingerprint: effectProvenance.actionSideEffectInvariantProfileFingerprint,
      informationArtifactFingerprints: [],
      situationContextProfileFingerprint: effectProvenance.actionSituationContextProfileFingerprint,
      situationContextFingerprint: effectProvenance.situationContext.fingerprint,
      boundCapabilityKey: effectProvenance.capability.key,
      capabilityVersion: effectProvenance.capability.version,
      capabilitySourceFingerprint: effectProvenance.capability.sourceFingerprint,
      ontologySnapshotFingerprint: effectProvenance.ontologySnapshotFingerprint,
      releaseId: effectProvenance.release.releaseId,
      releaseFingerprint: effectProvenance.release.releaseFingerprint,
    };
    const execution = {
      id: 61,
      actionId: action.actionId,
      runId: action.runId,
      capabilityKey: action.skillKey,
      status: 'partially_succeeded',
      receiptPayload: {
        capabilityKey: 'create_reservation',
        businessObjectType: 'reservation',
        businessObjectId: 101,
        status: 'partially_succeeded',
        result: { id: 101 },
        databaseWriteSet: createTestBusinessDatabaseWriteSetEvidence({
          capabilityKey: 'create_reservation',
          idempotencyKey: 'effect-pending-1',
          businessObjectId: 101,
          entries: [
            {
              modelName: 'Reservation',
              tableName: 'Reservation',
              operation: 'create',
              changedFields: ['id', 'storeId'],
              afterStateFingerprint: '3'.repeat(64),
            },
          ],
        }),
        effectObservations: [effectObservation],
        effectReconciliation: reconciliation,
      },
    };
    const prisma = {
      brainActionConfirmation: {
        findMany: jest.fn().mockResolvedValue([action]),
        update: jest.fn().mockResolvedValue({}),
      },
      brainActionExecution: {
        findMany: jest.fn().mockResolvedValue([execution]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const gateway = {
      resolve: jest.fn().mockReturnValue({ version: 2, failureRecovery: 'safe_replay' }),
      execute: jest.fn(),
    };
    const executionIdentity = previewGovernanceDependencies().executionIdentity;
    const predicateEffectEvaluator = {
      reconcileEffects: jest.fn().mockResolvedValue({
        effectObservations: [
          { ...effectObservation, status: 'observed', evidenceCode: 'reservation_created_observed' },
        ],
        reconciliation: {
          ...reconciliation,
          status: 'succeeded',
          attemptCount: 2,
          nextAttemptAt: null,
          reasonCode: 'all_effects_observed',
        },
      }),
    };
    const service = new BrainActionConfirmationService(
      prisma as never,
      gateway as never,
      undefined,
      undefined,
      executionIdentity as never,
      predicateEffectEvaluator as never,
    );

    const result = await service.listExecutionStatuses({ runId: 51, userId: 9, storeId: 6 });

    expect(predicateEffectEvaluator.reconcileEffects).toHaveBeenCalledTimes(1);
    expect(gateway.execute).not.toHaveBeenCalled();
    expect(prisma.brainActionExecution.update).toHaveBeenCalledWith({
      where: { id: 61 },
      data: expect.objectContaining({
        status: 'succeeded',
        errorCode: null,
        receiptPayload: expect.objectContaining({
          effectReconciliation: expect.objectContaining({ status: 'succeeded', attemptCount: 2 }),
        }),
      }),
    });
    expect(prisma.brainActionConfirmation.update).toHaveBeenCalledWith({
      where: { actionId: action.actionId },
      data: expect.objectContaining({ status: 'succeeded' }),
    });
    expect(result).toEqual([
      expect.objectContaining({
        actionId: action.actionId,
        executionId: 61,
        status: 'succeeded',
        // ami-brain-unit-only: persisted reconciliation response contract, not a product question.
        receipt: expect.objectContaining({ message: '业务效果已在固定验证期限内完成确定性核对。' }),
      }),
    ]);
  });

  it('does not offer safe replay after a marketing delivery batch reaches terminal failure', async () => {
    const prisma = {
      brainActionConfirmation: {
        findMany: jest.fn().mockResolvedValue([
          {
            actionId: 'act_marketing_failed',
            skillKey: 'execute_marketing_strategy',
            status: 'executing',
            result: null,
          },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
      brainActionExecution: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 42,
            actionId: 'act_marketing_failed',
            status: 'executing',
            businessObjectType: 'marketing_automation_execution',
            businessObjectId: '92',
            receiptPayload: { result: { id: 92, status: 'pending' } },
            createdAt: new Date(),
          },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
      marketingAutomationExecution: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 92, storeId: 6, status: 'failed', queuedCount: 2, reachedCount: 0, failedCount: 2, channel: 'sms' },
          ]),
      },
    };
    const gateway = {
      resolve: jest.fn().mockReturnValue({ key: 'execute_marketing_strategy', failureRecovery: 'safe_replay' }),
    };
    const service = new BrainActionConfirmationService(prisma as never, gateway as never);

    const result = await service.listExecutionStatuses({ runId: 5, userId: 9, storeId: 6 });

    expect(result[0]).toMatchObject({
      status: 'failed',
      retryable: false,
      recovery: 'manual_reconcile',
      error: { code: 'marketing_automation_execution_failed' },
    });
  });

  it('confirms only a pending action owned by current run, store and user', async () => {
    const prisma = {
      brainActionConfirmation: {
        findFirst: jest.fn().mockResolvedValue({ actionId: 'act_1', status: 'pending' }),
        update: jest.fn().mockResolvedValue({ actionId: 'act_1', status: 'confirmed_preview_only' }),
      },
    };
    const service = new BrainActionConfirmationService(prisma as never);

    const result = await service.confirmPreviewOnly({ actionId: 'act_1', runId: 5, userId: 9, storeId: 2 });

    expect(result).toMatchObject({ actionId: 'act_1', status: 'confirmed_preview_only' });
    expect(prisma.brainActionConfirmation.findFirst).toHaveBeenCalledWith({
      where: {
        actionId: 'act_1',
        runId: 5,
        userId: 9,
        storeId: 2,
        status: 'pending',
      },
    });
    expect(prisma.brainActionConfirmation.update).toHaveBeenCalledWith({
      where: { actionId: 'act_1' },
      data: expect.objectContaining({
        status: 'confirmed_preview_only',
        result: { execution: 'not_connected' },
      }),
    });
  });

  it('rejects only a pending action owned by current run, store and user', async () => {
    const prisma = {
      brainActionConfirmation: {
        findFirst: jest.fn().mockResolvedValue({ actionId: 'act_2', status: 'pending' }),
        update: jest.fn().mockResolvedValue({ actionId: 'act_2', status: 'rejected' }),
      },
    };
    const service = new BrainActionConfirmationService(prisma as never);

    const result = await service.rejectPreview({ actionId: 'act_2', runId: 6, userId: 9, storeId: 2 });

    expect(result).toMatchObject({ actionId: 'act_2', status: 'rejected' });
    expect(prisma.brainActionConfirmation.update).toHaveBeenCalledWith({
      where: { actionId: 'act_2' },
      data: expect.objectContaining({
        status: 'rejected',
        result: { execution: 'user_rejected' },
      }),
    });
  });

  it('claims a pending action once, executes the capability, and persists the receipt', async () => {
    const action = {
      id: 1,
      actionId: 'act_3',
      runId: 7,
      userId: 9,
      storeId: 6,
      skillKey: 'create_reservation',
      riskLevel: 'medium',
      status: 'pending',
      payload: { customerId: 11, projectId: 22, appointmentTime: '2026-07-12T10:00:00+08:00' },
      preview: { summary: '创建预约' },
      createdAt: new Date(),
    };
    const tx = {
      brainActionConfirmation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      brainActionExecution: {
        create: jest.fn().mockResolvedValue({ id: 71, status: 'executing', idempotencyKey: 'act_3' }),
      },
    };
    const prisma = {
      brainActionConfirmation: {
        findFirst: jest.fn().mockResolvedValue(action),
        update: jest.fn().mockResolvedValue({ ...action, status: 'succeeded' }),
      },
      brainActionExecution: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({ id: 71, status: 'succeeded' }),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const gateway = {
      resolve: jest.fn().mockReturnValue({ permission: 'core:store:reservations', version: 1, riskLevel: 'medium' }),
      validateForExecution: jest.fn().mockImplementation((_key, _version, payload) => ({
        descriptor: { permission: 'core:store:reservations', version: 1, riskLevel: 'medium' },
        payload,
      })),
      execute: jest.fn().mockResolvedValue({
        capabilityKey: 'create_reservation',
        businessObjectType: 'reservation',
        businessObjectId: 101,
        result: { id: 101 },
      }),
    };
    const trace = { recordStep: jest.fn().mockResolvedValue({ id: 1 }) };
    const service = new BrainActionConfirmationService(prisma as never, gateway as never, trace as never);

    const result = await service.confirmAndExecute({
      actionId: 'act_3',
      runId: 7,
      userId: 9,
      storeId: 6,
      permissions: ['core:store:reservations'],
      roles: ['store_manager'],
    });

    expect(gateway.execute).toHaveBeenCalledTimes(1);
    expect(gateway.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ idempotencyKey: 'act_3' }),
      }),
    );
    expect(tx.brainActionConfirmation.updateMany).toHaveBeenCalledWith({
      where: { actionId: 'act_3', status: 'pending' },
      data: expect.objectContaining({ status: 'executing' }),
    });
    expect(prisma.brainActionExecution.update).toHaveBeenCalledWith({
      where: { id: 71 },
      data: expect.objectContaining({ status: 'succeeded', businessObjectId: '101' }),
    });
    expect(trace.recordStep).toHaveBeenCalledWith(
      expect.objectContaining({
        stepKey: 'action_create_reservation',
        layer: 'capability_gateway',
        status: 'succeeded',
      }),
    );
    expect(result).toMatchObject({ status: 'succeeded', receipt: { businessObjectId: 101 } });
  });

  it('keeps an asynchronous marketing execution in executing state until business reconciliation', async () => {
    const action = {
      id: 1,
      actionId: 'act_marketing_pending',
      runId: 9,
      userId: 9,
      storeId: 6,
      skillKey: 'execute_marketing_strategy',
      riskLevel: 'high',
      status: 'pending',
      payload: { strategyId: 12, approvedAudienceCount: 3 },
      preview: { summary: '执行营销策略' },
      createdAt: new Date(),
    };
    const tx = {
      brainActionConfirmation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      brainActionExecution: { create: jest.fn().mockResolvedValue({ id: 73, status: 'executing' }) },
    };
    const prisma = {
      brainActionConfirmation: {
        findFirst: jest.fn().mockResolvedValue(action),
        update: jest.fn().mockResolvedValue({}),
      },
      brainActionExecution: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const gateway = {
      resolve: jest.fn().mockReturnValue({ permission: 'core:marketing:update', version: 1, riskLevel: 'high' }),
      validateForExecution: jest.fn().mockImplementation((_key, _version, payload) => ({
        descriptor: { permission: 'core:marketing:update', version: 1, riskLevel: 'high' },
        payload,
      })),
      execute: jest.fn().mockResolvedValue({
        capabilityKey: 'execute_marketing_strategy',
        businessObjectType: 'marketing_automation_execution',
        businessObjectId: 91,
        status: 'executing',
        message: '自动触达执行已进入队列，待发送 3 人。',
        result: { id: 91, status: 'pending', queuedCount: 3 },
      }),
    };
    const service = new BrainActionConfirmationService(prisma as never, gateway as never);

    const result = await service.confirmAndExecute({
      actionId: action.actionId,
      runId: action.runId,
      userId: action.userId,
      storeId: action.storeId,
      permissions: ['core:marketing:update'],
    });

    expect(result).toMatchObject({ status: 'executing', receipt: { businessObjectId: 91 } });
    expect(prisma.brainActionExecution.update).toHaveBeenCalledWith({
      where: { id: 73 },
      data: expect.objectContaining({ status: 'executing', completedAt: null }),
    });
    expect(prisma.brainActionConfirmation.update).toHaveBeenCalledWith({
      where: { actionId: action.actionId },
      data: expect.objectContaining({ status: 'executing' }),
    });
  });

  it('revalidates the approval envelope and action target before claiming execution', async () => {
    const validatedArgs = { reservationId: 18, appointmentTime: '2026-07-14T15:00:00+08:00' };
    const bootstrapPrisma = {
      brainActionConfirmation: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 1, createdAt: new Date(), ...data })),
      },
    };
    const gateway = {
      validateForExecution: jest.fn().mockReturnValue({
        descriptor: {
          key: 'reschedule_reservation',
          version: 1,
          riskLevel: 'high',
          permission: 'core:store:reservations',
        },
        payload: validatedArgs,
      }),
      resolve: jest.fn().mockReturnValue({
        key: 'reschedule_reservation',
        version: 1,
        riskLevel: 'high',
        permission: 'core:store:reservations',
      }),
      execute: jest.fn().mockResolvedValue({
        capabilityKey: 'reschedule_reservation',
        businessObjectType: 'reservation',
        businessObjectId: 18,
        result: { id: 18 },
      }),
    };
    const created = await new BrainActionConfirmationService(bootstrapPrisma as never, gateway as never).createPreview({
      runId: 7,
      userId: 9,
      storeId: 6,
      skillKey: 'reschedule_reservation',
      riskLevel: 'high',
      preview: { summary: '改约' },
      payload: validatedArgs,
    } as never);
    const action = { ...created, status: 'pending', createdAt: new Date() };
    const tx = {
      brainActionConfirmation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      brainActionExecution: { create: jest.fn().mockResolvedValue({ id: 91 }) },
    };
    const prisma = {
      brainActionConfirmation: { findFirst: jest.fn().mockResolvedValue(action), update: jest.fn() },
      brainActionExecution: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const targetResolver = { revalidateCapabilityTarget: jest.fn().mockResolvedValue(undefined) };
    const service = new BrainActionConfirmationService(
      prisma as never,
      gateway as never,
      undefined,
      targetResolver as never,
    );

    await service.confirmAndExecute({
      actionId: action.actionId,
      runId: 7,
      userId: 9,
      storeId: 6,
      permissions: ['core:store:reservations'],
    });

    expect(gateway.validateForExecution).toHaveBeenCalledWith('reschedule_reservation', 1, validatedArgs);
    expect(targetResolver.revalidateCapabilityTarget).toHaveBeenCalledWith({
      capabilityKey: 'reschedule_reservation',
      storeId: 6,
      userId: 9,
      args: validatedArgs,
      idempotencyKey: expect.any(String),
    });
    expect(tx.brainActionConfirmation.updateMany).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the stored arguments no longer match their approval digest', async () => {
    const action = {
      id: 1,
      actionId: 'act_tampered',
      runId: 7,
      userId: 9,
      storeId: 6,
      skillKey: 'create_reservation',
      riskLevel: 'medium',
      status: 'pending',
      payload: {
        protocolVersion: '1.0',
        capabilityKey: 'create_reservation',
        capabilityVersion: 1,
        validatedArgs: { customerId: 99, projectId: 22, appointmentTime: '2026-07-12' },
        actor: { userId: 9 },
        store: { storeId: 6 },
        riskLevel: 'medium',
        idempotencyKey: 'idem-1',
        planId: 'plan-1',
        argsDigest: '0'.repeat(64),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
      createdAt: new Date(),
    };
    const prisma = {
      brainActionConfirmation: { findFirst: jest.fn().mockResolvedValue(action) },
      brainActionExecution: { findUnique: jest.fn() },
    };
    const gateway = {
      resolve: jest.fn().mockReturnValue({
        key: 'create_reservation',
        version: 1,
        riskLevel: 'medium',
        permission: 'core:store:reservations',
      }),
      validateForExecution: jest.fn().mockReturnValue({
        descriptor: { key: 'create_reservation', version: 1, riskLevel: 'medium' },
        payload: action.payload.validatedArgs,
      }),
      execute: jest.fn(),
    };
    const service = new BrainActionConfirmationService(prisma as never, gateway as never);

    await expect(
      service.confirmAndExecute({
        actionId: action.actionId,
        runId: 7,
        userId: 9,
        storeId: 6,
        permissions: ['core:store:reservations'],
      }),
    ).rejects.toThrow('action_args_digest_mismatch');
    expect(gateway.execute).not.toHaveBeenCalled();
  });

  it('returns the existing succeeded execution for duplicate confirmations', async () => {
    const prisma = {
      brainActionConfirmation: {
        findFirst: jest.fn().mockResolvedValue({
          actionId: 'act_4',
          runId: 8,
          userId: 9,
          storeId: 6,
          skillKey: 'create_reservation',
          status: 'succeeded',
          payload: {},
          createdAt: new Date(),
        }),
      },
      brainActionExecution: {
        findUnique: jest.fn().mockResolvedValue({
          id: 72,
          status: 'succeeded',
          receiptPayload: { businessObjectId: 102 },
        }),
      },
    };
    const gateway = { execute: jest.fn() };
    const service = new BrainActionConfirmationService(prisma as never, gateway as never);

    const result = await service.confirmAndExecute({
      actionId: 'act_4',
      runId: 8,
      userId: 9,
      storeId: 6,
      permissions: ['core:store:reservations'],
    });

    expect(gateway.execute).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'succeeded', receipt: { businessObjectId: 102 }, duplicated: true });
  });

  it('safely replays a failed idempotent reservation creation with the original approval envelope', async () => {
    const validatedArgs = {
      customerId: 11,
      projectId: 22,
      appointmentTime: '2026-08-14T15:00:00+08:00',
    };
    const gateway = {
      validateForExecution: jest.fn().mockReturnValue({
        descriptor: {
          key: 'create_reservation',
          version: 1,
          riskLevel: 'medium',
          permission: 'core:store:reservations',
          failureRecovery: 'safe_replay',
          effectKeys: ['reservation_created_in_context_store'],
        },
        payload: validatedArgs,
      }),
      resolve: jest.fn().mockReturnValue({
        key: 'create_reservation',
        version: 1,
        riskLevel: 'medium',
        permission: 'core:store:reservations',
        failureRecovery: 'safe_replay',
      }),
      execute: jest.fn().mockResolvedValue({
        capabilityKey: 'create_reservation',
        businessObjectType: 'reservation',
        businessObjectId: 18,
        result: { id: 18 },
      }),
    };
    const bootstrapPrisma = {
      brainActionConfirmation: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 1, createdAt: new Date(), ...data })),
      },
    };
    const created = await new BrainActionConfirmationService(bootstrapPrisma as never, gateway as never).createPreview({
      runId: 7,
      userId: 9,
      storeId: 6,
      skillKey: 'create_reservation',
      capabilityVersion: 1,
      riskLevel: 'medium',
      preview: { summary: '创建预约' },
      payload: validatedArgs,
    } as never);
    const action = { ...created, status: 'failed', createdAt: new Date() };
    const execution = {
      id: 91,
      status: 'failed',
      errorCode: 'upstream_timeout',
      errorMessage: 'upstream_timeout',
    };
    const tx = {
      brainActionConfirmation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      brainActionExecution: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      brainActionConfirmation: { findFirst: jest.fn().mockResolvedValue(action), update: jest.fn() },
      brainActionExecution: {
        findUnique: jest.fn().mockResolvedValue(execution),
        update: jest.fn(),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const targetResolver = { revalidateCapabilityTarget: jest.fn().mockResolvedValue(undefined) };
    const service = new BrainActionConfirmationService(
      prisma as never,
      gateway as never,
      undefined,
      targetResolver as never,
    );

    const result = await service.retryFailedExecution({
      actionId: action.actionId,
      runId: 7,
      userId: 9,
      storeId: 6,
      permissions: ['core:store:reservations'],
    });

    expect(tx.brainActionConfirmation.updateMany).toHaveBeenCalledWith({
      where: { actionId: action.actionId, status: 'failed' },
      data: { status: 'executing', result: expect.anything() },
    });
    expect(tx.brainActionExecution.updateMany).toHaveBeenCalledWith({
      where: { id: 91, status: 'failed' },
      data: expect.objectContaining({ status: 'executing', errorCode: null, errorMessage: null }),
    });
    expect(gateway.execute).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: 'succeeded', executionId: 91, retried: true });
  });

  it('returns an already committed governed create effect before rechecking stale execution preconditions', async () => {
    const validatedArgs = {
      customerId: 11,
      projectId: 22,
      appointmentTime: '2026-08-14T07:00:00.000Z',
    };
    const gateway = {
      validateForExecution: jest.fn().mockImplementation((_key, _version, payload) => ({
        descriptor: {
          key: 'create_reservation',
          version: 1,
          riskLevel: 'medium',
          permission: 'core:store:reservations',
          failureRecovery: 'safe_replay',
          effectKeys: ['reservation_created_in_context_store'],
        },
        payload,
      })),
      resolve: jest.fn().mockReturnValue({
        key: 'create_reservation',
        version: 1,
        riskLevel: 'medium',
        permission: 'core:store:reservations',
        failureRecovery: 'safe_replay',
      }),
      execute: jest.fn(),
    };
    const previewGovernance = previewGovernanceDependencies();
    const bootstrapPrisma = {
      brainActionConfirmation: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 1, createdAt: new Date(), ...data })),
      },
    };
    const created = await new BrainActionConfirmationService(
      bootstrapPrisma as never,
      gateway as never,
      undefined,
      undefined,
      previewGovernance.executionIdentity as never,
      previewGovernance.predicateEffectEvaluator as never,
    ).createPreview({
      runId: 7,
      userId: 9,
      storeId: 6,
      skillKey: 'create_reservation',
      capabilityVersion: 1,
      riskLevel: 'medium',
      preview: { summary: '创建预约' },
      payload: validatedArgs,
      actionProvenance,
    });
    const action = { ...created, status: 'failed', createdAt: new Date() };
    const execution = { id: 92, status: 'failed', errorCode: 'upstream_timeout' };
    const tx = {
      brainActionConfirmation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      brainActionExecution: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      brainActionConfirmation: { findFirst: jest.fn().mockResolvedValue(action) },
      brainActionExecution: { findUnique: jest.fn().mockResolvedValue(execution) },
      brainRun: { findFirst: jest.fn().mockResolvedValue({ conversationId: 12 }) },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const executionIdentity = previewGovernanceDependencies().executionIdentity;
    const recoveredReceipt = {
      capabilityKey: 'create_reservation',
      businessObjectType: 'reservation',
      businessObjectId: 18,
      result: { id: 18, startTime: '15:00' },
      status: 'succeeded' as const,
      recovered: true as const,
      effectObservations: [{ status: 'observed' }],
      databaseWriteSet: createTestBusinessDatabaseWriteSetEvidence({
        capabilityKey: 'create_reservation',
        idempotencyKey: 'reservation-safe-replay',
        businessObjectId: 18,
        entries: [
          {
            modelName: 'Reservation',
            tableName: 'Reservation',
            operation: 'create',
            changedFields: ['id', 'storeId'],
            afterStateFingerprint: '3'.repeat(64),
          },
        ],
      }),
    };
    const predicateEffectEvaluator = {
      recoverCommittedEffect: jest.fn().mockResolvedValue(recoveredReceipt),
      assertPreconditions: jest.fn(),
    };
    const service = new BrainActionConfirmationService(
      prisma as never,
      gateway as never,
      undefined,
      undefined,
      executionIdentity as never,
      predicateEffectEvaluator as never,
    );

    const result = await service.retryFailedExecution({
      actionId: action.actionId,
      runId: 7,
      userId: 9,
      storeId: 6,
      permissions: ['core:store:reservations'],
      roles: ['store_manager'],
    });

    expect(predicateEffectEvaluator.recoverCommittedEffect).toHaveBeenCalledTimes(1);
    expect(predicateEffectEvaluator.assertPreconditions).not.toHaveBeenCalled();
    expect(gateway.execute).not.toHaveBeenCalled();
    expect(tx.brainActionExecution.updateMany).toHaveBeenCalledWith({
      where: { id: 92, status: 'failed' },
      data: expect.objectContaining({ status: 'succeeded', businessObjectId: '18' }),
    });
    expect(result).toMatchObject({ status: 'succeeded', executionId: 92, retried: true, recovered: true });
  });

  it('requires manual reconciliation for failed create actions instead of blind retry', async () => {
    const action = {
      actionId: 'act_purchase_failed',
      runId: 8,
      userId: 9,
      storeId: 6,
      skillKey: 'create_purchase_order',
      riskLevel: 'high',
      status: 'failed',
      payload: { idempotencyKey: 'purchase-1' },
      createdAt: new Date(),
    };
    const execution = {
      id: 92,
      status: 'failed',
      errorCode: 'upstream_timeout',
      errorMessage: '采购单回执超时',
    };
    const prisma = {
      brainActionConfirmation: { findFirst: jest.fn().mockResolvedValue(action) },
      brainActionExecution: { findUnique: jest.fn().mockResolvedValue(execution) },
    };
    const gateway = {
      resolve: jest.fn().mockReturnValue({ failureRecovery: 'manual_reconcile' }),
      execute: jest.fn(),
    };
    const service = new BrainActionConfirmationService(prisma as never, gateway as never);

    const result = await service.retryFailedExecution({
      actionId: action.actionId,
      runId: 8,
      userId: 9,
      storeId: 6,
      permissions: ['core:inventory:purchase'],
    });

    expect(gateway.execute).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 'failed',
      retryable: false,
      recovery: 'manual_reconcile',
      error: { message: '采购单回执超时' },
    });
  });
});
