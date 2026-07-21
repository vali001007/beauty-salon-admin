import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertNoCapabilityOutputOverrides, loadWorkspaceEnvironment } from './brain-capability-cli.helpers.js';

describe('brain capability CLI helpers', () => {
  const loadedKey = 'AMI_BRAIN_CAPABILITY_ENV_TEST_LOADED';
  const preservedKey = 'AMI_BRAIN_CAPABILITY_ENV_TEST_PRESERVED';
  let workspaceRoot: string;
  let previousLoaded: string | undefined;
  let previousPreserved: string | undefined;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), 'ami-brain-capability-env-'));
    await mkdir(join(workspaceRoot, 'packages', 'server-v2'), { recursive: true });
    previousLoaded = process.env[loadedKey];
    previousPreserved = process.env[preservedKey];
    delete process.env[loadedKey];
    process.env[preservedKey] = 'external-value';
  });

  afterEach(async () => {
    restoreEnvironment(loadedKey, previousLoaded);
    restoreEnvironment(preservedKey, previousPreserved);
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it('loads the server env file without overriding externally supplied values', async () => {
    await writeFile(
      join(workspaceRoot, 'packages', 'server-v2', '.env'),
      `${loadedKey}=loaded-from-file\n${preservedKey}=file-value\n`,
      'utf8',
    );

    expect(loadWorkspaceEnvironment(workspaceRoot)).toBe(true);
    expect(process.env[loadedKey]).toBe('loaded-from-file');
    expect(process.env[preservedKey]).toBe('external-value');
  });

  it('does nothing when the server env file is absent', () => {
    expect(loadWorkspaceEnvironment(workspaceRoot)).toBe(false);
    expect(process.env[loadedKey]).toBeUndefined();
    expect(process.env[preservedKey]).toBe('external-value');
  });

  it.each(['--output-dir=C:/tmp/bundle', '--output=C:/tmp/report.json', '--md=C:/tmp/report.md'])(
    'rejects deprecated caller-controlled generation output option %s',
    (option) => {
      expect(() => assertNoCapabilityOutputOverrides([option])).toThrow(
        'Capability generation output overrides are disabled',
      );
    },
  );

  it('accepts generation CLI arguments without output overrides', () => {
    expect(() => assertNoCapabilityOutputOverrides(['--deterministic-fixture'])).not.toThrow();
  });
});

function restoreEnvironment(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
