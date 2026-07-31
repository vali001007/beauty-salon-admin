import { ConflictException } from '@nestjs/common';
import { createTestPersistedBusinessDatabaseWriteSet } from '../common/database-write-set.testing.js';
import { ReservationsService } from './reservations.service.js';

describe('ReservationsService mutation receipt', () => {
  it('commits the reschedule and its causal receipt in the same transaction', async () => {
    const prisma = prismaFixture();
    const service = new ReservationsService(prisma as never, {} as never);
    const result = await service.update(31, {
      appointmentTime: '2026-08-01 16:00:00',
      expectedUpdatedAt: '2026-07-30T10:00:00.000Z',
      mutationContext: mutationContext('reschedule_reservation', 'update'),
    });

    expect(result).toMatchObject({
      id: 31,
      mutationReplayed: false,
      mutationReceipt: {
        capabilityKey: 'reschedule_reservation',
        businessObjectId: '31',
        changedFields: expect.arrayContaining(['startTime']),
      },
    });
    expect(prisma.businessMutationReceipt.create).toHaveBeenCalledTimes(1);
    expect(prisma.reservation.updateMany).toHaveBeenCalledTimes(1);
  });

  it('returns the original receipt without applying the same mutation twice', async () => {
    const prisma = prismaFixture();
    prisma.reservation.findUnique
      .mockReset()
      .mockResolvedValueOnce(beforeReservation())
      .mockResolvedValueOnce(includedReservation(afterReservation('cancel_reservation')));
    const service = new ReservationsService(prisma as never, {} as never);
    const first = await service.cancel(
      31,
      '客户取消',
      '2026-07-30T10:00:00.000Z',
      mutationContext('cancel_reservation', 'state_transition'),
    );
    prisma.businessMutationReceipt.findUnique.mockResolvedValue(
      prisma.businessMutationReceipt.create.mock.calls[0][0].data,
    );
    prisma.reservation.findUnique.mockResolvedValue(includedReservation(afterReservation('cancel_reservation')));
    const replay = await service.cancel(
      31,
      '客户取消',
      '2026-07-30T10:00:00.000Z',
      mutationContext('cancel_reservation', 'state_transition'),
    );

    expect(first).toMatchObject({ mutationReplayed: false });
    expect(replay).toMatchObject({ mutationReplayed: true, mutationReceipt: first.mutationReceipt });
    expect(prisma.reservation.updateMany).toHaveBeenCalledTimes(1);
  });

  it('rejects reuse of a mutation idempotency key with a different request payload', async () => {
    const prisma = prismaFixture();
    const service = new ReservationsService(prisma as never, {} as never);
    await service.update(31, {
      appointmentTime: '2026-08-01 16:00:00',
      expectedUpdatedAt: '2026-07-30T10:00:00.000Z',
      mutationContext: mutationContext('reschedule_reservation', 'update'),
    });
    prisma.businessMutationReceipt.findUnique.mockResolvedValue(
      prisma.businessMutationReceipt.create.mock.calls[0][0].data,
    );

    await expect(
      service.update(31, {
        appointmentTime: '2026-08-01 17:00:00',
        expectedUpdatedAt: '2026-07-30T10:00:00.000Z',
        mutationContext: {
          ...mutationContext('reschedule_reservation', 'update'),
          requestPayload: {
            ...mutationContext('reschedule_reservation', 'update').requestPayload,
            appointmentTime: '2026-08-01 17:00:00',
          },
        },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.reservation.updateMany).toHaveBeenCalledTimes(1);
  });
});

function mutationContext(capabilityKey: string, mutationKind: 'update' | 'state_transition') {
  return {
    capabilityKey,
    idempotencyKey: `brain-action-${capabilityKey}-31`,
    mutationKind,
    requestPayload:
      capabilityKey === 'cancel_reservation'
        ? {
            reservationId: 31,
            reason: '客户取消',
            expectedReservationUpdatedAt: '2026-07-30T10:00:00.000Z',
          }
        : {
            reservationId: 31,
            appointmentTime: '2026-08-01 16:00:00',
            expectedReservationUpdatedAt: '2026-07-30T10:00:00.000Z',
          },
    actorId: 9,
  };
}

function prismaFixture() {
  const before = beforeReservation();
  let writeSetRow: ReturnType<typeof createTestPersistedBusinessDatabaseWriteSet> | undefined;
  const prisma: any = {
    $transaction: jest.fn(async (callback: (tx: any) => unknown) => callback(prisma)),
    $executeRaw: jest.fn().mockResolvedValue(0),
    $queryRaw: jest
      .fn()
      .mockResolvedValueOnce([
        { transactionId: '777', tableCount: 120, monitorFingerprint: '1'.repeat(64), coverageComplete: true },
      ])
      .mockResolvedValueOnce([]),
    reservation: {
      findUnique: jest
        .fn()
        .mockResolvedValueOnce(before)
        .mockImplementation(async () => includedReservation(afterReservation('reschedule_reservation'))),
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn(),
    },
    businessMutationReceipt: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async ({ data }: any) => data),
    },
    businessDatabaseWriteSet: {
      create: jest.fn().mockImplementation(async ({ data }: any) => {
        const finalized = createTestPersistedBusinessDatabaseWriteSet({
          capabilityKey: data.capabilityKey,
          idempotencyKey: data.idempotencyKey,
          businessObjectId: 31,
          writeSetId: data.id,
          entries: reservationWriteSetEntries(data.capabilityKey),
        });
        writeSetRow = {
          ...finalized,
          status: 'collecting',
          entryCount: 0,
          writeSetFingerprint: null,
          finalizedAt: null,
        };
        return writeSetRow;
      }),
      findUnique: jest.fn().mockImplementation(async () => writeSetRow),
      updateMany: jest.fn().mockImplementation(async ({ data }: any) => {
        if (writeSetRow) writeSetRow = { ...writeSetRow, ...data };
        return { count: 1 };
      }),
    },
    project: { findFirst: jest.fn().mockResolvedValue({ id: 22, storeId: 6, duration: 60 }) },
    beautician: { findFirst: jest.fn() },
    beauticianTimeOff: { findMany: jest.fn().mockResolvedValue([]) },
    beauticianAvailability: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return prisma;
}

function reservationWriteSetEntries(capabilityKey: string) {
  const changedFields =
    capabilityKey === 'cancel_reservation' ? ['remark', 'status', 'updatedAt'] : ['endTime', 'startTime', 'updatedAt'];
  return [
    {
      modelName: 'Reservation',
      tableName: 'Reservation',
      operation: 'update' as const,
      changedFields,
      beforeStateFingerprint: '2'.repeat(64),
      afterStateFingerprint: '3'.repeat(64),
    },
    {
      modelName: 'BusinessMutationReceipt',
      tableName: 'business_mutation_receipt',
      operation: 'create' as const,
      changedFields: ['id', 'storeId'],
      afterStateFingerprint: '4'.repeat(64),
    },
  ];
}

function beforeReservation() {
  return {
    id: 31,
    storeId: 6,
    customerId: 11,
    projectId: 22,
    beauticianId: null,
    date: new Date('2026-08-01T00:00:00.000Z'),
    startTime: '15:00',
    endTime: '16:00',
    status: 'confirmed',
    bookingSource: 'ami_brain',
    remark: null,
    checkedInAt: null,
    createdAt: new Date('2026-07-29T10:00:00.000Z'),
    updatedAt: new Date('2026-07-30T10:00:00.000Z'),
  };
}

function afterReservation(capabilityKey: string) {
  const cancelled = capabilityKey === 'cancel_reservation';
  return {
    ...beforeReservation(),
    startTime: cancelled ? '15:00' : '16:00',
    endTime: cancelled ? '16:00' : '17:00',
    status: cancelled ? 'cancelled' : 'confirmed',
    remark: cancelled ? '客户取消' : null,
    updatedAt: new Date('2026-07-30T10:01:00.000Z'),
  };
}

function includedReservation(reservation: ReturnType<typeof afterReservation>) {
  return {
    ...reservation,
    store: { id: 6, name: '测试门店' },
    customer: { id: 11, name: '张女士', phone: '13800000001' },
    project: { id: 22, name: '护理', duration: 60 },
    beautician: null,
    waitingEpisodes: [],
  };
}
