import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BrainMemory, BrainMemoryType, Prisma } from '@prisma/client';
import { BrainMemoryRepository } from './brain-memory.repository.js';

interface ClarificationConflict {
  slot: string;
  candidates: string[];
}

export interface BrainMemoryCandidate {
  type: 'procedural' | 'episodic' | 'semantic';
  scope: 'user' | 'store';
  subjectKey: string;
  content: Record<string, unknown>;
  confidence: number;
  expiresAt?: Date;
}

export interface BrainMemoryInstructionResult {
  handled: boolean;
  action: 'none' | 'remembered' | 'forgotten' | 'listed' | 'rejected';
  message?: string;
  memories: BrainMemory[];
}

@Injectable()
export class BrainMemoryService {
  constructor(private readonly repository: BrainMemoryRepository) {}

  extractMemoryCandidates(text: string): BrainMemoryCandidate[] {
    const candidates: BrainMemoryCandidate[] = [];
    const normalized = text.replace(/\s+/g, ' ').trim();
    const explicitRemember = /(?:请记住|帮我记住|记住这条|以后|今后|设为默认|作为默认)/.test(normalized);
    if (!explicitRemember || /(?:吗|么|是否|是不是)[？?]?$/.test(normalized)) return candidates;
    const scope = /(?:全店|我们店|本店|门店统一|店里统一|全员)/.test(normalized) ? 'store' : 'user';
    const prefix = scope === 'store' ? 'store' : 'user';
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    const decision = normalized.match(/(?:请记住|帮我记住|记住这条)[，,:：\s]*(?:(?:我们|我|门店|全店)(?:已经)?决定)[，,:：\s]*(.{3,80})/);

    if (normalized.includes('先看毛利再看流水') && this.isLongTermSafe('先看毛利再看流水')) {
      candidates.push({
        type: 'procedural',
        scope,
        subjectKey: `${prefix}.preference.metric_order`,
        content: { preference: '先看毛利再看流水', memoryKind: 'preference', source: 'explicit_user_instruction' },
        confidence: 0.9,
        expiresAt,
      });
    }

    const preference = normalized.match(/(?:请记住|帮我记住|记住这条|以后|今后|设为默认|作为默认)[，,:：\s]*(?:以后|今后|默认|全店|我们店|本店|门店统一|店里统一|全员)*[，,:：\s]*(.{2,80})/);
    if (preference && !decision && this.isLongTermSafe(preference[1]) && !normalized.includes('先看毛利再看流水')) {
      const value = preference[1].replace(/[。！!]$/, '').trim();
      candidates.push({
        type: 'procedural',
        scope,
        subjectKey: `${prefix}.preference.${this.preferenceCategory(value)}`,
        content: { preference: value, memoryKind: 'preference', source: 'explicit_user_instruction' },
        confidence: 0.9,
        expiresAt,
      });
    }

    if (decision && this.isLongTermSafe(decision[1])) {
      candidates.push({
        type: 'episodic',
        scope,
        subjectKey: `${prefix}.decision.${this.subjectFragment(decision[1])}`,
        content: { decision: decision[1].replace(/[。！!]$/, ''), memoryKind: 'decision', source: 'explicit_user_instruction' },
        confidence: 0.9,
        expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
      });
    }

    return candidates;
  }

  async persistCandidates(input: { storeId: number; userId: number; runId: number; text: string; allowStoreScope?: boolean }) {
    const candidates = this.extractMemoryCandidates(input.text);
    const persisted: BrainMemory[] = [];
    for (const candidate of candidates) {
      if (candidate.scope === 'store' && !input.allowStoreScope) continue;
      const memoryUserId = candidate.scope === 'store' ? undefined : input.userId;
      const existing = await this.repository.findLatestIdentity({
        storeId: input.storeId,
        userId: memoryUserId,
        type: candidate.type as BrainMemoryType,
        subjectKey: candidate.subjectKey,
      });
      if (existing && this.sameContent(existing.content, candidate.content)) {
        persisted.push(
          await this.repository.updateMemory(existing.id, {
            confidence: Math.min(0.95, Math.max(existing.confidence, candidate.confidence) + 0.03),
            sourceRunId: input.runId,
            expiresAt: candidate.expiresAt,
          }),
        );
        continue;
      }

      const created = await this.repository.writeMemory({
        storeId: input.storeId,
        userId: memoryUserId,
        type: candidate.type as BrainMemoryType,
        subjectKey: candidate.subjectKey,
        content: candidate.content as Prisma.InputJsonValue,
        confidence: candidate.confidence,
        expiresAt: candidate.expiresAt,
        sourceRunId: input.runId,
      });
      if (existing) {
        await this.repository.updateMemory(existing.id, { deletedAt: new Date() });
        await this.repository.createRevision({
          memoryId: created.id,
          previousMemoryId: existing.id,
          revisionType: 'conflict_replaced',
          previousContent: existing.content as Prisma.InputJsonValue,
          nextContent: candidate.content as Prisma.InputJsonValue,
          changedByUserId: input.userId,
          reason: 'newer_conversation_memory',
        });
      }
      persisted.push(created);
    }
    return persisted;
  }

