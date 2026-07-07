import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { buildAgentV2KnowledgeGraph, renderKnowledgeGraphGeneratedFile } from '../src/agent-v2/knowledge-graph/knowledge-graph-builder.js';
import type {
  KnowledgeGraphControllerEndpointSource,
  KnowledgeGraphFrontendRouteSource,
  KnowledgeGraphManualOverrideSource,
  KnowledgeGraphSemanticTermSource,
  KnowledgeGraphSnapshot,
} from '../src/agent-v2/knowledge-graph/knowledge-graph.types.js';
import { listAgentV2CapabilityManifests } from '../src/agent-v2/capability/agent-v2-capability-manifest.js';

const serverRoot = resolve(process.cwd());
const workspaceRoot = resolve(serverRoot, '../..');
const docsRoot = resolve(workspaceRoot, 'docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03');
const schemaPath = resolve(serverRoot, 'prisma/schema.prisma');
const businessObjectCatalogPath = resolve(serverRoot, 'src/agent/knowledge/business-object.catalog.ts');
const semanticLexiconPath = resolve(serverRoot, 'src/agent/knowledge/business-semantic-lexicon.ts');
const serverSrcRoot = resolve(serverRoot, 'src');
const frontendRoutesPath = resolve(workspaceRoot, 'src/app/routes.tsx');

const generatedTsPath = resolve(serverRoot, 'src/agent-v2/knowledge-graph/generated/knowledge-graph.generated.ts');
const outputJsonPath = resolve(docsRoot, 'knowledge-graph.json');
const outputReportPath = resolve(docsRoot, 'knowledge-graph-report.md');

async function main() {
  const generatedAt = formatShanghaiTime(new Date());
  const schema = readRequired(schemaPath);
  const controllerEndpoints = parseControllerEndpoints(serverSrcRoot);
  const frontendRoutes = parseFrontendRoutes(frontendRoutesPath);
  const semanticTerms = parseSemanticTerms(semanticLexiconPath);
  const manualOverrides = await loadManualOverrides();
  const snapshot = buildAgentV2KnowledgeGraph({
    generatedAt,
    schema,
    schemaPath: relativePath(schemaPath),
    businessObjectCatalogPath: relativePath(businessObjectCatalogPath),
    semanticLexiconPath: relativePath(semanticLexiconPath),
    manifests: listAgentV2CapabilityManifests(),
    controllerEndpoints,
    frontendRoutes,
    semanticTerms,
    manualOverrides,
  });

  writeText(generatedTsPath, renderKnowledgeGraphGeneratedFile(snapshot));
  writeJson(outputJsonPath, snapshot);
  writeText(outputReportPath, renderMarkdownReport(snapshot));

  const summary = {
    generatedAt,
    passed: snapshot.report.passed,
    schemaHash: snapshot.schemaHash,
    nodes: snapshot.summary.nodeCount,
    edges: snapshot.summary.edgeCount,
    blockers: snapshot.report.blockers.length,
    warnings: snapshot.report.warnings.length,
    manualOverrides: snapshot.report.manualOverrides,
    outputFiles: [generatedTsPath, outputJsonPath, outputReportPath].map(relativePath),
  };
  console.log(JSON.stringify(summary, null, 2));

  if (process.argv.includes('--strict') && !snapshot.report.passed) {
    process.exitCode = 1;
  }
}

