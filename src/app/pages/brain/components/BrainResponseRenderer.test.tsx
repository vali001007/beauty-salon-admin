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
    const structuredResultJourney = { id: 'BQ0500', question: '本月各项目的销量排行' };
    render(<BrainResponseRenderer fallback="兼容摘要" blocks={[
      { kind: 'ranking', columns: ['name', 'value'], rows: [{ name: '商品A', value: 2 }, { name: '商品B', value: 1 }] },
      { kind: 'limitations', items: ['财务节点无数据'] },
      { kind: 'evidence', citations: [{ sourceType: 'metric', sourceId: 'metric.sales' }] },
    ]} />);
    expect(screen.getByText('商品A')).toBeInTheDocument();
    expect(screen.getByText(/财务节点无数据/)).toBeInTheDocument();
    expect(screen.getByText('1 条可追溯证据')).toBeInTheDocument();
    expect(structuredResultJourney.id).toBe('BQ0500');
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

  it('renders an explicit empty result and hides duplicate internal no-data codes', () => {
    render(<BrainResponseRenderer fallback="没有数据" blocks={[
      { kind: 'table', columns: ['客户'], rows: [] },
      { kind: 'limitations', items: ['no_data:table'] },
    ]} />);

    expect(screen.getByText('暂无匹配数据')).toBeInTheDocument();
    expect(screen.getByText('当前条件下没有匹配的业务明细。')).toBeInTheDocument();
    expect(screen.queryByText(/no_data:table/)).not.toBeInTheDocument();
  });

  it('labels unsupported business scope as a capability boundary', () => {
    const capabilityBoundaryJourney = { id: 'BQ0355', question: '哪个美容师上个月客户流失偏多' };
    render(<BrainResponseRenderer fallback="暂不支持" blocks={[
      { kind: 'limitations', items: ['当前后台尚未形成按美容师归因客户流失的业务闭环。'] },
    ]} />);

    expect(screen.getByText(/能力边界：当前后台尚未形成按美容师归因客户流失的业务闭环/)).toBeInTheDocument();
    expect(capabilityBoundaryJourney.id).toBe('BQ0355');
  });

  it('suppresses success-shaped blocks when the persisted run failed', () => {
    render(
      <BrainResponseRenderer
        status="failed"
        fallback="今日预约 3 单。"
        blocks={[
          { kind: 'kpi', items: [{ label: '今日预约', value: '3 单' }] },
          { kind: 'action_preview', actions: [{ actionId: 'unsafe_action' }] },
          {
            kind: 'evidence',
            citations: [{ sourceType: 'metric', sourceId: 'reservation.count', label: '预约数' }],
          },
        ]}
      />,
    );

    expect(screen.getByText('执行失败')).toBeInTheDocument();
    expect(screen.getByText(/相关能力执行失败/)).toBeInTheDocument();
    expect(screen.queryByText('今日预约')).not.toBeInTheDocument();
    expect(screen.queryByText(/待确认动作预览/)).not.toBeInTheDocument();
    expect(screen.getByText(/可追溯证据/)).toBeInTheDocument();
  });

  it.each([
    ['running', '处理中', '正在理解问题并核对可用数据...'],
    ['cancelled', '已取消', '请求已取消'],
  ] as const)('renders %s without exposing completed business blocks', (status, label, message) => {
    render(
      <BrainResponseRenderer
        status={status}
        fallback={status === 'running' ? '正在理解问题并核对可用数据...' : '今日预约 3 单。'}
        blocks={[{ kind: 'kpi', items: [{ label: '今日预约', value: '3 单' }] }]}
      />,
    );

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(message))).toBeInTheDocument();
    expect(screen.queryByText('3 单')).not.toBeInTheDocument();
  });
});
