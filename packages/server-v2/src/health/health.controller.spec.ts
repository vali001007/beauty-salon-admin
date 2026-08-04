import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  const originalEnv = { ...process.env };
  const prisma = {
    $queryRaw: jest.fn(),
  };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns non-sensitive deployment metadata when build env is available', () => {
    process.env.ZEABUR_GIT_COMMIT_SHA = 'abc123';
    process.env.ZEABUR_GIT_BRANCH = 'main';
    process.env.ZEABUR_DEPLOYMENT_ID = 'deploy-1';
    process.env.NODE_ENV = 'production';

    const result = new HealthController(prisma as any).check();

    expect(result.status).toBe('ok');
    expect(result.deployment).toEqual({
      commit: 'abc123',
      branch: 'main',
      buildId: 'deploy-1',
      buildIdentitySource: 'platform',
      environment: 'production',
    });
  });

  it('keeps deployment metadata nullable when build env is unavailable', () => {
    delete process.env.ZEABUR_GIT_COMMIT_SHA;
    delete process.env.GIT_COMMIT_SHA;
    delete process.env.GITHUB_SHA;
    delete process.env.COMMIT_SHA;
    delete process.env.SOURCE_COMMIT;
    delete process.env.ZEABUR_GIT_BRANCH;
    delete process.env.GIT_BRANCH;
    delete process.env.GITHUB_REF_NAME;
    delete process.env.BRANCH_NAME;
    delete process.env.ZEABUR_DEPLOYMENT_ID;
    delete process.env.DEPLOYMENT_ID;
    delete process.env.BUILD_ID;
    delete process.env.GITHUB_RUN_ID;
    delete process.env.NODE_ENV;
    delete process.env.APP_ENV;
    delete process.env.RAILWAY_ENVIRONMENT;
    delete process.env.VERCEL_ENV;

    const result = new HealthController(prisma as any).check();

    expect(result.deployment).toEqual({
      commit: null,
      branch: null,
      buildId: null,
      buildIdentitySource: null,
      environment: null,
    });
  });

  it('checks database connectivity before reporting ready', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ database_ready: 1 }]);
    process.env.DATABASE_URL = 'postgresql://readonly-user:secret@db.example:6543/ami?schema=brain&sslmode=require';
    const controller = new HealthController(prisma as any);

    await expect(controller.ready()).resolves.toMatchObject({
      status: 'ready',
      database: 'connected',
      databaseTarget: {
        protocol: 'postgresql',
        host: 'db.example',
        port: '6543',
        database: 'ami',
        schema: 'brain',
      },
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('reports DeepSeek as the default production Ami Brain primary', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ database_ready: 1 }]);
    process.env.NODE_ENV = 'production';
    delete process.env.BRAIN_LLM_PRIMARY_ROUTE;
    process.env.LLM_PROVIDER = 'openai_compatible';
    process.env.LLM_MODEL = 'gpt-5.6-luna';
    process.env.LLM_TIMEOUT_MS = '30000';
    process.env.LLM_FALLBACK_PROVIDER = 'deepseek';
    process.env.LLM_FALLBACK_MODEL = 'deepseek-v4-flash';
    process.env.LLM_FALLBACK_TIMEOUT_MS = '20000';
    process.env.BRAIN_FALLBACK_POLICY = 'deterministic';
    const controller = new HealthController(prisma as any);

    await expect(controller.ready()).resolves.toMatchObject({
      brainModel: {
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        timeoutMs: 20000,
        fallbackPolicy: 'disabled',
        routeMode: 'fallback_promoted',
      },
    });
  });

  it('reports the active Release ontology startup evidence when Brain warmup is ready', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ database_ready: 1 }]);
    const brainWarmup = {
      getStatus: jest.fn().mockReturnValue({
        state: 'ready',
        activeReleaseCount: 1,
        warmedReleaseCount: 1,
        latencyMs: 2300,
        releases: [{ releaseId: 416, ontologyFingerprint: 'a'.repeat(64) }],
      }),
    };
    const controller = new HealthController(prisma as any, brainWarmup as never);

    await expect(controller.ready()).resolves.toMatchObject({
      status: 'ready',
      database: 'connected',
      brainActiveReleaseWarmup: {
        state: 'ready',
        activeReleaseCount: 1,
        warmedReleaseCount: 1,
        releases: [{ releaseId: 416 }],
      },
    });
  });

  it('does not report ready while the active Release ontology warmup is incomplete', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ database_ready: 1 }]);
    const controller = new HealthController(
      prisma as any,
      { getStatus: () => ({ state: 'failed' }) } as never,
    );

    await expect(controller.ready()).rejects.toMatchObject({
      name: 'ServiceUnavailableException',
      message: 'brain_active_release_ontology_warmup_not_ready:failed',
    });
  });

  it('fails closed in release stage when immutable deployment identity is missing', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ database_ready: 1 }]);
    process.env.BRAIN_RELEASE_STAGE = 'release';
    process.env.BRAIN_EXPECTED_PRODUCT_PROFILE = 'query_only_v1';
    process.env.BRAIN_RELEASE_HEALTH_STORE_ID = '6';
    process.env.BRAIN_RELEASE_HEALTH_USER_ID = '9';
    delete process.env.ZEABUR_GIT_COMMIT_SHA;
    delete process.env.GIT_COMMIT_SHA;
    delete process.env.GITHUB_SHA;
    delete process.env.COMMIT_SHA;
    delete process.env.SOURCE_COMMIT;
    const controller = new HealthController(prisma as any);

    await expect(controller.ready()).rejects.toMatchObject({
      message: 'brain_release_deployment_commit_missing_or_invalid',
    });
  });

  it('reports the selected query-only Release only when every release-stage identity is complete', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ database_ready: 1 }]);
    process.env.BRAIN_RELEASE_STAGE = 'release';
    process.env.BRAIN_EXPECTED_PRODUCT_PROFILE = 'query_only_v1';
    process.env.BRAIN_RELEASE_HEALTH_STORE_ID = '6';
    process.env.BRAIN_RELEASE_HEALTH_USER_ID = '9';
    process.env.BRAIN_RELEASE_HEALTH_ROLE_KEY = 'store_manager';
    process.env.BRAIN_ACTION_EXECUTION_ENABLED = 'false';
    process.env.LLM_PROVIDER = 'openai_responses';
    process.env.LLM_MODEL = 'gpt-5.6-terra';
    process.env.LLM_TIMEOUT_MS = '20000';
    process.env.BRAIN_FALLBACK_POLICY = 'deterministic';
    process.env.BRAIN_LLM_PRIMARY_ROUTE = 'primary';
    process.env.ZEABUR_GIT_COMMIT_SHA = 'a'.repeat(40);
    process.env.ZEABUR_GIT_BRANCH = 'ami-brain-query-only-candidate';
    process.env.ZEABUR_DEPLOYMENT_ID = 'deploy-query-only-1';
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://readonly-user:secret@db.example:6543/ami?schema=brain&sslmode=require';
    const releaseService = {
      resolveRuntimeDeploymentIdentity: jest.fn().mockResolvedValue({
        mode: 'model',
        release: { id: 452, releaseKey: 'query-only-full' },
        productIdentity: { family: 'runtime', code: 'RT-001', stageCode: 'RT-001-FULL', name: 'Query Only V1', internalReleaseId: 452 },
        governancePolicyIdentity: { family: 'policy', code: 'GP-003', stageCode: null, name: 'Query Only V1 强制治理策略', internalReleaseId: 436 },
        governanceTransitionStatus: 'observing',
        governanceTransitionStep: 'runtime_shadow_active',
        releaseFingerprint: 'e'.repeat(64),
        productProfile: {
          productProfile: 'query_only_v1',
          actionsEnabled: false,
          actionExecutionPolicy: 'deny',
          allowedCapabilityManifest: 'ami-brain-query-only-v1',
          allowedCapabilityCount: 33,
          sideEffectCapabilityCount: 0,
          productProfileFingerprint: 'f'.repeat(64),
        },
      }),
    };
    const controller = new HealthController(prisma as any, undefined, releaseService as never);

    await expect(controller.ready()).resolves.toMatchObject({
      status: 'ready',
      deployment: {
        commit: 'a'.repeat(40),
        branch: 'ami-brain-query-only-candidate',
        buildId: 'deploy-query-only-1',
        environment: 'production',
      },
      releaseGate: { enabled: true, stage: 'release' },
      brainModel: {
        provider: 'openai_responses',
        model: 'gpt-5.6-terra',
        timeoutMs: 20000,
        fallbackPolicy: 'deterministic',
      },
      databaseTarget: {
        protocol: 'postgresql',
        host: 'db.example',
        port: '6543',
        database: 'ami',
        schema: 'brain',
      },
      brainRuntimeRelease: {
        releaseId: 452,
        releaseKey: 'query-only-full',
        runtimeIdentity: { code: 'RT-001', stageCode: 'RT-001-FULL' },
        governancePolicyIdentity: { code: 'GP-003' },
        governanceTransitionStatus: 'observing',
        governanceTransitionStep: 'runtime_shadow_active',
        releaseFingerprint: 'e'.repeat(64),
        productProfile: 'query_only_v1',
        actionsEnabled: false,
        actionExecutionPolicy: 'deny',
        healthContext: { storeId: 6, userId: 9, roleKey: 'store_manager' },
      },
    });
    expect(releaseService.resolveRuntimeDeploymentIdentity).toHaveBeenCalledWith({
      storeId: 6,
      userId: 9,
      roleKey: 'store_manager',
    });
  });
});
