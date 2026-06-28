import { Body, Controller, ForbiddenException, Get, Param, ParseIntPipe, Patch, Post, Query, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentDevice } from '../terminal/decorators/current-device.decorator.js';
import { DeviceAuthGuard } from '../terminal/guards/device-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  collectAuraUserFieldScopes,
  collectAuraUserPermissions,
  resolveAuraAvailableRolesForUser,
} from '../terminal/terminal-role-access.js';
import { AgentOrchestratorService } from './agent-orchestrator.service.js';
import { AgentPersonaService } from './agent-persona.service.js';
import { BusinessTaskCompilerService } from './business-task/business-task-compiler.service.js';
import { CompileBusinessTaskDto } from './dto/compile-business-task.dto.js';
import { AppendAgentMessageDto, CreateAgentRunDto, DecideAgentApprovalDto } from './dto/create-agent-run.dto.js';
import { ExecuteSemanticSqlDto } from './dto/execute-semantic-sql.dto.js';
import { PreviewQueryPlanDto } from './dto/preview-query-plan.dto.js';
import type { AgentFieldScopes, AgentRole } from './agent.types.js';
import { SemanticSqlExecutorService } from '../semantic-sql/semantic-sql-executor.service.js';
import { AgentCapabilityCandidateService } from './agent-capability-candidate.service.js';
import { AgentAutomationService } from './agent-automation.service.js';
import { AgentMemoryService } from './agent-memory.service.js';
import { AgentObservabilityService } from './agent-observability.service.js';
import { AgentSchemaReadinessService } from './agent-schema-readiness.service.js';
import { QueryPlannerService } from '../semantic-query/query-planner.service.js';
import { SemanticQueryExecutorService } from '../semantic-query/semantic-query-executor.service.js';
import { ResponseComposerService } from '../semantic-query/response-composer.service.js';

@ApiTags('Agent')
@ApiBearerAuth()
@UseGuards(DeviceAuthGuard)
@Controller('agent')
export class AgentController {
  constructor(
    private readonly orchestrator: AgentOrchestratorService,
    private readonly personaService: AgentPersonaService,
    private readonly businessTaskCompiler: BusinessTaskCompilerService,
    private readonly semanticSqlExecutor: SemanticSqlExecutorService,
    private readonly capabilityCandidateService: AgentCapabilityCandidateService,
    private readonly prisma: PrismaService,
    private readonly memoryService: AgentMemoryService,
    private readonly observabilityService: AgentObservabilityService,
    private readonly automationService: AgentAutomationService,
    private readonly schemaReadinessService: AgentSchemaReadinessService,
    private readonly queryPlanner?: QueryPlannerService,
    private readonly semanticQueryExecutor?: SemanticQueryExecutorService,
    private readonly responseComposer?: ResponseComposerService,
  ) {}

  // ─── Persona Routes ──────────────────────────────────────────────────────

  @Get('personas')
  @ApiOperation({ summary: '获取当前角色可用的 Agent Persona 列表' })
  async personas(@CurrentDevice() device: any) {
    const role = (device?.role ?? 'manager') as string;
    return this.personaService.listForRole(role);
  }

  @Get('personas/all')
  @ApiOperation({ summary: '获取全部 Agent Persona（管理员视图）' })
  allPersonas() {
    return this.personaService.listAll();
  }

  @Get('personas/:code')
  @ApiOperation({ summary: '获取指定 Agent Persona 的能力、工具和推荐问题' })
  async personaByCode(@Param('code') code: string) {
    const persona = await this.personaService.getByCode(code);
    if (!persona) throw new ForbiddenException(`未找到 Agent Persona: ${code}`);
    return persona;
  }

  @Patch('personas/:code')
  @ApiOperation({ summary: '更新指定 Agent Persona 的工具组和推荐问题' })
  async updatePersona(
    @Param('code') code: string,
    @Body() body: { toolGroups?: string[]; suggestedQuestions?: string[] },
  ) {
    const persona = await this.personaService.update(code, body);
    if (!persona) throw new ForbiddenException(`未找到 Agent Persona: ${code}`);
    return persona;
  }

