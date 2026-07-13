import { AGENT_V2_CAPABILITY_MANIFESTS } from '../capability/agent-v2-capability-manifest.js';
import { AgentV2CapabilityMappingService } from '../capability/agent-v2-capability-mapping.service.js';
import { AgentV2IntentExtractionService } from './agent-v2-intent-extraction.service.js';
import { KnowledgeGraphIntentContextService } from './knowledge-graph-intent-context.service.js';

describe('Agent V2 KG intent extraction and Manifest mapping', () => {
  const contextService = new KnowledgeGraphIntentContextService();
  const extractionService = new AgentV2IntentExtractionService(contextService);
  const mappingService = new AgentV2CapabilityMappingService();

  it('builds graph context for card inactive customer questions', () => {
    const context = contextService.buildContext('哪些客户买了次卡但最近一直不来用');

    expect(context.objectHints.map((hint) => hint.objectType)).toEqual(expect.arrayContaining(['MemberCard', 'Customer']));
    expect(context.capabilityHints.map((hint) => hint.capabilityId)).toContain('card.package.inactive-customers.list');
  });

  it('builds graph context for staff efficiency metric questions', () => {
    const context = contextService.buildContext('这个月人效怎么样');

    expect(context.objectHints.map((hint) => hint.objectType)).toContain('StaffEfficiency');
    expect(context.capabilityHints.map((hint) => hint.capabilityId)).toContain('finance.staff-efficiency.metric');

    const intent = extractionService.extract({
      question: '这个月人效怎么样',
      role: 'manager',
      storeId: 1,
    });
    expect(intent.domain).toBe('finance');
    expect(intent.action).toBe('summary');
    expect(intent.candidateCapabilities).toContain('finance.staff-efficiency.metric');
  });

  it('extracts a structured intent with candidate capabilities from the knowledge graph', () => {
    const isolatedExtractionService = new AgentV2IntentExtractionService(contextService);
    const intent = extractionService.extract({
      question: '哪些客户买了次卡但最近一直不来用',
      role: 'manager',
      storeId: 1,
    });

    expect(intent.objects).toEqual(expect.arrayContaining(['MemberCard', 'Customer']));
    expect(intent.action).toBe('list');
    expect(intent.candidateCapabilities).toContain('card.package.inactive-customers.list');
    expect(intent.confidence).toBeGreaterThanOrEqual(0.2);

    isolatedExtractionService.extract({
      question: '今天现金、微信、支付宝各收了多少',
      role: 'manager',
      storeId: 1,
    });
    const cachedIntent = isolatedExtractionService.extract({
      question: '今天现金、微信、支付宝各收了多少',
      role: 'manager',
      storeId: 1,
    });
    expect(cachedIntent.trace.source).toBe('cache');
    expect(isolatedExtractionService.getCacheStats()).toMatchObject({
      lookups: 2,
      hits: 1,
      misses: 1,
      hitRate: 0.5,
    });
  });

  it('extracts structured intent from the AI Gateway when LLM JSON is valid', async () => {
    const aiService = {
      chat: jest.fn().mockResolvedValue({
        text: JSON.stringify({
          objects: ['Customer', 'MemberCard'],
          domain: 'customer',
          action: 'list',
          timeIntent: 'historical_pattern',
          keywords: ['次卡沉睡'],
          candidateCapabilities: ['card.package.inactive-customers.list'],
          confidence: 0.91,
          needsClarification: false,
          unsupportedReason: null,
        }),
      }),
    };
    const llmExtractionService = new AgentV2IntentExtractionService(contextService, aiService as any);

    const intent = await llmExtractionService.extractAsync({
      question: '哪些客户买了次卡但最近一直不来用',
      role: 'manager',
      storeId: 1,
      userId: 1,
    });

    expect(aiService.chat).toHaveBeenCalled();
    expect(aiService.chat.mock.calls[0][0][0]).toMatchObject({ role: 'system' });
    expect(aiService.chat.mock.calls[0][0][1]).toMatchObject({ role: 'user' });
    expect(intent.trace.source).toBe('llm');
    expect(intent.trace.llmPrompt).toMatchObject({
      activeManifestCount: expect.any(Number),
      outputSchemaKeys: expect.arrayContaining(['objects', 'domain', 'candidateCapabilities']),
    });
    expect(intent.trace.llmResponse).toMatchObject({
      parsed: true,
      parsedKeys: expect.arrayContaining(['candidateCapabilities', 'confidence']),
    });
    expect(intent.trace.llmRawTextPreview).toContain('card.package.inactive-customers.list');
    expect(intent.candidateCapabilities).toContain('card.package.inactive-customers.list');
    expect(intent.confidence).toBe(0.91);
  });

  it('falls back to KG intent when LLM extraction returns invalid JSON', async () => {
    const aiService = {
      chat: jest.fn().mockResolvedValue({ text: '我无法输出 JSON' }),
    };
    const llmExtractionService = new AgentV2IntentExtractionService(contextService, aiService as any);

    const intent = await llmExtractionService.extractAsync({
      question: '哪些客户买了次卡但最近一直不来用',
      role: 'manager',
      storeId: 1,
      userId: 1,
    });

    expect(aiService.chat).toHaveBeenCalled();
    expect(intent.trace.source).toBe('kg_fallback');
    expect(intent.trace.llmFallbackReason).toBe('llm_unavailable_or_invalid_json');
    expect(intent.trace.llmPrompt?.activeManifestCount).toBeGreaterThan(0);
    expect(intent.trace.llmResponse).toMatchObject({
      rawTextPreview: '我无法输出 JSON',
      parsed: false,
    });
    expect(intent.candidateCapabilities).toContain('card.package.inactive-customers.list');
  });

  it('maps structured intent candidates only through enabled Active Manifest items', () => {
    const intent = extractionService.extract({
      question: '哪些客户买了次卡但最近一直不来用',
      role: 'manager',
      storeId: 1,
    });
    const decision = mappingService.map({
      intent,
      decisionInput: { message: '哪些客户买了次卡但最近一直不来用', role: 'manager' },
    });

    expect(decision.selected?.capabilityId).toBe('card.package.inactive-customers.list');
    expect(decision.toolPlan[0]).toMatchObject({
      tool: 'business.record.query',
      args: expect.objectContaining({ capabilityId: 'card.package.inactive-customers.list' }),
    });
  });

  it('does not map LLM-proposed nonexistent capabilities to executable tools', () => {
    const decision = mappingService.map({
      intent: {
        objects: ['Customer'],
        domain: 'customer',
        action: 'list',
        timeIntent: 'current',
        keywords: ['不存在能力'],
        candidateCapabilities: ['customer.nonexistent.list'],
        confidence: 0.91,
        needsClarification: false,
        unsupportedReason: null,
        trace: {
          source: 'kg_fallback',
          normalizedQuestion: '不存在能力',
          objectHints: [],
          domainHints: [],
          capabilityHints: [],
          exclusions: [],
        },
      },
      decisionInput: { message: '不存在能力', role: 'manager' },
    });

    expect(decision.selected).toBeNull();
    expect(decision.toolPlan).toEqual([]);
    expect(decision.excluded[0]?.reason).toContain('manifest_missing');
  });

  it('rejects negative-example mismatches during Manifest mapping', () => {
    const decision = mappingService.map({
      intent: {
        objects: ['InventoryProduct'],
        domain: 'inventory',
        action: 'list',
        timeIntent: 'risk',
        keywords: ['报废风险'],
        candidateCapabilities: ['inventory.scrap.records.list', 'inventory.expiring-risk.list'],
        confidence: 0.9,
        needsClarification: false,
        unsupportedReason: null,
        trace: {
          source: 'kg_fallback',
          normalizedQuestion: '哪些产品快报废了',
          objectHints: [],
          domainHints: [],
          capabilityHints: [],
          exclusions: [],
        },
      },
      decisionInput: { message: '哪些产品快报废了', role: 'manager' },
    });

    expect(decision.selected?.capabilityId).toBe('inventory.expiring-risk.list');
    expect(decision.excluded.find((item) => item.capabilityId === 'inventory.scrap.records.list')?.reason).toContain('negative_example');
  });

  it('documents that every mapped selected capability is backed by the current Manifest list', () => {
    const manifestIds = new Set(AGENT_V2_CAPABILITY_MANIFESTS.map((item) => item.capabilityId));
    const intent = extractionService.extract({
      question: '今天现金、微信、支付宝各收了多少',
      role: 'manager',
      storeId: 1,
    });
    const decision = mappingService.map({
      intent,
      decisionInput: { message: '今天现金、微信、支付宝各收了多少', role: 'manager' },
    });

    expect(decision.selected?.capabilityId).toBe('finance.payment-method-breakdown.metric');
    expect(manifestIds.has(decision.selected?.capabilityId ?? '')).toBe(true);
  });
});
