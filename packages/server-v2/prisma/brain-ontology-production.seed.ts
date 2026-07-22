import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildProductionReadyBusinessDefinitionSnapshot } from '../src/brain/cognition/brain-ontology-runtime.service.js';
import type { BusinessDefinitionSnapshotInput } from '../src/brain/cognition/business-definition-snapshot.types.js';
import { buildPrismaRuntimeDataModel } from '../src/brain/cognition/prisma-business-definition-data-model.js';

const SERIALIZABLE_TRANSACTION_ATTEMPTS = 3;
const SERIALIZABLE_TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 5_000,
  timeout: 30_000,
} as const;

interface ProductionOntologyEntitySeed {
  domain: string;
  entityKey: string;
  name: string;
  synonyms: string[];
  attributes: Record<string, unknown>;
  tableMap: {
    model: string;
    fields: Record<string, string>;
  };
  status: 'active';
  version: number;
}

interface ProductionOntologyRelationSeed {
  relationKey: string;
  fromEntityKey: string;
  toEntityKey: string;
  name: string;
  joinPath: { path: string[] };
  status: 'active';
  version: number;
}

interface ProductionMetricSeed {
  metricKey: string;
  name: string;
  domain: string;
  formula: Record<string, unknown>;
  sourceTables: Array<{ model: string; field: string }>;
  defaultFilters: Record<string, unknown> | null;
  permissions: string[];
  description: string;
  status: 'active';
  version: number;
}

interface ProductionDimensionSeed {
  dimensionKey: string;
  name: string;
  domain: string;
  source: { model: string; field: string };
  permissions: string[];
  status: 'active';
  version: number;
}

export interface BrainOntologyProductionSeedPlan {
  entities: ProductionOntologyEntitySeed[];
  relations: ProductionOntologyRelationSeed[];
  metrics: ProductionMetricSeed[];
  dimensions: ProductionDimensionSeed[];
}

interface ActiveOntologyEntityRow {
  domain: string;
  entityKey: string;
  name: string;
  synonyms: unknown;
  attributes: unknown;
  tableMap: unknown;
  status: string;
  version: number;
}

interface ActiveOntologyRelationRow {
  relationKey: string;
  fromEntityKey: string;
  toEntityKey: string;
  name: string;
  joinPath: unknown;
  status: string;
  version: number;
}

interface ActiveMetricRow {
  metricKey: string;
  name: string;
  domain: string;
  formula: unknown;
  sourceTables: unknown;
  defaultFilters: unknown;
  permissions: unknown;
  description: string;
  status: string;
  version: number;
}

interface ActiveDimensionRow {
  dimensionKey: string;
  name: string;
  domain: string;
  source: unknown;
  permissions: unknown;
  status: string;
  version: number;
}

interface ActiveDefinitionRows {
  entities: ActiveOntologyEntityRow[];
  relations: ActiveOntologyRelationRow[];
  metrics: ActiveMetricRow[];
  dimensions: ActiveDimensionRow[];
}

export function isProductionSeedApplyEnabled(argv: string[]): boolean {
  return argv.includes('--apply') && argv.includes('--yes');
}

