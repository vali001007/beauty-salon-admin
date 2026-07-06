import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns non-sensitive deployment metadata when build env is available', () => {
    process.env.ZEABUR_GIT_COMMIT_SHA = 'abc123';
    process.env.ZEABUR_GIT_BRANCH = 'main';
    process.env.ZEABUR_DEPLOYMENT_ID = 'deploy-1';
    process.env.NODE_ENV = 'production';

    const result = new HealthController().check();

    expect(result.status).toBe('ok');
    expect(result.deployment).toEqual({
      commit: 'abc123',
      branch: 'main',
      buildId: 'deploy-1',
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

    const result = new HealthController().check();

    expect(result.deployment).toEqual({
      commit: null,
      branch: null,
      buildId: null,
      environment: null,
    });
  });
});
