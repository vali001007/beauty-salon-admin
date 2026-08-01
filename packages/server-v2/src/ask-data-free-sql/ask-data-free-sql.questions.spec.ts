import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const questions = JSON.parse(readFileSync(resolve(__dirname, 'ask-data-free-sql.questions.json'), 'utf8')) as Array<{
  id: string;
  domain: string;
  question: string;
}>;

describe('Ask Data Free SQL core question set', () => {
  it('contains 20-30 stable questions across at least eight domains', () => {
    expect(questions.length).toBeGreaterThanOrEqual(20);
    expect(questions.length).toBeLessThanOrEqual(30);
    expect(new Set(questions.map((item) => item.id)).size).toBe(questions.length);
    expect(new Set(questions.map((item) => item.domain)).size).toBeGreaterThanOrEqual(8);
    expect(questions.every((item) => item.question.trim().length > 5)).toBe(true);
  });
});
