import { Injectable, NotFoundException } from '@nestjs/common';
import { BrainMemory, BrainMemoryType, Prisma } from '@prisma/client';
import { BrainMemoryRepository } from './brain-memory.repository.js';

interface ClarificationConflict {
  slot: string;
  candidates: string[];
}

export interface BrainMemoryCandidate {
  type: 'procedural' | 'episodic' | 'semantic';
  subjectKey: string;
  content: Record<string, unknown>;
  confidence: number;
  expiresAt?: Date;
}

@Injectable()
export class BrainMemoryService {
  constructor(private readonly repository: BrainMemoryRepository) {}

  extractMemoryCandidates(text: string): BrainMemoryCandidate[] {
    const candidates: BrainMemoryCandidate[] = [];
    const normalized = text.replace(/\s+/g, ' ').trim();

    if (normalized.includes('先看毛利再看流水')) {
      candidates.push({
        type: 'procedural',
        subjectKey: 'store.preference.metric_order',
        content: { preference: '先看毛利再看流水' },
        confidence: 0.8,
      });
    }

    const preference = normalized.match(/(?:以后|今后|默认|请记住)[，,:：\s]*(.{2,50})/);
    if (preference && !this.containsVolatileFact(preference[1]) && !normalized.includes('先看毛利再看流水')) {
      candidates.push({
        type: 'procedural',
        subjectKey: 'user.preference.general',
        content: { preference: preference[1].replace(/[。！!]$/, '') },
        confidence: 0.75,
      });
    }

    const customerPreference = normalized.match(/客户?([\u4e00-\u9fa5]{2,8})(?:喜欢|偏好|不喜欢)[，,:：\s]*(.{2,40})/);
    if (customerPreference && !this.containsVolatileFact(customerPreference[2])) {
      candidates.push({
        type: 'semantic',
        subjectKey: `customer.${customerPreference[1]}.preference`,
        content: { customerName: customerPreference[1], preference: customerPreference[2].replace(/[。！!]$/, '') },
        confidence: 0.7,
      });
    }

    const decision = normalized.match(/(?:我决定|决定|确定)[，,:：\s]*(.{3,50})/);
    if (decision && !this.containsVolatileFact(decision[1])) {
      candidates.push({
        type: 'episodic',
        subjectKey: `store.decision.${this.subjectFragment(decision[1])}`,
        content: { decision: decision[1].replace(/[。！!]$/, '') },
        confidence: 0.75,
        expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
      });
    }

    return candidates;
  }

  async persistCandidates(input: { storeId: number; userId: number; runId: number; text: string }) {
    const candidates = this.extractMemoryCandidates(input.text);
    const persisted: BrainMemory[] = [];
    for (const candidate of candidates) {
      const existing = await this.repository.findLatestIdentity({
        storeId: input.storeId,
        userId: input.userId,
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
        userId: input.userId,
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

  retrieveRelevant(input: { storeId: number; userId: number; subjectPrefixes?: string[] }) {
    return this.repository.findRelevantMemories({ ...input, take: 20 });
  }

  async listForGovernance(input: { storeId: number; userId?: number; includeDeleted?: boolean }) {
    const items = await this.repository.listScoped(input);
    return { items: items.map((item) => ({ ...item, content: this.redactContent(item.content) })), total: items.length };
  }

  async correctMemory(input: {
    id: number;
    storeId: number;
    userId: number;
    content: Record<string, unknown>;
    reason?: string;
  }) {
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
    return /\d|流水(?:是|为)|收入(?:是|为)|毛利(?:是|为)|预约(?:有|是|为)/.test(value);
  }

  private subjectFragment(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 24) || 'general';
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
