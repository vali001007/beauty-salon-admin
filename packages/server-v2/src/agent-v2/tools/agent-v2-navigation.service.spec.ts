import { AgentV2NavigationService } from './agent-v2-navigation.service.js';

describe('AgentV2NavigationService', () => {
  const service = new AgentV2NavigationService();

  it('returns cashier navigation action without writing business data', async () => {
    const result = await service.execute(
      { capabilityId: 'navigation.cashier.open' },
      { runId: 1, storeId: 1, userId: 1, role: 'manager' },
    );

    expect(result.status).toBe('success');
    expect(result.title).toBe('打开收银界面');
    expect(result.data).toMatchObject({
      actionCommand: 'operation.cashier',
      launchMode: 'terminal_micro_app',
      writeScope: 'none',
    });
    expect(result.actions?.[0]).toMatchObject({
      label: '打开收银界面',
      action: 'navigation:operation.cashier',
      riskLevel: 'low',
    });
    expect(result.evidence?.limitations?.[0]).toContain('不直接写入业务数据');
  });

  it('returns card usage navigation action for terminal or admin route', async () => {
    const result = await service.execute(
      { capabilityId: 'navigation.card-usage.open' },
      { runId: 1, storeId: 1, userId: 1, role: 'manager' },
    );

    expect(result.status).toBe('success');
    expect(result.title).toBe('打开次卡核销界面');
    expect(result.data).toMatchObject({
      terminalActionCommand: 'operation.verify',
      adminRoute: '/orders/card-usage',
      launchMode: 'terminal_or_admin_route',
      writeScope: 'none',
    });
    expect(result.actions?.[0]).toMatchObject({
      label: '打开核销界面',
      action: 'navigation:operation.verify',
      riskLevel: 'low',
    });
  });

  it('rejects unknown navigation capability', async () => {
    const result = await service.execute(
      { capabilityId: 'navigation.unknown.open' },
      { runId: 1, storeId: 1, userId: 1, role: 'manager' },
    );

    expect(result.status).toBe('unsupported');
    expect(result.data).toMatchObject({ capabilityId: 'navigation.unknown.open' });
  });
});
