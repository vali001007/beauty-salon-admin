import { BadRequestException } from '@nestjs/common';
import { SmartSchedulingService } from './smart-scheduling.service';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulingService } from './scheduling.service';

describe('SmartSchedulingService', () => {
  let service: SmartSchedulingService;
  let prisma: jest.Mocked<any>;
  let schedulingService: jest.Mocked<any>;
  let commissionService: { recordAmiContribution: jest.Mock };

  const weekStart = '2026-06-08';
  const beauticians = [
    { id: 1, storeId: 1, name: 'A', status: 'active', createdAt: new Date('2026-01-01') },
    { id: 2, storeId: 1, name: 'B', status: 'active', createdAt: new Date('2026-01-02') },
  ];
  const reservation = {
    id: 10,
    storeId: 1,
    beauticianId: 1,
    projectId: 100,
    date: new Date('2026-06-08T10:00:00.000Z'),
    startTime: '10:00',
    endTime: '11:00',
    status: 'confirmed',
    project: { duration: 60 },
    beautician: beauticians[0],
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-01T08:00:00+08:00'));
    prisma = {
      beautician: {
        findMany: jest.fn().mockResolvedValue(beauticians),
      },
      reservation: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([reservation])
          .mockResolvedValue([]),
      },
      schedule: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      beauticianAvailability: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      beauticianTimeOff: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      storeResource: {
        findMany: jest.fn().mockResolvedValue([{ id: 1, storeId: 1, type: 'room', status: 'active' }]),
      },
      resourceBooking: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      scheduleVersion: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({ id: 1 }),
      },
      smartSchedulingRun: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({ runId: 'smart_1_20260608_001' }),
      },
      schedulingRuleConfig: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      beauticianProjectSkill: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(async (callback: (tx: any) => Promise<any>) =>
        callback({
          scheduleVersion: {
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            create: jest.fn().mockResolvedValue({ id: 1, storeId: 1, weekStart: new Date(weekStart), status: 'published' }),
          },
          schedule: {
            deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
            createMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
        }),
      ),
    };
    schedulingService = {
      save: jest.fn().mockResolvedValue([]),
    };
    commissionService = { recordAmiContribution: jest.fn() };
    service = new SmartSchedulingService(
      prisma as unknown as PrismaService,
      schedulingService as unknown as SchedulingService,
      commissionService as any,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('generates one-click alternatives without saving schedules', async () => {
    const result = await service.oneClick({
      storeId: 1,
      weekStart,
      mode: 'balanced',
      generateAlternatives: true,
      keepConfirmedReservations: true,
    });

    expect(result.weekStart).toBe(weekStart);
    expect(result.summary.hardConflictCount).toBe(0);
    expect(result.summary.reservationCoverageRate).toBe(1);
    expect(result.schedules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          beauticianId: 1,
          date: weekStart,
          startTime: '10:00',
          endTime: '11:00',
          source: 'reservation',
        }),
      ]),
    );
    expect(schedulingService.save).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('blocks publishing when a confirmed reservation overlaps leave', async () => {
    await expect(
      service.publish({
        storeId: 1,
        weekStart,
        schedules: [
          {
            beauticianId: 1,
            date: weekStart,
            startTime: '10:00',
            endTime: '11:00',
            status: 'leave',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(schedulingService.save).not.toHaveBeenCalled();
  });

  it('creates a schedule version and writes schedules when publishing', async () => {
    const result = await service.publish({
      storeId: 1,
      weekStart,
      schedules: [
        {
          beauticianId: 1,
          date: weekStart,
          startTime: '10:00',
          endTime: '11:00',
          status: 'available',
        },
      ],
    });

    expect(result.runId).toMatch(/^smart_1_20260608_/);
    expect(result.version).toEqual(expect.objectContaining({ id: 1, status: 'published' }));
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.smartSchedulingRun.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ publishedScheduleVersionId: 1 }),
    }));
    expect(prisma.scheduleVersion.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 1 },
      data: expect.objectContaining({ sourceRunId: expect.stringMatching(/^smart_1_20260608_/) }),
    }));
    expect(commissionService.recordAmiContribution).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: 1,
        category: 'scheduling',
        triggerType: 'smart_scheduling',
        workMinutes: 15,
        metadata: expect.objectContaining({ weekStart, savedCount: expect.any(Number) }),
      }),
    );
  });

  it('blocks publishing schedules outside business hours', async () => {
    prisma.schedulingRuleConfig.findFirst.mockResolvedValue({
      businessStartTime: '09:00',
      businessEndTime: '18:00',
      slotMinutes: 60,
      peakRules: [],
      defaultMinStaff: 0,
    });

    await expect(
      service.publish({
        storeId: 1,
        weekStart,
        keepConfirmedReservations: false,
        schedules: [
          {
            beauticianId: 2,
            date: weekStart,
            startTime: '18:00',
            endTime: '19:00',
            status: 'available',
          },
        ],
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'SMART_SCHEDULING_CONFLICT',
        conflicts: expect.arrayContaining([
          expect.objectContaining({
            type: 'outside_business_hours',
            severity: 'hard',
          }),
        ]),
      }),
    });

    expect(schedulingService.save).not.toHaveBeenCalled();
  });

  it('reports hard conflicts when configured project skill does not match', async () => {
    prisma.beauticianProjectSkill.findMany.mockResolvedValue([
      { beauticianId: 1, projectId: 100, skillLevel: 1, certified: false },
      { beauticianId: 2, projectId: 100, skillLevel: 3, certified: true },
    ]);

    const result = await service.evaluate({
      storeId: 1,
      weekStart,
      schedules: [
        {
          beauticianId: 1,
          date: weekStart,
          startTime: '10:00',
          endTime: '11:00',
          status: 'available',
        },
      ],
    });

    expect(result.summary.hardConflictCount).toBeGreaterThan(0);
    expect(result.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'skill_mismatch',
          severity: 'hard',
          beauticianId: 1,
          reservationId: 10,
        }),
      ]),
    );
    expect(result.score).toBeLessThan(95);
  });

  it('counts reservation-backed booked slots in demand slots', async () => {
    const result = await service.demand({ storeId: 1, weekStart });

    expect(result.summary).toEqual(
      expect.objectContaining({
        highDemandSlots: expect.any(Number),
        underStaffedSlots: expect.any(Number),
        highLoadSlots: expect.any(Number),
        lowLoadSlots: expect.any(Number),
        matchedLoadSlots: expect.any(Number),
      }),
    );
    expect(result.slots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          date: weekStart,
          startTime: '10:00',
          requiredStaff: 1,
          scheduledStaff: 1,
          expectedServiceDemand: 1,
          requiredServiceCapacity: 1,
          scheduledServiceCapacity: 1,
          staffDelta: 0,
          loadRatio: 1,
          loadLevel: 'medium',
          recommendedAction: 'keep',
        }),
      ]),
    );
  });

  it('marks overstaffed demand slots as low load and fill-gap action', async () => {
    prisma.reservation.findMany.mockReset();
    prisma.reservation.findMany.mockResolvedValue([]);
    prisma.schedule.findMany
      .mockResolvedValueOnce([
        {
          id: 101,
          storeId: 1,
          beauticianId: 1,
          date: new Date(`${weekStart}T09:00:00.000Z`),
          startTime: '09:00',
          endTime: '10:00',
          status: 'available',
        },
        {
          id: 102,
          storeId: 1,
          beauticianId: 2,
          date: new Date(`${weekStart}T09:00:00.000Z`),
          startTime: '09:00',
          endTime: '10:00',
          status: 'available',
        },
      ])
      .mockResolvedValueOnce([]);
    prisma.schedulingRuleConfig.findFirst.mockResolvedValueOnce({ defaultMinStaff: 1 });

    const result = await service.demand({ storeId: 1, weekStart });

    expect(result.slots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          date: weekStart,
          startTime: '09:00',
          requiredStaff: 1,
          scheduledStaff: 2,
          requiredServiceCapacity: 1,
          scheduledServiceCapacity: 2,
          staffDelta: 1,
          loadLevel: 'low',
          recommendedAction: 'fill_gap',
        }),
      ]),
    );
    expect(result.summary.lowLoadSlots).toBeGreaterThan(0);
  });

  it('uses historical reservations when calculating demand heatmap', async () => {
    prisma.reservation.findMany.mockReset();
    prisma.reservation.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 20,
          storeId: 1,
          beauticianId: 1,
          date: new Date('2026-06-01T14:00:00.000Z'),
          startTime: '14:00',
          endTime: '15:00',
          status: 'confirmed',
          project: { duration: 60 },
        },
        {
          id: 21,
          storeId: 1,
          beauticianId: 2,
          date: new Date('2026-06-01T14:00:00.000Z'),
          startTime: '14:00',
          endTime: '15:00',
          status: 'confirmed',
          project: { duration: 60 },
        },
      ]);

    const result = await service.demand({ storeId: 1, weekStart: '2026-06-08' });

    expect(result.slots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          date: '2026-06-08',
          startTime: '14:00',
          expectedReservations: 2,
          requiredStaff: 2,
          scheduledStaff: 0,
          expectedServiceDemand: 2,
          requiredServiceCapacity: 2,
          scheduledServiceCapacity: 0,
          staffDelta: -2,
          loadLevel: 'high',
          recommendedAction: 'add_staff',
        }),
      ]),
    );
    expect(result.summary.highLoadSlots).toBeGreaterThan(0);
  });
});
