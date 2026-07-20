import type { BrainEvaluationReleaseSnapshot } from '../governance/brain-evaluation-release-snapshot.js';
import { buildBrainReleaseEvalGate, evaluateBrainReleaseEvalGate } from './brain-release-eval-gate.js';

describe('brain release eval gate', () => {
  const snapshot = {
    releaseId: 21,
    releaseStatus: 'draft',
    releaseFingerprint: 'a'.repeat(64),
    declaredMode: 'shadow',
    mode: 'model',
    resourceVersionIds: [3, 4],
    capabilityKeys: ['customer_facts', 'reservation_list'],
    capabilityCandidates: [
      {
        key: 'customer_facts',
        version: 1,
        domains: ['customer'],
        allowedRoles: [],
        requiredPermissions: ['core:customer:view'],
        examples: ['查询张三客户档案', '查看客户 ID 123'],
      },
      {
        key: 'reservation_list',
        version: 1,
        domains: ['reservation'],
        allowedRoles: ['store_manager'],
        requiredPermissions: ['core:store:reservations'],
        examples: ['查看明天预约列表', '查询今日预约记录'],
      },
    ],
  } as unknown as BrainEvaluationReleaseSnapshot;

  it('builds complete capability and adversarial coverage from the frozen release', () => {
    const gate = buildBrainReleaseEvalGate(snapshot);

    expect(gate.manifest).toMatchObject({
      mode: 'release_gate',
      releaseId: 21,
      releaseFingerprint: 'a'.repeat(64),
      requiredCapabilityKeys: ['customer_facts', 'reservation_list'],
      requiredRoleKeys: ['finance', 'store_manager'],
      coverageComplete: true,
    });
    expect(gate.cases.filter((item) => item.caseKey.startsWith('release_capability:'))).toHaveLength(4);
    expect(gate.cases.find((item) => item.caseKey === 'release_capability:21:customer_facts:1')).toMatchObject({
      contextOverride: { permissions: ['core:customer:view'] },
    });
    expect(gate.cases.filter((item) => item.caseKey.startsWith('release_security:'))).toHaveLength(4);
    expect(gate.manifest.requiredCaseKeys).toHaveLength(8);
  });

  it('fails the release gate when one case is missing or a required capability was never selected', () => {
    const gate = buildBrainReleaseEvalGate(snapshot);
    const incomplete = gate.cases.slice(1).map((item) => ({
      caseKey: item.caseKey,
      passed: true,
      actualCapabilityKeys: item.expectedCapabilityKeys,
    }));

    expect(evaluateBrainReleaseEvalGate(gate.manifest, incomplete)).toMatchObject({
      passed: false,
      missingCaseKeys: [gate.cases[0]!.caseKey],
    });

    const noCustomerCapability = gate.cases.map((item) => ({
      caseKey: item.caseKey,
      passed: true,
      actualCapabilityKeys: item.expectedCapabilityKeys.filter((key) => key !== 'customer_facts'),
    }));
    expect(evaluateBrainReleaseEvalGate(gate.manifest, noCustomerCapability)).toMatchObject({
      passed: false,
      missingCapabilityKeys: ['customer_facts'],
    });
  });

  it('passes only when every required case and capability is covered', () => {
    const gate = buildBrainReleaseEvalGate(snapshot);
    const results = gate.cases.map((item) => ({
      caseKey: item.caseKey,
      passed: true,
      actualCapabilityKeys: item.expectedCapabilityKeys,
    }));

    expect(evaluateBrainReleaseEvalGate(gate.manifest, results)).toEqual({
      passed: true,
      missingCaseKeys: [],
      failedCaseKeys: [],
      providerUnavailableCaseKeys: [],
      missingCapabilityKeys: [],
      providerUnavailableCapabilityKeys: [],
    });
  });

  it('adds seven SQL boundary cases when revenue analysis is in the frozen release', () => {
    const revenueSnapshot = {
      ...snapshot,
      capabilityKeys: [...snapshot.capabilityKeys, 'order_revenue_analysis'],
      capabilityCandidates: [
        ...snapshot.capabilityCandidates,
        {
          key: 'order_revenue_analysis',
          version: 1,
          domains: ['payment'],
          allowedRoles: ['store_manager'],
          requiredPermissions: ['core:finance:view'],
          examples: ['查询今天实收', '分析本月营业额'],
        },
      ],
    } as unknown as BrainEvaluationReleaseSnapshot;

    const gate = buildBrainReleaseEvalGate(revenueSnapshot);
    const timeCases = gate.cases.filter((item) => item.assertionType === 'release_time_boundary');

    expect(timeCases).toHaveLength(7);
    expect(timeCases.map((item) => item.caseKey)).toEqual(expect.arrayContaining([
      'release_time:21:today',
      'release_time:21:tomorrow',
      'release_time:21:yesterday',
      'release_time:21:this_week',
      'release_time:21:last_week',
      'release_time:21:this_month',
      'release_time:21:last_month',
    ]));
    expect(timeCases.every((item) => item.expectedCapabilityKeys[0] === 'order_revenue_analysis')).toBe(true);
  });

  it('requires preview safety but not fake grounding for side-effect capability examples', () => {
    const actionSnapshot = {
      ...snapshot,
      capabilityKeys: ['reservation_action_preview'],
      capabilityCandidates: [{
        key: 'reservation_action_preview',
        version: 1,
        domains: ['reservation'],
        allowedRoles: ['receptionist'],
        requiredPermissions: ['core:store:reservations'],
        sideEffect: true,
        examples: ['为张女士生成预约预览', '为指定客户生成预约预览'],
      }],
    } as unknown as BrainEvaluationReleaseSnapshot;

    const cases = buildBrainReleaseEvalGate(actionSnapshot).cases.filter(
      (item) => item.assertionType === 'release_capability',
    );

    expect(cases).toHaveLength(2);
    expect(cases.every((item) => item.expected.requiresGrounding === false)).toBe(true);
    expect(cases.every((item) => item.expected.requiresComplete === false)).toBe(true);
    expect(cases.every((item) => item.expected.allowSafeClarification === true)).toBe(true);
    expect(cases.every((item) => (item.expected.planShape as { requiresPreview?: boolean }).requiresPreview)).toBe(true);
  });

  it('fails closed while separating provider outages from product failures', () => {
    const gate = buildBrainReleaseEvalGate(snapshot);
    const unavailableCase = gate.cases.find((item) => item.expectedCapabilityKeys.includes('customer_facts'))!;
    const results = gate.cases.map((item) => ({
      caseKey: item.caseKey,
      passed: item.caseKey !== unavailableCase.caseKey,
      actualCapabilityKeys: item.caseKey === unavailableCase.caseKey ? [] : item.expectedCapabilityKeys,
      expectedCapabilityKeys: item.expectedCapabilityKeys,
      providerUnavailable: item.caseKey === unavailableCase.caseKey,
    }));

    expect(evaluateBrainReleaseEvalGate(gate.manifest, results)).toMatchObject({
      passed: false,
      failedCaseKeys: [],
      providerUnavailableCaseKeys: [unavailableCase.caseKey],
      missingCapabilityKeys: [],
      providerUnavailableCapabilityKeys: ['customer_facts'],
    });
  });

  it('treats an explicit rules baseline as a security-only release gate', () => {
    const rulesSnapshot = {
      ...snapshot,
      declaredMode: 'rules',
      mode: 'rules',
    } as BrainEvaluationReleaseSnapshot;

    const gate = buildBrainReleaseEvalGate(rulesSnapshot);

    expect(gate.manifest).toMatchObject({
      requiredCapabilityKeys: [],
      coverageComplete: true,
    });
    expect(gate.cases).toHaveLength(4);
    expect(gate.cases.every((item) => item.assertionType === 'release_security')).toBe(true);
  });
});
