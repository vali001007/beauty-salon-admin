import { resolve } from 'node:path';
import { parseAmiBrainEvalOptions } from './ami-brain-eval-options.js';

describe('parseAmiBrainEvalOptions', () => {
  it('parses an explicit candidate release for offline development evaluation', () => {
    expect(
      parseAmiBrainEvalOptions(
        ['--store-id=6', '--release-id=21', '--gate=p0', '--limit=10', '--persona=finance', '--question-ids=q1,q2,q1', '--evaluation-role=cashier', '--output-dir=outputs/eval'],
        'default-output',
      ),
    ).toEqual({
      storeId: 6,
      releaseId: 21,
      gate: 'p0',
      concurrency: 1,
      resume: false,
      checkpointEvery: 25,
      providerFailureThreshold: 8,
      limit: 10,
      persona: 'finance',
      questionIds: ['q1', 'q2'],
      evaluationRoleKey: 'cashier',
      outputDir: resolve('outputs/eval'),
    });
  });

  it.each(['--release-id=0', '--release-id=-1', '--release-id=abc', '--release-id=1.5'])(
    'fails closed for an invalid explicit release id: %s',
    (arg) => {
      expect(() => parseAmiBrainEvalOptions([arg], 'default-output')).toThrow('Invalid release-id');
    },
  );

  it('omits the candidate release override when no release id was requested', () => {
    expect(parseAmiBrainEvalOptions([], 'default-output')).toEqual({
      storeId: 1,
      concurrency: 1,
      resume: false,
      checkpointEvery: 25,
      providerFailureThreshold: 8,
      evaluationRoleKey: 'persona',
      outputDir: resolve('default-output'),
    });
  });

  it('accepts bounded evaluation concurrency', () => {
    expect(parseAmiBrainEvalOptions(['--concurrency=4'], 'default-output').concurrency).toBe(4);
    expect(parseAmiBrainEvalOptions(['--concurrency=99'], 'default-output').concurrency).toBe(8);
  });

  it('resolves an explicit question source file', () => {
    expect(
      parseAmiBrainEvalOptions(['--question-file=docs/paraphrases.json'], 'default-output').questionFile,
    ).toBe(resolve('docs/paraphrases.json'));
  });

  it('parses resumable evaluation safety controls with upper bounds', () => {
    expect(
      parseAmiBrainEvalOptions(
        ['--resume=true', '--checkpoint-every=10', '--provider-failure-threshold=12'],
        'default-output',
      ),
    ).toMatchObject({ resume: true, checkpointEvery: 10, providerFailureThreshold: 12 });
    expect(
      parseAmiBrainEvalOptions(
        ['--checkpoint-every=999', '--provider-failure-threshold=999'],
        'default-output',
      ),
    ).toMatchObject({ checkpointEvery: 100, providerFailureThreshold: 50 });
  });

  it('fails closed for an invalid resume flag', () => {
    expect(() => parseAmiBrainEvalOptions(['--resume=yes'], 'default-output')).toThrow('Invalid resume');
  });

  it('fails closed for an unsupported named gate', () => {
    expect(() => parseAmiBrainEvalOptions(['--gate=first-120'], 'default-output')).toThrow('Invalid gate');
  });

  it('fails closed for an explicitly empty evaluation role', () => {
    expect(() => parseAmiBrainEvalOptions(['--evaluation-role='], 'default-output')).toThrow(
      'Invalid evaluation-role',
    );
  });

  it('fails closed for an explicitly empty question id list', () => {
    expect(() => parseAmiBrainEvalOptions(['--question-ids='], 'default-output')).toThrow(
      'Invalid question-ids',
    );
  });
});
