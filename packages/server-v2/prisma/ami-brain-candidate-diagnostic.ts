import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { BrainModule } from '../src/brain/brain.module.js';
import { BrainChatService } from '../src/brain/brain-chat.service.js';
import {
  buildBrainEvalRolePermissionMap,
  resolveBrainEvalContextPermissions,
} from '../src/brain/eval/brain-eval-role-permissions.js';
import { resolveBrainEvalRoleUsers } from '../src/brain/eval/brain-eval-role-user-resolver.js';
import { BrainReleaseService } from '../src/brain/governance/brain-release.service.js';
import { BrainActiveReleaseWarmupService } from '../src/brain/governance/brain-active-release-warmup.service.js';
import { candidateDiagnosticPassed } from '../src/brain/governance/brain-candidate-diagnostic.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

@Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, BrainModule] })
class AmiBrainCandidateDiagnosticModule {}

const options = parseOptions(process.argv.slice(2));
assertRegisteredQuestion(options.questionId, options.message);
const app = await NestFactory.createApplicationContext(AmiBrainCandidateDiagnosticModule, {
  logger: ['error', 'warn'],
});

try {
  const prisma = app.get(PrismaService);
  const chat = app.get(BrainChatService);
  const releaseService = app.get(BrainReleaseService);
  const activeReleaseWarmup = app.get(BrainActiveReleaseWarmupService);
  const release = await prisma.brainRelease.findUnique({
    where: { id: options.releaseId },
    select: { id: true, releaseKey: true, status: true, rollout: true },
  });
  if (!release) throw new Error(`ami_brain_candidate_diagnostic_release_missing:${options.releaseId}`);
  const rollout = record(release.rollout);
  if (release.status !== 'active' && !(release.status === 'draft' && rollout.evaluationOnly === true)) {
    throw new Error(
      `ami_brain_candidate_diagnostic_release_not_evaluable:${release.id}:${release.status}:evaluationOnly=${String(rollout.evaluationOnly)}`,
    );
  }

  const snapshot = await releaseService.freezeEvaluationRelease(release.id);
  const candidateWarmup = await activeReleaseWarmup.warmRelease({
    releaseId: release.id,
    expectedStatus: release.status,
  });
  const roleRows = await prisma.role.findMany({
    where: { status: 'active' },
    select: { key: true, permissions: true },
  });
  const permissionsByRole = buildBrainEvalRolePermissionMap(
    roleRows.map((role) => ({
      key: role.key,
      permissions: Array.isArray(role.permissions)
        ? role.permissions.filter((permission): permission is string => typeof permission === 'string')
        : [],
    })),
  );
  const users = await resolveBrainEvalRoleUsers(prisma, options.storeId, [options.roleKey]);
  const userId = users[options.roleKey];
  if (!userId) throw new Error(`ami_brain_candidate_diagnostic_user_missing:${options.roleKey}`);
  const permissions = resolveBrainEvalContextPermissions(
    permissionsByRole,
    options.roleKey,
    snapshot.capabilityCandidates,
  );

  const results = [];
  for (let index = 0; index < options.iterations; index += 1) {
    const requestId = `${options.runKey}_${index === 0 ? 'cold' : `warm_${index}`}_${Date.now()}`;
    const context = {
      userId,
      storeId: options.storeId,
      visibleStoreIds: [options.storeId],
      roles: [options.roleKey],
      permissions: [...permissions],
      deniedPermissions: [],
      requestId,
      timezone: options.timezone,
      governanceEvalReleaseId: snapshot.releaseId,
      governanceEvalReleaseSnapshot: snapshot,
    };
    const conversation = await chat.createConversation(context, {
      title: `候选诊断 ${options.runKey} ${index + 1}`.slice(0, 80),
    });
    const messageStartedAt = Date.now();
    let answerReadyAt: number | undefined;
    const response = await chat.sendMessage(
      context,
      conversation.id,
      {
        message: options.message,
        timezone: options.timezone,
        roleHint: options.roleKey as never,
      },
      {
        onAnswerReady: () => {
          answerReadyAt = Date.now();
        },
      },
    );
    const requestCompletedAt = Date.now();
    const run = await prisma.brainRun.findUnique({
      where: { id: response.runId },
      select: {
        id: true,
        conversationId: true,
        status: true,
        latencyMs: true,
        output: true,
        steps: {
          orderBy: { createdAt: 'asc' },
          select: { stepKey: true, layer: true, status: true, latencyMs: true, output: true },
        },
      },
    });
    if (!run) throw new Error(`ami_brain_candidate_diagnostic_run_missing:${response.runId}`);
    const output = record(run.output);
    results.push({
      sequence: index === 0 ? 'cold' : `warm_${index}`,
      runId: run.id,
      conversationId: run.conversationId,
      status: run.status,
      latencyMs: run.latencyMs,
      answerReadyLatencyMs: (answerReadyAt ?? requestCompletedAt) - messageStartedAt,
      postAnswerCompletionLatencyMs: answerReadyAt ? requestCompletedAt - answerReadyAt : 0,
      requestCompletionLatencyMs: requestCompletedAt - messageStartedAt,
      provider: output.provider ?? null,
      model: output.model ?? null,
      capabilityKey: output.capabilityKey ?? null,
      steps: run.steps.map((step) => {
        const stepOutput = record(step.output);
        return {
          stepKey: step.stepKey,
          layer: step.layer,
          status: step.status,
          latencyMs: step.latencyMs,
          ...(Object.keys(record(stepOutput.phaseLatencyMs)).length > 0
            ? { phaseLatencyMs: record(stepOutput.phaseLatencyMs) }
            : {}),
        };
      }),
    });
  }

  const passed = candidateDiagnosticPassed(results);
  console.log(
    JSON.stringify(
      {
        schemaVersion: 'ami-brain-candidate-diagnostic/v1',
        diagnosticOnly: true,
        passed,
        questionId: options.questionId,
        generatedAt: new Date().toISOString(),
        release: {
          id: release.id,
          releaseKey: release.releaseKey,
          status: release.status,
          evaluationOnly: rollout.evaluationOnly === true,
          fingerprint: snapshot.releaseFingerprint,
          capabilityCount: snapshot.capabilityCandidates.length,
        },
        storeId: options.storeId,
        roleKey: options.roleKey,
        runKey: options.runKey,
        iterations: options.iterations,
        candidateWarmup,
        results,
      },
      null,
      2,
    ),
  );
  if (!passed) process.exitCode = 2;
} finally {
  await app.close();
}

