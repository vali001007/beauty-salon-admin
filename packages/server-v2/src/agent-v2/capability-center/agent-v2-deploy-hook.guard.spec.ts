import { ForbiddenException } from '@nestjs/common';
import { AgentV2DeployHookGuard } from './agent-v2-deploy-hook.guard.js';

describe('AgentV2DeployHookGuard', () => {
  const originalToken = process.env.AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN;

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN;
    } else {
      process.env.AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN = originalToken;
    }
  });

  function context(headers: Record<string, string>) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          header: (name: string) => headers[name.toLowerCase()],
        }),
      }),
    } as any;
  }

  it('accepts the configured deploy token from header', () => {
    process.env.AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN = 'deploy-secret';
    const guard = new AgentV2DeployHookGuard();

    expect(guard.canActivate(context({ 'x-agent-v2-deploy-token': 'deploy-secret' }))).toBe(true);
  });

  it('rejects deploy hooks when token is missing or invalid', () => {
    process.env.AGENT_V2_AUTO_PUBLISH_DEPLOY_TOKEN = 'deploy-secret';
    const guard = new AgentV2DeployHookGuard();

    expect(() => guard.canActivate(context({ 'x-agent-v2-deploy-token': 'bad-secret' }))).toThrow(ForbiddenException);
  });
});
