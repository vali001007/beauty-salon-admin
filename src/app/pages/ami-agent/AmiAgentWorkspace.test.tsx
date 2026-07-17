// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentQualityTab, MessageItem } from './AmiAgentWorkspace';

describe('AmiAgentWorkspace MessageItem', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('renders shared no_data, unsupported, and failed status notices', () => {
    const onFollowUp = vi.fn();
    const onFeedback = vi.fn();
    const onAction = vi.fn();

    const renderNotice = (kind: 'no_data' | 'unsupported' | 'failed', title: string, message: string) => {
      act(() => {
        root.render(
          <MessageItem
            msg={{
              id: `msg-${kind}`,
              role: 'agent',
              text: message,
              statusNotice: { kind, title, message },
            }}
            onFollowUp={onFollowUp}
            onFeedback={onFeedback}
            onAction={onAction}
          />,
        );
      });
    };

    renderNotice('no_data', '暂无数据', '未来 90 天暂无临期库存。');
    expect(container.textContent).toContain('暂无数据');
    expect(container.textContent).toContain('未来 90 天暂无临期库存。');
    expect(container.textContent).not.toContain('执行失败');

    renderNotice('unsupported', '暂不支持', '当前暂不支持查询这个指标。');
    expect(container.textContent).toContain('暂不支持');
    expect(container.textContent).toContain('当前暂不支持查询这个指标。');
    expect(container.textContent).not.toContain('执行失败');

    renderNotice('failed', '执行失败', '库存数据加载失败。');
    expect(container.textContent).toContain('执行失败');
    expect(container.textContent).toContain('库存数据加载失败。');
  });

  it('renders Agent Router badge and reason on agent messages', () => {
    const onFollowUp = vi.fn();
    const onFeedback = vi.fn();
    const onAction = vi.fn();

    act(() => {
      root.render(
        <MessageItem
          msg={{
            id: 'msg-route',
            role: 'agent',
            text: '近期临期库存如下。',
            personaCode: 'inventory',
            routeDecision: {
              personaCode: 'inventory',
              confidence: 0.88,
              reason: '命中库存能力',
              candidates: [{ personaCode: 'inventory', score: 0.88, matchedCapabilities: ['临期库存'] }],
              clarificationNeeded: false,
              mode: 'auto',
            },
          }}
          onFollowUp={onFollowUp}
          onFeedback={onFeedback}
          onAction={onAction}
        />,
      );
    });

    expect(container.textContent).toContain('由 库存采购 Agent 处理');
    expect(container.textContent).toContain('命中库存能力');
  });

  it('hides duplicate message actions already rendered inside blocks', () => {
    const onFollowUp = vi.fn();
    const onFeedback = vi.fn();
    const onAction = vi.fn();

    act(() => {
      root.render(
        <MessageItem
          msg={{
            id: 'msg-actions',
            role: 'agent',
            text: '今日预约排班诊断完成。',
            blocks: [
              {
                kind: 'inventory_item_card',
                title: '预约排班诊断',
                itemName: '排班容量',
                riskLevel: 'medium',
                metrics: [{ label: '预约数', value: '4' }],
                reason: '今日有预约可能未覆盖。',
                actions: [
                  { label: '查看排班表', actionId: 'scheduling:open', riskLevel: 'low' },
                  { label: '生成排班优化预览', actionId: 'agent:tool:scheduling.optimization.preview', riskLevel: 'low' },
                ],
              },
            ],
            actions: [
              { label: '查看排班表', action: 'scheduling:open', riskLevel: 'low' },
              { label: '生成排班优化预览', action: 'agent:tool:scheduling.optimization.preview', riskLevel: 'low' },
            ],
          }}
          onFollowUp={onFollowUp}
          onFeedback={onFeedback}
          onAction={onAction}
        />,
      );
    });

    expect(Array.from(container.querySelectorAll('button')).filter((button) => button.textContent === '查看排班表')).toHaveLength(1);
    expect(Array.from(container.querySelectorAll('button')).filter((button) => button.textContent === '生成排班优化预览')).toHaveLength(1);
  });

  it('submits feedback with the current question context', () => {
    const onFollowUp = vi.fn();
    const onFeedback = vi.fn();
    const onAction = vi.fn();

    act(() => {
      root.render(
        <MessageItem
          msg={{
            id: 'agent-msg-2',
            role: 'agent',
            text: '需要重点跟进 3 位客户。',
            runId: 101,
            metadata: {
              feedbackScope: 'message',
              feedbackQuestion: '今天哪些客户需要跟进',
            },
          }}
          onFollowUp={onFollowUp}
          onFeedback={onFeedback}
          onAction={onAction}
        />,
      );
    });

    act(() => {
      Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
        .find((button) => button.textContent?.includes('无用'))
        ?.click();
    });

    expect(onFeedback).toHaveBeenCalledWith(101, false, expect.objectContaining({
      feedbackScope: 'message',
      messageId: 'agent-msg-2',
      question: '今天哪些客户需要跟进',
      answer: '需要重点跟进 3 位客户。',
      source: 'ami-agent:workspace',
    }));
  });
});

describe('AmiAgentWorkspace AgentQualityTab', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('renders question bank coverage and priority pass rates', () => {
    act(() => {
      root.render(
        <AgentQualityTab
          persona={null}
          qualityReport={{
            range: { days: 7, startDate: '2026-06-23', endDate: '2026-06-29' },
            kpis: {
              runCount: 2,
              completed: 1,
              failed: 1,
              successRate: 0.5,
              feedbackCount: 1,
              adopted: 1,
              rejected: 0,
              adoptionRate: 1,
            },
            questionBank: {
              totalQuestions: 650,
              structuredQuestions: 650,
              coverageRate: 1,
              p0Cases: 120,
              conversationCases: 4,
              conversationTurns: 5,
              priorityPassRates: [
                { priority: 'P0', total: 2, passed: 1, failed: 1, passRate: 0.5 },
                { priority: 'P1', total: 1, passed: 1, failed: 0, passRate: 1 },
                { priority: 'P2', total: 0, passed: 0, failed: 0, passRate: null },
              ],
            },
            personaBreakdown: [],
            entrypointBreakdown: [],
            toolBreakdown: [],
            recentNegativeFeedback: [],
            recommendations: [],
          }}
          schemaReadiness={null}
          memories={[]}
          archives={[]}
          automations={[]}
          automationRuns={[]}
          feedbackFailures={null}
          loading={false}
          onRefresh={vi.fn()}
        />,
      );
    });

    expect(container.textContent).toContain('问题库门禁');
    expect(container.textContent).toContain('P0 120 条');
    expect(container.textContent).toContain('650/650');
    expect(container.textContent).toContain('P0 通过率');
    expect(container.textContent).toContain('50% · 1/2');
    expect(container.textContent).toContain('P2 通过率');
    expect(container.textContent).toContain('未运行');
  });
});
