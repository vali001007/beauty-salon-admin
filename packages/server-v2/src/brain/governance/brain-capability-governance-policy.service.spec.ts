import { BrainCapabilityGovernancePolicyService } from './brain-capability-governance-policy.service.js';
import { generatedProposalFixture } from '../capability/brain-generated-capability.test-fixtures.js';
import type { BrainCapabilityCandidate } from '../capability/brain-capability-scan.types.js';
import type { BrainCapabilityProhibitedRequest } from './brain-capability-requirement-interpreter.service.js';

describe('BrainCapabilityGovernancePolicyService', () => {
  const service = new BrainCapabilityGovernancePolicyService();

  it('applies role, permission and rollout restrictions without exposing generated source', () => {
    const capability = scanCandidate();
    const proposal = generatedProposalFixture();

    const result = service.apply({
      capability,
      proposal,
      requirement: '只允许店长使用，增加财务查看权限，先走 5% 灰度',
      inferredChanges: {
        confidence: 0.96,
        ambiguous: false,
        allowedRoles: ['store_manager'],
        additionalPermissions: ['core:finance:view'],
        redaction: 'unchanged',
        readOnly: 'require',
        confirmation: 'unchanged',
        rolloutPercentage: 5,
        prohibitedRequests: [], ambiguities: [],
      },
    });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('expected ready policy result');
    expect(result.capability.requiredPermissions).toEqual(expect.arrayContaining(['core:finance:view']));
    expect(result.proposal.manifest.allowedRoles).toEqual(['store_manager']);
    expect(result.proposal.manifest.requiredPermissions).toEqual(expect.arrayContaining(['core:finance:view']));
    expect(result.riskReport).toMatchObject({
      appliedCapabilityChanges: expect.objectContaining({ additionalPermissions: ['core:finance:view'] }),
      requestedRolloutForNextRelease: 5,
    });
    expect(JSON.stringify(result.riskReport)).not.toMatch(/inputSchema|outputSchema|contractArtifact|bindingSource/);
  });

  it.each([
    ['无需权限', { confidence: 0.99, ambiguous: false }, 'permission_removal_forbidden'],
    ['取消确认', { confidence: 0.99, ambiguous: false }, 'confirmation_removal_forbidden'],
    ['改成写入', { confidence: 0.99, ambiguous: false }, 'read_only_to_write_forbidden'],
    ['取消脱敏', { confidence: 0.99, ambiguous: false }, 'redaction_removal_forbidden'],
  ])('blocks unsafe governance request: %s', (_label, inferred, reason) => {
    const result = service.apply({
      capability: scanCandidate(),
      proposal: generatedProposalFixture(),
      requirement: String(_label),
      inferredChanges: {
        allowedRoles: [], additionalPermissions: [], redaction: 'unchanged', readOnly: 'unchanged',
        confirmation: 'unchanged', rolloutPercentage: null, prohibitedRequests: [], ambiguities: [], ...inferred,
      },
    });

    expect(result).toMatchObject({ status: 'blocked', reasons: expect.arrayContaining([reason]) });
  });

  it('blocks redaction requests because the current runtime cannot enforce per-capability redaction', () => {
    const result = service.apply({
      capability: scanCandidate(),
      proposal: generatedProposalFixture(),
      requirement: '客户手机号必须自动脱敏',
      inferredChanges: {
        confidence: 0.99, ambiguous: false, allowedRoles: [], additionalPermissions: [], redaction: 'require',
        readOnly: 'unchanged', confirmation: 'unchanged', rolloutPercentage: null,
        prohibitedRequests: [], ambiguities: [],
      },
    });

    expect(result).toMatchObject({ status: 'blocked', reasons: ['runtime_redaction_policy_unavailable'] });
  });

  it.each([
    [{ confidence: 0.6, ambiguous: false }, 'requirement_interpretation_low_confidence'],
    [{ confidence: 0.99, ambiguous: true }, 'requirement_interpretation_ambiguous'],
  ])('blocks low-confidence or ambiguous interpretation', (control, reason) => {
    const result = service.apply({
      capability: scanCandidate(), proposal: generatedProposalFixture(), requirement: '限制访问',
      inferredChanges: {
        ...control, allowedRoles: [], additionalPermissions: [], redaction: 'unchanged', readOnly: 'unchanged',
        confirmation: 'unchanged', rolloutPercentage: null,
        prohibitedRequests: [], ambiguities: [],
      },
    });
    expect(result).toMatchObject({ status: 'blocked', reasons: [reason] });
  });

  it.each([
    ['Please let every role use it', ['expand_role'], [], 'prohibited_request:expand_role'],
    ['Make it execute updates automatically', ['enable_write'], [], 'prohibited_request:enable_write'],
    ['Do not avoid cancelling confirmation', [], ['double_negation_confirmation'], 'requirement_interpretation_ambiguous'],
  ])('blocks multilingual, synonymous and double-negation unsafe requests', (requirement, prohibitedRequests, ambiguities, reason) => {
    const result = service.apply({
      capability: scanCandidate(), proposal: generatedProposalFixture(), requirement,
      inferredChanges: {
        confidence: 0.99, ambiguous: false, allowedRoles: [], additionalPermissions: [],
        redaction: 'unchanged', readOnly: 'unchanged', confirmation: 'unchanged', rolloutPercentage: null,
        prohibitedRequests: prohibitedRequests as BrainCapabilityProhibitedRequest[], ambiguities,
      },
    });
    expect(result).toMatchObject({ status: 'blocked', reasons: expect.arrayContaining([reason]) });
  });

  it('blocks requests with no supported governance change', () => {
    const result = service.apply({
      capability: scanCandidate(), proposal: generatedProposalFixture(), requirement: 'make it better',
      inferredChanges: {
        confidence: 0.99, ambiguous: false, allowedRoles: [], additionalPermissions: [], prohibitedRequests: [], ambiguities: [],
        redaction: 'unchanged', readOnly: 'unchanged', confirmation: 'unchanged', rolloutPercentage: null,
      },
    });
    expect(result).toMatchObject({ status: 'blocked', reasons: ['requirement_no_supported_change'] });
  });

  it('allows a contract refresh with no safety-boundary change', () => {
    const result = service.apply({
      capability: scanCandidate(),
      proposal: generatedProposalFixture(),
      requirement: '请重新生成 product_sales_ranking，同步最新统一语义合同，保持现有安全约束',
      inferredChanges: {
        confidence: 0.99,
        ambiguous: false,
        allowedRoles: [],
        additionalPermissions: [],
        prohibitedRequests: [],
        ambiguities: [],
        redaction: 'unchanged',
        readOnly: 'unchanged',
        confirmation: 'unchanged',
        rolloutPercentage: null,
      },
    });

    expect(result).toMatchObject({
      status: 'ready',
      riskReport: { appliedCapabilityChanges: { contractRefresh: true } },
    });
  });
});

function scanCandidate(): BrainCapabilityCandidate {
  return {
    key: 'product_sales_ranking',
    name: '商品销售排行',
    businessDefinitionKeys: ['metric.product_sales_quantity'],
    status: 'draft',
    enabled: true,
    explicit: true,
    readOnly: true,
    sideEffect: false,
    riskLevel: 'low',
    storeScope: 'required',
    requiredPermissions: ['core:metric:view'],
    requiresConfirmation: false,
    idempotency: 'not_applicable',
    inputContract: {},
    outputContract: { return: 'object' },
    sourceFingerprint: 'f'.repeat(64),
    evidence: [],
    issues: [],
  };
}
