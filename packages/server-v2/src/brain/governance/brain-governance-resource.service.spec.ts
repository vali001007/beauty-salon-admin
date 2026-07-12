import { BadRequestException } from '@nestjs/common';
import { BrainGovernanceResourceService } from './brain-governance-resource.service.js';

describe('BrainGovernanceResourceService', () => {
  it('creates a new immutable metric draft and generic resource version in one transaction', async () => {
    const tx = {
      brainResourceVersion: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 41, ...data })),
      },
      brainMetric: { create: jest.fn().mockResolvedValue({ id: 17 }) },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const service = new BrainGovernanceResourceService(prisma as never);

    const result = await service.createDraft({
      resourceType: 'metric',
      resourceKey: 'new_customer_count',
      payload: {
        name: '新客数',
        domain: 'customer',
        formula: { operation: 'count' },
        sourceTables: ['Customer'],
        permissions: ['core:customer:view'],
        description: '统计周期内新建客户数',
      },
      createdBy: 9,
    });

    expect(tx.brainMetric.create).toHaveBeenCalledWith({ data: expect.objectContaining({ metricKey: 'new_customer_count', version: 1, status: 'draft' }) });
    expect(tx.brainResourceVersion.create).toHaveBeenCalledWith({ data: expect.objectContaining({ resourceType: 'metric', resourceKey: 'new_customer_count', version: 1, status: 'draft', sourceResourceId: 17 }) });
    expect(result).toMatchObject({ id: 41, version: 1, status: 'draft' });
  });

  it('updates a resource by creating version 2 and does not mutate version 1', async () => {
    const previous = {
      id: 41,
      resourceType: 'metric',
      resourceKey: 'paid_revenue',
      version: 1,
      snapshot: {
        name: '实收流水',
        domain: 'finance',
        formula: { operation: 'sum' },
        sourceTables: ['ProductOrder'],
        permissions: ['core:finance:view'],
        description: '旧定义',
      },
    };
    const tx = {
      brainResourceVersion: {
        findFirst: jest.fn().mockResolvedValue(previous),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 42, ...data })),
      },
      brainMetric: { create: jest.fn().mockResolvedValue({ id: 18 }), update: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const service = new BrainGovernanceResourceService(prisma as never);

    const result = await service.createDraft({
      resourceType: 'metric',
      resourceKey: 'paid_revenue',
      payload: { description: '新定义' },
      createdBy: 9,
    });

    expect(tx.brainMetric.update).not.toHaveBeenCalled();
    expect(tx.brainMetric.create).toHaveBeenCalledWith({ data: expect.objectContaining({ metricKey: 'paid_revenue', version: 2, description: '新定义' }) });
    expect(result).toMatchObject({ version: 2 });
  });

  it('does not allow a draft to bypass the release gate and become active directly', async () => {
    const prisma = {
      brainResourceVersion: {
        findUnique: jest.fn().mockResolvedValue({ id: 41, status: 'draft' }),
        update: jest.fn(),
      },
    };
    const service = new BrainGovernanceResourceService(prisma as never);

    await expect(service.changeStatus({ id: 41, status: 'active' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.brainResourceVersion.update).not.toHaveBeenCalled();
  });
});
