import { AskDataFreeSqlAnswerService } from './ask-data-free-sql.answer.service.js';

const input = {
  question: '本月哪个项目收入最高？',
  explanation: '按项目汇总净销售额',
  rows: [{ project_name: '补水护理', revenue: 1280 }],
  selectedViews: [{ label: '项目服务销售' }] as any,
  context: { userId: 9, storeId: 6 } as any,
  timeRange: '2026-07-01 至 2026-08-01',
  truncated: false,
};

describe('AskDataFreeSqlAnswerService', () => {
  it('accepts a grounded model answer', async () => {
    const ai = {
      generateStructured: jest.fn().mockResolvedValue({
        data: { summary: '补水护理收入为 1280。', keyFindings: [], caveats: [], displayMode: 'ranking' },
      }),
    };
    const service = new AskDataFreeSqlAnswerService(ai as any);
    const answer = await service.compose(input);
    expect(answer.summary).toBe('补水护理收入为 1280。');
  });

  it('falls back when the model invents a number', async () => {
    const ai = {
      generateStructured: jest.fn().mockResolvedValue({
        data: { summary: '补水护理收入为 9999。', keyFindings: [], caveats: [], displayMode: 'ranking' },
      }),
    };
    const service = new AskDataFreeSqlAnswerService(ai as any);
    const answer = await service.compose(input);
    expect(answer.summary).not.toContain('9999');
    expect(answer.caveats.join(' ')).toContain('回退');
  });

  it('does not treat a number from the user question as result evidence', async () => {
    const ai = {
      generateStructured: jest.fn().mockResolvedValue({
        data: { summary: '最近 30 天收入为 30。', keyFindings: [], caveats: [], displayMode: 'metric' },
      }),
    };
    const service = new AskDataFreeSqlAnswerService(ai as any);
    const answer = await service.compose({ ...input, question: '最近 30 天收入是多少？' });
    expect(answer.summary).not.toBe('最近 30 天收入为 30。');
    expect(answer.caveats.join(' ')).toContain('回退');
  });

  it('does not call the model for empty rows', async () => {
    const ai = { generateStructured: jest.fn() };
    const service = new AskDataFreeSqlAnswerService(ai as any);
    const answer = await service.compose({ ...input, rows: [] });
    expect(answer.summary).toContain('没有匹配数据');
    expect(ai.generateStructured).not.toHaveBeenCalled();
  });

  it('keeps exact database precision in deterministic fallback summaries', async () => {
    const ai = { generateStructured: jest.fn().mockRejectedValue(new Error('provider unavailable')) };
    const service = new AskDataFreeSqlAnswerService(ai as any);
    const answer = await service.compose({ ...input, rows: [{ refund_rate: 12.3456789 }] });

    expect(answer.summary).toContain('12.3456789');
    expect(answer.summary).not.toContain('12.3457');
  });

  it('serializes database dates the same way as the result evidence', async () => {
    const ai = { generateStructured: jest.fn().mockRejectedValue(new Error('provider unavailable')) };
    const service = new AskDataFreeSqlAnswerService(ai as any);
    const answer = await service.compose({
      ...input,
      rows: [{ settlement_day: new Date('2026-07-02T00:00:00.000Z'), net_amount: '123.450000' }],
    });

    expect(answer.summary).toContain('2026-07-02T00:00:00.000Z');
    expect(answer.summary).not.toContain('GMT');
  });
});