  async applyUserInstruction(input: {
    storeId: number;
    userId: number;
    runId: number;
    text: string;
    allowStoreScope?: boolean;
  }): Promise<BrainMemoryInstructionResult> {
    const normalized = input.text.replace(/\s+/g, ' ').trim();
    if (this.isMemoryListRequest(normalized)) {
      const memories = await this.retrieveRelevant({
        storeId: input.storeId,
        userId: input.userId,
        subjectPrefixes: ['user.preference.', 'store.preference.', 'user.decision.', 'store.decision.'],
      });
      return {
        handled: true,
        action: 'listed',
        memories,
        message: memories.length
          ? `我当前记得 ${memories.length} 条有效偏好或决定：${memories.map((item) => this.memorySummary(item)).join('；')}。你可以直接说“忘记我的偏好”或“以后默认……”。`
          : '我当前没有保存你的有效长期偏好或决定。实时经营数值不会进入长期记忆。',
      };
    }
    if (this.isForgetRequest(normalized)) {
      const storeScope = /(?:全店|我们店|本店|门店|店里)/.test(normalized);
      if (storeScope && !input.allowStoreScope) {
        return { handled: true, action: 'rejected', memories: [], message: '未删除门店共享记忆：当前账号缺少记忆治理权限。' };
      }
      const prefixes = /(?:决定|方案|约定)/.test(normalized)
        ? [storeScope ? 'store.decision.' : 'user.decision.']
        : [storeScope ? 'store.preference.' : 'user.preference.'];
      const memories = await this.repository.findActiveByPrefixes({
        storeId: input.storeId,
        userId: input.userId,
        subjectPrefixes: prefixes,
        includeStoreScope: storeScope,
      });
      for (const memory of memories) {
        await this.repository.updateMemory(memory.id, { deletedAt: new Date() });
        await this.repository.createRevision({
          memoryId: memory.id,
          revisionType: 'user_forgotten',
          previousContent: memory.content as Prisma.InputJsonValue,
          changedByUserId: input.userId,
          reason: 'natural_language_forget_instruction',
        });
      }
      return {
        handled: true,
        action: 'forgotten',
        memories,
        message: memories.length ? `已忘记 ${memories.length} 条${storeScope ? '门店共享' : '个人'}记忆。` : '没有找到可删除的有效记忆。',
      };
    }
    const candidates = this.extractMemoryCandidates(normalized);
    if (!candidates.length) return { handled: false, action: 'none', memories: [] };
    if (candidates.some((candidate) => candidate.scope === 'store') && !input.allowStoreScope) {
      return { handled: true, action: 'rejected', memories: [], message: '未写入门店共享记忆：当前账号缺少记忆治理权限。你可以改成“以后我个人默认……”。' };
    }
    const memories = await this.persistCandidates(input);
    return {
      handled: true,
      action: 'remembered',
      memories,
      message: memories.length
        ? `已记住 ${memories.length} 条${memories.some((item) => item.userId === null) ? '门店共享' : '个人'}偏好或决定。`
        : '这条内容未进入长期记忆；短期经营数值、敏感字段和未验证客户画像不会被保存。',
    };
  }

  retrieveRelevant(input: { storeId: number; userId: number; subjectPrefixes?: string[] }) {
    return this.repository.findRelevantMemories({ ...input, take: 20 }).then((items) =>
      items.sort((left, right) => {
        const scopePriority = Number(right.userId === input.userId) - Number(left.userId === input.userId);
        if (scopePriority !== 0) return scopePriority;
        return right.updatedAt.getTime() - left.updatedAt.getTime() || right.confidence - left.confidence;
      }),
    );
  }

