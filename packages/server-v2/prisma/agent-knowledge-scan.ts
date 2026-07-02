import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { dirname, relative, resolve } from 'path';
import { spawnSync } from 'child_process';
import { BUSINESS_QUERY_CAPABILITIES } from '../src/business-query/business-query.capabilities.js';
import { AGENT_CAPABILITY_CATALOG } from '../src/agent/knowledge/capability-catalog.service.js';
import { BUSINESS_OBJECT_CATALOG } from '../src/agent/knowledge/business-object.catalog.js';
import { buildGeneratedModels, computeSchemaHash, parsePrismaModels } from './generate-schema-graph.js';

type Risk = 'low' | 'medium' | 'high';

type EndpointCandidate = {
  method: string;
  path: string;
  file: string;
  risk: Risk;
  candidatePersona?: string;
  candidateCapability?: string;
  reason: string;
};

type RouteCandidate = {
  path: string;
  file: string;
  candidatePersona?: string;
  missingCapability: boolean;
  reason: string;
};

type AgentKnowledgeScanReport = {
  generatedAt: string;
  git: {
    branch: string | null;
    changedFiles: string[];
  };
  schema: {
    schemaHash: string;
    schemaModelCount: number;
    generatedModelCount: number;
    missingBusinessObjectMappings: string[];
    missingDisplayNames: Array<{ model: string; field: string; type: string; risk: Risk; reason: string }>;
  };
  api: {
    endpoints: EndpointCandidate[];
    dtoFieldCandidates: Array<{ dto: string; field: string; reason: string; risk: Risk }>;
    realApiMethods: Array<{ file: string; method: string; apiPath?: string; candidatePersona?: string; reason: string }>;
  };
  frontend: {
    routes: RouteCandidate[];
  };
  agent: {
    implementedBusinessCapabilities: string[];
    catalogBusinessCapabilityIds: string[];
    missingCatalogMappings: string[];
    missingExecutionMappings: string[];
    missingSkillMappings: string[];
    missingToolRegistryMappings: string[];
    missingEvalCases: string[];
    skillCapabilityIds: string[];
    registeredToolNames: string[];
    answerContractSupportedKinds: string[];
  };
  gate: {
    passed: boolean;
    blockers: string[];
    warnings: string[];
  };
  governance: {
    whitelistPath: string;
    whitelistEntryCount: number;
    whitelistAppliedCount: number;
    whitelistInvalidEntries: string[];
    highRiskApprovalGaps: string[];
  };
};

type KnowledgeWhitelistEntry = {
  kind: string;
  target: string;
  reason: string;
  owner: string;
  expiresAt?: string;
};

const HTTP_METHODS = ['Get', 'Post', 'Put', 'Patch', 'Delete'] as const;
const IMPORTANT_FIELD_PATTERN = /(amount|price|cost|profit|margin|rate|balance|count|total|net|gross|revenue|income|discount|commission|gift|refund|payment|status|type|phone|url|path)/i;

