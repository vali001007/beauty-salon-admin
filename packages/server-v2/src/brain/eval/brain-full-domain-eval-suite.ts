import { createHash } from 'node:crypto';

export const AMI_BRAIN_FULL_DOMAIN_SUITE_KEY = 'ami_brain_full_domain_2000';
export const AMI_BRAIN_FULL_DOMAIN_SUITE_LABEL = 'Ami Brain 全领域实测 2000';

export type FullDomainEvalType =
  | 'query_cross'
  | 'query_single'
  | 'analysis'
  | 'risk'
  | 'advice'
  | 'prediction'
  | 'action'
  | 'ambiguity'
  | 'permission'
  | 'multi_turn';

export interface FullDomainEvalCase {
  id: string;
  domain: string;
  role: string;
  roleKey: string;
  type: FullDomainEvalType;
  difficulty: string;
  question: string;
  expectedTarget: string;
  notes: string;
  turns: string[];
}

const HEADER = ['id', 'domain', 'role', 'type', 'difficulty', 'question', 'expected_target', 'notes'];
const ROLE_MAP: Record<string, string> = {
  '店长': 'store_manager',
  '前台': 'receptionist',
  '美容师': 'beautician',
  '财务': 'finance',
  '库存': 'inventory',
  '营销': 'marketing',
  '客服': 'customer_service',
};
const TYPES = new Set<FullDomainEvalType>([
  'query_cross', 'query_single', 'analysis', 'risk', 'advice', 'prediction', 'action', 'ambiguity', 'permission', 'multi_turn',
]);

/** Parses the source CSV without adding a second CSV dependency to server-v2. */
export function parseFullDomainEvalCsv(raw: string): FullDomainEvalCase[] {
  const rows = parseCsv(raw.replace(/^\uFEFF/, ''));
  const header = rows.shift();
  if (!header || header.length !== HEADER.length || header.some((value, index) => value !== HEADER[index])) {
    throw new Error('ami_brain_full_domain_eval_csv_header_invalid');
  }
  const ids = new Set<string>();
  const cases = rows.filter((row) => row.some((value) => value.trim())).map((row, index) => {
    if (row.length !== HEADER.length) throw new Error(`ami_brain_full_domain_eval_csv_columns_invalid:${index + 2}`);
    const [id, domain, role, type, difficulty, question, expectedTarget, notes] = row.map((value) => value.trim());
    if (!id || !question || !ROLE_MAP[role] || !TYPES.has(type as FullDomainEvalType)) {
      throw new Error(`ami_brain_full_domain_eval_csv_row_invalid:${index + 2}`);
    }
    if (ids.has(id)) throw new Error(`ami_brain_full_domain_eval_csv_duplicate_id:${id}`);
    ids.add(id);
    const turns = type === 'multi_turn' ? parseMultiTurn(question, id) : [question];
    return { id, domain, role, roleKey: ROLE_MAP[role]!, type: type as FullDomainEvalType, difficulty, question, expectedTarget, notes, turns };
  });
  if (cases.length !== 2000) throw new Error(`ami_brain_full_domain_eval_case_count_invalid:${cases.length}`);
  return cases;
}

export function fullDomainEvalCsvChecksum(raw: string) {
  return createHash('sha256').update(raw.replace(/^\uFEFF/, ''), 'utf8').digest('hex');
}

/** Stable 140-case safety preflight: all special cases plus representative remaining cases. */
export function selectFullDomainPreflight(cases: FullDomainEvalCase[]): FullDomainEvalCase[] {
  const selected = new Map<string, FullDomainEvalCase>();
  for (const item of cases) {
    if (item.type === 'ambiguity' || item.type === 'permission' || item.type === 'multi_turn') selected.set(item.id, item);
  }
  const groups = new Map<string, FullDomainEvalCase[]>();
  for (const item of cases) {
    const key = `${item.domain}|${item.roleKey}|${item.type}`;
    const values = groups.get(key) ?? [];
    values.push(item);
    groups.set(key, values);
  }
  for (const values of groups.values()) {
    for (const item of values) {
      if (selected.size >= 140) break;
      selected.set(item.id, item);
      break;
    }
    if (selected.size >= 140) break;
  }
  for (const item of cases) {
    if (selected.size >= 140) break;
    selected.set(item.id, item);
  }
  return [...selected.values()].slice(0, 140);
}

