import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { Prisma } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AgentV2CapabilityCenterService } from './agent-v2-capability-center.service.js';

export type AgentV2AutoPublishTrigger = 'deploy_hook' | 'cron' | 'manual';
export type AgentV2AutoPublishScanMode = 'full' | 'git_diff' | 'hash';

export type AgentV2AutoPublishInput = {
  trigger: AgentV2AutoPublishTrigger;
  scanMode?: AgentV2AutoPublishScanMode;
  path?: string;
  limit?: number;
  overwriteReviewed?: boolean;
  postPublishSmoke?: boolean;
  postPublishSmokeLimit?: number;
  postPublishSmokeStoreId?: number;
  requestedBy?: number;
  title?: string;
  summary?: string;
};

type AutoPublishDraft = Record<string, unknown> & {
  capabilityId?: string;
  sourceApis?: unknown[];
  sourceRoutes?: unknown[];
  sourceDtos?: unknown[];
  sourceModels?: unknown[];
  executor?: unknown;
  permissionCodes?: unknown[];
};

type AutoPublishScanPlan = {
  importPath?: string;
  capabilityIds?: string[];
  skipPublish: boolean;
  status: {
    mode: AgentV2AutoPublishScanMode;
    implemented: boolean;
    note: string;
    changedPathCount?: number;
    matchedCapabilityCount?: number;
    changedFingerprintCount?: number;
  };
  changedPaths?: string[];
};

const DEFAULT_DRAFT_REPORT = 'docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-capability-drafts.json';

@Injectable()
export class AgentV2AutoPublishService {
  private readonly logger = new Logger(AgentV2AutoPublishService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly capabilityCenter: AgentV2CapabilityCenterService,
  ) {}