export function buildBrainOntologyProductionSeed(): BrainOntologyProductionSeedPlan {
  return {
    entities: [
      ontologyEntity('catalog', 'product', '商品', ['产品', '货品', '零售商品'], 'Product', {
        id: 'id',
        storeId: 'storeId',
        sku: 'sku',
        name: 'name',
        status: 'status',
        costPrice: 'costPrice',
        retailPrice: 'retailPrice',
        currentStock: 'currentStock',
        createdAt: 'createdAt',
      }),
      ontologyEntity('catalog', 'project', '项目', ['服务', '服务项目', '护理项目'], 'Project', {
        id: 'id',
        storeId: 'storeId',
        name: 'name',
        price: 'price',
        duration: 'duration',
        status: 'status',
        online: 'online',
        createdAt: 'createdAt',
      }),
      ontologyEntity('customer', 'customer', '客户', ['顾客', '会员', '消费者'], 'Customer', {
        id: 'id',
        storeId: 'storeId',
        name: 'name',
        memberLevel: 'memberLevel',
        totalSpent: 'totalSpent',
        visitCount: 'visitCount',
        lastVisitDate: 'lastVisitDate',
        createdAt: 'createdAt',
      }),
      ontologyEntity('staff', 'beautician', '美容师', ['技师', '服务人员', '手艺人'], 'Beautician', {
        id: 'id',
        storeId: 'storeId',
        userId: 'userId',
        name: 'name',
        status: 'status',
        createdAt: 'createdAt',
      }),
      ontologyEntity('order', 'order', '订单', ['销售单', '消费单', '结算单'], 'ProductOrder', {
        id: 'id',
        orderNo: 'orderNo',
        customerId: 'customerId',
        storeId: 'storeId',
        totalAmount: 'totalAmount',
        netAmount: 'netAmount',
        status: 'status',
        createdAt: 'createdAt',
      }),
      ontologyEntity('order', 'order_item', '订单明细', ['订单项', '消费明细', '销售明细'], 'OrderItem', {
        id: 'id',
        orderId: 'orderId',
        itemType: 'itemType',
        itemId: 'itemId',
        name: 'name',
        quantity: 'quantity',
        unitPrice: 'unitPrice',
        netAmount: 'netAmount',
        beauticianId: 'beauticianId',
        createdAt: 'createdAt',
      }),
      ontologyEntity('finance', 'payment', '支付记录', ['支付', '收款', '付款记录'], 'PaymentRecord', {
        id: 'id',
        orderId: 'orderId',
        paymentNo: 'paymentNo',
        method: 'method',
        amount: 'amount',
        status: 'status',
        paidAt: 'paidAt',
        createdAt: 'createdAt',
      }),
      ontologyEntity('reservation', 'reservation', '预约', ['预约单', '到店预约', '服务预约'], 'Reservation', {
        id: 'id',
        storeId: 'storeId',
        customerId: 'customerId',
        projectId: 'projectId',
        beauticianId: 'beauticianId',
        date: 'date',
        startTime: 'startTime',
        status: 'status',
        createdAt: 'createdAt',
      }),
    ],
    relations: [
      ontologyRelation('customer_orders', 'customer', 'order', '客户的订单', ['productOrders']),
      ontologyRelation('customer_reservations', 'customer', 'reservation', '客户的预约', ['reservations']),
      ontologyRelation('beautician_order_items', 'beautician', 'order_item', '美容师服务明细', ['orderItems']),
      ontologyRelation('beautician_reservations', 'beautician', 'reservation', '美容师预约', ['reservations']),
      ontologyRelation('order_items', 'order', 'order_item', '订单包含明细', ['orderItems']),
      ontologyRelation('order_payments', 'order', 'payment', '订单支付记录', ['paymentRecords']),
      ontologyRelation('reservation_customer', 'reservation', 'customer', '预约客户', ['customer']),
      ontologyRelation('reservation_project', 'reservation', 'project', '预约项目', ['project']),
      ontologyRelation('reservation_beautician', 'reservation', 'beautician', '预约美容师', ['beautician']),
    ],
    metrics: [
      {
        metricKey: 'net_revenue',
        name: '实收金额',
        domain: 'finance',
        formula: { type: 'sum', field: 'netAmount', model: 'ProductOrder' },
        sourceTables: [{ model: 'ProductOrder', field: 'netAmount' }],
        defaultFilters: { status: ['completed'] },
        permissions: ['core:brain:use'],
        description: '已完成订单的实收金额合计。',
        status: 'active',
        version: 1,
      },
      {
        metricKey: 'payment_amount',
        name: '支付金额',
        domain: 'finance',
        formula: { type: 'sum', field: 'amount', model: 'PaymentRecord' },
        sourceTables: [{ model: 'PaymentRecord', field: 'amount' }],
        defaultFilters: { status: ['paid', 'success', 'completed'] },
        permissions: ['core:brain:use'],
        description: '有效支付记录的金额合计。',
        status: 'active',
        version: 1,
      },
    ],
    dimensions: [
      dimension('store', '门店', 'operations', 'ProductOrder', 'storeId'),
      dimension('customer_level', '会员等级', 'customer', 'Customer', 'memberLevel'),
      dimension('order_status', '订单状态', 'order', 'ProductOrder', 'status'),
      dimension('payment_method', '支付方式', 'finance', 'PaymentRecord', 'method'),
      dimension('reservation_date', '预约日期', 'reservation', 'Reservation', 'date'),
      dimension('beautician', '美容师', 'staff', 'Beautician', 'id'),
    ],
  };
}

