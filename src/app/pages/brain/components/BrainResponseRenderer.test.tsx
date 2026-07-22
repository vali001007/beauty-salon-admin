import { render, screen } from '@testing-library/react';
import { beforeAll, vi } from 'vitest';
import { BrainResponseRenderer } from './BrainResponseRenderer';

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});

describe('BrainResponseRenderer', () => {
  it('renders ranking, limitations and evidence without hiding the fallback contract', () => {
    render(<BrainResponseRenderer fallback="兼容摘要" blocks={[
      { kind: 'ranking', columns: ['name', 'value'], rows: [{ name: '商品A', value: 2 }, { name: '商品B', value: 1 }] },
      { kind: 'limitations', items: ['财务节点无数据'] },
      { kind: 'evidence', citations: [{ sourceType: 'metric', sourceId: 'metric.sales' }] },
    ]} />);
    expect(screen.getByText('商品A')).toBeInTheDocument();
    expect(screen.getByText(/财务节点无数据/)).toBeInTheDocument();
    expect(screen.getByText('1 条可追溯证据')).toBeInTheDocument();
  });

  it('falls back to answer text when no registered block exists', () => {
    render(<BrainResponseRenderer fallback="兼容摘要" blocks={[]} />);
    expect(screen.getByText('兼容摘要')).toBeInTheDocument();
  });

  it('renders clarification choices as selectable follow-up options', () => {
    const onSelect = vi.fn();
    render(<BrainResponseRenderer fallback="请补充范围" onClarificationSelect={onSelect} blocks={[
      {
        kind: 'clarification',
        question: '请选择要查看的业务主题。',
        options: [
          { id: 'finance', label: '财务异常风险', value: 'finance' },
          { id: 'inventory', label: '库存风险', value: 'inventory' },
        ],
      },
    ]} />);

    expect(screen.getByText('请选择要查看的业务主题。')).toBeInTheDocument();
    expect(screen.getByText('财务异常风险')).toBeInTheDocument();
    expect(screen.getByText('库存风险')).toBeInTheDocument();
    screen.getByRole('button', { name: '财务异常风险' }).click();
    expect(onSelect).toHaveBeenCalledWith('finance', '财务异常风险');
    expect(screen.queryByRole('button', { name: '确认执行' })).not.toBeInTheDocument();
  });

  it('renders chart rows as an actual chart surface', () => {
    render(<BrainResponseRenderer fallback="营业额趋势" blocks={[
      {
        kind: 'chart',
        chartType: 'line',
        rows: [{ 日期: '07-20', 营业额: 1200 }, { 日期: '07-21', 营业额: 1800 }],
        xKey: '日期',
        yKeys: ['营业额'],
      },
    ]} />);

    expect(screen.getByLabelText('趋势图')).toBeInTheDocument();
  });
});
