import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';

type ScanReport = {
  generatedAt?: string;
  api?: {
    endpoints?: Array<{ method: string; path: string; file: string; risk: string; candidatePersona?: string; candidateCapability?: string; reason: string }>;
    realApiMethods?: Array<{ file: string; method: string; apiPath?: string; candidatePersona?: string; reason: string }>;
  };
  frontend?: {
    routes?: Array<{ path: string; file: string; candidatePersona?: string; missingCapability: boolean; reason: string }>;
  };
  agent?: {
    missingCatalogMappings?: string[];
    missingSkillMappings?: string[];
    missingToolRegistryMappings?: string[];
  };
};

type CapabilityDraft = {
  draftId: string;
  priority: 'P1' | 'P2' | 'P3';
  source: 'api_endpoint' | 'real_api' | 'frontend_route' | 'agent_gap';
  suggestedCapabilityId: string;
  suggestedPersona: string;
  suggestedTool?: string;
  riskLevel: string;
  evidence: string[];
  reason: string;
  confirmationNeeded: string[];
};

const workspaceRoot = resolve(process.cwd(), '../..');
const reportPath = resolve(workspaceRoot, 'docs/04-测试数据/agent-knowledge-scan-report.json');
const outputJsonPath = resolve(workspaceRoot, 'docs/04-测试数据/agent-capability-drafts.json');
const outputMdPath = resolve(workspaceRoot, 'docs/04-测试数据/agent-capability-drafts.md');

function main() {
  const report = readJson<ScanReport>(reportPath, {});
  const drafts = buildDrafts(report);
  writeJson(outputJsonPath, {
    generatedAt: new Date().toISOString(),
    sourceReport: relativeDocsPath(reportPath),
    total: drafts.length,
    drafts,
  });
  writeMarkdown(outputMdPath, report, drafts);
  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        total: drafts.length,
        outputFiles: [relativeDocsPath(outputJsonPath), relativeDocsPath(outputMdPath)],
      },
      null,
      2,
    ),
  );
}

function buildDrafts(report: ScanReport): CapabilityDraft[] {
  const drafts: CapabilityDraft[] = [];
  for (const capabilityId of report.agent?.missingCatalogMappings ?? []) {
    drafts.push({
      draftId: `gap-catalog-${capabilityId}`,
      priority: 'P1',
      source: 'agent_gap',
      suggestedCapabilityId: capabilityId,
      suggestedPersona: guessPersona(capabilityId),
      suggestedTool: 'business.query.ask',
      riskLevel: 'medium',
      evidence: [`implemented BusinessQuery capability ${capabilityId} 缺少 CapabilityCatalog 映射`],
      reason: '能力已有执行分支但缺少 Agent 能力目录映射。',
      confirmationNeeded: ['确认能力中文名', '确认输出类型', '确认角色权限', '确认是否需要审批'],
    });
  }

  for (const capabilityId of report.agent?.missingSkillMappings ?? []) {
    drafts.push({
      draftId: `gap-skill-${capabilityId}`,
      priority: 'P1',
      source: 'agent_gap',
      suggestedCapabilityId: capabilityId,
      suggestedPersona: guessPersona(capabilityId),
      suggestedTool: 'business.query.ask',
      riskLevel: 'medium',
      evidence: [`CapabilityCatalog businessQueryCapabilityId ${capabilityId} 缺少 SkillRegistry 暴露`],
      reason: '能力已有目录但 Planner 不一定能稳定规划到专用 Skill。',
      confirmationNeeded: ['确认 Skill 示例问法', '确认 requiredEntities', '确认 outputContract'],
    });
  }

  for (const toolName of report.agent?.missingToolRegistryMappings ?? []) {
    drafts.push({
      draftId: `gap-tool-${normalizeId(toolName)}`,
      priority: 'P1',
      source: 'agent_gap',
      suggestedCapabilityId: normalizeId(toolName),
      suggestedPersona: guessPersona(toolName),
      suggestedTool: toolName,
      riskLevel: 'medium',
      evidence: [`CapabilityCatalog toolName ${toolName} 未在 AgentToolRegistry 注册`],
      reason: '能力目录指向的工具不存在或未注册。',
      confirmationNeeded: ['确认工具实现路径', '确认权限码', '确认审批策略'],
    });
  }

  for (const route of report.frontend?.routes ?? []) {
    drafts.push({
      draftId: `route-${normalizeId(route.path)}`,
      priority: 'P2',
      source: 'frontend_route',
      suggestedCapabilityId: normalizeId(route.path),
      suggestedPersona: route.candidatePersona ?? 'manager',
      suggestedTool: 'business.query.ask',
      riskLevel: route.path.includes('delete') || route.path.includes('refund') ? 'high' : 'medium',
      evidence: [`route:${route.path}`, `file:${route.file}`],
      reason: route.reason,
      confirmationNeeded: ['确认该页面是否需要 Agent 问答能力', '确认对应业务对象', '确认只读查询还是高风险动作'],
    });
  }

  for (const endpoint of report.api?.endpoints ?? []) {
    if (endpoint.method === 'GET' && endpoint.candidatePersona) {
      drafts.push({
        draftId: `api-${normalizeId(`${endpoint.method}-${endpoint.path}`)}`,
        priority: 'P3',
        source: 'api_endpoint',
        suggestedCapabilityId: endpoint.candidateCapability ?? normalizeId(endpoint.path),
        suggestedPersona: endpoint.candidatePersona,
        suggestedTool: 'business.query.ask',
        riskLevel: endpoint.risk,
        evidence: [`${endpoint.method} ${endpoint.path}`, endpoint.file],
        reason: endpoint.reason,
        confirmationNeeded: ['确认 API 返回字段口径', '确认是否已有 BusinessQuery 能力覆盖'],
      });
    }
  }

  for (const method of report.api?.realApiMethods ?? []) {
    if (method.candidatePersona) {
      drafts.push({
        draftId: `real-api-${normalizeId(`${method.method}-${method.apiPath ?? method.file}`)}`,
        priority: 'P3',
        source: 'real_api',
        suggestedCapabilityId: normalizeId(method.apiPath ?? method.method),
        suggestedPersona: method.candidatePersona,
        suggestedTool: 'business.query.ask',
        riskLevel: /post|put|patch|delete/i.test(method.method) ? 'high' : 'medium',
        evidence: [method.file, method.apiPath ?? method.method],
        reason: method.reason,
        confirmationNeeded: ['确认是否应包装成 Agent Tool', '确认字段脱敏和权限码'],
      });
    }
  }

  return dedupeDrafts(drafts)
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || a.draftId.localeCompare(b.draftId))
    .slice(0, 120);
}

