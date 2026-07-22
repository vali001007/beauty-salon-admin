import { BrainDomainAdapterRegistryService } from './brain-domain-adapter-registry.service.js';
import type { BrainDomainAdapter, BrainDomainAdapterKey, BrainRoleIntentPlan } from './brain-domain-adapter.types.js';

describe('BrainDomainAdapterRegistryService', () => {
  const createAdapter = (key: BrainDomainAdapterKey): BrainDomainAdapter => ({
    key,
    role: 'store_manager',
    requiredPermissions: ['core:brain:use'],
    canHandle: (plan) => plan.adapterKey === key,
    execute: jest.fn(),
  });

  it('returns the adapter declared by the route plan', () => {
    const adapter = createAdapter('store_manager');
    const registry = new BrainDomainAdapterRegistryService([adapter]);
    const plan = { adapterKey: 'store_manager' } as BrainRoleIntentPlan;

    expect(registry.resolve(plan)).toBe(adapter);
  });

  it('rejects duplicate adapter keys at construction time', () => {
    expect(
      () => new BrainDomainAdapterRegistryService([createAdapter('front_desk'), createAdapter('front_desk')]),
    ).toThrow('Duplicate Ami Brain domain adapter key: front_desk');
  });

  it('can enable and disable adapters from published configuration', () => {
    const storeManager = createAdapter('store_manager');
    const finance = createAdapter('finance_risk');
    const registry = new BrainDomainAdapterRegistryService([storeManager, finance]);
    registry.configureEnabledAdapters(['finance_risk']);

    expect(registry.listEnabled()).toEqual([finance]);
    expect(registry.resolve({ adapterKey: 'store_manager' } as BrainRoleIntentPlan)).toBeUndefined();
    expect(registry.resolve({ adapterKey: 'finance_risk' } as BrainRoleIntentPlan)).toBe(finance);
  });
});
