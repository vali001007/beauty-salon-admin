import { ConfigService } from '@nestjs/config';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { BrainModule } from '../brain.module.js';
import { BrainRuntimeConfigService } from './brain-runtime-config.service';

describe('BrainRuntimeConfigService', () => {
  const createService = (values: Record<string, string | undefined> = {}) => {
    const configService = {
      get: jest.fn((key: string, defaultValue?: string) => values[key] ?? defaultValue),
    } as unknown as ConfigService;

    return new BrainRuntimeConfigService(configService);
  };

  it('uses rules modes and safe defaults when environment variables are absent', () => {
    const service = createService();

    expect(service.runtime).toEqual({
      runtimeSource: 'database',
      cognitionMode: 'rules',
      plannerMode: 'rules',
      modelShadowPercent: 0,
      modelCanaryPercent: 0,
      minConfidence: 0.85,
      capabilityTopK: 8,
      capabilityMinConfidence: 0.3,
      maxPlanNodes: 8,
      maxReplans: 2,
      totalTimeoutMs: 30_000,
      modelTimeoutMs: 20_000,
      singleToolFastPath: true,
      allowCandidateInspectionGuards: false,
    });
  });

  it('parses all supported runtime settings', () => {
    const service = createService({
      BRAIN_COGNITION_MODE: 'model',
      BRAIN_PLANNER_MODE: 'shadow',
      BRAIN_MODEL_SHADOW_PERCENT: '25',
      BRAIN_MODEL_CANARY_PERCENT: '10',
      BRAIN_MODEL_MIN_CONFIDENCE: '0.9',
      BRAIN_CAPABILITY_TOP_K: '12',
      BRAIN_CAPABILITY_MIN_CONFIDENCE: '0.55',
      BRAIN_MAX_PLAN_NODES: '6',
      BRAIN_MAX_REPLANS: '1',
      BRAIN_TOTAL_TIMEOUT_MS: '15000',
      BRAIN_MODEL_TIMEOUT_MS: '5000',
      BRAIN_SINGLE_TOOL_FAST_PATH: 'false',
      BRAIN_ALLOW_CANDIDATE_INSPECTION_GUARDS: 'true',
    });

    expect(service.runtime).toEqual({
      runtimeSource: 'database',
      cognitionMode: 'model',
      plannerMode: 'shadow',
      modelShadowPercent: 25,
      modelCanaryPercent: 10,
      minConfidence: 0.9,
      capabilityTopK: 12,
      capabilityMinConfidence: 0.55,
      maxPlanNodes: 6,
      maxReplans: 1,
      totalTimeoutMs: 15_000,
      modelTimeoutMs: 5_000,
      singleToolFastPath: false,
      allowCandidateInspectionGuards: true,
    });
  });

  it.each([
    ['BRAIN_RUNTIME_SOURCE', 'file', 'must be one of database, environment'],
    ['BRAIN_COGNITION_MODE', 'invalid', 'must be one of rules, shadow, model'],
    ['BRAIN_PLANNER_MODE', 'MODEL', 'must be one of rules, shadow, model'],
    ['BRAIN_MODEL_SHADOW_PERCENT', '-1', 'must be between 0 and 100'],
    ['BRAIN_MODEL_CANARY_PERCENT', '101', 'must be between 0 and 100'],
    ['BRAIN_MODEL_CANARY_PERCENT', '', 'must be a finite number'],
    ['BRAIN_MODEL_MIN_CONFIDENCE', '1.1', 'must be between 0 and 1'],
    ['BRAIN_CAPABILITY_TOP_K', '0', 'must be between 1 and 20'],
    ['BRAIN_CAPABILITY_TOP_K', '2.5', 'must be an integer'],
    ['BRAIN_CAPABILITY_MIN_CONFIDENCE', '1.1', 'must be between 0 and 1'],
    ['BRAIN_MAX_PLAN_NODES', '9', 'must be between 1 and 8'],
    ['BRAIN_MAX_REPLANS', '-1', 'must be between 0 and 2'],
    ['BRAIN_TOTAL_TIMEOUT_MS', '999', 'must be between 1000 and 30000'],
    ['BRAIN_TOTAL_TIMEOUT_MS', '30001', 'must be between 1000 and 30000'],
    ['BRAIN_MODEL_TIMEOUT_MS', '20001', 'must be between 100 and 20000'],
    ['BRAIN_SINGLE_TOOL_FAST_PATH', 'yes', 'must be true or false'],
    ['BRAIN_ALLOW_CANDIDATE_INSPECTION_GUARDS', 'yes', 'must be true or false'],
  ])('rejects invalid %s=%s during startup', (key, value, expectedMessage) => {
    expect(() => createService({ [key]: value })).toThrow(`${key} ${expectedMessage}`);
  });

  it('rejects a model timeout that exceeds the total timeout', () => {
    expect(() =>
      createService({
        BRAIN_TOTAL_TIMEOUT_MS: '1000',
        BRAIN_MODEL_TIMEOUT_MS: '1001',
      }),
    ).toThrow('BRAIN_MODEL_TIMEOUT_MS must not exceed BRAIN_TOTAL_TIMEOUT_MS');
  });

  it('assigns the same requestId to a stable bucket and rollout decision', () => {
    const service = createService({
      BRAIN_MODEL_SHADOW_PERCENT: '35',
      BRAIN_MODEL_CANARY_PERCENT: '15',
    });
    const requestId = 'brain-request-20260712-001';
    const bucket = service.getStableBucket(requestId);

    expect(bucket).toBeGreaterThanOrEqual(0);
    expect(bucket).toBeLessThan(100);
    expect(Array.from({ length: 20 }, () => service.getStableBucket(requestId))).toEqual(Array(20).fill(bucket));
    expect(Array.from({ length: 20 }, () => service.isInCanary(requestId))).toEqual(
      Array(20).fill(service.isInCanary(requestId)),
    );
    expect(Array.from({ length: 20 }, () => service.isInShadow(requestId))).toEqual(
      Array(20).fill(service.isInShadow(requestId)),
    );
  });

  it('uses namespaced stable golden buckets for independent rollout cohorts', () => {
    const service = createService();
    const requestId = 'brain-request-20260712-001';

    expect(service.getStableBucket(requestId)).toBe(98);
    expect(service.getStableBucket(requestId, 'shadow')).toBe(53);
    expect(service.getStableBucket(requestId, 'canary')).toBe(38);
    expect(createService().getStableBucket(requestId, 'shadow')).toBe(53);
  });

  it('normalizes requestId whitespace before stable hashing', () => {
    const service = createService();

    expect(service.getStableBucket(' request-a ')).toBe(service.getStableBucket('request-a'));
  });

  it('is registered in BrainModule so startup validation executes', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, BrainModule) as unknown[];

    expect(providers).toContain(BrainRuntimeConfigService);
  });

  it('treats zero percent as disabled and one hundred percent as enabled', () => {
    const disabled = createService({ BRAIN_MODEL_CANARY_PERCENT: '0' });
    const enabled = createService({ BRAIN_MODEL_CANARY_PERCENT: '100' });

    expect(disabled.isInCanary('request-a')).toBe(false);
    expect(enabled.isInCanary('request-a')).toBe(true);
  });

  it('rejects an empty requestId instead of assigning an unstable bucket', () => {
    const service = createService({ BRAIN_MODEL_CANARY_PERCENT: '100' });

    expect(() => service.getStableBucket('')).toThrow('requestId must be a non-empty string');
    expect(() => service.isInCanary('')).toThrow('requestId must be a non-empty string');
  });
});
