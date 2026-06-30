import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StaffCommissionWorkbench } from './StaffCommissionWorkbench';

vi.mock('@/api/commission', () => ({
  getCommissionSummary: vi.fn().mockResolvedValue({
    totalAmount: 1200,
    pendingAmount: 300,
    confirmedAmount: 200,
    settledAmount: 700,
    recordCount: 6,
  }),
}));

vi.mock('./CommissionRecords', () => ({ CommissionRecords: () => <div>提成流水面板</div> }));
vi.mock('./CommissionRules', () => ({ CommissionRules: () => <div>提成规则面板</div> }));
vi.mock('../operation-profit/BeauticianPerformance', () => ({ BeauticianPerformance: () => <div>员工人效面板</div> }));
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => true }));

describe('StaffCommissionWorkbench', () => {
  function activateTab(name: string | RegExp) {
    const tab = screen.getByRole('tab', { name });
    fireEvent.pointerDown(tab, { button: 0, ctrlKey: false });
    fireEvent.mouseDown(tab, { button: 0, ctrlKey: false });
    fireEvent.click(tab);
  }

  it('switches between commission tabs without routing to hidden pages', async () => {
    render(<StaffCommissionWorkbench />);

    expect(await screen.findByText('员工提成')).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent?.replace(/\s+/g, '').trim())).toEqual([
      '员工人效',
      '提成流水',
      '提成规则',
    ]);
    expect(await screen.findByText('员工人效面板')).toBeInTheDocument();

    activateTab('提成流水');
    expect(await screen.findByText('提成流水面板')).toBeInTheDocument();

    expect(screen.queryByRole('tab', { name: /月度结算/ })).not.toBeInTheDocument();
  });
});
