import { createBrainSkill, listBrainSkills, updateBrainSkill } from '@/api/brain';
import { BrainResourceGovernancePanel } from './BrainResourceGovernancePanel';

export function BrainSkillGovernance() {
  return <BrainResourceGovernancePanel
    title="技能注册"
    description="技能发布前校验输入输出合同、权限码和风险等级。"
    resourceType="skill"
    keyField="skillKey"
    example={{ skillKey: 'new_skill', name: '新技能', type: 'analysis', inputSchema: {}, outputSchema: {}, permissions: ['core:brain:use'], riskLevel: 'low' }}
    loadActive={listBrainSkills}
    createResource={createBrainSkill}
    updateResource={updateBrainSkill}
  />;
}
