import { config } from 'dotenv';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
config({ path: resolve(import.meta.dirname, '..', '.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

type TemplateArgs = {
  inputFile: string;
  output: string;
};

type MissingUserBindingNoCandidate = {
  beauticianId: number;
  beauticianName?: string;
  phone?: string | null;
  storeId?: number;
  impactedOrderItemIds?: number[];
  impactedAssignments?: number;
  reason?: string;
};

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  max: Number(process.env.DATABASE_POOL_MAX || 3),
  idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 10000),
  connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
});
const prisma = new PrismaClient({ adapter });

function parseArgs(): TemplateArgs {
  const args = new Map<string, string>();
  for (const raw of process.argv.slice(2)) {
    if (!raw.startsWith('--') || !raw.includes('=')) continue;
    const [key, ...value] = raw.replace(/^--/, '').split('=');
    args.set(key, value.join('='));
  }
  return {
    inputFile: args.get('inputFile') ?? 'docs/04-测试数据/operation-profit-beautician-user-bindings.pending.json',
    output: args.get('output') ?? 'docs/04-测试数据/operation-profit-staff-user-create.pending.json',
  };
}

function resolveExistingFile(file: string) {
  const candidates = [resolve(process.cwd(), file), resolve(import.meta.dirname, '..', '..', '..', file), resolve(file)];
  const filePath = candidates.find((candidate) => existsSync(candidate));
  if (!filePath) {
    throw new Error(`File not found: ${file}`);
  }
  return filePath;
}

function readJson(file: string) {
  return JSON.parse(readFileSync(resolveExistingFile(file), 'utf8'));
}

function resolveOutputFile(file: string) {
  return resolve(import.meta.dirname, '..', '..', '..', file);
}

function toNumber(value: unknown) {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

function loadNoCandidateItems(file: string): MissingUserBindingNoCandidate[] {
  const parsed = readJson(file);
  const items = parsed?.missingUserBindingNoCandidates;
  if (!Array.isArray(items)) {
    throw new Error('Input file must contain missingUserBindingNoCandidates array.');
  }
  return items.map((item, index) => {
    const beauticianId = toNumber(item.beauticianId);
    const storeId = toNumber(item.storeId);
    if (!Number.isInteger(beauticianId) || beauticianId <= 0) {
      throw new Error(`missingUserBindingNoCandidates[${index}].beauticianId must be a positive integer`);
    }
    if (!Number.isInteger(storeId) || storeId <= 0) {
      throw new Error(`missingUserBindingNoCandidates[${index}].storeId must be a positive integer`);
    }
    return {
      beauticianId,
      beauticianName: item.beauticianName ? String(item.beauticianName) : undefined,
      phone: item.phone ? String(item.phone) : null,
      storeId,
      impactedOrderItemIds: Array.isArray(item.impactedOrderItemIds) ? item.impactedOrderItemIds.map((id: unknown) => toNumber(id)).filter((id: number) => id > 0) : [],
      impactedAssignments: toNumber(item.impactedAssignments),
      reason: item.reason ? String(item.reason) : undefined,
    };
  });
}

function nextAvailableUsername(base: string, takenUsernames: Set<string>) {
  let username = base;
  let suffix = 2;
  while (takenUsernames.has(username)) {
    username = `${base}_${suffix}`;
    suffix += 1;
  }
  takenUsernames.add(username);
  return username;
}

async function main() {
  const args = parseArgs();
  const items = loadNoCandidateItems(args.inputFile);
  const baseUsernames = items.map((item) => `beautician_${item.storeId}_${item.beauticianId}`);
  const existingUsers = await prisma.user.findMany({
    where: { username: { in: baseUsernames } },
    select: { username: true },
  });
  const takenUsernames = new Set(existingUsers.map((user) => user.username));

  const users = items.map((item) => ({
    action: 'create_and_bind_staff_user',
    beauticianId: item.beauticianId,
    username: nextAvailableUsername(`beautician_${item.storeId}_${item.beauticianId}`, takenUsernames),
    name: item.beauticianName ?? `美容师${item.beauticianId}`,
    phone: item.phone ?? undefined,
    roleKey: 'beautician',
    storeId: item.storeId,
    impactedOrderItemIds: item.impactedOrderItemIds ?? [],
    impactedAssignments: item.impactedAssignments ?? 0,
    source: 'operation-profit:beautician-user-audit/no_candidate',
    reason: item.reason ?? 'No active same-name/same-phone store user candidate was found.',
    confirmedBy: 'pending_business_confirmation',
  }));

  const output = {
    purpose: 'operation-profit-staff-user-create-pending-business-confirmation',
    sourceFile: args.inputFile,
    generatedBy: 'operation-profit:staff-user-template',
    warning:
      'This file is a candidate draft only. Business must confirm every created account, copy it to a formal JSON path, and set OPERATION_PROFIT_NEW_STAFF_DEFAULT_PASSWORD before apply.',
    sourceSummary: {
      missingUserBindingNoCandidateItems: items.length,
      plannedStaffUsers: users.length,
    },
    users,
  };

  const outputPath = resolveOutputFile(args.output);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  console.log(
    JSON.stringify(
      {
        mode: 'read-only',
        inputFile: args.inputFile,
        output: args.output,
        summary: {
          missingUserBindingNoCandidateItems: items.length,
          plannedStaffUsers: users.length,
        },
        nextStep: 'Business copies this pending JSON to a formal confirmation file, replaces confirmedBy, then runs operation-profit:staff-user-backfill in dry-run mode.',
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
