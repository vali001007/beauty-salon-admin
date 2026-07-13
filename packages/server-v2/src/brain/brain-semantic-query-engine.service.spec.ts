import { BrainQueryCompilerService } from './semantic/brain-query-compiler.service.js';

describe('BrainQueryCompilerService', () => {
  const compiler = new BrainQueryCompilerService();

  it('rejects unknown metrics instead of inventing formulas', () => {
    expect(() =>
      compiler.compile({
        metrics: ['老板开心指数'],
        dimensions: ['date'],
        filters: [],
        storeId: 1,
        permissions: ['*'],
      }),
    ).toThrow('unsupported_metric:老板开心指数');
  });

  it('injects store scope and read-only guard', () => {
    const query = compiler.compile({
      metrics: ['appointment_count'],
      dimensions: ['date'],
      filters: [{ field: 'date', op: 'between', value: ['2026-07-01', '2026-07-10'] }],
      storeId: 1,
      permissions: ['core:store:reservations'],
    });

    expect(query.sql.toLowerCase()).toContain('select');
    expect(query.sql.toLowerCase()).not.toContain('insert');
    expect(query.params).toContain(1);
  });

  it('uses real supported formulas instead of hardcoded zero values', () => {
    for (const metric of ['appointment_count', 'paid_revenue', 'repurchase_rate', 'stockout_sku_count']) {
      const query = compiler.compile({
        metrics: [metric],
        dimensions: ['date'],
        filters: [],
        storeId: 1,
        permissions: ['*'],
      });

      expect(query.sql).not.toMatch(/\b0::(float|int|numeric)\b/i);
      expect(query.sql).not.toContain('"MemberCard"');
      expect(query.sql).not.toContain('"MarketingCampaign"');
    }
  });

  it('routes stock batch metrics through Product store scope instead of a missing StockBatch.storeId column', () => {
    const query = compiler.compile({
      metrics: ['expiring_stock_value'],
      dimensions: ['date'],
      filters: [],
      storeId: 1,
      permissions: ['*'],
    });

    expect(query.sql).toContain('"StockBatch"');
    expect(query.sql).toContain('"Product"');
    expect(query.sql).toContain('"Product"."storeId"');
    expect(query.sql).not.toMatch(/"StockBatch"\."storeId"/);
  });

  it('refuses metrics whose store-scoped formula is not implemented instead of reporting a fake zero', () => {
    expect(() =>
      compiler.compile({
        metrics: ['marketing_roi'],
        dimensions: [],
        filters: [],
        storeId: 1,
        permissions: ['*'],
      }),
    ).toThrow('unsupported_metric_formula:marketing_roi');
  });

  it('compiles paid revenue ranking by beautician as grouped query shape', () => {
    const query = compiler.compile({
      metrics: ['paid_revenue'],
      dimensions: ['beautician'],
      filters: [{ field: 'date', op: 'between', value: ['2026-07-01', '2026-07-10'] }],
      storeId: 1,
      permissions: ['*'],
      answerShape: 'ranking',
      groupBy: 'beautician',
      limit: 5,
    });

    expect(query.queryKey).toBe('paid_revenue_by_beautician');
    expect(query.answerShape).toBe('ranking');
    expect(query.groupBy).toBe('beautician');
    expect(query.sql).toContain('"OrderItem"');
    expect(query.sql.toLowerCase()).toContain('order by paid_revenue desc');
  });

  it('compiles paid revenue comparison as comparison query shape', () => {
    const query = compiler.compile({
      metrics: ['paid_revenue'],
      dimensions: ['date'],
      filters: [
        { field: 'date', op: 'between', value: ['2026-07-01', '2026-07-10'] },
        { field: 'previous_date', op: 'between', value: ['2026-06-01', '2026-06-30'] },
      ],
      storeId: 1,
      permissions: ['*'],
      answerShape: 'comparison',
    });

    expect(query.queryKey).toBe('paid_revenue_comparison');
    expect(query.answerShape).toBe('comparison');
    expect(query.valueField).toBe('current_value');
    expect(query.comparison).toMatchObject({
      current: { startDate: new Date('2026-07-01'), endDate: new Date('2026-07-10') },
      previous: { startDate: new Date('2026-06-01'), endDate: new Date('2026-06-30') },
    });
    expect(query.sql.toLowerCase()).toContain('current_value');
    expect(query.sql.toLowerCase()).toContain('previous_value');
    expect(query.sql.toLowerCase()).toContain('delta_rate');
  });

  it('refuses date-filtered card liability instead of using card creation time as liability period', () => {
    expect(() =>
      compiler.compile({
        metrics: ['card_liability'],
        dimensions: ['date'],
        filters: [{ field: 'date', op: 'between', value: ['2026-07-01', '2026-07-10'] }],
        storeId: 1,
        permissions: ['*'],
      }),
    ).toThrow('unsupported_metric_formula:card_liability_period');
  });

  it('labels low-stock metric as current safety-stock warning', () => {
    const query = compiler.compile({
      metrics: ['stockout_sku_count'],
      dimensions: ['date'],
      filters: [{ field: 'date', op: 'between', value: ['2026-07-01', '2026-07-10'] }],
      storeId: 1,
      permissions: ['*'],
    });

    expect(query.label).toBe('低库存 SKU 数');
    expect(query.citations[0].definition).toContain('安全库存大于 0');
    expect(query.sql).toContain('"safetyStock" > 0');
    expect(query.sql).toContain('"currentStock" < "safetyStock"');
    expect(query.sql).not.toContain('"Product"."createdAt"');
  });
});
