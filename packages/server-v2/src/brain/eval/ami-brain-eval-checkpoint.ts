import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';

export interface AmiBrainEvalCheckpointIdentity {
  sourceFile: string;
  storeId: number;
  evaluationRoleKey: string;
  releaseFingerprint: string;
}

export interface AmiBrainEvalCheckpointRecord {
  questionId: string;
  status: string;
}

export function loadAmiBrainEvalCheckpoint<T extends AmiBrainEvalCheckpointRecord>(
  path: string,
  identity: AmiBrainEvalCheckpointIdentity,
  validQuestionIds: ReadonlySet<string>,
): T[] {
  if (!existsSync(path)) return [];
  const payload = JSON.parse(readFileSync(path, 'utf8')) as {
    schemaVersion?: unknown;
    identity?: unknown;
    records?: unknown;
  };
  if (payload.schemaVersion !== 1 || !sameIdentity(payload.identity, identity) || !Array.isArray(payload.records)) {
    throw new Error('ami_brain_eval_checkpoint_identity_mismatch');
  }
  const records = payload.records.filter(isCheckpointRecord) as T[];
  if (records.some((record) => !validQuestionIds.has(record.questionId))) {
    throw new Error('ami_brain_eval_checkpoint_question_mismatch');
  }
  return records.filter((record) => record.status !== 'provider_unavailable');
}

export function writeAmiBrainEvalCheckpoint<T extends AmiBrainEvalCheckpointRecord>(
  path: string,
  identity: AmiBrainEvalCheckpointIdentity,
  records: readonly T[],
) {
  const temporaryPath = `${path}.tmp`;
  writeFileSync(
    temporaryPath,
    `${JSON.stringify({ schemaVersion: 1, updatedAt: new Date().toISOString(), identity, records }, null, 2)}\n`,
    'utf8',
  );
  renameSync(temporaryPath, path);
}

export function removeAmiBrainEvalCheckpoint(path: string) {
  if (existsSync(path)) unlinkSync(path);
}

export function finalizeAmiBrainEvalCheckpoint<T extends AmiBrainEvalCheckpointRecord>(
  path: string,
  identity: AmiBrainEvalCheckpointIdentity | undefined,
  records: readonly T[],
) {
  if (!identity) return;
  if (records.some((record) => record.status === 'provider_unavailable')) {
    writeAmiBrainEvalCheckpoint(path, identity, records);
    return;
  }
  removeAmiBrainEvalCheckpoint(path);
}

function sameIdentity(value: unknown, expected: AmiBrainEvalCheckpointIdentity) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = value as Record<string, unknown>;
  return (
    actual.sourceFile === expected.sourceFile &&
    actual.storeId === expected.storeId &&
    actual.evaluationRoleKey === expected.evaluationRoleKey &&
    actual.releaseFingerprint === expected.releaseFingerprint
  );
}

function isCheckpointRecord(value: unknown): value is AmiBrainEvalCheckpointRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.questionId === 'string' && typeof record.status === 'string';
}
