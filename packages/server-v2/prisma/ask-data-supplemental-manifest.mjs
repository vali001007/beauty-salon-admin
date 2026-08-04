import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ASK_DATA_SUPPLEMENTAL_QUESTIONS } from './ask-data-supplemental-question-bank.ts';

const outputPath = resolve(
  process.cwd(),
  argumentValue('--output=') ?? '../../docs/04-测试数据/Ami-Ask统一Gold题库-v1/Ami-Ask补充覆盖题实测清单-v1.json',
);
const selectedQuestions = ASK_DATA_SUPPLEMENTAL_QUESTIONS.map((item) => ({
  id: item.id,
  domain: item.role,
  role: item.role,
  type: 'ask_query_supported',
  difficulty: 'medium',
  question: item.question,
  expected_target: item.expectedView,
  notes: item.provenance,
  expectedView: item.expectedView,
  expectedViewLabel: item.expectedView,
}));
const report = {
  generatedAt: new Date().toISOString(),
  sourcePath: 'prisma/ask-data-supplemental-question-bank.ts',
  sourceQuestionCount: selectedQuestions.length,
  targetPerView: 10,
  viewCount: 34,
  coveredViews: new Set(selectedQuestions.map((item) => item.expectedView)).size,
  insufficientViews: [],
  selectedCaseCount: selectedQuestions.length,
  selectedQuestions,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, selectedCaseCount: report.selectedCaseCount, coveredViews: report.coveredViews }, null, 2));

function argumentValue(prefix) { return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length); }
