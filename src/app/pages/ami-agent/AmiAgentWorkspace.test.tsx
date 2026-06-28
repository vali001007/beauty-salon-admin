// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageItem } from './AmiAgentWorkspace';

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
});