  // ─── Feedback ────────────────────────────────────────────────────────────

  @Post('runs/:id/feedback')
  @ApiOperation({ summary: '提交 Agent Run 的用户反馈和采纳记录' })
  async submitFeedback(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { rating?: number; adopted?: boolean; comment?: string; businessActionJson?: unknown },
    @CurrentDevice() device: any,
  ) {
    const run = await this.prisma.agentRun.findFirst({
      where: { id, ...(device?.storeId ? { storeId: Number(device.storeId) } : {}) },
      select: {
        id: true,
        storeId: true,
        userId: true,
        userInput: true,
        planJson: true,
        resultJson: true,
        errorMessage: true,
      },
    });
    const feedbackSnapshot = this.buildFeedbackSnapshot(run, body);
    return this.prisma.agentFeedback.create({
      data: {
        runId: id,
        userId: device?.userId ?? null,
        storeId: device?.storeId ?? null,
        rating: body.rating ?? null,
        adopted: body.adopted ?? null,
        comment: body.comment ?? null,
        businessActionJson: feedbackSnapshot,
      },
    });
  }

  // ─── Memory / Archive / Quality ──────────────────────────────────────────

  @Get('memories')
  @ApiOperation({ summary: '获取当前门店 Agent 记忆列表' })
  listMemories(
    @CurrentDevice('storeId') storeId: number,
    @Query('personaCode') personaCode?: string,
    @Query('memoryType') memoryType?: string,
    @Query('limit') limit?: string,
  ) {
    return this.memoryService.listMemories({ storeId, personaCode, memoryType, limit });
  }

  @Post('memories')
  @ApiOperation({ summary: '创建当前门店 Agent 记忆' })
  createMemory(
    @CurrentDevice('storeId') storeId: number,
    @CurrentDevice('userId') userId: number | undefined,
    @Body()
    body: {
      personaCode?: string;
      memoryType?: string;
      title: string;
      content: string;
      summary?: string;
      importance?: number;
      sourceRunId?: number;
      sourceJson?: unknown;
    },
  ) {
    return this.memoryService.createMemory({
      storeId,
      userId,
      personaCode: body.personaCode,
      memoryType: body.memoryType,
      title: body.title,
      content: body.content,
      summary: body.summary,
      importance: body.importance,
      sourceRunId: body.sourceRunId,
      sourceJson: body.sourceJson,
    });
  }

  @Get('daily-archives')
  @ApiOperation({ summary: '获取当前门店 Agent 每日归档列表' })
  listDailyArchives(
    @CurrentDevice('storeId') storeId: number,
    @Query('personaCode') personaCode?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.memoryService.listDailyArchives({ storeId, personaCode, page, pageSize });
  }

  @Post('daily-archives/generate')
  @ApiOperation({ summary: '生成当前门店 Agent 每日归档' })
  generateDailyArchive(
    @CurrentDevice('storeId') storeId: number,
    @CurrentDevice('userId') userId: number | undefined,
    @Body() body: { personaCode?: string; date?: string },
  ) {
    return this.memoryService.generateDailyArchive({
      storeId,
      personaCode: body.personaCode,
      date: body.date,
      createdBy: userId,
    });
  }

  @Get('quality-report')
  @ApiOperation({ summary: '获取当前门店 Agent 运行质量报表' })
  qualityReport(
    @CurrentDevice('storeId') storeId: number,
    @Query('days') days?: string,
    @Query('personaCode') personaCode?: string,
  ) {
    return this.observabilityService.getQualityReport({ storeId, days, personaCode });
  }

  @Get('schema-readiness')
  @ApiOperation({ summary: '只读检查阶段 6/7 Agent 数据表迁移就绪状态' })
  schemaReadiness() {
    return this.schemaReadinessService.getStatus();
  }

  // ─── Automation Engine ───────────────────────────────────────────────────

  @Get('automations/triggers')
  @ApiOperation({ summary: '获取 Agent 自动化内置触发器模板' })
  automationTriggers() {
    return this.automationService.listTriggerTemplates();
  }

