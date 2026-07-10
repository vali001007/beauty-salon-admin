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
});
