import { NotFoundException } from '@nestjs/common';
import { ReservationsService } from './reservations.service.js';

describe('ReservationsService waiting integration', () => {
  const reservation = {
    id: 8,
    storeId: 6,
    customerId: 3,
    projectId: 4,
    beauticianId: null,
    date: new Date('2026-07-17T00:00:00.000Z'),
    startTime: '14:00',
    endTime: '15:00',
    status: 'confirmed',
    remark: null,
    checkedInAt: null,
    createdAt: new Date('2026-07-16T00:00:00.000Z'),
    store: { name: '门店6' },
    customer: { name: '林女士', phone: '13800000000' },
    project: { name: '补水护理', duration: 60 },
    beautician: null,
    waitingEpisodes: [{ id: 12, startedAt: new Date('2026-07-17T06:00:00.000Z') }],
  };
  const prisma = {
    reservation: {
      findFirst: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
  };
  const waiting = { startForReservation: jest.fn() };
  const service = new ReservationsService(prisma as never, waiting as never);

  beforeEach(() => jest.clearAllMocks());

  it('checks store scope and automatically starts a waiting episode after check-in', async () => {
    prisma.reservation.findFirst.mockResolvedValue(reservation);
    prisma.reservation.update.mockResolvedValue({ ...reservation, status: 'checked_in', checkedInAt: new Date() });
    prisma.reservation.findUnique.mockResolvedValue({ ...reservation, status: 'checked_in', checkedInAt: new Date() });
    waiting.startForReservation.mockResolvedValue({ id: 12 });

    const result = await service.checkIn(8, 6, 9);

    expect(prisma.reservation.findFirst).toHaveBeenCalledWith({ where: { id: 8, storeId: 6 } });
    expect(waiting.startForReservation).toHaveBeenCalledWith(6, 9, 8, undefined, 'reservation_check_in');
    expect(result).toMatchObject({ status: 'checked_in', waitingEpisodeId: 12 });
  });

  it('does not check in a reservation outside the current store', async () => {
    prisma.reservation.findFirst.mockResolvedValue(null);
    await expect(service.checkIn(8, 6, 9)).rejects.toBeInstanceOf(NotFoundException);
    expect(waiting.startForReservation).not.toHaveBeenCalled();
  });
});
