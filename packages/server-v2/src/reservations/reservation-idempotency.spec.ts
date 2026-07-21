import { ConflictException } from '@nestjs/common';
import { ReservationsService } from './reservations.service.js';
import { buildReservationCreationFingerprint, buildReservationIdempotencyKey } from './reservation-idempotency.js';

describe('ReservationsService create idempotency', () => {
  const existing = {
    id: 81,
    idempotencyKey: buildReservationIdempotencyKey(6, 'ami_brain', 'brain-action-81'),
    creationFingerprint: buildReservationCreationFingerprint({
      storeId: 6,
      customerId: 11,
      projectId: 21,
      beauticianId: 31,
      appointmentTime: '2026-07-20T15:00:00.000Z',
      startTime: '15:00',
      duration: 60,
      bookingSource: 'ami_brain',
    }),
    storeId: 6,
    customerId: 11,
    projectId: 21,
    beauticianId: 31,
    date: new Date('2026-07-20T15:00:00.000Z'),
    startTime: '15:00',
    endTime: '16:00',
    status: 'pending',
    bookingSource: 'ami_brain',
    remark: null,
    checkedInAt: null,
    createdAt: new Date('2026-07-18T00:00:00.000Z'),
    updatedAt: new Date('2026-07-18T00:00:00.000Z'),
    store: { id: 6, name: '隔离门店' },
    customer: { id: 11, name: '张女士', phone: '13800000001' },
    project: { id: 21, name: '深层补水', duration: 60 },
    beautician: { id: 31, name: '王美容师' },
    waitingEpisodes: [],
  };
  let prisma: any;
  let service: ReservationsService;

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(async (callback: (tx: any) => unknown) => callback(prisma)),
      $executeRaw: jest.fn().mockResolvedValue(0),
      reservation: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(existing),
      },
      customer: { findFirst: jest.fn().mockResolvedValue(existing.customer), create: jest.fn() },
      project: { findFirst: jest.fn().mockResolvedValue(existing.project) },
      beautician: { findFirst: jest.fn().mockResolvedValue(existing.beautician) },
    };
    service = new ReservationsService(prisma, {} as never);
  });

  const input = {
    storeId: 6,
    customerId: 11,
    projectId: 21,
    beauticianId: 31,
    appointmentTime: '2026-07-20T15:00:00.000Z',
    startTime: '15:00',
    duration: 60,
    bookingSource: 'ami_brain',
    idempotencyKey: 'brain-action-81',
  };

  it('persists a scoped hash and returns the created reservation', async () => {
    const result = await service.createIdempotent(input);

    expect(result).toMatchObject({ replayed: false, reservation: { id: 81, bookingSource: 'ami_brain' } });
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.reservation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        idempotencyKey: buildReservationIdempotencyKey(6, 'ami_brain', 'brain-action-81'),
        creationFingerprint: existing.creationFingerprint,
        bookingSource: 'ami_brain',
        customerId: 11,
        projectId: 21,
      }),
    }));
  });

  it('returns the original reservation without re-running create', async () => {
    prisma.reservation.findUnique.mockResolvedValue({
      ...existing,
      date: new Date('2026-08-01T10:00:00.000Z'),
      startTime: '10:00',
      beauticianId: 99,
      remark: '改期后已更新',
    });

    const result = await service.createIdempotent(input);

    expect(result).toMatchObject({ replayed: true, reservation: { id: 81 } });
    expect(prisma.reservation.create).not.toHaveBeenCalled();
  });

  it('rejects a reused key with a different business payload', async () => {
    prisma.reservation.findUnique.mockResolvedValue(existing);

    await expect(service.createIdempotent({ ...input, projectId: 22 })).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.reservation.create).not.toHaveBeenCalled();
  });

  it('separates the same raw key by store and source', () => {
    expect(buildReservationIdempotencyKey(6, 'ami_brain', 'same')).not.toBe(
      buildReservationIdempotencyKey(7, 'ami_brain', 'same'),
    );
    expect(buildReservationIdempotencyKey(6, 'ami_brain', 'same')).not.toBe(
      buildReservationIdempotencyKey(6, 'ami_glow', 'same'),
    );
  });
});
