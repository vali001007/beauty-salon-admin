import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { dirname, relative, resolve } from 'path';
import { AgentV2CapabilityDecisionService } from '../src/agent-v2/capability/agent-v2-capability-decision.service.js';
import { AGENT_V2_CAPABILITY_MANIFESTS } from '../src/agent-v2/capability/agent-v2-capability-manifest.js';
import type { AgentRole } from '../src/agent/agent.types.js';

type ReleaseStrategy = 'auto_publish' | 'approval_required' | 'write_blocked';
type RiskLevel = 'low' | 'medium' | 'high';

type PrismaModel = {
  name: string;
  fields: Array<{ name: string; type: string; optional: boolean; list: boolean; relation: boolean }>;
};

type ControllerEndpoint = {
  method: string;
  path: string;
  file: string;
  handler: string;
  line: number;
  permissions: string[];
  dtoNames: string[];
};

type FrontendRoute = {
  path: string;
  file: string;
  line: number;
  permission?: string;
};

type DtoClass = {
  name: string;
  file: string;
  line: number;
  fields: Array<{ name: string; type: string; validators: string[]; required: boolean }>;
};

type EvalQuestion = {
  id: string;
  roleGroup: string;
  section: string;
  question: string;
};

type CapabilityDraft = {
  capabilityId: string;
  status: 'draft';
  source: 'auto_scan_draft';
  displayName: string;
  description: string;
  domain: string;
  businessObject: string;
  personaCodes: string[];
  actions: string[];
  sourceModels: string[];
  sourceDtos: string[];
  sourceApis: string[];
  outputKinds: string[];
  executor: {
    type: string;
    tool: string;
    queryKey: string;
  };
  storeScope: 'required' | 'optional';
  permissionCodes: string[];
  permissionSource: 'controller' | 'route' | 'domain_inferred' | 'none';
  fieldPolicies: Array<{ field: string; label: string; visibility: 'allow' | 'mask' | 'deny'; reason: string }>;
  riskLevel: RiskLevel;
  releaseStrategy: ReleaseStrategy;
  examples: string[];
  negativeExamples: string[];
  triggerKeywords: string[];
  boundaryNotes: string[];
  evidence: string[];
  confirmationNeeded: string[];
};

type CapabilityForEval = Pick<
  CapabilityDraft,
  | 'capabilityId'
  | 'displayName'
  | 'domain'
  | 'personaCodes'
  | 'outputKinds'
  | 'releaseStrategy'
  | 'permissionCodes'
  | 'permissionSource'
  | 'examples'
  | 'triggerKeywords'
>;

type RuntimeCapabilityForEval = CapabilityForEval & {
  status: 'enabled';
  source: 'manual_builtin';
};

type EvalDraft = {
  id: string;
  source: string;
  question: string;
  roleGroup: string;
  expectedCapabilityId: string;
  expectedIntent: string;
  expectedPersonaCodes: string[];
  expectedOutputKinds: string[];
  evidenceRequired: string[];
  permissionResult: 'allow' | 'deny' | 'needs_review';
  contractResult: 'pass' | 'needs_review' | 'blocked';
  failureCategory: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  confirmationNeeded: string[];
};

type ScanSummary = {
  generatedAt: string;
  scanner: string;
  policy: string;
  counts: {
    prismaModels: number;
    dtoClasses: number;
    controllerEndpoints: number;
    controllerEndpointsWithPermissions: number;
    frontendRoutes: number;
    evalQuestions: number;
    capabilityDrafts: number;
    evalDrafts: number;
  };
  outputFiles: string[];
};

const workspaceRoot = resolve(process.cwd(), '../..');
const serverRoot = resolve(workspaceRoot, 'packages/server-v2');
const docsRoot = resolve(workspaceRoot, 'docs/04-测试数据');
const agentV2DocsRoot = resolve(docsRoot, 'Agent评测与知识治理-2026-06-30至07-03');

const schemaPath = resolve(serverRoot, 'prisma/schema.prisma');
const serverSrcRoot = resolve(serverRoot, 'src');
const frontendRoutesPath = resolve(workspaceRoot, 'src/app/routes.tsx');
const frontendLayoutPath = resolve(workspaceRoot, 'src/app/components/Layout.tsx');
const evalQuestionsPath = resolve(agentV2DocsRoot, 'agent-eval-questions.md');

const outputJsonPath = resolve(agentV2DocsRoot, 'agent-v2-capability-drafts.json');
const outputMdPath = resolve(agentV2DocsRoot, 'agent-v2-capability-drafts.md');
const outputEvalJsonPath = resolve(agentV2DocsRoot, 'agent-v2-eval-drafts.json');
const outputEvalMdPath = resolve(agentV2DocsRoot, 'agent-v2-eval-drafts.md');
const outputGovernanceJsonPath = resolve(agentV2DocsRoot, 'agent-v2-capability-governance-report.json');
const outputGovernanceMdPath = resolve(agentV2DocsRoot, 'agent-v2-capability-governance-report.md');

const DOMAIN_RULES = [
  {
    domain: 'finance',
    personaCodes: ['manager', 'finance'],
    keywords: ['finance', 'settlement', 'commission', 'profit', 'payment', 'refund', 'revenue', 'cashier'],
    labels: ['财务', '收银', '日结', '提成', '毛利', '退款', '支付'],
    permissionCodes: ['core:finance:view'],
  },
  {
    domain: 'inventory',
    personaCodes: ['manager', 'inventory'],
    keywords: ['inventory', 'stock', 'movement', 'bom', 'scrap', 'batch', 'warehouse', 'product-unit'],
    labels: ['库存', '耗材', 'BOM', '报废', '临期', '采购'],
    permissionCodes: ['core:inventory:view'],
  },
  {
    domain: 'order',
    personaCodes: ['manager', 'finance', 'reception'],
    keywords: ['order', 'payment', 'cashier', 'card-usage', 'member-card', 'card-order'],
    labels: ['订单', '收银', '核销', '会员卡', '次卡', '开卡'],
    permissionCodes: ['core:order:view'],
  },
  {
    domain: 'customer',
    personaCodes: ['manager', 'consultant'],
    keywords: ['customer', 'profile', 'consumption', 'appointment', 'member'],
    labels: ['客户', '画像', '消费', '预约', '会员'],
    permissionCodes: ['core:customer:view'],
  },
  {
    domain: 'marketing',
    personaCodes: ['manager', 'marketing'],
    keywords: ['marketing', 'promotion', 'campaign', 'activity', 'coupon', 'recommendation', 'automation'],
    labels: ['营销', '活动', '优惠', '权益', '触达', '推荐'],
    permissionCodes: ['core:marketing:view'],
  },
  {
    domain: 'store',
    personaCodes: ['manager'],
    keywords: ['store', 'project', 'beautician', 'schedule', 'staff', 'user'],
    labels: ['门店', '项目', '员工', '美容师', '排班'],
    permissionCodes: ['core:store:view'],
  },
  {
    domain: 'industry',
    personaCodes: ['manager'],
    keywords: ['industry', 'template', 'supply', 'standard'],
    labels: ['行业', '模板', '标准品', '供应链'],
    permissionCodes: ['core:industry:view'],
  },
];

