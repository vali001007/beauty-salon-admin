export type AskDataGoldRoutePlanContract = {
  expectedMetricKeys?: string[];
  acceptableViews?: string[];
  requiredViews?: string[];
};

export type AskDataGoldRoutePlanActual = {
  semanticMetricKeys?: string[];
  candidateViews?: string[];
  planMetricKeys?: string[];
  planRequiredViews?: string[];
};

export type AskDataGoldRoutePlanMatch = {
  valid: boolean;
  reasonCodes: string[];
};

/**
 * Gold 路由合同采用“必需项全覆盖、非允许项零扩张”的精确判定。
 * 这能避免必需视图已命中时，多余指标或多余视图仍被误判为通过。
 */
export function validateAskDataGoldRoutePlanMatch(
  contract: AskDataGoldRoutePlanContract,
  actual: AskDataGoldRoutePlanActual,
): AskDataGoldRoutePlanMatch {
  const expectedMetricKeys = unique(contract.expectedMetricKeys ?? []);
  const acceptableViews = unique(contract.acceptableViews ?? []);
  const requiredViews = unique(contract.requiredViews ?? []);
  const semanticMetricKeys = unique(actual.semanticMetricKeys ?? []);
  const candidateViews = unique(actual.candidateViews ?? []);
  const planMetricKeys = unique(actual.planMetricKeys ?? []);
  const planRequiredViews = unique(actual.planRequiredViews ?? []);
  const reasonCodes: string[] = [];

  addSetContractReasons(reasonCodes, 'semantic_metric', expectedMetricKeys, semanticMetricKeys);
  addViewContractReasons(reasonCodes, 'candidate_view', requiredViews, acceptableViews, candidateViews);
  addSetContractReasons(reasonCodes, 'plan_metric', expectedMetricKeys, planMetricKeys);
  addViewContractReasons(reasonCodes, 'plan_view', requiredViews, acceptableViews, planRequiredViews);

  return { valid: reasonCodes.length === 0, reasonCodes };
}

function addSetContractReasons(
  reasons: string[],
  prefix: string,
  required: string[],
  actual: string[],
) {
  // 复合指标可由首个治理指标封装其余子指标，因此首指标命中即可；
  // 但任何合同外指标都会扩大 SQL 视图范围，必须拒绝。
  if (required[0] && !actual.includes(required[0])) reasons.push(`gold_${prefix}_missing`);
  if (actual.some((value) => !required.includes(value))) reasons.push(`gold_${prefix}_unexpected`);
}

function addViewContractReasons(
  reasons: string[],
  prefix: string,
  required: string[],
  acceptable: string[],
  actual: string[],
) {
  if (required.some((value) => !actual.includes(value))) reasons.push(`gold_${prefix}_missing`);
  if (actual.some((value) => !acceptable.includes(value))) reasons.push(`gold_${prefix}_unexpected`);
}

function unique(values: string[]) {
  return [...new Set(values)];
}
