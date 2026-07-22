import {
  selectCurrentSemanticCandidates,
  semanticCandidateKey,
} from './brain-semantic-candidate-workspace-scanner.js';
import { AMI_CORE_BUSINESS_DIMENSION_CONTRACTS } from './ami-core-business-semantic-contracts.js';

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

  it('uses one Ami Core member-level definition for customer facts and reservation discovery', () => {
    const contract = AMI_CORE_BUSINESS_DIMENSION_CONTRACTS.find((item) => item.dimensionKey === 'customerLevel');

    expect(contract).toMatchObject({
      name: '会员等级',
      domain: 'customer',
      source: { model: 'Customer', field: 'memberLevel' },
      permissions: ['core:brain:use'],
    });
    expect(contract?.capabilityKeys).toEqual(['customer_facts', 'reservation_list']);
    expect(AMI_CORE_BUSINESS_DIMENSION_CONTRACTS.filter((item) => item.source.model === 'Customer' && item.source.field === 'memberLevel')).toHaveLength(1);
  });
});