  @Get('automations')
  @ApiOperation({ summary: '分页查询当前门店 Agent 自动化定义' })
  listAutomations(
    @CurrentDevice('storeId') storeId: number,
    @Query('personaCode') personaCode?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.automationService.listDefinitions({ storeId, personaCode, status, page, pageSize });
  }

  @Post('automations/drafts')
  @ApiOperation({ summary: '生成 Agent 自动化草稿' })
  createAutomationDraft(
    @CurrentDevice('storeId') storeId: number,
    @CurrentDevice('userId') userId: number | undefined,
    @Body()
    body: {
      personaCode?: string;
      goal?: string;
      name?: string;
      description?: string;
      triggerType?: string;
      triggerConfig?: unknown;
      actionPlan?: unknown;
      approvalPolicy?: unknown;
      schedule?: unknown;
      riskLevel?: string;
      sourceRunId?: number;
    },
  ) {
    return this.automationService.createDraft({
      storeId,
      userId,
      personaCode: body.personaCode,
      goal: body.goal,
      name: body.name,
      description: body.description,
      triggerType: body.triggerType,
      triggerConfig: body.triggerConfig,
      actionPlan: body.actionPlan,
      approvalPolicy: body.approvalPolicy,
      schedule: body.schedule,
      riskLevel: body.riskLevel,
      sourceRunId: body.sourceRunId,
    });
  }

  @Get('automations/runs')
  @ApiOperation({ summary: '分页查询当前门店 Agent 自动化运行日志' })
  listAutomationRuns(
    @CurrentDevice('storeId') storeId: number,
    @Query('definitionId') definitionId?: string,
    @Query('personaCode') personaCode?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.automationService.listRuns({ storeId, definitionId, personaCode, status, page, pageSize });
  }

  @Get('automations/effects')
  @ApiOperation({ summary: '分页查询当前门店 Agent 自动化效果记录' })
  listAutomationEffects(
    @CurrentDevice('storeId') storeId: number,
    @Query('definitionId') definitionId?: string,
    @Query('runId') runId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.automationService.listEffects({ storeId, definitionId, runId, status, page, pageSize });
  }

  @Post('automations/due/run')
  @ApiOperation({ summary: '扫描并触发当前门店到期 Agent 自动化' })
  runDueAutomations(
    @CurrentDevice('storeId') storeId: number,
    @CurrentDevice('userId') userId: number | undefined,
    @Body() body: { now?: string; limit?: number; dryRun?: boolean },
  ) {
    return this.automationService.runDueAutomations({
      storeId,
      userId,
      now: body.now,
      limit: body.limit,
      dryRun: body.dryRun,
    });
  }

  @Post('automations/events/evaluate')
  @ApiOperation({ summary: '按事件/阈值评估并触发 Agent 自动化' })
  evaluateAutomationEvent(
    @CurrentDevice('storeId') storeId: number,
    @CurrentDevice('userId') userId: number | undefined,
    @Body() body: { eventType: string; payload?: unknown; limit?: number; dryRun?: boolean },
  ) {
    return this.automationService.evaluateEvent({
      storeId,
      userId,
      eventType: body.eventType,
      payload: body.payload,
      limit: body.limit,
      dryRun: body.dryRun,
    });
  }

  @Get('automations/pending-approvals')
  @ApiOperation({ summary: '查询当前门店待确认的 Agent 自动化运行' })
  listAutomationPendingApprovals(
    @CurrentDevice('storeId') storeId: number,
    @Query('definitionId') definitionId?: string,
    @Query('personaCode') personaCode?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.automationService.listPendingApprovals({ storeId, definitionId, personaCode, page, pageSize });
  }

  @Post('automations/runs/:id/approve')
  @ApiOperation({ summary: '确认并恢复执行待审批 Agent 自动化运行' })
  approveAutomationRun(
    @Param('id', ParseIntPipe) id: number,
    @CurrentDevice('storeId') storeId: number,
    @CurrentDevice('userId') userId: number | undefined,
    @Body() body: { comment?: string },
  ) {
    return this.automationService.decideRunApproval({
      storeId,
      userId,
      runId: id,
      decision: 'approve',
      comment: body.comment,
    });
  }

