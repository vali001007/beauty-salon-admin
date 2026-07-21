import {
  BrainCapabilityCatalogService,
  BrainCapabilityCatalogValidationError,
} from './brain-capability-catalog.service.js';
import type { BrainCapabilityCandidate, BrainCapabilityCard } from './brain-capability.types.js';

describe('BrainCapabilityCatalogService', () => {
  const permissionCodes = new Set([
    'core:brain:use',
    'core:brain:beautician-view',
    'core:finance:view',
    'core:inventory:purchase',
  ]);
  const sourceFingerprint = 'a'.repeat(64);
  const definitionRefs = [
    {
      definitionId: 11,
      versionId: 21,
      definitionKey: 'finance.paid_revenue',
      version: 3,
      definitionFingerprint: 'b'.repeat(64),
      sourceFingerprint: 'c'.repeat(64),
    },
  ];

  const validCard = (override: Partial<BrainCapabilityCard> = {}): BrainCapabilityCard =>
    ({
      key: 'query_revenue',
      version: 2,
      name: '查询实收流水',
      description: '查询指定时间范围内的门店实收流水。',
      domains: ['finance'],
      intents: ['query'],
      inputSchema: { type: 'object', additionalProperties: false, properties: {} },
      outputSchema: { type: 'object', additionalProperties: true },
      requiredPermissions: ['core:finance:view'],
      allowedRoles: ['store_manager', 'finance'],
      readOnly: true,
      sideEffect: false,
      riskLevel: 'low',
      requiresConfirmation: false,
      idempotency: 'not_applicable',
      timeoutMs: 10_000,
      grounding: 'domain_service',
      examples: ['本月实收多少'],
      sourceFingerprint,
      definitionRefs,
      synonyms: ['门店实收'],
      negativeExamples: ['员工销售排行'],
      successSchema: { type: 'object', required: ['amount'], properties: { amount: { type: 'number' } } },
      ...override,
    }) as BrainCapabilityCard;

  const validCandidate = (override: Partial<BrainCapabilityCandidate> = {}): BrainCapabilityCandidate => ({
    ...validCard(),
    skillType: 'query',
    ...override,
  });

  const createService = (
    candidates: BrainCapabilityCandidate[],
    permissions: ReadonlySet<string> | undefined = permissionCodes,
    runtime: { cognitionMode: 'rules' | 'shadow' | 'model'; plannerMode: 'rules' | 'shadow' | 'model' } = {
      cognitionMode: 'rules',
      plannerMode: 'rules',
    },
    semanticVerifier = {
      loadVerifiedSnapshot: jest.fn().mockResolvedValue({ definitions: [], snapshotFingerprint: 'a'.repeat(64) }),
      loadEvaluationSnapshot: jest.fn().mockResolvedValue({ definitions: [], snapshotFingerprint: 'b'.repeat(64) }),
      verifyCard: jest.fn().mockResolvedValue(undefined),
    },
  ) => {
    const registry = {
      listLatestEnabledCapabilityCandidates: jest.fn().mockResolvedValue(candidates),
    };
    return {
      registry,
      semanticVerifier,
      service: new BrainCapabilityCatalogService(
        registry as any,
        { runtime } as any,
        permissions,
        semanticVerifier as any,
      ),
    };
  };

  it('loads the latest enabled capability cards after deterministic validation', async () => {
    const candidates = [validCandidate()];
    const { registry, service } = createService(candidates);

    await expect(service.listEnabledCapabilities()).resolves.toEqual([validCard()]);
    expect(registry.listLatestEnabledCapabilityCandidates).toHaveBeenCalledTimes(1);
  });

  it('validates release snapshot candidates without reading the active skill registry', async () => {
    const active = validCandidate({ key: 'active_capability' });
    const candidate = validCandidate({ key: 'release_candidate', version: 7 });
    const { registry, semanticVerifier, service } = createService([active]);

    await expect(service.listEnabledCapabilities([candidate])).resolves.toEqual([
      validCard({ key: 'release_candidate', version: 7 }),
    ]);
    expect(registry.listLatestEnabledCapabilityCandidates).not.toHaveBeenCalled();
    expect(semanticVerifier.loadEvaluationSnapshot).toHaveBeenCalledWith([21]);
  });

  it('reuses a successful immutable release catalog validation by candidate fingerprint', async () => {
    const candidate = validCandidate({ key: 'release_candidate', version: 7 });
    const { semanticVerifier, service } = createService([]);

    await expect(service.listEnabledCapabilities([candidate])).resolves.toHaveLength(1);
    await expect(service.listEnabledCapabilities([candidate])).resolves.toHaveLength(1);

    expect(semanticVerifier.loadEvaluationSnapshot).toHaveBeenCalledTimes(1);
    expect(semanticVerifier.loadVerifiedSnapshot).not.toHaveBeenCalled();
    expect(semanticVerifier.verifyCard).toHaveBeenCalledTimes(1);
  });

  it('preserves the generated capability marker for automatic role discovery', async () => {
    const { service } = createService([]);

    await expect(
      service.listEnabledCapabilities([validCandidate({ generatedCapability: true })]),
    ).resolves.toEqual([validCard({ generatedCapability: true })]);
  });

  it('rejects operation-shaped intent labels that are outside the shared semantic intent contract', async () => {
    const { service } = createService([]);

    const report = await service.validateEnabledCapabilities([
      validCandidate({ intents: ['list_reservations', 'query_reservations'] }),
    ]);

    expect(report.valid).toBe(false);
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'invalid_intent', value: 'list_reservations' }),
        expect.objectContaining({ code: 'invalid_intent', value: 'query_reservations' }),
      ]),
    );
  });

  it('loads one definition snapshot and reuses it for every structurally valid capability', async () => {
    const semanticVerifier = {
      loadVerifiedSnapshot: jest.fn().mockResolvedValue({ definitions: [], snapshotFingerprint: 'a'.repeat(64) }),
      loadEvaluationSnapshot: jest.fn().mockResolvedValue({ definitions: [], snapshotFingerprint: 'b'.repeat(64) }),
      verifyCard: jest.fn().mockResolvedValue(undefined),
    };
    const { service } = createService(
      [validCandidate(), validCandidate({ key: 'query_stock', version: 3 })],
      permissionCodes,
      undefined,
      semanticVerifier,
    );

    await expect(service.listEnabledCapabilities()).resolves.toHaveLength(2);

    expect(semanticVerifier.loadVerifiedSnapshot).toHaveBeenCalledTimes(1);
    expect(semanticVerifier.verifyCard).toHaveBeenCalledTimes(2);
    expect(semanticVerifier.verifyCard).toHaveBeenNthCalledWith(1, expect.anything(), expect.anything());
    expect(semanticVerifier.verifyCard).toHaveBeenNthCalledWith(2, expect.anything(), expect.anything());
  });

  it('fails closed in model mode when discovery lineage or language fields are missing', async () => {
    const missing = validCandidate({
      sourceFingerprint: undefined,
      definitionRefs: undefined,
      synonyms: undefined,
      negativeExamples: undefined,
    } as Partial<BrainCapabilityCandidate>);
    const { service } = createService([missing], permissionCodes, {
      cognitionMode: 'model',
      plannerMode: 'model',
    });

    const report = await service.validateEnabledCapabilities();

    expect(report.valid).toBe(false);
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'sourceFingerprint' }),
        expect.objectContaining({ field: 'definitionRefs' }),
        expect.objectContaining({ field: 'synonyms' }),
        expect.objectContaining({ field: 'negativeExamples' }),
      ]),
    );
  });

  it.each([
    ['sourceFingerprint', 'not-a-fingerprint'],
    ['definitionRefs', [{ ...definitionRefs[0], definitionId: 0 }]],
    ['definitionRefs', [{ ...definitionRefs[0], definitionFingerprint: 'bad' }]],
  ] as const)('rejects malformed discovery field %s', async (field, value) => {
    const { service } = createService([validCandidate({ [field]: value } as Partial<BrainCapabilityCandidate>)]);

    const report = await service.validateEnabledCapabilities();

    expect(report.valid).toBe(false);
    expect(report.issues).toEqual(expect.arrayContaining([expect.objectContaining({ field })]));
  });

  it('deep-freezes discovery lineage and language fields', async () => {
    const { service } = createService([validCandidate()]);

    const [card] = await service.listEnabledCapabilities();

    expect(Object.isFrozen(card)).toBe(true);
    expect(Object.isFrozen(card.definitionRefs)).toBe(true);
    expect(Object.isFrozen(card.definitionRefs[0])).toBe(true);
    expect(Object.isFrozen(card.synonyms)).toBe(true);
    expect(Object.isFrozen(card.negativeExamples)).toBe(true);
  });

  it('rejects a formatted DB card when current published semantics or lineage no longer match', async () => {
    const semanticVerifier = {
      loadVerifiedSnapshot: jest.fn().mockResolvedValue({ definitions: [], snapshotFingerprint: 'a'.repeat(64) }),
      loadEvaluationSnapshot: jest.fn().mockResolvedValue({ definitions: [], snapshotFingerprint: 'b'.repeat(64) }),
      verifyCard: jest.fn().mockRejectedValue(new Error('generated_capability_semantics_mismatch')),
    };
    const { service } = createService([validCandidate()], permissionCodes, undefined, semanticVerifier);

    const report = await service.validateEnabledCapabilities();

    expect(report.valid).toBe(false);
    expect(report.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'untrusted_business_definition' })]),
    );
    expect(semanticVerifier.verifyCard).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'query_revenue' }),
      expect.anything(),
    );
  });

  it.each([
    [{ key: 'Query Revenue' }, 'invalid_key'],
    [{ version: 0 }, 'invalid_version'],
    [{ version: 1.5 }, 'invalid_version'],
  ] as Array<[Partial<BrainCapabilityCard>, string]>)('rejects invalid identity %#', async (override, code) => {
    const { service } = createService([validCandidate(override)]);

    const report = await service.validateEnabledCapabilities();

    expect(report.valid).toBe(false);
    expect(report.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code })]));
  });

  it.each(['inputSchema', 'outputSchema', 'successSchema'] as const)(
    'rejects an un-compilable %s JSON Schema',
    async (field) => {
      const { service } = createService([
        validCandidate({
          [field]: { type: 'not-a-json-schema-type' },
        }),
      ]);

      const report = await service.validateEnabledCapabilities();

      expect(report.valid).toBe(false);
      expect(report.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: 'invalid_json_schema', field })]),
      );
    },
  );

  it('rejects permissions that are absent from the injected registered permission set', async () => {
    const { service } = createService([validCandidate({ requiredPermissions: ['core:finance:export'] })]);

    const report = await service.validateEnabledCapabilities();

    expect(report.valid).toBe(false);
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'unregistered_permission',
          value: 'core:finance:export',
        }),
      ]),
    );
  });

  it('fails closed when the registered permission provider is missing', async () => {
    const registry = { listLatestEnabledCapabilityCandidates: jest.fn().mockResolvedValue([validCandidate()]) };
    const service = new BrainCapabilityCatalogService(
      registry as any,
      { runtime: { cognitionMode: 'rules', plannerMode: 'rules' } } as any,
      undefined,
      {
        loadVerifiedSnapshot: jest.fn().mockResolvedValue({ definitions: [], snapshotFingerprint: 'a'.repeat(64) }),
        verifyCard: jest.fn().mockResolvedValue(undefined),
      } as any,
    );

    const report = await service.validateEnabledCapabilities();

    expect(report.valid).toBe(false);
    expect(report.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'permission_registry_unavailable' })]),
    );
  });

  it.each([
    [{ readOnly: true, sideEffect: true }, 'read_only_side_effect_conflict'],
    [{ readOnly: false, sideEffect: false }, 'missing_side_effect_declaration'],
    [{ readOnly: false, sideEffect: true, requiresConfirmation: false }, 'write_confirmation_required'],
    [
      { readOnly: false, sideEffect: true, requiresConfirmation: true, idempotency: 'not_applicable' },
      'write_idempotency_required',
    ],
    [{ readOnly: true, requiresConfirmation: true }, 'read_only_confirmation_conflict'],
    [{ readOnly: true, idempotency: 'required' }, 'read_only_idempotency_conflict'],
    [
      {
        readOnly: false,
        sideEffect: true,
        requiresConfirmation: true,
        idempotency: 'required',
        riskLevel: 'low',
      },
      'write_risk_too_low',
    ],
  ] as Array<[Partial<BrainCapabilityCard>, string]>)(
    'rejects inconsistent execution policy %#',
    async (override, code) => {
      const { service } = createService([validCandidate(override)]);

      const report = await service.validateEnabledCapabilities();

      expect(report.valid).toBe(false);
      expect(report.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code })]));
    },
  );

  it.each([0, 20_001, 1.5])('rejects timeoutMs=%s outside the governed integer range', async (timeoutMs) => {
    const { service } = createService([validCandidate({ timeoutMs })]);

    const report = await service.validateEnabledCapabilities();

    expect(report.valid).toBe(false);
    expect(report.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'invalid_timeout' })]));
  });

  it('accepts a governed write capability', async () => {
    const card = validCandidate({
      key: 'preview_purchase_order',
      skillType: 'action',
      requiredPermissions: ['core:inventory:purchase'],
      readOnly: false,
      sideEffect: true,
      riskLevel: 'medium',
      requiresConfirmation: true,
      idempotency: 'required',
    });
    const { service } = createService([card]);

    await expect(service.listEnabledCapabilities()).resolves.toEqual([
      validCard({
        key: 'preview_purchase_order',
        requiredPermissions: ['core:inventory:purchase'],
        readOnly: false,
        sideEffect: true,
        riskLevel: 'medium',
        requiresConfirmation: true,
        idempotency: 'required',
      }),
    ]);
  });

  it('throws a typed error instead of exposing any enabled card when validation fails', async () => {
    const { service } = createService([validCandidate(), validCandidate({ key: 'invalid key' })]);

    await expect(service.listEnabledCapabilities()).rejects.toBeInstanceOf(BrainCapabilityCatalogValidationError);
  });

  it('does not validate the catalog during production startup when cognition and planner both use rules', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const { registry, service } = createService(
      [validCandidate({ requiredPermissions: ['unknown:permission'] })],
      undefined,
      { cognitionMode: 'rules', plannerMode: 'rules' },
    );

    try {
      await expect(service.onModuleInit()).resolves.toBeUndefined();
      expect(registry.listLatestEnabledCapabilityCandidates).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it.each([
    ['model', 'rules'],
    ['rules', 'shadow'],
  ] as const)(
    'blocks production startup without a permission provider in %s/%s mode',
    async (cognitionMode, plannerMode) => {
      const previousNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const registry = { listLatestEnabledCapabilityCandidates: jest.fn().mockResolvedValue([validCandidate()]) };
      const service = new BrainCapabilityCatalogService(
        registry as any,
        { runtime: { cognitionMode, plannerMode } } as any,
        undefined,
        {
          loadVerifiedSnapshot: jest.fn().mockResolvedValue({ definitions: [], snapshotFingerprint: 'a'.repeat(64) }),
          verifyCard: jest.fn().mockResolvedValue(undefined),
        } as any,
      );

      try {
        await expect(service.onModuleInit()).rejects.toBeInstanceOf(BrainCapabilityCatalogValidationError);
        expect(registry.listLatestEnabledCapabilityCandidates).toHaveBeenCalledTimes(1);
      } finally {
        process.env.NODE_ENV = previousNodeEnv;
      }
    },
  );

  it('does not query the database during test startup unless validation is explicitly requested', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    const { registry, service } = createService([validCandidate()]);

    try {
      await expect(service.onModuleInit()).resolves.toBeUndefined();
      expect(registry.listLatestEnabledCapabilityCandidates).not.toHaveBeenCalled();
      await expect(service.validateEnabledCapabilities()).resolves.toMatchObject({ valid: true });
      expect(registry.listLatestEnabledCapabilityCandidates).toHaveBeenCalledTimes(1);
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it.each([
    ['requiredPermissions', 'core:finance:view'],
    ['domains', 'finance'],
    ['allowedRoles', { role: 'finance' }],
    ['inputSchema', []],
    ['outputSchema', 'not-a-schema'],
    ['successSchema', null],
  ] as Array<[keyof BrainCapabilityCandidate, unknown]>)(
    'reports malformed raw field %s instead of normalizing it',
    async (field, value) => {
      const { service } = createService([validCandidate({ [field]: value })]);

      const report = await service.validateEnabledCapabilities();

      expect(report.valid).toBe(false);
      expect(report.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: 'malformed_field', field })]),
      );
    },
  );

  it('keeps a malformed action invalid instead of restoring safe-looking empty defaults', async () => {
    const { service } = createService([
      validCandidate({
        key: 'preview_purchase_order',
        skillType: 'action',
        requiredPermissions: 'core:inventory:purchase',
        inputSchema: [],
        domains: 'inventory',
        readOnly: false,
        sideEffect: true,
        requiresConfirmation: true,
        idempotency: 'required',
        riskLevel: 'medium',
      }),
    ]);

    await expect(service.listEnabledCapabilities()).rejects.toMatchObject({
      report: {
        valid: false,
        issues: expect.arrayContaining([expect.objectContaining({ code: 'malformed_field' })]),
      },
    });
  });

  it('returns deeply cloned and frozen cards that callers cannot mutate', async () => {
    const candidate = validCandidate({
      inputSchema: {
        type: 'object',
        properties: { range: { type: 'object', properties: { start: { type: 'string' } } } },
      },
    });
    const { service } = createService([candidate]);

    const cards = await service.listEnabledCapabilities();
    const schema = cards[0].inputSchema as { properties: { range: { properties: { start: object } } } };

    expect(Object.isFrozen(cards)).toBe(true);
    expect(Object.isFrozen(cards[0])).toBe(true);
    expect(Object.isFrozen(cards[0].requiredPermissions)).toBe(true);
    expect(Object.isFrozen(cards[0].inputSchema)).toBe(true);
    expect(Object.isFrozen(schema.properties.range.properties.start)).toBe(true);
    expect(() => (cards[0].requiredPermissions as string[]).push('core:brain:use')).toThrow(TypeError);
    expect(() => ((cards[0] as { riskLevel: string }).riskLevel = 'critical')).toThrow(TypeError);
    (candidate.requiredPermissions as string[]).push('core:brain:use');
    expect(cards[0].requiredPermissions).toEqual(['core:finance:view']);
  });

  it('reuses one Ajv validator cache for identical schemas across cards and validations', async () => {
    const sharedSchema = { $id: 'urn:ami:shared-input', type: 'object', properties: {} };
    const { service } = createService([
      validCandidate({ key: 'query_revenue', inputSchema: sharedSchema }),
      validCandidate({ key: 'query_stock', inputSchema: { ...sharedSchema } }),
    ]);

    await expect(service.validateEnabledCapabilities()).resolves.toMatchObject({ valid: true });
    await expect(service.validateEnabledCapabilities()).resolves.toMatchObject({ valid: true });
    expect((service as any).schemaValidatorCache.size).toBeGreaterThan(0);
  });
});
