import { Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BrainChatService } from '../brain-chat.service.js';
import { BrainAnswerGraderService } from '../eval/brain-answer-grader.service.js';

@Injectable()
export class BrainEvalService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly chatService?: BrainChatService,
    @Optional() private readonly grader?: BrainAnswerGraderService,
  ) {}

  summarizeResults(results: Array<{ caseKey: string; passed: boolean }>) {
    const failed = results.filter((result) => !result.passed).length;
    return {
      total: results.length,
      passed: results.length - failed,
      failed,
      canRelease: results.length > 0 && failed === 0,
    };
  }

  async createEvalRun(input: {
    storeId: number;
    userId: number;
    permissions: string[];
    releaseId?: number;
    caseKeys?: string[];
    roleKey?: string;
    modelVersion?: string;
  }) {
    const caseCount = await this.prisma.brainEvalCase.count({
      where: { enabled: true, ...(input.caseKeys?.length ? { caseKey: { in: input.caseKeys } } : {}), ...(input.roleKey ? { roleKey: input.roleKey } : {}) },
    });
    const run = await this.prisma.brainEvalRun.create({
      data: {
        releaseId: input.releaseId,
        storeId: input.storeId,
        roleKey: input.roleKey,
        modelVersion: input.modelVersion,
        status: 'queued',
        caseCount,
        summary: { total: caseCount, passed: 0, failed: 0, canRelease: false },
        results: [],
      },
    });
    setTimeout(() => {
      void this.runEvalNow({ evalRunId: run.id, ...input }).catch(() => undefined);
    }, 0);
    return run;
  }

  async runEvalNow(input: {
    evalRunId: number;
    storeId: number;
    userId: number;
    permissions: string[];
    caseKeys?: string[];
    roleKey?: string;
  }) {
    if (!this.chatService || !this.grader) throw new Error('brain_eval_runtime_unavailable');
    const cases = await this.prisma.brainEvalCase.findMany({
      where: {
        enabled: true,
        ...(input.caseKeys?.length ? { caseKey: { in: input.caseKeys } } : {}),
        ...(input.roleKey ? { roleKey: input.roleKey } : {}),
      },
      orderBy: { caseKey: 'asc' },
    });
    await this.prisma.brainEvalRun.update({
      where: { id: input.evalRunId },
      data: { status: 'running', caseCount: cases.length, startedAt: new Date() },
    });
    const results: Array<{ caseKey: string; passed: boolean }> = [];
    try {
      for (const evalCase of cases) {
        const startedAt = Date.now();
        const caseInput = this.record(evalCase.input);
        const question = String(caseInput.message ?? caseInput.question ?? '').trim();
        let answer = '';
        let citations: Array<Record<string, unknown>> = [];
        let brainStatus = 'failed';
        let errorMessage: string | undefined;
        let metadata: Record<string, unknown> = {};
        try {
          const context = {
            userId: input.userId,
            storeId: input.storeId,
            visibleStoreIds: [input.storeId],
            permissions: input.permissions,
            deniedPermissions: [],
            requestId: `brain_eval_${input.evalRunId}_${evalCase.caseKey}`,
            timezone: 'Asia/Shanghai',
          };
          const conversation = await this.chatService.createConversation(context, { title: `评测 ${evalCase.caseKey}` });
          const response = await this.chatService.sendMessage(context, conversation.id, {
            message: question,
            timezone: 'Asia/Shanghai',
            roleHint: evalCase.roleKey as never,
          });
          answer = response.answer;
          citations = response.citations as Array<Record<string, unknown>>;
          brainStatus = response.status;
          metadata = { runId: response.runId };
        } catch (error) {
          errorMessage = error instanceof Error ? error.message : 'eval_case_failed';
        }
        const grade = this.grader.grade({
          question,
          answer,
          citations,
          brainStatus,
          error: errorMessage,
        });
        const expected = this.record(evalCase.expected);
        const expectedContains = Array.isArray(expected.answerContains) ? expected.answerContains.filter((item): item is string => typeof item === 'string') : [];
        const contentPassed = expectedContains.every((text) => answer.includes(text));
        const passed = (grade.status === 'usable_exact' || grade.status === 'usable_partial') && contentPassed && !errorMessage;
        results.push({ caseKey: evalCase.caseKey, passed });
        await this.prisma.brainEvalResult.create({
          data: {
            evalRunId: input.evalRunId,
            caseId: evalCase.id,
            caseKey: evalCase.caseKey,
            roleKey: evalCase.roleKey,
            question,
            answer,
            citations: this.toJson(citations),
            deterministicGrade: this.toJson(grade),
            deterministicPassed: passed,
            latencyMs: Date.now() - startedAt,
            failureCluster: passed ? undefined : grade.status,
            error: errorMessage ? { message: errorMessage } : undefined,
            metadata: this.toJson(metadata),
          },
        });
      }
      const summary = this.summarizeResults(results);
      await this.prisma.brainEvalRun.update({
        where: { id: input.evalRunId },
        data: {
          status: 'completed',
          caseCount: summary.total,
          passedCount: summary.passed,
          failedCount: summary.failed,
          summary: this.toJson(summary),
          results: this.toJson(results),
          finishedAt: new Date(),
        },
      });
      return summary;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'eval_run_failed';
      await this.prisma.brainEvalRun.update({
        where: { id: input.evalRunId },
        data: { status: 'failed', error: { message }, finishedAt: new Date() },
      });
      throw error;
    }
  }

  listRuns(input: { storeId: number }) {
    return this.prisma.brainEvalRun.findMany({
      where: { storeId: input.storeId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  getRun(input: { storeId: number; evalRunId: number }) {
    return this.prisma.brainEvalRun.findFirst({
      where: { id: input.evalRunId, storeId: input.storeId },
      include: { evalResults: { orderBy: { caseKey: 'asc' } } },
    });
  }

  private record(value: Prisma.JsonValue): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
