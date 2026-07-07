import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { AgentV2GovernanceService } from './agent-v2-governance.service.js';

type AuthedRequest = Request & { user?: { id?: number; storeId?: number } };
type DebugBody = {
  question: string;
  storeId?: number;
  role?: 'manager' | 'reception' | 'beautician';
  entrypoint?: string;
  grayMode?: string;
  toolReplay?: boolean;
  compareManifestVersion?: string;
  capabilityId?: string;
  enabled?: boolean;
  triggerKeywords?: string[];
  negativeExamples?: string[];
  outputKinds?: string[];
};
type EvalCaseBody = {
  question?: string;
  input?: string;
  scenario?: string;
  role?: string;
  roleGroup?: string;
  expectedCapabilityId?: string;
  expectedTool?: string;
  expectedIntent?: string;
  expectedObjects?: string[];
  expectedPersonaCodes?: string[];
  expectedOutputKinds?: string[];
  evidenceRequired?: boolean | string[];
  permissionProfile?: string;
  unsupportedAllowed?: boolean;
  permissionResult?: string;
  contractResult?: string;
  failureCategory?: string;
  priority?: string;
  status?: string;
};
type EvalRunBody = { note?: string };
type EvalDryRunBatchBody = {
  priority?: string;
  limit?: number;
  role?: 'manager' | 'reception' | 'beautician';
  storeId?: number;
  entrypoint?: string;
  grayMode?: string;
  note?: string;
};
type EvalFailureReplayBody = {
  category?: string;
  index?: number;
  failureId?: string | number;
  storeId?: number;
  role?: 'manager' | 'reception' | 'beautician';
  entrypoint?: string;
  grayMode?: string;
  toolReplay?: boolean;
};
type CreateSynonymBody = { targetNodeId: string; synonym: string; reason?: string; confidence?: number };
type CreateExcludeBody = { sourceNodeId: string; targetNodeId: string; reason?: string; confidence?: number };
type CreateGrayRuleBody = {
  name: string;
  mode: string;
  priority?: number;
  storeIds?: Array<number | string>;
  personaCodes?: string[];
  roles?: string[];
  entrypoints?: string[];
  capabilityIds?: string[];
  reason?: string;
};