function writeMarkdown(path: string, report: ScanReport, drafts: CapabilityDraft[]) {
  const byPriority = groupBy(drafts, (item) => item.priority);
  const lines = [
    '# Agent Capability 草案候选',
    '',
    `生成时间：${new Date().toISOString()}`,
    `来源报告：${relativeDocsPath(reportPath)}`,
    '',
    '## 摘要',
    '',
    `- 草案总数：${drafts.length}`,
    `- Agent gap：${drafts.filter((item) => item.source === 'agent_gap').length}`,
    `- 前端页面候选：${drafts.filter((item) => item.source === 'frontend_route').length}`,
    `- API 候选：${drafts.filter((item) => item.source === 'api_endpoint' || item.source === 'real_api').length}`,
    `- 当前扫描时间：${report.generatedAt ?? 'unknown'}`,
    '',
    '## 使用原则',
    '',
    '- 本文件只生成草案，不自动写入 CapabilityCatalog、SkillRegistry 或 ToolRegistry。',
    '- 进入正式开发前必须由产品或研发确认业务语义、权限、输出形式和审批策略。',
    '- 高风险动作只能生成确认卡或审批草稿，不允许直接执行。',
    '',
  ];

  for (const priority of ['P1', 'P2', 'P3'] as const) {
    const items = byPriority[priority] ?? [];
    lines.push(`## ${priority} 草案`, '');
    if (!items.length) {
      lines.push('- 无', '');
      continue;
    }
    lines.push('| 草案 | Persona | 来源 | 建议工具 | 风险 | 证据 | 待确认 |', '|---|---|---|---|---|---|---|');
    for (const item of items) {
      lines.push(
        `| ${item.suggestedCapabilityId} | ${item.suggestedPersona} | ${item.source} | ${item.suggestedTool ?? '-'} | ${item.riskLevel} | ${item.evidence.join('<br>')} | ${item.confirmationNeeded.join('<br>')} |`,
      );
    }
    lines.push('');
  }

  writeText(path, `${lines.join('\n')}\n`);
}

function dedupeDrafts(drafts: CapabilityDraft[]) {
  const seen = new Set<string>();
  return drafts.filter((draft) => {
    const key = `${draft.source}:${draft.suggestedCapabilityId}:${draft.suggestedPersona}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function writeJson(path: string, data: unknown) {
  writeText(path, `${JSON.stringify(data, null, 2)}\n`);
}

function writeText(path: string, text: string) {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, text, 'utf8');
}

function normalizeId(value: string) {
  return String(value || 'unknown')
    .replace(/^\/+/, '')
    .replace(/[{}:]/g, '')
    .split(/[\/_.\s-]+/)
    .filter(Boolean)
    .join('_')
    .toLowerCase();
}

function guessPersona(text: string) {
  const value = text.toLowerCase();
  if (/finance|billing|settlement|commission|profit|refund|payment|cashflow|order/.test(value)) return 'finance';
  if (/inventory|stock|purchase|supplier|replenishment/.test(value)) return 'inventory';
  if (/marketing|campaign|activity|automation|promotion|conversion|churn|growth/.test(value)) return 'marketing';
  if (/reservation|appointment|reception|cashier|card|member/.test(value)) return 'reception';
  if (/beautician|staff|schedule|service/.test(value)) return 'beautician';
  return 'manager';
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  return items.reduce<Record<string, T[]>>((map, item) => {
    const key = getKey(item);
    map[key] = [...(map[key] ?? []), item];
    return map;
  }, {});
}

function priorityRank(priority: CapabilityDraft['priority']) {
  return priority === 'P1' ? 1 : priority === 'P2' ? 2 : 3;
}

function relativeDocsPath(path: string) {
  return path.replace(`${workspaceRoot}\\`, '').replace(/\\/g, '/');
}

main();
