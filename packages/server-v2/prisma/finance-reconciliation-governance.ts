import 'reflect-metadata';
import { config } from 'dotenv';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

config({ path: resolve(import.meta.dirname, '..', '.env') });

const apply = process.argv.includes('--apply');
const yes = process.argv.includes('--yes');
const backupOnly = process.argv.includes('--backup-only');
if (apply && !yes) throw new Error('真实治理必须同时传入 --apply --yes');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: 1 });
const prisma = new PrismaClient({ adapter });
const dateFrom = '2026-07-07';
const dateTo = '2026-07-13';
const blockingCodes = [
  'daily_amount_mismatch',
  'cash_shift_diff',
  'refund_without_items',
  'refund_item_amount_mismatch',
  'return_refund_without_stock_movement',
  'refund_only_with_stock_movement',
  'refund_without_commission_adjustment',
  'over_refunded',
  'partial_refund_marked_full',
  'manual_adjustment_pending',
  'auto_task_failure',
];

type TableRow = { table_name: string };
type SettlementRow = {
  id: number;
  storeId: number;
  settleDate: Date;
  status: string;
  totalRevenue: unknown;
  refundAmount: unknown;
  confirmedBy: number | null;
  confirmedAt: Date | null;
};
type IssueRow = { dailySettlementId: number | null; code: string; category: string; severity: string; status: string; amount: unknown; title: string; detail: string };