  @Post('automations/runs/:id/reject')
  @ApiOperation({ summary: '拒绝待审批 Agent 自动化运行' })
  rejectAutomationRun(
    @Param('id', ParseIntPipe) id: number,
    @CurrentDevice('storeId') storeId: number,
    @CurrentDevice('userId') userId: number | undefined,
    @Body() body: { comment?: string },
  ) {
    return this.automationService.decideRunApproval({
      storeId,
      userId,
      runId: id,
      decision: 'reject',
      comment: body.comment,
    });
  }

  @Post('automations/:id/recover')
  @ApiOperation({ summary: '恢复失败 Agent 自动化或触发熔断暂停' })
  recoverAutomation(
    @Param('id', ParseIntPipe) id: number,
    @CurrentDevice('storeId') storeId: number,
    @CurrentDevice('userId') userId: number | undefined,
    @Body() body: { maxFailures?: number },
  ) {
    return this.automationService.recoverDefinition({
      storeId,
      userId,
      definitionId: id,
      maxFailures: body.maxFailures,
    });
  }

  @Post('automations/effects/attribute')
  @ApiOperation({ summary: '记录 Agent 自动化效果归因' })
  recordAutomationAttribution(
    @CurrentDevice('storeId') storeId: number,
    @CurrentDevice('userId') userId: number | undefined,
    @Body()
    body: {
      definitionId?: number;
      runId?: number;
      effectType?: string;
      objectType?: string;
      objectId?: number;
      customerId?: number;
      metricKey?: string;
      impact?: unknown;
    },
  ) {
    return this.automationService.recordAttribution({
      storeId,
      userId,
      definitionId: body.definitionId,
      runId: body.runId,
      effectType: body.effectType,
      objectType: body.objectType,
      objectId: body.objectId,
      customerId: body.customerId,
      metricKey: body.metricKey,
      impact: body.impact,
    });
  }

  @Post('automations/:id/run')
  @ApiOperation({ summary: '手动触发一次 Agent 自动化' })
  runAutomationOnce(
    @Param('id', ParseIntPipe) id: number,
    @CurrentDevice('storeId') storeId: number,
    @CurrentDevice('userId') userId: number | undefined,
    @Body() body: { mode?: string; dryRun?: boolean; input?: unknown },
  ) {
    return this.automationService.runOnce({
      storeId,
      userId,
      definitionId: id,
      mode: body.mode,
      dryRun: body.dryRun,
      input: body.input,
    });
  }

  @Get('tools')
  @ApiOperation({ summary: '获取当前 Agent 工具目录' })
  tools() {
    return this.orchestrator.listTools();
  }

  @Get('evals/default')
  @ApiOperation({ summary: '运行默认 Agent 评测集' })
  runDefaultEvals(@Query('persistFailures') persistFailures?: string) {
    return this.orchestrator.runDefaultEvals({ persistFailures: persistFailures === 'true' });
  }

  @Get('evals/p0')
  @ApiOperation({ summary: '运行洞悉美业 P0 高频问答评测集' })
  runP0Evals(@Query('persistFailures') persistFailures?: string) {
    return this.orchestrator.runP0Evals({ persistFailures: persistFailures === 'true' });
  }

  @Get('evals/skills')
  @ApiOperation({ summary: '按 Skill 运行 Agent 评测集，并输出工具、能力和输出契约正确率' })
  runSkillEvals(@Query('skillId') skillId?: string, @Query('persistFailures') persistFailures?: string) {
    return this.orchestrator.runSkillEvals(skillId, { persistFailures: persistFailures === 'true' });
  }

  @Get('feedback/failures')
  @ApiOperation({ summary: '查看无用/低分反馈归因，按 Skill 聚合失败样本' })
  feedbackFailures(
    @CurrentDevice('storeId') storeId: number,
    @Query('days') days?: string,
    @Query('personaCode') personaCode?: string,
    @Query('limit') limit?: string,
  ) {
    return this.observabilityService.getFeedbackFailureReport({ storeId, days, personaCode, limit });
  }

