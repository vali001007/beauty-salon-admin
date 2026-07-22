import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  applyBrainOntologyProductionSeedPlan,
  buildBrainOntologyProductionSeed,
  isProductionSeedApplyEnabled,
} from '../../../prisma/brain-ontology-production.seed.js';
import { PrismaBrainDefinitionSnapshotProviderService } from './prisma-brain-definition-snapshot-provider.service.js';

describe('PrismaBrainDefinitionSnapshotProviderService', () => {
  it('depends only on PrismaService', () => {
    expect(PrismaBrainDefinitionSnapshotProviderService.length).toBe(1);
  });

  it('builds the first production ontology against real Prisma model and relation field names', () => {
    const plan = buildBrainOntologyProductionSeed();

    expect(Object.fromEntries(plan.entities.map((item) => [item.entityKey, item.tableMap.model]))).toEqual({
      beautician: 'Beautician',
      customer: 'Customer',
      order: 'ProductOrder',
      order_item: 'OrderItem',
      payment: 'PaymentRecord',
      product: 'Product',
      project: 'Project',
      reservation: 'Reservation',
    });
    expect(plan.relations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromEntityKey: 'customer',
          toEntityKey: 'order',
          joinPath: { path: ['productOrders'] },
        }),
        expect.objectContaining({
          fromEntityKey: 'order',
          toEntityKey: 'order_item',
          joinPath: { path: ['orderItems'] },
        }),
        expect.objectContaining({
          fromEntityKey: 'order',
          toEntityKey: 'payment',
          joinPath: { path: ['paymentRecords'] },
        }),
        expect.objectContaining({
          fromEntityKey: 'reservation',
          toEntityKey: 'project',
          joinPath: { path: ['project'] },
        }),
      ]),
    );
  });

  it('keeps the production seed dry-run unless both --apply and --yes are explicit', () => {
    expect(isProductionSeedApplyEnabled([])).toBe(false);
    expect(isProductionSeedApplyEnabled(['--apply'])).toBe(false);
    expect(isProductionSeedApplyEnabled(['--yes'])).toBe(false);
    expect(isProductionSeedApplyEnabled(['--apply', '--yes'])).toBe(true);
  });

  it('validates and transactionally retires only legacy placeholders and superseded versions', async () => {
    const plan = buildBrainOntologyProductionSeed();
    const collection = () => ({
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      upsert: jest.fn(),
    });
    const tx = {
      brainOntologyEntity: collection(),
      brainOntologyRelation: collection(),
      brainMetric: collection(),
      brainDimension: collection(),
    };
    const prisma = {
      ...tx,
      $transaction: jest.fn(async (operation: (client: unknown) => Promise<void>) => operation(tx)),
    };

    await applyBrainOntologyProductionSeedPlan(prisma as never, plan);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
      maxWait: 5_000,
      timeout: 30_000,
    });
    expect(prisma.brainOntologyEntity.updateMany).toHaveBeenCalledWith({
      where: {
        status: 'active',
        tableMap: { path: ['strategy'], equals: 'semantic_layer_mapping_required' },
      },
      data: { status: 'archived' },
    });
    expect(prisma.brainOntologyEntity.updateMany).toHaveBeenCalledWith({
      where: {
        status: 'active',
        OR: plan.entities.map((item) => ({ entityKey: item.entityKey, version: { not: item.version } })),
      },
      data: { status: 'archived' },
    });
    expect(prisma.brainOntologyRelation.updateMany).toHaveBeenCalledWith({
      where: {
        status: 'active',
        joinPath: { path: ['strategy'], equals: 'knowledge_graph_path' },
      },
      data: { status: 'archived' },
    });
    expect(prisma.brainMetric.updateMany).toHaveBeenCalledWith({
      where: { status: 'active', sourceTables: { equals: [] } },
      data: { status: 'archived' },
    });
    expect(prisma.brainDimension.updateMany).toHaveBeenCalledWith({
      where: {
        status: 'active',
        source: { path: ['type'], equals: 'semantic_dimension' },
      },
      data: { status: 'archived' },
    });
    expect(prisma.brainOntologyEntity.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.brainOntologyEntity.upsert.mock.invocationCallOrder[0],
    );
  });

  it('rejects an invalid production mapping before opening a write transaction', async () => {
    const plan = buildBrainOntologyProductionSeed();
    plan.entities[0].tableMap.fields.name = 'missingField';
    const prisma = {
      $transaction: jest.fn(),
    };

    await expect(applyBrainOntologyProductionSeedPlan(prisma as never, plan)).rejects.toThrow(/Prisma (model|field)/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('loads only active definitions from the transaction client and adds stable definition metadata', async () => {
    const tx = {
      brainOntologyEntity: {
        findMany: jest.fn().mockResolvedValue([
          {
            domain: 'catalog',
            entityKey: 'product',
            name: '商品',
            synonyms: ['产品'],
            attributes: { statusField: 'status' },
            tableMap: { model: 'Product', fields: { name: 'name' } },
            version: 2,
          },
        ]),
      },
      brainOntologyRelation: {
        findMany: jest.fn().mockResolvedValue([
          {
            relationKey: 'customer_orders',
            fromEntityKey: 'customer',
            toEntityKey: 'order',
            name: '客户订单',
            joinPath: { path: ['productOrders'] },
            version: 3,
          },
        ]),
      },
      brainMetric: {
        findMany: jest.fn().mockResolvedValue([
          {
            metricKey: 'net_revenue',
            name: '实收金额',
            domain: 'finance',
            formula: { type: 'sum', field: 'netAmount' },
            sourceTables: [{ model: 'ProductOrder', field: 'netAmount' }],
            defaultFilters: null,
            permissions: ['core:brain:use'],
            description: '实收金额合计',
            version: 1,
          },
        ]),
      },
      brainDimension: {
        findMany: jest.fn().mockResolvedValue([
          {
            dimensionKey: 'customer_level',
            name: '会员等级',
            domain: 'customer',
            source: { model: 'Customer', field: 'memberLevel' },
            permissions: ['core:brain:use'],
            version: 1,
          },
        ]),
      },
    };
    const prisma = {
      _engineConfig: {
        inlineSchema: readFileSync(join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8'),
      },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const provider = new PrismaBrainDefinitionSnapshotProviderService(prisma as never);

    const snapshot = await provider.loadActiveDefinitions();

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'RepeatableRead' });
    expect(snapshot.entities[0]).toMatchObject({
      definitionKey: 'entity:product',
      version: 2,
      aliases: ['产品'],
    });
    expect(snapshot.relations[0].definitionKey).toBe('relation:customer_orders');
    expect(snapshot.metrics[0].definitionKey).toBe('metric:net_revenue');
    expect(snapshot.dimensions[0].definitionKey).toBe('dimension:customer_level');
    expect(snapshot.entities[0].sourceFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(provider.getRuntimeDataModel().models.Product.fields).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'name', kind: 'scalar', type: 'String' })]),
    );
  });

  it('reads all four active definition kinds inside one repeatable-read transaction snapshot', async () => {
    const tx = {
      brainOntologyEntity: { findMany: jest.fn().mockResolvedValue([]) },
      brainOntologyRelation: { findMany: jest.fn().mockResolvedValue([]) },
      brainMetric: { findMany: jest.fn().mockResolvedValue([]) },
      brainDimension: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const provider = new PrismaBrainDefinitionSnapshotProviderService(prisma as never);

    await provider.loadActiveDefinitions();

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'RepeatableRead' });
    expect(tx.brainOntologyEntity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'active' } }),
    );
    expect(tx.brainOntologyRelation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'active' } }),
    );
    expect(tx.brainMetric.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'active' } }));
    expect(tx.brainDimension.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'active' } }));
  });

  it('rejects an invalid unrelated active definition before any seed write is attempted', async () => {
    const plan = buildBrainOntologyProductionSeed();
    const collection = (rows: unknown[] = []) => ({
      findMany: jest.fn().mockResolvedValue(rows),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      upsert: jest.fn(),
    });
    const tx = {
      brainOntologyEntity: collection(),
      brainOntologyRelation: collection(),
      brainMetric: collection(),
      brainDimension: collection([
        {
          dimensionKey: 'legacy_unmapped_dimension',
          name: '未映射维度',
          domain: 'legacy',
          source: { type: 'legacy_custom_placeholder' },
          permissions: [],
          status: 'active',
          version: 1,
        },
      ]),
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };

    await expect(applyBrainOntologyProductionSeedPlan(prisma as never, plan)).rejects.toThrow(
      'dimension legacy_unmapped_dimension source must declare a Prisma model and field',
    );
    expect(tx.brainOntologyEntity.updateMany).not.toHaveBeenCalled();
    expect(tx.brainOntologyEntity.upsert).not.toHaveBeenCalled();
    expect(tx.brainOntologyRelation.updateMany).not.toHaveBeenCalled();
    expect(tx.brainOntologyRelation.upsert).not.toHaveBeenCalled();
    expect(tx.brainMetric.updateMany).not.toHaveBeenCalled();
    expect(tx.brainMetric.upsert).not.toHaveBeenCalled();
    expect(tx.brainDimension.updateMany).not.toHaveBeenCalled();
    expect(tx.brainDimension.upsert).not.toHaveBeenCalled();
  });

  it('produces the same source fingerprints for semantic collections with different order', async () => {
    const first = {
      domain: 'catalog',
      entityKey: 'product',
      name: '商品',
      synonyms: ['产品', '商品', '产品'],
      attributes: { z: 2, a: 1 },
      tableMap: { fields: { name: 'name', id: 'id' }, model: 'Product' },
      version: 1,
    };
    const second = {
      name: '商品',
      entityKey: 'product',
      domain: 'catalog',
      tableMap: { model: 'Product', fields: { id: 'id', name: 'name' } },
      attributes: { a: 1, z: 2 },
      synonyms: ['商品', '产品'],
      version: 1,
    };
    const tx = {
      brainOntologyEntity: { findMany: jest.fn().mockResolvedValueOnce([first]).mockResolvedValueOnce([second]) },
      brainOntologyRelation: { findMany: jest.fn().mockResolvedValue([]) },
      brainMetric: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            {
              metricKey: 'net_revenue',
              name: '实收金额',
              domain: 'finance',
              formula: { type: 'sum', model: 'ProductOrder', field: 'netAmount' },
              sourceTables: [
                { model: 'ProductOrder', field: 'netAmount' },
                { field: 'id', model: 'ProductOrder' },
              ],
              defaultFilters: null,
              permissions: ['finance:read', 'core:brain:use', 'finance:read'],
              description: '实收金额合计',
              version: 1,
            },
          ])
          .mockResolvedValueOnce([
            {
              metricKey: 'net_revenue',
              name: '实收金额',
              domain: 'finance',
              formula: { field: 'netAmount', model: 'ProductOrder', type: 'sum' },
              sourceTables: [
                { model: 'ProductOrder', field: 'id' },
                { model: 'ProductOrder', field: 'netAmount' },
              ],
              defaultFilters: null,
              permissions: ['core:brain:use', 'finance:read'],
              description: '实收金额合计',
              version: 1,
            },
          ]),
      },
      brainDimension: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            {
              dimensionKey: 'customer_level',
              name: '会员等级',
              domain: 'customer',
              source: { model: 'Customer', field: 'memberLevel' },
              permissions: ['customer:read', 'core:brain:use', 'customer:read'],
              version: 1,
            },
          ])
          .mockResolvedValueOnce([
            {
              dimensionKey: 'customer_level',
              name: '会员等级',
              domain: 'customer',
              source: { field: 'memberLevel', model: 'Customer' },
              permissions: ['core:brain:use', 'customer:read'],
              version: 1,
            },
          ]),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const provider = new PrismaBrainDefinitionSnapshotProviderService(prisma as never);

    const firstSnapshot = await provider.loadActiveDefinitions();
    const secondSnapshot = await provider.loadActiveDefinitions();

    expect(firstSnapshot.entities[0].sourceFingerprint).toBe(secondSnapshot.entities[0].sourceFingerprint);
    expect(firstSnapshot.metrics[0].sourceFingerprint).toBe(secondSnapshot.metrics[0].sourceFingerprint);
    expect(firstSnapshot.dimensions[0].sourceFingerprint).toBe(secondSnapshot.dimensions[0].sourceFingerprint);
    expect(firstSnapshot.entities[0].sourceFingerprint).toHaveLength(createHash('sha256').digest('hex').length);
  });

  it('reads generated Product and Customer metadata from the Prisma client schema snapshot', () => {
    const provider = new PrismaBrainDefinitionSnapshotProviderService({
      _engineConfig: {
        inlineSchema: readFileSync(join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8'),
      },
    } as never);

    const dataModel = provider.getRuntimeDataModel();

    expect(dataModel.models.Product.fields).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'name', kind: 'scalar', type: 'String' })]),
    );
    expect(dataModel.models.Customer.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'productOrders', kind: 'object', type: 'ProductOrder' }),
      ]),
    );
  });

  it('retries a serializable P2034 conflict twice and succeeds on the third transaction', async () => {
    const plan = buildBrainOntologyProductionSeed();
    const tx = transactionClient();
    let attempts = 0;
    let committedTransactions = 0;
    const prisma = {
      $transaction: jest.fn(async (operation: (client: typeof tx) => Promise<void>) => {
        attempts += 1;
        await operation(tx);
        if (attempts < 3) {
          throw { code: 'P2034' };
        }
        committedTransactions += 1;
      }),
    };

    await expect(applyBrainOntologyProductionSeedPlan(prisma as never, plan)).resolves.toBeUndefined();

    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    expect(committedTransactions).toBe(1);
  });

  it('stops after three P2034 conflicts without committing a failed transaction', async () => {
    const plan = buildBrainOntologyProductionSeed();
    let committedTransactions = 0;
    const transactionOutcome = jest.fn().mockReturnValue({ code: 'P2034' });
    const prisma = {
      $transaction: jest.fn(async (operation: (client: ReturnType<typeof transactionClient>) => Promise<void>) => {
        const tx = transactionClient();
        await operation(tx);
        const error = transactionOutcome();
        if (error) {
          throw error;
        }
        committedTransactions += 1;
      }),
    };

    await expect(applyBrainOntologyProductionSeedPlan(prisma as never, plan)).rejects.toMatchObject({ code: 'P2034' });

    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    expect(transactionOutcome).toHaveBeenCalledTimes(3);
    expect(committedTransactions).toBe(0);
  });

  it('does not retry non-P2034 transaction failures', async () => {
    const plan = buildBrainOntologyProductionSeed();
    const failure = new Error('connection closed');
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(failure),
    };

    await expect(applyBrainOntologyProductionSeedPlan(prisma as never, plan)).rejects.toBe(failure);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

function transactionClient() {
  const collection = () => ({
    findMany: jest.fn().mockResolvedValue([]),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    upsert: jest.fn().mockResolvedValue(undefined),
  });
  return {
    brainOntologyEntity: collection(),
    brainOntologyRelation: collection(),
    brainMetric: collection(),
    brainDimension: collection(),
  };
}
