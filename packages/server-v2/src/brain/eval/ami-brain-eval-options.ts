import { resolve } from 'node:path';
import type { AgentQuestionBankPersona } from '../../agent/agent-eval-question-bank.js';

export type AmiBrainEvalOptions = {
  questionFile?: string;
  regressionFrom?: string;
  regressionScope?: 'product' | 'provider' | 'all';
  gate?: 'p0';
  limit?: number;
  persona?: AgentQuestionBankPersona;
  questionIds?: string[];
  storeId: number;
  releaseId?: number;
  concurrency: number;
  resume: boolean;
  checkpointEvery: number;
  providerFailureThreshold: number;
  evaluationRoleKey: string;
  outputDir: string;
};

export function parseAmiBrainEvalOptions(args: string[], defaultOutputDir: string): AmiBrainEvalOptions {
  const questionFile = optionalResolvedPathArg(args, 'question-file');
  const regressionFrom = optionalResolvedPathArg(args, 'regression-from');
  const gate = parseGate(stringArg(args, 'gate'));
  return {
    ...(questionFile ? { questionFile } : {}),
    ...(regressionFrom ? { regressionFrom, regressionScope: parseRegressionScope(stringArg(args, 'regression-scope')) } : {}),
    ...(gate ? { gate } : {}),
    limit: positiveIntegerArg(args, 'limit'),
    persona: parsePersona(stringArg(args, 'persona')),
    questionIds: listArg(args, 'question-ids'),
    storeId: positiveIntegerArg(args, 'store-id') ?? 1,
    releaseId: strictOptionalPositiveIntegerArg(args, 'release-id'),
    concurrency: Math.min(8, positiveIntegerArg(args, 'concurrency') ?? 1),
    resume: booleanArg(args, 'resume') ?? false,
    checkpointEvery: Math.min(100, positiveIntegerArg(args, 'checkpoint-every') ?? 25),
    providerFailureThreshold: Math.min(50, positiveIntegerArg(args, 'provider-failure-threshold') ?? 8),
    evaluationRoleKey: nonEmptyStringArg(args, 'evaluation-role') ?? 'persona',
    outputDir: resolve(stringArg(args, 'output-dir') ?? defaultOutputDir),
  };
}

function parseRegressionScope(value?: string): 'product' | 'provider' | 'all' {
  if (value === undefined || value === 'product') return 'product';
  if (value === 'provider' || value === 'all') return value;
  throw new Error(`Invalid regression-scope: ${value}`);
}

function parseGate(value?: string): 'p0' | undefined {
  if (value === undefined) return undefined;
  if (value === 'p0') return value;
  throw new Error(`Invalid gate: ${value}`);
}

function optionalResolvedPathArg(args: string[], name: string) {
  const value = nonEmptyStringArg(args, name);
  return value ? resolve(value) : undefined;
}

function booleanArg(args: string[], name: string) {
  const raw = stringArg(args, name);
  if (raw === undefined) return undefined;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`Invalid ${name}: ${raw}`);
}

function stringArg(args: string[], name: string) {
  const prefix = `--${name}=`;
  const found = args.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length).trim() : undefined;
}

function positiveIntegerArg(args: string[], name: string) {
  const value = Number(stringArg(args, name));
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function nonEmptyStringArg(args: string[], name: string) {
  const value = stringArg(args, name);
  if (value === undefined) return undefined;
  if (!value) throw new Error(`Invalid ${name}: empty`);
  return value;
}

function listArg(args: string[], name: string) {
  const raw = stringArg(args, name);
  if (raw === undefined) return undefined;
  const values = [...new Set(raw.split(',').map((item) => item.trim()).filter(Boolean))];
  if (!values.length) throw new Error(`Invalid ${name}: empty`);
  return values;
}

function strictOptionalPositiveIntegerArg(args: string[], name: string) {
  const raw = stringArg(args, name);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`Invalid ${name}: ${raw}`);
  return value;
}

function parsePersona(value?: string): AgentQuestionBankPersona | undefined {
  if (!value) return undefined;
  const allowed: AgentQuestionBankPersona[] = ['manager', 'marketing', 'reception', 'beautician', 'inventory', 'finance', 'edge'];
  if (!allowed.includes(value as AgentQuestionBankPersona)) throw new Error(`Unsupported persona: ${value}`);
  return value as AgentQuestionBankPersona;
}
