import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import {
  finalizeAmiBrainEvalCheckpoint,
  loadAmiBrainEvalCheckpoint,
  removeAmiBrainEvalCheckpoint,
  writeAmiBrainEvalCheckpoint,
} from './ami-brain-eval-checkpoint.js';

describe('Ami Brain evaluation checkpoint', () => {
  const identity = {
    sourceFile: 'questions.md',
    storeId: 6,
    evaluationRoleKey: 'store_manager',
    releaseFingerprint: 'a'.repeat(64),
  };
  let directory: string;
  let path: string;

  beforeEach(() => {
    directory = mkdtempSync(resolve(tmpdir(), 'ami-brain-eval-checkpoint-'));
    path = resolve(directory, 'checkpoint.json');
  });

  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  it('writes atomically and resumes only completed product records', () => {
    writeAmiBrainEvalCheckpoint(path, identity, [
      { questionId: 'q1', status: 'usable_exact' },
      { questionId: 'q2', status: 'provider_unavailable' },
    ]);

    expect(JSON.parse(readFileSync(path, 'utf8')).schemaVersion).toBe(1);
    expect(loadAmiBrainEvalCheckpoint(path, identity, new Set(['q1', 'q2']))).toEqual([
      { questionId: 'q1', status: 'usable_exact' },
    ]);
  });

  it('fails closed when release identity or question set changes', () => {
    writeAmiBrainEvalCheckpoint(path, identity, [{ questionId: 'q1', status: 'metric_failed' }]);
    expect(() =>
      loadAmiBrainEvalCheckpoint(path, { ...identity, releaseFingerprint: 'b'.repeat(64) }, new Set(['q1'])),
    ).toThrow('checkpoint_identity_mismatch');
    expect(() => loadAmiBrainEvalCheckpoint(path, identity, new Set(['q2']))).toThrow(
      'checkpoint_question_mismatch',
    );
  });

  it('rejects malformed checkpoint payloads and supports cleanup', () => {
    writeFileSync(path, '{"schemaVersion":2}', 'utf8');
    expect(() => loadAmiBrainEvalCheckpoint(path, identity, new Set())).toThrow('checkpoint_identity_mismatch');
    removeAmiBrainEvalCheckpoint(path);
    expect(loadAmiBrainEvalCheckpoint(path, identity, new Set())).toEqual([]);
  });

  it('keeps a resumable checkpoint when provider failures remain and removes it after a clean run', () => {
    finalizeAmiBrainEvalCheckpoint(path, identity, [
      { questionId: 'q1', status: 'usable_exact' },
      { questionId: 'q2', status: 'provider_unavailable' },
    ]);
    expect(loadAmiBrainEvalCheckpoint(path, identity, new Set(['q1', 'q2']))).toEqual([
      { questionId: 'q1', status: 'usable_exact' },
    ]);

    finalizeAmiBrainEvalCheckpoint(path, identity, [
      { questionId: 'q1', status: 'usable_exact' },
      { questionId: 'q2', status: 'metric_failed' },
    ]);
    expect(loadAmiBrainEvalCheckpoint(path, identity, new Set(['q1', 'q2']))).toEqual([]);
  });
});
