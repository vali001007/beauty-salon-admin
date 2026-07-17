import { render, screen } from '@testing-library/react';
import { BrainResponseRenderer } from './BrainResponseRenderer';

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
});
