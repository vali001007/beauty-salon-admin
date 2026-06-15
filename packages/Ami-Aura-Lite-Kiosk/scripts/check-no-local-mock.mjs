import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const srcDir = join(root, "src", "app");
const blockedPatterns = [
  /\bmockData\b/,
  /\bLEGACY_FIGMA_COMPAT_DATA\b/,
  /\bPENDING_RECEIPTS\b/,
  /\bCARD_CATALOG\b/,
  /\bconst\s+CUSTOMERS\b/,
  /\bconst\s+SERVICES\b/,
  /\bconst\s+STORES\b/,
];

function collectFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return collectFiles(fullPath);
    if (!/\.(ts|tsx)$/.test(entry.name)) return [];
    if (/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) return [];
    return [fullPath];
  });
}

const violations = [];

for (const file of collectFiles(srcDir)) {
  const content = readFileSync(file, "utf8");
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (blockedPatterns.some((pattern) => pattern.test(line))) {
      violations.push(`${relative(root, file)}:${index + 1}: ${line.trim()}`);
    }
  });
}

if (violations.length) {
  console.error("Ami Aura Lite non-test code still contains retired local mock data:");
  violations.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log("Ami Aura Lite local mock guard passed.");