function ontologyEntity(
  domain: string,
  entityKey: string,
  name: string,
  synonyms: string[],
  model: string,
  fields: Record<string, string>,
): ProductionOntologyEntitySeed {
  return {
    domain,
    entityKey,
    name,
    synonyms,
    attributes: { definitionLevel: 'production', ownership: 'ami_brain' },
    tableMap: { model, fields },
    status: 'active',
    version: 1,
  };
}

function ontologyRelation(
  relationKey: string,
  fromEntityKey: string,
  toEntityKey: string,
  name: string,
  path: string[],
): ProductionOntologyRelationSeed {
  return {
    relationKey,
    fromEntityKey,
    toEntityKey,
    name,
    joinPath: { path },
    status: 'active',
    version: 1,
  };
}

function dimension(
  dimensionKey: string,
  name: string,
  domain: string,
  model: string,
  field: string,
): ProductionDimensionSeed {
  return {
    dimensionKey,
    name,
    domain,
    source: { model, field },
    permissions: ['core:brain:use'],
    status: 'active',
    version: 1,
  };
}

export async function applyBrainOntologyProductionSeedPlan(
  prisma: PrismaClient,
  plan: BrainOntologyProductionSeedPlan,
  options: { schemaPath?: string } = {},
): Promise<void> {
  const schema = readFileSync(options.schemaPath ?? defaultPrismaSchemaPath(), 'utf8');
  const runtimeDataModel = buildPrismaRuntimeDataModel(Prisma.dmmf.datamodel.models, schema);
  buildProductionReadyBusinessDefinitionSnapshot(seedPlanToSnapshotInput(plan), runtimeDataModel);
  for (let attempt = 1; attempt <= SERIALIZABLE_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      await prisma.$transaction(async (tx) => {
        const activeDefinitions = await readActiveDefinitions(tx);
        const postState = simulatePostState(activeDefinitions, plan);
        buildProductionReadyBusinessDefinitionSnapshot(activeRowsToSnapshotInput(postState), runtimeDataModel);
        await publishPlan(tx, plan);
      }, SERIALIZABLE_TRANSACTION_OPTIONS);
      return;
    } catch (error) {
      if (!isPrismaWriteConflict(error) || attempt === SERIALIZABLE_TRANSACTION_ATTEMPTS) {
        throw error;
      }
    }
  }
}

function isPrismaWriteConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034';
}

async function readActiveDefinitions(prisma: Prisma.TransactionClient): Promise<ActiveDefinitionRows> {
  const [entities, relations, metrics, dimensions] = await Promise.all([
    prisma.brainOntologyEntity.findMany({
      where: { status: 'active' },
      orderBy: [{ domain: 'asc' }, { entityKey: 'asc' }, { version: 'desc' }],
    }),
    prisma.brainOntologyRelation.findMany({
      where: { status: 'active' },
      orderBy: [{ relationKey: 'asc' }, { version: 'desc' }],
    }),
    prisma.brainMetric.findMany({
      where: { status: 'active' },
      orderBy: [{ domain: 'asc' }, { metricKey: 'asc' }, { version: 'desc' }],
    }),
    prisma.brainDimension.findMany({
      where: { status: 'active' },
      orderBy: [{ domain: 'asc' }, { dimensionKey: 'asc' }, { version: 'desc' }],
    }),
  ]);
  return { entities, relations, metrics, dimensions };
}

function simulatePostState(
  activeDefinitions: ActiveDefinitionRows,
  plan: BrainOntologyProductionSeedPlan,
): ActiveDefinitionRows {
  return {
    entities: simulateDefinitionKind(
      activeDefinitions.entities,
      plan.entities,
      (item) => item.entityKey,
      (item) => asRecord(item.tableMap).strategy === 'semantic_layer_mapping_required',
    ),
    relations: simulateDefinitionKind(
      activeDefinitions.relations,
      plan.relations,
      (item) => item.relationKey,
      (item) => asRecord(item.joinPath).strategy === 'knowledge_graph_path',
    ),
    metrics: simulateDefinitionKind(
      activeDefinitions.metrics,
      plan.metrics,
      (item) => item.metricKey,
      (item) => Array.isArray(item.sourceTables) && item.sourceTables.length === 0,
    ),
    dimensions: simulateDefinitionKind(
      activeDefinitions.dimensions,
      plan.dimensions,
      (item) => item.dimensionKey,
      (item) => asRecord(item.source).type === 'semantic_dimension',
    ),
  };
}

