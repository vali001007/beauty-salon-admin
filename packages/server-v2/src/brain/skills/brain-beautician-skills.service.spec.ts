import { BrainBeauticianSkillsService } from './brain-beautician-skills.service.js';

describe('BrainBeauticianSkillsService personal customer scope', () => {
  it('returns only customers served by the logged-in beautician who are also inactive store-wide', async () => {
    const prisma = {
      beautician: {
        findFirst: jest.fn().mockResolvedValue({ id: 18, name: '唐伊' }),
      },
      serviceTask: {
        findMany: jest.fn().mockResolvedValue([
          {
            customerId: 11,
            appointmentTime: new Date('2026-04-01T02:00:00.000Z'),
            customer: {
              name: '王女士',
              memberLevel: '金卡',
              visitCount: 6,
              totalSpent: 8800,
              lastVisitDate: new Date('2026-04-01T02:00:00.000Z'),
            },
          },
          {
            customerId: 12,
            appointmentTime: new Date('2026-03-01T02:00:00.000Z'),
            customer: {
              name: '李女士',
              memberLevel: '银卡',
              visitCount: 4,
              totalSpent: 3200,
              lastVisitDate: new Date('2026-07-10T02:00:00.000Z'),
            },
          },
        ]),
      },
    };
    const service = new BrainBeauticianSkillsService(prisma as never);

    const result = await service.buildPersonalInactiveCustomers({
      storeId: 6,
      userId: 27,
      asOf: new Date('2026-07-20T02:00:00.000Z'),
      thresholdDays: 60,
      limit: 10,
    });

    expect(prisma.beautician.findFirst).toHaveBeenCalledWith({
      where: { storeId: 6, userId: 27, status: 'active' },
      select: { id: true, name: true },
    });
    expect(prisma.serviceTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: 6, beauticianId: 18, status: 'completed' }),
      }),
    );
    expect(result).toMatchObject({ beauticianName: '唐伊', thresholdDays: 60, total: 1, truncated: false });
    expect(result.rows).toEqual([
      expect.objectContaining({ customerId: 11, customerName: '王女士', inactiveDays: 110 }),
    ]);
    expect(result.rows).not.toEqual(expect.arrayContaining([expect.objectContaining({ customerId: 12 })]));
  });
});