  @Post('feedback/failures/eval-cases')
  @ApiOperation({ summary: '把负反馈样本加入 Eval 草稿池' })
  importFeedbackFailuresToEvalCases(
    @CurrentDevice('storeId') storeId: number,
    @Body() body: { days?: number | string; personaCode?: string; limit?: number | string; dryRun?: boolean } = {},
  ) {
    return this.observabilityService.importFeedbackFailuresToEvalCases({
      storeId,
      days: body.days,
      personaCode: body.personaCode,
      limit: body.limit,
      dryRun: body.dryRun,
    });
  }

  @Get('capability-candidates')
  @ApiOperation({ summary: '获取高频问题到正式 Capability 的候选池' })
  capabilityCandidates(
    @CurrentDevice('storeId') storeId: number | undefined,
    @Query('days') days?: string,
    @Query('minCount') minCount?: string,
    @Query('limit') limit?: string,
  ) {
    return this.capabilityCandidateService.listCandidates({ storeId, days, minCount, limit });
  }

  @Post('business-task/compile')
  @ApiOperation({ summary: '编译经营任务并预览能力命中' })
  async compileBusinessTask(@Body() dto: CompileBusinessTaskDto) {
    return this.businessTaskCompiler.compile({
      message: dto.message,
      role: (dto.role ?? 'manager') as AgentRole,
      context: dto.context,
    });
  }

  @Post('semantic-sql/execute')
  @ApiOperation({ summary: '执行受控 Semantic SQL Beta 预览' })
  executeSemanticSql(@CurrentDevice('storeId') storeId: number, @Body() dto: ExecuteSemanticSqlDto) {
    return this.semanticSqlExecutor.execute({
      taskId: dto.taskId,
      storeId,
      actorRole: (dto.actorRole ?? 'manager') as AgentRole,
      metricKeys: dto.metricKeys,
      dimensions: dto.dimensions,
      filters: dto.filters ?? {},
      timeRange: dto.timeRange,
      orderBy: dto.orderBy,
      limit: dto.limit,
      betaEnabled: dto.betaEnabled,
    });
  }

  @Post('query-plan/preview')
  @ApiOperation({ summary: '预览统一查询中枢 QueryPlan，不执行查库' })
  async previewQueryPlan(@CurrentDevice('storeId') storeId: number, @Body() dto: PreviewQueryPlanDto) {
    const role = (dto.role ?? 'manager') as AgentRole;
    const compiled = await this.businessTaskCompiler.compile({
      message: dto.message,
      role,
      context: dto.context,
    });
    const planned = this.queryPlanner?.plan({
      task: compiled.task,
      role,
      storeId,
      operatorId: dto.operatorId,
      capabilityId: compiled.capabilityMatches[0]?.capabilityId ?? compiled.semanticSqlCandidate.fallbackCapability,
    });
    return {
      businessTask: compiled.task,
      capabilityPlan: compiled.capabilityMatches[0] ?? null,
      skillPlan: compiled.skillMatches?.[0] ?? null,
      semanticSqlCandidate: compiled.semanticSqlCandidate,
      queryPlan: planned?.plan ?? null,
      rejectedReason: planned?.rejectedReason,
      warnings: [...compiled.validation.warnings, ...(planned?.warnings ?? [])],
    };
  }

  @Post('semantic-query/execute')
  @ApiOperation({ summary: '执行统一查询中枢受控只读查询' })
  async executeSemanticQuery(@CurrentDevice('storeId') storeId: number, @Body() dto: PreviewQueryPlanDto) {
    const role = (dto.role ?? 'manager') as AgentRole;
    const compiled = await this.businessTaskCompiler.compile({
      message: dto.message,
      role,
      context: dto.context,
    });
    const planned = this.queryPlanner?.plan({
      task: compiled.task,
      role,
      storeId,
      operatorId: dto.operatorId,
      capabilityId: compiled.capabilityMatches[0]?.capabilityId ?? compiled.semanticSqlCandidate.fallbackCapability,
    });
    if (!planned?.plan || !this.semanticQueryExecutor) {
      return {
        status: 'rejected',
        summary: planned?.rejectedReason ?? '统一查询中枢尚未接入执行器。',
        businessTask: compiled.task,
        skillPlan: compiled.skillMatches?.[0] ?? null,
        queryPlan: null,
      };
    }
    const result = await this.semanticQueryExecutor.execute(planned.plan);
    return {
      result,
      composed: this.responseComposer?.compose(result),
      queryPlan: planned.plan,
      skillPlan: compiled.skillMatches?.[0] ?? null,
      warnings: [...compiled.validation.warnings, ...planned.warnings],
    };
  }

