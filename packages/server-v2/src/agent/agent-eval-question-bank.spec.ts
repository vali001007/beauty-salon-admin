import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import {
  annotateQuestionBankCoverage,
  parseAgentEvalQuestionMarkdown,
  selectRemainingSupportedQuestionBankCases,
  selectP0QuestionBankCases,
  toAgentEvalCaseDefinitions,
} from './agent-eval-question-bank.js';

function readQuestionBankMarkdown() {
  const candidates = [
    resolve(process.cwd(), 'docs/04-测试数据/agent-eval-questions.md'),
    resolve(process.cwd(), '../../docs/04-测试数据/agent-eval-questions.md'),
    resolve(process.cwd(), '../../docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-eval-questions.md'),
  ];
  const file = candidates.find((item) => existsSync(item));
  if (!file) throw new Error(`agent-eval-questions.md not found. tried: ${candidates.join(', ')}`);
  return readFileSync(file, 'utf8');
}

describe('Agent eval question bank', () => {
  it('parses the markdown question bank into 650 structured cases', () => {
    const markdown = readQuestionBankMarkdown();
    expect(markdown.match(/^# Agent 评测问题库$/gm)).toHaveLength(1);

    const bank = parseAgentEvalQuestionMarkdown(markdown);
    expect(bank).toEqual(
      expect.objectContaining({
        title: 'Agent 评测问题库',
        version: 'v1.0',
        date: '2026-06-27',
      }),
    );
    expect(bank.questions).toHaveLength(650);
    expect(countBy(bank.questions, 'persona')).toEqual({
      manager: 100,
      marketing: 100,
      reception: 100,
      beautician: 100,
      inventory: 100,
      finance: 100,
      edge: 50,
    });
  });

  it('selects the first 120 P0 gate cases by role and edge strategy', () => {
    const bank = parseAgentEvalQuestionMarkdown(readQuestionBankMarkdown());
    const p0Cases = selectP0QuestionBankCases(bank.questions);

    expect(p0Cases).toHaveLength(120);
    expect(countBy(p0Cases, 'persona')).toEqual({
      manager: 15,
      marketing: 15,
      reception: 15,
      beautician: 15,
      inventory: 15,
      finance: 15,
      edge: 30,
    });
    expect(p0Cases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          input: '今天营业额到多少了',
          persona: 'manager',
          evalRole: 'manager',
          expectedOutputKinds: expect.arrayContaining(['kpi', 'evidence']),
        }),
        expect.objectContaining({
          input: '我想做个召回活动，哪些客户最值得联系',
          persona: 'marketing',
          expectedSkill: 'marketing.growth.execution',
          expectedOutputKinds: expect.arrayContaining(['table', 'action_card']),
        }),
        expect.objectContaining({
          input: '这个客人用次卡核销，帮我看一下她的次卡情况',
          persona: 'reception',
          evalRole: 'reception',
          expectedOutputKinds: expect.arrayContaining(['table']),
        }),
        expect.objectContaining({
          input: '哪些产品快过期了，还有多少',
          persona: 'inventory',
          expectedSkill: 'inventory.supply.risk',
        }),
        expect.objectContaining({
          input: '这个月营业额是多少',
          persona: 'finance',
          expectedSkill: 'finance.profit.risk',
        }),
        expect.objectContaining({
          input: '帮我看看',
          persona: 'edge',
          expectedIntentType: 'clarify',
        }),
      ]),
    );
  });

  it('can convert P0 question bank cases into existing AgentEvalCaseDefinition shape', () => {
    const bank = parseAgentEvalQuestionMarkdown(readQuestionBankMarkdown());
    const evalCases = toAgentEvalCaseDefinitions(selectP0QuestionBankCases(bank.questions));

    expect(evalCases).toHaveLength(120);
    expect(evalCases[0]).toEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^qb-/),
        scenario: expect.stringContaining('问题库：'),
        input: expect.any(String),
        role: expect.stringMatching(/manager|reception|beautician/),
      }),
    );
  });

  it('classifies every question by system support without dropping original cases', () => {
    const bank = parseAgentEvalQuestionMarkdown(readQuestionBankMarkdown());
    const counts = countBy(bank.questions, 'systemSupportStatus');

    expect(bank.questions).toHaveLength(650);
    expect(bank.questions.every((item) => item.systemSupportStatus && item.systemSupportReason)).toBe(true);
    expect(Object.values(counts).reduce((sum, count) => sum + count, 0)).toBe(650);
    expect(counts.system_unsupported).toBeGreaterThan(0);
    expect(counts.system_supported_testable).toBeGreaterThan(0);
    expect(counts.system_supported_agent_gap).toBeGreaterThan(0);
    expect(bank.questions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          input: '店里消防安全检查需要做吗',
          systemSupportStatus: 'system_unsupported',
        }),
        expect.objectContaining({
          input: '帮我写个朋友圈文案推一下我们的新项目',
          systemSupportStatus: 'system_supported_agent_gap',
        }),
        expect.objectContaining({
          input: '今天营业额到多少了',
          systemSupportStatus: 'system_supported_testable',
        }),
      ]),
    );
  });

  it('selects remaining supported questions by excluding unsupported and covered cases', () => {
    const bank = parseAgentEvalQuestionMarkdown(readQuestionBankMarkdown());
    const annotated = annotateQuestionBankCoverage(bank.questions);
    const remaining = selectRemainingSupportedQuestionBankCases(bank.questions);

    expect(annotated).toHaveLength(650);
    expect(annotated.filter((item) => item.coverageStage === 'p0_daily')).toHaveLength(120);
    expect(annotated.some((item) => item.coverageStage === 'kiosk_e2e')).toBe(true);
    expect(remaining.length).toBeGreaterThan(0);
    expect(remaining.every((item) => item.systemSupportStatus !== 'system_unsupported')).toBe(true);
    expect(remaining.every((item) => item.coverageStage === 'not_run')).toBe(true);
    expect(selectRemainingSupportedQuestionBankCases(bank.questions, 'inventory').every((item) => item.persona === 'inventory')).toBe(true);
  });
});

function countBy<T extends Record<string, unknown>>(items: T[], key: keyof T) {
  return items.reduce<Record<string, number>>((acc, item) => {
    const value = String(item[key]);
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}
