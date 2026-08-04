import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '../../..');
const HOLDOUT_DIR = resolve(REPO_ROOT, 'docs/04-测试数据/Ami-Ask统一Gold题库-v1');
const CONTRACT_PATH = resolve(HOLDOUT_DIR, 'Ami-Ask全新独立Holdout合同-v4.json');
const LEDGER_PATH = resolve(
  HOLDOUT_DIR,
  'Ami-Ask全新独立Holdout-v4裁定修正账本-2026-08-03.json',
);

const REQUIRED_HEADERS = Object.freeze([
  'Case ID',
  '产品复核结论',
  '产品复核人',
  '产品复核日期',
  '技术复核结论',
  '技术复核人',
  '技术复核日期',
  '复核备注',
  '合同Checksum',
]);

const APPROVED = '通过';

export function parseCsv(raw) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (quoted) {
      if (char === '"' && raw[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error('holdout_human_signoff_csv_unclosed_quote');
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}

export function validateHumanReviewCsv(input) {
  const raw = input.raw.replace(/^\uFEFF/, '');
  const table = parseCsv(raw);
  if (table.length === 0) throw new Error('holdout_human_signoff_csv_empty');
  const headers = table[0].map((value) => value.trim());
  const duplicateHeaders = duplicates(headers.filter(Boolean));
  if (duplicateHeaders.length > 0) {
    throw new Error(`holdout_human_signoff_duplicate_headers:${duplicateHeaders.join(',')}`);
  }
  const missingHeaders = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  if (missingHeaders.length > 0) {
    throw new Error(`holdout_human_signoff_missing_headers:${missingHeaders.join(',')}`);
  }

  const contractCases = [...input.contract.queryContracts, ...input.contract.boundaryContracts];
  const contractById = new Map(contractCases.map((item) => [item.id, item]));
  const records = table
    .slice(1)
    .filter((values) => values.some((value) => value.trim() !== ''))
    .map((values, rowOffset) => {
      const record = Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? '']));
      return { ...record, __rowNumber: rowOffset + 2 };
    });

  const errors = [];
  const ids = records.map((record) => record['Case ID']);
  const duplicateIds = duplicates(ids.filter(Boolean));
  if (duplicateIds.length > 0) errors.push(summarizeIds('duplicate_case_ids', duplicateIds));
  const unknownIds = ids.filter((id) => id && !contractById.has(id));
  if (unknownIds.length > 0) errors.push(summarizeIds('unknown_case_ids', [...new Set(unknownIds)]));
  const missingIds = contractCases.map((item) => item.id).filter((id) => !ids.includes(id));
  if (missingIds.length > 0) errors.push(summarizeIds('missing_case_ids', missingIds));
  if (records.length !== contractCases.length) {
    errors.push(`row_count_mismatch:${records.length}:${contractCases.length}`);
  }

  const productReviewers = new Set();
  const technicalReviewers = new Set();
  const reviewDates = [];
  for (const record of records) {
    const row = record.__rowNumber;
    const id = record['Case ID'];
    const contractCase = contractById.get(id);
    if (!contractCase) continue;
    if (record['合同Checksum'] !== contractCase.checksum) {
      errors.push(`row_${row}_checksum_mismatch:${id}`);
    }
    const frozenDate = String(input.contract.frozenAt ?? '').slice(0, 10);
    validateDecision(record, '产品', row, errors, frozenDate);
    validateDecision(record, '技术', row, errors, frozenDate);
    const productReviewer = record['产品复核人'];
    const technicalReviewer = record['技术复核人'];
    if (productReviewer && technicalReviewer && normalizeReviewer(productReviewer) === normalizeReviewer(technicalReviewer)) {
      errors.push(`row_${row}_reviewers_not_independent:${id}`);
    }
    if (productReviewer) productReviewers.add(productReviewer);
    if (technicalReviewer) technicalReviewers.add(technicalReviewer);
    for (const key of ['产品复核日期', '技术复核日期']) {
      const value = record[key];
      if (isIsoDate(value)) reviewDates.push(value);
    }
  }

  const reviewerRoleOverlap = [...productReviewers].filter((reviewer) =>
    [...technicalReviewers].some(
      (technicalReviewer) => normalizeReviewer(technicalReviewer) === normalizeReviewer(reviewer),
    ),
  );
  if (reviewerRoleOverlap.length > 0) {
    errors.push(`reviewer_role_overlap:${reviewerRoleOverlap.join(',')}`);
  }

  if (errors.length > 0) {
    const error = new Error(`holdout_human_signoff_invalid:${errors.length}`);
    error.details = errors;
    throw error;
  }

  return Object.freeze({
    records: Object.freeze(records.map(({ __rowNumber, ...record }) => Object.freeze(record))),
    productReviewers: Object.freeze([...productReviewers].sort()),
    technicalReviewers: Object.freeze([...technicalReviewers].sort()),
    reviewDates: Object.freeze([...new Set(reviewDates)].sort()),
    reviewSourceChecksum: sha256(raw),
  });
}

