import { BadRequestException } from '@nestjs/common';
import { BrainReleaseService } from './brain-release.service.js';

describe('BrainReleaseService', () => {
  it('creates a draft release with immutable resource items', async () => {
    const versions = [
      { id: 11, resourceType: 'metric', resourceKey: 'paid_revenue', version: 2, status: 'draft', snapshot: { permissions: ['core:finance:view'] } },
    ];
    const tx = {
      brainRelease: { create: jest.fn().mockResolvedValue({ id: 21, releaseKey: 'brain-r1', status: 'draft' }) },
      brainReleaseItem: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      brainResourceVersion: { findMany: jest.fn().mockResolvedValue(versions) },
      brainRelease: { findFirst: jest.fn().mockResolvedValue({ id: 20 }) },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new BrainReleaseService(prisma as never);

    const result = await service.createRelease({
      releaseKey: 'brain-r1',
      scope: 'store',
      rollout: { storeIds: [6] },
      resourceVersionIds: [11],
      createdBy: 9,
    });

    expect(tx.brainRelease.create).toHaveBeenCalledWith({ data: expect.objectContaining({ releaseKey: 'brain-r1', previousReleaseId: 20, status: 'draft' }) });
    expect(tx.brainReleaseItem.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ releaseId: 21, resourceVersionId: 11, resourceKey: 'paid_revenue' })] });
    expect(result).toMatchObject({ id: 21, status: 'draft' });
  });

  it('blocks activation when no completed passing eval exists', async () => {
    const prisma = {
      brainRelease: { findUnique: jest.fn().mockResolvedValue({ id: 21, items: [{ resourceVersion: { id: 11 } }] }) },
      brainEvalRun: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(service.activateRelease({ releaseId: 21, activatedBy: 9 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('selects a store-scoped canary only for matching stores', async () => {
    const prisma = {
      brainRelease: {
        findMany: jest.fn().mockResolvedValue([
          { id: 2, releaseKey: 'canary', scope: 'store', rollout: { storeIds: [6] }, activatedAt: new Date('2026-07-11'), items: [] },
          { id: 1, releaseKey: 'stable', scope: 'global', rollout: {}, activatedAt: new Date('2026-07-10'), items: [] },
        ]),
      },
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(service.selectRelease({ storeId: 6, userId: 9, roleKey: 'store_manager' })).resolves.toMatchObject({ releaseKey: 'canary' });
    await expect(service.selectRelease({ storeId: 7, userId: 9, roleKey: 'store_manager' })).resolves.toMatchObject({ releaseKey: 'stable' });
  });

  it('archives the current resource version before restoring the previous release', async () => {
    const current = { id: 22, status: 'active', previousReleaseId: 21 };
    const previousVersion = { id: 11, resourceType: 'metric', resourceKey: 'paid_revenue', sourceResourceId: 31 };
    const tx = {
      brainRelease: { update: jest.fn().mockImplementation(({ where }) => ({ id: where.id, status: 'active', items: [] })) },
      brainResourceVersion: { updateMany: jest.fn(), update: jest.fn() },
      brainMetric: { updateMany: jest.fn(), update: jest.fn() },
    };
    const prisma = {
      brainRelease: {
        findUnique: jest.fn()
          .mockResolvedValueOnce(current)
          .mockResolvedValueOnce({ id: 21, items: [{ resourceVersionId: 11, resourceType: 'metric', resourceKey: 'paid_revenue', resourceVersion: previousVersion }] }),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new BrainReleaseService(prisma as never);

    await service.rollbackRelease({ releaseId: 22, reason: 'test' });

    expect(tx.brainResourceVersion.updateMany).toHaveBeenCalledWith({
      where: { resourceType: 'metric', resourceKey: 'paid_revenue', status: 'active', id: { not: 11 } },
      data: { status: 'archived', archivedAt: expect.any(Date) },
    });
    expect(tx.brainMetric.updateMany).toHaveBeenCalledWith({
      where: { metricKey: 'paid_revenue', status: 'active' },
      data: { status: 'archived' },
    });
  });
});
