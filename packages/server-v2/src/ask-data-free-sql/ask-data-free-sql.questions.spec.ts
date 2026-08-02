import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const questions = JSON.parse(readFileSync(resolve(__dirname, 'ask-data-free-sql.questions.json'), 'utf8')) as Array<{
  id: string;
  domain: string;
  question: string;
}>;

describe('Ask Data Free SQL core question set', () => {
  it('contains the 75-question expansion set across the management domains', () => {
    expect(questions).toHaveLength(75);
    expect(new Set(questions.map((item) => item.id)).size).toBe(questions.length);
    expect(new Set(questions.map((item) => item.domain)).size).toBeGreaterThanOrEqual(11);
    expect(questions.map((item) => item.id)).toEqual(
      Array.from({ length: 75 }, (_, index) => `FSQ-${String(index + 1).padStart(3, '0')}`),
    );
    expect(questions.every((item) => item.question.trim().length > 5)).toBe(true);
  });
});
