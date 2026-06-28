// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BlockRenderer } from './BlockRenderer';

describe('BlockRenderer', () => {
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

  it('renders summary_text blocks as business conclusions', () => {
    act(() => {
      root.render(
        <BlockRenderer
          blocks={[
            {
              kind: 'summary_text',
              title: '核心结论',
              content: '近期有 3 个临期库存产品，建议优先处理最近 15 天到期批次。',
            },
          ]}
        />,
      );
    });

    expect(container.textContent).toContain('核心结论');
    expect(container.textContent).toContain('近期有 3 个临期库存产品');
  });

  it('orders unordered blocks with evidence before actions and follow-up chips last', () => {
    act(() => {
      root.render(
        <BlockRenderer
          blocks={[
            {
              kind: 'follow_up_chips',
              suggestions: ['生成复购话术'],
            },
            {
              kind: 'action_card',
              title: '生成承接任务',
              preview: '为 2 位客户生成复购承接任务。',
              actionId: 'followup',
              riskLevel: 'medium',
            },
            {
              kind: 'evidence_panel',
              sources: ['ProductOrder', 'Customer'],
              metricDefinition: '消费客户清单按有效订单聚合。',
            },
            {
              kind: 'table',
              columns: ['客户', '建议'],
              rows: [['马美琳', '复购承接']],
            },
            {
              kind: 'summary_text',
              content: '昨天共有 2 位消费客户。',
            },
          ]}
        />,
      );
    });

    const summary = Array.from(container.querySelectorAll('*')).find((node) => node.textContent === '昨天共有 2 位消费客户。');
    const table = container.querySelector('table');
    const evidence = Array.from(container.querySelectorAll('button')).find((node) => node.textContent?.includes('数据来源'));
    const action = Array.from(container.querySelectorAll('*')).find((node) => node.textContent === '生成承接任务');
    const followUp = Array.from(container.querySelectorAll('button')).find((node) => node.textContent === '生成复购话术');

    expect(summary && table && evidence && action && followUp).toBeTruthy();
    expect(summary!.compareDocumentPosition(table!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(table!.compareDocumentPosition(evidence!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(evidence!.compareDocumentPosition(action!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(action!.compareDocumentPosition(followUp!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('does not render array index values as table headers', () => {
    act(() => {
      root.render(
        <BlockRenderer
          blocks={[
            {
              kind: 'table',
              columns: ['0', '1', '2', '3'],
              rows: [['沉睡客户（45-90天未到店）', '585人', '高', '发召回优惠券']],
            },
          ]}
        />,
      );
    });

    const headers = Array.from(container.querySelectorAll('th')).map((node) => node.textContent);
    expect(headers).toEqual(['字段 1', '字段 2', '字段 3', '字段 4']);
    expect(container.textContent).toContain('沉睡客户（45-90天未到店）');
  });

  it('renders known business field keys as Chinese table headers', () => {
    act(() => {
      root.render(
        <BlockRenderer
          blocks={[
            {
              kind: 'table',
              columns: ['beauticianId', 'beauticianName', 'levelName', 'status', 'performanceScore', 'performanceLevel'],
              rows: [['43', '宋乔', '明星顾问', 'active', '413', '表现突出']],
            },
          ]}
        />,
      );
    });

    const headers = Array.from(container.querySelectorAll('th')).map((node) => node.textContent);
    expect(headers).toEqual(['员工ID', '员工姓名', '等级', '状态', '表现分', '表现等级']);
    expect(container.textContent).not.toContain('beauticianName');
    expect(container.textContent).toContain('宋乔');
  });
});