async function loadManualOverrides(): Promise<KnowledgeGraphManualOverrideSource[]> {
  if (!process.env.DATABASE_URL) return [];
  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
    }),
  });
  try {
    const rows = await prisma.agentKnowledgeGraphOverride.findMany({
      where: { status: 'active' },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 1000,
    });
    return rows.map((row) => ({
      id: row.id,
      overrideType: row.overrideType,
      relationType: row.relationType,
      sourceNodeId: row.sourceNodeId,
      targetNodeId: row.targetNodeId,
      value: row.value,
      label: row.label,
      reason: row.reason,
      confidence: row.confidence,
      payload: isRecord(row.payloadJson) ? row.payloadJson : null,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[kg:generate] skip manual override merge: ${message}`);
    return [];
  } finally {
    await prisma.$disconnect();
  }
}

function parseControllerEndpoints(root: string): KnowledgeGraphControllerEndpointSource[] {
  return listFiles(root)
    .filter((file) => file.endsWith('.controller.ts'))
    .flatMap((file) => {
      const text = readRequired(file);
      const lines = text.split(/\r?\n/);
      const controllerPath = extractDecoratorPath(text, 'Controller') ?? '';
      const classPermissions = extractClassPermissions(lines);
      const endpoints: KnowledgeGraphControllerEndpointSource[] = [];
      for (let index = 0; index < lines.length; index += 1) {
        const decorator = lines[index].match(/@(Get|Post|Put|Patch|Delete)\(([^)]*)\)/);
        if (!decorator) continue;
        const method = decorator[1].toUpperCase();
        const actionPath = extractFirstString(decorator[2]) ?? '';
        const permissions = unique([...classPermissions, ...extractEndpointPermissions(lines, index)]);
        endpoints.push({
          method,
          path: normalizeApiPath(controllerPath, actionPath),
          file: relativePath(file),
          handler: findHandlerName(lines, index),
          line: index + 1,
          permissions,
          dtoNames: extractNearbyDtoNames(lines, index),
        });
      }
      return endpoints;
    });
}

function parseFrontendRoutes(path: string): KnowledgeGraphFrontendRouteSource[] {
  const text = readOptional(path);
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const routes: KnowledgeGraphFrontendRouteSource[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const routeMatch = lines[index].match(/path:\s*['"`]([^'"`]+)['"`]/);
    if (!routeMatch) continue;
    const window = lines.slice(index, Math.min(lines.length, index + 10)).join('\n');
    routes.push({
      path: routeMatch[1],
      file: relativePath(path),
      line: index + 1,
      permission: extractRoutePermission(window),
    });
  }
  return routes;
}

function parseSemanticTerms(path: string): KnowledgeGraphSemanticTermSource[] {
  const text = readOptional(path);
  if (!text) return [];
  const terms = new Map<string, KnowledgeGraphSemanticTermSource>();
  for (const match of text.matchAll(/['"`]([^'"`]+)['"`]/g)) {
    const term = match[1].trim();
    if (!isUsefulTerm(term)) continue;
    terms.set(term, {
      term,
      sourcePath: relativePath(path),
      category: inferSemanticTermCategory(text, match.index ?? 0),
    });
  }
  return [...terms.values()].sort((a, b) => a.term.localeCompare(b.term, 'zh-CN'));
}

function renderMarkdownReport(snapshot: KnowledgeGraphSnapshot) {
  const blockers = snapshot.report.blockers;
  const warnings = snapshot.report.warnings;
  const lines = [
    '# Agent V2 知识图谱生成报告',
    '',
    `生成时间：${snapshot.generatedAt}`,
    `Schema Hash：${snapshot.schemaHash}`,
    `门禁状态：${snapshot.report.passed ? '通过' : '失败'}`,
    '',
    '## 图谱规模',
    '',
    `- 节点总数：${snapshot.summary.nodeCount}`,
    `- 边总数：${snapshot.summary.edgeCount}`,
    `- 业务对象：${snapshot.summary.businessObjectCount}`,
    `- 数据模型：${snapshot.summary.dataModelCount}`,
    `- Active 能力：${snapshot.summary.activeCapabilityCount}`,
    `- 权限码：${snapshot.summary.permissionCodeCount}`,
    `- 人工覆盖：${snapshot.report.manualOverrides.total}（同义词 ${snapshot.report.manualOverrides.synonyms}，排除关系 ${snapshot.report.manualOverrides.excludes}，已采纳 ${snapshot.report.manualOverrides.adopted}，跳过 ${snapshot.report.manualOverrides.skipped}，冲突 ${snapshot.report.manualOverrides.conflicts}）`,
    '',
    '### 节点分布',
    '',
    ...objectToBulletLines(snapshot.summary.nodeCountsByType),
    '',
    '### 边分布',
    '',
    ...objectToBulletLines(snapshot.summary.edgeCountsByType),
    '',
    '## 人工覆盖合并',
    '',
    ...(snapshot.report.manualOverrides.details.length
      ? snapshot.report.manualOverrides.details.slice(0, 80).map(formatManualOverrideMergeDetail)
      : ['- 无人工覆盖']),
    '',
    '## 阻断项',
    '',
    ...(blockers.length ? blockers.map(formatGap) : ['- 无']),
    '',
    '## 提醒项',
    '',
    ...(warnings.length ? warnings.slice(0, 80).map(formatGap) : ['- 无']),
    '',
    '## 产物',
    '',
    `- generated TS：${relativePath(generatedTsPath)}`,
    `- JSON：${relativePath(outputJsonPath)}`,
    `- 报告：${relativePath(outputReportPath)}`,
    '',
  ];
  return `${lines.join('\n')}\n`;
}

function extractClassPermissions(lines: string[]) {
  const classIndex = lines.findIndex((line) => /export\s+class\s+\w+/.test(line));
  if (classIndex < 0) return [];
  const permissions: string[] = [];
  for (let index = classIndex - 1; index >= 0; index -= 1) {
    const trimmed = lines[index].trim();
    if (!trimmed) continue;
    if (!trimmed.startsWith('@')) break;
    const match = /@Permissions\(([^)]*)\)/.exec(trimmed);
    if (match) permissions.push(...extractStringLiterals(match[1]).filter((value) => value.includes(':')));
  }
  return unique(permissions);
}

function extractEndpointPermissions(lines: string[], routeDecoratorIndex: number) {
  const permissions: string[] = [];

  for (let index = routeDecoratorIndex - 1; index >= 0; index -= 1) {
    const trimmed = lines[index].trim();
    if (!trimmed) continue;
    if (!trimmed.startsWith('@')) break;
    const match = /@Permissions\(([^)]*)\)/.exec(trimmed);
    if (!match) continue;
    permissions.push(...extractStringLiterals(match[1]).filter((value) => value.includes(':')));
  }

  for (let index = routeDecoratorIndex; index < Math.min(lines.length, routeDecoratorIndex + 16); index += 1) {
    const trimmed = lines[index].trim();
    if (!trimmed) continue;
    if (index > routeDecoratorIndex && !trimmed.startsWith('@')) break;
    const match = /@Permissions\(([^)]*)\)/.exec(trimmed);
    if (!match) continue;
    permissions.push(...extractStringLiterals(match[1]).filter((value) => value.includes(':')));
  }

  return unique(permissions);
}

function extractNearbyDtoNames(lines: string[], decoratorIndex: number) {
  const dtoNames: string[] = [];
  for (let index = decoratorIndex + 1; index < Math.min(lines.length, decoratorIndex + 16); index += 1) {
    const line = lines[index];
    for (const match of line.matchAll(/:\s*([A-Z]\w*Dto)\b/g)) {
      dtoNames.push(match[1]);
    }
    if (/^\s*\}/.test(line)) break;
  }
  return unique(dtoNames);
}

function findHandlerName(lines: string[], startIndex: number) {
  for (let index = startIndex + 1; index < Math.min(lines.length, startIndex + 10); index += 1) {
    const match = /^\s*(?:async\s+)?([A-Za-z0-9_]+)\s*\(/.exec(lines[index]);
    if (match) return match[1];
  }
  return 'unknownHandler';
}

function extractDecoratorPath(text: string, decoratorName: string) {
  const regex = new RegExp(`@${decoratorName}\\(([^)]*)\\)`);
  const match = regex.exec(text);
  if (!match) return null;
  return extractFirstString(match[1]) ?? '';
}

function extractRoutePermission(text: string) {
  const withGuardMatch = /withGuard\(\s*['"`]([^'"`]+)['"`]/.exec(text);
  if (withGuardMatch) return withGuardMatch[1];
  const permissionMatch = /permission:\s*['"`]([^'"`]+)['"`]/.exec(text);
  return permissionMatch?.[1];
}

function normalizeApiPath(prefix: string, methodPath: string) {
  return `/${[prefix, methodPath]
    .map((part) => part.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/')}`.replace(/\/+/g, '/');
}

function inferSemanticTermCategory(text: string, index: number) {
  const before = text.slice(Math.max(0, index - 320), index);
  if (/COMMON_FILLER_TERMS/.test(before)) return 'filler';
  if (/TIME_TERMS/.test(before)) return 'time';
  if (/ACTION_TERMS/.test(before)) return 'action';
  if (/OBJECT_HINT_TERMS/.test(before)) return 'object_hint';
  return 'lexicon_literal';
}

function isUsefulTerm(term: string) {
  if (term.length < 2 || term.length > 32) return false;
  if (/^[A-Z_]+$/.test(term)) return false;
  if (/^[./\\]/.test(term)) return false;
  return /[\u4e00-\u9fa5A-Za-z0-9]/.test(term);
}

function extractFirstString(text: string) {
  const match = /['"`]([^'"`]*)['"`]/.exec(text);
  return match?.[1] ?? null;
}

function extractStringLiterals(text: string) {
  return [...text.matchAll(/['"`]([^'"`]+)['"`]/g)].map((match) => match[1]);
}

function objectToBulletLines(record: Record<string, number>) {
  const entries = Object.entries(record).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return ['- 无'];
  return entries.map(([key, value]) => `- ${key}：${value}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function formatGap(gap: KnowledgeGraphSnapshot['report']['gaps'][number]) {
  return `- [${gap.code}] ${gap.title}：${gap.detail} 建议：${gap.suggestedFix}`;
}

function formatManualOverrideMergeDetail(detail: KnowledgeGraphSnapshot['report']['manualOverrides']['details'][number]) {
  const target = [detail.sourceNodeId, detail.targetNodeId].filter(Boolean).join(' -> ') || detail.targetNodeId || detail.value || detail.edgeId || detail.nodeId || String(detail.id);
  const issue = detail.issue ? `，原因：${detail.issue}` : '';
  return `- [${detail.status}] #${detail.id} ${detail.overrideType}/${detail.relationType}：${target}${issue}`;
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function listFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const result: string[] = [];
  for (const entry of readdirSync(root)) {
    const fullPath = resolve(root, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (['node_modules', 'dist', 'coverage'].includes(entry)) continue;
      result.push(...listFiles(fullPath));
    } else if (stat.isFile()) {
      result.push(fullPath);
    }
  }
  return result;
}

function readRequired(path: string) {
  return readFileSync(path, 'utf8');
}

function readOptional(path: string) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function writeJson(path: string, data: unknown) {
  writeText(path, `${JSON.stringify(data, null, 2)}\n`);
}

function writeText(path: string, text: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, 'utf8');
}

function relativePath(path: string) {
  return relative(workspaceRoot, path).replace(/\\/g, '/');
}

function formatShanghaiTime(date: Date) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  return `${value('year')}-${value('month')}-${value('day')} ${value('hour')}:${value('minute')}:${value('second')} Asia/Shanghai`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
