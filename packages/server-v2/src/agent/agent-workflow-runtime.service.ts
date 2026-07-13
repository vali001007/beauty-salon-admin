import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AgentActor, AgentPlan, AgentRunStatus } from './agent.types.js';

@Injectable()
export class AgentWorkflowRuntimeService {
  constructor(private readonly prisma: PrismaService) {}

  async createRun(input: { message: string; actor: AgentActor; context?: Record<string, unknown>; agentCode?: string }) {
    const delegate = this.delegate('agentRun');
    const runNo = `ar_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const personaCode = this.resolvePersonaCode(input.actor.personaCode, input.context);
    return delegate.create({
      data: {
        runNo,
        storeId: input.actor.storeId,
        userId: input.actor.userId,
        deviceId: input.actor.deviceId,
        role: input.actor.role,
        entrypoint: input.actor.entrypoint,
        agentCode: input.agentCode ?? 'business_operations',
        personaCode,
        status: 'created',
        userInput: input.message,
        contextJson: this.toJson(input.context),
      },
    });
  }

  async getRun(id: number) {
    return this.delegate('agentRun').findUnique({ where: { id } });
  }

  async getToolCall(id: number) {
    return this.delegate('agentToolCall').findUnique({ where: { id } });
  }

  async getApproval(id: number) {
    return this.delegate('agentApproval').findUnique({ where: { id } });
  }

  async findRuns(query: {
    page?: number | string;
    pageSize?: number | string;
    status?: string;
    role?: string;
    personaCode?: string;
    entrypoint?: string;
    agentCode?: string;
    keyword?: string;
    storeId?: number;
  }) {
    const page = this.normalizePage(query.page);
    const pageSize = this.normalizePageSize(query.pageSize);
    const keyword = String(query.keyword || '').trim();
    const where: Record<string, unknown> = {
      ...(query.storeId ? { storeId: Number(query.storeId) } : {}),
      ...(query.status ? { status: String(query.status) } : {}),
      ...(query.role ? { role: String(query.role) } : {}),
      ...(query.personaCode ? { personaCode: String(query.personaCode) } : {}),
      ...(query.entrypoint ? { entrypoint: String(query.entrypoint) } : {}),
      ...(query.agentCode ? { agentCode: String(query.agentCode) } : {}),
      ...(keyword
        ? {
            OR: [
              { runNo: { contains: keyword, mode: 'insensitive' } },
              { userInput: { contains: keyword, mode: 'insensitive' } },
              { agentCode: { contains: keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [runs, total] = await Promise.all([
      this.delegate('agentRun').findMany({
        where,
        select: {
          id: true,
          runNo: true,
          storeId: true,
          userId: true,
          deviceId: true,
          role: true,
          entrypoint: true,
          agentCode: true,
          personaCode: true,
          status: true,
          userInput: true,
          errorMessage: true,
          startedAt: true,
          completedAt: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.delegate('agentRun').count({ where }),
    ]);

    const runIds = runs.map((run: any) => Number(run.id)).filter(Boolean);
    const [toolCalls, approvals] = runIds.length
      ? await Promise.all([
          this.delegate('agentToolCall').findMany({ where: { runId: { in: runIds } }, select: { runId: true } }),
          this.delegate('agentApproval').findMany({ where: { runId: { in: runIds } }, select: { runId: true } }),
        ])
      : [[], []];

    const toolCallCountByRun = this.countByRunId(toolCalls);
    const approvalCountByRun = this.countByRunId(approvals);
    const items = runs.map((run: any) => ({
      ...run,
      toolCallCount: toolCallCountByRun.get(Number(run.id)) ?? 0,
      approvalCount: approvalCountByRun.get(Number(run.id)) ?? 0,
    }));

    return { items, data: items, total, page, pageSize };
  }

  async getRunDetail(id: number, storeId?: number) {
    const run = await this.delegate('agentRun').findFirst({
      where: {
        id,
        ...(storeId ? { storeId: Number(storeId) } : {}),
      },
    });
    if (!run) return { run: null, messages: [], steps: [], toolCalls: [], approvals: [] };

    const [messages, steps, toolCalls, approvals] = await Promise.all([
      this.delegate('agentMessage').findMany({ where: { runId: id }, orderBy: { createdAt: 'asc' } }),
      this.delegate('agentStep').findMany({ where: { runId: id }, orderBy: { startedAt: 'asc' } }),
      this.delegate('agentToolCall').findMany({ where: { runId: id }, orderBy: { createdAt: 'asc' } }),
      this.delegate('agentApproval').findMany({ where: { runId: id }, orderBy: { createdAt: 'asc' } }),
    ]);
    return { run, messages, steps, toolCalls, approvals };
  }

  async findApprovals(query: { page?: number | string; pageSize?: number | string; status?: string; storeId?: number }) {
    const page = this.normalizePage(query.page);
    const pageSize = this.normalizePageSize(query.pageSize);
    const where: Record<string, unknown> = {
      ...(query.status ? { status: String(query.status) } : {}),
    };

    if (query.storeId) {
      const runs = await this.delegate('agentRun').findMany({
        where: { storeId: Number(query.storeId) },
        select: { id: true },
      });
      const runIds = runs.map((run: any) => Number(run.id)).filter(Boolean);
      if (!runIds.length) return { items: [], data: [], total: 0, page, pageSize };
      where.runId = { in: runIds };
    }

    const [approvals, total] = await Promise.all([
      this.delegate('agentApproval').findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.delegate('agentApproval').count({ where }),
    ]);
    const runIds = Array.from(new Set(approvals.map((item: any) => Number(item.runId)).filter(Boolean)));
    const toolCallIds = Array.from(new Set(approvals.map((item: any) => Number(item.toolCallId)).filter(Boolean)));
    const [runs, toolCalls] = await Promise.all([
      runIds.length
        ? this.delegate('agentRun').findMany({
            where: { id: { in: runIds } },
            select: { id: true, runNo: true, userInput: true, status: true, role: true, entrypoint: true, agentCode: true },
          })
        : [],
      toolCallIds.length
        ? this.delegate('agentToolCall').findMany({
            where: { id: { in: toolCallIds } },
            select: { id: true, toolName: true, riskLevel: true, status: true, argsJson: true, resultJson: true },
          })
        : [],
    ]);
    const runById = new Map(runs.map((run: any) => [Number(run.id), run]));
    const toolCallById = new Map(toolCalls.map((toolCall: any) => [Number(toolCall.id), toolCall]));
    const items = approvals.map((approval: any) => ({
      ...approval,
      run: runById.get(Number(approval.runId)) ?? null,
      toolCall: approval.toolCallId ? toolCallById.get(Number(approval.toolCallId)) ?? null : null,
    }));
    return { items, data: items, total, page, pageSize };
  }

  async updateRun(id: number, data: Record<string, unknown>) {
    return this.delegate('agentRun').update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });
  }

  async setRunStatus(id: number, status: AgentRunStatus, data: Record<string, unknown> = {}) {
    return this.updateRun(id, {
      status,
      ...data,
      ...(status === 'completed' || status === 'failed' || status === 'cancelled' ? { completedAt: new Date() } : {}),
    });
  }

  async addMessage(runId: number, role: 'user' | 'assistant' | 'system', content: string, metadata?: Record<string, unknown>) {
    return this.delegate('agentMessage').create({
      data: { runId, role, content, metadata: this.toJson(metadata) },
    });
  }

  async recordStep(input: {
    runId: number;
    stepType: string;
    name: string;
    status: string;
    inputJson?: unknown;
    outputJson?: unknown;
    startedAt?: Date;
    endedAt?: Date;
  }) {
    return this.delegate('agentStep').create({
      data: {
        runId: input.runId,
        stepType: input.stepType,
        name: input.name,
        status: input.status,
        inputJson: this.toJson(input.inputJson),
        outputJson: this.toJson(input.outputJson),
        startedAt: input.startedAt,
        endedAt: input.endedAt,
      },
    });
  }

  async createToolCall(input: {
    runId: number;
    toolName: string;
    riskLevel: string;
    status: string;
    argsJson: unknown;
    approvalId?: number;
    idempotencyKey?: string;
  }) {
    return this.delegate('agentToolCall').create({
      data: {
        runId: input.runId,
        toolName: input.toolName,
        riskLevel: input.riskLevel,
        status: input.status,
        argsJson: this.toJson(input.argsJson) ?? {},
        approvalId: input.approvalId,
        idempotencyKey: input.idempotencyKey,
      },
    });
  }

  async updateToolCall(id: number, data: Record<string, unknown>) {
    return this.delegate('agentToolCall').update({
      where: { id },
      data: {
        ...data,
        ...(['success', 'failed', 'no_data', 'unsupported'].includes(String(data.status || '')) || data.resultJson
          ? { completedAt: data.completedAt ?? new Date() }
          : {}),
      },
    });
  }

  async updateApproval(id: number, data: Record<string, unknown>) {
    return this.delegate('agentApproval').update({
      where: { id },
      data,
    });
  }

  async createApproval(input: { runId: number; toolCallId?: number; requestedBy?: number; beforeJson?: unknown }) {
    return this.delegate('agentApproval').create({
      data: {
        runId: input.runId,
        toolCallId: input.toolCallId,
        status: 'pending',
        requestedBy: input.requestedBy,
        beforeJson: this.toJson(input.beforeJson),
      },
    });
  }

  async persistPlan(runId: number, plan: AgentPlan) {
    return this.updateRun(runId, { planJson: this.toJson(plan) });
  }

  private delegate(name: string): any {
    const delegate = (this.prisma as any)[name];
    if (!delegate) {
      throw new Error(`Prisma delegate ${name} is unavailable. Run prisma generate after applying agent schema.`);
    }
    return delegate;
  }

  private toJson(value: unknown) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  private resolvePersonaCode(personaCode?: string, context?: Record<string, unknown>) {
    if (personaCode && String(personaCode).trim()) return String(personaCode).trim();
    const terminal = context?.terminal;
    if (!terminal || typeof terminal !== 'object') return undefined;
    const terminalPersonaCode = (terminal as { personaCode?: unknown }).personaCode;
    return typeof terminalPersonaCode === 'string' && terminalPersonaCode.trim() ? terminalPersonaCode.trim() : undefined;
  }

  private normalizePage(value: unknown) {
    const page = Number(value) || 1;
    return Math.max(1, page);
  }

  private normalizePageSize(value: unknown) {
    const pageSize = Number(value) || 10;
    return Math.min(100, Math.max(1, pageSize));
  }

  private countByRunId(items: Array<{ runId: number }>) {
    const result = new Map<number, number>();
    for (const item of items) {
      const runId = Number(item.runId);
      result.set(runId, (result.get(runId) ?? 0) + 1);
    }
    return result;
  }
}
