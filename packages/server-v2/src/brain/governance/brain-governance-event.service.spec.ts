import { BrainGovernanceEventService } from './brain-governance-event.service.js';

describe('BrainGovernanceEventService', () => {
  it('records append-only governance events with normalized actor and entity identities', async () => {
    const create = jest.fn().mockResolvedValue({ id: 1 });
    const service = new BrainGovernanceEventService({ brainGovernanceEvent: { create } } as never);
    const createdAt = new Date('2026-08-02T00:00:00.000Z');

    await expect(service.record({
      candidateId: 9,
      eventType: 'task_pending_approval',
      entityType: 'governance_task',
      entityId: 41,
      actorType: 'system',
      actorId: 7,
      payload: { riskLevel: 'medium', nested: { valid: true } },
      createdAt,
    })).resolves.toEqual({ id: 1 });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        candidateId: 9,
        eventType: 'task_pending_approval',
        entityType: 'governance_task',
        entityId: '41',
        actorType: 'system',
        actorId: '7',
        payload: { riskLevel: 'medium', nested: { valid: true } },
        resultChecksum: expect.stringMatching(/^[0-9a-f]{64}$/u),
        createdAt,
      }),
    });
  });

  it('uses null optional identities and an empty payload without mutating history', async () => {
    const create = jest.fn().mockResolvedValue({ id: 2 });
    const service = new BrainGovernanceEventService({ brainGovernanceEvent: { create } } as never);

    await service.record({ eventType: 'candidate_created', entityType: 'candidate', entityId: 'candidate-1', actorType: 'ci' });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        candidateId: null,
        eventType: 'candidate_created',
        entityType: 'candidate',
        entityId: 'candidate-1',
        actorType: 'ci',
        actorId: null,
        payload: {},
        resultChecksum: expect.stringMatching(/^[0-9a-f]{64}$/u),
      }),
    });
  });

  it('produces a stable checksum for the same normalized event content', async () => {
    const create = jest.fn().mockResolvedValue({ id: 3 });
    const service = new BrainGovernanceEventService({ brainGovernanceEvent: { create } } as never);
    const input = {
      eventType: 'transition_completed',
      entityType: 'governance_transition',
      entityId: 7,
      actorType: 'user' as const,
      actorId: 5,
      payload: { policyCode: 'GP-003', runtimeCode: 'RT-001', identity: { commit: 'abcdef', candidate: 'candidate-1' } },
    };

    await service.record(input);
    await service.record({
      actorId: 5,
      actorType: 'user',
      entityId: 7,
      entityType: 'governance_transition',
      eventType: 'transition_completed',
      payload: { identity: { candidate: 'candidate-1', commit: 'abcdef' }, runtimeCode: 'RT-001', policyCode: 'GP-003' },
    });

    const firstChecksum = create.mock.calls[0]?.[0]?.data?.resultChecksum;
    const secondChecksum = create.mock.calls[1]?.[0]?.data?.resultChecksum;
    expect(firstChecksum).toMatch(/^[0-9a-f]{64}$/u);
    expect(secondChecksum).toBe(firstChecksum);
  });
});
