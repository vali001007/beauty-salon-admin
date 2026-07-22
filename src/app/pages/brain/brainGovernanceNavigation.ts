export const BRAIN_GOVERNANCE_SECTIONS = [
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

export type BrainGovernanceSectionKey = (typeof BRAIN_GOVERNANCE_SECTIONS)[number]['key'];

export const DEFAULT_BRAIN_GOVERNANCE_PATH = BRAIN_GOVERNANCE_SECTIONS[0].path;

export function resolveBrainGovernanceSection(pathname: string): BrainGovernanceSectionKey {
  return BRAIN_GOVERNANCE_SECTIONS.find((section) => section.path === pathname)?.key ?? 'planning';
}
