import { BrainGovernanceTaskWorkerService } from './brain-governance-task-worker.service.js';

describe('BrainGovernanceTaskWorkerService', () => {
  it('claims pending and lease-expired work through the control plane with one worker identity', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 11 }, { id: 12 }]);
    const prisma = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      brainGovernanceTask: { findMany },
    };
    const controlPlane = {
      processTask: jest.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),
    };
    const worker = new BrainGovernanceTaskWorkerService(prisma as never, controlPlane as never);

    await expect(worker.processAvailable(10, 'worker-1')).resolves.toBe(1);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        OR: [
          { status: 'pending', availableAt: { lte: expect.any(Date) } },
          { status: { in: ['validating', 'classifying', 'evaluating'] }, leaseExpiresAt: { lt: expect.any(Date) } },
        ],
      },
      take: 10,
    }));
    expect(controlPlane.processTask).toHaveBeenNthCalledWith(1, 11, 'worker-1');
    expect(controlPlane.processTask).toHaveBeenNthCalledWith(2, 12, 'worker-1');
  });

  it('does not poll when the rollout flag is disabled', async () => {
    const previous = process.env.BRAIN_GOVERNANCE_TASK_WORKER_ENABLED;
    delete process.env.BRAIN_GOVERNANCE_TASK_WORKER_ENABLED;
    const worker = new BrainGovernanceTaskWorkerService({} as never, {} as never);
    const processAvailable = jest.spyOn(worker, 'processAvailable');

    await worker.tick();

    expect(processAvailable).not.toHaveBeenCalled();
    if (previous === undefined) delete process.env.BRAIN_GOVERNANCE_TASK_WORKER_ENABLED;
    else process.env.BRAIN_GOVERNANCE_TASK_WORKER_ENABLED = previous;
  });
});
