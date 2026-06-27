import type { AgentPlan, AgentToolResult, AuraResponseBlock } from '../agent.types.js';
import type { AmiBusinessSkillOutputContract, AmiBusinessSkillOutputKind } from '../skills/index.js';

export type AgentAnswerContract = AmiBusinessSkillOutputContract & {
  source: 'skill' | 'business_task' | 'default';
};

export type AgentAnswerContractValidation = {
  valid: boolean;
  contract: AgentAnswerContract;
  missingKinds: AmiBusinessSkillOutputKind[];
  warnings: string[];
  errors: string[];
  checkedAt: string;
};

export type AgentAnswerContractValidationInput = {
  plan?: AgentPlan;
  answer: string;
  toolResults: AgentToolResult[];
  renderedBlocks: AuraResponseBlock[];
};