const FIELD_LABELS: Record<string, string> = {
  id: 'ID',
  orderNo: '订单编号',
  customerId: '客户ID',
  customerName: '客户',
  customerPhone: '手机号',
  storeId: '门店ID',
  storeName: '门店',
  productId: '商品ID',
  productName: '商品',
  projectId: '项目ID',
  projectName: '项目',
  amount: '金额',
  netAmount: '净额',
  totalAmount: '总金额',
  refundAmount: '退款金额',
  payMethod: '支付方式',
  status: '状态',
  createdAt: '创建时间',
  updatedAt: '更新时间',
  remark: '备注',
  operatorId: '操作人ID',
  operatorName: '操作人',
  staffUserId: '员工ID',
  phone: '手机号',
};

function main() {
  const generatedAt = formatShanghaiTime(new Date());
  const prismaModels = parsePrismaModels(readOptional(schemaPath));
  const dtoClasses = parseDtoClasses(serverSrcRoot);
  const controllerEndpoints = parseControllerEndpoints(serverSrcRoot);
  const frontendRoutes = parseFrontendRoutes();
  const evalQuestions = parseEvalQuestions(readOptional(evalQuestionsPath));
  const existingCapabilityIds = new Set(AGENT_V2_CAPABILITY_MANIFESTS.map((capability) => capability.capabilityId));

  const capabilityDrafts = buildCapabilityDrafts({
    prismaModels,
    dtoClasses,
    controllerEndpoints,
    frontendRoutes,
    evalQuestions,
    existingCapabilityIds,
  });
  const publishedCapabilities: RuntimeCapabilityForEval[] = AGENT_V2_CAPABILITY_MANIFESTS.map((capability) => ({
    capabilityId: capability.capabilityId,
    status: 'enabled',
    source: 'manual_builtin',
    displayName: capability.displayName,
    domain: capability.domain,
    personaCodes: capability.personaCodes,
    outputKinds: capability.outputKinds,
    releaseStrategy: capability.releaseStrategy,
    permissionCodes: capability.permissionCodes,
    permissionSource: capability.permissionCodes.length ? 'controller' : 'none',
    examples: capability.examples,
    triggerKeywords: capability.triggerKeywords,
  }));
  const evalDrafts = buildEvalDrafts(evalQuestions, [...publishedCapabilities, ...capabilityDrafts]);
  const governanceReport = buildGovernanceReport({
    generatedAt,
    prismaModels,
    dtoClasses,
    controllerEndpoints,
    frontendRoutes,
    capabilityDrafts,
    evalDrafts,
  });

  writeJson(outputJsonPath, {
    generatedAt,
    source: 'agent-v2 auto capability scanner',
    policy:
      '直接写入、删除、发券、下发类能力不自动发布；只读、指标、趋势、详情、诊断、草稿类能力允许进入自动发布候选。',
    total: capabilityDrafts.length,
    governanceReport: relativePath(outputGovernanceJsonPath),
    drafts: capabilityDrafts,
  });
  writeCapabilityMarkdown(outputMdPath, generatedAt, capabilityDrafts);

  writeJson(outputEvalJsonPath, {
    generatedAt,
    sourceQuestionBank: relativePath(evalQuestionsPath),
    total: evalDrafts.length,
    drafts: evalDrafts,
  });
  writeEvalMarkdown(outputEvalMdPath, generatedAt, evalDrafts);
  writeJson(outputGovernanceJsonPath, governanceReport);
  writeGovernanceMarkdown(outputGovernanceMdPath, governanceReport);

  const summary: ScanSummary = {
    generatedAt,
    scanner: 'agent-v2-capability-draft-generator',
    policy: 'V2 重新开发；旧 Agent 仅保留兼容桥接，不向旧 compiler/planner/tool registry 写入新业务规则。',
    counts: {
      prismaModels: prismaModels.length,
      dtoClasses: dtoClasses.length,
      controllerEndpoints: controllerEndpoints.length,
      controllerEndpointsWithPermissions: controllerEndpoints.filter((endpoint) => endpoint.permissions.length > 0).length,
      frontendRoutes: frontendRoutes.length,
      evalQuestions: evalQuestions.length,
      capabilityDrafts: capabilityDrafts.length,
      evalDrafts: evalDrafts.length,
    },
    outputFiles: [outputJsonPath, outputMdPath, outputEvalJsonPath, outputEvalMdPath, outputGovernanceJsonPath, outputGovernanceMdPath].map(
      relativePath,
    ),
  };

  console.log(JSON.stringify(summary, null, 2));
}

