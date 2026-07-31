import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertProductLoopRegistry,
  assertSupplementalQuestionRegistry,
  questionContractChecksum,
  resolveProductLoopEligibility,
} from './ami-brain-product-loop-registry.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..', '..');
const DATA_FACTS = JSON.parse(
  readFileSync(resolve(REPO_ROOT, 'docs/04-测试数据/Ami-Brain-全领域题集治理/ami-brain-product-loop-data-facts-v1.json'), 'utf8'),
);
const QUESTION_DATA_EVIDENCE_PATH =
  'packages/server-v2/scripts/fixtures/ami-brain-question-data-evidence.test.json';
const QUESTION_DATA_EVIDENCE_ANCHORS = {
  'BQ-test-supplemental-current': 'supplemental-current-staff-directory',
  'BQ-test-supplemental-stale': 'supplemental-stale-staff-directory',
  'BQ-test-supplemental-no-suite': 'supplemental-no-suite-staff-directory',
  'BQ-test-empty-data': 'supplemental-empty-time-off',
  'BQ-test-global-data': 'supplemental-global-level',
  'BQ-test-equipment-override': 'supplemental-equipment-override',
};

test('accepts a frozen baseline case only when its domain and expected-target contract has registered evidence', () => {
  const result = resolveProductLoopEligibility({
    id: 'BQ0001',
    domain: '员工域',
    question: '今天哪些美容师有排班', // ami-brain-unit-only
    expectedTarget: 'Beautician/Schedule 表',
    notes: '',
  }, { admission: 'frozen_baseline_v1' });
  assert.equal(result.status, 'current_release_test');
  assert.equal(result.evidence.managementEntry.status, 'present');
  assert.equal(result.evidence.backendApi.status, 'present');
  assert.equal(result.evidence.dataFacts.status, 'present');
});

test('holds a frozen question with an unanchored named campaign period for evidence review', () => {
  const result = resolveProductLoopEligibility({
    id: 'BQ1921',
    domain: '横切-多轮',
    question: '第1轮:先看今天流水 → 第2轮:跟双十一期间比呢',
    expectedTarget: '多轮上下文承接',
    notes: '沿用指标只换时间',
  }, { admission: 'frozen_baseline_v1' });
  assert.equal(result.status, 'evidence_review_required');
  assert.equal(result.featureKey, 'ambiguous_named_business_period');
  assert.deepEqual(result.missingComponents, ['data_facts']);
});

test('does not borrow a year from another comparison side or an earlier turn', () => {
  for (const item of [
    {
      id: 'BQ0107',
      domain: '客户域',
      question: '客单价今年和国庆期间比是涨是跌',
      expectedTarget: '客户画像分析',
      notes: '',
    },
    {
      id: 'BQ1951',
      domain: '横切-多轮',
      question: '第1轮:先看今年流水 → 第2轮:跟国庆期间比呢',
      expectedTarget: '多轮上下文承接',
      notes: '指代承接',
    },
  ]) {
    const result = resolveProductLoopEligibility(item, { admission: 'frozen_baseline_v1' });
    assert.equal(result.status, 'evidence_review_required');
    assert.equal(result.featureKey, 'ambiguous_named_business_period');
  }
});

test('accepts a named business period only when the period itself is bound', () => {
  for (const question of [
    '2025年双十一期间的实收流水',
    '国庆活动期间（2025年10月1日至10月7日）的实收流水',
  ]) {
    const result = resolveProductLoopEligibility({
      id: 'BQ-test-bound-period',
      domain: '交易域',
      question,
      expectedTarget: 'ProductOrder/PaymentRecord 表',
      notes: '',
    }, { admission: 'frozen_baseline_v1' });
    assert.equal(result.status, 'current_release_test');
  }
});

test('fails closed for an unregistered future feature even when its broad domain already exists', () => {
  const result = resolveProductLoopEligibility({
    id: 'BQ-test-review',
    domain: '员工域',
    question: '员工入职体检记录里有哪些异常',
    expectedTarget: 'EmployeeMedicalExam',
    notes: '',
  });
  assert.equal(result.status, 'evidence_review_required');
  assert.equal(result.featureKey, 'unmapped_case_contract');
});

