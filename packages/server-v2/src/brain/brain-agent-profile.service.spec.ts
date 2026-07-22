import { BadRequestException } from '@nestjs/common';
import { BrainAgentProfileService } from './orchestrator/brain-agent-profile.service.js';

describe('BrainAgentProfileService', () => {
  const service = new BrainAgentProfileService({} as never);
  const profile = {
    roleKey: 'customer_service',
    version: 2,
    allowedSkills: ['query_followup', 'recommend_care_script'],
    dataScopeRules: { requiredPermissions: ['core:customer:view'] },
  };

  it('validates role skills and permission codes before publishing', () => {
    expect(
      service.validateForPublish({
        profile: profile as never,
        availableSkills: ['query_followup', 'recommend_care_script'],
        registeredPermissions: ['core:customer:view'],
      }),
    ).toMatchObject({ valid: true, roleKey: 'customer_service', version: 2 });
  });

  it('rejects missing skill or permission registration', () => {
    expect(() =>
      service.validateForPublish({
        profile: profile as never,
        availableSkills: ['query_followup'],
        registeredPermissions: ['core:customer:view'],
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      service.validateForPublish({
        profile: profile as never,
        availableSkills: ['query_followup', 'recommend_care_script'],
        registeredPermissions: [],
      }),
    ).toThrow('unregistered_permissions:core:customer:view');
  });

  it('projects the active profile into a bounded runtime context', async () => {
    const prisma = {
      brainAgentProfile: {
        findFirst: jest.fn().mockResolvedValue({
          roleKey: 'store_manager',
          name: ' 店长 ',
          version: 5,
          systemPrompt: ` 负责经营分析 ${'x'.repeat(5000)} `,
          allowedSkills: ['manager_summary', 123],
          dataScopeRules: { storeScope: 'current_user_visible_stores' },
          knowledgePack: { domains: ['store_operation'] },
        }),
      },
    };
    const runtime = await new BrainAgentProfileService(prisma as never).getRuntimeProfile('store_manager');

    expect(runtime).toMatchObject({
      roleKey: 'store_manager',
      name: '店长',
      version: 5,
      allowedSkills: ['manager_summary'],
    });
    expect(runtime?.systemPrompt.length).toBe(4000);
  });
});