  @Post('runs')
  @ApiOperation({ summary: '创建经营 Agent 运行任务' })
  async createRun(
    @CurrentDevice('storeId') storeId: number,
    @CurrentDevice('userId') userId: number | undefined,
    @CurrentDevice('id') deviceId: number | undefined,
    @CurrentDevice('permissions') permissions: string[] | undefined,
    @CurrentDevice('fieldScopes') fieldScopes: AgentFieldScopes | undefined,
    @Body() dto: CreateAgentRunDto,
    @CurrentDevice('availableRoles') availableRoles?: AgentRole[],
  ) {
    this.assertTerminalRuntimeEnabled(dto.entrypoint);
    const actorContext = await this.resolveActorContext({
      storeId,
      authenticatedUserId: userId,
      requestedOperatorId: dto.operatorId,
      requestedRole: dto.role,
      permissions,
      fieldScopes,
      availableRoles,
    });
    return this.orchestrator.createRun({
      message: dto.message,
      context: dto.context,
      actor: {
        storeId,
        userId: actorContext.userId,
        deviceId,
        role: actorContext.role,
        entrypoint: dto.entrypoint ?? 'api',
        ...(dto.personaCode ? { personaCode: dto.personaCode } : {}),
        permissions: actorContext.permissions,
        fieldScopes: actorContext.fieldScopes,
      },
    });
  }

  @Get('runs')
  @ApiOperation({ summary: '分页查询 AgentRun 审计列表' })
  findRuns(
    @CurrentDevice('storeId') storeId: number | undefined,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('role') role?: string,
    @Query('personaCode') personaCode?: string,
    @Query('entrypoint') entrypoint?: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.orchestrator.findRuns({ page, pageSize, status, role, personaCode, entrypoint, keyword, storeId });
  }

  @Get('runs/:id/detail')
  @ApiOperation({ summary: '获取 AgentRun 审计详情' })
  getRunDetail(@Param('id', ParseIntPipe) id: number, @CurrentDevice('storeId') storeId: number | undefined) {
    return this.orchestrator.getRunDetail(id, storeId);
  }

  @Get('runs/:id')
  @ApiOperation({ summary: '获取 AgentRun 详情' })
  getRun(@Param('id', ParseIntPipe) id: number) {
    return this.orchestrator.getRun(id);
  }

  @Post('runs/:id/messages')
  @ApiOperation({ summary: '向 AgentRun 追加消息并继续执行' })
  async appendMessage(
    @Param('id', ParseIntPipe) id: number,
    @CurrentDevice('storeId') storeId: number,
    @CurrentDevice('userId') userId: number | undefined,
    @CurrentDevice('id') deviceId: number | undefined,
    @CurrentDevice('permissions') permissions: string[] | undefined,
    @CurrentDevice('fieldScopes') fieldScopes: AgentFieldScopes | undefined,
    @Body() dto: AppendAgentMessageDto,
    @CurrentDevice('availableRoles') availableRoles?: AgentRole[],
  ) {
    this.assertTerminalRuntimeEnabled(dto.entrypoint);
    const actorContext = await this.resolveActorContext({
      storeId,
      authenticatedUserId: userId,
      requestedOperatorId: dto.operatorId,
      requestedRole: dto.role,
      permissions,
      fieldScopes,
      availableRoles,
    });
    return this.orchestrator.appendMessage({
      runId: id,
      message: dto.message,
      context: dto.context,
      actor: {
        storeId,
        userId: actorContext.userId,
        deviceId,
        role: actorContext.role,
        entrypoint: dto.entrypoint ?? 'api',
        ...(dto.personaCode ? { personaCode: dto.personaCode } : {}),
        permissions: actorContext.permissions,
        fieldScopes: actorContext.fieldScopes,
      },
    });
  }