test('fails closed for a future question that reuses a registered broad contract', () => {
  const result = resolveProductLoopEligibility({
    id: 'BQ-future-same-target',
    domain: '员工域',
    question: '员工入职体检记录里有哪些异常',
    expectedTarget: 'Beautician/Schedule 表',
    notes: '',
  });
  assert.equal(result.status, 'evidence_review_required');
  assert.equal(result.featureKey, 'staff_directory_schedule');
});

test('fails closed for a future question even when it matches a known missing-function rule', () => {
  const result = resolveProductLoopEligibility({
    id: 'BQ-test-next',
    domain: '员工域',
    question: '员工试用期考核结果是什么',
    expectedTarget: 'Beautician/Schedule 表',
    notes: '',
  });
  assert.equal(result.status, 'evidence_review_required');
  assert.equal(result.featureKey, 'staff_probation_and_conversion');
});

test('does not accept a bare reviewed boolean as evidence for a future question', () => {
  const item = {
    id: 'BQ-test-review-bypass',
    domain: '员工域',
    role: '店长',
    type: 'query',
    difficulty: 'medium',
    question: '员工入职体检记录里有哪些异常',
    expectedTarget: 'Beautician/Schedule 表',
    notes: '',
  };
  const result = resolveProductLoopEligibility(item, { reviewed: true });
  assert.equal(result.status, 'evidence_review_required');
});

test('keeps an unreviewed supplemental question in evidence review without blocking manifest governance', () => {
  const item = {
    id: 'BQ-test-unreviewed-registry',
    domain: '员工域',
    role: '店长',
    type: 'query_single',
    difficulty: 'easy',
    question: '今天门店有哪些在职美容师', // ami-brain-unit-only
    expectedTarget: 'Beautician/Schedule 表',
    notes: '',
  };
  const registry = supplementalRegistryWith(item);
  assert.doesNotThrow(() => assertSupplementalQuestionRegistry(registry, REPO_ROOT));
  const result = resolveProductLoopEligibility(item, { supplementalRegistry: registry });
  assert.equal(result.status, 'evidence_review_required');
  assert.equal(result.admission.questionChecksum, questionContractChecksum(item));
});

test('keeps an explicitly reviewed missing business function out of the current release', () => {
  const item = {
    id: 'BQ-test-next-reviewed',
    domain: '员工域',
    role: '店长',
    type: 'query',
    difficulty: 'medium',
    question: '员工试用期考核结果是什么',
    expectedTarget: 'Beautician/Schedule 表',
    notes: '',
  };
  const review = {
    questionChecksum: questionContractChecksum(item),
    status: 'next_iteration_feature',
    featureKey: 'staff_probation_and_conversion',
    reviewedBy: 'product-owner',
    reviewedAt: '2026-07-29T12:00:00.000Z',
    reason: '员工试用期目标、阶段评价和转正审批尚未形成业务闭环。',
    evidenceReview: { managementEntry: 'missing', backendApi: 'missing', dataFacts: 'missing' },
    decisionEvidence: {
      path: 'packages/server-v2/src/brain/capability/executors/brain-domain-service-capability.executor.ts',
      anchor: '当前后台没有员工试用期目标、阶段评价、带教记录或转正结论事实闭环',
    },
  };
  const supplementalRegistry = supplementalRegistryWith({ ...item, review });
  const result = resolveProductLoopEligibility(item, { supplementalRegistry });
  assert.equal(result.status, 'next_iteration_feature');
  assert.deepEqual(result.missingComponents, ['management_entry', 'backend_api', 'data_facts']);
  assert.equal(result.admission.questionChecksum, review.questionChecksum);
});

