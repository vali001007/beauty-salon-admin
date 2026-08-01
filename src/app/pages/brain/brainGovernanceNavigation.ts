export type BrainGovernanceUiMode = 'legacy' | 'shadow' | 'manage';

const LEGACY_SECTIONS = [
  { key: 'planning', label: '模型规划', path: '/brain-governance/planning' },
  { key: 'semantic', label: '语义治理', path: '/brain-governance/semantic' },
  { key: 'roles', label: '角色治理', path: '/brain-governance/roles' },
  { key: 'skills', label: '技能治理', path: '/brain-governance/skills' },
  { key: 'memory', label: '记忆治理', path: '/brain-governance/memory' },
  { key: 'inspection', label: '巡检治理', path: '/brain-governance/inspection' },
  { key: 'eval', label: '评测中心', path: '/brain-governance/eval' },
  { key: 'release', label: '发布中心', path: '/brain-governance/release' },
  { key: 'feedback', label: '反馈指标', path: '/brain-governance/feedback' },
] as const;

const V2_SECTIONS = [
  { key: 'overview', label: '治理总览', path: '/brain-governance/overview' },
  { key: 'capabilities', label: '能力治理', path: '/brain-governance/capabilities' },
  { key: 'semantic', label: '语义治理', path: '/brain-governance/semantic' },
  { key: 'tasks', label: '治理任务', path: '/brain-governance/tasks' },
  { key: 'policy-snapshots', label: '策略快照', path: '/brain-governance/policy-snapshots' },
  { key: 'roles', label: '角色治理', path: '/brain-governance/roles' },
  { key: 'eval', label: '评测中心', path: '/brain-governance/eval' },
  { key: 'runtime-releases', label: '运行发布', path: '/brain-governance/runtime-releases' },
  { key: 'planning', label: '高级·模型规划', path: '/brain-governance/planning' },
  { key: 'memory', label: '高级·记忆', path: '/brain-governance/memory' },
  { key: 'inspection', label: '高级·巡检', path: '/brain-governance/inspection' },
  { key: 'feedback', label: '高级·反馈', path: '/brain-governance/feedback' },
] as const;

export const BRAIN_GOVERNANCE_UI_MODE = resolveBrainGovernanceUiMode(import.meta.env.VITE_BRAIN_GOVERNANCE_UI_V2);
export const BRAIN_GOVERNANCE_SECTIONS = BRAIN_GOVERNANCE_UI_MODE === 'legacy' ? LEGACY_SECTIONS : V2_SECTIONS;
export const BRAIN_GOVERNANCE_ROUTE_SECTIONS = [...V2_SECTIONS, ...LEGACY_SECTIONS.filter(
  (legacy) => !V2_SECTIONS.some((section) => section.path === legacy.path),
)];

export type BrainGovernanceSectionKey = (typeof BRAIN_GOVERNANCE_ROUTE_SECTIONS)[number]['key'];

export const DEFAULT_BRAIN_GOVERNANCE_PATH = BRAIN_GOVERNANCE_UI_MODE === 'legacy'
  ? '/brain-governance/planning'
  : '/brain-governance/overview';

export function resolveBrainGovernanceSection(pathname: string): BrainGovernanceSectionKey {
  if (BRAIN_GOVERNANCE_UI_MODE !== 'legacy') {
    if (pathname === '/brain-governance/skills') return 'capabilities';
    if (pathname === '/brain-governance/release') return 'runtime-releases';
  }
  return BRAIN_GOVERNANCE_ROUTE_SECTIONS.find((section) => section.path === pathname)?.key
    ?? (BRAIN_GOVERNANCE_UI_MODE === 'legacy' ? 'planning' : 'overview');
}

export function resolveBrainGovernanceUiMode(value: unknown): BrainGovernanceUiMode {
  if (value === 'off' || value === 'false' || value === 'legacy') return 'legacy';
  if (value === 'manage' || value === 'true') return 'manage';
  if (value === 'shadow') return 'shadow';
  return 'manage';
}
