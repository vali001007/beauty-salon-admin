import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { BrainResponseRenderer } from './BrainResponseRenderer';

describe('BrainResponseRenderer', () => {
  it('renders ranking, limitations and evidence without hiding the fallback contract', () => {
    render(
      <BrainResponseRenderer
        fallback="兼容摘要"
        blocks={[
          {
            kind: 'ranking',
            columns: ['name', 'value'],
            rows: [
              { name: '商品A', value: 2 },
              { name: '商品B', value: 1 },
            ],
          },
          { kind: 'limitations', items: ['财务节点无数据'] },
          { kind: 'evidence', citations: [{ sourceType: 'metric', sourceId: 'metric.sales' }] },
        ]}
      />,
    );
    expect(screen.getByText('商品A')).toBeInTheDocument();
    expect(screen.getByText(/财务节点无数据/)).toBeInTheDocument();
    expect(screen.getByText('1 条可追溯证据')).toBeInTheDocument();
  });

  it('falls back to answer text when no registered block exists', () => {
    render(<BrainResponseRenderer fallback="兼容摘要" blocks={[]} />);
    expect(screen.getByText('兼容摘要')).toBeInTheDocument();
  });

  it('renders clarification choices as non-executing options', () => {
    render(
      <BrainResponseRenderer
        fallback="请补充范围"
        blocks={[
          {
            kind: 'clarification',
            question: '请选择要查看的业务主题。',
            options: [
              { id: 'finance', label: '财务异常风险', value: 'finance' },
              { id: 'inventory', label: '库存风险', value: 'inventory' },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByText('请选择要查看的业务主题。')).toBeInTheDocument();
    expect(screen.getByText('财务异常风险')).toBeInTheDocument();
    expect(screen.getByText('库存风险')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '确认执行' })).not.toBeInTheDocument();
  });

  it('submits a clarification choice with its source provenance', () => {
    const onGuidanceSelect = vi.fn();
    render(
      <BrainResponseRenderer
        fallback="请补充范围"
        interactive
        sourceRunId={101}
        onGuidanceSelect={onGuidanceSelect}
        blocks={[
          {
            kind: 'clarification',
            question: '请选择目标。',
            options: [{ id: 'finance', label: '财务异常风险', value: { candidate: '查看财务异常风险' } }],
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '财务异常风险' }));
    expect(onGuidanceSelect).toHaveBeenCalledWith({
      kind: 'clarification',
      sourceRunId: 101,
      optionId: 'finance',
      value: '查看财务异常风险',
    });
  });

  it('renders exactly three follow-up questions and disables historical options', () => {
    const onGuidanceSelect = vi.fn();
    const questions = [
      { id: 'liability', label: '会员卡负债', value: '会员卡负债是多少？' },
      { id: 'flow', label: '储值流水', value: '储值余额和流水分别是多少？' },
      { id: 'expiry', label: '到期风险', value: '哪些会员卡即将到期？' },
    ];
    render(
      <BrainResponseRenderer
        fallback="会员卡经营概览"
        sourceRunId={102}
        onGuidanceSelect={onGuidanceSelect}
        blocks={[{ kind: 'follow_up_questions', questions }]}
      />,
    );

    expect(screen.getByText('你还可以继续问')).toBeInTheDocument();
    const buttons = questions.map((question) => screen.getByRole('button', { name: new RegExp(question.label) }));
    expect(buttons).toHaveLength(3);
    expect(buttons.every((button) => button.hasAttribute('disabled'))).toBe(true);
  });
});