test('rejects a next-iteration review that contradicts an existing management and API contract', () => {
  const item = {
    id: 'BQ-test-next-existing-loop',
    domain: '员工域',
    role: '店长',
    type: 'query',
    difficulty: 'easy',
    question: '今天门店有哪些在职美容师', // ami-brain-unit-only
    expectedTarget: 'Beautician/Schedule 表',
    notes: '',
  };
  const review = {
    questionChecksum: questionContractChecksum(item),
    status: 'next_iteration_feature',
    featureKey: 'staff_directory_schedule',
    reviewedBy: 'product-owner',
    reviewedAt: '2026-07-29T12:00:00.000Z',
    reason: '错误地把现有员工目录能力标为下一轮功能。',
    evidenceReview: { managementEntry: 'missing', backendApi: 'missing', dataFacts: 'present' },
    decisionEvidence: {
      path: 'AGENTS.md',
      anchor: '所有用于判断 Ami Brain 产品或业务能力的自然语言测试题',
    },
  };
  const result = resolveProductLoopEligibility(item, {
    supplementalRegistry: supplementalRegistryWith({ ...item, review }),
  });
  assert.equal(result.status, 'evidence_review_required');
  assert.match(result.reason, /已证明管理入口和正式接口存在/);
});

test('rejects an unregistered missing feature key even when the review has a valid text anchor', () => {
  const item = {
    id: 'BQ-test-next-unregistered-feature',
    domain: '员工域',
    role: '店长',
    type: 'query',
    difficulty: 'medium',
    question: '员工入职体检记录里有哪些异常', // ami-brain-unit-only
    expectedTarget: 'Beautician/Schedule 表',
    notes: '',
  };
  const review = {
    questionChecksum: questionContractChecksum(item),
    status: 'next_iteration_feature',
    featureKey: 'staff_onboarding_medical_exam',
    reviewedBy: 'product-owner',
    reviewedAt: '2026-07-29T12:00:00.000Z',
    reason: '入职体检业务尚未建设。',
    evidenceReview: { managementEntry: 'missing', backendApi: 'missing', dataFacts: 'missing' },
    decisionEvidence: {
      path: 'AGENTS.md',
      anchor: '所有用于判断 Ami Brain 产品或业务能力的自然语言测试题',
    },
  };
  const result = resolveProductLoopEligibility(item, {
    supplementalRegistry: supplementalRegistryWith({ ...item, review }),
  });
  assert.equal(result.status, 'evidence_review_required');
  assert.match(result.reason, /未绑定题目对应的已登记功能合同/);
});

test('accepts a supplemental current-release question only with bound review and required data facts', () => {
  const item = {
    id: 'BQ-test-supplemental-current',
    domain: '员工域',
    role: '店长',
    type: 'query',
    difficulty: 'easy',
    question: '今天门店有哪些在职美容师', // ami-brain-unit-only
    expectedTarget: 'Beautician/Schedule 表',
    notes: '',
  };
  const review = {
    questionChecksum: questionContractChecksum(item),
    status: 'current_release_test',
    featureKey: 'staff_directory_schedule',
    reviewedBy: 'product-owner',
    reviewedAt: '2026-07-29T12:00:00.000Z',
    reason: '美容师管理入口、正式查询接口和门店美容师事实均已存在。',
    evidenceReview: { managementEntry: 'present', backendApi: 'present', dataFacts: 'present' },
    suiteAssignment: 'standard-regression',
    managementEvidence: questionManagementEvidence(item),
    backendApiEvidence: questionBackendApiEvidence(item),
    requiredDataModels: ['Beautician'],
    allowEmptyModels: [],
    acceptedGlobalModels: [],
    dataEvidence: questionDataEvidence(item, ['Beautician']),
  };
  const supplementalRegistry = supplementalRegistryWith({ ...item, review });
  const result = resolveProductLoopEligibility(item, { supplementalRegistry });
  assert.equal(result.status, 'current_release_test');
  assert.deepEqual(result.evidence.dataFacts.models, ['Beautician']);
  assert.doesNotThrow(() => assertSupplementalQuestionRegistry(supplementalRegistry, REPO_ROOT));
});

