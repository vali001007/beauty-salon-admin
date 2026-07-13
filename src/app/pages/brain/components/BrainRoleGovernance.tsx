import { createBrainRoleProfile, listBrainRoleProfiles, updateBrainRoleProfile } from '@/api/brain';
import { BrainResourceGovernancePanel } from './BrainResourceGovernancePanel';

export function BrainRoleGovernance() {
  return <BrainResourceGovernancePanel
    title="角色配置"
    description="角色技能、数据范围和知识包按版本发布，roleHint 不改变用户权限。"
    resourceType="agent_profile"
    keyField="roleKey"
    example={{ roleKey: 'store_manager', name: '店长经营 Agent', systemPrompt: '基于真实经营事实回答。', allowedSkills: [], dataScopeRules: { requiredPermissions: ['core:dashboard:view'] }, knowledgePack: {} }}
    loadActive={listBrainRoleProfiles}
    createResource={createBrainRoleProfile}
    updateResource={updateBrainRoleProfile}
  />;
}
