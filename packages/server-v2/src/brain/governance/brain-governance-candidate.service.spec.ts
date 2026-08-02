import { BrainGovernanceCandidateService } from './brain-governance-candidate.service.js';

const HASH = 'a'.repeat(64);
const identity = {
  candidateKey: 'owner/repo:head:merge',
  repository: 'owner/repo',
  eventName: 'pull_request',
  branch: 'feature/governance',
  baseCommit: '1'.repeat(40),
  mergeBaseCommit: '2'.repeat(40),
  headCommit: '3'.repeat(40),
  changedFilesChecksum: HASH,
  diffChecksum: 'b'.repeat(64),
  sourceFingerprint: 'c'.repeat(64),
  riskLevel: 'medium',
};

describe('BrainGovernanceCandidateService', () => {
  it('keeps the signed branch identity when creating a candidate from a receipt', async () => {
    const service = new BrainGovernanceCandidateService({} as never);
    const upsert = jest.spyOn(service, 'upsert').mockResolvedValue({ id: 9 } as never);

    await service.upsertFromReceipt(identity);

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      candidateKey: identity.candidateKey,
      repository: identity.repository,
      branch: 'feature/governance',
      headCommit: identity.headCommit,
    }));
  });

  it('upserts the same candidate identity idempotently and supersedes the previous branch head', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const upsert = jest.fn().mockResolvedValue({ id: 9, ...identity, status: 'checking' });
    const service = new BrainGovernanceCandidateService({
      brainGovernanceCandidate: {
        findUnique: jest.fn().mockResolvedValue(null),
        updateMany,
        upsert,
      },
    } as never);

    await expect(service.upsert(identity)).resolves.toMatchObject({ id: 9, status: 'checking' });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        repository: identity.repository,
        branch: identity.branch,
        headCommit: { not: identity.headCommit },
        status: { notIn: ['completed', 'superseded'] },
      },
      data: { status: 'superseded', completedAt: expect.any(Date) },
    });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { candidateKey: identity.candidateKey },
      create: expect.objectContaining({ ...identity, status: 'checking' }),
    }));
  });

  it('rejects reuse of a candidate key with a different commit identity', async () => {
    const service = new BrainGovernanceCandidateService({
      brainGovernanceCandidate: {
        findUnique: jest.fn().mockResolvedValue({ ...identity, headCommit: '4'.repeat(40) }),
      },
    } as never);

    await expect(service.upsert(identity)).rejects.toMatchObject({ message: 'candidate_identity_conflict' });
  });

  it('does not reactivate a superseded candidate when a late receipt arrives', async () => {
    const upsert = jest.fn();
    const service = new BrainGovernanceCandidateService({
      brainGovernanceCandidate: {
        findUnique: jest.fn().mockResolvedValue({ ...identity, status: 'superseded' }),
        upsert,
      },
    } as never);

    await expect(service.upsert(identity)).rejects.toMatchObject({ message: 'candidate_superseded' });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('returns server-paginated candidates without loading receipt payloads', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 1, candidateKey: 'candidate-1' }]);
    const service = new BrainGovernanceCandidateService({
      brainGovernanceCandidate: {
        findMany,
        count: jest.fn().mockResolvedValue(41),
      },
    } as never);

    await expect(service.list({ page: 2, pageSize: 20, status: 'blocked', search: 'owner' }))
      .resolves.toEqual({ items: [{ id: 1, candidateKey: 'candidate-1' }], total: 41, page: 2, pageSize: 20 });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 20 }));
    expect(findMany.mock.calls[0]?.[0]).not.toHaveProperty('include.receipts');
  });
});
