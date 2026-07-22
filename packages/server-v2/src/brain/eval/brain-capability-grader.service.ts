import { Injectable } from '@nestjs/common';
import { equivalentKey, layerGrade, type BrainEvalExpectation, type BrainEvalLayerGrade } from './brain-intent-grader.service.js';

@Injectable()
export class BrainCapabilityGraderService {
  grade(input: { expected: BrainEvalExpectation; actualCapabilityKeys: string[] }): BrainEvalLayerGrade {
    const checks = (input.expected.capabilityKeys ?? []).map((expected) => ({
      ok: input.actualCapabilityKeys.some((actual) => this.matches(actual, expected)),
      failure: `capability_missing:${expected}`,
    }));
    if (input.expected.capabilityAnyOf?.length) {
      checks.push({
        ok: input.expected.capabilityAnyOf.some((expected) =>
          input.actualCapabilityKeys.some((actual) => this.matches(actual, expected)),
        ),
        failure: `capability_any_of_missing:${input.expected.capabilityAnyOf.join('|')}`,
      });
    }
    return layerGrade('capability', checks);
  }

  private matches(actual: string, expected: string) {
    const families: Record<string, string[]> = {
      'store.operations.overview': ['store_manager', 'manager', 'revenue', 'dashboard'],
      'marketing.growth.execution': ['marketing', 'customer_follow_up', 'campaign'],
      'reception.service.workflow': ['front_desk', 'reservation', 'reception'],
      'service.quality.record': ['beautician', 'service_record', 'service_task'],
      'inventory.supply.risk': ['inventory', 'stock', 'purchase'],
      'finance.profit.risk': ['finance', 'profit', 'margin', 'refund', 'revenue'],
    };
    return equivalentKey(actual, expected) || (families[expected] ?? []).some((family) => equivalentKey(actual, family));
  }
}
