import type { BrainEvaluationReleaseSnapshot } from '../governance/brain-evaluation-release-snapshot.js';
import { BRAIN_ADVERSARIAL_EVAL_CASES } from './brain-adversarial-eval-cases.js';

export interface BrainReleaseEvalGateCase {
  caseKey: string;
  roleKey: string;
  question: string;
  expected: Record<string, unknown>;
  expectedCapabilityKeys: string[];
  assertionType: 'release_capability' | 'release_security' | 'release_time_boundary' | 'release_regression' | 'release_false_success';
  securityExpectation?: string;
  contextOverride?: {
    permissions?: string[];
    roleHint?: string;
    forceCrossStore?: boolean;
  };
}

export interface BrainReleaseEvalGateManifest {
  mode: 'release_gate';
  releaseId: number;
  releaseFingerprint: string;
  requiredCapabilityKeys: string[];
  requiredRoleKeys: string[];
  requiredCaseKeys: string[];
  coverageComplete: boolean;
}

export interface BrainReleaseEvalGateResult {
  passed: boolean;
  missingCaseKeys: string[];
  failedCaseKeys: string[];
  providerUnavailableCaseKeys: string[];
  missingCapabilityKeys: string[];
  providerUnavailableCapabilityKeys: string[];
}

const REQUIRED_SECURITY_CASE_IDS = [
  'adv_permission_finance_role_hint',
  'adv_cross_store_ask_data',
  'adv_action_fake_confirm',
  'adv_prompt_injection_english',
] as const;

const REQUIRED_TIME_BOUNDARY_CASES = [
  { preset: 'today', label: '今天' },
  { preset: 'tomorrow', label: '明天' },
  { preset: 'yesterday', label: '昨天' },
  { preset: 'this_week', label: '本周' },
  { preset: 'last_week', label: '上周' },
  { preset: 'this_month', label: '本月' },
  { preset: 'last_month', label: '上月' },
] as const;

const REQUIRED_PRODUCTION_REGRESSION_CASES = [
  { id: 'product_ranking_literal', capabilityKey: 'product_sales_ranking', roleKey: 'store_manager', question: '本月商品销售排行', intent: 'ranking', answerShape: 'ranking' },
  { id: 'product_ranking_paraphrase', capabilityKey: 'product_sales_ranking', roleKey: 'store_manager', question: '这个月哪些商品卖得最好', intent: 'ranking', answerShape: 'ranking' },
  { id: 'payment_breakdown_literal', capabilityKey: 'finance_payment_breakdown', roleKey: 'finance', question: '本月支付方式拆分', intent: 'query', answerShape: 'list' },
  { id: 'payment_breakdown_paraphrase', capabilityKey: 'finance_payment_breakdown', roleKey: 'finance', question: '这个月各种收款渠道分别收了多少', intent: 'query', answerShape: 'list' },
  { id: 'staff_ranking_literal', capabilityKey: 'staff_performance_ranking', roleKey: 'store_manager', question: '这个月谁的业绩最好', intent: 'ranking', answerShape: 'ranking' },
  { id: 'appointment_copy_not_metric', capabilityKey: 'marketing_message_draft', roleKey: 'marketing', question: '写一条提醒客户预约空档的消息', intent: 'draft', answerShape: 'draft' },
] as const;

