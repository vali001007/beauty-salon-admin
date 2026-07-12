import { BrainReceptionSkillsService } from './skills/brain-reception-skills.service.js';

describe('BrainReceptionSkillsService operations snapshot', () => {
  it('combines reservations, resources and beautician time off into availability', async () => {
    const prisma = {
      reservation: {
        findMany: jest.fn().mockResolvedValue([
          {
            beauticianId: 1,
            status: 'in_service',
            startTime: '14:00',
            endTime: '15:00',
            customer: { name: '李女士' },
            project: { name: '补水护理' },
          },
        ]),
      },
      storeResource: { findMany: jest.fn().mockResolvedValue([]) },
      resourceBooking: { findMany: jest.fn().mockResolvedValue([]) },
      beautician: { findMany: jest.fn().mockResolvedValue([{ id: 1, name: '李美容师' }, { id: 2, name: '王美容师' }]) },
      beauticianTimeOff: { findMany: jest.fn().mockResolvedValue([{ beauticianId: 2 }]) },
    };
    const service = new BrainReceptionSkillsService(prisma as never);

    const result = await service.buildOperationsSnapshot({
      storeId: 6,
      startDate: new Date('2026-07-11T00:00:00.000Z'),
      endDate: new Date('2026-07-11T23:59:59.999Z'),
    });

    expect(result.staff).toEqual([
      expect.objectContaining({ name: '李美容师', inService: true, available: false, nextAvailableAt: '15:00' }),
      expect.objectContaining({ name: '王美容师', onTimeOff: true, available: false }),
    ]);
    expect(result.arrivalRate).toBe(1);
    expect(result.noShowRate).toBe(0);
    expect(result.arrivedCustomers).toEqual([
      expect.objectContaining({ customerName: '李女士', startTime: '14:00', status: 'in_service' }),
    ]);
  });

  it('finds completed service overruns that overlap the next reservation', async () => {
    const prisma = {
      serviceTask: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 10,
            appointmentTime: new Date('2026-07-11T06:00:00.000Z'),
            duration: 60,
            startedAt: new Date('2026-07-11T06:00:00.000Z'),
            completedAt: new Date('2026-07-11T07:20:00.000Z'),
            beauticianId: 1,
            beautician: { name: '王美容师' },
            customer: { name: '李女士' },
            project: { name: '补水护理' },
          },
        ]),
      },
      reservation: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 20,
            date: new Date('2026-07-11T00:00:00.000Z'),
            startTime: '15:00',
            beauticianId: 1,
            customer: { name: '赵女士' },
            project: { name: '肩颈护理' },
          },
        ]),
      },
    };
    const service = new BrainReceptionSkillsService(prisma as never);

    const result = await service.buildServiceOverrunAnalysis({
      storeId: 6,
      startDate: new Date('2026-07-11T00:00:00.000Z'),
      endDate: new Date('2026-07-11T23:59:59.999Z'),
    });

    expect(result.overrunCount).toBe(1);
    expect(result.impactedCount).toBe(1);
    expect(result.items[0]).toMatchObject({
      beauticianName: '王美容师',
      overrunMinutes: 20,
      impactedReservation: { startTime: '15:00', customerName: '赵女士' },
    });
  });
});
