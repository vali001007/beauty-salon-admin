import { describe, expect, it } from 'vitest';
import { presentBrainChatResponse } from './brain-response-presentation';
import type { BrainChatResponse } from './brain';

function response(overrides: Partial<BrainChatResponse> = {}): BrainChatResponse {
  return {
    conversationId: 16,
    runId: 88,
    status: 'completed',
    answer: '今日预约 3 单。',
    citations: [],
    suggestedActions: [],
    blocks: [{ kind: 'kpi', items: [{ label: '今日预约', value: '3 单' }] }],
    ...overrides,
  };
}

describe('mobile Brain response presentation', () => {
  it('keeps completed and confirmation responses structured', () => {
    expect(presentBrainChatResponse(response()).blocks).toEqual([
      { kind: 'kpi', items: [{ label: '今日预约', value: '3 单' }] },
    ]);

    const waiting = presentBrainChatResponse(
      response({
        status: 'needs_confirmation',
        suggestedActions: [
          {
            actionId: 'act_1',
            actionType: 'create_reservation',
            riskLevel: 'medium',
            summary: '创建预约预览',
            requiresConfirmation: true,
          },
        ],
        blocks: [],
      }),
    );
    expect(waiting.blocks).toEqual([expect.objectContaining({ kind: 'action_preview' })]);
  });

  it('suppresses business-result blocks when the top-level run failed', () => {
    const failed = presentBrainChatResponse(
      response({
        status: 'failed',
        answer: '今日预约 3 单。',
        suggestedActions: [
          {
            actionId: 'unsafe_action',
            riskLevel: 'high',
            summary: '不应展示的动作',
            requiresConfirmation: true,
          },
        ],
        citations: [{ sourceType: 'metric', sourceId: 'reservation.count', label: '预约数' }],
      }),
    );

    expect(failed.content).toContain('执行失败');
    expect(failed.blocks.some((block) => block.kind === 'kpi')).toBe(false);
    expect(failed.blocks.some((block) => block.kind === 'action_preview')).toBe(false);
    expect(failed.blocks).toEqual(
      expect.arrayContaining([
        { kind: 'limitations', items: ['capability_failed'] },
        expect.objectContaining({ kind: 'evidence' }),
      ]),
    );
  });

  it.each([
    ['queued', '正在处理', 'request_processing'],
    ['running', '正在处理', 'request_processing'],
    ['cancelled', '已取消', 'request_cancelled'],
  ] as const)('does not present %s as a completed business result', (status, text, limitation) => {
    const presentation = presentBrainChatResponse(response({ status }));

    expect(presentation.content).toContain(text);
    expect(presentation.blocks.some((block) => block.kind === 'kpi')).toBe(false);
    expect(presentation.blocks).toContainEqual({ kind: 'limitations', items: [limitation] });
  });
});