function main() {
  const root = resolve(process.cwd());
  const workspaceRoot = resolve(root, '../..');
  const docsOutputDir = resolve(workspaceRoot, 'docs/04-测试数据');
  const schema = readFileSync(resolve(root, 'prisma/schema.prisma'), 'utf8');
  const schemaModels = parsePrismaModels(schema);
  const generatedModels = buildGeneratedModels(schema);
  const schemaHash = computeSchemaHash(schema);
  const businessQueryServiceText = readFileSync(resolve(root, 'src/business-query/business-query.service.ts'), 'utf8');
  const skillRegistryText = readExisting(resolve(root, 'src/agent/skills/agent-skills.registry.ts'));
  const toolRegistryText = readExisting(resolve(root, 'src/agent/agent-tool-registry.service.ts'));
  const answerContractText = readExisting(resolve(root, 'src/agent/answer-contract/answer-contract-validator.service.ts'));
  const evalText = readExisting(resolve(root, 'src/agent/agent-eval-knowledge-map.ts')) + '\n' + readExisting(resolve(root, 'src/agent/agent-eval.cases.ts'));
  const whitelistPath = resolve(root, 'prisma/agent-knowledge-whitelist.json');
  const whitelist = loadWhitelist(whitelistPath);

  const branch = runGit(root, ['branch', '--show-current']);
  const changedFiles = runGit(root, ['status', '--short'])
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const catalogModels = new Set(BUSINESS_OBJECT_CATALOG.flatMap((item) => [...item.sourceModels, ...(item.evidenceSourceModels ?? [])]));
  const catalogDisplayFields = buildCatalogDisplayFieldMap();
  const rawMissingBusinessObjectMappings = schemaModels.map((model) => model.name).filter((model) => !catalogModels.has(model)).sort();
  const missingBusinessObjectMappings = rawMissingBusinessObjectMappings
    .filter((model) => !isWhitelisted(whitelist.entries, 'business_object_mapping', model))
    .sort();
  const rawMissingDisplayNames = generatedModels.flatMap((model) => {
    if (model.objectType === 'Unknown') return [];
    const displayFields = catalogDisplayFields.get(model.modelName) ?? new Set<string>();
    return model.fields
      .filter(
        (field) =>
          !field.relation &&
          IMPORTANT_FIELD_PATTERN.test(field.name) &&
          !displayFields.has(field.name) &&
          !isLowValueTechnicalField(field.name),
      )
      .map((field) => ({
        model: model.modelName,
        field: field.name,
        type: field.type,
        risk: fieldRisk(field.name),
        reason: '重要业务字段缺少人工确认的中文展示名。',
      }));
  });
  const missingDisplayNames = rawMissingDisplayNames.filter(
    (item) => !isWhitelisted(whitelist.entries, 'display_name', `${item.model}.${item.field}`),
  );

  const endpoints = scanControllers(root);
  const dtoFieldCandidates = scanDtoFields(root);
  const realApiMethods = scanRealApiMethods(workspaceRoot);
  const routes = scanFrontendRoutes(workspaceRoot).filter((route) => !isWhitelisted(whitelist.entries, 'route_candidate', route.path));

  const implementedBusinessCapabilities = BUSINESS_QUERY_CAPABILITIES.filter((item) => item.implemented).map((item) => item.id).sort();
  const catalogBusinessCapabilityIds = unique(AGENT_CAPABILITY_CATALOG.map((item) => item.businessQueryCapabilityId).filter(Boolean) as string[]).sort();
  const catalogCapabilitySet = new Set(catalogBusinessCapabilityIds);
  const skillCapabilityIds = unique(extractStringPropertyValues(skillRegistryText, 'capabilityId')).sort();
  const skillCapabilitySet = new Set(skillCapabilityIds);
  const registeredToolNames = unique(extractRegisteredToolNames(toolRegistryText)).sort();
  const registeredToolSet = new Set(registeredToolNames);
  const catalogToolNames = unique(AGENT_CAPABILITY_CATALOG.map((item) => item.toolName).filter(Boolean) as string[]).sort();
  const missingCatalogMappings = implementedBusinessCapabilities.filter((id) => !catalogCapabilitySet.has(id) && !isWhitelisted(whitelist.entries, 'catalog_mapping', id));
  const missingExecutionMappings = implementedBusinessCapabilities.filter(
    (id) => !hasExecutionMapping(businessQueryServiceText, id) && !isWhitelisted(whitelist.entries, 'execution_mapping', id),
  );
  const missingSkillMappings = catalogBusinessCapabilityIds.filter((id) => !skillCapabilitySet.has(id) && !isWhitelisted(whitelist.entries, 'skill_mapping', id));
  const missingToolRegistryMappings = catalogToolNames.filter((name) => !registeredToolSet.has(name) && !isWhitelisted(whitelist.entries, 'tool_registry_mapping', name));
  const missingEvalCases = implementedBusinessCapabilities.filter((id) => !evalText.includes(id) && !isWhitelisted(whitelist.entries, 'eval_case', id));
  const answerContractSupportedKinds = extractAnswerContractKinds(answerContractText).sort();
  const highRiskApprovalGaps = scanHighRiskApprovalGaps(toolRegistryText).filter(
    (gap) => !isWhitelisted(whitelist.entries, 'high_risk_approval', gap),
  );

  const blockers: string[] = [];
  const warnings: string[] = [];
  if (whitelist.invalidEntries.length) blockers.push(`知识治理白名单存在 ${whitelist.invalidEntries.length} 个无效项，必须填写 kind、target、reason、owner。`);
  if (missingExecutionMappings.length) blockers.push(`${missingExecutionMappings.length} 个 implemented BusinessQuery capability 缺少执行映射。`);
  if (missingToolRegistryMappings.length) blockers.push(`${missingToolRegistryMappings.length} 个 CapabilityCatalog toolName 未在 AgentToolRegistry 注册。`);
  if (highRiskApprovalGaps.length) blockers.push(`${highRiskApprovalGaps.length} 个中高风险 Agent 工具缺少 requiresApproval=true。`);
  if (missingCatalogMappings.length) warnings.push(`${missingCatalogMappings.length} 个 implemented BusinessQuery capability 未进入 CapabilityCatalog。`);
  if (missingSkillMappings.length) warnings.push(`${missingSkillMappings.length} 个 CapabilityCatalog businessQueryCapabilityId 未在 SkillRegistry 暴露。`);
  if (missingBusinessObjectMappings.length) warnings.push(`${missingBusinessObjectMappings.length} 个 Prisma model 未映射 BusinessObjectCatalog。`);
  if (missingDisplayNames.length) warnings.push(`${missingDisplayNames.length} 个重要字段缺少人工中文名。`);
  if (routes.some((route) => route.missingCapability)) warnings.push('存在前端页面候选未匹配到 Agent 能力。');

  const report: AgentKnowledgeScanReport = {
    generatedAt: new Date().toISOString(),
    git: {
      branch: branch || null,
      changedFiles,
    },
    schema: {
      schemaHash,
      schemaModelCount: schemaModels.length,
      generatedModelCount: generatedModels.length,
      missingBusinessObjectMappings,
      missingDisplayNames,
    },
    api: {
      endpoints,
      dtoFieldCandidates,
      realApiMethods,
    },
    frontend: {
      routes,
    },
    agent: {
      implementedBusinessCapabilities,
      catalogBusinessCapabilityIds,
      missingCatalogMappings,
      missingExecutionMappings,
      missingSkillMappings,
      missingToolRegistryMappings,
      missingEvalCases,
      skillCapabilityIds,
      registeredToolNames,
      answerContractSupportedKinds,
    },
    gate: {
      passed: blockers.length === 0,
      blockers,
      warnings,
    },
    governance: {
      whitelistPath: relative(root, whitelistPath),
      whitelistEntryCount: whitelist.entries.length,
      whitelistAppliedCount: countWhitelistApplications(whitelist.entries, {
        businessObjects: rawMissingBusinessObjectMappings,
        displayNames: rawMissingDisplayNames.map((item) => `${item.model}.${item.field}`),
        catalogMappings: implementedBusinessCapabilities.filter((id) => !catalogCapabilitySet.has(id)),
        executionMappings: implementedBusinessCapabilities.filter((id) => !hasExecutionMapping(businessQueryServiceText, id)),
        skillMappings: catalogBusinessCapabilityIds.filter((id) => !skillCapabilitySet.has(id)),
        toolRegistryMappings: catalogToolNames.filter((name) => !registeredToolSet.has(name)),
        evalCases: implementedBusinessCapabilities.filter((id) => !evalText.includes(id)),
        routes: scanFrontendRoutes(workspaceRoot).map((route) => route.path),
        highRiskApprovalGaps: scanHighRiskApprovalGaps(toolRegistryText),
      }),
      whitelistInvalidEntries: whitelist.invalidEntries,
      highRiskApprovalGaps,
    },
  };

  writeJson(resolve(docsOutputDir, 'agent-knowledge-scan-report.json'), report);
  writeJson(resolve(docsOutputDir, 'agent-knowledge-baseline.json'), {
    generatedAt: report.generatedAt,
    schemaHash,
    schemaModelCount: schemaModels.length,
    businessObjectCatalogCount: BUSINESS_OBJECT_CATALOG.length,
    capabilityCatalogCount: AGENT_CAPABILITY_CATALOG.length,
    implementedBusinessCapabilityCount: implementedBusinessCapabilities.length,
    implementedBusinessCapabilities,
  });
  writeMarkdownSummary(resolve(docsOutputDir, 'agent-knowledge-scan-summary.md'), report);
  printSummary(report);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  }
}

