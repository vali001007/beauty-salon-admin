import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Ask Data Free SQL generation evaluation contract', () => {
  it('keeps the 75-question real-model gate behind selector, parser, guard and cost checks', () => {
    const questions = JSON.parse(
      readFileSync(resolve(process.cwd(), 'src/ask-data-free-sql/ask-data-free-sql.questions.json'), 'utf8'),
    ) as Array<{ id: string; domain: string; question: string }>;
    const source = readFileSync(resolve(process.cwd(), 'prisma/ask-data-free-sql-generation-eval.ts'), 'utf8');
    const scripts = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };

    expect(questions).toHaveLength(75);
    expect(new Set(questions.map((item) => item.domain)).size).toBeGreaterThanOrEqual(11);
    expect(source).toContain('ai.generateStructured<AskDataSqlGeneration>');
    expect(source).toContain('selectAskDataViews(item.question, context)');
    expect(source).toContain('semanticRouter.route({');
    expect(source).toContain('semanticIntent: semanticRoute?.semanticIntent');
    expect(source).toContain('buildSqlGenerationMessages({');
    expect(source).toContain("argumentValue('--question-id=')");
    expect(source).toContain('questions.filter((item) => item.id === questionId)');
    expect(source).toContain('guard.inspect(generation.data.sql');
    expect(source).toContain("costGuard.inspect(guarded, 100)");
    expect(source).toContain('guarded.status === \'blocked\' ? guarded.message');
    expect(source).toContain("if (strict && summary.status !== 'pass') process.exitCode = 1");
    expect(scripts.scripts?.['ask-data:free-sql:generation-eval:strict']).toContain('--strict');
    expect(scripts.scripts?.['ask-data:free-sql:live-eval:strict']).toContain('--strict');
    expect(source).not.toContain('ASK_DATA_FREE_SQL_READONLY_DATABASE_URL');
  });

  it('keeps the live gate behind the dedicated read-only URL and second answer model call', () => {
    const source = readFileSync(resolve(process.cwd(), 'prisma/ask-data-free-sql-live-eval.ts'), 'utf8');
    expect(source).toContain('ASK_DATA_FREE_SQL_READONLY_DATABASE_URL');
    expect(source).toContain('new ReadOnlySqlExecutor()');
    expect(source).toContain('new AskDataFreeSqlAnswerService');
    expect(source).toContain('answerModelCalled');
    expect(source).toContain('isGrounded(answer, rows');
  });
});
