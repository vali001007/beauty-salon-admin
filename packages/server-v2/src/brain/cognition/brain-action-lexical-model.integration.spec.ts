import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { AiService } from '../../ai/ai.service.js';
import { createCuratedActionCandidates } from '../../semantic-data/brain-action-candidate-catalog.js';
import { createBusinessDefinitionProjectionFingerprint } from '../../semantic-data/business-definition-projection-compiler.service.js';
import { loadWorkspaceEnvironment } from '../capability/brain-capability-cli.helpers.js';
import { BrainRuntimeConfigService } from '../config/brain-runtime-config.service.js';
import { BrainSemanticIntentCompilerService } from './brain-semantic-intent-compiler.service.js';
import { BrainTimeRangeParserService } from './brain-time-range-parser.service.js';
import type {
  BusinessActionDefinitionSnapshot,
  BusinessEntityDefinitionSnapshot,
  ProductionReadyBusinessDefinitionSnapshot,
} from './business-definition-snapshot.types.js';

const runRealModel = process.env.AMI_BRAIN_ACTION_LEXICAL_MODEL_COMPARE === '1' ? it : it.skip;

describe('Ami Brain action lexical semantics with the configured model', () => {
  jest.setTimeout(120_000);

  runRealModel.each([
    {
      caseId: 'BQ1231',
      question: '给舒缓修护面膜下一个采购单，采156件', // BQ1231
      expectedActionKey: 'action.create_purchase_order',
      expectedMissingSlot: undefined,
    },
    {
      caseId: 'BQ1232',
      question: '屏障修护精华入库416件', // BQ1232
      expectedActionKey: undefined,
      expectedMissingSlot: 'actionDefinition',
    },
    {
      caseId: 'BQ1233',
      question: '调整水氧护理耗材包的库存', // BQ1233
      expectedActionKey: undefined,
      expectedMissingSlot: 'actionDefinition',
    },
    {
      caseId: 'BQ0593',
      question: '给深层补水护理调价到310元', // BQ0593
      expectedActionKey: undefined,
      expectedMissingSlot: 'actionDefinition',
    },
  ])('$caseId keeps its governed action meaning', async ({ question, expectedActionKey, expectedMissingSlot }) => {
    loadWorkspaceEnvironment(resolve(process.cwd(), '../..'));
    if (!process.env.LLM_PROVIDER || process.env.LLM_PROVIDER === 'mock') {
      throw new Error('ami_brain_action_lexical_model_compare_requires_configured_provider');
    }
    const config = new ConfigService(process.env);
    const prisma = { aiAuditLog: { create: jest.fn().mockResolvedValue({ id: 1 }) } };
    const aiService = new AiService(prisma as never, config);
    const invalidStructuredOutputs: Array<{ rawText: string; errors: string[] }> = [];
    const validateStructuredText = (aiService as any).validateStructuredText.bind(aiService);
    (aiService as any).validateStructuredText = (rawText: string, validate: unknown) => {
      const validation = validateStructuredText(rawText, validate);
      if (!validation.ok) invalidStructuredOutputs.push({ rawText, errors: validation.errors });
      return validation;
    };
    const compiler = new BrainSemanticIntentCompilerService(
      aiService,
      new BrainRuntimeConfigService(config),
      new BrainTimeRangeParserService(),
    );

    const result = await compiler.compile({
      question,
      audit: { userId: 1, storeId: 6 },
      timezone: 'Asia/Shanghai',
      role: 'inventory',
      conversationSlots: {},
      ontologySnapshot: curatedActionSnapshot(),
      ontologyCandidates: [],
      metricRefs: [],
      dimensionRefs: [],
      capabilitySummaries: [],
    });

    if (result.status !== 'completed') {
      throw new Error(
        `ami_brain_action_lexical_model_compare_unavailable:${JSON.stringify({ result, invalidStructuredOutputs })}`,
      );
    }
    expect(result.provider).not.toBe('governed_contract');
    expect(result.intent.intent).toBe('action');
    expect(result.intent.actionRef?.definitionKey).toBe(expectedActionKey);
    expect(result.intent.missingSlots).toEqual(
      expectedMissingSlot
        ? expect.arrayContaining([expectedMissingSlot])
        : expect.not.arrayContaining(['actionDefinition']),
    );
  });
});

function curatedActionSnapshot(): ProductionReadyBusinessDefinitionSnapshot {
  const actions = createCuratedActionCandidates().map((candidate, index) => {
    const payload = candidate.payload as unknown as Omit<
      BusinessActionDefinitionSnapshot,
      | 'definitionKey'
      | 'definitionFingerprint'
      | 'sourceFingerprint'
      | 'version'
      | 'domain'
      | 'name'
      | 'bindingFingerprint'
    >;
    const definitionFingerprint = fingerprint({ definitionKey: candidate.definitionKey, payload });
    const capabilityBindings = payload.capabilityBindings;
    return {
      ...payload,
      definitionKey: candidate.definitionKey,
      definitionFingerprint,
      sourceFingerprint: fingerprint({ source: candidate.ownerId, definitionFingerprint }),
      version: index + 1,
      domain: candidate.domain,
      name: candidate.name,
      bindingFingerprint: createBusinessDefinitionProjectionFingerprint({
        actionKey: payload.actionKey,
        capabilityBindings,
      }),
    } satisfies BusinessActionDefinitionSnapshot;
  });
  const entityRefs = new Set(
    actions.flatMap((action) => [
      ...action.targetEntityRefs,
      ...action.inputSlots.flatMap((slot) => (slot.entityTypeRef ? [slot.entityTypeRef] : [])),
    ]),
  );
  const entities = [...entityRefs].sort().map(entitySnapshot);
  return {
    productionReady: true,
    fingerprint: fingerprint({ actions, entities }),
    entities,
    relations: [],
    metrics: [],
    dimensions: [],
    actions,
  };
}

function entitySnapshot(definitionKey: string): BusinessEntityDefinitionSnapshot {
  const entityKey = definitionKey.replace(/^entity[.:]/u, '');
  return {
    definitionKey,
    version: 1,
    definitionFingerprint: fingerprint({ definitionKey }),
    sourceFingerprint: fingerprint({ definitionKey, source: 'curated_action_model_compare' }),
    domain: 'action_model_compare',
    entityKey,
    name: entityKey,
    aliases: [],
    attributes: {},
    tableMap: {},
  };
}

function fingerprint(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
