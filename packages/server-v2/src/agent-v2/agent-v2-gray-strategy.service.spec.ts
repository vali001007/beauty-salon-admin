import { AgentV2GrayStrategyService } from './agent-v2-gray-strategy.service.js';

describe('AgentV2GrayStrategyService', () => {
  const service = new AgentV2GrayStrategyService();
  const actor = { storeId: 1, userId: 1, role: 'manager' as const, entrypoint: 'kiosk' };
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    delete process.env.AGENT_V2_GRAY_MODE;
    delete process.env.AGENT_V2_GRAY_RULES;
    delete process.env.AGENT_V2_LEGACY_RETIREMENT_CONFIRMED;
    delete process.env.AGENT_INTENT_ENGINE;
    delete process.env.AGENT_INTENT_SHADOW_COMPARE;
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('uses kg_llm_preferred as the non-production default with legacy fallback', () => {
    expect(service.resolve({ actor })).toMatchObject({
      mode: 'kg_llm_preferred',
      engine: 'kg_llm',
      source: 'default',
      allowLegacyFallback: true,
    });
  });

  it('keeps legacy_regex as the production default formal mode', () => {
    process.env.NODE_ENV = 'production';

    expect(service.resolve({ actor })).toMatchObject({
      mode: 'legacy_regex',
      engine: 'legacy_regex',
      source: 'default',
      allowLegacyFallback: false,
    });
  });

  it('lets debug context override environment settings', () => {
    process.env.AGENT_V2_GRAY_MODE = 'legacy_regex';

    expect(service.resolve({ actor, context: { agentV2GrayMode: 'kg_llm_only' } })).toMatchObject({
      mode: 'kg_llm_only',
      source: 'context',
      engine: 'kg_llm',
    });
  });

  it('matches store and entrypoint scoped rules', () => {
    process.env.AGENT_V2_GRAY_RULES = JSON.stringify([
      { name: 'store-1-shadow', mode: 'shadow', storeIds: [1], entrypoints: ['kiosk'] },
    ]);

    expect(service.resolve({ actor })).toMatchObject({
      mode: 'shadow',
      source: 'env_rule',
      matchedRule: 'store-1-shadow',
      recordShadow: true,
    });
  });

  it('matches persona and capability scoped rules from candidate capability ids', () => {
    process.env.AGENT_V2_GRAY_RULES = JSON.stringify([
      {
        name: 'manager-card-kg-preferred',
        mode: 'kg_llm_preferred',
        personaCodes: ['manager'],
        capabilityIds: ['card.package.inactive-customers.list'],
      },
    ]);

    expect(service.resolve({
      actor: { ...actor, personaCode: 'manager' },
      capabilityIds: ['card.package.inactive-customers.list'],
    })).toMatchObject({
      mode: 'kg_llm_preferred',
      source: 'env_rule',
      matchedRule: 'manager-card-kg-preferred',
      allowLegacyFallback: true,
    });
  });

  it('keeps rule order deterministic when multiple scoped rules match', () => {
    process.env.AGENT_V2_GRAY_RULES = JSON.stringify([
      { name: 'store-shadow', mode: 'shadow', storeIds: [1] },
      { name: 'card-only', mode: 'kg_llm_only', capabilityIds: ['card.package.inactive-customers.list'] },
    ]);

    expect(service.resolve({
      actor,
      capabilityIds: ['card.package.inactive-customers.list'],
    })).toMatchObject({
      mode: 'shadow',
      matchedRule: 'store-shadow',
    });
  });

  it('falls back to global mode when scoped rules are invalid or unmatched', () => {
    process.env.AGENT_V2_GRAY_MODE = 'kg_llm_only';
    process.env.AGENT_V2_GRAY_RULES = JSON.stringify([
      { name: 'invalid-mode', mode: 'unknown', storeIds: [1] },
      { name: 'other-capability', mode: 'shadow', capabilityIds: ['finance.revenue.trend'] },
    ]);

    expect(service.resolve({
      actor,
      capabilityIds: ['card.package.inactive-customers.list'],
    })).toMatchObject({
      mode: 'kg_llm_only',
      source: 'env_global',
    });
  });

  it('loads active DB gray rules before environment rules in async runtime resolution', async () => {
    process.env.AGENT_V2_GRAY_RULES = JSON.stringify([
      { name: 'env-legacy', mode: 'legacy_regex', storeIds: [1] },
    ]);
    const prisma = {
      agentV2GrayRule: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 1,
            name: 'db-card-shadow',
            mode: 'shadow',
            status: 'active',
            priority: 1,
            storeIds: [1],
            personaCodes: [],
            roles: [],
            entrypoints: ['kiosk'],
            capabilityIds: ['card.package.inactive-customers.list'],
          },
        ]),
      },
    };
    const dbService = new AgentV2GrayStrategyService(prisma as any);

    await expect(dbService.resolveAsync({
      actor,
      capabilityIds: ['card.package.inactive-customers.list'],
    })).resolves.toMatchObject({
      mode: 'shadow',
      source: 'db_rule',
      matchedRule: 'db-card-shadow',
    });
    expect(prisma.agentV2GrayRule.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: 'active' },
      orderBy: [{ priority: 'asc' }, { id: 'asc' }],
    }));
  });

  it('keeps AGENT_INTENT_ENGINE backward compatible', () => {
    process.env.AGENT_INTENT_ENGINE = 'kg_llm';

    expect(service.resolve({ actor })).toMatchObject({
      mode: 'kg_llm_preferred',
      source: 'env_legacy',
      engine: 'kg_llm',
      allowLegacyFallback: true,
    });
  });

  it('supports AGENT_INTENT_SHADOW_COMPARE for local shadow comparison', () => {
    process.env.AGENT_INTENT_SHADOW_COMPARE = 'true';

    expect(service.resolve({ actor })).toMatchObject({
      mode: 'shadow',
      source: 'env_legacy',
      engine: 'shadow',
      recordShadow: true,
      allowLegacyFallback: true,
    });
  });

  it('keeps AGENT_V2_GRAY_MODE ahead of legacy env aliases', () => {
    process.env.AGENT_V2_GRAY_MODE = 'kg_llm_only';
    process.env.AGENT_INTENT_SHADOW_COMPARE = 'true';

    expect(service.resolve({ actor })).toMatchObject({
      mode: 'kg_llm_only',
      source: 'env_global',
      engine: 'kg_llm',
      recordShadow: false,
    });
  });

  it('blocks production legacy_retired until retirement evidence is explicitly confirmed', () => {
    process.env.NODE_ENV = 'production';
    process.env.AGENT_V2_GRAY_MODE = 'legacy_retired';

    expect(service.resolve({ actor })).toMatchObject({
      mode: 'kg_llm_preferred',
      source: 'env_global',
      engine: 'kg_llm',
      allowLegacyFallback: true,
      legacyRetired: false,
      reason: expect.stringContaining('AGENT_V2_LEGACY_RETIREMENT_CONFIRMED=true'),
    });
  });

  it('allows production legacy_retired only after explicit retirement confirmation', () => {
    process.env.NODE_ENV = 'production';
    process.env.AGENT_V2_GRAY_MODE = 'legacy_retired';
    process.env.AGENT_V2_LEGACY_RETIREMENT_CONFIRMED = 'true';

    expect(service.resolve({ actor })).toMatchObject({
      mode: 'legacy_retired',
      source: 'env_global',
      engine: 'kg_llm',
      allowLegacyFallback: false,
      legacyRetired: true,
    });
  });
});