test('keeps a reviewed supplemental metric-definition question out of executable release gates', () => {
  const item = {
    id: 'BQ-test-metric-definition',
    domain: '员工域',
    role: '店长',
    type: 'analysis',
    difficulty: 'medium',
    question: '本月美容师人效怎么算才算达标', // ami-brain-unit-only
    expectedTarget: 'Beautician×ServiceTask×CommissionRecord',
    notes: '管理端和数据存在，但人效达标阈值待产品冻结。',
  };
  const review = {
    questionChecksum: questionContractChecksum(item),
    status: 'metric_definition_governance_required',
    featureKey: 'staff_service_performance',
    reviewedBy: 'product-owner',
    reviewedAt: '2026-08-01T12:00:00.000Z',
    reason: '员工人效页面、接口和基础数据存在，但达标阈值、统计周期和分母口径尚未冻结。',
    evidenceReview: { managementEntry: 'present', backendApi: 'present', dataFacts: 'present' },
    decisionEvidence: {
      path: 'packages/server-v2/scripts/ami-brain-product-loop-registry.test.mjs',
      anchor: 'keeps a reviewed supplemental metric-definition question out of executable release gates',
    },
  };
  const supplementalRegistry = supplementalRegistryWith({ ...item, review });
  const result = resolveProductLoopEligibility(item, { supplementalRegistry });
  assert.equal(result.status, 'metric_definition_governance_required');
  assert.deepEqual(result.missingComponents, []);
  assert.equal(result.evidence.metricDefinition.status, 'governance_required');
  assert.doesNotThrow(() => assertSupplementalQuestionRegistry(supplementalRegistry, REPO_ROOT));
});

test('rejects metric-definition governance when product-loop evidence is missing', () => {
  const item = {
    id: 'BQ-test-metric-definition-missing-loop',
    domain: '员工域',
    role: '店长',
    type: 'analysis',
    difficulty: 'medium',
    question: '本月美容师人效怎么算才算达标', // ami-brain-unit-only
    expectedTarget: 'Beautician×ServiceTask×CommissionRecord',
    notes: '错误地用口径治理掩盖真实数据缺失。',
  };
  const review = {
    questionChecksum: questionContractChecksum(item),
    status: 'metric_definition_governance_required',
    featureKey: 'staff_service_performance',
    reviewedBy: 'product-owner',
    reviewedAt: '2026-08-01T12:00:00.000Z',
    reason: '员工人效口径待定。',
    evidenceReview: { managementEntry: 'present', backendApi: 'present', dataFacts: 'missing' },
    decisionEvidence: {
      path: 'packages/server-v2/scripts/ami-brain-product-loop-registry.test.mjs',
      anchor: 'rejects metric-definition governance when product-loop evidence is missing',
    },
  };
  const result = resolveProductLoopEligibility(item, {
    supplementalRegistry: supplementalRegistryWith({ ...item, review }),
  });
  assert.equal(result.status, 'evidence_review_required');
  assert.match(result.reason, /三项均为 present/);
});

test('invalidates a supplemental review when the question wording changes', () => {
  const registered = {
    id: 'BQ-test-supplemental-stale',
    domain: '员工域',
    role: '店长',
    type: 'query',
    difficulty: 'easy',
    question: '今天门店有哪些在职美容师',
    expectedTarget: 'Beautician/Schedule 表',
    notes: '',
  };
  const review = {
    questionChecksum: questionContractChecksum(registered),
    status: 'current_release_test',
    featureKey: 'staff_directory_schedule',
    reviewedBy: 'product-owner',
    reviewedAt: '2026-07-29T12:00:00.000Z',
    reason: '已核对现有员工目录。',
    evidenceReview: { managementEntry: 'present', backendApi: 'present', dataFacts: 'present' },
    suiteAssignment: 'standard-regression',
    requiredDataModels: ['Beautician'],
    allowEmptyModels: [],
    acceptedGlobalModels: [],
    dataEvidence: questionDataEvidence(registered, ['Beautician']),
  };
  const result = resolveProductLoopEligibility(
    { ...registered, question: '员工入职体检记录里有哪些异常' },
    { supplementalRegistry: supplementalRegistryWith({ ...registered, review }) },
  );
  assert.equal(result.status, 'evidence_review_required');
});

test('fails closed when a current-release supplemental question has no executable suite assignment', () => {
  const item = {
    id: 'BQ-test-supplemental-no-suite',
    domain: '员工域',
    role: '店长',
    type: 'query_single',
    difficulty: 'easy',
    question: '今天门店有哪些在职美容师',
    expectedTarget: 'Beautician/Schedule 表',
    notes: '',
  };
  const review = currentReview(item);
  delete review.suiteAssignment;
  const result = resolveProductLoopEligibility(item, {
    supplementalRegistry: supplementalRegistryWith({ ...item, review }),
  });
  assert.equal(result.status, 'evidence_review_required');
  assert.match(result.reason, /必须明确指定/);
});