function buildCapabilityDrafts(input: {
  prismaModels: PrismaModel[];
  dtoClasses: DtoClass[];
  controllerEndpoints: ControllerEndpoint[];
  frontendRoutes: FrontendRoute[];
  evalQuestions: EvalQuestion[];
  existingCapabilityIds: Set<string>;
}) {
  const drafts: CapabilityDraft[] = [];

  for (const endpoint of input.controllerEndpoints) {
    const domain = guessDomain(`${endpoint.path} ${endpoint.file} ${endpoint.handler}`);
    const actionKind = guessActionKind(endpoint.method, endpoint.path, endpoint.handler);
    const capabilityId = buildCapabilityId(domain.domain, endpoint.path, actionKind);
    if (input.existingCapabilityIds.has(capabilityId)) continue;

    const matchedModels = findLikelyModels(input.prismaModels, endpoint.path, domain.domain);
    const matchedDtos = findLikelyDtos(input.dtoClasses, endpoint);
    const releaseStrategy = guessReleaseStrategy(endpoint.method, endpoint.path, endpoint.handler);
    const outputKinds = outputKindsFor(actionKind, releaseStrategy);
    const displayName = buildDisplayName(domain.domain, endpoint.path, actionKind);
    const permissionCodes = endpoint.permissions.length ? endpoint.permissions : domain.permissionCodes;
    const permissionSource = endpoint.permissions.length ? 'controller' : 'domain_inferred';

    drafts.push({
      capabilityId,
      status: 'draft',
      source: 'auto_scan_draft',
      displayName,
      description: `${displayName} 候选能力，来自后端接口扫描，需要确认业务口径后再进入正式能力目录。`,
      domain: domain.domain,
      businessObject: matchedModels[0]?.name ?? guessBusinessObject(endpoint.path),
      personaCodes: domain.personaCodes,
      actions: actionsFor(actionKind),
      sourceModels: matchedModels.map((model) => model.name).slice(0, 6),
      sourceDtos: matchedDtos.map((dto) => dto.name).slice(0, 6),
      sourceApis: [`${endpoint.method} ${endpoint.path}`],
      outputKinds,
      executor: executorFor(actionKind),
      storeScope: endpoint.path.includes('store') || domain.domain !== 'industry' ? 'required' : 'optional',
      permissionCodes,
      permissionSource,
      fieldPolicies: buildFieldPolicies(matchedModels, matchedDtos),
      riskLevel: riskFor(releaseStrategy, endpoint.path),
      releaseStrategy,
      examples: exampleQuestionsFor(displayName, endpoint.path, actionKind),
      negativeExamples: negativeExamplesFor(domain.domain, actionKind),
      triggerKeywords: triggerKeywordsFor(endpoint.path, displayName),
      boundaryNotes: boundaryNotesFor(releaseStrategy, actionKind),
      evidence: [
        `controller:${relativePath(endpoint.file)}:${endpoint.line}`,
        `api:${endpoint.method} ${endpoint.path}`,
        ...(permissionCodes.length ? [`permission:${permissionCodes.join('|')}`] : ['permission:missing']),
        ...(matchedDtos.length ? matchedDtos.map((dto) => `dto:${dto.name}`) : ['dto:missing']),
      ],
      confirmationNeeded: confirmationNeededFor(releaseStrategy, matchedModels, matchedDtos, permissionCodes, permissionSource),
    });
  }

  for (const route of input.frontendRoutes) {
    const domain = guessDomain(route.path);
    const capabilityId = buildCapabilityId(domain.domain, route.path, 'page_context');
    if (input.existingCapabilityIds.has(capabilityId)) continue;
    if (drafts.some((draft) => draft.capabilityId === capabilityId)) continue;

    const displayName = buildDisplayName(domain.domain, route.path, 'page_context');
    drafts.push({
      capabilityId,
      status: 'draft',
      source: 'auto_scan_draft',
      displayName,
      description: `${displayName} 候选能力，来自前端路由扫描，用于识别管理端新增页面是否需要 Agent 能力承接。`,
      domain: domain.domain,
      businessObject: guessBusinessObject(route.path),
      personaCodes: domain.personaCodes,
      actions: ['lookup'],
      sourceModels: findLikelyModels(input.prismaModels, route.path, domain.domain)
        .map((model) => model.name)
        .slice(0, 4),
      sourceDtos: [],
      sourceApis: [],
      outputKinds: ['evidence_panel'],
      executor: { type: 'business_detail_query', tool: 'business.detail.query', queryKey: capabilityId },
      storeScope: domain.domain === 'industry' ? 'optional' : 'required',
      permissionCodes: route.permission ? [route.permission] : domain.permissionCodes,
      permissionSource: route.permission ? 'route' : 'domain_inferred',
      fieldPolicies: [],
      riskLevel: 'low',
      releaseStrategy: 'auto_publish',
      examples: [`${displayName}是什么`, `${displayName}能查哪些数据`],
      negativeExamples: ['执行删除', '直接发券', '直接下发跟进'],
      triggerKeywords: triggerKeywordsFor(route.path, displayName),
      boundaryNotes: ['路由候选只用于页面语义识别，不代表已经有完整业务查询工具。'],
      evidence: [`route:${route.path}`, `file:${relativePath(route.file)}:${route.line}`],
      confirmationNeeded: [
        '确认页面对应业务对象',
        '确认是否已有后端 API 支撑',
        route.permission ? '确认路由权限是否可直接复用' : '确认权限码与字段策略',
      ],
    });
  }

  return dedupeCapabilities(drafts).sort(
    (a, b) => releaseRank(a.releaseStrategy) - releaseRank(b.releaseStrategy) || a.capabilityId.localeCompare(b.capabilityId),
  );
}

function buildEvalDrafts(evalQuestions: EvalQuestion[], capabilityDrafts: CapabilityForEval[]) {
  const drafts: EvalDraft[] = [];
  const decisionService = new AgentV2CapabilityDecisionService();

  for (const question of evalQuestions) {
    const domain = guessDomain(`${question.roleGroup} ${question.section} ${question.question}`);
    const decision = decisionService.decide({
      message: question.question,
      role: roleForEval(question.roleGroup),
    });
    const runtimeCapability = decision.selected
      ? capabilityDrafts.find((draft) => draft.capabilityId === decision.selected?.capabilityId)
      : undefined;
    const matchedCapability = runtimeCapability ?? bestCapabilityForQuestion(question.question, capabilityDrafts, domain.domain);
    drafts.push({
      id: question.id,
      source: relativePath(evalQuestionsPath),
      question: question.question,
      roleGroup: question.roleGroup,
      expectedCapabilityId: matchedCapability?.capabilityId ?? `${domain.domain}.unmapped.eval_candidate`,
      expectedIntent: expectedIntentForQuestion(question.question, matchedCapability),
      expectedPersonaCodes: matchedCapability?.personaCodes ?? domain.personaCodes,
      expectedOutputKinds: matchedCapability?.outputKinds ?? ['answer', 'evidence_panel'],
      evidenceRequired: evidenceRequiredForQuestion(question.question, matchedCapability),
      permissionResult: permissionResultForCapability(matchedCapability),
      contractResult: contractResultForCapability(question.question, matchedCapability),
      failureCategory: failureCategoryForQuestion(question.question, matchedCapability),
      priority: priorityForQuestion(question.question, matchedCapability),
      confirmationNeeded: matchedCapability
        ? ['确认题目是否应进入正式回归集', '确认期望输出类型是否准确']
        : ['未匹配到能力草稿，需要人工确认是否新增能力', '确认是否为闲聊/低风险直答/业务查询'],
    });
  }

  return drafts;
}

function roleForEval(roleGroup: string): AgentRole {
  if (/前台|收银/.test(roleGroup)) return 'reception';
  if (/美容师/.test(roleGroup)) return 'beautician';
  return 'manager';
}

