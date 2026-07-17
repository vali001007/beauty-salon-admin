import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CustomerWaitingService } from './customer-waiting.service.js';

describe('CustomerWaitingService', () => {
  const prisma = {
    reservation: { findFirst: jest.fn(), count: jest.fn() },
    customerWaitingEpisode: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const service = new CustomerWaitingService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('starts an idempotent waiting episode for a checked-in reservation', async () => {
    prisma.reservation.findFirst.mockResolvedValue({ id: 8, customerId: 3, status: 'checked_in', checkedInAt: new Date() });
    prisma.customerWaitingEpisode.findFirst.mockResolvedValue(null);
    prisma.customerWaitingEpisode.create.mockResolvedValue({ id: 11, status: 'waiting' });

    await expect(service.startForReservation(6, 9, 8, 15)).resolves.toEqual({ id: 11, status: 'waiting' });
    expect(prisma.customerWaitingEpisode.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ storeId: 6, reservationId: 8, customerId: 3, expectedWaitMinutes: 15 }),
    });
  });

  it('rejects cross-store or missing reservations', async () => {
    prisma.reservation.findFirst.mockResolvedValue(null);
    await expect(service.startForReservation(6, 9, 99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not start waiting before customer check-in', async () => {
    prisma.reservation.findFirst.mockResolvedValue({ id: 8, customerId: 3, status: 'confirmed', checkedInAt: null });
    await expect(service.startForReservation(6, 9, 8)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('records a structured long-wait departure with measured minutes', async () => {
    prisma.customerWaitingEpisode.findFirst.mockResolvedValue({
      id: 11,
      storeId: 6,
      status: 'waiting',
      startedAt: new Date(Date.now() - 42 * 60_000),
      recordedByUserId: 8,
    });
    prisma.customerWaitingEpisode.update.mockImplementation(({ data }: any) => Promise.resolve({ id: 11, ...data }));

    const result = await service.markLeft(6, 9, 11, 'wait_too_long', '客户无法继续等待');

    expect(result).toMatchObject({ status: 'ended', outcome: 'left', leaveReasonCode: 'wait_too_long' });
    expect(result.actualWaitMinutes).toBeGreaterThanOrEqual(42);
  });

  it('calculates waiting-loss analytics and collection coverage without treating missing records as no loss', async () => {
    prisma.customerWaitingEpisode.findMany.mockResolvedValue([
      {
        id: 1,
        status: 'ended',
        outcome: 'left',
        leaveReasonCode: 'wait_too_long',
        actualWaitMinutes: 50,
        expectedWaitMinutes: 15,
        startedAt: new Date('2026-07-10T02:00:00Z'),
        endedAt: new Date('2026-07-10T02:50:00Z'),
        reservationId: 20,
        customerId: 3,
        leaveReasonNote: '等待过久',
        customer: { id: 3, name: '林女士', phone: '13800000000' },
      },
      {
        id: 2,
        status: 'ended',
        outcome: 'served',
        leaveReasonCode: null,
        actualWaitMinutes: 10,
        expectedWaitMinutes: 10,
        startedAt: new Date('2026-07-11T02:00:00Z'),
        endedAt: new Date('2026-07-11T02:10:00Z'),
        reservationId: 21,
        customerId: 4,
        leaveReasonNote: null,
        customer: { id: 4, name: '周女士', phone: null },
      },
    ]);
    prisma.reservation.count.mockResolvedValue(4);

    const result = await service.analytics(6, {
      startDate: '2026-07-01T00:00:00.000Z',
      endDate: '2026-07-17T23:59:59.999Z',
    });

    expect(result.summary).toMatchObject({
      longWaitDepartureCount: 1,
      leftCount: 1,
      linkedReservationCount: 2,
      checkedInReservationCount: 4,
      collectionCoverageRate: 0.5,
      averageWaitMinutes: 30,
    });
    expect(result.longWaitDepartures[0]).toMatchObject({ customerName: '林女士', actualWaitMinutes: 50 });
  });
});
