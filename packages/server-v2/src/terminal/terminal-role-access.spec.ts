import { collectAuraUserFieldScopes, resolveAuraAvailableRolesForUser } from './terminal-role-access.js';

describe('terminal-role-access', () => {
  it('derives default field scopes from terminal role signals', () => {
    const user = {
      roles: [{ role: { key: 'ami_demo_full_beautician', permissions: ['terminal:service:start'] } }],
    };

    expect(resolveAuraAvailableRolesForUser(user)).toEqual(['beautician']);
    expect(collectAuraUserFieldScopes(user)).toMatchObject({
      customerPhone: 'masked',
      customerWechat: 'masked',
      customerBalance: 'hidden',
      staffCommission: 'hidden',
    });
  });

  it('merges multi-role field scopes with the widest allowed visibility', () => {
    const user = {
      roles: [
        { role: { key: 'ami_demo_full_beautician', permissions: ['terminal:service:start'] } },
        {
          role: {
            key: 'temporary_frontdesk',
            permissions: ['core:order:create'],
            fieldScopes: { customerPhone: 'visible', customerProfit: 'masked' },
          },
        },
      ],
    };

    expect(collectAuraUserFieldScopes(user)).toMatchObject({
      customerPhone: 'visible',
      customerWechat: 'masked',
      customerProfit: 'masked',
      staffCommission: 'hidden',
    });
  });
});