export function buildBrainReleaseEvalGate(snapshot: BrainEvaluationReleaseSnapshot): {
  manifest: BrainReleaseEvalGateManifest;
  cases: BrainReleaseEvalGateCase[];
} {
  const cases: BrainReleaseEvalGateCase[] = [];
  const requiredRoleKeys = new Set<string>();
  const evaluatesCapabilities = snapshot.declaredMode !== 'rules';
  let coverageComplete = evaluatesCapabilities ? snapshot.capabilityKeys.length > 0 : true;

  for (const candidate of evaluatesCapabilities ? snapshot.capabilityCandidates : []) {
    const key = string(candidate.key);
    const examples = strings(candidate.examples).slice(0, 2);
    const roles = strings(candidate.allowedRoles);
    const requiredPermissions = strings(candidate.requiredPermissions);
    const sideEffect = candidate.sideEffect === true;
    const targetRoles = roles.length ? roles : ['store_manager'];
    if (!key || examples.length < 2) coverageComplete = false;
    for (const role of targetRoles) requiredRoleKeys.add(role);
    for (const [index, question] of examples.entries()) {
      const roleKey = targetRoles[index % targetRoles.length]!;
      cases.push({
        caseKey: `release_capability:${snapshot.releaseId}:${key || 'invalid'}:${index + 1}`,
        roleKey,
        question,
        expected: {
          capabilityKeys: key ? [key] : [],
          domains: [],
          requiresGrounding: !sideEffect,
          requiresComplete: !sideEffect,
          ...(sideEffect
            ? {
                allowSafeClarification: true,
                planShape: { requiresPreview: true },
              }
            : {}),
        },
        expectedCapabilityKeys: key ? [key] : [],
        assertionType: 'release_capability',
        contextOverride: { permissions: requiredPermissions },
      });
    }
  }

  const revenueCapabilityKey = snapshot.capabilityKeys.includes('finance_payment_breakdown')
    ? 'finance_payment_breakdown'
    : snapshot.capabilityKeys.includes('order_revenue_analysis')
      ? 'order_revenue_analysis'
      : undefined;
  if (evaluatesCapabilities && revenueCapabilityKey) {
    requiredRoleKeys.add('store_manager');
    for (const item of REQUIRED_TIME_BOUNDARY_CASES) {
      cases.push({
        caseKey: `release_time:${snapshot.releaseId}:${item.preset}`,
        roleKey: 'store_manager',
        question: `${item.label}实收多少`,
        expected: {
          capabilityKeys: [revenueCapabilityKey],
          timeBoundary: item,
          requiresGrounding: true,
          requiresComplete: true,
        },
        expectedCapabilityKeys: [revenueCapabilityKey],
        assertionType: 'release_time_boundary',
      });
    }
  }

  if (evaluatesCapabilities) {
    for (const item of REQUIRED_PRODUCTION_REGRESSION_CASES) {
      if (!snapshot.capabilityKeys.includes(item.capabilityKey)) {
        continue;
      }
      requiredRoleKeys.add(item.roleKey);
      cases.push({
        caseKey: `release_regression:${snapshot.releaseId}:${item.id}`,
        roleKey: item.roleKey,
        question: item.question,
        expected: {
          capabilityKeys: [item.capabilityKey],
          intent: item.intent,
          answerShape: item.answerShape,
          requiresGrounding: item.intent !== 'draft',
          requiresComplete: true,
        },
        expectedCapabilityKeys: [item.capabilityKey],
        assertionType: 'release_regression',
      });
    }
    cases.push({
      caseKey: `release_false_success:${snapshot.releaseId}:unsupported_supplier_score`,
      roleKey: 'inventory',
      question: '供应商性价比最高的是哪家',
      expected: {
        brainStatuses: ['failed'],
        requiresGrounding: false,
        requiresComplete: false,
      },
      expectedCapabilityKeys: [],
      assertionType: 'release_false_success',
    });
  }

  const adversarialById = new Map(BRAIN_ADVERSARIAL_EVAL_CASES.map((item) => [item.id, item]));
  for (const id of REQUIRED_SECURITY_CASE_IDS) {
    const source = adversarialById.get(id);
    if (!source) {
      coverageComplete = false;
      continue;
    }
    const roleKey = 'roleHint' in source && source.roleHint ? source.roleHint : 'store_manager';
    requiredRoleKeys.add(roleKey);
    cases.push({
      caseKey: `release_security:${source.id}`,
      roleKey,
      question: 'message' in source ? source.message : '',
      expected: { securityExpectation: source.expected },
      expectedCapabilityKeys: [],
      assertionType: 'release_security',
      securityExpectation: source.expected,
      contextOverride: {
        ...('permissions' in source ? { permissions: [...source.permissions] } : {}),
        ...('roleHint' in source && source.roleHint ? { roleHint: source.roleHint } : {}),
        ...(source.id === 'adv_cross_store_ask_data' ? { forceCrossStore: true } : {}),
      },
    });
  }

  const requiredCapabilityKeys = evaluatesCapabilities ? [...new Set(snapshot.capabilityKeys)].sort() : [];
  const requiredCaseKeys = cases.map((item) => item.caseKey).sort();
  if (!requiredCapabilityKeys.every((key) => cases.some((item) => item.expectedCapabilityKeys.includes(key)))) {
    coverageComplete = false;
  }

  return {
    manifest: {
      mode: 'release_gate',
      releaseId: snapshot.releaseId,
      releaseFingerprint: snapshot.releaseFingerprint,
      requiredCapabilityKeys,
      requiredRoleKeys: [...requiredRoleKeys].sort(),
      requiredCaseKeys,
      coverageComplete,
    },
    cases: cases.sort((left, right) => left.caseKey.localeCompare(right.caseKey)),
  };
}

export function evaluateBrainReleaseEvalGate(
  manifest: BrainReleaseEvalGateManifest,
  results: Array<{
    caseKey: string;
    passed: boolean;
    actualCapabilityKeys: string[];
    expectedCapabilityKeys?: string[];
    providerUnavailable?: boolean;
  }>,
): BrainReleaseEvalGateResult {
  const resultByCase = new Map(results.map((result) => [result.caseKey, result]));
  const missingCaseKeys = manifest.requiredCaseKeys.filter((caseKey) => !resultByCase.has(caseKey));
  const providerUnavailableCaseKeys = manifest.requiredCaseKeys.filter(
    (caseKey) => resultByCase.get(caseKey)?.providerUnavailable === true,
  );
  const failedCaseKeys = manifest.requiredCaseKeys.filter((caseKey) => {
    const result = resultByCase.get(caseKey);
    return result?.passed === false && result.providerUnavailable !== true;
  });
  const providerUnavailableCapabilities = new Set(
    results
      .filter((result) => result.providerUnavailable === true)
      .flatMap((result) => result.expectedCapabilityKeys ?? []),
  );
  const selectedCapabilities = new Set(
    results
      .filter((result) => result.passed)
      .flatMap((result) => result.actualCapabilityKeys.length
        ? result.actualCapabilityKeys
        : (result.expectedCapabilityKeys ?? [])),
  );
  const missingCapabilityKeys = manifest.requiredCapabilityKeys.filter(
    (key) => !selectedCapabilities.has(key) && !providerUnavailableCapabilities.has(key),
  );
  const providerUnavailableCapabilityKeys = manifest.requiredCapabilityKeys.filter((key) =>
    providerUnavailableCapabilities.has(key),
  );
  return {
    passed:
      manifest.coverageComplete &&
      missingCaseKeys.length === 0 &&
      failedCaseKeys.length === 0 &&
      providerUnavailableCaseKeys.length === 0 &&
      missingCapabilityKeys.length === 0 &&
      providerUnavailableCapabilityKeys.length === 0,
    missingCaseKeys,
    failedCaseKeys,
    providerUnavailableCaseKeys,
    missingCapabilityKeys,
    providerUnavailableCapabilityKeys,
  };
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim())
    : [];
}

function string(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
