import { afterEach, describe, expect, it, vi } from 'vitest';

describe('brain governance navigation retirement', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('uses the four-entry compact navigation and redirects legacy routes by default', async () => {
    vi.stubEnv('VITE_BRAIN_GOVERNANCE_UI_V2', 'manage');
    vi.stubEnv('VITE_BRAIN_GOVERNANCE_NAV_MODE', 'compact');
    vi.stubEnv('VITE_BRAIN_GOVERNANCE_LEGACY_ROUTE_MODE', 'redirect');
    const navigation = await import('./brainGovernanceNavigation');

    expect(navigation.DEFAULT_BRAIN_GOVERNANCE_PATH).toBe('/brain-governance/workbench?tab=overview');
    expect(navigation.BRAIN_GOVERNANCE_SECTIONS.map((item) => item.label)).toEqual(['治理工作台', '质量中心', '策略与发布']);
    expect(navigation.BRAIN_GOVERNANCE_ROUTE_SECTIONS.map((item) => item.path)).toEqual(expect.arrayContaining([
      '/brain-governance/workbench',
      '/brain-governance/quality',
      '/brain-governance/releases',
      '/brain-governance/settings',
      '/brain-governance/skills',
      '/brain-governance/planning',
    ]));
    expect(navigation.resolveBrainGovernanceRoute('/brain-governance/skills', '?search=预约')).toEqual({
      type: 'redirect',
      source: '/brain-governance/skills',
      to: '/brain-governance/workbench?tab=capabilities&panel=skills&search=%E9%A2%84%E7%BA%A6',
    });
    expect(navigation.resolveBrainGovernanceRoute('/brain-governance/planning')).toEqual({
      type: 'redirect',
      source: '/brain-governance/planning',
      to: '/brain?panel=trace',
    });
  });

  it('can restore the flat V2 menu without reopening direct legacy pages', async () => {
    vi.stubEnv('VITE_BRAIN_GOVERNANCE_UI_V2', 'manage');
    vi.stubEnv('VITE_BRAIN_GOVERNANCE_NAV_MODE', 'legacy');
    vi.stubEnv('VITE_BRAIN_GOVERNANCE_LEGACY_ROUTE_MODE', 'redirect');
    const navigation = await import('./brainGovernanceNavigation');

    expect(navigation.DEFAULT_BRAIN_GOVERNANCE_PATH).toBe('/brain-governance/overview');
    expect(navigation.BRAIN_GOVERNANCE_SECTIONS).toHaveLength(12);
    expect(navigation.resolveBrainGovernanceRoute('/brain-governance/overview')).toMatchObject({
      type: 'redirect',
      to: '/brain-governance/workbench?tab=overview',
    });
  });

  it('supports direct legacy rollback while release always uses the consolidated runtime page', async () => {
    vi.stubEnv('VITE_BRAIN_GOVERNANCE_UI_V2', 'manage');
    vi.stubEnv('VITE_BRAIN_GOVERNANCE_LEGACY_ROUTE_MODE', 'direct');
    const navigation = await import('./brainGovernanceNavigation');

    expect(navigation.resolveBrainGovernanceRoute('/brain-governance/skills')).toEqual({ type: 'render', section: 'skills', legacy: true });
    expect(navigation.resolveBrainGovernanceRoute('/brain-governance/planning')).toEqual({ type: 'render', section: 'planning', legacy: true });
    expect(navigation.resolveBrainGovernanceRoute('/brain-governance/release')).toEqual({
      type: 'redirect',
      source: '/brain-governance/release',
      to: '/brain-governance/releases?tab=runtime',
    });
  });

  it('keeps the full historical UI rollback when UI V2 is explicitly disabled', async () => {
    vi.stubEnv('VITE_BRAIN_GOVERNANCE_UI_V2', 'off');
    vi.stubEnv('VITE_BRAIN_GOVERNANCE_NAV_MODE', 'compact');
    vi.stubEnv('VITE_BRAIN_GOVERNANCE_LEGACY_ROUTE_MODE', 'redirect');
    const navigation = await import('./brainGovernanceNavigation');

    expect(navigation.BRAIN_GOVERNANCE_UI_MODE).toBe('legacy');
    expect(navigation.BRAIN_GOVERNANCE_NAV_MODE).toBe('legacy');
    expect(navigation.BRAIN_GOVERNANCE_LEGACY_ROUTE_MODE).toBe('direct');
    expect(navigation.DEFAULT_BRAIN_GOVERNANCE_PATH).toBe('/brain-governance/planning');
    expect(navigation.resolveBrainGovernanceRoute('/brain-governance/skills')).toEqual({ type: 'render', section: 'skills', legacy: true });
  });

  it('keeps shadow read-only and fails closed for missing or unknown UI mode values', async () => {
    vi.stubEnv('VITE_BRAIN_GOVERNANCE_UI_V2', 'shadow');
    const navigation = await import('./brainGovernanceNavigation');

    expect(navigation.BRAIN_GOVERNANCE_UI_MODE).toBe('shadow');
    expect(navigation.resolveBrainGovernanceUiMode(undefined)).toBe('shadow');
    expect(navigation.resolveBrainGovernanceUiMode('unexpected')).toBe('shadow');
    expect(navigation.resolveBrainGovernanceUiModeSource(undefined)).toBe('default_missing');
    expect(navigation.resolveBrainGovernanceUiModeSource('unexpected')).toBe('default_invalid');
    expect(navigation.resolveBrainGovernanceUiModeSource('shadow')).toBe('explicit');
    expect(navigation.resolveBrainGovernanceNavMode('unexpected')).toBe('compact');
    expect(navigation.resolveBrainGovernanceLegacyRouteMode('unexpected')).toBe('redirect');
  });

  it('covers every legacy URL with a non-cyclic redirect while preserving unknown query parameters', async () => {
    vi.stubEnv('VITE_BRAIN_GOVERNANCE_UI_V2', 'manage');
    vi.stubEnv('VITE_BRAIN_GOVERNANCE_LEGACY_ROUTE_MODE', 'redirect');
    const navigation = await import('./brainGovernanceNavigation');
    const legacyRoutes = [
      '/brain-governance/overview',
      '/brain-governance/capabilities',
      '/brain-governance/tasks',
      '/brain-governance/inspection',
      '/brain-governance/semantic',
      '/brain-governance/eval',
      '/brain-governance/feedback',
      '/brain-governance/policy-snapshots',
      '/brain-governance/runtime-releases',
      '/brain-governance/release',
      '/brain-governance/roles',
      '/brain-governance/memory',
      '/brain-governance/skills',
      '/brain-governance/planning',
    ];

    expect(legacyRoutes).toHaveLength(14);
    for (const source of legacyRoutes) {
      const target = navigation.legacyGovernanceTarget(source);
      expect(target, source).toBeTruthy();
      const resolution = navigation.resolveBrainGovernanceRoute(source, '?futureFilter=kept&selectedId=42');
      expect(resolution.type, source).toBe('redirect');
      if (resolution.type !== 'redirect') continue;
      expect(new URL(resolution.to, 'https://ami.local').pathname, source).not.toBe(source);
      expect(resolution.to, source).toContain('futureFilter=kept');
      expect(resolution.to, source).toContain('selectedId=42');
    }
  });

  it('keeps all legacy URLs available in direct rollback mode except the consolidated release alias', async () => {
    vi.stubEnv('VITE_BRAIN_GOVERNANCE_UI_V2', 'manage');
    const navigation = await import('./brainGovernanceNavigation');
    const directRoutes = [
      '/brain-governance/overview',
      '/brain-governance/capabilities',
      '/brain-governance/tasks',
      '/brain-governance/inspection',
      '/brain-governance/semantic',
      '/brain-governance/eval',
      '/brain-governance/feedback',
      '/brain-governance/policy-snapshots',
      '/brain-governance/runtime-releases',
      '/brain-governance/roles',
      '/brain-governance/memory',
      '/brain-governance/skills',
      '/brain-governance/planning',
    ];

    for (const source of directRoutes) {
      expect(navigation.resolveBrainGovernanceRoute(source, '', 'direct').type, source).toBe('render');
    }
    expect(navigation.resolveBrainGovernanceRoute('/brain-governance/release', '', 'direct').type).toBe('redirect');
  });
});
