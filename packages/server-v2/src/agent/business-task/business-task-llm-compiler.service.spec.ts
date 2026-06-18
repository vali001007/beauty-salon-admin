import { BusinessTaskLlmCompilerService } from './business-task-llm-compiler.service.js';

describe('BusinessTaskLlmCompilerService', () => {
  const disabledConfig = { get: jest.fn((_key: string, fallback: unknown) => fallback) } as any;
  const enabledConfig = { get: jest.fn((key: string, fallback: unknown) => (key === 'AGENT_LLM_TASK_COMPILER_ENABLED' ? 'true' : fallback)) } as any;

  it('ignores context drafts unless the compiler is explicitly enabled', async () => {
    const service = new BusinessTaskLlmCompilerService(disabledConfig);

    const result = await service.compileDraft({
      message: '看一下这个趋势',
      role: 'manager',
      context: {
        llmBusinessTaskDraft: {
          domain: 'product',
          taskType: 'ranking',
          metrics: ['product_sales_growth'],
        },
      },
    });

    expect(result).toMatchObject({
      used: false,
      status: 'disabled',
      source: 'disabled',
    });
    expect(result.warnings).toContain('llm_context_draft_ignored_without_enable');
  });

  it('validates a structured context draft into allowed BusinessTask slots', async () => {
    const service = new BusinessTaskLlmCompilerService(disabledConfig);

    const result = await service.compileDraft({
      message: '看一下这个趋势',
      role: 'manager',
      context: {
        llmTaskCompilerEnabled: true,
        llmBusinessTaskDraft: {
          domain: 'product',
          taskType: 'ranking',
          metrics: ['product_sales_growth', 'bad metric'],
          filters: { channel: 'store', unsafe: { nested: true } },
          timeRange: { preset: 'last_30_days', label: '近30天' },
          sort: [{ field: 'product_sales_growth', direction: 'desc' }],
          limit: 200,
          confidence: 1.5,
        },
      },
    });

    expect(result).toMatchObject({
      used: true,
      status: 'success',
      source: 'context',
      task: {
        domain: 'product',
        taskType: 'ranking',
        metrics: ['product_sales_growth'],
        filters: { channel: 'store' },
        timeRange: { preset: 'last_30_days', label: '近30天' },
        sort: [{ field: 'product_sales_growth', direction: 'desc' }],
        limit: 50,
        confidence: 1,
      },
    });
  });

  it('parses AI Gateway JSON output when the compiler is enabled', async () => {
    const aiService = {
      chat: jest.fn().mockResolvedValue({
        text: JSON.stringify({
          domain: 'inventory',
          taskType: 'forecast',
          metrics: ['stock_risk_score'],
          limit: 10,
          confidence: 0.83,
        }),
      }),
    } as any;
    const service = new BusinessTaskLlmCompilerService(enabledConfig, aiService);

    const result = await service.compileDraft({
      message: '看看接下来哪些库存有风险',
      role: 'manager',
      context: {},
    });

    expect(aiService.chat).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ role: 'system' }),
        expect.objectContaining({ role: 'user' }),
      ]),
    );
    expect(result).toMatchObject({
      used: true,
      status: 'success',
      source: 'ai_gateway',
      task: {
        domain: 'inventory',
        taskType: 'forecast',
        metrics: ['stock_risk_score'],
        limit: 10,
      },
    });
  });

  it('rejects invalid LLM draft fields instead of passing them through', async () => {
    const service = new BusinessTaskLlmCompilerService(disabledConfig);

    const result = await service.compileDraft({
      message: '随便看看',
      role: 'manager',
      context: {
        llmTaskCompilerEnabled: true,
        llmBusinessTaskDraft: {
          domain: 'sql',
          taskType: 'delete',
          metrics: ['drop table'],
          timeRange: { preset: 'forever' },
        },
      },
    });

    expect(result.status).toBe('invalid');
    expect(result.task).toBeUndefined();
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        'llm_invalid_domain',
        'llm_invalid_taskType',
        'llm_invalid_timeRange_preset',
        'llm_task_draft_empty_or_invalid',
      ]),
    );
  });
});
