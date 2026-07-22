import { BrainCapabilityRegenerationWorkerService } from './brain-capability-regeneration-worker.service.js';

describe('BrainCapabilityRegenerationWorkerService', () => {
  function job(overrides: Record<string, unknown> = {}) {
    return { id: 7, status: 'leased', attemptCount: 1, maxAttempts: 3, leaseOwner: 'worker-a', ...overrides };
  }

  it('claims due work with SKIP LOCKED semantics and completes with lease-owner fencing', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValueOnce([job()]).mockResolvedValueOnce([{ id: 7 }]),
    };
    const regeneration = { executeJob: jest.fn().mockResolvedValue({ status: 'completed', report: { progress: 100 }, generatedResourceVersionIds: [41] }) };
    const worker = new BrainCapabilityRegenerationWorkerService(prisma as never, regeneration as never);

    await worker.processQueued(1, 'worker-a');

    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(regeneration.executeJob).toHaveBeenCalledWith(7, 'worker-a', expect.any(String));
    const finalizeSql = prisma.$queryRaw.mock.calls[1][0].strings.join(' ');
    expect(finalizeSql).toContain('"leaseExpiresAt" > NOW()');
    expect(finalizeSql).toContain('"status" =');
  });

  it('does not finalize after losing the lease', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValueOnce([job()]).mockResolvedValueOnce([]),
    };
    const worker = new BrainCapabilityRegenerationWorkerService(
      prisma as never,
      { executeJob: jest.fn().mockResolvedValue({ status: 'completed', report: {}, generatedResourceVersionIds: [] }) } as never,
    );

    await expect(worker.processQueued(1, 'worker-a')).resolves.toBe(0);
  });

  it.each([
    [1, 'retry_scheduled', 60_000],
    [2, 'retry_scheduled', 300_000],
    [3, 'dead_letter', 0],
  ])('uses bounded retry/dead-letter policy for attempt %s', async (attemptCount, status, minimumDelay) => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValueOnce([job({ attemptCount })]).mockResolvedValueOnce([{ id: 7 }]),
    };
    const worker = new BrainCapabilityRegenerationWorkerService(
      prisma as never,
      { executeJob: jest.fn().mockRejectedValue(new Error('temporary_failure')) } as never,
    );
    await worker.processQueued(1, 'worker-a');

    const failureQuery = prisma.$queryRaw.mock.calls[1][0];
    const failureSql = failureQuery.strings.join(' ');
    expect(failureSql).toContain('NOW()');
    expect(failureSql).toContain('INTERVAL');
    expect(failureQuery.values).toContain(status);
    if (minimumDelay) expect(failureQuery.values).toContain(minimumDelay / 60_000);
  });

  it('keeps the cron disabled unless explicitly enabled', async () => {
    const worker = new BrainCapabilityRegenerationWorkerService({} as never, {} as never);
    delete process.env.BRAIN_CAPABILITY_REGENERATION_WORKER_ENABLED;
    const spy = jest.spyOn(worker, 'processQueued').mockResolvedValue(0);

    await worker.tick();

    expect(spy).not.toHaveBeenCalled();
  });

  it('claims only jobs below max attempts and dead-letters exhausted leases', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([]) };
    const worker = new BrainCapabilityRegenerationWorkerService(prisma as never, {} as never);

    await worker.processQueued(1, 'worker-a');

    const query = prisma.$queryRaw.mock.calls[0][0];
    const sql = query.strings.join(' ');
    expect(sql).toContain('"attemptCount" < job."maxAttempts"');
    expect(sql).toContain("'dead_letter'");
    expect(sql).toContain('NOW()');
    expect(sql).toContain('jsonb_array_length');
    expect(sql).toContain('business_definition_change_pending');
    expect(sql).toContain('business_definition_registry_failed');
    expect(sql).toContain('affected_capability_ambiguous');
  });
});
