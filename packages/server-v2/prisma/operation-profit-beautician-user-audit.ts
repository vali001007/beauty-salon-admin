import { config } from 'dotenv';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
config({ path: resolve(import.meta.dirname, '..', '.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

type AuditArgs = {
  storeId?: number;
  file: string;
};

type CandidateAssignmentInput = {
  orderItemId?: number;
  itemId?: number;
  beauticianId: number;
  source?: string;
  reason?: string;
  confirmedBy?: string;
};

type MissingUserBinding = {
  beauticianId: number;
  beauticianName: string;
  phone?: string | null;
  status: string;
  storeId: number;
  impactedOrderItemIds: number[];
  impactedAssignments: number;
  candidateUsers: Array<{
    userId: number;
    username: string;
    name: string;
    phone?: string | null;
    status: string;
    score: number;
    matchedBy: string[];
  }>;
};

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  max: Number(process.env.DATABASE_POOL_MAX || 3),
  idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 10000),
  connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
});
const prisma = new PrismaClient({ adapter });

function parseArgs(): AuditArgs {
  const args = new Map<string, string>();
  for (const raw of process.argv.slice(2)) {
    if (!raw.startsWith('--') || !raw.includes('=')) continue;
    const [key, ...value] = raw.replace(/^--/, '').split('=');
    args.set(key, value.join('='));
  }
  const storeId = args.get('storeId') ? Number(args.get('storeId')) : undefined;
  const file = args.get('file');
  if (!file) {
    throw new Error('--file is required. Provide an assignee candidate JSON file.');
  }
  if (storeId !== undefined && (!Number.isInteger(storeId) || storeId <= 0)) {
    throw new Error('--storeId must be a positive integer');
  }
  return { storeId, file };
}