function buildGovernanceReport(input: {
  generatedAt: string;
  prismaModels: PrismaModel[];
  dtoClasses: DtoClass[];
  controllerEndpoints: ControllerEndpoint[];
  frontendRoutes: FrontendRoute[];
  capabilityDrafts: CapabilityDraft[];
  evalDrafts: EvalDraft[];
}) {
  const byReleaseStrategy = countBy(input.capabilityDrafts, (draft) => draft.releaseStrategy);
  const byDomain = countBy(input.capabilityDrafts, (draft) => draft.domain);
  const byFailureCategory = countBy(input.evalDrafts, (draft) => draft.failureCategory);
  const missingPermission = input.capabilityDrafts.filter((draft) => !draft.permissionCodes.length);
  const inferredPermission = input.capabilityDrafts.filter((draft) => draft.permissionSource === 'domain_inferred');
  const missingDto = input.capabilityDrafts.filter((draft) => draft.sourceApis.length > 0 && !draft.sourceDtos.length);
  const missingModel = input.capabilityDrafts.filter((draft) => !draft.sourceModels.length);
  const highRiskAutoPublish = input.capabilityDrafts.filter(
    (draft) => draft.releaseStrategy === 'auto_publish' && draft.riskLevel !== 'low',
  );
  const unmappedEval = input.evalDrafts.filter((draft) => draft.expectedCapabilityId.endsWith('.unmapped.eval_candidate'));

  return {
    generatedAt: input.generatedAt,
    scanner: 'agent-v2-capability-draft-generator',
    policy:
      '直接写入、删除、发券、下发必须审批或阻断；其他只读、指标、趋势、详情、诊断、草稿类能力可自动发布，但必须有权限、证据包和字段策略。',
    counts: {
      prismaModels: input.prismaModels.length,
      dtoClasses: input.dtoClasses.length,
      controllerEndpoints: input.controllerEndpoints.length,
      controllerEndpointsWithPermissions: input.controllerEndpoints.filter((endpoint) => endpoint.permissions.length > 0).length,
      frontendRoutes: input.frontendRoutes.length,
      capabilityDrafts: input.capabilityDrafts.length,
      evalDrafts: input.evalDrafts.length,
      unmappedEval: unmappedEval.length,
    },
    distributions: {
      byReleaseStrategy,
      byDomain,
      byFailureCategory,
    },
    gates: {
      missingPermission: summarizeDrafts(missingPermission),
      inferredPermission: summarizeDrafts(inferredPermission),
      missingDto: summarizeDrafts(missingDto),
      missingModel: summarizeDrafts(missingModel),
      highRiskAutoPublish: summarizeDrafts(highRiskAutoPublish),
      unmappedEval: unmappedEval.slice(0, 50).map((draft) => ({
        id: draft.id,
        question: draft.question,
        roleGroup: draft.roleGroup,
        expectedCapabilityId: draft.expectedCapabilityId,
      })),
    },
    recommendations: [
      inferredPermission.length
        ? '优先把领域推断权限替换为后端 @Permissions 或前端 route permission，避免自动发布依赖弱口径。'
        : missingPermission.length
          ? '优先补齐后端 @Permissions 或前端路由权限，避免能力进入模型上下文但无法授权。'
          : '权限扫描无明显缺口。',
      missingDto.length ? '对缺 DTO 的接口补充入参契约或标记为只读无参，减少工具调用参数幻觉。' : 'DTO 扫描无明显缺口。',
      unmappedEval.length ? '未映射题目需要按领域批量归并为新能力或明确标记为闲聊/暂不支持。' : '题库已全部映射到候选能力。',
      highRiskAutoPublish.length ? '中高风险自动发布候选需降级为审批或补充字段脱敏策略。' : '自动发布候选风险分布可接受。',
    ],
  };
}

function parsePrismaModels(text: string): PrismaModel[] {
  const models: PrismaModel[] = [];
  const regex = /^model\s+(\w+)\s+\{([\s\S]*?)^\}/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    const [, name, body] = match;
    const fields = body
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('//') && !line.startsWith('@@') && !line.startsWith('@'))
      .map((line) => {
        const fieldMatch = /^(\w+)\s+([A-Za-z0-9_\[\]?]+)/.exec(line);
        if (!fieldMatch) return null;
        const [, name, rawType] = fieldMatch;
        return {
          name,
          type: rawType.replace(/\?|\[\]/g, ''),
          optional: rawType.includes('?'),
          list: rawType.includes('[]'),
          relation: /@relation/.test(line) || /^[A-Z]/.test(rawType.replace(/\?|\[\]/g, '')),
        };
      })
      .filter((field): field is { name: string; type: string; optional: boolean; list: boolean; relation: boolean } => Boolean(field));
    models.push({ name, fields });
  }
  return models;
}

function parseDtoClasses(root: string): DtoClass[] {
  const files = listFiles(root).filter((file) => file.endsWith('.dto.ts') || /[\\/]dto[\\/]/.test(file));
  const dtoClasses: DtoClass[] = [];
  for (const file of files) {
    const lines = readOptional(file).split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      const classMatch = /^\s*export\s+class\s+(\w+)/.exec(lines[index]);
      if (!classMatch) continue;

      const fields: DtoClass['fields'] = [];
      let decorators: string[] = [];
      for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        const line = lines[cursor];
        if (/^\s*export\s+class\s+\w+/.test(line)) break;
        const decoratorMatch = /^\s*@(\w+)/.exec(line);
        if (decoratorMatch) {
          decorators.push(decoratorMatch[1]);
          continue;
        }
        const fieldMatch = /^\s*(?:readonly\s+)?(\w+)(\?)?:\s*([^;=]+)/.exec(line);
        if (!fieldMatch) continue;
        const [, fieldName, optionalMark, rawType] = fieldMatch;
        const validators = decorators;
        fields.push({
          name: fieldName,
          type: rawType.trim().replace(/\[\]/g, '[]'),
          validators,
          required: !optionalMark && !validators.includes('IsOptional'),
        });
        decorators = [];
      }

      dtoClasses.push({
        name: classMatch[1],
        file,
        line: index + 1,
        fields,
      });
    }
  }
  return dedupeBy(dtoClasses, (dto) => `${dto.name}:${relativePath(dto.file)}`);
}

function parseControllerEndpoints(root: string): ControllerEndpoint[] {
  const files = listFiles(root).filter((file) => file.endsWith('.controller.ts'));
  const endpoints: ControllerEndpoint[] = [];
  for (const file of files) {
    const text = readOptional(file);
    const controllerPrefix = extractDecoratorPath(text, 'Controller') ?? '';
    const lines = text.split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const decorator = /@(Get|Post|Put|Patch|Delete)\(([^)]*)\)/.exec(line);
      if (!decorator) continue;
      const method = decorator[1].toUpperCase();
      const methodPath = extractDecoratorPath(line, decorator[1]) ?? '';
      const handler = findHandlerName(lines, index + 1);
      endpoints.push({
        method,
        path: normalizeApiPath(controllerPrefix, methodPath),
        file,
        handler,
        line: index + 1,
        permissions: extractNearbyPermissions(lines, index),
        dtoNames: extractNearbyDtoNames(lines, index),
      });
    }
  }
  return endpoints;
}