function parseOptions(args: string[]) {
  const get = (name: string) => args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
  const required = (name: string) => {
    const value = get(name)?.trim();
    if (!value) throw new Error(`${name} is required`);
    return value;
  };
  const releaseId = Number(required('--release-id'));
  const storeId = Number(get('--store-id') ?? '6');
  const iterations = Number(get('--iterations') ?? '2');
  const runKey = required('--run-key');
  const message = required('--message');
  const questionId = required('--question-id');
  const roleKey = get('--role-key') ?? 'store_manager';
  const timezone = get('--timezone') ?? 'Asia/Shanghai';
  if (!Number.isInteger(releaseId) || releaseId <= 0) throw new Error('--release-id must be a positive integer');
  if (!Number.isInteger(storeId) || storeId <= 0) throw new Error('--store-id must be a positive integer');
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 5) {
    throw new Error('--iterations must be an integer between 1 and 5');
  }
  if (!/^[a-zA-Z0-9_-]+$/u.test(runKey)) throw new Error('--run-key is invalid');
  if (message.length > 4000) throw new Error('--message exceeds 4000 characters');
  if (!/^BQ\d{4}$/u.test(questionId)) throw new Error('--question-id must be a registered BQ identifier');
  if (!/^[a-z][a-z0-9_]*$/u.test(roleKey)) throw new Error('--role-key is invalid');
  return { releaseId, storeId, iterations, runKey, message, questionId, roleKey, timezone };
}

function assertRegisteredQuestion(questionId: string, message: string) {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const eligibility = JSON.parse(
    readFileSync(
      resolve(
        repoRoot,
        'docs/04-测试数据/Ami-Brain-全领域题集治理/ami-brain-product-loop-eligibility-v1.json',
      ),
      'utf8',
    ),
  ) as { cases?: Array<{ id?: string; question?: string; status?: string }> };
  const registered = eligibility.cases?.find((item) => item.id === questionId);
  if (!registered) throw new Error(`candidate_diagnostic_question_unregistered:${questionId}`);
  if (registered.status !== 'current_release_test') {
    throw new Error(`candidate_diagnostic_question_ineligible:${questionId}:${registered.status ?? 'unknown'}`);
  }
  const variants = String(registered.question ?? '')
    .split(/(?:→|->)/u)
    .map((item) => item.replace(/^第\s*\d+\s*轮\s*[:：]\s*/u, '').trim())
    .filter(Boolean);
  const normalize = (value: string) =>
    value.replace(/第\s*\d+\s*轮\s*[:：]/gu, '').replace(/[\s，。！？、：；“”‘’"'`（）()→\-]/gu, '');
  if (![String(registered.question ?? ''), ...variants].some((item) => normalize(item) === normalize(message))) {
    throw new Error(`candidate_diagnostic_question_mismatch:${questionId}`);
  }
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {};
}
