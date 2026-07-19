import { BrainObservationService } from './brain-observation.service.js';

describe('BrainObservationService', () => {
  it('exposes controlled mapping outputs with camelCase and snake_case aliases', () => {
    const observation = new BrainObservationService().fromAnswer({
      nodeId: 'reservations',
      capabilityKey: 'reservation_list',
      capabilityVersion: 1,
      startedAt: new Date('2026-07-19T00:00:00.000Z'),
      answer: {
        status: 'completed',
        answer: '没有预约。',
        citations: [],
        grounding: 'db_skill',
        blocks: [{ kind: 'table', rows: [], columns: ['customerId'], citationIds: [] }],
        metadata: { mappingOutputs: { customerIds: [] } },
      },
    });

    expect(observation.data).toMatchObject({ customerIds: [], customer_ids: [] });
  });
});