async function writeBackupFile(payload: Record<string, unknown>) {
  const backupDir = resolve(import.meta.dirname, '..', '..', '..', 'outputs', 'finance-reconciliation-governance');
  await mkdir(backupDir, { recursive: true });
  const backupPath = resolve(backupDir, `daily-settlement-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await writeFile(backupPath, JSON.stringify({ createdAt: new Date().toISOString(), ...payload }, null, 2), 'utf8');
  return backupPath;
}

async function main() {
  const tables = await prisma.$queryRaw<TableRow[]>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('FinanceReconciliationRun', 'FinanceReconciliationIssue', 'DailySettlementAdjustment')
  `;
  const automationSchemaApplied = tables.length === 3;
  const settlements = await prisma.$queryRaw<SettlementRow[]>`
    SELECT id, "storeId", "settleDate", status, "totalRevenue", "refundAmount", "confirmedBy", "confirmedAt"
    FROM "DailySettlement"
    WHERE "settleDate" >= ${new Date(`${dateFrom}T00:00:00.000Z`)}
      AND "settleDate" <= ${new Date(`${dateTo}T00:00:00.000Z`)}
    ORDER BY "settleDate", "storeId"
  `;

  const issues = automationSchemaApplied
    ? await prisma.$queryRawUnsafe<IssueRow[]>(
        `SELECT "dailySettlementId", code, category, severity, status, amount, title, detail
         FROM "FinanceReconciliationIssue"
         WHERE "businessDate" >= $1 AND "businessDate" <= $2
           AND status IN ('open', 'acknowledged')`,
        new Date(`${dateFrom}T00:00:00.000Z`),
        new Date(`${dateTo}T00:00:00.000Z`),
      )
    : [];
  const snapshots = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT * FROM "DailySettlementSnapshot" ORDER BY "dailySettlementId", version`,
  );
  const financeMigrations = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT migration_name, started_at, finished_at, rolled_back_at, applied_steps_count
     FROM "_prisma_migrations"
     WHERE migration_name LIKE '%finance%' OR migration_name LIKE '%daily_settlement%'
     ORDER BY started_at`,
  );
  const runStatusRows = automationSchemaApplied
    ? await prisma.$queryRawUnsafe<Array<{ status: string; count: bigint }>>(
        `SELECT status, COUNT(*) AS count FROM "FinanceReconciliationRun"
         WHERE "businessDate" >= $1 AND "businessDate" <= $2 GROUP BY status ORDER BY status`,
        new Date(`${dateFrom}T00:00:00.000Z`),
        new Date(`${dateTo}T00:00:00.000Z`),
      )
    : [];
  const issueBySettlement = new Map<number, IssueRow[]>();
  for (const issue of issues) {
    if (!issue.dailySettlementId) continue;
    issueBySettlement.set(issue.dailySettlementId, [...(issueBySettlement.get(issue.dailySettlementId) ?? []), issue]);
  }

  const classifications = settlements.map((settlement) => {
    const settlementIssues = issueBySettlement.get(settlement.id) ?? [];
    const blocking = settlementIssues.filter((issue) => blockingCodes.includes(issue.code));
    const integrity = settlementIssues.filter((issue) => issue.category === 'data_integrity');
    const category = !automationSchemaApplied
      ? 'manual_review'
      : integrity.length
        ? 'system_data_defect'
        : blocking.length
          ? 'manual_review'
          : settlement.status === 'draft'
            ? 'auto_repair'
            : 'no_action';
    return {
      id: settlement.id,
      storeId: settlement.storeId,
      businessDate: settlement.settleDate.toISOString().slice(0, 10),
      status: settlement.status,
      totalRevenue: Number(settlement.totalRevenue ?? 0),
      refundAmount: Number(settlement.refundAmount ?? 0),
      category,
      blockers: blocking.map((issue) => issue.code),
      blockerDetails: blocking.map((issue) => ({ code: issue.code, amount: issue.amount === null ? null : Number(issue.amount), title: issue.title, detail: issue.detail })),
    };
  });

  const report = {
    mode: backupOnly ? 'backup-only/read-only' : apply ? 'apply' : 'dry-run/read-only',
    range: { dateFrom, dateTo },
    automationSchemaApplied,
    totals: {
      settlements: classifications.length,
      autoRepair: classifications.filter((item) => item.category === 'auto_repair').length,
      manualReview: classifications.filter((item) => item.category === 'manual_review').length,
      systemDataDefect: classifications.filter((item) => item.category === 'system_data_defect').length,
      noAction: classifications.filter((item) => item.category === 'no_action').length,
    },
    liveVerification: {
      targetMigrationApplied: financeMigrations.some((item) => item.migration_name === '20260714230000_finance_reconciliation_automation' && item.finished_at && !item.rolled_back_at),
      confirmedInRange: classifications.filter((item) => item.status === 'confirmed').length,
      draftInRange: classifications.filter((item) => item.status === 'draft').length,
      totalSnapshotCount: snapshots.length,
      unresolvedIssueCount: issues.length,
      runStatus: Object.fromEntries(runStatusRows.map((row) => [row.status, Number(row.count)])),
    },
    classifications,
    note: automationSchemaApplied
      ? '可自动修复项仅在 --apply --yes 模式调用正式对账服务；异常不会被删除或用调整项掩盖。'
      : '自动对账 migration 尚未部署，当前结果全部进入人工确认，脚本不写库。',
  };

  if (backupOnly) {
    const backupPath = await writeBackupFile({ settlements, snapshots, issues, financeMigrations, report });
    console.log(JSON.stringify({ ...report, backupPath }, null, 2));
    return;
  }

  if (!apply) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  if (!automationSchemaApplied) throw new Error('自动对账 migration 尚未部署，禁止写库');

  const backupPath = await writeBackupFile({ settlements, snapshots, issues, financeMigrations, report });

  const [{ PrismaService }, { FinanceRecognitionService }, { FinanceMetricsService }, { CommissionService }, { FinanceReconciliationService }] = await Promise.all([
    import('../src/prisma/prisma.service.js'),
    import('../src/finance-recognition/finance-recognition.service.js'),
    import('../src/finance-metrics/finance-metrics.service.js'),
    import('../src/commission/commission.service.js'),
    import('../src/commission/finance-reconciliation.service.js'),
  ]);
  class FinanceReconciliationGovernanceModule {}
  Module({
    providers: [PrismaService, FinanceRecognitionService, FinanceMetricsService, CommissionService, FinanceReconciliationService],
  })(FinanceReconciliationGovernanceModule);
  const app = await NestFactory.createApplicationContext(FinanceReconciliationGovernanceModule, { logger: ['error', 'warn'] });
  try {
    const reconciliationService = app.get(FinanceReconciliationService);
    const results = [];
    for (const item of classifications.filter((entry) => entry.category === 'auto_repair')) {
      results.push(await reconciliationService.runDailyClose(item.storeId, item.businessDate, { triggerType: 'manual', autoConfirm: true }));
    }
    console.log(JSON.stringify({ ...report, backupPath, appliedResults: results }, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