test('does not treat a queried but empty required model as real data without an explicit empty-state review', () => {
  const item = {
    id: 'BQ-test-empty-data',
    domain: '员工域',
    role: '店长',
    type: 'query',
    difficulty: 'easy',
    question: '今天有哪些员工请假',
    expectedTarget: 'Beautician/Schedule 表',
    notes: '',
  };
  const review = currentReview(item, {
    requiredDataModels: ['BeauticianTimeOff'],
  });
  const result = resolveProductLoopEligibility(item, {
    supplementalRegistry: supplementalRegistryWith({ ...item, review }),
  });
  assert.equal(result.status, 'evidence_review_required');
  assert.match(result.reason, /没有真实记录/);
});

test('requires an explicit rationale before global counts can support a supplemental question', () => {
  const item = {
    id: 'BQ-test-global-data',
    domain: '员工域',
    role: '店长',
    type: 'query',
    difficulty: 'easy',
    question: '美容师等级有哪些',
    expectedTarget: 'Beautician/Schedule 表',
    notes: '',
  };
  const review = currentReview(item, {
    requiredDataModels: ['BeauticianLevel'],
  });
  const result = resolveProductLoopEligibility(item, {
    supplementalRegistry: supplementalRegistryWith({ ...item, review }),
  });
  assert.equal(result.status, 'evidence_review_required');
  assert.match(result.reason, /只有全局计数/);
});

test('rejects a current-release review without question-level real-data evidence', () => {
  const item = {
    id: 'BQ-test-supplemental-current',
    domain: '员工域',
    role: '店长',
    type: 'query',
    difficulty: 'easy',
    question: '今天门店有哪些在职美容师',
    expectedTarget: 'Beautician/Schedule 表',
    notes: '',
  };
  const review = currentReview(item);
  delete review.dataEvidence;
  const result = resolveProductLoopEligibility(item, {
    supplementalRegistry: supplementalRegistryWith({ ...item, review }),
  });
  assert.equal(result.status, 'evidence_review_required');
  assert.match(result.reason, /题目级真实数据证据/);
});

test('rejects a current-release review without question-level management entry evidence', () => {
  const item = {
    id: 'BQ-test-supplemental-current',
    domain: '员工域',
    role: '店长',
    type: 'query',
    difficulty: 'easy',
    question: '今天门店有哪些在职美容师', // ami-brain-unit-only
    expectedTarget: 'Beautician/Schedule 表',
    notes: '',
  };
  const review = currentReview(item);
  delete review.managementEvidence;
  const result = resolveProductLoopEligibility(item, {
    supplementalRegistry: supplementalRegistryWith({ ...item, review }),
  });
  assert.equal(result.status, 'evidence_review_required');
  assert.match(result.reason, /题目级管理入口证据/);
});

test('rejects a create question that borrows a read-only backend API', () => {
  const item = {
    id: 'BQ-test-supplemental-current',
    domain: '员工域',
    role: '店长',
    type: 'action',
    difficulty: 'easy',
    question: '新建一个美容师档案', // ami-brain-unit-only
    expectedTarget: 'Beautician/Schedule 表',
    notes: '',
  };
  const review = currentReview(item, {
    managementEvidence: questionManagementEvidence(item, 'create'),
    backendApiEvidence: questionBackendApiEvidence(item, 'read'),
  });
  const result = resolveProductLoopEligibility(item, {
    supplementalRegistry: supplementalRegistryWith({ ...item, review }),
  });
  assert.equal(result.status, 'evidence_review_required');
  assert.match(result.reason, /业务操作 create.*题目级正式 API 证据/);
});

test('does not let a reviewed current-release question override a registered missing business function', () => {
  const item = {
    id: 'BQ-test-equipment-override',
    domain: '员工域',
    role: '店长',
    type: 'query',
    difficulty: 'medium',
    question: '设备维修记录有哪些',
    expectedTarget: 'Beautician/Schedule 表',
    notes: '',
  };
  const review = currentReview(item);
  const result = resolveProductLoopEligibility(item, {
    supplementalRegistry: supplementalRegistryWith({ ...item, review }),
  });
  assert.equal(result.status, 'evidence_review_required');
  assert.match(result.reason, /仍命中已登记的缺失业务功能 equipment_maintenance/);
});

