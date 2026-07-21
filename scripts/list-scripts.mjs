import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifests = [
  ['root', 'package.json'],
  ['server-v2', 'packages/server-v2/package.json'],
  ['kiosk', 'packages/Ami-Aura-Lite-Kiosk/package.json'],
  ['ami-glow-h5', 'packages/Ami-Glow-H5/package.json'],
  ['miniapp', 'packages/Ami-Glow-MiniApp/package.json'],
  ['marketing-h5', 'packages/marketing-h5/package.json'],
  ['app', 'packages/app/package.json'],
];
const filter = process.argv.slice(2).find((arg) => !arg.startsWith('--'))?.toLowerCase();
const rows = manifests.flatMap(([scope, manifestPath]) => {
  const manifest = JSON.parse(readFileSync(path.join(repoRoot, manifestPath), 'utf8'));
  return Object.entries(manifest.scripts ?? {}).map(([name, command]) => ({ scope, name, command }));
});

if (filter) {
  const matches = rows.filter(({ scope, name }) => `${scope}:${name}`.toLowerCase().includes(filter));
  if (!matches.length) {
    console.error(`[scripts:list] 未找到包含“${filter}”的命令。`);
    process.exit(1);
  }
  for (const { scope, name, command } of matches) {
    console.log(`${scope.padEnd(14)} ${name.padEnd(48)} ${command}`);
  }
  process.exit(0);
}

const groups = new Map();
for (const row of rows) {
  const prefix = row.name.split(':')[0];
  groups.set(prefix, (groups.get(prefix) ?? 0) + 1);
}

console.log('[scripts:list] 命令分组');
for (const [group, count] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  console.log(`- ${group.padEnd(24)} ${String(count).padStart(3)}`);
}
console.log('');
console.log('查看具体命令：npm run scripts:list -- <关键词>');
console.log('示例：npm run scripts:list -- brain');
