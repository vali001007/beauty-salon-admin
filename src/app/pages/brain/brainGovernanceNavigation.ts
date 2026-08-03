export type BrainGovernanceUiMode = 'legacy' | 'shadow' | 'manage';
export type BrainGovernanceUiModeSource = 'explicit' | 'default_missing' | 'default_invalid';
export type BrainGovernanceNavMode = 'legacy' | 'compact';
export type BrainGovernanceLegacyRouteMode = 'direct' | 'redirect';

const LEGACY_SECTIONS = [
  { key: 'planning', label: '模型规划', path: '/brain-governance/planning' },
  { key: 'semantic', label: '语义治理', path: '/brain-governance/semantic' },
  { key: 'roles', label: '角色治理', path: '/brain-governance/roles' },
  { key: 'skills', label: '技能治理', path: '/brain-governance/skills' },
  { key: 'memory', label: '记忆治理', path: '/brain-governance/memory' },
  { key: 'inspection', label: '巡检治理', path: '/brain-governance/inspection' },
  { key: 'eval', label: '评测中心', path: '/brain-governance/eval' },
  { key: 'release', label: '运行版本（旧）', path: '/brain-governance/release' },
  { key: 'feedback', label: '反馈指标', path: '/brain-governance/feedback' },
] as const;

const V2_SECTIONS = [
  { key: 'overview', label: '治理总览', path: '/brain-governance/overview' },
  { key: 'capabilities', label: '能力治理', path: '/brain-governance/capabilities' },
  { key: 'semantic', label: '语义治理', path: '/brain-governance/semantic' },
  { key: 'tasks', label: '治理任务', path: '/brain-governance/tasks' },
  { key: 'policy-snapshots', label: '治理策略（GP）', path: '/brain-governance/policy-snapshots' },
  { key: 'roles', label: '角色治理', path: '/brain-governance/roles' },
  { key: 'eval', label: '评测中心', path: '/brain-governance/eval' },
  { key: 'runtime-releases', label: '运行版本（RT）', path: '/brain-governance/runtime-releases' },
  { key: 'planning', label: '高级·模型规划', path: '/brain-governance/planning' },
  { key: 'memory', label: '高级·记忆', path: '/brain-governance/memory' },
  { key: 'inspection', label: '高级·巡检', path: '/brain-governance/inspection' },
  { key: 'feedback', label: '高级·反馈', path: '/brain-governance/feedback' },
] as const;

const COMPACT_SECTIONS = [
  { key: 'workbench', label: '治理工作台', path: '/brain-governance/workbench?tab=overview' },
  { key: 'quality', label: '质量中心', path: '/brain-governance/quality?tab=semantic' },
  { key: 'releases', label: '治理策略与运行版本', path: '/brain-governance/releases?tab=policy' },
] as const;

const COMPACT_ROUTE_SECTIONS = [
  { key: 'workbench', path: '/brain-governance/workbench' },
  { key: 'quality', path: '/brain-governance/quality' },
  { key: 'releases', path: '/brain-governance/releases' },
  { key: 'settings', path: '/brain-governance/settings' },
] as const;

const DIRECT_ROUTE_SECTIONS = [...V2_SECTIONS, ...LEGACY_SECTIONS.filter(
  (legacy) => !V2_SECTIONS.some((section) => section.path === legacy.path),
)] as const;

const LEGACY_REDIRECTS: Record<string, string> = {
  '/brain-governance/overview': '/brain-governance/workbench?tab=overview',
  '/brain-governance/capabilities': '/brain-governance/workbench?tab=capabilities',
  '/brain-governance/tasks': '/brain-governance/workbench?tab=tasks',
  '/brain-governance/inspection': '/brain-governance/workbench?tab=inspection',
  '/brain-governance/semantic': '/brain-governance/quality?tab=semantic',
  '/brain-governance/eval': '/brain-governance/quality?tab=eval',
  '/brain-governance/feedback': '/brain-governance/quality?tab=feedback',
  '/brain-governance/policy-snapshots': '/brain-governance/releases?tab=policy',
  '/brain-governance/runtime-releases': '/brain-governance/releases?tab=runtime',
  '/brain-governance/release': '/brain-governance/releases?tab=runtime',
  '/brain-governance/roles': '/brain-governance/settings?tab=roles',
  '/brain-governance/memory': '/brain-governance/settings?tab=memory',
  '/brain-governance/skills': '/brain-governance/workbench?tab=capabilities&panel=skills',
  '/brain-governance/planning': '/brain?panel=trace',
};

export type BrainGovernanceSectionKey =
  | (typeof COMPACT_ROUTE_SECTIONS)[number]['key']
  | (typeof DIRECT_ROUTE_SECTIONS)[number]['key'];

export type BrainGovernanceRouteResolution =
  | { type: 'render'; section: BrainGovernanceSectionKey; legacy: boolean }
  | { type: 'redirect'; to: string; source: string };