function simulateDefinitionKind<T extends { version: number }>(
  activeDefinitions: T[],
  planDefinitions: T[],
  getKey: (definition: T) => string,
  isPlaceholder: (definition: T) => boolean,
): T[] {
  const plannedVersions = new Map(planDefinitions.map((item) => [getKey(item), item.version]));
  const postState = new Map<string, T>();
  for (const item of activeDefinitions) {
    const key = getKey(item);
    const plannedVersion = plannedVersions.get(key);
    if (isPlaceholder(item) || (plannedVersion !== undefined && item.version !== plannedVersion)) {
      continue;
    }
    postState.set(`${key}\u0000${item.version}`, item);
  }
  for (const item of planDefinitions) {
    postState.set(`${getKey(item)}\u0000${item.version}`, item);
  }
  return Array.from(postState.values()).sort(
    (left, right) => getKey(left).localeCompare(getKey(right)) || left.version - right.version,
  );
}

async function publishPlan(prisma: Prisma.TransactionClient, plan: BrainOntologyProductionSeedPlan): Promise<void> {
  await prisma.brainOntologyEntity.updateMany({
    where: {
      status: 'active',
      tableMap: { path: ['strategy'], equals: 'semantic_layer_mapping_required' },
    },
    data: { status: 'archived' },
  });
  await prisma.brainOntologyEntity.updateMany({
    where: {
      status: 'active',
      OR: plan.entities.map((item) => ({ entityKey: item.entityKey, version: { not: item.version } })),
    },
    data: { status: 'archived' },
  });
  await prisma.brainOntologyRelation.updateMany({
    where: {
      status: 'active',
      joinPath: { path: ['strategy'], equals: 'knowledge_graph_path' },
    },
    data: { status: 'archived' },
  });
  await prisma.brainOntologyRelation.updateMany({
    where: {
      status: 'active',
      OR: plan.relations.map((item) => ({ relationKey: item.relationKey, version: { not: item.version } })),
    },
    data: { status: 'archived' },
  });
  await prisma.brainMetric.updateMany({
    where: { status: 'active', sourceTables: { equals: [] } },
    data: { status: 'archived' },
  });
  await prisma.brainMetric.updateMany({
    where: {
      status: 'active',
      OR: plan.metrics.map((item) => ({ metricKey: item.metricKey, version: { not: item.version } })),
    },
    data: { status: 'archived' },
  });
  await prisma.brainDimension.updateMany({
    where: {
      status: 'active',
      source: { path: ['type'], equals: 'semantic_dimension' },
    },
    data: { status: 'archived' },
  });
  await prisma.brainDimension.updateMany({
    where: {
      status: 'active',
      OR: plan.dimensions.map((item) => ({ dimensionKey: item.dimensionKey, version: { not: item.version } })),
    },
    data: { status: 'archived' },
  });

  for (const item of plan.entities) {
    const create = item as unknown as Prisma.BrainOntologyEntityUncheckedCreateInput;
    const update = item as unknown as Prisma.BrainOntologyEntityUncheckedUpdateInput;
    await prisma.brainOntologyEntity.upsert({
      where: { entityKey_version: { entityKey: item.entityKey, version: item.version } },
      update,
      create,
    });
  }
  for (const item of plan.relations) {
    const create = item as unknown as Prisma.BrainOntologyRelationUncheckedCreateInput;
    const update = item as unknown as Prisma.BrainOntologyRelationUncheckedUpdateInput;
    await prisma.brainOntologyRelation.upsert({
      where: { relationKey_version: { relationKey: item.relationKey, version: item.version } },
      update,
      create,
    });
  }
  for (const item of plan.metrics) {
    const create = item as unknown as Prisma.BrainMetricUncheckedCreateInput;
    const update = item as unknown as Prisma.BrainMetricUncheckedUpdateInput;
    await prisma.brainMetric.upsert({
      where: { metricKey_version: { metricKey: item.metricKey, version: item.version } },
      update,
      create,
    });
  }
  for (const item of plan.dimensions) {
    const create = item as unknown as Prisma.BrainDimensionUncheckedCreateInput;
    const update = item as unknown as Prisma.BrainDimensionUncheckedUpdateInput;
    await prisma.brainDimension.upsert({
      where: {
        dimensionKey_version: { dimensionKey: item.dimensionKey, version: item.version },
      },
      update,
      create,
    });
  }
}

