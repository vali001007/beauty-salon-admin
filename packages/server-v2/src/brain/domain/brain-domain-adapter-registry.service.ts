import { Inject, Injectable, Optional } from '@nestjs/common';
import type { BrainDomainAdapter, BrainRoleIntentPlan } from './brain-domain-adapter.types.js';

export const BRAIN_DOMAIN_ADAPTERS = Symbol('BRAIN_DOMAIN_ADAPTERS');

@Injectable()
export class BrainDomainAdapterRegistryService {
  private readonly adapters: BrainDomainAdapter[];
  private enabledKeys?: Set<string>;

  constructor(@Optional() @Inject(BRAIN_DOMAIN_ADAPTERS) adapters: BrainDomainAdapter[] = []) {
    const seen = new Set<string>();
    for (const adapter of adapters) {
      if (seen.has(adapter.key)) {
        throw new Error(`Duplicate Ami Brain domain adapter key: ${adapter.key}`);
      }
      seen.add(adapter.key);
    }
    this.adapters = adapters;
  }

  list() {
    return [...this.adapters];
  }

  configureEnabledAdapters(adapterKeys: string[]) {
    const available = new Set<string>(this.adapters.map((adapter) => adapter.key));
    const unknown = adapterKeys.filter((key) => !available.has(key));
    if (unknown.length) throw new Error(`Unknown Ami Brain domain adapter keys: ${unknown.join(',')}`);
    this.enabledKeys = new Set(adapterKeys);
  }

  listEnabled() {
    return this.adapters.filter((adapter) => !this.enabledKeys || this.enabledKeys.has(adapter.key));
  }

  resolve(plan: BrainRoleIntentPlan) {
    if (!plan.adapterKey) return undefined;
    if (this.enabledKeys && !this.enabledKeys.has(plan.adapterKey)) return undefined;
    return this.adapters.find((adapter) => adapter.canHandle(plan));
  }
}
