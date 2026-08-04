import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  SERVER_ROOT,
  ensureRuntimeLayout,
  parseArgs,
  parseEnvFile,
  redact,
  writeJson,
} from './ami-dev-common.mjs';

const args = parseArgs();
const requireFromServer = createRequire(join(SERVER_ROOT, 'package.json'));
const { Client } = requireFromServer('pg');

function required(name) {
  const value = args.value(name);
  if (typeof value !== 'string' || !value.trim()) throw new Error(`缺少必填参数 --${name}。`);
  return value.trim();
}

function positiveInteger(name) {
  const value = Number(required(name));
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} 必须为正整数。`);
  return value;
}

function decimal(value) {
  if (value === null || value === undefined) return null;
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) throw new Error(`无法解析数据库数值：${String(value)}`);
  return normalized;
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function approvedDatabase(env) {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('环境文件缺少 DATABASE_URL。');
  const url = new URL(databaseUrl);
  const host = url.hostname.toLowerCase();
  const approvedHosts = String(args.value('approved-host', env.AMI_APPROVED_SUPABASE_HOSTS ?? ''))
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (!approvedHosts.length) throw new Error('必须通过 --approved-host 明确批准 Supabase Host。');
  if (!approvedHosts.includes(host)) throw new Error(`数据库 Host 未获批准：${host}`);
  if (!host.endsWith('.supabase.co') && !host.endsWith('.pooler.supabase.com')) {
    throw new Error(`目标不是 Supabase：${host}`);
  }
  return {
    connectionString: databaseUrl,
    identity: {
      host,
      port: url.port || '5432',
      database: url.pathname.replace(/^\//u, ''),
      schema: url.searchParams.get('schema') || 'public',
    },
  };
}

async function inboundReferences(client, table, id) {
  const constraints = await client.query(
    `
      SELECT
        child_ns.nspname AS child_schema,
        child.relname AS child_table,
        child_col.attname AS child_column,
        constraint_info.conname AS constraint_name,
        constraint_info.confdeltype AS delete_action
      FROM pg_constraint constraint_info
      JOIN pg_class parent ON parent.oid = constraint_info.confrelid
      JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
      JOIN pg_class child ON child.oid = constraint_info.conrelid
      JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
      JOIN LATERAL unnest(constraint_info.conkey) WITH ORDINALITY child_key(attnum, position) ON true
      JOIN LATERAL unnest(constraint_info.confkey) WITH ORDINALITY parent_key(attnum, position)
        ON parent_key.position = child_key.position
      JOIN pg_attribute child_col ON child_col.attrelid = child.oid AND child_col.attnum = child_key.attnum
      JOIN pg_attribute parent_col ON parent_col.attrelid = parent.oid AND parent_col.attnum = parent_key.attnum
      WHERE constraint_info.contype = 'f'
        AND parent_ns.nspname = 'public'
        AND parent.relname = $1
        AND parent_col.attname = 'id'
      ORDER BY child_ns.nspname, child.relname, constraint_info.conname
    `,
    [table],
  );
  const references = [];
  for (const row of constraints.rows) {
    const relation = `${quoteIdentifier(row.child_schema)}.${quoteIdentifier(row.child_table)}`;
    const column = quoteIdentifier(row.child_column);
    const count = await client.query(`SELECT count(*)::int AS count FROM ${relation} WHERE ${column} = $1`, [id]);
    references.push({
      table: `${row.child_schema}.${row.child_table}`,
      column: row.child_column,
      constraint: row.constraint_name,
      deleteAction: row.delete_action,
      count: count.rows[0].count,
    });
  }
  return references;
}

function usagePayload(usage) {
  const ignored = new Set(['id', 'idempotencyKey', 'remainingTimes', 'verifiedAt']);
  return Object.fromEntries(Object.entries(usage).filter(([key]) => !ignored.has(key)));
}

function commissionPayload(record) {
  const ignored = new Set(['id', 'sourceId', 'cardUsageRecordId', 'confirmedAt', 'createdAt']);
  return Object.fromEntries(Object.entries(record).filter(([key]) => !ignored.has(key)));
}

function movementSignature(row) {
  return {
    storeId: row.storeId,
    productId: row.productId,
    batchId: row.batchId,
    movementType: row.movementType,
    quantity: decimal(row.quantity),
    unit: row.unit,
    unitCost: decimal(row.unitCost),
    costAmount: decimal(row.costAmount),
    costSource: row.costSource,
    operatorId: row.operatorId,
    orderItemId: row.orderItemId,
  };
}

function groupedMovementSignatures(rows) {
  return rows
    .map(movementSignature)
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function buildInventoryRestoration(movements, products, batches) {
  const productMap = new Map(products.map((row) => [row.id, row]));
  const batchMap = new Map(batches.map((row) => [row.id, row]));
  const byProduct = new Map();
  const byBatch = new Map();
  for (const movement of movements) {
    const quantity = decimal(movement.quantity);
    if (!(quantity < 0)) throw new Error(`库存流水 ${movement.id} 不是负数扣减，拒绝自动恢复。`);
    byProduct.set(movement.productId, (byProduct.get(movement.productId) ?? 0) + Math.abs(quantity));
    if (movement.batchId !== null) {
      byBatch.set(movement.batchId, (byBatch.get(movement.batchId) ?? 0) + Math.abs(quantity));
    }
  }
  return {
    products: [...byProduct].map(([id, restoreQuantity]) => ({
      id,
      before: decimal(productMap.get(id)?.currentStock),
      restoreQuantity,
      after: decimal(productMap.get(id)?.currentStock) + restoreQuantity,
    })),
    batches: [...byBatch].map(([id, restoreQuantity]) => ({
      id,
      productId: batchMap.get(id)?.productId ?? null,
      before: decimal(batchMap.get(id)?.stock),
      restoreQuantity,
      after: decimal(batchMap.get(id)?.stock) + restoreQuantity,
    })),
  };
}

async function collectAudit(client, input, { lock = false } = {}) {
  const lockClause = lock ? ' FOR UPDATE' : '';
  const cardResult = await client.query(`SELECT * FROM "CustomerCard" WHERE id = $1${lockClause}`, [input.customerCardId]);
  const usageResult = await client.query(
    `SELECT * FROM "CardUsageRecord" WHERE id = ANY($1::int[]) ORDER BY id${lockClause}`,
    [[input.keepUsageId, input.removeUsageId]],
  );
  const keepUsage = usageResult.rows.find((row) => row.id === input.keepUsageId) ?? null;
  const removeUsage = usageResult.rows.find((row) => row.id === input.removeUsageId) ?? null;
  const movementResult = await client.query(
    `SELECT * FROM "StockMovement" WHERE "sourceType" = 'card_usage' AND "sourceId" = ANY($1::int[]) ORDER BY "occurredAt", id${lockClause}`,
    [[input.keepUsageId, input.removeUsageId]],
  );
  const keepMovements = movementResult.rows.filter((row) => row.sourceId === input.keepUsageId);
  const removeMovements = movementResult.rows.filter((row) => row.sourceId === input.removeUsageId);
  const productIds = [...new Set(removeMovements.map((row) => row.productId))];
  const batchIds = [...new Set(removeMovements.map((row) => row.batchId).filter((id) => id !== null))];
  const products = productIds.length
    ? (await client.query(`SELECT id, "storeId", "currentStock", "updatedAt" FROM "Product" WHERE id = ANY($1::int[]) ORDER BY id${lockClause}`, [productIds])).rows
    : [];
  const batches = batchIds.length
    ? (await client.query(`SELECT id, "productId", stock, "createdAt" FROM "StockBatch" WHERE id = ANY($1::int[]) ORDER BY id${lockClause}`, [batchIds])).rows
    : [];
  const commissionResult = await client.query(
    `SELECT * FROM "CommissionRecord" WHERE "cardUsageRecordId" = ANY($1::int[]) OR ("sourceType" = 'card_usage' AND "sourceId" = ANY($1::int[])) ORDER BY id${lockClause}`,
    [[input.keepUsageId, input.removeUsageId]],
  );
  const keepCommissions = commissionResult.rows.filter(
    (row) => row.cardUsageRecordId === input.keepUsageId || (row.sourceType === 'card_usage' && row.sourceId === input.keepUsageId),
  );
  const removeCommissions = commissionResult.rows.filter(
    (row) => row.cardUsageRecordId === input.removeUsageId || (row.sourceType === 'card_usage' && row.sourceId === input.removeUsageId),
  );
  const removeCommissionIds = removeCommissions.map((row) => row.id);
  const settlementRecords = removeCommissionIds.length
    ? (await client.query('SELECT * FROM "CommissionSettlementRecord" WHERE "commissionRecordId" = ANY($1::int[]) ORDER BY id', [removeCommissionIds])).rows
    : [];
  const commissionAdjustments = removeCommissionIds.length
    ? (await client.query('SELECT * FROM "CommissionAdjustment" WHERE "commissionRecordId" = ANY($1::int[]) ORDER BY id', [removeCommissionIds])).rows
    : [];
  const removeMovementIds = removeMovements.map((row) => row.id);
  const lifecycleReferences = removeMovementIds.length
    ? (await client.query('SELECT * FROM "LifecycleAttributionEvent" WHERE "stockMovementId" = ANY($1::int[]) ORDER BY id', [removeMovementIds])).rows
    : [];
  const laterMovements = productIds.length && removeMovements.length
    ? (await client.query(
        `SELECT id, "productId", "batchId", "movementType", quantity, "sourceType", "sourceId", "occurredAt"
         FROM "StockMovement"
         WHERE "productId" = ANY($1::int[])
           AND ("occurredAt", id) > (
             SELECT "occurredAt", id
             FROM "StockMovement"
             WHERE "sourceType" = 'card_usage' AND "sourceId" = $2
             ORDER BY "occurredAt" DESC, id DESC
             LIMIT 1
           )
         ORDER BY "occurredAt", id`,
        [productIds, input.removeUsageId],
      )).rows
    : [];
  const usageReferences = await inboundReferences(client, 'CardUsageRecord', input.removeUsageId);
  const commissionReferences = [];
  for (const id of removeCommissionIds) commissionReferences.push(await inboundReferences(client, 'CommissionRecord', id));
  const movementReferences = [];
  for (const id of removeMovementIds) movementReferences.push(await inboundReferences(client, 'StockMovement', id));
  const inventoryRestoration = buildInventoryRestoration(removeMovements, products, batches);
  const verifiedGapMs = keepUsage && removeUsage
    ? Math.abs(new Date(removeUsage.verifiedAt).getTime() - new Date(keepUsage.verifiedAt).getTime())
    : null;

  const checks = [
    { name: 'customer_card_exists', pass: cardResult.rows.length === 1, actual: cardResult.rows.length },
    { name: 'customer_card_remaining_matches', pass: cardResult.rows[0]?.remainingTimes === input.expectedCurrentRemaining, actual: cardResult.rows[0]?.remainingTimes ?? null },
    { name: 'both_usage_records_exist', pass: Boolean(keepUsage && removeUsage), actual: usageResult.rows.map((row) => row.id) },
    { name: 'usage_records_target_same_card', pass: keepUsage?.customerCardId === input.customerCardId && removeUsage?.customerCardId === input.customerCardId, actual: [keepUsage?.customerCardId, removeUsage?.customerCardId] },
    { name: 'usage_remaining_chain_matches', pass: keepUsage?.remainingTimes === input.expectedCurrentRemaining + 1 && removeUsage?.remainingTimes === input.expectedCurrentRemaining, actual: [keepUsage?.remainingTimes, removeUsage?.remainingTimes] },
    { name: 'usage_times_are_one', pass: keepUsage?.times === 1 && removeUsage?.times === 1, actual: [keepUsage?.times, removeUsage?.times] },
    { name: 'usage_business_payload_matches', pass: Boolean(keepUsage && removeUsage && sameJson(usagePayload(keepUsage), usagePayload(removeUsage))), actual: keepUsage && removeUsage ? { keep: usagePayload(keepUsage), remove: usagePayload(removeUsage) } : null },
    { name: 'usage_timestamps_are_close', pass: verifiedGapMs !== null && verifiedGapMs <= input.maxVerifiedGapMs, actual: verifiedGapMs },
    { name: 'legacy_idempotency_keys_are_null', pass: keepUsage?.idempotencyKey === null && removeUsage?.idempotencyKey === null, actual: [keepUsage?.idempotencyKey, removeUsage?.idempotencyKey] },
    { name: 'duplicate_stock_movements_exist', pass: keepMovements.length > 0 && removeMovements.length > 0, actual: [keepMovements.length, removeMovements.length] },
    { name: 'stock_movement_payload_matches', pass: sameJson(groupedMovementSignatures(keepMovements), groupedMovementSignatures(removeMovements)), actual: { keep: groupedMovementSignatures(keepMovements), remove: groupedMovementSignatures(removeMovements) } },
    { name: 'remove_stock_movements_are_negative', pass: removeMovements.every((row) => decimal(row.quantity) < 0), actual: removeMovements.map((row) => ({ id: row.id, quantity: decimal(row.quantity) })) },
    { name: 'all_products_found', pass: products.length === productIds.length, actual: { expected: productIds, found: products.map((row) => row.id) } },
    { name: 'all_batches_found', pass: batches.length === batchIds.length, actual: { expected: batchIds, found: batches.map((row) => row.id) } },
    {
      name: 'product_stock_matches_duplicate_tail',
      pass: inventoryRestoration.products.every((restoration) => {
        const rows = removeMovements.filter((row) => row.productId === restoration.id);
        return rows.length > 0
          && decimal(rows.at(-1).afterStock) === restoration.before
          && decimal(rows[0].beforeStock) === restoration.after;
      }),
      actual: inventoryRestoration.products.map((restoration) => {
        const rows = removeMovements.filter((row) => row.productId === restoration.id);
        return {
          productId: restoration.id,
          currentStock: restoration.before,
          duplicateBeforeStock: decimal(rows[0]?.beforeStock),
          duplicateAfterStock: decimal(rows.at(-1)?.afterStock),
          restoredStock: restoration.after,
        };
      }),
    },
    { name: 'no_later_stock_movements', pass: laterMovements.length === 0, actual: laterMovements },
    { name: 'one_commission_per_usage', pass: keepCommissions.length === 1 && removeCommissions.length === 1, actual: [keepCommissions.length, removeCommissions.length] },
    { name: 'commission_payload_matches', pass: keepCommissions.length === 1 && removeCommissions.length === 1 && sameJson(commissionPayload(keepCommissions[0]), commissionPayload(removeCommissions[0])), actual: keepCommissions.length === 1 && removeCommissions.length === 1 ? { keep: commissionPayload(keepCommissions[0]), remove: commissionPayload(removeCommissions[0]) } : null },
    { name: 'remove_commission_unsettled', pass: removeCommissions.length === 1 && ['pending', 'confirmed'].includes(removeCommissions[0].status) && removeCommissions[0].settledAt === null, actual: removeCommissions.map((row) => ({ id: row.id, status: row.status, settledAt: row.settledAt })) },
    { name: 'remove_commission_not_settled', pass: settlementRecords.length === 0, actual: settlementRecords.map((row) => row.id) },
    { name: 'remove_commission_not_adjusted', pass: commissionAdjustments.length === 0, actual: commissionAdjustments.map((row) => row.id) },
    { name: 'remove_movements_not_attributed', pass: lifecycleReferences.length === 0, actual: lifecycleReferences.map((row) => row.id) },
    { name: 'no_unknown_usage_references', pass: usageReferences.every((row) => row.count === 0 || (row.table === 'public.CommissionRecord' && row.column === 'cardUsageRecordId' && row.count === 1)), actual: usageReferences },
    { name: 'no_unknown_commission_references', pass: commissionReferences.every((references) => references.every((row) => row.count === 0)), actual: commissionReferences },
    { name: 'no_unknown_movement_references', pass: movementReferences.every((references) => references.every((row) => row.count === 0)), actual: movementReferences },
  ];

  return {
    checks,
    safeToApply: checks.every((item) => item.pass),
    snapshot: {
      card: cardResult.rows[0] ?? null,
      usages: usageResult.rows,
      stockMovements: movementResult.rows,
      products,
      batches,
      commissions: commissionResult.rows,
      settlementRecords,
      commissionAdjustments,
      lifecycleReferences,
      laterMovements,
      references: { usage: usageReferences, commissions: commissionReferences, movements: movementReferences },
      inventoryRestoration,
    },
  };
}

async function applyCompensation(client, input) {
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  try {
    const before = await collectAudit(client, input, { lock: true });
    if (!before.safeToApply) {
      throw new Error(`事务内安全断言失败：${before.checks.filter((item) => !item.pass).map((item) => item.name).join(', ')}`);
    }
    for (const product of before.snapshot.inventoryRestoration.products) {
      const result = await client.query(
        'UPDATE "Product" SET "currentStock" = "currentStock" + $1::numeric WHERE id = $2 AND "currentStock" = $3::numeric',
        [product.restoreQuantity, product.id, product.before],
      );
      if (result.rowCount !== 1) throw new Error(`商品 ${product.id} 库存发生并发变化。`);
    }
    for (const batch of before.snapshot.inventoryRestoration.batches) {
      const result = await client.query(
        'UPDATE "StockBatch" SET stock = stock + $1::numeric WHERE id = $2 AND stock = $3::numeric',
        [batch.restoreQuantity, batch.id, batch.before],
      );
      if (result.rowCount !== 1) throw new Error(`批次 ${batch.id} 库存发生并发变化。`);
    }
    const commissionIds = before.snapshot.commissions
      .filter((row) => row.cardUsageRecordId === input.removeUsageId || (row.sourceType === 'card_usage' && row.sourceId === input.removeUsageId))
      .map((row) => row.id);
    const movementIds = before.snapshot.stockMovements.filter((row) => row.sourceId === input.removeUsageId).map((row) => row.id);
    const commissionDelete = await client.query('DELETE FROM "CommissionRecord" WHERE id = ANY($1::int[])', [commissionIds]);
    if (commissionDelete.rowCount !== commissionIds.length) throw new Error('重复提成记录删除数量不符合预期。');
    const movementDelete = await client.query('DELETE FROM "StockMovement" WHERE id = ANY($1::int[])', [movementIds]);
    if (movementDelete.rowCount !== movementIds.length) throw new Error('重复库存流水删除数量不符合预期。');
    const usageDelete = await client.query('DELETE FROM "CardUsageRecord" WHERE id = $1', [input.removeUsageId]);
    if (usageDelete.rowCount !== 1) throw new Error('重复核销记录删除数量不符合预期。');
    const cardUpdate = await client.query(
      'UPDATE "CustomerCard" SET "remainingTimes" = "remainingTimes" + 1 WHERE id = $1 AND "remainingTimes" = $2',
      [input.customerCardId, input.expectedCurrentRemaining],
    );
    if (cardUpdate.rowCount !== 1) throw new Error('客户卡余次发生并发变化。');
    await client.query('COMMIT');
    return {
      before,
      changes: {
        restoredCardTimes: 1,
        deletedUsageIds: [input.removeUsageId],
        deletedMovementIds: movementIds,
        deletedCommissionIds: commissionIds,
        inventoryRestoration: before.snapshot.inventoryRestoration,
      },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function verifyAfterApply(client, input, changes) {
  const card = await client.query('SELECT id, "remainingTimes" FROM "CustomerCard" WHERE id = $1', [input.customerCardId]);
  const keepUsage = await client.query('SELECT id, "remainingTimes" FROM "CardUsageRecord" WHERE id = $1', [input.keepUsageId]);
  const removeUsage = await client.query('SELECT id FROM "CardUsageRecord" WHERE id = $1', [input.removeUsageId]);
  const movements = await client.query('SELECT id FROM "StockMovement" WHERE id = ANY($1::int[])', [changes.deletedMovementIds]);
  const commissions = await client.query('SELECT id FROM "CommissionRecord" WHERE id = ANY($1::int[])', [changes.deletedCommissionIds]);
  const products = changes.inventoryRestoration.products.length
    ? (await client.query('SELECT id, "currentStock" FROM "Product" WHERE id = ANY($1::int[]) ORDER BY id', [changes.inventoryRestoration.products.map((row) => row.id)])).rows
    : [];
  const batches = changes.inventoryRestoration.batches.length
    ? (await client.query('SELECT id, stock FROM "StockBatch" WHERE id = ANY($1::int[]) ORDER BY id', [changes.inventoryRestoration.batches.map((row) => row.id)])).rows
    : [];
  const checks = [
    { name: 'card_restored', pass: card.rows[0]?.remainingTimes === input.expectedCurrentRemaining + 1, actual: card.rows[0]?.remainingTimes ?? null },
    { name: 'keep_usage_retained', pass: keepUsage.rows[0]?.remainingTimes === input.expectedCurrentRemaining + 1, actual: keepUsage.rows[0] ?? null },
    { name: 'remove_usage_absent', pass: removeUsage.rowCount === 0, actual: removeUsage.rowCount },
    { name: 'remove_movements_absent', pass: movements.rowCount === 0, actual: movements.rows.map((row) => row.id) },
    { name: 'remove_commissions_absent', pass: commissions.rowCount === 0, actual: commissions.rows.map((row) => row.id) },
    { name: 'product_stock_restored', pass: changes.inventoryRestoration.products.every((expected) => decimal(products.find((row) => row.id === expected.id)?.currentStock) === expected.after), actual: products },
    { name: 'batch_stock_restored', pass: changes.inventoryRestoration.batches.every((expected) => decimal(batches.find((row) => row.id === expected.id)?.stock) === expected.after), actual: batches },
  ];
  return { passed: checks.every((item) => item.pass), checks, products, batches };
}

async function main() {
  const input = {
    customerCardId: positiveInteger('customer-card-id'),
    keepUsageId: positiveInteger('keep-usage-id'),
    removeUsageId: positiveInteger('remove-usage-id'),
    expectedCurrentRemaining: positiveInteger('expected-current-remaining'),
    maxVerifiedGapMs: Number(args.value('max-verified-gap-ms', 120_000)),
  };
  if (input.keepUsageId === input.removeUsageId) throw new Error('保留与撤销的核销记录不能相同。');
  if (!Number.isInteger(input.maxVerifiedGapMs) || input.maxVerifiedGapMs < 0 || input.maxVerifiedGapMs > 600_000) {
    throw new Error('max-verified-gap-ms 必须为 0—600000 的整数。');
  }
  const apply = args.flag('apply');
  const expectedConfirmation = `restore-card-${input.customerCardId}-remove-usage-${input.removeUsageId}`;
  if (apply && required('confirm') !== expectedConfirmation) {
    throw new Error(`确认短语不匹配；必须为 ${expectedConfirmation}`);
  }
  const envPath = resolve(args.value('env-file', join(SERVER_ROOT, '.env')));
  if (!existsSync(envPath)) throw new Error(`环境文件不存在：${envPath}`);
  const database = approvedDatabase(parseEnvFile(envPath));
  const paths = ensureRuntimeLayout();
  const output = resolve(args.value('output', join(paths.reportsDir, `card-duplicate-compensation-${Date.now()}.json`)));
  const client = new Client({
    connectionString: database.connectionString,
    application_name: apply ? 'ami_card_duplicate_compensation_apply' : 'ami_card_duplicate_compensation_audit',
    statement_timeout: 30_000,
    query_timeout: 30_000,
    connectionTimeoutMillis: 15_000,
  });
  await client.connect();
  try {
    const server = await client.query("SELECT current_database() AS database, current_setting('TimeZone') AS timezone, version() AS version");
    if (!apply) {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const audit = await collectAudit(client, input);
      await client.query('COMMIT');
      const report = {
        schemaVersion: 'ami-card-duplicate-compensation/v1',
        status: audit.safeToApply ? 'ready' : 'blocked',
        mode: 'dry-run',
        generatedAt: new Date().toISOString(),
        target: database.identity,
        server: server.rows[0],
        input,
        audit,
      };
      writeJson(output, report);
      console.log(JSON.stringify({ status: report.status, mode: report.mode, output, failedChecks: audit.checks.filter((item) => !item.pass).map((item) => item.name) }, null, 2));
      if (!audit.safeToApply) process.exitCode = 1;
      return;
    }
    const result = await applyCompensation(client, input);
    const verification = await verifyAfterApply(client, input, result.changes);
    const report = {
      schemaVersion: 'ami-card-duplicate-compensation/v1',
      status: verification.passed ? 'applied-and-verified' : 'applied-verification-failed',
      mode: 'apply',
      generatedAt: new Date().toISOString(),
      target: database.identity,
      server: server.rows[0],
      input,
      before: result.before,
      changes: result.changes,
      verification,
    };
    writeJson(output, report);
    console.log(JSON.stringify({ status: report.status, mode: report.mode, output, changes: result.changes, verification: verification.checks }, null, 2));
    if (!verification.passed) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(redact(error instanceof Error ? error.stack ?? error.message : String(error)));
  process.exitCode = 1;
});
