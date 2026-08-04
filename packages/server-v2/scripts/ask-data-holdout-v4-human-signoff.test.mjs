import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  buildHumanSignoffRecord,
  parseCsv,
  validateHumanReviewCsv,
} from './ask-data-holdout-v4-human-signoff.mjs';

const contract = JSON.parse(
  readFileSync(
    resolve(
      process.cwd(),
      '../../docs/04-测试数据/Ami-Ask统一Gold题库-v1/Ami-Ask全新独立Holdout合同-v4.json',
    ),
    'utf8',
  ),
);
const ledger = JSON.parse(
  readFileSync(
    resolve(
      process.cwd(),
      '../../docs/04-测试数据/Ami-Ask统一Gold题库-v1/Ami-Ask全新独立Holdout-v4裁定修正账本-2026-08-03.json',
    ),
    'utf8',
  ),
);

const headers = [
  'Case ID',
  '产品复核结论',
  '产品复核人',
  '产品复核日期',
  '技术复核结论',
  '技术复核人',
  '技术复核日期',
  '复核备注',
  '合同Checksum',
];

test('parses quoted commas and line breaks in a human review CSV', () => {
  const rows = parseCsv('A,B\n"x,y","line1\nline2"\n');
  assert.deepEqual(rows, [
    ['A', 'B'],
    ['x,y', 'line1\nline2'],
  ]);
});

test('accepts exactly 180 independently approved product and technical reviews', () => {
  const raw = buildCsv();
  const validation = validateHumanReviewCsv({ raw, contract });
  assert.equal(validation.records.length, 180);
  assert.deepEqual(validation.productReviewers, ['产品复核甲']);
  assert.deepEqual(validation.technicalReviewers, ['技术复核乙']);
  const record = buildHumanSignoffRecord({
    validation,
    contract,
    ledger,
    reviewSourcePath: 'outputs/review.csv',
  });
  assert.equal(record.status, 'approved');
  assert.equal(record.reviewedCaseCount, 180);
  assert.equal(record.contractChecksum, contract.contractChecksum);
  assert.equal(record.firstUnseenChecksum, ledger.firstUnseenChecksum);
  assert.equal(record.preservedFacts.holdoutE2eP95Ms, 40622);
});

test('rejects pending reviews and missing reviewer identities', () => {
  const raw = buildCsv({ mutate: (row, index) => {
    if (index === 0) {
      row[1] = '待复核';
      row[2] = '';
    }
  } });
  assertInvalid(raw, ['row_2_产品_decision_not_approved:待复核', 'row_2_产品_reviewer_missing']);
});

test('rejects the same reviewer acting as both product and technical reviewer', () => {
  const raw = buildCsv({ mutate: (row, index) => {
    if (index === 0) row[5] = row[2];
  } });
  assertInvalid(raw, ['row_2_reviewers_not_independent:ask_holdout_v4:V4-Q001']);
});

test('rejects reviewer role overlap even when it occurs on different cases', () => {
  const raw = buildCsv({ mutate: (row, index) => {
    if (index === 0) row[2] = '复核人丙';
    if (index === 1) row[5] = '复核人丙';
  } });
  assertInvalid(raw, ['reviewer_role_overlap:复核人丙']);
});

test('requires an explanation when either reviewer marks a case for correction', () => {
  const raw = buildCsv({ mutate: (row, index) => {
    if (index === 0) row[1] = '需修正';
  } });
  assertInvalid(raw, [
    'row_2_产品_decision_not_approved:需修正',
    'row_2_产品_review_note_required:需修正',
  ]);
});

test('rejects missing cases, duplicate ids and checksum drift', () => {
  const raw = buildCsv({ mutate: (row, index, rows) => {
    if (index === 0) row[8] = 'bad-checksum';
    if (index === 1) row[0] = rows[0][0];
  } });
  assertInvalid(raw, ['duplicate_case_ids:', 'missing_case_ids:', 'checksum_mismatch']);
});

test('rejects invalid or future review dates', () => {
  const raw = buildCsv({ mutate: (row, index) => {
    if (index === 0) row[3] = '2026-13-40';
    if (index === 1) row[6] = '2999-01-01';
  } });
  assertInvalid(raw, ['row_2_产品_review_date_invalid', 'row_3_技术_review_date_future']);
});

test('rejects review dates before the Holdout contract was frozen', () => {
  const raw = buildCsv({ mutate: (row, index) => {
    if (index === 0) row[3] = '2026-08-01';
  } });
  assertInvalid(raw, ['row_2_产品_review_date_before_freeze:2026-08-01:2026-08-03']);
});

test('strict CLI exits non-zero for a pending human review', () => {
  withTempDir((directory) => {
    const inputPath = resolve(directory, 'pending-review.csv');
    writeFileSync(
      inputPath,
      buildCsv({ mutate: (row, index) => {
        if (index === 0) row[1] = '待复核';
      } }),
      'utf8',
    );
    const result = runCli([`--input=${inputPath}`]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /holdout_human_signoff_invalid/);
    assert.match(result.stderr, /产品_decision_not_approved:待复核/);
  });
});

test('strict CLI creates an append-only record and refuses overwrite', () => {
  withTempDir((directory) => {
    const inputPath = resolve(directory, 'approved-review.csv');
    const recordPath = resolve(directory, 'human-signoff-record.json');
    writeFileSync(inputPath, buildCsv(), 'utf8');

    const first = runCli([`--input=${inputPath}`, `--write-record=${recordPath}`]);
    assert.equal(first.status, 0, first.stderr);
    const record = JSON.parse(readFileSync(recordPath, 'utf8'));
    assert.equal(record.status, 'approved');
    assert.equal(record.reviewedCaseCount, 180);

    const second = runCli([`--input=${inputPath}`, `--write-record=${recordPath}`]);
    assert.equal(second.status, 1);
    assert.match(second.stderr, /holdout_human_signoff_record_exists/);
  });
});

function buildCsv(options = {}) {
  const cases = [...contract.queryContracts, ...contract.boundaryContracts];
  const rows = cases.map((item) => [
    item.id,
    '通过',
    '产品复核甲',
    '2026-08-04',
    '通过',
    '技术复核乙',
    '2026-08-04',
    '',
    item.checksum,
  ]);
  rows.forEach((row, index) => options.mutate?.(row, index, rows));
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function assertInvalid(raw, expectedFragments) {
  assert.throws(
    () => validateHumanReviewCsv({ raw, contract }),
    (error) => {
      const joined = [error.message, ...(error.details ?? [])].join('\n');
      for (const fragment of expectedFragments) assert.match(joined, new RegExp(escapeRegExp(fragment)));
      return true;
    },
  );
}

function runCli(args) {
  return spawnSync(
    process.execPath,
    [resolve(process.cwd(), 'scripts/ask-data-holdout-v4-human-signoff.mjs'), '--strict', ...args],
    { cwd: process.cwd(), encoding: 'utf8' },
  );
}

function withTempDir(callback) {
  const directory = mkdtempSync(resolve(tmpdir(), 'ami-ask-holdout-signoff-'));
  try {
    callback(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