function scanControllers(root: string): EndpointCandidate[] {
  return walk(resolve(root, 'src'))
    .filter((file) => file.endsWith('.controller.ts'))
    .flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      const controllerPath = text.match(/@Controller\(['"`]([^'"`)]*)['"`]\)/)?.[1] ?? '';
      const endpoints: EndpointCandidate[] = [];
      for (const method of HTTP_METHODS) {
        const regex = new RegExp(`@${method}\\(([^)]*)\\)[\\s\\S]{0,400}?(?:async\\s+)?(\\w+)\\s*\\(`, 'g');
        let match: RegExpExecArray | null;
        while ((match = regex.exec(text))) {
          const actionPath = normalizeDecoratorPath(match[1]);
          const path = joinApiPath(controllerPath, actionPath);
          endpoints.push({
            method: method.toUpperCase(),
            path,
            file: relative(root, file),
            risk: method === 'Get' ? 'low' : method === 'Post' || method === 'Put' || method === 'Patch' ? 'medium' : 'high',
            candidatePersona: guessPersona(path),
            candidateCapability: guessCapability(path, match[2]),
            reason: `${method} API 可作为 Agent ${method === 'Get' ? '查询能力' : '动作工具'}候选。`,
          });
        }
      }
      return endpoints;
    });
}

function scanDtoFields(root: string) {
  return walk(resolve(root, 'src'))
    .filter((file) => /[\\/]dto[\\/].+\.ts$/.test(file))
    .flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      const dto = relative(root, file);
      return [...text.matchAll(/(?:readonly\s+)?(\w+)[?!]?:\s*([\w[\]<>|]+)/g)]
        .map((match) => ({ field: match[1], type: match[2] }))
        .filter((field) => IMPORTANT_FIELD_PATTERN.test(field.field))
        .map((field) => ({
          dto,
          field: field.field,
          reason: `DTO 字段 ${field.field} 属于金额、状态、链接或敏感信息候选，需要确认 Agent 输出口径。`,
          risk: fieldRisk(field.field),
        }));
    });
}

function scanRealApiMethods(workspaceRoot: string) {
  return walk(resolve(workspaceRoot, 'src/api/real'))
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts') && !file.endsWith('.spec.ts'))
    .flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      const fileName = relative(workspaceRoot, file);
      const paths = [...text.matchAll(/apiClient\.(get|post|put|patch|delete)(?:<[^>]*>)?\(['"`]([^'"`]+)['"`]/g)];
      const pathByNearbyIndex = paths.map((match) => ({
        index: match.index ?? 0,
        method: match[1].toUpperCase(),
        path: match[2],
      }));
      return [...text.matchAll(/export\s+async\s+function\s+(real\w+)\s*\(/g)].map((match) => {
        const index = match.index ?? 0;
        const nearbyPath = pathByNearbyIndex.find((item) => item.index >= index && item.index - index < 1000);
        const target = nearbyPath?.path ?? match[1];
        return {
          file: fileName,
          method: match[1],
          apiPath: nearbyPath?.path,
          candidatePersona: guessPersona(`${fileName} ${target}`),
          reason: nearbyPath
            ? `real API 方法调用 ${nearbyPath.method} ${nearbyPath.path}，可作为 Agent 查询或动作工具候选。`
            : 'real API 方法未在附近识别到 apiClient 路径，需要人工确认是否应进入 Agent 工具候选。',
        };
      });
    });
}

function scanFrontendRoutes(workspaceRoot: string): RouteCandidate[] {
  const routesFile = resolve(workspaceRoot, 'src/app/routes.tsx');
  const text = readExisting(routesFile);
  const routeMatches = [...text.matchAll(/path:\s*['"`]([^'"`]+)['"`][\s\S]{0,240}?(?:element|Component|component):\s*([^,\n}]+)/g)];
  return routeMatches
    .map((match) => {
      const path = match[1];
      const file = String(match[2] ?? '').trim();
      const persona = guessPersona(path);
      const excludedReason = routeExclusionReason(path);
      const missingCapability = Boolean(persona) && !excludedReason && !hasCapabilityForRoute(path, persona);
      return {
        path,
        file,
        candidatePersona: persona,
        missingCapability,
        reason: excludedReason ?? (persona ? `页面路径疑似属于 ${persona} Agent 能力域。` : '未识别到明确 Agent 能力域。'),
      };
    })
    .filter((route) => route.candidatePersona && route.missingCapability);
}

function routeExclusionReason(path: string) {
  const value = path.toLowerCase();
  if (/(setting|settings|config|permission|permissions|role|roles|user|users|account|auth|login|log|audit|system|admin)/.test(value)) {
    return '页面属于配置、权限、审计或系统内部管理，不默认生成门店 Agent 能力候选。';
  }
  if (/(edit|create|new|form|import|export|migration|debug)/.test(value)) {
    return '页面更偏后台操作表单或研发调试，先不作为普通问答能力缺口提醒。';
  }
  return null;
}

function hasCapabilityForRoute(path: string, persona?: string) {
  const terms = routeSemanticTerms(path);
  if (!terms.length) return false;
  return AGENT_CAPABILITY_CATALOG.some((capability) => {
    const personaMatched = !persona || capability.personaCodes.includes(persona as any) || capability.personaCodes.includes('manager');
    if (!personaMatched) return false;
    const text = normalizeRouteText(
      [
        capability.capabilityId,
        capability.businessQueryCapabilityId,
        capability.displayName,
        capability.description,
        ...capability.objectTypes,
        ...capability.actions,
        ...(capability.triggerKeywords ?? []),
      ].join(' '),
    );
    return terms.some((term) => text.includes(term));
  });
}

function routeSemanticTerms(path: string) {
  const value = path.toLowerCase();
  const terms = new Set<string>();
  const add = (...items: string[]) => items.forEach((item) => terms.add(normalizeRouteText(item)));
  if (/order|cashier|checkout|payment|refund|deduct/.test(value)) add('order', '订单', '收银', '核销', '退款', '支付');
  if (/card|member-card|balance|recharge/.test(value)) add('card', 'membercard', '卡项', '会员卡', '储值', '余额');
  if (/inventory|stock|product|sku/.test(value)) add('inventory', 'product', '库存', '商品', '补货', 'sku');
  if (/project|service/.test(value)) add('project', 'service', '项目', '护理项目', '服务');
  if (/customer|member|profile/.test(value)) add('customer', '客户', '会员');
  if (/marketing|campaign|activity|promotion/.test(value)) add('marketing', 'activity', '营销', '活动', '推广');
  if (/reservation|appointment|check-in|checkin/.test(value)) add('reservation', '预约', '到店');
  if (/schedule|shift|beautician/.test(value)) add('schedule', 'beautician', '排班', '美容师', '员工');
  if (/supplier|purchase|supply/.test(value)) add('supplier', 'purchase', '供应商', '采购');
  if (/finance|profit|settlement|commission/.test(value)) add('finance', 'profit', 'settlement', '财务', '利润', '结算', '提成');
  if (/automation|trigger/.test(value)) add('automation', '自动化');
  if (/terminal|device|kiosk/.test(value)) add('terminal', '终端', '设备');
  if (/dashboard|workbench|overview|operation/.test(value)) add('businessoverview', 'business', '经营', '概览');
  return [...terms].filter(Boolean);
}

function normalizeRouteText(text: string) {
  return String(text || '')
    .toLowerCase()
    .replace(/[\s/:_\-]+/g, '');
}

function extractStringPropertyValues(text: string, property: string) {
  return [...text.matchAll(new RegExp(`${property}:\\s*['"\`]([^'"\`]+)['"\`]`, 'g'))].map((match) => match[1]);
}

function buildCatalogDisplayFieldMap() {
  const map = new Map<string, Set<string>>();
  for (const item of BUSINESS_OBJECT_CATALOG) {
    const fields = Object.keys(item.displayFields ?? {});
    for (const model of [...item.sourceModels, ...(item.evidenceSourceModels ?? [])]) {
      const current = map.get(model) ?? new Set<string>();
      for (const field of fields) current.add(field);
      map.set(model, current);
    }
  }
  return map;
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function extractRegisteredToolNames(text: string) {
  return [...text.matchAll(/this\.register\(\{\s*name:\s*['"`]([^'"`]+)['"`]/g)].map((match) => match[1]);
}

function extractAnswerContractKinds(text: string) {
  const allowedMatch = text.match(/const allowed = new Set[\s\S]*?\(\[([\s\S]*?)\]\)/);
  if (!allowedMatch) return [];
  return [...allowedMatch[1].matchAll(/['"`]([^'"`]+)['"`]/g)].map((match) => match[1]);
}

function hasExecutionMapping(text: string, capabilityId: string) {
  return text.includes(`case '${capabilityId}'`) || text.includes(`case "${capabilityId}"`) || text.includes(`'${capabilityId}'`) || text.includes(`"${capabilityId}"`);
}

function loadWhitelist(path: string): { entries: KnowledgeWhitelistEntry[]; invalidEntries: string[] } {
  if (!existsSync(path)) return { entries: [], invalidEntries: [] };
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    const entries = Array.isArray(raw?.entries) ? raw.entries : [];
    const invalidEntries: string[] = [];
    const validEntries = entries.filter((entry: Partial<KnowledgeWhitelistEntry>, index: number) => {
      const valid = Boolean(entry.kind && entry.target && entry.reason && entry.owner);
      if (!valid) invalidEntries.push(`entries[${index}] 缺少 kind、target、reason 或 owner`);
      return valid;
    }) as KnowledgeWhitelistEntry[];
    return { entries: validEntries, invalidEntries };
  } catch (error) {
    return { entries: [], invalidEntries: [`白名单 JSON 解析失败：${error instanceof Error ? error.message : String(error)}`] };
  }
}

function isWhitelisted(entries: KnowledgeWhitelistEntry[], kind: string, target: string) {
  const now = Date.now();
  return entries.some((entry) => {
    if (entry.expiresAt && Date.parse(entry.expiresAt) < now) return false;
    const kindMatched = entry.kind === kind || entry.kind === '*';
    const targetMatched = entry.target === target || entry.target === '*';
    return kindMatched && targetMatched;
  });
}

function countWhitelistApplications(
  entries: KnowledgeWhitelistEntry[],
  candidates: Record<string, string[]>,
) {
  const kindMap: Record<string, string> = {
    businessObjects: 'business_object_mapping',
    displayNames: 'display_name',
    catalogMappings: 'catalog_mapping',
    executionMappings: 'execution_mapping',
    skillMappings: 'skill_mapping',
    toolRegistryMappings: 'tool_registry_mapping',
    evalCases: 'eval_case',
    routes: 'route_candidate',
    highRiskApprovalGaps: 'high_risk_approval',
  };
  return Object.entries(candidates).reduce((count, [candidateKind, values]) => {
    const whitelistKind = kindMap[candidateKind] ?? candidateKind;
    return count + values.filter((value) => isWhitelisted(entries, whitelistKind, value)).length;
  }, 0);
}

function scanHighRiskApprovalGaps(toolRegistryText: string) {
  return [...toolRegistryText.matchAll(/this\.register\(\{([\s\S]*?)\n\s*\}\);/g)]
    .map((match) => {
      const block = match[1];
      const name = block.match(/name:\s*['"`]([^'"`]+)['"`]/)?.[1];
      const riskLevel = block.match(/riskLevel:\s*['"`](medium|high)['"`]/)?.[1];
      const requiresApproval = block.match(/requiresApproval:\s*(true|false)/)?.[1];
      if (!name || !riskLevel) return null;
      return requiresApproval === 'true' ? null : `${name}:${riskLevel}`;
    })
    .filter((item): item is string => Boolean(item));
}

function guessPersona(text: string) {
  const value = text.toLowerCase();
  if (/finance|billing|settlement|commission|profit|refund|payment/.test(value)) return 'finance';
  if (/inventory|stock|purchase|supplier/.test(value)) return 'inventory';
  if (/marketing|campaign|activity|automation|promotion/.test(value)) return 'marketing';
  if (/reservation|appointment|reception|cashier|card/.test(value)) return 'reception';
  if (/beautician|staff|schedule|service/.test(value)) return 'beautician';
  if (/dashboard|workbench|operation|customer|order|project/.test(value)) return 'manager';
  return undefined;
}

function guessCapability(path: string, methodName: string) {
  return `${path}/${methodName}`
    .replace(/^\/+/, '')
    .replace(/[{}:]/g, '')
    .split(/[\/_-]+/)
    .filter(Boolean)
    .join('_')
    .toLowerCase();
}

function normalizeDecoratorPath(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '') return '';
  return trimmed.match(/['"`]([^'"`]*)['"`]/)?.[1] ?? '';
}

function joinApiPath(base: string, action: string) {
  return `/${[base, action].filter(Boolean).join('/')}`.replace(/\/+/g, '/');
}

function fieldRisk(field: string): Risk {
  if (/(amount|price|cost|profit|margin|rate|balance|revenue|income|commission|refund|payment|gift|phone|token|secret|password)/i.test(field)) return 'high';
  if (/(status|type|count|total|discount|url|path)/i.test(field)) return 'medium';
  return 'low';
}

function isLowValueTechnicalField(field: string) {
  return /^(id|createdAt|updatedAt|deletedAt|storeId|customerId|productId|projectId|orderId|userId)$/i.test(field);
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = resolve(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) return walk(path);
    return stat.isFile() ? [path] : [];
  });
}

function readExisting(path: string) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function writeJson(path: string, data: unknown) {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function writeMarkdownSummary(path: string, report: AgentKnowledgeScanReport) {
  const lines = [
    '# Agent 知识图谱自动发现扫描摘要',
    '',
    `生成时间：${report.generatedAt}`,
    `分支：${report.git.branch ?? 'unknown'}`,
    '',
    '## 门禁结果',
    '',
    `- 状态：${report.gate.passed ? '通过' : '失败'}`,
    `- 阻断项：${report.gate.blockers.length}`,
    `- 提醒项：${report.gate.warnings.length}`,
    '',
    '## 关键发现',
    '',
    `- Prisma model：${report.schema.schemaModelCount}`,
    `- 未映射 BusinessObjectCatalog：${report.schema.missingBusinessObjectMappings.length}`,
    `- 缺中文名重要字段：${report.schema.missingDisplayNames.length}`,
    `- API 候选：${report.api.endpoints.length}`,
    `- DTO 字段候选：${report.api.dtoFieldCandidates.length}`,
    `- real API 方法候选：${report.api.realApiMethods.length}`,
    `- 前端页面候选：${report.frontend.routes.length}`,
    `- implemented 能力：${report.agent.implementedBusinessCapabilities.length}`,
    `- 缺 CapabilityCatalog 映射：${report.agent.missingCatalogMappings.length}`,
    `- 缺执行映射：${report.agent.missingExecutionMappings.length}`,
    `- 缺 SkillRegistry 暴露：${report.agent.missingSkillMappings.length}`,
    `- 缺 ToolRegistry 注册：${report.agent.missingToolRegistryMappings.length}`,
    `- 缺 Eval 覆盖：${report.agent.missingEvalCases.length}`,
    `- 中高风险工具审批缺口：${report.governance.highRiskApprovalGaps.length}`,
    `- 白名单条目：${report.governance.whitelistEntryCount}`,
    `- 白名单已应用：${report.governance.whitelistAppliedCount}`,
    `- 白名单无效项：${report.governance.whitelistInvalidEntries.length}`,
    `- AnswerContract 支持输出类型：${report.agent.answerContractSupportedKinds.length}`,
    '',
    '## 阻断项',
    '',
    ...(report.gate.blockers.length ? report.gate.blockers.map((item) => `- ${item}`) : ['- 无']),
    '',
    '## 提醒项',
    '',
    ...(report.gate.warnings.length ? report.gate.warnings.map((item) => `- ${item}`) : ['- 无']),
    '',
  ];
  writeFileSync(path, `${lines.join('\n')}\n`, 'utf8');
}

function printSummary(report: AgentKnowledgeScanReport) {
  console.log(
    JSON.stringify(
      {
        generatedAt: report.generatedAt,
        branch: report.git.branch,
        gate: report.gate,
        schema: {
          schemaHash: report.schema.schemaHash,
          schemaModelCount: report.schema.schemaModelCount,
          generatedModelCount: report.schema.generatedModelCount,
          missingBusinessObjectMappings: report.schema.missingBusinessObjectMappings.length,
          missingDisplayNames: report.schema.missingDisplayNames.length,
        },
        api: {
          endpoints: report.api.endpoints.length,
          dtoFieldCandidates: report.api.dtoFieldCandidates.length,
          realApiMethods: report.api.realApiMethods.length,
        },
        frontend: {
          routes: report.frontend.routes.length,
          missingCapabilityRoutes: report.frontend.routes.filter((route) => route.missingCapability).length,
        },
        agent: {
          implementedBusinessCapabilities: report.agent.implementedBusinessCapabilities.length,
          missingCatalogMappings: report.agent.missingCatalogMappings.length,
          missingExecutionMappings: report.agent.missingExecutionMappings.length,
          missingSkillMappings: report.agent.missingSkillMappings.length,
          missingToolRegistryMappings: report.agent.missingToolRegistryMappings.length,
          missingEvalCases: report.agent.missingEvalCases.length,
          skillCapabilityIds: report.agent.skillCapabilityIds.length,
          registeredToolNames: report.agent.registeredToolNames.length,
          answerContractSupportedKinds: report.agent.answerContractSupportedKinds.length,
        },
        governance: report.governance,
        outputFiles: [
          'docs/04-测试数据/agent-knowledge-scan-report.json',
          'docs/04-测试数据/agent-knowledge-baseline.json',
          'docs/04-测试数据/agent-knowledge-scan-summary.md',
        ],
      },
      null,
      2,
    ),
  );
}

function runGit(cwd: string, args: string[]) {
  try {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    return result.status === 0 ? String(result.stdout || '').trim() : '';
  } catch {
    return '';
  }
}

main();
