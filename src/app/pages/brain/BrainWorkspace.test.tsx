import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BrainWorkspace } from './BrainWorkspace';

vi.mock('@/api/brain', () => ({
  sendBrainMessage: vi.fn(),
}));

describe('BrainWorkspace', () => {
  it('renders Ami Brain workspace shell', () => {
    render(<BrainWorkspace />);

    expect(screen.getByText('Ami Brain')).toBeInTheDocument();
    expect(screen.getByText('门店经营智能体')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('问经营数据、风险和下一步动作')).toBeInTheDocument();
  });
});
