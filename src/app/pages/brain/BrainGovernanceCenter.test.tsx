import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrainGovernanceCenter } from './BrainGovernanceCenter';

describe('BrainGovernanceCenter', () => {
  it('renders core governance tabs', () => {
    render(<BrainGovernanceCenter />);

    expect(screen.getByText('会话追踪')).toBeInTheDocument();
    expect(screen.getByText('语义治理')).toBeInTheDocument();
    expect(screen.getByText('评测中心')).toBeInTheDocument();
    expect(screen.getByText('发布中心')).toBeInTheDocument();
  });
});