function seedPlanToSnapshotInput(plan: BrainOntologyProductionSeedPlan): BusinessDefinitionSnapshotInput {
  return activeRowsToSnapshotInput(plan);
}

function activeRowsToSnapshotInput(rows: ActiveDefinitionRows): BusinessDefinitionSnapshotInput {
  return {
    entities: rows.entities.map((item) => {
      const definition = {
        domain: item.domain,
        entityKey: item.entityKey,
        name: item.name,
        aliases: stringArray(item.synonyms),
        attributes: item.attributes,
        tableMap: item.tableMap,
        version: item.version,
      };
      return withMetadata('entity', item.entityKey, definition);
    }),
    relations: rows.relations.map((item) => {
      const definition = {
        relationKey: item.relationKey,
        fromEntityKey: item.fromEntityKey,
        toEntityKey: item.toEntityKey,
        name: item.name,
        joinPath: item.joinPath,
        version: item.version,
      };
      return withMetadata('relation', item.relationKey, definition);
    }),
    metrics: rows.metrics.map((item) => {
      const definition = {
        metricKey: item.metricKey,
        name: item.name,
        domain: item.domain,
        formula: item.formula,
        source: item.sourceTables,
        defaultFilters: item.defaultFilters,
        permissions: item.permissions,
        description: item.description,
        version: item.version,
      };
      return withMetadata('metric', item.metricKey, definition);
    }),
    dimensions: rows.dimensions.map((item) => {
      const definition = {
        dimensionKey: item.dimensionKey,
        name: item.name,
        domain: item.domain,
        source: item.source,
        permissions: item.permissions,
        version: item.version,
      };
      return withMetadata('dimension', item.dimensionKey, definition);
    }),
  };
}

function withMetadata<T extends Record<string, unknown>>(kind: string, key: string, definition: T) {
  const fingerprint = createHash('sha256').update(stableStringify(definition)).digest('hex');
  return {
    definitionKey: `${kind}:${key}`,
    definitionFingerprint: fingerprint,
    sourceFingerprint: fingerprint,
    ...definition,
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

async function main(): Promise<void> {
  const apply = isProductionSeedApplyEnabled(process.argv.slice(2));
  const plan = buildBrainOntologyProductionSeed();
  const report = {
    mode: apply ? 'apply' : 'dry-run',
    entities: plan.entities.length,
    relations: plan.relations.length,
    metrics: plan.metrics.length,
    dimensions: plan.dimensions.length,
  };

  if (!apply) {
    console.log(JSON.stringify(report, null, 2));
    console.log('写库需显式传入 --apply --yes；当前未连接数据库。');
    return;
  }

  const entryDirectory = dirname(resolve(process.argv[1] ?? ''));
  config({ path: resolve(entryDirectory, '..', '.env') });
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for --apply --yes');
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DATABASE_POOL_MAX || 3),
      idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 10000),
      connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
    }),
  });
  try {
    await applyBrainOntologyProductionSeedPlan(prisma, plan);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

function defaultPrismaSchemaPath(): string {
  if (typeof __dirname === 'string') return resolve(__dirname, 'schema.prisma');
  const entryPath = resolve(process.argv[1] ?? '');
  if (/brain-ontology-production\.seed\.(?:ts|js)$/.test(entryPath)) {
    return resolve(dirname(entryPath), 'schema.prisma');
  }
  throw new Error('prisma_schema_path_required_for_external_seed_call');
}

const isDirectExecution = /brain-ontology-production\.seed\.(?:ts|js)$/.test(resolve(process.argv[1] ?? ''));

if (isDirectExecution) {
  main().catch((error) => {
    console.error(
      JSON.stringify(
        {
          status: 'failed',
          message: 'Brain ontology production seed failed.',
          details: error instanceof Error ? error.message : String(error),
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  });
}