  @Get('approvals')
  @ApiOperation({ summary: '分页查询 Agent 审批列表' })
  findApprovals(
    @CurrentDevice('storeId') storeId: number | undefined,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
  ) {
    return this.orchestrator.findApprovals({ page, pageSize, status, storeId });
  }

  @Post('approvals/:id/approve')
  @ApiOperation({ summary: '审批通过 Agent 工具调用并继续执行' })
  async approve(
    @Param('id', ParseIntPipe) id: number,
    @CurrentDevice('storeId') storeId: number,
    @CurrentDevice('userId') userId: number | undefined,
    @CurrentDevice('id') deviceId: number | undefined,
    @CurrentDevice('permissions') permissions: string[] | undefined,
    @CurrentDevice('fieldScopes') fieldScopes: AgentFieldScopes | undefined,
    @Body() dto: DecideAgentApprovalDto,
    @CurrentDevice('availableRoles') availableRoles?: AgentRole[],
  ) {
    const actorContext = await this.resolveActorContext({
      storeId,
      authenticatedUserId: userId,
      requestedOperatorId: dto.operatorId,
      requestedRole: dto.role,
      permissions,
      fieldScopes,
      availableRoles,
    });
    return this.orchestrator.approve({
      approvalId: id,
      comment: dto.comment,
      args: dto.args,
      actor: {
        storeId,
        userId: actorContext.userId,
        deviceId,
        role: actorContext.role,
        entrypoint: 'api',
        permissions: actorContext.permissions,
        fieldScopes: actorContext.fieldScopes,
      },
    });
  }

  @Post('approvals/:id/reject')
  @ApiOperation({ summary: '拒绝 Agent 工具调用' })
  async reject(
    @Param('id', ParseIntPipe) id: number,
    @CurrentDevice('storeId') storeId: number,
    @CurrentDevice('userId') userId: number | undefined,
    @CurrentDevice('id') deviceId: number | undefined,
    @CurrentDevice('permissions') permissions: string[] | undefined,
    @CurrentDevice('fieldScopes') fieldScopes: AgentFieldScopes | undefined,
    @Body() dto: DecideAgentApprovalDto,
    @CurrentDevice('availableRoles') availableRoles?: AgentRole[],
  ) {
    const actorContext = await this.resolveActorContext({
      storeId,
      authenticatedUserId: userId,
      requestedOperatorId: dto.operatorId,
      requestedRole: dto.role,
      permissions,
      fieldScopes,
      availableRoles,
    });
    return this.orchestrator.reject({
      approvalId: id,
      comment: dto.comment,
      actor: {
        storeId,
        userId: actorContext.userId,
        deviceId,
        role: actorContext.role,
        entrypoint: 'api',
        permissions: actorContext.permissions,
        fieldScopes: actorContext.fieldScopes,
      },
    });
  }

  private buildFeedbackSnapshot(
    run: {
      userInput?: string | null;
      planJson?: unknown;
      resultJson?: unknown;
      errorMessage?: string | null;
    } | null,
    body: { rating?: number; adopted?: boolean; comment?: string; businessActionJson?: unknown },
  ) {
    const plan = this.asObject(run?.planJson);
    const result = this.asObject(run?.resultJson);
    const traceSummary = this.asObject(result?.traceSummary);
    const skillPlan = this.asObject(plan?.skillPlan) ?? this.asObject(result?.skillPlan);
    const capabilityPlan = this.asObject(plan?.capabilityPlan) ?? this.asObject(result?.capabilityPlan);
    const toolPlan = Array.isArray(plan?.toolPlan) ? plan.toolPlan : Array.isArray(result?.toolPlan) ? result.toolPlan : [];
    const toolResults = Array.isArray(result?.toolResults) ? result.toolResults : [];
    const toolNames = [
      ...toolPlan.map((item) => String(this.asObject(item)?.tool ?? '')).filter(Boolean),
      ...toolResults.map((item) => String(this.asObject(item)?.title ?? '')).filter(Boolean),
    ];
    const userProvided = this.asObject(body.businessActionJson);
    return this.toJsonObject({
      ...(userProvided ? { userProvided } : {}),
      snapshot: {
        question: run?.userInput ?? '',
        answer: String(result?.answer ?? run?.errorMessage ?? ''),
        skillId: String(traceSummary?.skillId ?? skillPlan?.skillId ?? ''),
        capabilityId: String(traceSummary?.capabilityId ?? skillPlan?.capabilityId ?? capabilityPlan?.capabilityId ?? ''),
        toolNames: [...new Set(toolNames)].slice(0, 8),
        responseMode: result?.responseMode,
        answerContract: result?.answerContract,
        feedbackReason: body.comment ?? (body.adopted === false ? '用户标记无用' : body.adopted === true ? '用户标记有用' : undefined),
      },
    });
  }

