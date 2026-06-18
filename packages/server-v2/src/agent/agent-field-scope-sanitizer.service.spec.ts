import { AgentFieldScopeSanitizerService } from './agent-field-scope-sanitizer.service.js';

describe('AgentFieldScopeSanitizerService', () => {
  const service = new AgentFieldScopeSanitizerService();

  it('removes hidden financial and remark fields from nested tool result data', () => {
    const result = service.sanitize(
      {
        status: 'success',
        title: '字段权限测试',
        summary: '余额 ¥1,200，成本 ¥300，毛利 ¥900，提成 ¥120，备注 老客敏感。',
        data: {
          phone: '13812345678',
          totalBalanceText: '¥1,200',
          materialCost: 300,
          grossProfit: 900,
          commissionAmount: 120,
          remark: '老客敏感',
          nested: {
            costPrice: 80,
            profitRate: 0.25,
            note: '内部备注',
          },
        },
      },
      {
        customerPhone: 'masked',
        customerBalance: 'hidden',
        customerCost: 'hidden',
        customerProfit: 'masked',
        staffCommission: 'hidden',
        customerRemark: 'hidden',
      },
    );

    expect(result.summary).toContain('余额 已隐藏');
    expect(result.summary).toContain('成本 已隐藏');
    expect(result.summary).toContain('毛利 已脱敏');
    expect(result.summary).toContain('提成 已隐藏');
    expect(result.data).toMatchObject({
      phone: '138****5678',
      grossProfit: '已脱敏',
      nested: { profitRate: '已脱敏' },
    });
    const serialized = JSON.stringify(result.data);
    expect(serialized).not.toContain('¥1,200');
    expect(serialized).not.toContain('materialCost');
    expect(serialized).not.toContain('commissionAmount');
    expect(serialized).not.toContain('老客敏感');
    expect(serialized).not.toContain('costPrice');
    expect(serialized).not.toContain('内部备注');
  });

  it('reports protected scopes for eval and browser gates', () => {
    expect(
      service.inspect({
        customerPhone: 'masked',
        customerBalance: 'hidden',
        customerCost: 'visible',
        staffCommission: 'hidden',
      }),
    ).toEqual({
      enabled: true,
      protectedScopes: ['customerPhone', 'customerBalance', 'staffCommission'],
    });
  });
});
