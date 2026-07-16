import { Injectable } from '@nestjs/common';
import { equivalentKey, layerGrade, record, type BrainEvalExpectation, type BrainEvalLayerGrade } from './brain-intent-grader.service.js';

@Injectable()
export class BrainPlanGraderService {
  grade(input: { expected: BrainEvalExpectation; actualPlan: unknown }): BrainEvalLayerGrade {
    const expected = input.expected.planShape;
    if (!expected) return layerGrade('plan', []);
    const plan = record(input.actualPlan);
    const nodes = Array.isArray(plan.nodes) ? plan.nodes.map(record) : [];
    const checks: Array<{ ok: boolean; failure: string }> = [];
    if (expected.minNodes !== undefined) checks.push({ ok: nodes.length >= expected.minNodes, failure: `plan_nodes_below:${expected.minNodes}` });
    if (expected.maxNodes !== undefined) checks.push({ ok: nodes.length <= expected.maxNodes, failure: `plan_nodes_above:${expected.maxNodes}` });
    if (expected.requiresPreview) checks.push({ ok: nodes.some((node) => node.previewOnly === true), failure: 'plan_preview_missing' });
    for (const capability of expected.requiredCapabilityKeys ?? []) {
      checks.push({
        ok: nodes.some((node) => typeof node.capabilityKey === 'string' && equivalentKey(node.capabilityKey, capability)),
        failure: `plan_capability_missing:${capability}`,
      });
    }
    checks.push({
      ok: nodes.every((node) => node.sideEffect !== true || node.previewOnly === true),
      failure: 'plan_side_effect_not_preview',
    });
    return layerGrade('plan', checks);
  }
}
