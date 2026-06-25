import { Body, Controller, ForbiddenException, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
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

  // ─── Feedback ────────────────────────────────────────────────────────────

  @Post('runs/:id/feedback')
  @ApiOperation({ summary: '提交 Agent Run 的用户反馈和采纳记录' })
  async submitFeedback(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { rating?: number; adopted?: boolean; comment?: string; businessActionJson?: unknown },
    @CurrentDevice() device: any,
  ) {
    return this.prisma.agentFeedback.create({
      data: {
        runId: id,
        userId: device?.userId ?? null,
        storeId: device?.storeId ?? null,
        rating: body.rating ?? null,
        adopted: body.adopted ?? null,
        comment: body.comment ?? null,
        businessActionJson: body.businessActionJson ? (body.businessActionJson as object) : undefined,
      },
    });
  }

  @Get('tools')
  @ApiOperation({ summary: '获取当前 Agent 工具目录' })
  tools() {
    return this.orchestrator.listTools();
  }

  @Get('evals/default')
  @ApiOperation({ summary: '运行默认 Agent 评测集' })
  runDefaultEvals() {
    return this.orchestrator.runDefaultEvals();
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
        queryPlan: null,
      };
    }
    const result = await this.semanticQueryExecutor.execute(planned.plan);
    return {
      result,
      composed: this.responseComposer?.compose(result),
      queryPlan: planned.plan,
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
    @Query('entrypoint') entrypoint?: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.orchestrator.findRuns({ page, pageSize, status, role, entrypoint, keyword, storeId });
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
        entrypoint: 'api',
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
