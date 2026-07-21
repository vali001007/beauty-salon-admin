import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CustomerFeedbackService } from './customer-feedback.service.js';

describe('CustomerFeedbackService', () => {
  it('builds complaint, satisfaction, coverage and staff analytics from one fact source', async () => {
    const prisma = {
      customerServiceFeedback: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, feedbackType: 'complaint', rating: 1, status: 'open', beauticianId: 8, serviceTaskId: 101 },
          { id: 2, feedbackType: 'satisfaction', rating: 5, status: 'resolved', beauticianId: 8, serviceTaskId: 102 },
          { id: 3, feedbackType: 'complaint', rating: null, status: 'closed', beauticianId: 9, serviceTaskId: null },
        ]),
      },
      serviceTask: { count: jest.fn().mockResolvedValue(4) },
      beautician: {
        findMany: jest.fn().mockResolvedValue([{ id: 8, name: '唐伊' }, { id: 9, name: '沈晴' }]),
      },
    };
    const service = new CustomerFeedbackService(prisma as never);

    const result = await service.analytics(6, {
      startDate: '2026-07-01T00:00:00.000Z',
      endDate: '2026-08-01T00:00:00.000Z',
    });

    expect(result.summary).toEqual({
      feedbackCount: 3,
      complaintCount: 2,
      unresolvedComplaintCount: 1,
      ratedFeedbackCount: 2,
      ratingTotal: 6,
      averageRating: 3,
      lowRatingCount: 1,
      completedServiceTaskCount: 4,
      linkedServiceTaskCount: 2,
      collectionCoverageRate: 0.5,
    });
    expect(result.staff).toEqual([
      expect.objectContaining({
        beauticianId: 8,
        beauticianName: '唐伊',
        feedbackCount: 2,
        complaintCount: 1,
        unresolvedComplaintCount: 1,
        averageRating: 3,
      }),
      expect.objectContaining({
        beauticianId: 9,
        beauticianName: '沈晴',
        feedbackCount: 1,
        complaintCount: 1,
        unresolvedComplaintCount: 0,
        averageRating: null,
      }),
    ]);
  });

  it('rejects cross-store business references before creating feedback', async () => {
    const prisma = {
      customer: { findFirst: jest.fn().mockResolvedValue(null) },
      customerServiceFeedback: { create: jest.fn() },
    };
    const service = new CustomerFeedbackService(prisma as never);

    await expect(service.create(6, 9, {
      customerId: 77,
      feedbackType: 'complaint',
      content: '等待过久',
    })).rejects.toThrow(new BadRequestException('客户不存在或不属于当前门店'));
    expect(prisma.customerServiceFeedback.create).not.toHaveBeenCalled();
  });

  it('records resolution audit fields without allowing another store to update the record', async () => {
    const prisma = {
      customerServiceFeedback: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 4, storeId: 6, status: 'open', handledAt: null })
          .mockResolvedValueOnce({
            id: 4,
            storeId: 6,
            status: 'resolved',
            handledAt: new Date('2026-07-17T10:00:00.000Z'),
            beauticianId: null,
            projectId: null,
            customer: null,
          }),
        update: jest.fn().mockResolvedValue({ id: 4 }),
      },
      beautician: { findMany: jest.fn() },
      project: { findMany: jest.fn() },
    };
    const service = new CustomerFeedbackService(prisma as never);

    await expect(service.update(7, 4, 9, { status: 'resolved' })).rejects.toThrow(NotFoundException);
    await expect(
      service.update(6, 4, 9, { status: 'resolved', resolutionNote: '已回访并补做服务' }),
    ).resolves.toEqual(expect.objectContaining({ id: 4, status: 'resolved' }));

    expect(prisma.customerServiceFeedback.update).toHaveBeenCalledWith({
      where: { id: 4 },
      data: expect.objectContaining({
        status: 'resolved',
        resolutionNote: '已回访并补做服务',
        handledByUserId: 9,
        handledAt: expect.any(Date),
        resolvedAt: expect.any(Date),
      }),
    });
  });
});
