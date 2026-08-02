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
      data: {
        candidateId: 9,
        eventType: 'task_pending_approval',
        entityType: 'governance_task',
        entityId: '41',
        actorType: 'system',
        actorId: '7',
        payload: { riskLevel: 'medium', nested: { valid: true } },
        createdAt,
      },
    });
  });

  it('uses null optional identities and an empty payload without mutating history', async () => {
    const create = jest.fn().mockResolvedValue({ id: 2 });
    const service = new BrainGovernanceEventService({ brainGovernanceEvent: { create } } as never);

    await service.record({ eventType: 'candidate_created', entityType: 'candidate', entityId: 'candidate-1', actorType: 'ci' });

    expect(create).toHaveBeenCalledWith({
      data: {
        candidateId: null,
        eventType: 'candidate_created',
        entityType: 'candidate',
        entityId: 'candidate-1',
        actorType: 'ci',
        actorId: null,
        payload: {},
      },
    });
  });
});
