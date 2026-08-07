import { describe, expect, it } from 'vitest';
import { resolveEnvironmentBanner } from './EnvironmentBanner';

describe('resolveEnvironmentBanner', () => {
  it.each([
    ['local-synthetic', '本地合成数据'],
    ['supabase-development', 'Supabase 开发数据'],
    ['candidate-signoff', '候选签收环境'],
  ])('maps %s to a visible product label', (dataEnvironment, title) => {
    expect(resolveEnvironmentBanner({ VITE_AMI_DATA_ENV: dataEnvironment })?.title).toBe(title);
  });

  it('stays hidden when no explicit environment identity is present', () => {
    expect(resolveEnvironmentBanner({})).toBeNull();
  });
});
