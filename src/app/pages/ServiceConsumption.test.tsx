import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ServiceConsumption } from './ServiceConsumption';

vi.mock('@/api/bom', () => ({
  getBomList: vi.fn().mockResolvedValue([]),
  getBomConsumptionRecords: vi.fn().mockResolvedValue([]),
  getBomForecast: vi.fn().mockResolvedValue([]),
  updateBom: vi.fn(),
}));

vi.mock('@/api/industry', () => ({
  getIndustryServiceTemplateBom: vi.fn(),
  getIndustryServiceTemplates: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/api/product', () => ({ getProducts: vi.fn().mockResolvedValue([]) }));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('./SalesOutboundTab', () => ({
  SalesOutboundTab: ({ active }: { active: boolean }) => (
    <div data-testid="sales-outbound-tab" data-active={String(active)}>
      销售出库内容
    </div>
  ),
}));

describe('ServiceConsumption tabs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('places sales outbound before project material consumption and activates it on click', async () => {
    render(<ServiceConsumption />);
    const buttons = screen.getAllByRole('button');
    const tabLabels = buttons
      .map((button) => button.textContent?.trim())
      .filter((label) => ['BOM管理', '销售出库', '项目耗材消耗', '库存预估'].includes(label ?? ''));

    expect(tabLabels).toEqual(['BOM管理', '销售出库', '项目耗材消耗', '库存预估']);
    fireEvent.click(screen.getByRole('button', { name: '销售出库' }));
    await waitFor(() => expect(screen.getByTestId('sales-outbound-tab')).toHaveAttribute('data-active', 'true'));
  });
});
