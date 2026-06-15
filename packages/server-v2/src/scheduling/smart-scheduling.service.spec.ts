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
      schedulingRuleConfig: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      beauticianProjectSkill: {
        findMany: jest.fn().mockResolvedValue([]),
      },
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

  it('generates a preview without saving schedules', async () => {
    const result = await service.preview({
      storeId: 1,
      weekStart,
      mode: 'blank',
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

  it('keeps confirmed reservation slots when publishing manual adjustments', async () => {
    schedulingService.save.mockImplementation(async (items: unknown[]) => items);

    const result = await service.publish({
      storeId: 1,
      weekStart,
      schedules: [
        {
          beauticianId: 2,
          date: weekStart,
          startTime: '14:00',
          endTime: '15:00',
          status: 'available',
        },
      ],
    });

    expect(result.runId).toMatch(/^smart_1_20260608_/);
    expect(schedulingService.save).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          beauticianId: 1,
          date: weekStart,
          startTime: '10:00',
          endTime: '11:00',
          status: 'available',
          smartRunId: expect.stringMatching(/^smart_1_20260608_/),
        }),
      ]),
      1,
      1,
      weekStart,
    );
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

  it('reports soft warnings when project skill does not match', async () => {
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

    expect(result.summary.hardConflictCount).toBe(0);
    expect(result.summary.softWarningCount).toBeGreaterThan(0);
    expect(result.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'skill_mismatch',
          severity: 'soft',
          beauticianId: 1,
          reservationId: 10,
        }),
      ]),
    );
    expect(result.score).toBeLessThan(95);
  });

  it('reports understaffed demand slots', async () => {
    const result = await service.demand({ storeId: 1, weekStart });

    expect(result.summary.underStaffedSlots).toBeGreaterThan(0);
    expect(result.slots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          date: weekStart,
          startTime: '10:00',
          requiredStaff: 1,
          scheduledStaff: 0,
        }),
      ]),
    );
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
        }),
      ]),
    );
  });
});
