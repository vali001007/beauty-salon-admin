import { Prisma } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildPrismaRuntimeDataModel } from './prisma-business-definition-data-model.js';

describe('buildPrismaRuntimeDataModel', () => {
  it('builds a read-only validation model from the generated public Prisma DMMF', () => {
    const inlineSchema = readFileSync(join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8');
    const dataModel = buildPrismaRuntimeDataModel(Prisma.dmmf.datamodel.models, inlineSchema);

    expect(dataModel.models.Product.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'id', kind: 'scalar', type: 'Int', isList: false }),
        expect.objectContaining({ name: 'name', kind: 'scalar', type: 'String' }),
      ]),
    );
    expect(dataModel.models.Customer.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'id', kind: 'scalar', type: 'Int' }),
        expect.objectContaining({ name: 'productOrders', kind: 'object', type: 'ProductOrder', isList: true }),
      ]),
    );
    expect(Object.isFrozen(dataModel)).toBe(true);
    expect(Object.isFrozen(dataModel.models)).toBe(true);
    expect(Object.isFrozen(dataModel.models.Product.fields)).toBe(true);
  });

  it('treats the checked-in schema as authoritative when a shared Prisma client contains stale fields', () => {
    const result = buildPrismaRuntimeDataModel([
      {
        name: 'Store',
        fields: [
          { name: 'id', kind: 'scalar', type: 'Int' },
          { name: 'metricTargets', kind: 'object', type: 'StoreMetricTarget' },
        ],
      },
      {
        name: 'RemovedModel',
        fields: [{ name: 'id', kind: 'scalar', type: 'Int' }],
      },
    ], 'model Store {\n  id Int @id\n}');

    expect(result.models.Store?.fields).toEqual([{ name: 'id', kind: 'scalar', type: 'Int', isList: false }]);
    expect(result.models.RemovedModel).toBeUndefined();
  });

  it('preserves isList from an unpruned DMMF and fails closed when cardinality is unavailable', () => {
    const dataModel = buildPrismaRuntimeDataModel([
      {
        name: 'Customer',
        fields: [{ name: 'orders', kind: 'object', type: 'ProductOrder', isList: true }],
      },
    ]);

    expect(dataModel.models.Customer.fields[0].isList).toBe(true);
    expect(() =>
      buildPrismaRuntimeDataModel([
        { name: 'Customer', fields: [{ name: 'orders', kind: 'object', type: 'ProductOrder' }] },
      ]),
    ).toThrow('prisma_dmmf_cardinality_missing:Customer.orders');
  });
});