function toNumber(value: unknown) {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function loadAssignments(file: string): CandidateAssignmentInput[] {
  const candidates = [resolve(process.cwd(), file), resolve(import.meta.dirname, '..', '..', '..', file), resolve(file)];
  const filePath = candidates.find((candidate) => existsSync(candidate));
  if (!filePath) {
    throw new Error(`Assignee candidate file not found: ${file}`);
  }
  const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  const assignments = Array.isArray(parsed) ? parsed : parsed?.assignments;
  if (!Array.isArray(assignments)) {
    throw new Error('Candidate file must be a JSON array or an object with assignments array.');
  }
  return assignments.map((item, index) => {
    const orderItemId = toNumber(item.orderItemId ?? item.itemId);
    const beauticianId = toNumber(item.beauticianId);
    if (!Number.isInteger(orderItemId) || orderItemId <= 0) {
      throw new Error(`assignments[${index}].orderItemId must be a positive integer`);
    }
    if (!Number.isInteger(beauticianId) || beauticianId <= 0) {
      throw new Error(`assignments[${index}].beauticianId must be a positive integer`);
    }
    return {
      orderItemId,
      beauticianId,
      source: item.source ? String(item.source) : undefined,
      reason: item.reason ? String(item.reason) : undefined,
      confirmedBy: item.confirmedBy ? String(item.confirmedBy) : undefined,
    };
  });
}

function scoreUserMatch(beautician: { name: string; phone?: string | null }, user: { name: string; username: string; phone?: string | null }) {
  const matchedBy: string[] = [];
  let score = 0;
  const beauticianName = normalizeText(beautician.name);
  const userName = normalizeText(user.name);
  const username = normalizeText(user.username);
  const beauticianPhone = normalizeText(beautician.phone);
  const userPhone = normalizeText(user.phone);
  if (beauticianPhone && userPhone && beauticianPhone === userPhone) {
    score += 90;
    matchedBy.push('same_phone');
  }
  if (beauticianName && userName && beauticianName === userName) {
    score += 80;
    matchedBy.push('same_name');
  } else if (beauticianName && userName && (beauticianName.includes(userName) || userName.includes(beauticianName))) {
    score += 55;
    matchedBy.push('similar_name');
  }
  if (beauticianName && username && username.includes(beauticianName)) {
    score += 40;
    matchedBy.push('username_contains_name');
  }
  return { score, matchedBy };
}

async function main() {
  const args = parseArgs();
  const assignments = loadAssignments(args.file);
  const beauticianIds = [...new Set(assignments.map((item) => item.beauticianId))];
  const [beauticians, users] = await Promise.all([
    prisma.beautician.findMany({
      where: {
        id: { in: beauticianIds },
        ...(args.storeId ? { storeId: args.storeId } : {}),
      },
      select: { id: true, name: true, phone: true, userId: true, storeId: true, status: true },
    }),
    prisma.user.findMany({
      where: {
        status: 'active',
        deletedAt: null,
        ...(args.storeId ? { stores: { some: { storeId: args.storeId } } } : {}),
      },
      select: { id: true, username: true, name: true, phone: true, status: true },
      orderBy: { id: 'asc' },
    }),
  ]);
  const beauticianById = new Map<number, (typeof beauticians)[number]>(beauticians.map((item): [number, (typeof beauticians)[number]] => [item.id, item]));
  const assignmentsByBeautician = assignments.reduce<Map<number, CandidateAssignmentInput[]>>((acc, item) => {
    const list = acc.get(item.beauticianId) ?? [];
    list.push(item);
    acc.set(item.beauticianId, list);
    return acc;
  }, new Map());

  const missingUserBindings: MissingUserBinding[] = [];
  for (const [beauticianId, impactedAssignments] of assignmentsByBeautician.entries()) {
    const beautician = beauticianById.get(beauticianId);
    if (!beautician || beautician.userId) continue;
    const candidateUsers = users
      .map((user) => {
        const match = scoreUserMatch(beautician, user);
        return {
          userId: user.id,
          username: user.username,
          name: user.name,
          phone: user.phone,
          status: user.status,
          score: match.score,
          matchedBy: match.matchedBy,
        };
      })
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score || a.userId - b.userId);
    missingUserBindings.push({
      beauticianId: beautician.id,
      beauticianName: beautician.name,
      phone: beautician.phone,
      status: beautician.status,
      storeId: beautician.storeId,
      impactedOrderItemIds: impactedAssignments.map((item) => item.orderItemId!).sort((a, b) => a - b),
      impactedAssignments: impactedAssignments.length,
      candidateUsers: candidateUsers.slice(0, 5),
    });
  }

  const bindingDraft = {
    purpose: 'operation-profit-beautician-user-bindings-pending-business-confirmation',
    storeId: args.storeId ?? null,
    sourceFile: args.file,
    generatedBy: 'operation-profit:beautician-user-audit',
    warning: 'This file is a candidate draft only. Do not apply until business replaces confirmedBy and confirms every binding.',
    sourceSummary: {
      inputAssignments: assignments.length,
      assignmentBeauticians: assignmentsByBeautician.size,
      missingUserBindingBeauticians: missingUserBindings.length,
      impactedAssignments: missingUserBindings.reduce((sum, item) => sum + item.impactedAssignments, 0),
    },
    missingUserBindingNoCandidates: missingUserBindings
      .filter((item) => item.candidateUsers.length === 0)
      .map((item) => ({
        beauticianId: item.beauticianId,
        beauticianName: item.beauticianName,
        phone: item.phone,
        storeId: item.storeId,
        impactedOrderItemIds: item.impactedOrderItemIds,
        impactedAssignments: item.impactedAssignments,
        requiredAction: 'create_or_bind_staff_user',
        reason: 'No active same-name/same-phone store user candidate was found. Create a system user or bind an existing active store user before confirmation dry-run.',
      })),
    bindings: missingUserBindings
      .filter((item) => item.candidateUsers.length > 0)
      .map((item) => ({
        beauticianId: item.beauticianId,
        userId: item.candidateUsers[0].userId,
        confidence: item.candidateUsers[0].score >= 80 ? 'high' : 'low',
        score: item.candidateUsers[0].score,
        source: `user_match:${item.candidateUsers[0].matchedBy.join('+')}`,
        reason: `候选：${item.beauticianName} -> ${item.candidateUsers[0].name}，${item.candidateUsers[0].matchedBy.join('+')}，score ${item.candidateUsers[0].score}`,
        confirmedBy: 'pending_business_confirmation',
      })),
  };

  console.log(
    JSON.stringify(
      {
        mode: 'read-only',
        storeId: args.storeId ?? null,
        file: args.file,
        summary: {
          inputAssignments: assignments.length,
          assignmentBeauticians: assignmentsByBeautician.size,
          missingUserBindingBeauticians: missingUserBindings.length,
          impactedAssignments: missingUserBindings.reduce((sum, item) => sum + item.impactedAssignments, 0),
          bindingDraftItems: bindingDraft.bindings.length,
          missingUserBindingNoCandidateItems: bindingDraft.missingUserBindingNoCandidates.length,
        },
        missingUserBindings,
        bindingDraft,
        notes: [
          'This script is read-only and does not update Beautician.userId.',
          'Binding a beautician to a system user affects staffUserId-based commission attribution.',
          'Every binding must be confirmed by business before operation-profit:beautician-user-backfill is applied.',
        ],
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
