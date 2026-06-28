import { describe, expect, it, vi } from 'vitest';
import {
  type AgentRunContextSource,
  buildContextSummary,
  createConversationContext,
  getLatestAgentContextFromMessages,
  resetConversationContext,
  resolvePronouns,
  updateConversationContext,
} from './conversationContext';
import type { ConversationContext } from '../types/conversation';

describe('conversationContext', () => {
  it('keeps only recent turns and records resolved action', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-27T10:00:00.000Z'));

    let context = createConversationContext('manager', 6);
    for (let index = 0; index < 8; index += 1) {
      context = updateConversationContext(context, {
        userInput: `${index + 1}月经营情况`,
        resolvedAction: `business.query.${index}`,
      });
    }

    expect(context.recentTurns).toHaveLength(6);
    expect(context.recentTurns[0].userInput).toBe('3月经营情况');
    expect(context.recentTurns[5]).toMatchObject({
      resolvedAction: 'business.query.7',
      action: 'business.query.7',
      keyEntities: { dateRange: { from: '2026-08-01', to: '2026-08-31' } },
    });
    expect(context.activeEntities.dateRange).toEqual({ from: '2026-08-01', to: '2026-08-31' });

    vi.useRealTimers();
  });

  it('resolves customer pronouns from active entities and builds context summary', () => {
    const context: ConversationContext = {
      sessionId: 's1',
      role: 'manager',
      storeId: 6,
      recentTurns: [
        {
          userInput: '查马美琳最近消费',
          resolvedAction: 'business.query',
          action: 'business.query',
          createdAt: '2026-06-27T10:00:00.000Z',
        },
      ],
      activeEntities: {
        customer: { id: 501, name: '马美琳' },
        beautician: { id: 11, name: '林店长' },
      },
    };

    expect(resolvePronouns('给她做复购承接', context)).toBe('给马美琳（客户ID:501）做复购承接');
    expect(buildContextSummary(context)).toBe(
      '[上下文] 当前关注客户：马美琳（ID:501）；当前关注美容师：林店长；上一个操作：business.query',
    );
  });

  it('resets recent turns and active entities', () => {
    const context: ConversationContext = {
      sessionId: 's1',
      role: 'manager',
      recentTurns: [{ userInput: '查客户', action: 'business.query', createdAt: '2026-06-27T10:00:00.000Z' }],
      activeEntities: { customer: { id: 1, name: '客户A' } },
    };

    expect(resetConversationContext(context)).toEqual({
      ...context,
      recentTurns: [],
      activeEntities: {},
    });
  });

  it('extracts latest previous run context from arbitrary message streams', () => {
    type TestMessage =
      | { payload: { kind: 'agentRun'; data: AgentRunContextSource } }
      | { payload: { kind: 'businessQuery'; data: { requestId: string; answer?: string } } };

    const messages: TestMessage[] = [
      { payload: { kind: 'agentRun', data: { runId: 101, runNo: 'AG101', status: 'completed' } } },
      { payload: { kind: 'businessQuery', data: { requestId: 'bq_1' } } },
      {
        payload: {
          kind: 'agentRun',
          data: {
            runId: 202,
            runNo: 'AG202',
            status: 'completed',
            toolResults: [{ status: 'success', title: '消费客户清单', summary: '2 位客户' }],
            actions: [{ label: '生成复购承接清单', action: 'customer.followup.task.draft', riskLevel: 'medium' }],
            evidence: { source: ['ProductOrder'], metricDefinition: '订单聚合', filters: ['timeRange=昨天'] },
          },
        },
      },
    ];

    const context = getLatestAgentContextFromMessages(messages, {
      getAgentRun: (message) => (message.payload.kind === 'agentRun' ? message.payload.data : null),
      getBusinessQuery: (message) => (message.payload.kind === 'businessQuery' ? message.payload.data : null),
    });

    expect(context).toMatchObject({
      previousRun: {
        runId: 202,
        runNo: 'AG202',
        status: 'completed',
        toolResults: [{ title: '消费客户清单' }],
        actions: [{ action: 'customer.followup.task.draft' }],
        evidence: { source: ['ProductOrder'] },
      },
    });
  });

  it('falls back to latest business query context when no agent run exists', () => {
    const context = getLatestAgentContextFromMessages(
      [{ payload: { kind: 'businessQuery', data: { requestId: 'bq_2', answer: '今日收入' } } }],
      {
        getAgentRun: () => null,
        getBusinessQuery: (message) => message.payload.data,
      },
    );

    expect(context).toEqual({ previousBusinessQuery: { requestId: 'bq_2', answer: '今日收入' } });
  });
});
