import type { AgentRiskLevel, AgentRole, AgentToolPlanItem } from '../agent.types.js';
import type { BusinessTask, BusinessTaskDomain, BusinessTaskType } from '../business-task/business-task.types.js';

export type AmiBusinessSkillOutputKind = 'text' | 'kpi' | 'table' | 'chart' | 'action_card' | 'clarify' | 'evidence';

export type AmiBusinessSkillOutputContract = {
  requiredKinds: AmiBusinessSkillOutputKind[];
  preferredKinds?: AmiBusinessSkillOutputKind[];
  minItems?: number;
  evidenceRequired?: boolean;
  maxFollowUps?: number;
};

export type AmiBusinessSkillClarificationPolicy = {
  mode: 'default_and_state_assumption' | 'ask_once' | 'never_for_low_risk';
  requiredSlots?: string[];
  defaultSlots?: Record<string, unknown>;
};

export type AmiBusinessSkillRiskPolicy = {
  riskLevel: AgentRiskLevel;
  requiresApproval: boolean;
  allowedRoles: AgentRole[];
};

export type AmiBusinessSkillEvalCase = {
  id: string;
  input: string;
  role?: AgentRole;
  expectedTool?: string;
  expectedCapabilityId?: string;
  expectedOutputKinds?: AmiBusinessSkillOutputKind[];
};

export type AmiBusinessSkill = {
  id: string;
  name: string;
  capabilityId?: string;
  domain: BusinessTaskDomain | 'cross_domain';
  intents: BusinessTaskType[];
  examples: string[];
  entities: string[];
  requiredMetrics: string[];
  optionalMetrics?: string[];
  requiredSlots: string[];
  clarificationPolicy: AmiBusinessSkillClarificationPolicy;
  riskPolicy: AmiBusinessSkillRiskPolicy;
  outputContract: AmiBusinessSkillOutputContract;
  evalCases: AmiBusinessSkillEvalCase[];
  match?: (task: BusinessTask, role: AgentRole) => boolean;
  toolPlanFactory?: (task: BusinessTask) => AgentToolPlanItem[];
};

export type AmiBusinessSkillPlan = {
  skillId: string;
  name: string;
  capabilityId?: string;
  confidence: number;
  reason: string;
  toolPlan: AgentToolPlanItem[];
  outputContract: AmiBusinessSkillOutputContract;
};
