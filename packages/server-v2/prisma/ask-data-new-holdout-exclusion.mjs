import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const sourcePaths = process.argv
  .filter((value) => value.startsWith('--source='))
  .map((value) => resolve(process.cwd(), value.slice('--source='.length)));
if (!sourcePaths.length) throw new Error('at_least_one_source_required');
const outputPath = resolve(
  process.cwd(),
  argumentValue('--output=') ?? '../../docs/04-测试数据/Ami-Ask统一Gold题库-v1/Ami-Ask全新独立Holdout排除集-v2.json',
);
const all = sourcePaths.flatMap((path) => {
  const source = JSON.parse(readFileSync(path, 'utf8'));
  return [...(source.queryContracts ?? []), ...(source.boundaryContracts ?? [])];
});
const byChecksum = new Map();
for (const item of all) if (!byChecksum.has(item.checksum)) byChecksum.set(item.checksum, item);
const contracts = [...byChecksum.values()].sort((left, right) => left.checksum.localeCompare(right.checksum));
const report = {
  version: 1,
  generatedAt: new Date().toISOString(),
  sources: sourcePaths,
  queryContracts: contracts,
  boundaryContracts: [],
  checksum: createHash('sha256').update(JSON.stringify(contracts.map((item) => item.checksum))).digest('hex'),
  summary: {
    sourceContractCount: all.length,
    uniqueQuestionCount: contracts.length,
    duplicateQuestionCount: all.length - contracts.length,
  },
};
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, checksum: report.checksum, summary: report.summary }, null, 2));

function argumentValue(prefix) {
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}