  private assertTerminalRuntimeEnabled(entrypoint?: string) {
    if (entrypoint !== 'terminal:kiosk') return;
    const value = String(process.env.AGENT_TERMINAL_RUNTIME_ENABLED ?? '').trim().toLowerCase();
    if (!['0', 'false', 'off', 'disabled'].includes(value)) return;
    throw new ServiceUnavailableException({
      message: '终端 Agent Runtime 已通过灰度开关关闭。',
      code: 'AGENT_TERMINAL_RUNTIME_DISABLED',
    });
  }

  private asObject(value: unknown): Record<string, any> | null {
    return typeof value === 'object' && value !== null ? (value as Record<string, any>) : null;
  }

  private toJsonObject(value: Record<string, unknown>) {
    return JSON.parse(JSON.stringify(value));
  }

  private async resolveActorContext(input: {
    storeId: number;
    authenticatedUserId?: number;
    requestedOperatorId?: number | null;
    requestedRole?: string;
    permissions?: string[];
    fieldScopes?: AgentFieldScopes;
    availableRoles?: AgentRole[];
  }): Promise<{
    userId?: number;
    role: AgentRole;
    permissions: string[];
    fieldScopes: AgentFieldScopes;
  }> {
    const requestedOperatorId = Number(input.requestedOperatorId);
    if (Number.isFinite(requestedOperatorId) && requestedOperatorId > 0) {
      const user = await this.prisma.user.findFirst({
        where: {
          id: requestedOperatorId,
          deletedAt: null,
          status: 'active',
          OR: [
            { stores: { some: { storeId: input.storeId } } },
            { roles: { some: { role: { key: { in: ['super_admin', 'store_manager'] } } } } },
          ],
        },
        include: { stores: true, roles: { include: { role: true } } },
      });
      if (!user) {
        throw new ForbiddenException('当前选择账号无权使用此门店终端。');
      }
      const roles = resolveAuraAvailableRolesForUser(user) as AgentRole[];
      const role = this.resolveActorRole(input.requestedRole, roles);
      return {
        userId: requestedOperatorId,
        role,
        permissions: collectAuraUserPermissions(user),
        fieldScopes: collectAuraUserFieldScopes(user) as AgentFieldScopes,
      };
    }

    return {
      userId: input.authenticatedUserId,
      role: this.resolveActorRole(input.requestedRole, input.availableRoles),
      permissions: input.permissions ?? [],
      fieldScopes: input.fieldScopes ?? {},
    };
  }

  private resolveActorRole(requestedRole?: string, availableRoles?: AgentRole[]): AgentRole {
    const role = (requestedRole ?? availableRoles?.[0] ?? 'manager') as AgentRole;
    if (availableRoles?.length && !availableRoles.includes(role)) {
      throw new ForbiddenException(`当前账号不能使用「${this.roleLabel(role)}」角色，请切换有权限账号。`);
    }
    return role;
  }

  private roleLabel(role: string) {
    const labels: Record<string, string> = {
      manager: '店长',
      reception: '前台',
      beautician: '美容师',
    };
    return labels[role] ?? role;
  }
}
