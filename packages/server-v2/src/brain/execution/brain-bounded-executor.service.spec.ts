import { ForbiddenException } from '@nestjs/common';
import { BrainCapabilityArgsValidatorService } from '../capability/brain-capability-args-validator.service.js';
import type { BrainCapabilityCard } from '../capability/brain-capability.types.js';
import { BrainExecutionPlanValidatorService } from '../planning/brain-execution-plan-validator.service.js';
import type { BrainExecutionPlan } from '../planning/brain-execution-plan.schema.js';
import { BrainBoundedExecutorService } from './brain-bounded-executor.service.js';
import { BrainCompletionVerifierService } from './brain-completion-verifier.service.js';
import { BrainExecutionBudgetService } from './brain-execution-budget.service.js';
import { BrainObservationService } from './brain-observation.service.js';

const context = { userId: 9, storeId: 6, visibleStoreIds: [6], roles: ['store_manager'], permissions: ['core:test'], deniedPermissions: [], requestId: 'r1', timezone: 'Asia/Shanghai' };
const intent = { schemaVersion: '1.0', objective: 'workflow', domains: ['test'], intent: 'workflow', entities: [], metrics: [], dimensions: [], filters: [], orderBy: [], answerShape: 'diagnosis', successCriteria: [], ambiguities: [], missingSlots: [], assumptions: [], confidence: 0.9, decisionSummary: 'workflow' } as any;

describe('BrainBoundedExecutorService', () => {
  it('runs independent read-only nodes in parallel and maps only structured observation data', async () => {
    let active = 0;
    let maxActive = 0;
    const execute = jest.fn(async ({ card, args }: any) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      if (card.key === 'customers') {
        return answer({ metadata: { customerIds: ['customer:1'] } });
      }
      if (card.key === 'draft') {
        expect(args.entities).toEqual(['customer:1']);
      }
      return answer();
    });
    const cards = [card('customers'), card('schedule'), card('draft', { inputSchema: { type: 'object', additionalProperties: false, properties: { entities: { type: 'array' } } } })];
    const plan: BrainExecutionPlan = {
      schemaVersion: '1.0', planId: 'parallel', objective: 'workflow', replanCount: 0, budgetMs: 10_000,
      nodes: [
        node('customers', cards[0]),
        node('schedule', cards[1]),
        { ...node('draft', cards[2], ['customers', 'schedule']), inputMappings: [{ fromNodeId: 'customers', sourcePath: '$.data.metadata.customerIds', targetPath: '$.entities' }] },
      ],
    };
    const result = await executor(execute).execute({ plan, topK: ranked(cards), context: context as any, runId: 1, question: 'workflow', intent });

    expect(maxActive).toBe(2);
    expect(result.status).toBe('completed');
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it('stops on rejected observations without asking the replanner', async () => {
    const replanner = { replan: jest.fn() };
    const service = executor(jest.fn().mockRejectedValue(new ForbiddenException('permission_denied')), replanner);
    const capability = card('facts');
    const result = await service.execute({ plan: singlePlan(capability), topK: ranked([capability]), context: context as any, runId: 1, question: 'facts', intent });

    expect(result.status).toBe('rejected');
    expect(replanner.replan).not.toHaveBeenCalled();
  });

  it('allows one bounded replan for a failed node and then completes', async () => {
    const capability = card('facts');
    const firstPlan = singlePlan(capability);
    const secondPlan = { ...firstPlan, planId: 'p2', replanCount: 1 };
    const execute = jest.fn().mockRejectedValueOnce(new Error('temporary_failure')).mockResolvedValueOnce(answer());
    const replanner = { replan: jest.fn().mockResolvedValue({ status: 'planned', plan: secondPlan }) };
    const result = await executor(execute, replanner).execute({ plan: firstPlan, topK: ranked([capability]), context: context as any, runId: 1, question: 'facts', intent });

    expect(result.status).toBe('completed');
    expect(result.replanCount).toBe(1);
    expect(replanner.replan).toHaveBeenCalledTimes(1);
  });
});

function executor(execute: jest.Mock, replanner?: any) {
  const budget = new BrainExecutionBudgetService();
  return new BrainBoundedExecutorService(
    { execute } as any,
    new BrainExecutionPlanValidatorService(new BrainCapabilityArgsValidatorService(), budget),
    budget,
    new BrainObservationService(),
    new BrainCompletionVerifierService(),
    replanner,
  );
}
function card(key: string, overrides: Partial<BrainCapabilityCard> = {}): BrainCapabilityCard {
  return { key, version: 1, name: key, description: key, domains: ['test'], intents: ['workflow'], inputSchema: { type: 'object' }, outputSchema: {}, requiredPermissions: ['core:test'], allowedRoles: [], readOnly: true, sideEffect: false, riskLevel: 'low', requiresConfirmation: false, idempotency: 'not_applicable', timeoutMs: 1000, grounding: 'domain_service', examples: [], sourceFingerprint: 'a'.repeat(64), definitionRefs: [], synonyms: [], negativeExamples: [], successSchema: {}, ...overrides };
}
function node(id: string, capability: BrainCapabilityCard, dependsOn: string[] = []) { return { id, capabilityKey: capability.key, capabilityVersion: 1, dependsOn, previewOnly: false, args: {} }; }
function singlePlan(capability: BrainCapabilityCard): BrainExecutionPlan { return { schemaVersion: '1.0', planId: 'p1', objective: 'facts', replanCount: 0, budgetMs: 10_000, nodes: [node('facts', capability)] }; }
function ranked(cards: BrainCapabilityCard[]) { return cards.map((card) => ({ card, score: 0.9, matchedFields: ['name'] })); }
function answer(overrides: Record<string, unknown> = {}) { return { status: 'completed', answer: 'ok', citations: [{ sourceType: 'db', sourceId: '1' }], grounding: 'db_skill', ...overrides }; }
