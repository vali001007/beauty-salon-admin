import { afterEach, describe, expect, it, vi } from 'vitest';

describe('brain governance navigation rollout', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('uses overview as the default entry and maps old routes when V2 manage is enabled', async () => {
    vi.stubEnv('VITE_BRAIN_GOVERNANCE_UI_V2', 'manage');
    vi.resetModules();
    const navigation = await import('./brainGovernanceNavigation');

    expect(navigation.DEFAULT_BRAIN_GOVERNANCE_PATH).toBe('/brain-governance/overview');
    expect(navigation.resolveBrainGovernanceSection('/brain-governance/skills')).toBe('capabilities');
    expect(navigation.resolveBrainGovernanceSection('/brain-governance/release')).toBe('runtime-releases');
    expect(navigation.BRAIN_GOVERNANCE_ROUTE_SECTIONS.map((item) => item.path)).toEqual(expect.arrayContaining([
      '/brain-governance/overview',
      '/brain-governance/capabilities',
      '/brain-governance/tasks',
      '/brain-governance/policy-snapshots',
      '/brain-governance/skills',
      '/brain-governance/release',
    ]));
  });

  it('keeps the legacy default and old page mapping when V2 is disabled', async () => {
    vi.stubEnv('VITE_BRAIN_GOVERNANCE_UI_V2', 'off');
    vi.resetModules();
    const navigation = await import('./brainGovernanceNavigation');

    expect(navigation.DEFAULT_BRAIN_GOVERNANCE_PATH).toBe('/brain-governance/planning');
    expect(navigation.resolveBrainGovernanceSection('/brain-governance/skills')).toBe('skills');
    expect(navigation.resolveBrainGovernanceSection('/brain-governance/release')).toBe('release');
  });

  it('maps shadow to read-only V2 and uses manage as the final rollout default', async () => {
    vi.stubEnv('VITE_BRAIN_GOVERNANCE_UI_V2', 'shadow');
    vi.resetModules();
    const navigation = await import('./brainGovernanceNavigation');

    expect(navigation.BRAIN_GOVERNANCE_UI_MODE).toBe('shadow');
    expect(navigation.DEFAULT_BRAIN_GOVERNANCE_PATH).toBe('/brain-governance/overview');
    expect(navigation.resolveBrainGovernanceUiMode(undefined)).toBe('manage');
    expect(navigation.resolveBrainGovernanceUiMode('unexpected')).toBe('manage');
    expect(navigation.resolveBrainGovernanceUiMode('legacy')).toBe('legacy');
  });
});
