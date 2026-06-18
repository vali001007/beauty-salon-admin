import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { EmptyState } from './empty-state';
import { Package } from 'lucide-react';

describe('EmptyState', () => {
  it('renders with just a title', () => {
    render(<EmptyState title="暂无数据" />);

    expect(screen.getByText('暂无数据')).toBeInTheDocument();
    expect(screen.queryByRole('paragraph')).not.toBeInTheDocument();
  });

  it('renders with title, description, and icon', () => {
    render(
      <EmptyState
        icon={Package}
        title="暂无商品"
        description="请先添加商品到库存中"
      />,
    );

    expect(screen.getByText('暂无商品')).toBeInTheDocument();
    expect(screen.getByText('请先添加商品到库存中')).toBeInTheDocument();
    // Icon renders as an SVG element
    const svg = document.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('renders with an action button', () => {
    render(
      <EmptyState
        title="暂无客户"
        description="开始添加您的第一位客户"
        action={<button type="button">添加客户</button>}
      />,
    );

    expect(screen.getByText('暂无客户')).toBeInTheDocument();
    expect(screen.getByText('开始添加您的第一位客户')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '添加客户' })).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <EmptyState title="测试" className="custom-class" />,
    );

    expect(container.firstChild).toHaveClass('custom-class');
  });
});
