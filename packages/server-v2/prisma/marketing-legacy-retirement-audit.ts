import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  evaluateMarketingLegacyRetirement,
  type MarketingLegacyLogExport,
} from '../src/marketing/retirement/marketing-legacy-retirement-gate.ts';

function readArgument(name: string) {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const logExportPath = readArgument('log-export') ?? process.env.MARKETING_LEGACY_LOG_EXPORT;
  if (!logExportPath) throw new Error('MARKETING_LEGACY_LOG_EXPORT or --log-export is required');
  const absolutePath = resolve(process.cwd(), logExportPath);
  const content = await readFile(absolutePath, 'utf8');
  const input = JSON.parse(content) as MarketingLegacyLogExport;
  const result = evaluateMarketingLegacyRetirement(input);
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: absolutePath,
    ...result,
  }, null, 2));
  if (!result.passed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({
    generatedAt: new Date().toISOString(),
    mode: 'read_only',
    passed: false,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exitCode = 1;
});