  async retrieveForPlanning(input: { storeId: number; userId: number; question: string }) {
    const includeDecisions = /(?:之前决定|之前的方案|照之前|按之前|原来的约定|上次决定)/.test(input.question);
    const subjectPrefixes = ['user.preference.', 'store.preference.'];
    if (includeDecisions) subjectPrefixes.push('user.decision.', 'store.decision.');
    const items = await this.retrieveRelevant({ ...input, subjectPrefixes });
    const selected = new Map<string, BrainMemory>();
    for (const item of items) {
      const identity = item.subjectKey.replace(/^(?:user|store)\./, '');
      if (!selected.has(identity)) selected.set(identity, item);
    }
    return [...selected.values()].slice(0, 8).map((item) => ({
      id: item.id,
      type: item.type,
      subjectKey: item.subjectKey,
      scope: item.userId === null ? 'store' : 'user',
      content: this.redactContent(item.content),
      confidence: item.confidence,
      sourceRunId: item.sourceRunId,
      updatedAt: item.updatedAt.toISOString(),
      expiresAt: item.expiresAt?.toISOString() ?? null,
      policy: 'preference_or_explicit_decision_only_not_business_fact',
    }));
  }

  async listForGovernance(input: { storeId: number; userId?: number; includeDeleted?: boolean }) {
    const items = await this.repository.listScoped(input);
    const now = Date.now();
    return {
      items: items.map((item) => ({
        ...item,
        scope: item.userId === null ? 'store' : 'user',
        state: item.deletedAt ? 'deleted' : item.expiresAt && item.expiresAt.getTime() <= now ? 'expired' : 'active',
        content: this.redactContent(item.content),
      })),
      total: items.length,
    };
  }

  async listRevisions(input: { id: number; storeId: number; userId?: number }) {
    const existing = await this.repository.findScopedById(input);
    if (!existing) throw new NotFoundException('记忆不存在或无权查看');
    const items = await this.repository.listRevisions(existing.id);
    return {
      items: items.map((item) => ({
        ...item,
        previousContent: item.previousContent ? this.redactContent(item.previousContent) : null,
        nextContent: item.nextContent ? this.redactContent(item.nextContent) : null,
      })),
      total: items.length,
    };
  }

  async correctMemory(input: {
    id: number;
    storeId: number;
    userId: number;
    content: Record<string, unknown>;
    reason?: string;
  }) {
    if (!this.isLongTermContentSafe(input.content)) {
      throw new BadRequestException('长期记忆不能保存短期经营数值或敏感字段');
    }
    const existing = await this.repository.findScopedById({ id: input.id, storeId: input.storeId, userId: input.userId });
    if (!existing) throw new NotFoundException('记忆不存在或无权修改');
    const created = await this.repository.writeMemory({
      storeId: existing.storeId,
      userId: existing.userId ?? undefined,
      type: existing.type,
      subjectKey: existing.subjectKey,
      content: input.content as Prisma.InputJsonValue,
      confidence: Math.max(existing.confidence, 0.9),
      expiresAt: existing.expiresAt ?? undefined,
      sourceRunId: existing.sourceRunId ?? undefined,
    });
    await this.repository.updateMemory(existing.id, { deletedAt: new Date() });
    await this.repository.createRevision({
      memoryId: created.id,
      previousMemoryId: existing.id,
      revisionType: 'user_correction',
      previousContent: existing.content as Prisma.InputJsonValue,
      nextContent: input.content as Prisma.InputJsonValue,
      changedByUserId: input.userId,
      reason: input.reason,
    });
    return { ...created, content: this.redactContent(created.content) };
  }

  async deleteMemory(input: { id: number; storeId: number; userId: number; reason?: string }) {
    const existing = await this.repository.findScopedById({ id: input.id, storeId: input.storeId, userId: input.userId });
    if (!existing) throw new NotFoundException('记忆不存在或无权删除');
    const updated = await this.repository.updateMemory(existing.id, { deletedAt: new Date() });
    await this.repository.createRevision({
      memoryId: existing.id,
      revisionType: 'user_deleted',
      previousContent: existing.content as Prisma.InputJsonValue,
      changedByUserId: input.userId,
      reason: input.reason,
    });
    return updated;
  }