export function buildHumanSignoffRecord(input) {
  const latestReviewDate = input.validation.reviewDates.at(-1) ?? null;
  return Object.freeze({
    version: 1,
    status: 'approved',
    reviewType: 'independent_product_and_technical_human_review',
    contractVersion: input.contract.version,
    contractChecksum: input.contract.contractChecksum,
    frozenChecksum: input.contract.checksum,
    firstUnseenChecksum: input.ledger.firstUnseenChecksum,
    adjudicationChecksum: input.ledger.adjudicationChecksum,
    reviewedCaseCount: input.validation.records.length,
    productReviewers: input.validation.productReviewers,
    technicalReviewers: input.validation.technicalReviewers,
    latestReviewDate,
    reviewSourcePath: input.reviewSourcePath,
    reviewSourceChecksum: input.validation.reviewSourceChecksum,
    signedAt: new Date().toISOString(),
    preservedFacts: Object.freeze({
      firstUnseenDidNotMeetGate: true,
      developmentRegressionIsNotFirstUnseenGeneralization: true,
      holdoutE2eP95Ms: 40622,
    }),
  });
}

function validateDecision(record, roleLabel, row, errors, frozenDate) {
  const decision = record[`${roleLabel}复核结论`];
  const reviewer = record[`${roleLabel}复核人`];
  const date = record[`${roleLabel}复核日期`];
  if (decision !== APPROVED) errors.push(`row_${row}_${roleLabel}_decision_not_approved:${decision || 'blank'}`);
  if ((decision === '需修正' || decision === '不适用') && !record['复核备注']) {
    errors.push(`row_${row}_${roleLabel}_review_note_required:${decision}`);
  }
  if (reviewer.length < 2) errors.push(`row_${row}_${roleLabel}_reviewer_missing`);
  if (!isIsoDate(date)) errors.push(`row_${row}_${roleLabel}_review_date_invalid:${date || 'blank'}`);
  else if (date > todayIso()) errors.push(`row_${row}_${roleLabel}_review_date_future:${date}`);
  else if (isIsoDate(frozenDate) && date < frozenDate) {
    errors.push(`row_${row}_${roleLabel}_review_date_before_freeze:${date}:${frozenDate}`);
  }
}

function normalizeReviewer(value) {
  return value.trim().toLocaleLowerCase('zh-CN').replace(/\s+/g, '');
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function duplicates(values) {
  const seen = new Set();
  const duplicated = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicated.add(value);
    seen.add(value);
  }
  return [...duplicated];
}

function summarizeIds(label, ids) {
  const sample = ids.slice(0, 10).join(',');
  return `${label}:${ids.length}:${sample}${ids.length > 10 ? ',...' : ''}`;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function parseArgs(argv) {
  const values = {};
  for (const arg of argv) {
    if (arg.startsWith('--input=')) values.input = arg.slice('--input='.length);
    else if (arg.startsWith('--write-record=')) values.writeRecord = arg.slice('--write-record='.length);
    else if (arg === '--strict') values.strict = true;
    else throw new Error(`holdout_human_signoff_unknown_argument:${arg}`);
  }
  return values;
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (!args.input) throw new Error('holdout_human_signoff_input_required');
  const inputPath = resolve(process.cwd(), args.input);
  if (!existsSync(inputPath)) throw new Error(`holdout_human_signoff_input_missing:${inputPath}`);
  const contract = readJson(CONTRACT_PATH);
  const ledger = readJson(LEDGER_PATH);
  const raw = readFileSync(inputPath, 'utf8');
  try {
    const validation = validateHumanReviewCsv({ raw, contract });
    const record = buildHumanSignoffRecord({
      validation,
      contract,
      ledger,
      reviewSourcePath: relative(REPO_ROOT, inputPath),
    });
    if (args.writeRecord) {
      const recordPath = resolve(process.cwd(), args.writeRecord);
      if (existsSync(recordPath)) throw new Error(`holdout_human_signoff_record_exists:${recordPath}`);
      writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    }
    console.log(JSON.stringify({ status: 'pass', record }, null, 2));
    return record;
  } catch (error) {
    const details = Array.isArray(error?.details) ? error.details : [];
    console.error(
      JSON.stringify(
        {
          status: 'fail',
          reason: error instanceof Error ? error.message : String(error),
          details,
        },
        null,
        2,
      ),
    );
    if (args.strict) process.exitCode = 1;
    return null;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(
      JSON.stringify(
        { status: 'fail', reason: error instanceof Error ? error.message : String(error) },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  }
}
