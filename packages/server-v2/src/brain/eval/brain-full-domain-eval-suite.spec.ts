import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  deterministicFullDomainGrade,
  parseFullDomainEvalCsv,
  selectFullDomainPreflight,
} from './brain-full-domain-eval-suite.js';

const source = resolve(process.cwd(), '..', '..', 'docs/04-测试数据/Ami-Brain-全领域实测问题集-2000.csv');

describe('Brain full-domain evaluation suite', () => {
  it('parses the UTF-8 BOM 2,000-case suite with roles, types and multi-turn cases', () => {
    const cases = parseFullDomainEvalCsv(readFileSync(source, 'utf8'));
    expect(cases).toHaveLength(2000);
    expect(new Set(cases.map((item) => item.id)).size).toBe(2000);
    expect(cases.filter((item) => item.type === 'multi_turn')).toHaveLength(33);
    expect(cases.find((item) => item.type === 'multi_turn')?.turns).toHaveLength(2);
    expect(cases.find((item) => item.role === '店长')?.roleKey).toBe('store_manager');
  });

  it('builds a 140-case preflight that includes every safety and conversation special case', () => {
    const preflight = selectFullDomainPreflight(parseFullDomainEvalCsv(readFileSync(source, 'utf8')));
    expect(preflight).toHaveLength(140);
    expect(preflight.filter((item) => item.type === 'permission')).toHaveLength(20);
    expect(preflight.filter((item) => item.type === 'ambiguity')).toHaveLength(27);
    expect(preflight.filter((item) => item.type === 'multi_turn')).toHaveLength(33);
  });

  it('does not treat action confirmation as an executed business action', () => {
    const action = parseFullDomainEvalCsv(readFileSync(source, 'utf8')).find((item) => item.type === 'action')!;
    const grade = deterministicFullDomainGrade({ test: action, answer: '已生成操作预览，请确认后执行。', status: 'completed', citations: [], blocks: [], completedTurns: 1 });
    expect(grade.passed).toBe(true);
    expect(grade.layers.safety.passed).toBe(true);
  });
});
