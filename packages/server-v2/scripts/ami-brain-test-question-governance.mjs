import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AMI_BRAIN_TEST_QUESTION_APPROVED_BASELINE_CHECKSUM,
  buildAmiBrainTestQuestionLegacyBaseline,
  validateAmiBrainTestQuestions,
} from './ami-brain-test-question-governance-core.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = resolve(SCRIPT_DIR, '..');
const REPO_ROOT = resolve(SERVER_ROOT, '..', '..');
const ELIGIBILITY_PATH = resolve(
  REPO_ROOT,
  'docs/04-测试数据/Ami-Brain-全领域题集治理/ami-brain-product-loop-eligibility-v1.json',
);
const LEGACY_BASELINE_PATH = resolve(
  REPO_ROOT,
  'docs/04-测试数据/Ami-Brain-全领域题集治理/ami-brain-test-question-legacy-baseline-v1.json',
);
const QUESTION_SOURCE_REGISTRY_PATH = resolve(
  REPO_ROOT,
  'docs/04-测试数据/Ami-Brain-全领域题集治理/ami-brain-question-source-registry-v1.json',
);

export function assertAmiBrainTestQuestionGovernance(repoRoot = REPO_ROOT) {
  const eligibility = JSON.parse(
    readFileSync(
      resolve(repoRoot, 'docs/04-测试数据/Ami-Brain-全领域题集治理/ami-brain-product-loop-eligibility-v1.json'),
      'utf8',
    ),
  );
  const legacyBaseline = JSON.parse(
    readFileSync(
      resolve(repoRoot, 'docs/04-测试数据/Ami-Brain-全领域题集治理/ami-brain-test-question-legacy-baseline-v1.json'),
      'utf8',
    ),
  );
  const runtimeQuestionSourceRegistry = JSON.parse(
    readFileSync(
      resolve(repoRoot, 'docs/04-测试数据/Ami-Brain-全领域题集治理/ami-brain-question-source-registry-v1.json'),
      'utf8',
    ),
  );
  return validateAmiBrainTestQuestions({ repoRoot, eligibility, legacyBaseline, runtimeQuestionSourceRegistry });
}

if (process.argv.includes('--write-baseline')) {
  const approval = process.argv
    .find((item) => item.startsWith('--approve-current-checksum='))
    ?.slice('--approve-current-checksum='.length);
  if (approval !== AMI_BRAIN_TEST_QUESTION_APPROVED_BASELINE_CHECKSUM) {
    throw new Error(
      `ami_brain_test_question_baseline_rewrite_not_approved:${AMI_BRAIN_TEST_QUESTION_APPROVED_BASELINE_CHECKSUM}`,
    );
  }
  const currentBaseline = JSON.parse(readFileSync(LEGACY_BASELINE_PATH, 'utf8'));
  if (currentBaseline.contentChecksum !== AMI_BRAIN_TEST_QUESTION_APPROVED_BASELINE_CHECKSUM) {
    throw new Error('ami_brain_test_question_baseline_source_not_approved');
  }
  const eligibility = JSON.parse(readFileSync(ELIGIBILITY_PATH, 'utf8'));
  JSON.parse(readFileSync(QUESTION_SOURCE_REGISTRY_PATH, 'utf8'));
  const baseline = buildAmiBrainTestQuestionLegacyBaseline({ repoRoot: REPO_ROOT, eligibility });
  writeFileSync(LEGACY_BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
  console.log(
    JSON.stringify(
      {
        path: LEGACY_BASELINE_PATH,
        entries: baseline.allowedUnmarked.length,
        previousApprovedChecksum: AMI_BRAIN_TEST_QUESTION_APPROVED_BASELINE_CHECKSUM,
        proposedApprovedChecksum: baseline.contentChecksum,
      },
      null,
      2,
    ),
  );
} else if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(assertAmiBrainTestQuestionGovernance(REPO_ROOT), null, 2));
}