function parseFrontendRoutes(): FrontendRoute[] {
  const files = [frontendRoutesPath, frontendLayoutPath].filter(existsSync);
  const routes: FrontendRoute[] = [];
  for (const file of files) {
    const lines = readOptional(file).split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const matches = [...line.matchAll(/(?:path|to|href):\s*['"`]([^'"`]+)['"`]|(?:to|href)=['"`]([^'"`]+)['"`]/g)];
      for (const match of matches) {
        const routePath = match[1] ?? match[2];
        if (!routePath || !routePath.startsWith('/') || routePath.includes('${')) continue;
        routes.push({ path: routePath, file, line: index + 1, permission: extractRoutePermission(line) });
      }
    }
  }
  return dedupeBy(routes, (route) => `${route.path}:${relativePath(route.file)}`);
}

function parseEvalQuestions(text: string): EvalQuestion[] {
  const questions: EvalQuestion[] = [];
  let roleGroup = '未分组';
  let section = '未分节';
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    const roleMatch = /^##\s+(.+)/.exec(line);
    if (roleMatch) {
      roleGroup = roleMatch[1].replace(/^\S+、/, '').replace(/（.*?）/g, '').trim();
      section = '未分节';
      continue;
    }
    const sectionMatch = /^###\s+(.+)/.exec(line);
    if (sectionMatch) {
      section = sectionMatch[1].replace(/（.*?）/g, '').trim();
      continue;
    }
    const questionMatch = /^(\d+)\.\s+(.+)/.exec(line);
    if (!questionMatch) continue;
    questions.push({
      id: `q${questionMatch[1].padStart(3, '0')}`,
      roleGroup,
      section,
      question: questionMatch[2].trim(),
    });
  }
  return questions;
}

function guessDomain(text: string) {
  const normalized = text.toLowerCase();
  const scored = DOMAIN_RULES.map((rule) => {
    const keywordScore = rule.keywords.reduce((score, keyword) => score + (normalized.includes(keyword.toLowerCase()) ? 2 : 0), 0);
    const labelScore = rule.labels.reduce((score, label) => score + (text.includes(label) ? 2 : 0), 0);
    return { rule, score: keywordScore + labelScore };
  }).sort((a, b) => b.score - a.score);
  return scored[0]?.score ? scored[0].rule : DOMAIN_RULES[0];
}

function guessActionKind(method: string, path: string, handler: string) {
  const text = `${path} ${handler}`.toLowerCase();
  if (method !== 'GET') return 'action_draft';
  if (/summary|stats|statistic|metric|dashboard|overview|report|settlement|profit/.test(text)) return 'metric';
  if (/:id|detail|by-id/.test(text)) return 'detail';
  if (/trend|daily|monthly|weekly|compare/.test(text)) return 'trend';
  return 'records';
}

function guessReleaseStrategy(method: string, path: string, handler: string): ReleaseStrategy {
  const text = `${method} ${path} ${handler}`.toLowerCase();
  if (method !== 'GET') {
    if (/delete|remove|refund|void|discard|scrap|write-off|force|hard/.test(text)) return 'write_blocked';
    if (/issue|grant|send|push|dispatch|coupon|voucher/.test(text)) return 'approval_required';
    return 'approval_required';
  }
  return 'auto_publish';
}

function riskFor(strategy: ReleaseStrategy, path: string): RiskLevel {
  if (strategy === 'write_blocked') return 'high';
  if (strategy === 'approval_required') return 'medium';
  return 'low';
}

function outputKindsFor(actionKind: string, releaseStrategy: ReleaseStrategy) {
  if (releaseStrategy !== 'auto_publish') return ['action_card', 'evidence_panel'];
  if (actionKind === 'metric') return ['kpi', 'table', 'evidence_panel'];
  if (actionKind === 'trend') return ['trend', 'table', 'evidence_panel'];
  if (actionKind === 'detail') return ['detail', 'evidence_panel'];
  if (actionKind === 'page_context') return ['evidence_panel'];
  return ['table', 'evidence_panel'];
}

function actionsFor(actionKind: string) {
  if (actionKind === 'metric') return ['summary', 'analyze'];
  if (actionKind === 'trend') return ['analyze'];
  if (actionKind === 'detail') return ['lookup'];
  if (actionKind === 'action_draft') return ['draft'];
  if (actionKind === 'page_context') return ['lookup'];
  return ['list', 'summary'];
}

function executorFor(actionKind: string) {
  if (actionKind === 'metric') return { type: 'business_metric_query', tool: 'business.metric.query', queryKey: 'auto.metric' };
  if (actionKind === 'trend') return { type: 'business_trend_query', tool: 'business.trend.query', queryKey: 'auto.trend' };
  if (actionKind === 'detail') return { type: 'business_detail_query', tool: 'business.detail.query', queryKey: 'auto.detail' };
  if (actionKind === 'action_draft') return { type: 'business_action_draft', tool: 'business.action.draft', queryKey: 'auto.action-draft' };
  return { type: 'business_record_query', tool: 'business.record.query', queryKey: 'auto.records' };
}

function buildCapabilityId(domain: string, path: string, actionKind: string) {
  const normalizedPath = path
    .replace(/^\/?api\//, '')
    .replace(/^\/+/, '')
    .replace(/[:{}]/g, '')
    .split('/')
    .filter(Boolean)
    .filter((part) => !['admin', 'paginated', 'list'].includes(part))
    .slice(0, 4)
    .join('.');
  const suffix =
    actionKind === 'metric'
      ? 'metric'
      : actionKind === 'trend'
        ? 'trend'
        : actionKind === 'detail'
          ? 'detail'
          : actionKind === 'action_draft'
            ? 'action.draft'
            : actionKind === 'page_context'
              ? 'page.context'
              : 'records.list';
  return normalizeId(`${domain}.${normalizedPath || 'general'}.${suffix}`);
}

function buildDisplayName(domain: string, path: string, actionKind: string) {
  const domainName = domainLabel(domain);
  const target = path
    .split('/')
    .filter(Boolean)
    .slice(-2)
    .join(' / ')
    .replace(/[-_]/g, ' ');
  const actionName: Record<string, string> = {
    records: '记录查询',
    metric: '指标查询',
    trend: '趋势分析',
    detail: '详情查询',
    action_draft: '动作草稿',
    page_context: '页面语义',
  };
  return `${domainName}${target ? ` ${target}` : ''}${actionName[actionKind] ?? '能力'}`;
}

function domainLabel(domain: string) {
  const labels: Record<string, string> = {
    finance: '财务',
    inventory: '库存',
    order: '订单',
    customer: '客户',
    marketing: '营销',
    store: '门店',
    industry: '行业',
  };
  return labels[domain] ?? domain;
}

function guessBusinessObject(path: string) {
  const parts = path
    .split('/')
    .filter(Boolean);
  let cleaned = '';
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    if (!part.startsWith(':') && !['api', 'admin', 'paginated', 'list'].includes(part)) {
      cleaned = part;
      break;
    }
  }
  return toPascalCase(cleaned || 'BusinessRecord');
}

function findLikelyModels(models: PrismaModel[], text: string, domain: string) {
  const normalized = text.toLowerCase();
  const domainRule = DOMAIN_RULES.find((rule) => rule.domain === domain);
  return models
    .map((model) => {
      const modelName = model.name.toLowerCase();
      const direct = normalized.includes(modelName) || normalized.includes(kebab(model.name)) ? 6 : 0;
      const fieldScore = model.fields.reduce((score, field) => score + (normalized.includes(field.name.toLowerCase()) ? 1 : 0), 0);
      const domainScore =
        domainRule?.keywords.reduce((score, keyword) => score + (modelName.includes(keyword) ? 2 : 0), 0) ??
        0;
      return { model, score: direct + fieldScore + domainScore };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.model)
    .slice(0, 6);
}

function findLikelyDtos(dtoClasses: DtoClass[], endpoint: ControllerEndpoint) {
  const explicit = new Set(endpoint.dtoNames);
  const text = `${endpoint.path} ${endpoint.handler}`.toLowerCase();
  return dtoClasses
    .map((dto) => {
      const dtoName = dto.name.toLowerCase();
      const explicitScore = explicit.has(dto.name) ? 10 : 0;
      const pathScore = text.includes(dtoName.replace(/dto$/, '')) ? 4 : 0;
      const fieldScore = dto.fields.reduce((score, field) => score + (text.includes(field.name.toLowerCase()) ? 1 : 0), 0);
      return { dto, score: explicitScore + pathScore + fieldScore };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.dto)
    .slice(0, 6);
}

function buildFieldPolicies(models: PrismaModel[], dtoClasses: DtoClass[] = []) {
  const fields = dedupeBy(
    [
      ...models.flatMap((model) => model.fields.map((field) => ({ name: field.name, type: field.type }))),
      ...dtoClasses.flatMap((dto) => dto.fields.map((field) => ({ name: field.name, type: field.type }))),
    ],
    (field) => field.name,
  ).slice(0, 14);
  return fields.map((field) => ({
    field: field.name,
    label: FIELD_LABELS[field.name] ?? field.name,
    visibility: fieldVisibility(field.name),
    reason: fieldVisibility(field.name) === 'mask' ? '可能包含客户隐私或内部说明，默认脱敏' : '候选业务查询字段',
  }));
}

function fieldVisibility(fieldName: string): 'allow' | 'mask' | 'deny' {
  if (/password|token|secret|openid|unionid/i.test(fieldName)) return 'deny';
  if (/phone|mobile|remark|note|address|idCard|identity/i.test(fieldName)) return 'mask';
  return 'allow';
}

function exampleQuestionsFor(displayName: string, path: string, actionKind: string) {
  if (actionKind === 'metric') return [`${displayName}是多少`, `今天${displayName}情况怎么样`];
  if (actionKind === 'trend') return [`最近7天${displayName}趋势怎么样`, `${displayName}和上周比怎么样`];
  if (actionKind === 'detail') return [`查看${displayName}`, `${displayName}明细是什么`];
  if (actionKind === 'action_draft') return [`帮我生成${displayName}`, `${displayName}需要怎么处理`];
  return [`列出${displayName}`, `今天${displayName}有哪些`].map((item) => item.replace(/\s+/g, ' '));
}

function negativeExamplesFor(domain: string, actionKind: string) {
  if (actionKind === 'records') return ['直接删除这条记录', '帮我发券', '立即下发跟进'];
  if (domain === 'inventory') return ['把风险库存当成已报废记录', '直接修改库存'];
  if (domain === 'finance') return ['绕过权限查看手机号', '直接改日结金额'];
  return ['直接写入业务数据', '绕过审批执行动作'];
}

function triggerKeywordsFor(path: string, displayName: string) {
  const words = new Set<string>();
  for (const part of path.split('/')) {
    if (part && !part.startsWith(':') && part.length > 2) words.add(part.replace(/[-_]/g, ' '));
  }
  displayName
    .split(/\s+/)
    .filter(Boolean)
    .forEach((part) => words.add(part));
  return [...words].slice(0, 12);
}

function boundaryNotesFor(releaseStrategy: ReleaseStrategy, actionKind: string) {
  if (releaseStrategy === 'write_blocked') return ['直接删除、退款、报废、强制写入类动作不能由 Agent 自动执行。'];
  if (releaseStrategy === 'approval_required') return ['该能力只能生成草稿或确认卡，需要人确认后才能执行。'];
  if (actionKind === 'records') return ['只读记录类能力可自动发布，但必须按权限和字段策略返回授权证据包。'];
  return ['非直接写入/删除/发券/下发类能力可进入自动发布候选。'];
}

function confirmationNeededFor(
  releaseStrategy: ReleaseStrategy,
  models: PrismaModel[],
  dtoClasses: DtoClass[],
  permissionCodes: string[],
  permissionSource: CapabilityDraft['permissionSource'],
) {
  const base = ['确认业务对象口径', '确认权限码', '确认字段脱敏策略'];
  if (!models.length) base.push('确认 Prisma 主表或外部数据源');
  if (!dtoClasses.length) base.push('确认接口入参 DTO 或请求契约');
  if (!permissionCodes.length) base.push('补齐接口权限码');
  if (permissionSource === 'domain_inferred') base.push('权限码来自领域推断，需绑定真实 controller 或 route 权限');
  if (releaseStrategy !== 'auto_publish') base.push('确认审批策略和动作边界');
  return base;
}

function bestCapabilityForQuestion(question: string, drafts: CapabilityForEval[], domain: string) {
  const scored = drafts
    .map((draft) => {
      const keywordScore = draft.triggerKeywords.reduce((score, keyword) => score + (question.includes(keyword) ? 4 : 0), 0);
      const domainScore = draft.domain === domain ? 2 : 0;
      const exampleScore = draft.examples.some((example) => similarQuestion(question, example)) ? 5 : 0;
      const displayScore = draft.displayName && question.includes(draft.displayName) ? 3 : 0;
      const semanticScore = keywordScore + exampleScore + displayScore;
      return { draft, semanticScore, score: semanticScore + domainScore };
    })
    .filter((item) => item.semanticScore > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.draft;
}

function priorityForQuestion(question: string, matchedCapability?: CapabilityForEval): 'P0' | 'P1' | 'P2' | 'P3' {
  if (/报废|临期|订单|收银|财务|提成|权限|手机号|退款|删除|发券|下发|核销|充值|会员卡|次卡|库存|日结|毛利|支付/.test(question)) {
    return 'P0';
  }
  if (!matchedCapability) return 'P2';
  if (matchedCapability.releaseStrategy !== 'auto_publish') return 'P1';
  if (/今天|本周|本月|订单|收银|退款|提成|库存|报废|客户|核销/.test(question)) return 'P1';
  return 'P2';
}

function expectedIntentForQuestion(question: string, matchedCapability?: CapabilityForEval) {
  if (!matchedCapability) return 'needs_capability_mapping';
  if (isNavigationQuestion(question)) return 'navigation_action';
  if (/为什么|原因|怎么回事|是否|有没有|是不是/.test(question)) return 'diagnose_with_evidence';
  if (/多少|汇总|统计|收入|毛利|提成|净额|客单价/.test(question)) return 'metric_summary';
  if (/哪些|列表|明细|记录|订单|客户|商品|项目/.test(question)) return 'record_lookup';
  if (/趋势|同比|环比|对比|最近/.test(question)) return 'trend_analysis';
  if (hasDirectWriteIntent(question)) return 'action_draft_or_approval';
  return matchedCapability.outputKinds.includes('evidence_panel') ? 'explain_with_evidence' : 'business_answer';
}

function evidenceRequiredForQuestion(question: string, matchedCapability?: CapabilityForEval) {
  if (!matchedCapability) return ['capability_catalog', 'route_or_data_source'];
  const evidence = ['capability_manifest', 'permission_check', 'authorized_evidence_package'];
  if (/订单|收银|支付|退款|充值|核销/.test(question)) evidence.push('business_record_ids');
  if (/金额|收入|毛利|提成|净额|成本|ROI/.test(question)) evidence.push('calculation_formula');
  if (/为什么|原因|怎么回事|是否|有没有|是不是/.test(question)) evidence.push('diagnosis_steps');
  return evidence;
}

function permissionResultForCapability(matchedCapability?: CapabilityForEval): EvalDraft['permissionResult'] {
  if (!matchedCapability) return 'needs_review';
  if (matchedCapability.permissionSource === 'domain_inferred') return 'needs_review';
  return matchedCapability.permissionCodes.length ? 'allow' : 'needs_review';
}

function contractResultForCapability(question: string, matchedCapability?: CapabilityForEval): EvalDraft['contractResult'] {
  if (!matchedCapability) return 'needs_review';
  if (matchedCapability.releaseStrategy === 'write_blocked') return 'blocked';
  if (hasDirectWriteIntent(question) && matchedCapability.releaseStrategy === 'auto_publish') {
    return 'needs_review';
  }
  return 'pass';
}

function failureCategoryForQuestion(question: string, matchedCapability?: CapabilityForEval) {
  if (!matchedCapability) return '能力缺失';
  if (!matchedCapability.permissionCodes.length || matchedCapability.permissionSource === 'domain_inferred') return '权限缺失';
  if (/报废/.test(question) && /风险/.test(matchedCapability.displayName) && /哪些|已经|记录/.test(question)) return '语义错路由';
  if (hasDirectWriteIntent(question) && matchedCapability.releaseStrategy === 'auto_publish') return '动作边界缺失';
  return '待验证';
}

function isNavigationQuestion(question: string) {
  return /打开|进入|跳转|切到|调出/.test(question) && /页面|界面|收银|核销|工作台|列表/.test(question);
}

function hasDirectWriteIntent(question: string) {
  if (isNavigationQuestion(question)) return false;
  const readIntent = /几笔|多少|金额|统计|有没有|哪些|列表|查询|查看|看一下|平均|周期|记录|明细|报告|简报|是否|是不是|原因|为什么|情况|申请|待审批|处理时间/.test(question);
  if (readIntent && !/直接删除|直接写入|直接发券|直接下发|直接退款|确认核销|做核销/.test(question)) return false;
  if (/删除|发券|下发|写入/.test(question)) return true;
  if (/退款|退费/.test(question)) return /帮我(退款|退费)|发起退款|执行退款|直接退款|操作退款|处理这笔退款/.test(question);
  if (/核销/.test(question)) {
    if (/看一下|情况|核销了多少|核销率|核销周期|核销记录|核销明细|是否核销|有没有核销/.test(question)) return false;
    return /确认核销|做核销|直接核销|执行核销|立即核销/.test(question);
  }
  if (/发布/.test(question)) return /帮我|直接|立即|执行|发布活动|上线/.test(question);
  if (/新增|创建/.test(question)) return /帮我|直接|立即|执行|创建|新增/.test(question);
  return false;
}

function similarQuestion(a: string, b: string) {
  const tokens = [...new Set([...a, ...b].filter((char) => /[\u4e00-\u9fa5A-Za-z0-9]/.test(char)))];
  if (!tokens.length) return false;
  const overlap = tokens.filter((token) => a.includes(token) && b.includes(token)).length;
  return overlap / tokens.length > 0.6;
}

function extractDecoratorPath(text: string, decoratorName: string) {
  const regex = new RegExp(`@${decoratorName}\\(([^)]*)\\)`);
  const match = regex.exec(text);
  if (!match) return null;
  return extractFirstString(match[1]) ?? '';
}

function extractNearbyPermissions(lines: string[], decoratorIndex: number) {
  const permissions: string[] = [];
  for (let index = Math.max(0, decoratorIndex - 6); index <= decoratorIndex; index += 1) {
    const line = lines[index];
    const match = /@Permissions\(([^)]*)\)/.exec(line);
    if (!match) continue;
    permissions.push(...extractStringLiterals(match[1]).filter((value) => value.includes(':')));
  }
  return [...new Set(permissions)];
}

function extractNearbyDtoNames(lines: string[], decoratorIndex: number) {
  const dtoNames: string[] = [];
  for (let index = decoratorIndex + 1; index < Math.min(lines.length, decoratorIndex + 14); index += 1) {
    const line = lines[index];
    for (const match of line.matchAll(/:\s*([A-Z]\w*Dto)\b/g)) {
      dtoNames.push(match[1]);
    }
    if (/^\s*\}/.test(line)) break;
  }
  return [...new Set(dtoNames)];
}

function extractRoutePermission(line: string) {
  const withGuardMatch = /withGuard\(\s*['"`]([^'"`]+)['"`]/.exec(line);
  if (withGuardMatch) return withGuardMatch[1];
  const permissionMatch = /permission:\s*['"`]([^'"`]+)['"`]/.exec(line);
  return permissionMatch?.[1];
}

function extractFirstString(text: string) {
  const match = /['"`]([^'"`]*)['"`]/.exec(text);
  return match?.[1] ?? null;
}

function extractStringLiterals(text: string) {
  return [...text.matchAll(/['"`]([^'"`]+)['"`]/g)].map((match) => match[1]);
}

function findHandlerName(lines: string[], startIndex: number) {
  for (let index = startIndex; index < Math.min(lines.length, startIndex + 8); index += 1) {
    const match = /^\s*(?:async\s+)?([A-Za-z0-9_]+)\s*\(/.exec(lines[index]);
    if (match) return match[1];
  }
  return 'unknownHandler';
}

function normalizeApiPath(prefix: string, methodPath: string) {
  return `/${[prefix, methodPath]
    .map((part) => part.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/')}`.replace(/\/+/g, '/');
}

function normalizeId(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .replace(/\.+/g, '.');
}

function toPascalCase(value: string) {
  return value
    .replace(/[:{}]/g, '')
    .split(/[-_.\s/]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function kebab(value: string) {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function dedupeCapabilities(drafts: CapabilityDraft[]) {
  return dedupeBy(drafts, (draft) => draft.capabilityId);
}

function dedupeBy<T>(items: T[], keyFn: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function releaseRank(strategy: ReleaseStrategy) {
  if (strategy === 'auto_publish') return 0;
  if (strategy === 'approval_required') return 1;
  return 2;
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
    } else {
      result.push(fullPath);
    }
  }
  return result;
}

function readOptional(path: string) {
  if (!existsSync(path)) return '';
  return readFileSync(path, 'utf8');
}

function writeJson(path: string, data: unknown) {
  writeText(path, `${JSON.stringify(data, null, 2)}\n`);
}

function writeCapabilityMarkdown(path: string, generatedAt: string, drafts: CapabilityDraft[]) {
  const lines = [
    '# Agent V2 能力草稿',
    '',
    `生成时间：${generatedAt}`,
    '',
    '## 生成原则',
    '',
    '- 本文件由 `agent-v2-capability-draft-generator` 自动生成，只作为候选能力，不自动写入正式 Manifest。',
    '- 直接写入、删除、发券、下发类能力必须审批或阻断。',
    '- 只读、指标、趋势、详情、诊断、草稿类能力可进入自动发布候选，但仍需字段策略和权限网关约束。',
    '- 旧 Agent 只保留兼容回退，新业务能力进入 `agent-v2`。',
    '',
    '## 摘要',
    '',
    `- 草稿总数：${drafts.length}`,
    `- 自动发布候选：${drafts.filter((draft) => draft.releaseStrategy === 'auto_publish').length}`,
    `- 需要审批：${drafts.filter((draft) => draft.releaseStrategy === 'approval_required').length}`,
    `- 写入阻断：${drafts.filter((draft) => draft.releaseStrategy === 'write_blocked').length}`,
    '',
    '## 草稿列表',
    '',
    '| 能力ID | 名称 | 领域 | 对象 | 策略 | 风险 | 权限来源 | 输出 | 证据 |',
    '|---|---|---|---|---|---|---|---|---|',
  ];
  for (const draft of drafts) {
    lines.push(
      `| ${draft.capabilityId} | ${draft.displayName} | ${draft.domain} | ${draft.businessObject} | ${draft.releaseStrategy} | ${draft.riskLevel} | ${draft.permissionSource} | ${draft.outputKinds.join('/')} | ${draft.evidence.join('<br>')} |`,
    );
  }
  writeText(path, `${lines.join('\n')}\n`);
}

function writeEvalMarkdown(path: string, generatedAt: string, drafts: EvalDraft[]) {
  const lines = [
    '# Agent V2 Eval 草稿',
    '',
    `生成时间：${generatedAt}`,
    `来源问题库：${relativePath(evalQuestionsPath)}`,
    '',
    '## 摘要',
    '',
    `- 草稿总数：${drafts.length}`,
    `- P1：${drafts.filter((draft) => draft.priority === 'P1').length}`,
    `- P2：${drafts.filter((draft) => draft.priority === 'P2').length}`,
    `- 未匹配能力：${drafts.filter((draft) => draft.expectedCapabilityId.endsWith('.unmapped.eval_candidate')).length}`,
    `- 契约通过：${drafts.filter((draft) => draft.contractResult === 'pass').length}`,
    `- 需复核：${drafts.filter((draft) => draft.contractResult === 'needs_review').length}`,
    `- 阻断：${drafts.filter((draft) => draft.contractResult === 'blocked').length}`,
    '',
    '## Eval 草稿列表',
    '',
    '| ID | 问题 | 角色 | 期望意图 | 期望能力 | 输出 | 权限 | 契约 | 失败分类 | 优先级 | 待确认 |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const draft of drafts) {
    lines.push(
      `| ${draft.id} | ${draft.question} | ${draft.roleGroup} | ${draft.expectedIntent} | ${draft.expectedCapabilityId} | ${draft.expectedOutputKinds.join('/')} | ${draft.permissionResult} | ${draft.contractResult} | ${draft.failureCategory} | ${draft.priority} | ${draft.confirmationNeeded.join('<br>')} |`,
    );
  }
  writeText(path, `${lines.join('\n')}\n`);
}

function writeGovernanceMarkdown(path: string, report: ReturnType<typeof buildGovernanceReport>) {
  const lines = [
    '# Agent V2 能力治理报告',
    '',
    `生成时间：${report.generatedAt}`,
    '',
    '## 发布策略',
    '',
    report.policy,
    '',
    '## 扫描规模',
    '',
    `- Prisma 模型：${report.counts.prismaModels}`,
    `- DTO 类：${report.counts.dtoClasses}`,
    `- 后端接口：${report.counts.controllerEndpoints}`,
    `- 已识别权限接口：${report.counts.controllerEndpointsWithPermissions}`,
    `- 前端路由：${report.counts.frontendRoutes}`,
    `- 能力草稿：${report.counts.capabilityDrafts}`,
    `- Eval 草稿：${report.counts.evalDrafts}`,
    `- 未映射 Eval：${report.counts.unmappedEval}`,
    '',
    '## 分布',
    '',
    '### 发布策略分布',
    '',
    ...objectToBulletLines(report.distributions.byReleaseStrategy),
    '',
    '### 领域分布',
    '',
    ...objectToBulletLines(report.distributions.byDomain),
    '',
    '### Eval 失败分类分布',
    '',
    ...objectToBulletLines(report.distributions.byFailureCategory),
    '',
    '## 门禁缺口',
    '',
    `- 缺权限能力：${report.gates.missingPermission.length}`,
    `- 权限来自领域推断：${report.gates.inferredPermission.length}`,
    `- 缺 DTO 能力：${report.gates.missingDto.length}`,
    `- 缺主表/数据源能力：${report.gates.missingModel.length}`,
    `- 中高风险自动发布候选：${report.gates.highRiskAutoPublish.length}`,
    `- 未映射题目样例：${report.gates.unmappedEval.length} / ${report.counts.unmappedEval}`,
    '',
    '### 缺权限能力样例',
    '',
    ...draftSummaryTable(report.gates.missingPermission),
    '',
    '### 权限推断能力样例',
    '',
    ...draftSummaryTable(report.gates.inferredPermission),
    '',
    '### 缺 DTO 能力样例',
    '',
    ...draftSummaryTable(report.gates.missingDto),
    '',
    '### 中高风险自动发布候选样例',
    '',
    ...draftSummaryTable(report.gates.highRiskAutoPublish),
    '',
    '## 建议',
    '',
    ...report.recommendations.map((item) => `- ${item}`),
  ];
  writeText(path, `${lines.join('\n')}\n`);
}

function objectToBulletLines(record: Record<string, number>) {
  const entries = Object.entries(record).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return ['- 无'];
  return entries.map(([key, value]) => `- ${key}：${value}`);
}

function draftSummaryTable(items: ReturnType<typeof summarizeDrafts>) {
  if (!items.length) return ['无'];
  const lines = ['| 能力ID | 名称 | 策略 | 风险 | 待确认 |', '|---|---|---|---|---|'];
  for (const item of items.slice(0, 20)) {
    lines.push(`| ${item.capabilityId} | ${item.displayName} | ${item.releaseStrategy} | ${item.riskLevel} | ${item.confirmationNeeded.join('<br>')} |`);
  }
  return lines;
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

function countBy<T>(items: T[], keyFn: (item: T) => string) {
  return items.reduce<Record<string, number>>((acc, item) => {
    const key = keyFn(item);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function summarizeDrafts(drafts: CapabilityDraft[]) {
  return drafts.slice(0, 50).map((draft) => ({
    capabilityId: draft.capabilityId,
    displayName: draft.displayName,
    domain: draft.domain,
    releaseStrategy: draft.releaseStrategy,
    riskLevel: draft.riskLevel,
    confirmationNeeded: draft.confirmationNeeded,
  }));
}

main();
