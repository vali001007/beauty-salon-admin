import {
  selectCurrentSemanticCandidates,
  semanticCandidateKey,
} from './brain-semantic-candidate-workspace-scanner.js';

describe('semantic candidate workspace reconciliation', () => {
  const current = {
    status: 'blocked' as const,
    blockedReasons: ['structural_evidence_missing'],
    draftInput: {
      definitionKey: 'entity.product',
      payload: { model: 'Product', aliases: [] },
      evidence: [{ sourcePath: 'packages/server-v2/prisma/schema.prisma' }],
    },
  };

  it('uses the freshly scanned candidate instead of imported evidence and status', () => {
    const selected = selectCurrentSemanticCandidates(
      [{
        status: 'draft',
        blockedReasons: [],
        draftInput: {
          definitionKey: 'entity.product',
          payload: { model: 'ForgedProduct', aliases: ['伪造'] },
          evidence: [{ sourcePath: 'attacker://forged' }],
        },
      }],
      [current],
    );

    expect(selected).toEqual([current]);
    expect(selected[0]).not.toBe(current);
  });

  it('fails closed for missing, duplicate or identity-free imported candidates', () => {
    expect(() => selectCurrentSemanticCandidates([{ definitionKey: 'entity.customer' }], [current])).toThrow(
      'semantic_candidate_sync_source_drift:entity.customer',
    );
    expect(() =>
      selectCurrentSemanticCandidates(
        [{ definitionKey: 'entity.product' }, { draftInput: { definitionKey: 'entity.product' } }],
        [current],
      ),
    ).toThrow('semantic_candidate_sync_duplicate:entity.product');
    expect(() => semanticCandidateKey({ status: 'draft' })).toThrow('semantic_candidate_sync_identity_invalid');
  });
});
