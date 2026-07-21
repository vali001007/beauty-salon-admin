import { Injectable } from '@nestjs/common';
import type {
  BrainCapabilityCandidate,
  BrainCapabilityDriftItem,
  BrainCapabilityDriftReport,
  BrainCapabilityDriftType,
  BrainCapabilityScanReport,
} from './brain-capability-scan.types.js';

@Injectable()
export class BrainCapabilityDriftService {
  compare(current: BrainCapabilityScanReport, baseline: BrainCapabilityScanReport): BrainCapabilityDriftReport {
    const currentByKey = new Map(current.capabilities.map((item) => [item.key, item]));
    const baselineByKey = new Map(baseline.capabilities.map((item) => [item.key, item]));
    const keys = [...new Set([...currentByKey.keys(), ...baselineByKey.keys()])].sort();
    const items: BrainCapabilityDriftItem[] = [];

    for (const key of keys) {
      const after = currentByKey.get(key);
      const before = baselineByKey.get(key);
      if (after?.status === 'blocked') {
        items.push(
          this.item(
            key,
            'blocked',
            before,
            after,
            after.issues.map((issue) => issue.code),
            true,
          ),
        );
        continue;
      }
      if (!before && after) {
        items.push(this.item(key, 'added', undefined, after, ['new_capability'], false));
        continue;
      }
      if (before && !after) {
        items.push(this.item(key, 'removed', before, undefined, ['source_anchor_removed'], before.enabled));
        continue;
      }
      if (!before || !after || before.sourceFingerprint === after.sourceFingerprint) continue;
      const reasons = this.changeReasons(before, after);
      items.push(
        this.item(key, before.enabled ? 'stale' : 'changed', before, after, reasons, this.isHighRisk(reasons)),
      );
    }

    return { items, summary: countTypes(items) };
  }

  evaluateStrict(report: BrainCapabilityDriftReport): { passed: boolean; failures: BrainCapabilityDriftItem[] } {
    const failures = report.items.filter(
      (item) =>
        item.type === 'blocked' ||
        item.type === 'added' ||
        item.highRisk ||
        (['removed', 'stale'] as BrainCapabilityDriftType[]).includes(item.type),
    );
    return { passed: failures.length === 0, failures };
  }

  private changeReasons(before: BrainCapabilityCandidate, after: BrainCapabilityCandidate): string[] {
    const reasons: string[] = [];
    if (!sameSet(before.requiredPermissions, after.requiredPermissions)) reasons.push('permission_narrowed_or_changed');
    if (before.readOnly && !after.readOnly) reasons.push('read_only_became_write');
    if (before.storeScope !== after.storeScope) reasons.push('store_scope_changed');
    if (before.requiresConfirmation && !after.requiresConfirmation) reasons.push('confirmation_removed');
    if (before.idempotency === 'required' && after.idempotency !== 'required') reasons.push('idempotency_removed');
    for (const [field, type] of Object.entries(after.inputContract)) {
      if (!(field in before.inputContract) && type.startsWith('required:'))
        reasons.push(`required_input_added:${field}`);
    }
    for (const [field, type] of Object.entries(before.outputContract)) {
      if (!(field in after.outputContract)) reasons.push(`output_removed:${field}`);
      else if (after.outputContract[field] !== type) reasons.push(`output_type_changed:${field}`);
    }
    if (reasons.length === 0) reasons.push('source_contract_changed');
    return reasons;
  }

  private isHighRisk(reasons: string[]): boolean {
    return reasons.some((reason) =>
      /permission_|read_only_became_write|store_scope_changed|required_input_added|output_removed|output_type_changed|confirmation_removed|idempotency_removed/.test(
        reason,
      ),
    );
  }

  private item(
    key: string,
    type: BrainCapabilityDriftType,
    before: BrainCapabilityCandidate | undefined,
    after: BrainCapabilityCandidate | undefined,
    reasons: string[],
    highRisk: boolean,
  ): BrainCapabilityDriftItem {
    return {
      key,
      type,
      highRisk,
      reasons: [...new Set(reasons)].sort(),
      beforeFingerprint: before?.sourceFingerprint,
      afterFingerprint: after?.sourceFingerprint,
    };
  }
}

function sameSet(left: string[], right: string[]): boolean {
  return left.length === right.length && [...left].sort().every((item, index) => item === [...right].sort()[index]);
}

function countTypes(items: BrainCapabilityDriftItem[]): Record<BrainCapabilityDriftType, number> {
  const summary: Record<BrainCapabilityDriftType, number> = { added: 0, changed: 0, removed: 0, stale: 0, blocked: 0 };
  for (const item of items) summary[item.type] += 1;
  return summary;
}