export const BRAIN_GOVERNANCE_UI_MODE = resolveBrainGovernanceUiMode(import.meta.env.VITE_BRAIN_GOVERNANCE_UI_V2);
export const BRAIN_GOVERNANCE_UI_MODE_SOURCE = resolveBrainGovernanceUiModeSource(import.meta.env.VITE_BRAIN_GOVERNANCE_UI_V2);
export const BRAIN_GOVERNANCE_NAV_MODE = BRAIN_GOVERNANCE_UI_MODE === 'legacy'
  ? 'legacy'
  : resolveBrainGovernanceNavMode(import.meta.env.VITE_BRAIN_GOVERNANCE_NAV_MODE);
export const BRAIN_GOVERNANCE_LEGACY_ROUTE_MODE = BRAIN_GOVERNANCE_UI_MODE === 'legacy'
  ? 'direct'
  : resolveBrainGovernanceLegacyRouteMode(import.meta.env.VITE_BRAIN_GOVERNANCE_LEGACY_ROUTE_MODE);

export const BRAIN_GOVERNANCE_SECTIONS = BRAIN_GOVERNANCE_NAV_MODE === 'compact'
  ? COMPACT_SECTIONS
  : BRAIN_GOVERNANCE_UI_MODE === 'legacy'
    ? LEGACY_SECTIONS
    : V2_SECTIONS;

export const BRAIN_GOVERNANCE_ROUTE_SECTIONS = [
  ...COMPACT_ROUTE_SECTIONS,
  ...DIRECT_ROUTE_SECTIONS,
].filter((section, index, sections) => sections.findIndex((candidate) => candidate.path === section.path) === index);

export const DEFAULT_BRAIN_GOVERNANCE_PATH = BRAIN_GOVERNANCE_UI_MODE === 'legacy'
  ? '/brain-governance/planning'
  : BRAIN_GOVERNANCE_NAV_MODE === 'compact'
    ? '/brain-governance/workbench?tab=overview'
    : '/brain-governance/overview';

export function resolveBrainGovernanceRoute(
  pathname: string,
  search = '',
  legacyRouteMode: BrainGovernanceLegacyRouteMode = BRAIN_GOVERNANCE_LEGACY_ROUTE_MODE,
): BrainGovernanceRouteResolution {
  const compact = COMPACT_ROUTE_SECTIONS.find((section) => section.path === pathname);
  if (compact) return { type: 'render', section: compact.key, legacy: false };

  const redirectTarget = LEGACY_REDIRECTS[pathname];
  if (redirectTarget && (pathname === '/brain-governance/release' || legacyRouteMode === 'redirect')) {
    return { type: 'redirect', to: mergeRedirectSearch(redirectTarget, search), source: pathname };
  }

  const direct = DIRECT_ROUTE_SECTIONS.find((section) => section.path === pathname);
  if (direct) return { type: 'render', section: direct.key, legacy: true };

  return { type: 'redirect', to: DEFAULT_BRAIN_GOVERNANCE_PATH, source: pathname };
}

export function resolveBrainGovernanceSection(pathname: string): BrainGovernanceSectionKey {
  const resolution = resolveBrainGovernanceRoute(pathname, '', 'direct');
  return resolution.type === 'render' ? resolution.section : 'workbench';
}

export function legacyGovernanceTarget(pathname: string) {
  return LEGACY_REDIRECTS[pathname];
}

export function resolveBrainGovernanceUiMode(value: unknown): BrainGovernanceUiMode {
  if (value === 'off' || value === 'false' || value === 'legacy') return 'legacy';
  if (value === 'manage' || value === 'true') return 'manage';
  if (value === 'shadow') return 'shadow';
  return 'shadow';
}

export function resolveBrainGovernanceUiModeSource(value: unknown): BrainGovernanceUiModeSource {
  if (value === undefined || value === null || String(value).trim() === '') return 'default_missing';
  return ['off', 'false', 'legacy', 'manage', 'true', 'shadow'].includes(String(value).trim())
    ? 'explicit'
    : 'default_invalid';
}

export function resolveBrainGovernanceNavMode(value: unknown): BrainGovernanceNavMode {
  return value === 'legacy' ? 'legacy' : 'compact';
}

export function resolveBrainGovernanceLegacyRouteMode(value: unknown): BrainGovernanceLegacyRouteMode {
  return value === 'direct' ? 'direct' : 'redirect';
}

function mergeRedirectSearch(target: string, sourceSearch: string) {
  const [targetPath, targetSearch = ''] = target.split('?');
  const merged = new URLSearchParams(targetSearch);
  const source = new URLSearchParams(sourceSearch.startsWith('?') ? sourceSearch.slice(1) : sourceSearch);
  source.forEach((value, key) => {
    if (!merged.has(key)) merged.append(key, value);
  });
  const query = merged.toString();
  return query ? `${targetPath}?${query}` : targetPath;
}
