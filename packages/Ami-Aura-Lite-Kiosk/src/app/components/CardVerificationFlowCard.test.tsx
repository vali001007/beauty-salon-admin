// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CardVerificationFlowCard } from './CardVerificationFlowCard';

const data = {
  title: '次卡核销',
  subtitle: '本地测试门店',
  source: 'local-slot-v1',
  generatedAt: '2026-08-04 10:00',
  customers: [{
    id: 1,
    name: '本地顾客',
    phone: '13800000001',
    memberLevel: '金卡会员',
    tags: ['本地合成数据'],
    profileLabel: '补水护理',
    lastVisitDate: '2026-08-03',
    isAppointedToday: true,
  }],
  beauticians: [{ id: 9, name: '本地美容师', status: '在职' }],
} as any;

const customerWithCards = {
  ...data.customers[0],
  cards: [{
    customerCardId: 11,
    cardName: '补水护理 10 次卡',
    remainingTimes: 8,
    totalTimes: 10,
    expiryDate: '2027-08-04',
    projects: [{ id: 21, name: '深层补水护理', times: 1, remainingAfterUse: 7 }],
  }],
};

async function selectVerificationInput() {
  fireEvent.click(screen.getByRole('button', { name: /请选择有可用次卡的客户/ }));
  fireEvent.click(await screen.findByText('本地顾客'));
  await screen.findByText('补水护理 10 次卡');
  fireEvent.click(screen.getByRole('button', { name: /深层补水护理/ }));
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '9' } });
}

describe('CardVerificationFlowCard', () => {
  it('keeps the idempotency key stable and exposes safe retry when the result is uncertain', async () => {
    const onConfirm = vi.fn().mockRejectedValue(Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }));
    render(
      <CardVerificationFlowCard
        data={data}
        onLoadCustomerCards={vi.fn().mockResolvedValue(customerWithCards)}
        onConfirm={onConfirm}
      />,
    );

    await selectVerificationInput();
    fireEvent.click(screen.getByRole('button', { name: '确认核销' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/核销结果待核对/)).toBeTruthy();

    await waitFor(() => expect((screen.getByRole('button', { name: '安全重试核销' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: '安全重试核销' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(2));

    expect(onConfirm.mock.calls[0][0].idempotencyKey).toBeTruthy();
    expect(onConfirm.mock.calls[1][0].idempotencyKey).toBe(onConfirm.mock.calls[0][0].idempotencyKey);
  });
});