  async restoreMemory(input: { id: number; storeId: number; userId: number }) {
    const existing = await this.repository.findScopedById({ id: input.id, storeId: input.storeId, userId: input.userId });
    if (!existing) throw new NotFoundException('记忆不存在或无权恢复');
    const conflict = await this.repository.findActiveIdentity({
      storeId: existing.storeId,
      userId: existing.userId ?? undefined,
      type: existing.type,
      subjectKey: existing.subjectKey,
      excludeId: existing.id,
    });
    if (conflict) throw new BadRequestException('已有更新版本处于生效状态，请纠正当前版本而不是恢复旧记忆');
    const updated = await this.repository.updateMemory(existing.id, { deletedAt: null });
    await this.repository.createRevision({
      memoryId: existing.id,
      revisionType: 'user_restored',
      nextContent: existing.content as Prisma.InputJsonValue,
      changedByUserId: input.userId,
    });
    return updated;
  }

  buildClarification(conflicts: ClarificationConflict[]) {
    const fragments = conflicts.map((conflict) => `${conflict.slot}: ${conflict.candidates.join(' / ')}`);
    return {
      question: `我需要先确认这些信息：${fragments.join('；')}`,
      options: conflicts.flatMap((conflict) =>
        conflict.candidates.map((candidate) => ({
          id: `${conflict.slot}:${candidate}`,
          label: candidate,
          value: { slot: conflict.slot, candidate },
        })),
      ),
    };
  }

  private containsVolatileFact(value: string) {
    return /(?:今天|昨天|明天|本周|上周|本月|上月|本季度|今年|当前|现在)|(?:流水|收入|毛利|预约|退款|库存|余额|业绩)[^。；]{0,12}\d/.test(value);
  }

  private containsSensitiveFact(value: string) {
    return /(?:手机号|手机|电话|身份证|证件号|银行卡|卡号|住址|地址|病史|过敏原文|密码|验证码)|1\d{10}|\d{6}(?:19|20)\d{2}\d{2}\d{2}\d{3}[\dXx]/.test(value);
  }

  private isLongTermSafe(value: string) {
    return !this.containsVolatileFact(value) && !this.containsSensitiveFact(value);
  }

  private isLongTermContentSafe(value: unknown): boolean {
    if (value === null || typeof value === 'boolean') return true;
    if (typeof value === 'number') return false;
    if (typeof value === 'string') return this.isLongTermSafe(value);
    if (Array.isArray(value)) return value.every((item) => this.isLongTermContentSafe(item));
    if (value && typeof value === 'object') {
      return Object.entries(value).every(
        ([key, item]) => !this.containsSensitiveFact(key) && this.isLongTermContentSafe(item),
      );
    }
    return false;
  }

  private subjectFragment(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 24) || 'general';
  }

  private preferenceCategory(value: string) {
    if (/(?:先看|后看|指标|毛利|流水|收入|复购)/.test(value)) return 'metric_order';
    if (/(?:简洁|详细|表格|列表|先说结论|回答风格)/.test(value)) return 'answer_style';
    if (/(?:默认时间|本月|本周|今天|时间范围)/.test(value)) return 'time_scope';
    return 'general';
  }

  private isMemoryListRequest(value: string) {
    return /(?:你记得我什么|你都记得什么|查看我的记忆|列出我的记忆|我的偏好是什么|记住了什么)/.test(value);
  }

  private isForgetRequest(value: string) {
    return /(?:忘记|不要再记|删除.*记忆|清除.*偏好|取消.*默认)/.test(value);
  }

  private memorySummary(memory: BrainMemory) {
    const content = memory.content as Record<string, unknown>;
    return String(content.preference ?? content.decision ?? memory.subjectKey);
  }

  private sameContent(left: Prisma.JsonValue, right: Record<string, unknown>) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  private redactContent(value: Prisma.JsonValue): Prisma.JsonValue {
    if (typeof value === 'string') {
      return value
        .replace(/1\d{2}\d{4}(\d{4})/g, '1** **** $1')
        .replace(/\d{6}(?:19|20)\d{2}\d{2}\d{2}\d{3}[\dXx]/g, '[证件号已脱敏]');
    }
    if (Array.isArray(value)) return value.map((item) => this.redactContent(item));
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          /(phone|mobile|idcard|身份证|过敏原文|病史)/i.test(key) ? '[敏感信息已隐藏]' : this.redactContent(item ?? null),
        ]),
      );
    }
    return value;
  }
}
