import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const checks = [
  {
    dir: join(root, 'src', 'app'),
    patterns: [
      /\bmockCustomers\b/,
      /模拟AI回复/,
      /模拟AI分析/,
      /api\/mock\/data/,
      /@\/api\/mock/,
    ],
  },
  {
    dir: join(root, 'src', 'api'),
    patterns: [
      /api\/mock\/data/,
    ],
    ignore: (file) => file.includes(`${join('src', 'api', 'mock')}`),
  },
];

function collectFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return collectFiles(fullPath);
    if (!/\.(ts|tsx|js|jsx)$/.test(entry.name)) return [];
    if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(entry.name)) return [];
    return [fullPath];
  });
}

const violations = [];

for (const check of checks) {
  for (const file of collectFiles(check.dir)) {
    if (check.ignore?.(file)) continue;
    const content = readFileSync(file, 'utf8');
    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (check.patterns.some((pattern) => pattern.test(line))) {
        violations.push(`${relative(root, file)}:${index + 1}: ${line.trim()}`);
      }
    });
  }
}

const appViteConfig = join(root, 'packages', 'app', 'vite.config.ts');
if (existsSync(appViteConfig)) {
  const content = readFileSync(appViteConfig, 'utf8');
  if (content.includes('fs.existsSync(localSrc) ? localSrc : vendorSrc') && !content.includes('ALLOW_VENDOR_SRC_FALLBACK')) {
    violations.push('packages/app/vite.config.ts: vendor-src fallback is enabled without ALLOW_VENDOR_SRC_FALLBACK gate');
  }
}

if (violations.length) {
  console.error('Runtime mock boundary check failed:');
  violations.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log('Runtime mock boundary check passed.');
