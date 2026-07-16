import type { BrainSemanticIntent } from '../cognition/brain-semantic-intent.types.js';
import type { BrainCapabilityCard } from '../capability/brain-capability.types.js';
import type { BrainExecutionPlan } from './brain-execution-plan.schema.js';
import type { BrainRoleRuntimeContext } from '../role/brain-role-context-builder.service.js';

export function buildBrainSupervisorPlannerMessages(input: {
  question: string;
  intent: BrainSemanticIntent;
  candidates: readonly BrainCapabilityCard[];
  previousPlan?: BrainExecutionPlan;
  observations?: unknown[];
  roleContext?: BrainRoleRuntimeContext;
}) {
  const context = {
    question: input.question,
    intent: input.intent,
    ...(input.roleContext
      ? {
          roleContext: {
            role: input.roleContext.role,
            expressionRole: input.roleContext.expressionRole,
            profileVersion: input.roleContext.profileVersion,
            systemPrompt: input.roleContext.systemPrompt,
            allowedSkills: input.roleContext.allowedSkills,
            dataScopeRules: input.roleContext.dataScopeRules,
            knowledgePack: input.roleContext.knowledgePack,
          },
        }
      : {}),
    capabilities: input.candidates.map((card) => ({
      key: card.key,
      version: card.version,
      name: card.name,
      description: card.description,
      domains: card.domains,
      intents: card.intents,
      inputSchema: card.inputSchema,
      readOnly: card.readOnly,
      sideEffect: card.sideEffect,
      requiresConfirmation: card.requiresConfirmation,
      timeoutMs: card.timeoutMs,
    })),
    ...(input.previousPlan ? { previousPlan: input.previousPlan } : {}),
    ...(input.observations ? { observations: input.observations } : {}),
  };
  return [
    {
      role: 'system' as const,
      content: [
        '你是 Ami Brain Supervisor，只能输出符合 BrainExecutionPlan JSON Schema 的对象。',
        '只能选择 capabilities 中列出的 key 和 version，不得发明工具。',
        '无依赖的只读事实节点可以并行；依赖事实的分析、文案和动作预览必须声明 dependsOn。',
        '工具间传值只能使用 inputMappings，sourcePath 必须从 $.data 开始，不得映射自然语言 answer。',
        '任何 sideEffect capability 必须 previewOnly=true，本次计划不得确认或真实执行。',
        'roleContext 只约束角色职责和表达视角，不得据此增加权限、门店范围或可用能力。',
        '临期库存类方案按库存事实、财务边界、营销方案排序。',
        '预约空档补齐按预约资源、候选客户、提醒文案、触达预览排序。',
      ].join('\n'),
    },
    { role: 'user' as const, content: JSON.stringify(context) },
  ];
}