test('does not let a supplemental question borrow an unrelated feature contract', () => {
  const item = {
    id: 'BQ-test-supplemental-current',
    domain: '财务域',
    role: '店长',
    type: 'query',
    difficulty: 'easy',
    question: '今天门店有哪些在职美容师',
    expectedTarget: 'DailySettlement/CommissionRecord/OperatingCost',
    notes: '',
  };
  const review = currentReview(item);
  const result = resolveProductLoopEligibility(item, {
    supplementalRegistry: supplementalRegistryWith({ ...item, review }),
  });
  assert.equal(result.status, 'evidence_review_required');
  assert.match(result.reason, /不能借用同领域其他功能/);
});

test('marks employee-attributed customer churn questions as next-iteration features', () => {
  const result = resolveProductLoopEligibility({
    id: 'BQ0355',
    domain: '员工域',
    question: '哪个美容师上个月客户流失偏多',
    expectedTarget: '员工风险巡检',
    notes: '',
  }, { admission: 'frozen_baseline_v1' });
  assert.equal(result.status, 'next_iteration_feature');
  assert.equal(result.featureKey, 'staff_customer_churn_attribution');
});

test('verifies registered pages, routes, APIs and Prisma models against the current repository', () => {
  assert.doesNotThrow(() => assertProductLoopRegistry(REPO_ROOT));
});

function supplementalRegistryWith(...cases) {
  return {
    schemaVersion: 'ami-brain-supplemental-question-registry/v1',
    cases,
  };
}

function currentReview(item, overrides = {}) {
  const requiredDataModels = overrides.requiredDataModels ?? ['Beautician'];
  return {
    questionChecksum: questionContractChecksum(item),
    status: 'current_release_test',
    featureKey: 'staff_directory_schedule',
    reviewedBy: 'product-owner',
    reviewedAt: '2026-07-29T12:00:00.000Z',
    reason: '已逐题核对员工管理入口、正式接口和所需业务事实。',
    evidenceReview: { managementEntry: 'present', backendApi: 'present', dataFacts: 'present' },
    suiteAssignment: 'standard-regression',
    managementEvidence: questionManagementEvidence(item),
    backendApiEvidence: questionBackendApiEvidence(item),
    requiredDataModels,
    allowEmptyModels: [],
    acceptedGlobalModels: [],
    dataEvidence: questionDataEvidence(item, requiredDataModels),
    ...overrides,
  };
}

function questionManagementEvidence(item, operation = 'read') {
  return {
    questionChecksum: questionContractChecksum(item),
    operation,
    entries: [
      {
        path: 'src/app/pages/BeauticianManagement.tsx',
        routePath: 'src/app/routes.tsx',
        routeAnchor: "path: 'stores/beauticians'",
        interactionAnchor: operation === 'create' ? '从系统用户添加美容师' : 'getBeauticians',
      },
    ],
  };
}

function questionBackendApiEvidence(item, operation = 'read') {
  const api = {
    read: { httpMethod: 'GET', route: 'beauticians', handlerAnchor: 'findAll(', permissionAnchor: "@Permissions('core:store:beauticians')" },
    create: { httpMethod: 'POST', route: 'beauticians', handlerAnchor: 'create(', permissionAnchor: "@Permissions('core:store:beauticians')" },
  }[operation];
  return {
    questionChecksum: questionContractChecksum(item),
    operation,
    entries: [
      {
        path: 'packages/server-v2/src/beauticians/beauticians.controller.ts',
        ...api,
      },
    ],
  };
}

function questionDataEvidence(item, requiredDataModels) {
  return {
    path: QUESTION_DATA_EVIDENCE_PATH,
    anchor: QUESTION_DATA_EVIDENCE_ANCHORS[item.id],
    questionChecksum: questionContractChecksum(item),
    auditSnapshotChecksum: DATA_FACTS.snapshotChecksum,
    storeId: DATA_FACTS.storeId,
    requiredDataModels,
  };
}