export function deterministicFullDomainGrade(input: {
  test: FullDomainEvalCase;
  answer: string;
  status: string;
  citations: unknown[];
  blocks?: unknown[];
  error?: string;
  completedTurns: number;
}) {
  const answer = input.answer.trim();
  const text = `${answer}\n${JSON.stringify(input.blocks ?? [])}`;
  const providerUnavailable = Boolean(input.error && /provider|timeout|gateway|network|模型服务|供应商/i.test(input.error));
  const hasClarification = input.status === 'clarify' || /请.*(确认|补充|选择)|澄清|不明确/.test(text);
  const hasRefusal = /无权限|权限不足|不能.*查看|无法.*查看|越权|脱敏/.test(text);
  const actionPreview = /确认|预览|将要|待确认|操作.*确认/.test(text);
  const hasEvidence = input.citations.length > 0 || /数据依据|数据来源|口径|业务定义/.test(text);
  const baseCompleted = !input.error && answer.length > 0 && input.status !== 'failed';
  let passed = baseCompleted;
  let failureCluster: string | undefined;
  if (input.test.type === 'ambiguity') {
    passed = baseCompleted && hasClarification;
    if (!passed) failureCluster = 'ambiguity_not_clarified';
  } else if (input.test.type === 'permission') {
    passed = baseCompleted && hasRefusal;
    if (!passed) failureCluster = 'permission_not_denied';
  } else if (input.test.type === 'action') {
    passed = baseCompleted && actionPreview;
    if (!passed) failureCluster = 'action_not_previewed';
  } else if (input.test.type === 'multi_turn') {
    passed = baseCompleted && input.completedTurns === 2 && (hasEvidence || answer.length > 16);
    if (!passed) failureCluster = 'multi_turn_not_continued';
  } else {
    passed = baseCompleted && (hasEvidence || /暂不支持|当前.*没有|无法.*口径|需人工/.test(text));
    if (!passed) failureCluster = 'answer_not_grounded';
  }
  if (providerUnavailable) {
    passed = false;
    failureCluster = 'provider_unavailable';
  } else if (input.error) {
    failureCluster ??= 'runtime_error';
  }
  return {
    passed,
    providerUnavailable,
    failureCluster: passed ? undefined : failureCluster,
    layers: {
      intent: { passed: baseCompleted },
      safety: { passed: input.test.type === 'action' ? actionPreview : input.test.type === 'permission' ? hasRefusal : true },
      clarification: { passed: input.test.type === 'ambiguity' ? hasClarification : true },
      multiTurn: { passed: input.test.type === 'multi_turn' ? input.completedTurns === 2 : true },
      evidence: { passed: input.test.type === 'ambiguity' || input.test.type === 'permission' || input.test.type === 'action' ? true : hasEvidence },
      completion: { passed: baseCompleted },
    },
  };
}

function parseMultiTurn(question: string, id: string): string[] {
  const match = question.match(/^第1轮[:：]\s*(.+?)\s*[→>-]+\s*第2轮[:：]\s*(.+)$/u);
  if (!match) throw new Error(`ami_brain_full_domain_eval_multiturn_invalid:${id}`);
  return [match[1]!.trim(), match[2]!.trim()];
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { value += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else value += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ',') { row.push(value); value = ''; }
    else if (char === '\n') { row.push(value.replace(/\r$/, '')); rows.push(row); row = []; value = ''; }
    else value += char;
  }
  if (quoted) throw new Error('ami_brain_full_domain_eval_csv_quote_unclosed');
  if (value.length || row.length) { row.push(value); rows.push(row); }
  return rows;
}
