import { Injectable } from '@nestjs/common';
import type { AgentV5MemoryItem, AgentV5MemorySnapshot } from '../agent-v5.types.js';

type BuildSnapshotInput = {
  message: string;
  previousMemory?: AgentV5MemorySnapshot | null;
  runContext?: Record<string, unknown>;
  sourceMessageId?: number;
};

@Injectable()
export class AgentV5MemoryService {
  buildSnapshot(input: BuildSnapshotInput): AgentV5MemorySnapshot {
    const previous = input.previousMemory ?? this.empty();
    const contextMemory = this.fromContext(input.runContext);
    const extracted = this.extractWorkingMemory(input.message, input.sourceMessageId);
    return {
      working: this.mergeItems([...previous.working, ...contextMemory.working, ...extracted.working], 12),
      preferences: this.mergeItems([...previous.preferences, ...contextMemory.preferences, ...extracted.preferences], 12),
      businessContext: this.mergeItems([...previous.businessContext, ...contextMemory.businessContext, ...extracted.businessContext], 16),
      governance: previous.governance.slice(0, 20),
    };
  }

  resolvePronouns(message: string, memory: AgentV5MemorySnapshot) {
    const used: AgentV5MemoryItem[] = [];
    let resolved = message;
    if (/(她|他|这个客户|那个客户)/.test(message)) {
      const customer = memory.working.find((item) => item.key === 'last_customer_name');
      if (customer?.value) {
        resolved = resolved.replace(/她|他|这个客户|那个客户/g, customer.value);
        used.push(customer);
      }
    }
    return { message: resolved, memoryUsed: used };
  }

  empty(): AgentV5MemorySnapshot {
    return { working: [], preferences: [], businessContext: [], governance: [] };
  }

  private extractWorkingMemory(message: string, sourceMessageId?: number): Pick<AgentV5MemorySnapshot, 'working' | 'preferences' | 'businessContext'> {
    const working: AgentV5MemoryItem[] = [];
    const preferences: AgentV5MemoryItem[] = [];
    const businessContext: AgentV5MemoryItem[] = [];
    const customer = message.match(/(?:客户|顾客|会员)?([\u4e00-\u9fa5]{2,4})(?:今天|还有|预约|资料|卡|消费|来了吗|有没有|护理|核销)/)?.[1];
    if (customer) {
      working.push({
        key: 'last_customer_name',
        value: customer,
        entityType: 'Customer',
        sourceMessageId,
        source: 'message',
        confidence: 0.76,
      });
    }
    const timeRange = this.extractTimeRange(message);
    if (timeRange) {
      working.push({
        key: 'last_time_range',
        value: timeRange,
        sourceMessageId,
        source: 'message',
        confidence: 0.72,
      });
    }
    if (/以后|默认|优先/.test(message) && /经营|客户|库存|财务|预约/.test(message)) {
      preferences.push({
        key: 'preferred_analysis_scope',
        value: this.extractPreferredScope(message),
        sourceMessageId,
        source: 'explicit_user_choice',
        confidence: 0.68,
      });
    }
    if (/门店|店里|本店/.test(message)) {
      businessContext.push({
        key: 'last_business_scope',
        value: 'store',
        sourceMessageId,
        source: 'business_context',
        confidence: 0.7,
      });
    }
    return { working, preferences, businessContext };
  }

  private fromContext(context?: Record<string, unknown>): Pick<AgentV5MemorySnapshot, 'working' | 'preferences' | 'businessContext'> {
    const memory = context?.agentV5Memory;
    if (!memory || typeof memory !== 'object' || Array.isArray(memory)) {
      return { working: [], preferences: [], businessContext: [] };
    }
    const record = memory as Partial<AgentV5MemorySnapshot>;
    return {
      working: this.asItems(record.working),
      preferences: this.asItems(record.preferences),
      businessContext: this.asItems(record.businessContext),
    };
  }

  private mergeItems(items: AgentV5MemoryItem[], limit: number) {
    const map = new Map<string, AgentV5MemoryItem>();
    for (const item of items.filter((value) => value?.key && value.value)) {
      map.set(`${item.key}:${item.entityId ?? item.value}`, item);
    }
    return Array.from(map.values()).slice(-limit);
  }

  private asItems(value: unknown): AgentV5MemoryItem[] {
    return Array.isArray(value)
      ? value.filter((item): item is AgentV5MemoryItem => Boolean(item && typeof item === 'object' && 'key' in item && 'value' in item))
      : [];
  }

  private extractTimeRange(message: string) {
    if (/今天|今日/.test(message)) return 'today';
    if (/昨天/.test(message)) return 'yesterday';
    if (/本周|这周/.test(message)) return 'this_week';
    if (/上周/.test(message)) return 'last_week';
    if (/本月|这个月/.test(message)) return 'this_month';
    if (/上月|上个月/.test(message)) return 'last_month';
    return null;
  }

  private extractPreferredScope(message: string) {
    if (/客户|生命周期|跟进/.test(message)) return 'customer_lifecycle';
    if (/库存|补货|耗材/.test(message)) return 'inventory';
    if (/财务|毛利|对账/.test(message)) return 'finance';
    if (/预约|排班/.test(message)) return 'reservation';
    return 'business_overview';
  }
}