  async run(input: AgentV2AutoPublishInput) {
    const startedAt = new Date();
    const runNo = `agent-auto-pub-${Date.now()}`;
    const scanMode = input.scanMode ?? 'full';
    const run = await this.prisma.agentCapabilityPublishRun.create({
      data: {
        runNo,
        status: 'running',
        requestedBy: input.requestedBy,
        inputJson: this.toJson({
          ...input,
          scanMode,
          pipeline: 'agent_v2_auto_publish',
        }),
      },
    });

    try {
      const scanPlan = await this.buildScanPlan(input, scanMode);
      if (scanPlan.skipPublish) {
        const result = {
          status: 'completed',
          outcome: 'skipped',
          runNo,
          trigger: input.trigger,
          scanMode,
          scanModeStatus: scanPlan.status,
          scanPlan: this.scanPlanDto(scanPlan),
          output: {
            newOrUpdatedCandidates: 0,
            skippedCandidates: 0,
            deprecatedCandidates: 0,
            autoPublishedCount: 0,
            blockedReasons: [],
            activeManifestVersion: null,
          },
        };
        await this.prisma.agentCapabilityPublishRun.update({
          where: { id: run.id },
          data: {
            status: 'completed',
            completedAt: new Date(),
            resultJson: this.toJson(result),
          },
        });
        return result;
      }

      const importResult = await this.capabilityCenter.importDrafts({
        path: scanPlan.importPath ?? input.path,
        limit: input.limit,
        capabilityIds: scanPlan.capabilityIds,
        overwriteReviewed: input.overwriteReviewed ?? false,
      });
      const publishResult = await this.capabilityCenter.publish({
        mode: 'auto',
        capabilityIds: scanPlan.capabilityIds,
        title: input.title ?? `Agent V2 自动发布 ${this.formatTimestamp(startedAt)}`,
        summary: input.summary ?? this.summaryFor(input.trigger, scanMode),
        publishedBy: input.requestedBy,
      });
      const postPublishSmoke = await this.runPostPublishSmoke(input, publishResult);
      const result = {
        status: 'completed',
        runNo,
        trigger: input.trigger,
        scanMode,
        scanModeStatus: scanPlan.status,
        scanPlan: this.scanPlanDto(scanPlan),
        importResult,
        publishResult,
        postPublishSmoke,
        output: {
          newOrUpdatedCandidates: Number(importResult.created ?? 0) + Number(importResult.updated ?? 0),
          skippedCandidates: Number(importResult.skipped ?? 0),
          deprecatedCandidates: Number(importResult.deprecated ?? 0),
          autoPublishedCount: Number(publishResult.publishedDraftCount ?? 0),
          blockedReasons: postPublishSmoke.pass ? [] : ['post_publish_smoke_failed'],
          activeManifestVersion: publishResult.activeManifestVersion,
          postPublishSmokePass: postPublishSmoke.pass,
        },
      };
      await this.prisma.agentCapabilityPublishRun.update({
        where: { id: run.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
          resultJson: this.toJson(result),
        },
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const result = {
        status: 'failed',
        runNo,
        trigger: input.trigger,
        scanMode,
        scanModeStatus: this.scanModeStatus(scanMode),
        errorMessage: message,
      };
      await this.prisma.agentCapabilityPublishRun.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          completedAt: new Date(),
          errorMessage: message,
          resultJson: this.toJson(result),
        },
      });
      return result;
    }
  }

  async listRuns(query: { page?: number; pageSize?: number; status?: string; trigger?: string } = {}) {
    const page = this.toPositiveInt(query.page, 1);
    const pageSize = Math.min(this.toPositiveInt(query.pageSize, 20), 100);
    const where: Record<string, unknown> = {};
    if (query.status && query.status !== 'all') where.status = query.status;
    const [items, total] = await Promise.all([
      this.prisma.agentCapabilityPublishRun.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.agentCapabilityPublishRun.count({ where }),
    ]);
    const trigger = query.trigger && query.trigger !== 'all' ? String(query.trigger) : null;
    const filtered = trigger
      ? items.filter((item) => this.asObject(item.inputJson)?.trigger === trigger || this.asObject(item.resultJson)?.trigger === trigger)
      : items;
    return {
      items: filtered.map((item) => this.toRunDto(item)),
      total: trigger ? filtered.length : total,
      page,
      pageSize,
    };
  }

  async getRun(id: number) {
    const run = await this.prisma.agentCapabilityPublishRun.findUnique({ where: { id } });
    return run ? this.toRunDto(run) : null;
  }

  @Cron('0 3 * * *', { timeZone: 'Asia/Shanghai' })
  async runDailyCron() {
    if (process.env.AGENT_V2_AUTO_PUBLISH_CRON !== 'true') return;
    const result = await this.run({ trigger: 'cron', scanMode: 'full' });
    if (result.status === 'failed') {
      const errorMessage = 'errorMessage' in result ? result.errorMessage : 'unknown';
      this.logger.warn(`Agent V2 自动发布失败：${errorMessage ?? 'unknown'}`);
    }
  }

  private summaryFor(trigger: AgentV2AutoPublishTrigger, scanMode: AgentV2AutoPublishScanMode) {
    const triggerLabel: Record<AgentV2AutoPublishTrigger, string> = {
      deploy_hook: '部署钩子',
      cron: '每日定时',
      manual: '管理端手动',
    };
    return `${triggerLabel[trigger]}触发，扫描模式：${scanMode}；只自动发布低风险只读能力，高风险能力保持阻断或人工审核。`;
  }

  private scanModeStatus(scanMode: AgentV2AutoPublishScanMode) {
    if (scanMode === 'full') {
      return { mode: scanMode, implemented: true, note: '从最新能力草案报告全量导入并发布 auto_publish 候选。' };
    }
    return {
      mode: scanMode,
      implemented: true,
      note: scanMode === 'git_diff'
        ? '按 Git 变更文件过滤候选能力，只导入并发布命中的增量草稿。'
        : '按候选能力指纹与已导入草稿指纹比较，只导入并发布新增或变更草稿。',
    };
  }

  private async buildScanPlan(input: AgentV2AutoPublishInput, scanMode: AgentV2AutoPublishScanMode): Promise<AutoPublishScanPlan> {
    if (scanMode === 'full') {
      return {
        importPath: input.path,
        skipPublish: false,
        status: this.scanModeStatus(scanMode),
      };
    }

    const { path, drafts: reportDrafts } = this.readDraftReport(input.path);
    const drafts = input.limit ? reportDrafts.slice(0, Math.min(this.toPositiveInt(input.limit, reportDrafts.length), reportDrafts.length)) : reportDrafts;
    if (scanMode === 'git_diff') {
      const changedPaths = this.gitChangedPaths();
      const capabilityIds = this.matchDraftsByChangedPaths(drafts, changedPaths);
      return {
        importPath: path,
        capabilityIds,
        skipPublish: capabilityIds.length === 0,
        changedPaths,
        status: {
          ...this.scanModeStatus(scanMode),
          changedPathCount: changedPaths.length,
          matchedCapabilityCount: capabilityIds.length,
          note: capabilityIds.length
            ? `Git 变更命中 ${capabilityIds.length} 个候选能力。`
            : 'Git 变更未命中候选能力，已跳过发布。',
        },
      };
    }

    const capabilityIds = await this.changedDraftsByFingerprint(drafts);
    return {
      importPath: path,
      capabilityIds,
      skipPublish: capabilityIds.length === 0,
      status: {
        ...this.scanModeStatus(scanMode),
        matchedCapabilityCount: capabilityIds.length,
        changedFingerprintCount: capabilityIds.length,
        note: capabilityIds.length
          ? `指纹对比发现 ${capabilityIds.length} 个新增或变更候选能力。`
          : '候选能力指纹没有变化，已跳过发布。',
      },
    };
  }

  private readDraftReport(path?: string) {
    const resolved = this.resolveWorkspacePath(path || DEFAULT_DRAFT_REPORT);
    if (!existsSync(resolved)) throw new Error(`候选能力草稿文件不存在：${path || DEFAULT_DRAFT_REPORT}`);
    const report = JSON.parse(readFileSync(resolved, 'utf8')) as { drafts?: AutoPublishDraft[] };
    return {
      path: path || DEFAULT_DRAFT_REPORT,
      drafts: (report.drafts ?? []).filter((item) => item.capabilityId),
    };
  }

  private gitChangedPaths() {
    const baseRef = process.env.AGENT_V2_AUTO_PUBLISH_BASE_REF;
    const args = baseRef ? ['diff', '--name-only', baseRef, '--'] : ['diff', '--name-only', 'HEAD', '--'];
    const output = execFileSync('git', args, {
      cwd: this.workspaceRoot(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return output.split(/\r?\n/).map((item) => normalizePath(item)).filter(Boolean);
  }

  private matchDraftsByChangedPaths(drafts: AutoPublishDraft[], changedPaths: string[]) {
    if (!changedPaths.length) return [];
    const changedSet = changedPaths.map((item) => normalizePath(item));
    return drafts
      .filter((draft) => this.draftMatchesChangedPaths(draft, changedSet))
      .map((draft) => String(draft.capabilityId))
      .filter(Boolean);
  }

  private draftMatchesChangedPaths(draft: AutoPublishDraft, changedPaths: string[]) {
    if (changedPaths.some((item) => item.endsWith('packages/server-v2/prisma/schema.prisma'))) return true;
    const tokens = this.draftSourceTokens(draft);
    return changedPaths.some((changedPath) => tokens.some((token) => pathMatchesToken(changedPath, token)));
  }

  private draftSourceTokens(draft: AutoPublishDraft) {
    const keys = ['evidence', 'sourceFiles', 'sourcePaths', 'sourceApis', 'sourceRoutes', 'sourceDtos'] as const;
    return keys
      .flatMap((key) => arrayValue(draft[key]))
      .flatMap((value) => sourcePathTokens(value))
      .map((item) => normalizePath(item))
      .filter(Boolean);
  }

  private async changedDraftsByFingerprint(drafts: AutoPublishDraft[]) {
    const capabilityIds = drafts.map((draft) => String(draft.capabilityId)).filter(Boolean);
    if (!capabilityIds.length) return [];
    const existing = await this.prisma.agentCapabilityDraft.findMany({
      where: { capabilityId: { in: capabilityIds } },
      select: { capabilityId: true, scannerFingerprint: true },
    });
    const existingFingerprints = new Map(existing.map((item) => [item.capabilityId, item.scannerFingerprint]));
    return drafts
      .filter((draft) => {
        const capabilityId = String(draft.capabilityId);
        return existingFingerprints.get(capabilityId) !== this.fingerprint(draft);
      })
      .map((draft) => String(draft.capabilityId))
      .filter(Boolean);
  }

  private scanPlanDto(scanPlan: AutoPublishScanPlan) {
    return {
      importPath: scanPlan.importPath,
      capabilityIds: scanPlan.capabilityIds?.slice(0, 50),
      capabilityIdCount: scanPlan.capabilityIds?.length ?? null,
      changedPaths: scanPlan.changedPaths?.slice(0, 50),
      changedPathCount: scanPlan.changedPaths?.length ?? null,
      skipPublish: scanPlan.skipPublish,
    };
  }

  private async runPostPublishSmoke(input: AgentV2AutoPublishInput, publishResult: Record<string, any>) {
    const capabilityIds = Array.isArray(publishResult.publishedCapabilityIds)
      ? publishResult.publishedCapabilityIds.map(String).filter(Boolean)
      : [];
    if (!input.postPublishSmoke) {
      return {
        requested: false,
        executed: false,
        pass: true,
        capabilityIds: [],
        results: [],
        note: '发布后 Runtime smoke 未请求；可通过管理端手动烟测或在自动发布输入中开启。',
      };
    }

    const limit = Math.min(this.toPositiveInt(input.postPublishSmokeLimit, 5), 20);
    const selectedCapabilityIds = capabilityIds.slice(0, limit);
    const results = [];
    for (const capabilityId of selectedCapabilityIds) {
      try {
        results.push(await this.capabilityCenter.runPostPublishSmokeTest(capabilityId, {
          storeId: this.toPositiveInt(input.postPublishSmokeStoreId, 1),
          userId: input.requestedBy,
        }));
      } catch (error) {
        results.push({
          capabilityId,
          pass: false,
          issues: [{
            code: 'post_publish_smoke_error',
            level: 'block',
            message: error instanceof Error ? error.message : String(error),
          }],
        });
      }
    }

    return {
      requested: true,
      executed: selectedCapabilityIds.length > 0,
      pass: selectedCapabilityIds.length > 0 && results.every((item: any) => item.pass === true),
      capabilityIds: selectedCapabilityIds,
      skippedCapabilityCount: Math.max(0, capabilityIds.length - selectedCapabilityIds.length),
      results,
      note: selectedCapabilityIds.length
        ? '发布后 Runtime smoke 已验证代表问法是否命中新发布能力，并执行 dry-run 工具取数。'
        : '本次自动发布没有可烟测的已发布能力。',
    };
  }

  private resolveWorkspacePath(path: string) {
    if (/^[A-Za-z]:\\/.test(path)) return path;
    return resolve(this.workspaceRoot(), path);
  }

  private workspaceRoot() {
    const cwd = process.cwd();
    return cwd.endsWith('packages\\server-v2') || cwd.endsWith('packages/server-v2') ? resolve(cwd, '../..') : cwd;
  }

  private fingerprint(raw: AutoPublishDraft) {
    const text = JSON.stringify({
      capabilityId: raw.capabilityId,
      sourceApis: raw.sourceApis,
      sourceModels: raw.sourceModels,
      executor: raw.executor,
      permissionCodes: raw.permissionCodes,
    });
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    return Math.abs(hash).toString(36);
  }

  private toRunDto(run: Record<string, any>) {
    return {
      id: run.id,
      runNo: run.runNo,
      status: run.status,
      requestedBy: run.requestedBy,
      sourceVersionId: run.sourceVersionId,
      targetVersionId: run.targetVersionId,
      input: run.inputJson,
      result: run.resultJson,
      errorMessage: run.errorMessage,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      createdAt: run.createdAt,
    };
  }

  private toPositiveInt(value: unknown, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
  }

  private asObject(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  }

  private toJson(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === undefined || value === null) return undefined;
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private formatTimestamp(date: Date) {
    const parts = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
    return `${get('year')}${get('month')}${get('day')}${get('hour')}${get('minute')}${get('second')}`;
  }
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function sourcePathTokens(value: unknown) {
  const text = String(value ?? '').trim();
  if (!text) return [];
  const tokens = new Set<string>();
  for (const part of text.split(':')) {
    const candidate = part.trim();
    if (candidate.includes('/') || candidate.includes('\\')) tokens.add(candidate.replace(/\d+$/, ''));
  }
  const pathMatch = text.match(/([A-Za-z0-9_.-]+[\\/][^:\s]+?\.(?:ts|tsx|js|jsx|prisma))/);
  if (pathMatch?.[1]) tokens.add(pathMatch[1]);
  return Array.from(tokens);
}

function pathMatchesToken(changedPath: string, token: string) {
  if (!token || !changedPath) return false;
  return token === changedPath || token.endsWith(changedPath) || changedPath.endsWith(token) || token.includes(changedPath);
}

function normalizePath(value: string) {
  return String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '');
}
