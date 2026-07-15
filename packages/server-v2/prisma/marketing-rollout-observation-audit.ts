import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  evaluateMarketingRolloutObservation,
  type MarketingRolloutObservationExport,
  type MarketingRolloutRequirement,
} from '../src/marketing/retirement/marketing-rollout-observation-gate.ts';

function readArgument(name: string) {
  const prefix = `--${name}=`;
  return process.argv
    .slice(2)
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
}

function parseRequirement(value: string | undefined): MarketingRolloutRequirement {
  const requirement = value ?? 'all';
  if (requirement === 'worker' || requirement === 'facts' || requirement === 'all') return requirement;
  throw new Error('--require must be worker, facts, or all');
}

async function main() {
  const exportPath = readArgument('observation-export') ?? process.env.MARKETING_ROLLOUT_OBSERVATION_EXPORT;
  if (!exportPath) {
    throw new Error('MARKETING_ROLLOUT_OBSERVATION_EXPORT or --observation-export is required');
  }
  const requirement = parseRequirement(readArgument('require'));
  const absolutePath = resolve(process.cwd(), exportPath);
  const content = await readFile(absolutePath, 'utf8');
  const input = JSON.parse(content) as MarketingRolloutObservationExport;
  const result = evaluateMarketingRolloutObservation(input, new Date(), { requirement });
  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: absolutePath,
        ...result,
      },
      null,
      2,
    ),
  );
  if (!result.passed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        mode: 'read_only',
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