@ApiTags('Agent Governance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('agent-governance')
export class AgentV2GovernanceController {
  constructor(private readonly governance: AgentV2GovernanceService) {}

  @Get('runs')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: 'Agent V2 运行审计列表' })
  listRuns(@Query() query: Record<string, string>, @Req() req: AuthedRequest) {
    return this.governance.listRuns({ ...query, storeId: this.storeId(query, req) });
  }

  @Get('runs/stats')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: 'Agent V2 运行统计' })
  runStats(@Query() query: Record<string, string>, @Req() req: AuthedRequest) {
    return this.governance.getRunStats({ storeId: this.storeId(query, req) });
  }

  @Get('runs/failures')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: 'Agent V2 失败运行列表' })
  runFailures(@Query() query: Record<string, string>, @Req() req: AuthedRequest) {
    return this.governance.listRunFailures({ ...query, storeId: this.storeId(query, req) });
  }

  @Get('runs/uncovered-top')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: 'Agent V2 高频未覆盖问法' })
  uncoveredTop(@Query() query: Record<string, string>, @Req() req: AuthedRequest) {
    return this.governance.listUncoveredTop({ limit: Number(query.limit), storeId: this.storeId(query, req) });
  }

  @Get('feedback-diagnostics')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: '汇总有用/无用反馈中的无用问题，并自动诊断修复建议' })
  feedbackDiagnostics(@Query() query: Record<string, string>, @Req() req: AuthedRequest) {
    return this.governance.listFeedbackDiagnostics({
      page: Number(query.page),
      pageSize: Number(query.pageSize),
      days: Number(query.days),
      category: query.category,
      storeId: this.storeId(query, req),
    });
  }

  @Get('health')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: 'Agent V2 运行健康指标' })
  health(@Query() query: Record<string, string>, @Req() req: AuthedRequest) {
    return this.governance.healthMetrics({ days: Number(query.days), storeId: this.storeId(query, req) });
  }

  @Get('runs/:id/detail')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: 'Agent V2 运行审计详情' })
  runDetail(@Param('id', ParseIntPipe) id: number, @Query() query: Record<string, string>, @Req() req: AuthedRequest) {
    return this.governance.getRunDetail(id, this.storeId(query, req));
  }

  @Get('knowledge-graph/summary')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: '知识图谱摘要' })
  kgSummary() {
    return this.governance.knowledgeGraphSummary();
  }

  @Get('knowledge-graph/nodes')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: '知识图谱节点列表' })
  kgNodes(@Query() query: Record<string, string>) {
    return this.governance.listKnowledgeGraphNodes(query);
  }

  @Get('knowledge-graph/nodes/:id')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: '知识图谱节点详情' })
  kgNode(@Param('id') id: string) {
    return this.governance.getKnowledgeGraphNode(id);
  }

  @Get('knowledge-graph/gaps')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: '知识图谱缺口' })
  kgGaps() {
    return this.governance.listKnowledgeGraphGaps();
  }

  @Get('knowledge-graph/visualize')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: '知识图谱可视化数据' })
  kgVisualize(@Query() query: Record<string, string>) {
    return this.governance.visualizeKnowledgeGraph({
      type: query.type,
      limit: Number(query.limit),
      focusId: query.focusId,
      depth: Number(query.depth),
    });
  }

  @Post('knowledge-graph/path')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: '知识图谱路径查询' })
  kgPath(@Body() body: { from: string; to: string; maxDepth?: number }) {
    return this.governance.knowledgeGraphPath(body);
  }

  @Get('knowledge-graph/synonyms')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: '知识图谱人工同义词覆盖列表' })
  kgSynonyms(@Query() query: Record<string, string>) {
    return this.governance.listKnowledgeGraphSynonyms({
      page: Number(query.page),
      pageSize: Number(query.pageSize),
      status: query.status,
    });
  }

  @Post('knowledge-graph/synonyms')
  @Permissions('core:agent-governance:manage')
  @ApiOperation({ summary: '新增知识图谱人工同义词覆盖' })
  createKgSynonym(@Body() body: CreateSynonymBody, @Req() req: AuthedRequest) {
    return this.governance.createKnowledgeGraphSynonym({ ...body, createdBy: req.user?.id });
  }

  @Delete('knowledge-graph/synonyms/:id')
  @Permissions('core:agent-governance:manage')
  @ApiOperation({ summary: '删除知识图谱人工同义词覆盖' })
  deleteKgSynonym(@Param('id', ParseIntPipe) id: number, @Req() req: AuthedRequest) {
    return this.governance.deleteKnowledgeGraphOverride(id, 'synonym', req.user?.id);
  }

  @Get('knowledge-graph/excludes')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: '知识图谱人工互斥覆盖列表' })
  kgExcludes(@Query() query: Record<string, string>) {
    return this.governance.listKnowledgeGraphExcludes({
      page: Number(query.page),
      pageSize: Number(query.pageSize),
      status: query.status,
    });
  }

  @Post('knowledge-graph/excludes')
  @Permissions('core:agent-governance:manage')
  @ApiOperation({ summary: '新增知识图谱人工互斥覆盖' })
  createKgExclude(@Body() body: CreateExcludeBody, @Req() req: AuthedRequest) {
    return this.governance.createKnowledgeGraphExclude({ ...body, createdBy: req.user?.id });
  }

  @Delete('knowledge-graph/excludes/:id')
  @Permissions('core:agent-governance:manage')
  @ApiOperation({ summary: '删除知识图谱人工互斥覆盖' })
  deleteKgExclude(@Param('id', ParseIntPipe) id: number, @Req() req: AuthedRequest) {
    return this.governance.deleteKnowledgeGraphOverride(id, 'exclude', req.user?.id);
  }

  @Get('capabilities/health')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: '能力健康摘要' })
  capabilityHealth() {
    return this.governance.capabilitiesHealth();
  }

  @Get('capabilities/heat-map')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: '能力领域热力分布' })
  capabilityHeatMap() {
    return this.governance.capabilitiesHeatMap();
  }

  @Get('auto-publish/logs')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: '自动发布日志' })
  autoPublishLogs(@Query() query: Record<string, string>) {
    return this.governance.listAutoPublishLogs(query);
  }

  @Get('auto-publish/logs/:id')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: '自动发布日志详情' })
  autoPublishLog(@Param('id', ParseIntPipe) id: number) {
    return this.governance.getAutoPublishLog(id);
  }

  @Get('gray-rules')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: 'Agent V2 灰度规则列表' })
  grayRules(@Query() query: Record<string, string>) {
    return this.governance.listGrayRules({
      page: Number(query.page),
      pageSize: Number(query.pageSize),
      status: query.status,
      mode: query.mode,
    });
  }

  @Post('gray-rules')
  @Permissions('core:agent-governance:manage')
  @ApiOperation({ summary: '新增 Agent V2 灰度规则' })
  createGrayRule(@Body() body: CreateGrayRuleBody, @Req() req: AuthedRequest) {
    return this.governance.createGrayRule({ ...body, createdBy: req.user?.id });
  }

  @Delete('gray-rules/:id')
  @Permissions('core:agent-governance:manage')
  @ApiOperation({ summary: '删除 Agent V2 灰度规则' })
  deleteGrayRule(@Param('id', ParseIntPipe) id: number, @Req() req: AuthedRequest) {
    return this.governance.deleteGrayRule(id, req.user?.id);
  }

  @Get('eval/cases')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: '评测题列表' })
  evalCases(@Query() query: Record<string, string>) {
    return this.governance.evalCases(query);
  }

  @Post('eval/cases')
  @Permissions('core:agent-governance:manage')
  @ApiOperation({ summary: '新增 Agent V2 评测题' })
  createEvalCase(@Body() body: EvalCaseBody) {
    return this.governance.createEvalCase(body);
  }

  @Patch('eval/cases/:id')
  @Permissions('core:agent-governance:manage')
  @ApiOperation({ summary: '编辑 Agent V2 评测题' })
  updateEvalCase(@Param('id', ParseIntPipe) id: number, @Body() body: EvalCaseBody) {
    return this.governance.updateEvalCase(id, body);
  }

  @Get('eval/runs')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: '评测门禁报告' })
  evalRuns() {
    return this.governance.evalRuns();
  }

  @Post('eval/runs')
  @Permissions('core:agent-governance:manage')
  @ApiOperation({ summary: '手动记录一次 Agent V2 评测运行' })
  createEvalRun(@Body() body: EvalRunBody, @Req() req: AuthedRequest) {
    return this.governance.createEvalRun({ ...body, requestedBy: req.user?.id });
  }

  @Post('eval/runs/dry-run-batch')
  @Permissions('core:agent-governance:manage')
  @ApiOperation({ summary: 'Agent V2 批量 dry-run 评测' })
  runEvalDryRunBatch(@Body() body: EvalDryRunBatchBody, @Req() req: AuthedRequest) {
    return this.governance.runEvalDryRunBatch({
      ...body,
      requestedBy: req.user?.id,
      storeId: body.storeId ?? req.user?.storeId,
    });
  }

  @Get('eval/runs/history')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: 'Agent V2 评测运行历史' })
  evalRunHistory(@Query() query: Record<string, string>) {
    return this.governance.listPersistedEvalRuns({
      page: Number(query.page),
      pageSize: Number(query.pageSize),
      status: query.status,
    });
  }

  @Get('eval/runs/:id')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: 'Agent V2 评测运行详情' })
  evalRunDetail(@Param('id', ParseIntPipe) id: number) {
    return this.governance.getPersistedEvalRunDetail(id);
  }

  @Get('eval/runs/:id/failures')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: 'Agent V2 评测运行失败样例' })
  evalRunFailures(@Param('id', ParseIntPipe) id: number, @Query() query: Record<string, string>) {
    return this.governance.listPersistedEvalRunFailures(id, {
      page: Number(query.page),
      pageSize: Number(query.pageSize),
      category: query.category,
    });
  }

  @Post('eval/runs/:id/failures/replay')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: 'Agent V2 评测失败样例回放' })
  replayEvalRunFailure(@Param('id', ParseIntPipe) id: number, @Body() body: EvalFailureReplayBody) {
    return this.governance.replayEvalRunFailure(id, body);
  }

  @Post('eval/runs/import-latest')
  @Permissions('core:agent-governance:manage')
  @ApiOperation({ summary: '导入最新 Agent V2 Eval Gate 报告到评测运行表' })
  importLatestEvalRun(@Req() req: AuthedRequest) {
    return this.governance.importLatestEvalGateReport({ requestedBy: req.user?.id });
  }

  @Post('debug/execute')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: '单题调试执行计划' })
  debugExecute(@Body() body: DebugBody) {
    return this.governance.debugExecuteAsync(body);
  }

  @Post('debug/compare')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: '调试对比' })
  debugCompare(@Body() body: DebugBody) {
    return this.governance.debugCompare(body);
  }

  @Post('debug/simulate-manifest')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: 'Manifest 模拟' })
  simulateManifest(@Body() body: DebugBody) {
    return this.governance.simulateManifest(body);
  }

  private storeId(query: Record<string, string>, req: AuthedRequest) {
    return query.storeId ? Number(query.storeId) : req.user?.storeId;
  }
}
