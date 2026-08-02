import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { BrainChatService } from './brain-chat.service.js';
import { BrainContextService } from './context/brain-context.service.js';
import { ConfirmBrainActionDto, CreateBrainConversationDto, SendBrainMessageDto } from './dto/brain-chat.dto.js';
import { CreateBrainEvalRunDto, CreateBrainFeedbackDto } from './dto/brain-governance.dto.js';
import { BrainEvalService } from './governance/brain-eval.service.js';
import { BrainFeedbackService } from './governance/brain-feedback.service.js';
import { BrainReleaseService } from './governance/brain-release.service.js';
import { BrainTraceService } from './governance/brain-trace.service.js';
import {
  BrainGovernanceResourceService,
  type BrainGovernanceResourceType,
  type BrainSemanticGovernanceResourceType,
} from './governance/brain-governance-resource.service.js';
import { BrainGovernanceApprovalService } from './governance/brain-governance-approval.service.js';
import { BrainGovernanceControlPlaneService } from './governance/brain-governance-control-plane.service.js';
import { BrainGovernanceCandidateService } from './governance/brain-governance-candidate.service.js';
import { BrainGovernancePolicyOrchestratorService } from './governance/brain-governance-policy-orchestrator.service.js';
import { BrainRolloutSequenceService } from './governance/brain-rollout-sequence.service.js';
import { BrainGovernanceMetricsService } from './governance/brain-governance-metrics.service.js';
import { BrainCapabilityRegenerationService } from './governance/brain-capability-regeneration.service.js';
import { BrainInspectionService } from './inspection/brain-inspection.service.js';
import {
  BrainInspectionRepairPreviewService,
  type BrainInspectionRepairDecision,
} from './inspection/brain-inspection-repair-preview.service.js';
import { BrainAgentProfileService } from './orchestrator/brain-agent-profile.service.js';
import { BrainKnowledgeGraphService } from './semantic/brain-knowledge-graph.service.js';
import { BrainMetricRegistryService } from './semantic/brain-metric-registry.service.js';
import { BrainOntologyService } from './semantic/brain-ontology.service.js';
import { BrainActionConfirmationService } from './skills/brain-action-confirmation.service.js';
import { BrainSkillRegistryService } from './skills/brain-skill-registry.service.js';
import { BrainMemoryService } from './memory/brain-memory.service.js';
import { BrainRuntimeConfigService } from './config/brain-runtime-config.service.js';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('brain')
export class BrainController {
  constructor(
    private readonly contextService: BrainContextService,
    private readonly chatService: BrainChatService,
    private readonly traceService?: BrainTraceService,
    private readonly metricRegistry?: BrainMetricRegistryService,
    private readonly ontologyService?: BrainOntologyService,
    private readonly knowledgeGraphService?: BrainKnowledgeGraphService,
    private readonly agentProfileService?: BrainAgentProfileService,
    private readonly skillRegistryService?: BrainSkillRegistryService,
    private readonly inspectionService?: BrainInspectionService,
    private readonly evalService?: BrainEvalService,
    private readonly releaseService?: BrainReleaseService,
    private readonly feedbackService?: BrainFeedbackService,
    private readonly actionConfirmationService?: BrainActionConfirmationService,
    private readonly memoryService?: BrainMemoryService,
    private readonly governanceResourceService?: BrainGovernanceResourceService,
    private readonly governanceApprovalService?: BrainGovernanceApprovalService,
    private readonly runtimeConfigService?: BrainRuntimeConfigService,
    private readonly capabilityRegenerationService?: BrainCapabilityRegenerationService,
    private readonly inspectionRepairPreviewService?: BrainInspectionRepairPreviewService,
    private readonly governanceControlPlaneService?: BrainGovernanceControlPlaneService,
    private readonly governanceCandidateService?: BrainGovernanceCandidateService,
    private readonly governancePolicyOrchestratorService?: BrainGovernancePolicyOrchestratorService,
    private readonly rolloutSequenceService?: BrainRolloutSequenceService,
    private readonly governanceMetricsService?: BrainGovernanceMetricsService,
  ) {}

  @Post('conversations')
  @Permissions('core:brain:use')
  createConversation(@Req() req: Request, @Body() dto: CreateBrainConversationDto) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    return this.chatService.createConversation(context, dto);
  }

  @Get('conversations')
  @Permissions('core:brain:use')
  listConversations(@Req() req: Request, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    return this.chatService.listConversations(context, {
      page: Number(page),
      pageSize: Number(pageSize),
    });
  }

  @Post('conversations/:id/messages')
  @Permissions('core:brain:use')
  sendMessage(@Req() req: Request, @Param('id') id: string, @Body() dto: SendBrainMessageDto) {
    const context = this.contextService.fromRequest(req, dto.timezone ?? 'Asia/Shanghai');
    return this.chatService.sendMessage(context, Number(id), dto);
  }

  @Post('conversations/:id/messages/stream')
  @Permissions('core:brain:use')
  async streamMessage(
    @Req() req: Request,
    @Res() res: Response,
    @Param('id') id: string,
    @Body() dto: SendBrainMessageDto,
  ) {
    const context = this.contextService.fromRequest(req, dto.timezone ?? 'Asia/Shanghai');
    const conversationId = Number(id);
    const streamStartedAt = Date.now();
    let firstProgressAt: number | undefined;
    let answerReadyAt: number | undefined;
    let closed = false;
    req.on('close', () => {
      closed = true;
    });

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const emit = (event: string, data: Record<string, unknown>) => {
      if (closed) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      (res as Response & { flush?: () => void }).flush?.();
    };

    emit('run_started', {
      conversationId,
      transport: 'sse',
      answerMode: 'buffered_chunks',
      progressMode: 'live_status',
    });
    firstProgressAt = Date.now();
    emit('progress', {
      conversationId,
      phase: 'understanding',
      message: '正在理解问题并核对可用数据...',
      elapsedMs: firstProgressAt - streamStartedAt,
    });
    try {
      let answerEmitted = false;
      const emitAnswer = (result: {
        runId: number;
        answer: string;
        suggestedActions?: unknown[];
        blocks?: unknown[];
      }) => {
        if (answerEmitted) return;
        answerEmitted = true;
        answerReadyAt = Date.now();
        emit('step', { conversationId, runId: result.runId, stepKey: 'answer_ready', status: 'completed' });
        for (const action of result.suggestedActions ?? []) {
          emit('action_preview', { conversationId, runId: result.runId, action });
        }
        for (const [index, block] of (result.blocks ?? []).entries()) {
          const kind =
            block && typeof block === 'object' && 'kind' in block
              ? String((block as { kind: unknown }).kind)
              : 'unknown';
          emit('block_delta', { conversationId, runId: result.runId, index, kind });
          emit('block_completed', { conversationId, runId: result.runId, index, block });
        }
        const chunks = result.answer.match(/[\s\S]{1,24}/g) ?? [];
        for (const delta of chunks) emit('answer_delta', { conversationId, runId: result.runId, delta });
      };
      const result = await this.chatService.sendMessage(context, conversationId, dto, { onAnswerReady: emitAnswer });
      emitAnswer(result);
      const completedAt = Date.now();
      emit('completed', {
        ...(result as unknown as Record<string, unknown>),
        streamMetrics: {
          firstProgressMs: firstProgressAt === undefined ? null : firstProgressAt - streamStartedAt,
          answerReadyMs: answerReadyAt === undefined ? null : answerReadyAt - streamStartedAt,
          completedMs: completedAt - streamStartedAt,
        },
      });
    } catch (error) {
      emit('failed', { message: error instanceof Error ? error.message : 'Ami Brain 回答失败' });
    } finally {
      if (!closed) res.end();
    }
  }

  @Get('conversations/:id/messages')
  @Permissions('core:brain:use')
  listMessages(@Req() req: Request, @Param('id') id: string) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    return this.chatService.listMessages(context, Number(id));
  }

  @Get('runs/:runId/events')
  @Permissions('core:brain:use')
  getRunEvents(@Req() req: Request, @Param('runId') runId: string) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    return this.chatService.listRunEvents(context, Number(runId));
  }

  @Get('runs/:runId/context')
  @Permissions('core:brain:use')
  getRunContext(@Req() req: Request, @Param('runId') runId: string) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    return this.chatService.getRunContext(context, Number(runId));
  }

  @Get('runs/:runId/actions')
  @Permissions('core:brain:use')
  async listRunActionStatuses(@Req() req: Request, @Param('runId') runId: string) {
    const parsedRunId = Number(runId);
    if (!Number.isInteger(parsedRunId) || parsedRunId < 1) {
      throw new BadRequestException('invalid_brain_run_id');
    }
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    const statuses =
      (await this.actionConfirmationService?.listExecutionStatuses({
        runId: parsedRunId,
        userId: context.userId,
        storeId: context.storeId,
      })) ?? [];
    const items = statuses.map((status) => ({
      ...status,
      runId: parsedRunId,
      storeId: context.storeId,
    }));
    return { runId: parsedRunId, storeId: context.storeId, items };
  }

  @Post('actions/:actionId/confirm')
  @Permissions('core:brain:execute')
  async confirmAction(@Req() req: Request, @Param('actionId') actionId: string, @Body() dto: ConfirmBrainActionDto) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    const result = await this.actionConfirmationService?.confirmAndExecute({
      actionId,
      runId: dto.runId,
      userId: context.userId,
      storeId: context.storeId,
      permissions: context.permissions.filter((permission) => !context.deniedPermissions.includes(permission)),
      roles: context.roles,
      requestChannel: context.requestChannel,
      deviceIdHash: context.deviceIdHash,
    });
    if (!result) {
      throw new NotFoundException('动作预览不存在或已处理');
    }

    return { ...result, actionId, runId: dto.runId, storeId: context.storeId };
  }

  @Post('actions/:actionId/reject')
  @Permissions('core:brain:execute')
  async rejectAction(@Req() req: Request, @Param('actionId') actionId: string, @Body() dto: ConfirmBrainActionDto) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    const result = await this.actionConfirmationService?.rejectPreview({
      actionId,
      runId: dto.runId,
      userId: context.userId,
      storeId: context.storeId,
    });
    if (!result) {
      throw new NotFoundException('动作预览不存在或已处理');
    }

    return { actionId, runId: dto.runId, status: 'rejected', storeId: context.storeId };
  }

  @Post('actions/:actionId/retry')
  @Permissions('core:brain:execute')
  async retryAction(@Req() req: Request, @Param('actionId') actionId: string, @Body() dto: ConfirmBrainActionDto) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    const result = await this.actionConfirmationService?.retryFailedExecution({
      actionId,
      runId: dto.runId,
      userId: context.userId,
      storeId: context.storeId,
      permissions: context.permissions.filter((permission) => !context.deniedPermissions.includes(permission)),
      roles: context.roles,
      requestChannel: context.requestChannel,
      deviceIdHash: context.deviceIdHash,
    });
    if (!result) {
      throw new NotFoundException('动作执行记录不存在');
    }

    return { ...result, actionId, runId: dto.runId, storeId: context.storeId };
  }

  @Get('governance/traces')
  @Permissions('core:brain-governance:view')
  async listTraces(@Req() req: Request) {
    if (!this.traceService?.listTraces) {
      return { items: [], total: 0 };
    }

    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    return this.traceService.listTraces({ storeId: context.storeId });
  }

  @Get('governance/traces/:runId')
  @Permissions('core:brain-governance:view')
  getTrace(@Req() req: Request, @Param('runId') runId: string) {
    if (!this.traceService) {
      return null;
    }
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    return this.traceService.getRunTrace({ runId: Number(runId), storeId: context.storeId });
  }

  @Get('governance/semantic/:resource')
  @Permissions('core:brain-governance:view')
  async listSemanticResource(@Param('resource') resource: string) {
    if (resource === 'metrics' && this.metricRegistry) {
      return { resource, items: await this.metricRegistry.listActiveMetrics() };
    }
    if (resource === 'entities' && this.ontologyService) {
      return { resource, items: await this.ontologyService.listActiveEntities() };
    }
    if (resource === 'relations' && this.knowledgeGraphService) {
      return { resource, items: await this.knowledgeGraphService.listActiveRelations() };
    }

    return { resource, items: [] };
  }

  @Get('governance/semantic-versions/:resource')
  @Permissions('core:brain-governance:view')
  async listSemanticGovernanceSummaries(
    @Req() req: Request,
    @Param('resource') resource: string,
    @Query('take') take?: string,
  ) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    return {
      items: this.governanceResourceService
        ? await this.governanceResourceService.listSemanticGovernanceSummaries({
            resourceType: this.semanticGovernanceResourceType(resource),
            storeId: context.storeId,
            take: take ? Number(take) : undefined,
          })
        : [],
    };
  }

  @Get('governance/semantic-versions/:resource/:resourceKey')
  @Permissions('core:brain-governance:view')
  async listSemanticGovernanceHistory(
    @Param('resource') resource: string,
    @Param('resourceKey') resourceKey: string,
    @Query('take') take?: string,
  ) {
    return {
      items: this.governanceResourceService
        ? await this.governanceResourceService.listSemanticGovernanceHistory({
            resourceType: this.semanticGovernanceResourceType(resource),
            resourceKey,
            take: take ? Number(take) : undefined,
          })
        : [],
    };
  }

  @Patch('governance/semantic-versions/:resource/:resourceKey/enabled')
  @Permissions('core:brain-governance:manage')
  setPublishedSemanticEnabled(
    @Param('resource') resource: string,
    @Param('resourceKey') resourceKey: string,
    @Body() body: Record<string, unknown>,
  ) {
    if (typeof body.enabled !== 'boolean') throw new BadRequestException('semantic_enabled_flag_invalid');
    if (!this.governanceResourceService) throw new NotFoundException('语义治理服务不可用');
    return this.governanceResourceService.setPublishedSemanticEnabled({
      resourceType: this.semanticGovernanceResourceType(resource),
      resourceKey,
      enabled: body.enabled,
    });
  }

  @Get('governance/semantic-graph')
  @Permissions('core:brain-governance:view')
  async getSemanticGraph() {
    return (
      this.governanceResourceService?.getSemanticGraph() ?? {
        nodes: [],
        edges: [],
        summary: {
          entities: 0,
          relations: 0,
          metrics: 0,
          actions: 0,
          predicates: 0,
          effects: 0,
          events: 0,
          roles: 0,
          tables: 0,
          edges: 0,
        },
      }
    );
  }

  @Post('governance/semantic/:resource')
  @Permissions('core:brain-governance:manage')
  createSemanticResource(
    @Req() req: Request,
    @Param('resource') resource: string,
    @Body() body: Record<string, unknown>,
  ) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    if (!this.governanceResourceService) throw new NotFoundException('治理资源服务不可用');
    const resourceType = this.semanticResourceType(resource);
    return this.governanceResourceService.createDraft({
      resourceType,
      resourceKey: this.resourceKey(resourceType, body),
      payload: body,
      createdBy: context.userId,
    });
  }

  @Patch('governance/semantic/:resource/:key')
  @Permissions('core:brain-governance:manage')
  updateSemanticResource(
    @Req() req: Request,
    @Param('resource') resource: string,
    @Param('key') key: string,
    @Body() body: Record<string, unknown>,
  ) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    if (!this.governanceResourceService) throw new NotFoundException('治理资源服务不可用');
    return this.governanceResourceService.createDraft({
      resourceType: this.semanticResourceType(resource),
      resourceKey: key,
      payload: body,
      createdBy: context.userId,
    });
  }

  @Get('governance/roles')
  @Permissions('core:brain-governance:view')
  async listRoleProfiles() {
    return { items: this.agentProfileService ? await this.agentProfileService.listActiveProfiles() : [] };
  }

  @Get('governance/memories')
  @Permissions('core:brain-governance:view')
  listMemories(@Req() req: Request) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    return (
      this.memoryService?.listForGovernance({
        storeId: context.storeId,
        userId: context.userId,
        includeDeleted: true,
      }) ?? { items: [], total: 0 }
    );
  }

  @Get('governance/memories/:id/revisions')
  @Permissions('core:brain-governance:view')
  listMemoryRevisions(@Req() req: Request, @Param('id') id: string) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    if (!this.memoryService) throw new NotFoundException('记忆服务未启用');
    return this.memoryService.listRevisions({ id: Number(id), storeId: context.storeId, userId: context.userId });
  }

  @Post('governance/memories/:id/correct')
  @Permissions('core:brain-governance:manage')
  correctMemory(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    if (!this.memoryService) throw new NotFoundException('记忆服务未启用');
    return this.memoryService.correctMemory({
      id: Number(id),
      storeId: context.storeId,
      userId: context.userId,
      content: (body.content as Record<string, unknown>) ?? {},
      reason: typeof body.reason === 'string' ? body.reason : undefined,
    });
  }

  @Post('governance/memories/:id/delete')
  @Permissions('core:brain-governance:manage')
  deleteMemory(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    if (!this.memoryService) throw new NotFoundException('记忆服务未启用');
    return this.memoryService.deleteMemory({
      id: Number(id),
      storeId: context.storeId,
      userId: context.userId,
      reason: typeof body.reason === 'string' ? body.reason : undefined,
    });
  }

  @Post('governance/memories/:id/restore')
  @Permissions('core:brain-governance:manage')
  restoreMemory(@Req() req: Request, @Param('id') id: string) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    if (!this.memoryService) throw new NotFoundException('记忆服务未启用');
    return this.memoryService.restoreMemory({ id: Number(id), storeId: context.storeId, userId: context.userId });
  }

  @Post('governance/roles')
  @Permissions('core:brain-governance:manage')
  createRoleProfile(@Req() req: Request, @Body() body: Record<string, unknown>) {
    return this.createGovernanceDraft(req, 'agent_profile', this.resourceKey('agent_profile', body), body);
  }

  @Patch('governance/roles/:roleKey')
  @Permissions('core:brain-governance:manage')
  updateRoleProfile(@Req() req: Request, @Param('roleKey') roleKey: string, @Body() body: Record<string, unknown>) {
    return this.createGovernanceDraft(req, 'agent_profile', roleKey, body);
  }

  @Get('governance/skills')
  @Permissions('core:brain-governance:view')
  async listSkills(@Query('summary') summary?: string, @Query('includeDisabled') includeDisabled?: string) {
    if (!this.skillRegistryService) return { items: [] };
    return {
      items:
        summary === 'true'
          ? await this.skillRegistryService.listSkillSummaries({ includeDisabled: includeDisabled === 'true' })
          : await this.skillRegistryService.listSkills({ includeDisabled: includeDisabled === 'true' }),
    };
  }

  @Get('governance/skill-versions')
  @Permissions('core:brain-governance:view')
  async listSkillGovernanceSummaries(@Query('take') take?: string) {
    return {
      items: this.governanceResourceService
        ? await this.governanceResourceService.listSkillGovernanceSummaries({
            take: take ? Number(take) : undefined,
          })
        : [],
    };
  }

  @Get('governance/skill-versions/:skillKey')
  @Permissions('core:brain-governance:view')
  async listSkillGovernanceHistory(@Param('skillKey') skillKey: string, @Query('take') take?: string) {
    return {
      items: this.governanceResourceService
        ? await this.governanceResourceService.listSkillGovernanceHistory({
            skillKey,
            take: take ? Number(take) : undefined,
          })
        : [],
    };
  }

  @Post('governance/skills')
  @Permissions('core:brain-governance:manage')
  createSkill(@Req() req: Request, @Body() body: Record<string, unknown>) {
    return this.createGovernanceDraft(req, 'skill', this.resourceKey('skill', body), body);
  }

  @Patch('governance/skills/:skillKey')
  @Permissions('core:brain-governance:manage')
  updateSkill(@Req() req: Request, @Param('skillKey') skillKey: string, @Body() body: Record<string, unknown>) {
    return this.createGovernanceDraft(req, 'skill', skillKey, body);
  }

  @Patch('governance/skills/:skillKey/enabled')
  @Permissions('core:brain-governance:manage')
  setPublishedSkillEnabled(@Param('skillKey') skillKey: string, @Body() body: Record<string, unknown>) {
    if (typeof body.enabled !== 'boolean') throw new BadRequestException('skill_enabled_flag_invalid');
    if (!this.governanceResourceService) throw new NotFoundException('技能治理服务不可用');
    return this.governanceResourceService.setPublishedSkillEnabled({ skillKey, enabled: body.enabled });
  }

  @Get('governance/inspection-rules')
  @Permissions('core:brain-governance:view')
  async listInspectionRules() {
    if (!this.inspectionService) {
      return { items: [] };
    }

    return { items: await this.inspectionService.listRules() };
  }

  @Post('inspections/runs')
  @Permissions('core:brain-governance:manage')
  runInspection(@Req() req: Request) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    if (!this.inspectionService) throw new NotFoundException('巡检服务不可用');
    return this.inspectionService.runInspection({ storeId: context.storeId, triggerType: 'manual' });
  }

  @Get('inspections/findings')
  @Permissions('core:brain-governance:view')
  async listInspectionFindings(
    @Req() req: Request,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('severity') severity?: string,
    @Query('owner') owner?: string,
    @Query('candidateKey') candidateKey?: string,
    @Query('createdFrom') createdFrom?: string,
    @Query('createdTo') createdTo?: string,
  ) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    if (!this.inspectionService) return { items: [], total: 0, page: 1, pageSize: 20 };
    return this.inspectionService.listFindingsPage({
      storeId: context.storeId,
      status,
      search,
      page: Number(page),
      pageSize: Number(pageSize),
      severity,
      owner,
      candidateKey,
      createdFrom,
      createdTo,
      permissions: context.permissions,
      deniedPermissions: context.deniedPermissions,
      userId: context.userId,
      roles: context.roles ?? [],
      enabledRulesOnly: true,
    });
  }

  @Get('inspections/findings/:findingId')
  @Permissions('core:brain-governance:view')
  getInspectionFinding(@Req() req: Request, @Param('findingId') findingId: string) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    if (!this.inspectionService) throw new NotFoundException('巡检服务不可用');
    return this.inspectionService.getFinding({
      storeId: context.storeId,
      findingId: Number(findingId),
      permissions: context.permissions,
      deniedPermissions: context.deniedPermissions,
      userId: context.userId,
      roles: context.roles ?? [],
      enabledRulesOnly: true,
    });
  }

  @Get('inspections/inbox')
  @Permissions('core:brain:use')
  async listInspectionInbox(
    @Req() req: Request,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    if (!this.inspectionService) {
      return {
        items: [],
        summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
        storeId: context.storeId,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      };
    }
    return this.inspectionService.listInbox({
      storeId: context.storeId,
      permissions: context.permissions,
      deniedPermissions: context.deniedPermissions,
      userId: context.userId,
      roles: context.roles ?? [],
      limit: Number(limit) || undefined,
      page: Number(page) || undefined,
      pageSize: Number(pageSize) || undefined,
    });
  }

  @Patch('inspections/findings/:findingId')
  @Permissions('core:brain:execute')
  updateInspectionFinding(
    @Req() req: Request,
    @Param('findingId') findingId: string,
    @Body() body: { disposition: 'adopted' | 'ignored' | 'false_positive'; note?: string },
  ) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    if (!this.inspectionService) throw new NotFoundException('巡检服务不可用');
    return this.inspectionService.updateFinding({
      storeId: context.storeId,
      findingId: Number(findingId),
      disposition: body.disposition,
      note: body.note,
    });
  }

  @Get('inspections/findings/:findingId/repair-preview')
  @Permissions('core:brain:execute')
  getInspectionRepairPreview(@Req() req: Request, @Param('findingId') findingId: string) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    if (!this.inspectionRepairPreviewService) throw new NotFoundException('巡检修复预览服务不可用');
    return this.inspectionRepairPreviewService.getPreview({
      storeId: context.storeId,
      findingId: Number(findingId),
    });
  }

  @Post('inspections/findings/:findingId/repair-decisions')
  @Permissions('core:brain:execute')
  decideInspectionRepair(
    @Req() req: Request,
    @Param('findingId') findingId: string,
    @Body() body: { decision: BrainInspectionRepairDecision; modifications?: Record<string, unknown>; note?: string },
  ) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    if (!this.inspectionRepairPreviewService) throw new NotFoundException('巡检修复预览服务不可用');
    return this.inspectionRepairPreviewService.recordDecision({
      storeId: context.storeId,
      findingId: Number(findingId),
      userId: context.userId,
      decision: body.decision,
      modifications: body.modifications,
      note: body.note,
    });
  }

  @Post('governance/inspection-rules')
  @Permissions('core:brain-governance:manage')
  createInspectionRule(@Req() req: Request, @Body() body: Record<string, unknown>) {
    return this.createGovernanceDraft(req, 'inspection_rule', this.resourceKey('inspection_rule', body), body);
  }

  @Patch('governance/inspection-rules/:ruleKey')
  @Permissions('core:brain-governance:manage')
  updateInspectionRule(@Req() req: Request, @Param('ruleKey') ruleKey: string, @Body() body: Record<string, unknown>) {
    return this.createGovernanceDraft(req, 'inspection_rule', ruleKey, body);
  }

  @Get('governance/resource-versions')
  @Permissions('core:brain-governance:view')
  async listResourceVersions(
    @Query('resourceType') resourceType?: string,
    @Query('resourceKey') resourceKey?: string,
    @Query('status') status?: string,
    @Query('includeSnapshot') includeSnapshot?: string,
    @Query('take') take?: string,
  ) {
    return {
      items: this.governanceResourceService
        ? await this.governanceResourceService.listVersions({
          resourceType,
          resourceKey,
          status,
          includeSnapshot: includeSnapshot !== 'false',
          take: take ? Number(take) : undefined,
        })
        : [],
    };
  }

  @Patch('governance/resource-versions/:id/status')
  @Permissions('core:brain-governance:manage')
  changeResourceVersionStatus(
    @Param('id') id: string,
    @Body() body: { status: 'draft' | 'active' | 'disabled' | 'archived' },
  ) {
    if (!this.governanceResourceService) throw new NotFoundException('治理资源服务不可用');
    return this.governanceResourceService.changeStatus({ id: Number(id), status: body.status });
  }

  @Post('governance/evals/runs')
  @Permissions('core:brain-governance:manage')
  createEvalRun(@Req() req: Request, @Body() body: CreateBrainEvalRunDto) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    if (!this.evalService) throw new NotFoundException('评测服务不可用');
    return this.evalService.createEvalRun({
      storeId: context.storeId,
      userId: context.userId,
      permissions: context.permissions.filter((permission) => !context.deniedPermissions.includes(permission)),
      sourceEvalRunId: body.sourceEvalRunId,
      releaseId: body.releaseId,
      caseKeys: body.caseKeys,
      roleKey: body.roleKey,
      modelVersion: body.modelVersion,
    });
  }

  @Get('governance/evals/runs')
  @Permissions('core:brain-governance:view')
  async listEvalRuns(@Req() req: Request) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    return { items: this.evalService ? await this.evalService.listRuns({ storeId: context.storeId }) : [] };
  }

  @Get('governance/evals/catalog')
  @Permissions('core:brain-governance:view')
  listEvalQuestionCatalog(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('questionType') questionType?: string,
    @Query('status') status?: string,
  ) {
    return (
      this.evalService?.listQuestionCatalog({
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
        search,
        questionType,
        status: status === 'passed' || status === 'failed' || status === 'unavailable' ? status : undefined,
      }) ?? { items: [], total: 0, page: 1, pageSize: 50, types: [], metadata: null }
    );
  }

  @Get('evals/catalog')
  @Permissions('core:brain:use')
  listRuntimeEvalQuestionCatalog(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('questionType') questionType?: string,
    @Query('status') status?: string,
  ) {
    return this.listEvalQuestionCatalog(page, pageSize, search, questionType, status);
  }

  @Get('governance/evals/catalog/:questionId')
  @Permissions('core:brain-governance:view')
  getEvalQuestionCatalogDetail(@Param('questionId') questionId: string) {
    if (!this.evalService) throw new NotFoundException('评测服务不可用');
    return this.evalService.getQuestionCatalogDetail(questionId);
  }

  @Get('governance/evals/suites')
  @Permissions('core:brain-governance:view')
  async listEvalSuites(@Req() req: Request) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    return this.evalService?.listEvaluationSuites({ storeId: context.storeId }) ?? { items: [] };
  }

  @Get('governance/evals/runs/:evalRunId/catalog')
  @Permissions('core:brain-governance:view')
  async listFullDomainEvalCatalog(
    @Req() req: Request,
    @Param('evalRunId') evalRunId: string,
    @Query() query: Record<string, string | undefined>,
  ) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    if (!this.evalService) throw new NotFoundException('评测服务不可用');
    return this.evalService.listFullDomainSuiteResults({
      storeId: context.storeId,
      evalRunId: Number(evalRunId),
      page: query.page ? Number(query.page) : undefined,
      pageSize: query.pageSize ? Number(query.pageSize) : undefined,
      search: query.search,
      domain: query.domain,
      role: query.role,
      type: query.type,
      difficulty: query.difficulty,
      deterministic:
        query.deterministic === 'passed' || query.deterministic === 'failed' ? query.deterministic : undefined,
      judge:
        query.judge === 'pass' || query.judge === 'fail' || query.judge === 'insufficient_evidence'
          ? query.judge
          : undefined,
    });
  }

  @Get('governance/evals/runs/:evalRunId/catalog/:caseKey')
  @Permissions('core:brain-governance:view')
  async getFullDomainEvalCatalogItem(
    @Req() req: Request,
    @Param('evalRunId') evalRunId: string,
    @Param('caseKey') caseKey: string,
  ) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    if (!this.evalService) throw new NotFoundException('评测服务不可用');
    return this.evalService.getFullDomainSuiteResult({
      storeId: context.storeId,
      evalRunId: Number(evalRunId),
      caseKey,
    });
  }

  @Get('governance/evals/runs/:evalRunId')
  @Permissions('core:brain-governance:view')
  getEvalRun(@Req() req: Request, @Param('evalRunId') evalRunId: string) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    return this.evalService?.getRun({ storeId: context.storeId, evalRunId: Number(evalRunId) }) ?? null;
  }

  @Get('governance/overview')
  @Permissions('core:brain-governance:view')
  getGovernanceOverview() {
    return this.governanceControlPlaneService?.getOverview() ?? { pending: {}, risk: {}, whitelist: {}, runtimePending: 0 };
  }

  @Get('governance/quality/latency')
  @Permissions('core:brain-governance:view')
  getGovernanceQualityLatency(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('days') days?: string,
    @Query('storeId') storeId?: string,
    @Query('provider') provider?: string,
    @Query('model') model?: string,
    @Query('capabilityKey') capabilityKey?: string,
    @Query('candidateKey') candidateKey?: string,
    @Query('createdFrom') createdFrom?: string,
    @Query('createdTo') createdTo?: string,
    @Query('percentile') percentile?: string,
  ) {
    if (!this.governanceMetricsService) throw new NotFoundException('治理指标服务不可用');
    return this.governanceMetricsService.getQualityLatency({
      from: createdFrom ?? from,
      to: createdTo ?? to,
      days: Number(days),
      storeId: Number(storeId),
      provider,
      model,
      capabilityKey,
      candidateKey,
      percentile: Number(percentile),
    });
  }

  @Get('governance/metrics/latency')
  @Permissions('core:brain-governance:view')
  getGovernanceProcessLatency(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('days') days?: string,
  ) {
    if (!this.governanceMetricsService) throw new NotFoundException('治理指标服务不可用');
    return this.governanceMetricsService.getGovernanceLatency({ from, to, days: Number(days) });
  }

  @Get('governance/candidates')
  @Permissions('core:brain-governance:view')
  listGovernanceCandidates(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('riskLevel') riskLevel?: string,
    @Query('branch') branch?: string,
    @Query('createdFrom') createdFrom?: string,
    @Query('createdTo') createdTo?: string,
  ) {
    if (!this.governanceCandidateService) throw new NotFoundException('治理候选服务不可用');
    return this.governanceCandidateService.list({
      page: Number(page),
      pageSize: Number(pageSize),
      search,
      status,
      riskLevel,
      branch,
      createdFrom,
      createdTo,
    });
  }

  @Get('governance/candidates/:candidateKey')
  @Permissions('core:brain-governance:view')
  async getGovernanceCandidate(@Param('candidateKey') candidateKey: string) {
    if (!this.governanceCandidateService) throw new NotFoundException('治理候选服务不可用');
    const detail = await this.governanceCandidateService.get(candidateKey);
    const policyPreview = this.governancePolicyOrchestratorService
      ? await this.governancePolicyOrchestratorService.preview(candidateKey)
      : null;
    const sequenceId = Number((detail.rolloutSequence as { id?: number } | null)?.id);
    const normalizedSequenceId = Number.isInteger(sequenceId) && sequenceId > 0 ? sequenceId : null;
    const rolloutSequence = this.rolloutSequenceService && Number.isInteger(sequenceId) && sequenceId > 0
      ? await this.rolloutSequenceService.get(sequenceId)
      : detail.rolloutSequence;
    const currentStage = String((rolloutSequence as { currentStage?: string } | null)?.currentStage ?? '');
    const releases = Array.isArray((rolloutSequence as { releases?: unknown[] } | null)?.releases)
      ? (rolloutSequence as { releases: Array<Record<string, unknown>> }).releases
      : [];
    const currentRelease = releases.find((release) => release.rolloutStage === currentStage) ?? null;
    return {
      ...detail,
      policyDiff: policyPreview?.diff ?? null,
      policyReadiness: policyPreview
        ? { decision: policyPreview.decision, blockers: policyPreview.blockers }
        : null,
      releaseReadiness: currentRelease
        ? {
            sequenceId: normalizedSequenceId,
            currentStage,
            releaseId: Number(currentRelease.id),
            releaseKey: String(currentRelease.releaseKey ?? ''),
            ...(currentRelease.releaseReadiness as Record<string, unknown> | undefined ?? {
              status: 'unavailable',
              canRelease: false,
              blockers: ['release_readiness_unavailable'],
            }),
          }
        : {
            sequenceId: normalizedSequenceId,
            currentStage: currentStage || null,
            releaseId: null,
            releaseKey: null,
            status: 'not_started',
            canRelease: false,
            blockers: [rolloutSequence ? 'rollout_stage_release_missing' : 'rollout_sequence_not_created'],
          },
      rolloutSequence,
    };
  }

  @Post('governance/candidates/:candidateKey/evaluate')
  @Permissions('core:brain-governance:manage')
  evaluateGovernanceCandidate(@Req() req: Request, @Param('candidateKey') candidateKey: string) {
    const context = this.contextService.fromGlobalRequest(req, 'Asia/Shanghai');
    if (!this.governanceControlPlaneService) throw new NotFoundException('治理控制面服务不可用');
    return this.governanceControlPlaneService.evaluateCandidate({ candidateKey, actorId: context.userId });
  }

  @Post('governance/candidates/:candidateKey/prepare-policy')
  @Permissions('core:brain-governance:manage')
  prepareGovernanceCandidatePolicy(
    @Req() req: Request,
    @Param('candidateKey') candidateKey: string,
    @Body() body: { note?: string },
  ) {
    const context = this.contextService.fromGlobalRequest(req, 'Asia/Shanghai');
    if (!this.governancePolicyOrchestratorService) throw new NotFoundException('治理策略编排服务不可用');
    return this.governancePolicyOrchestratorService.prepare({ candidateKey, note: body.note, actorId: context.userId });
  }

  @Get('governance/capability-policies')
  @Permissions('core:brain-governance:view')
  listCapabilityPolicies(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('riskLevel') riskLevel?: string,
    @Query('mode') mode?: string,
    @Query('whitelistStatus') whitelistStatus?: string,
    @Query('runtimeStatus') runtimeStatus?: string,
    @Query('status') status?: string,
    @Query('candidateKey') candidateKey?: string,
    @Query('affectedOnly') affectedOnly?: string,
    @Query('actionableOnly') actionableOnly?: string,
    @Query('owner') owner?: string,
    @Query('blockerType') blockerType?: string,
  ) {
    return this.governanceControlPlaneService?.listCapabilityPolicies({
      page: Number(page),
      pageSize: Number(pageSize),
      search,
      riskLevel,
      mode,
      whitelistStatus,
      runtimeStatus,
      status,
      candidateKey,
      affectedOnly: affectedOnly === 'true',
      actionableOnly: actionableOnly === 'true',
      owner,
      blockerType,
    }) ?? { items: [], total: 0, page: 1, pageSize: 20 };
  }

  @Get('governance/capability-policies/:key')
  @Permissions('core:brain-governance:view')
  getCapabilityPolicy(@Param('key') key: string) {
    if (!this.governanceControlPlaneService) throw new NotFoundException('治理控制面服务不可用');
    return this.governanceControlPlaneService.getCapabilityPolicy(key);
  }

  @Post('governance/capability-policies/:key/classify')
  @Permissions('core:brain-governance:manage')
  classifyCapabilityPolicy(
    @Req() req: Request,
    @Param('key') key: string,
    @Body() body: { riskLevel?: string; mode?: string; reason?: string; permissions?: string[]; owners?: Record<string, unknown> },
  ) {
    const context = this.contextService.fromGlobalRequest(req, 'Asia/Shanghai');
    if (!this.governanceControlPlaneService) throw new NotFoundException('治理控制面服务不可用');
    return this.governanceControlPlaneService.classifyCapability({
      capabilityKey: key,
      riskLevel: String(body.riskLevel ?? ''),
      mode: String(body.mode ?? ''),
      reason: String(body.reason ?? ''),
      permissions: body.permissions,
      owners: body.owners,
      actorId: context.userId,
      actorPermissions: context.permissions.filter((permission) => !context.deniedPermissions.includes(permission)),
    });
  }

  @Post('governance/capability-policies/:key/evaluate')
  @Permissions('core:brain-governance:manage')
  evaluateCapabilityPolicy(@Req() req: Request, @Param('key') key: string, @Body() body: { stage?: string }) {
    const context = this.contextService.fromGlobalRequest(req, 'Asia/Shanghai');
    if (!this.governanceControlPlaneService) throw new NotFoundException('治理控制面服务不可用');
    return this.governanceControlPlaneService.evaluateCapability({ capabilityKey: key, stage: String(body.stage ?? 'candidate'), actorId: context.userId });
  }

  @Post('governance/capability-policies/:key/owners')
  @Permissions('core:brain-governance:manage')
  updateCapabilityPolicyOwners(
    @Req() req: Request,
    @Param('key') key: string,
    @Body() body: { owners?: Record<string, unknown>; reason?: string },
  ) {
    const context = this.contextService.fromGlobalRequest(req, 'Asia/Shanghai');
    if (!this.governanceControlPlaneService) throw new NotFoundException('治理控制面服务不可用');
    return this.governanceControlPlaneService.updateCapabilityOwners({
      capabilityKey: key,
      owners: body.owners ?? {},
      reason: String(body.reason ?? ''),
      actorId: context.userId,
    });
  }

  @Post('governance/capability-policies/:key/approve')
  @Permissions('core:brain-governance:approve')
  approveCapabilityPolicy(@Req() req: Request, @Param('key') key: string, @Body() body: { decision?: string; reason?: string }) {
    const context = this.contextService.fromGlobalRequest(req, 'Asia/Shanghai');
    if (!this.governanceControlPlaneService) throw new NotFoundException('治理控制面服务不可用');
    return this.governanceControlPlaneService.approveCapability({
      capabilityKey: key,
      decision: String(body.decision ?? ''),
      reason: String(body.reason ?? ''),
      actorId: context.userId,
    });
  }

  @Get('governance/tasks')
  @Permissions('core:brain-governance:view')
  listGovernanceTasks(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('resourceKey') resourceKey?: string,
    @Query('taskType') taskType?: string,
    @Query('search') search?: string,
    @Query('riskLevel') riskLevel?: string,
    @Query('candidateKey') candidateKey?: string,
    @Query('blockerType') blockerType?: string,
    @Query('resolutionType') resolutionType?: string,
    @Query('actionableOnly') actionableOnly?: string,
  ) {
    return this.governanceControlPlaneService?.listTasks({
      page: Number(page),
      pageSize: Number(pageSize),
      status,
      resourceKey,
      taskType,
      search,
      riskLevel,
      candidateKey,
      blockerType,
      resolutionType,
      actionableOnly: actionableOnly === 'true',
    })
      ?? { items: [], total: 0, page: 1, pageSize: 20 };
  }

  @Get('governance/tasks/:id')
  @Permissions('core:brain-governance:view')
  getGovernanceTask(@Param('id') id: string) {
    if (!this.governanceControlPlaneService) throw new NotFoundException('治理控制面服务不可用');
    return this.governanceControlPlaneService.getTask(Number(id));
  }

  @Post('governance/tasks/:id/retry')
  @Permissions('core:brain-governance:manage')
  retryGovernanceTask(@Param('id') id: string) {
    if (!this.governanceControlPlaneService) throw new NotFoundException('治理控制面服务不可用');
    return this.governanceControlPlaneService.retryTask(Number(id));
  }

  @Post('governance/tasks/:id/cancel')
  @Permissions('core:brain-governance:manage')
  cancelGovernanceTask(@Req() req: Request, @Param('id') id: string) {
    const context = this.contextService.fromGlobalRequest(req, 'Asia/Shanghai');
    if (!this.governanceControlPlaneService) throw new NotFoundException('治理控制面服务不可用');
    return this.governanceControlPlaneService.cancelTask(Number(id), context.userId);
  }

  @Post('governance/gate-receipts')
  @Permissions('core:brain-governance:manage')
  ingestGovernanceReceipt(@Req() req: Request, @Body() body: Record<string, unknown>) {
    const context = this.contextService.fromGlobalRequest(req, 'Asia/Shanghai');
    if (!this.governanceControlPlaneService) throw new NotFoundException('治理控制面服务不可用');
    return this.governanceControlPlaneService.ingestReceipt(body, context.userId);
  }

  @Get('governance/gate-receipts')
  @Permissions('core:brain-governance:view')
  listGovernanceReceipts(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('candidateKey') candidateKey?: string,
    @Query('capabilityKey') capabilityKey?: string,
    @Query('gateKey') gateKey?: string,
    @Query('trustLevel') trustLevel?: string,
    @Query('verificationStatus') verificationStatus?: string,
    @Query('status') status?: string,
  ) {
    if (!this.governanceControlPlaneService) throw new NotFoundException('治理控制面服务不可用');
    return this.governanceControlPlaneService.listReceipts({
      page: Number(page),
      pageSize: Number(pageSize),
      candidateKey,
      capabilityKey,
      gateKey,
      trustLevel,
      verificationStatus,
      status,
    });
  }

  @Get('governance/gate-receipts/:id')
  @Permissions('core:brain-governance:view')
  getGovernanceReceipt(@Param('id') id: string) {
    if (!this.governanceControlPlaneService) throw new NotFoundException('治理控制面服务不可用');
    return this.governanceControlPlaneService.getReceipt(Number(id));
  }

  @Get('governance/policy-snapshots')
  @Permissions('core:brain-governance:view')
  listPolicySnapshots(@Query('page') page?: string, @Query('pageSize') pageSize?: string, @Query('status') status?: string, @Query('search') search?: string) {
    return this.governanceControlPlaneService?.listPolicySnapshots({ page: Number(page), pageSize: Number(pageSize), status, search })
      ?? { items: [], total: 0, page: 1, pageSize: 20 };
  }

  @Post('governance/policy-snapshots/preview')
  @Permissions('core:brain-governance:view')
  previewPolicySnapshot(@Body() body: { candidateKey?: string }) {
    if (!this.governancePolicyOrchestratorService) throw new NotFoundException('治理策略编排服务不可用');
    return this.governancePolicyOrchestratorService.preview(String(body.candidateKey ?? ''));
  }

  @Post('governance/policy-snapshots/prepare')
  @Permissions('core:brain-governance:manage')
  preparePolicySnapshot(@Req() req: Request, @Body() body: { candidateKey?: string; note?: string }) {
    const context = this.contextService.fromGlobalRequest(req, 'Asia/Shanghai');
    if (!this.governancePolicyOrchestratorService) throw new NotFoundException('治理策略编排服务不可用');
    return this.governancePolicyOrchestratorService.prepare({ candidateKey: String(body.candidateKey ?? ''), note: body.note, actorId: context.userId });
  }

  @Get('governance/policy-snapshots/:id/diff')
  @Permissions('core:brain-governance:view')
  diffPolicySnapshot(@Param('id') id: string) {
    if (!this.governancePolicyOrchestratorService) throw new NotFoundException('治理策略编排服务不可用');
    return this.governancePolicyOrchestratorService.diffSnapshot(Number(id));
  }

  @Post('governance/policy-snapshots')
  @Permissions('core:brain-governance:manage')
  createPolicySnapshot(@Req() req: Request, @Body() body: { releaseKey?: string; resourceVersionIds?: number[]; note?: string }) {
    const context = this.contextService.fromGlobalRequest(req, 'Asia/Shanghai');
    if (!this.governanceControlPlaneService) throw new NotFoundException('治理控制面服务不可用');
    return this.governanceControlPlaneService.createPolicySnapshot({
      releaseKey: String(body.releaseKey ?? ''),
      resourceVersionIds: body.resourceVersionIds,
      note: body.note,
      actorId: context.userId,
    });
  }

  @Post('governance/policy-snapshots/:id/publish')
  @Permissions('core:brain-governance:publish')
  publishPolicySnapshot(@Req() req: Request, @Param('id') id: string) {
    const context = this.contextService.fromGlobalRequest(req, 'Asia/Shanghai');
    if (!this.governanceControlPlaneService) throw new NotFoundException('治理控制面服务不可用');
    return this.governanceControlPlaneService.publishPolicySnapshot(Number(id), context.userId);
  }

  @Post('governance/policy-snapshots/:id/rollback')
  @Permissions('core:brain-governance:publish')
  rollbackPolicySnapshot(@Req() req: Request, @Param('id') id: string, @Body() body: { reason?: string }) {
    const context = this.contextService.fromGlobalRequest(req, 'Asia/Shanghai');
    if (!this.governanceControlPlaneService) throw new NotFoundException('治理控制面服务不可用');
    return this.governanceControlPlaneService.rollbackPolicySnapshot(Number(id), String(body.reason ?? 'manual_policy_rollback'), context.userId);
  }

  @Post('governance/releases')
  @Permissions('core:brain-governance:manage')
  createRelease(
    @Req() req: Request,
    @Body()
    body: { releaseKey?: string; scope?: string; rollout?: Record<string, unknown>; resourceVersionIds?: number[] },
  ) {
    const context = this.contextService.fromGlobalRequest(req, 'Asia/Shanghai');
    if (!this.releaseService) throw new NotFoundException('发布服务不可用');
    return this.releaseService.createRelease({
      releaseKey: String(body.releaseKey ?? ''),
      scope: String(body.scope ?? 'global'),
      rollout: body.rollout ?? {},
      resourceVersionIds: body.resourceVersionIds ?? [],
      createdBy: context.userId,
    });
  }

  @Post('governance/releases/rollout-sequence')
  @Permissions('core:brain-governance:manage')
  createRolloutSequence(@Req() req: Request, @Body() body: { releaseKey?: string; resourceVersionIds?: number[] }) {
    const context = this.contextService.fromGlobalRequest(req, 'Asia/Shanghai');
    if (!this.releaseService) throw new NotFoundException('发布服务不可用');
    return this.releaseService.createRolloutSequence({
      releaseKey: String(body.releaseKey ?? ''),
      resourceVersionIds: body.resourceVersionIds ?? [],
      createdBy: context.userId,
    });
  }

  @Get('governance/rollout-sequences')
  @Permissions('core:brain-governance:view')
  listRolloutSequences(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('candidateKey') candidateKey?: string,
  ) {
    if (!this.rolloutSequenceService) throw new NotFoundException('灰度序列服务不可用');
    return this.rolloutSequenceService.list({ page: Number(page), pageSize: Number(pageSize), status, candidateKey });
  }

  @Get('governance/rollout-sequences/:id')
  @Permissions('core:brain-governance:view')
  getRolloutSequence(@Param('id') id: string) {
    if (!this.rolloutSequenceService) throw new NotFoundException('灰度序列服务不可用');
    return this.rolloutSequenceService.get(Number(id));
  }

  @Post('governance/rollout-sequences')
  @Permissions('core:brain-governance:manage')
  createGovernanceRolloutSequence(
    @Req() req: Request,
    @Body() body: { candidateKey?: string; releaseKey?: string; resourceVersionIds?: number[]; governanceMode?: string; promotionPolicy?: Record<string, unknown>; healthThresholds?: Record<string, unknown> },
  ) {
    const context = this.contextService.fromGlobalRequest(req, 'Asia/Shanghai');
    if (!this.rolloutSequenceService) throw new NotFoundException('灰度序列服务不可用');
    return this.rolloutSequenceService.create({
      candidateKey: String(body.candidateKey ?? ''),
      releaseKey: String(body.releaseKey ?? ''),
      resourceVersionIds: body.resourceVersionIds ?? [],
      governanceMode: body.governanceMode,
      promotionPolicy: body.promotionPolicy,
      healthThresholds: body.healthThresholds,
      actorId: context.userId,
    });
  }

  @Post('governance/rollout-sequences/:id/validate')
  @Permissions('core:brain-governance:view')
  validateRolloutSequence(@Param('id') id: string) {
    if (!this.rolloutSequenceService) throw new NotFoundException('灰度序列服务不可用');
    return this.rolloutSequenceService.validate(Number(id));
  }

  @Post('governance/rollout-sequences/:id/activate-shadow')
  @Permissions('core:brain-governance:release')
  activateRolloutSequenceShadow(@Req() req: Request, @Param('id') id: string) {
    const context = this.contextService.fromGlobalRequest(req, 'Asia/Shanghai');
    if (!this.rolloutSequenceService) throw new NotFoundException('灰度序列服务不可用');
    return this.rolloutSequenceService.activateShadow(Number(id), context.userId);
  }

  @Post('governance/rollout-sequences/:id/promote')
  @Permissions('core:brain-governance:release')
  promoteRolloutSequence(@Req() req: Request, @Param('id') id: string) {
    const context = this.contextService.fromGlobalRequest(req, 'Asia/Shanghai');
    if (!this.rolloutSequenceService) throw new NotFoundException('灰度序列服务不可用');
    return this.rolloutSequenceService.promote(Number(id), { actorId: context.userId });
  }

  @Post('governance/rollout-sequences/:id/pause')
  @Permissions('core:brain-governance:release')
  pauseRolloutSequence(@Req() req: Request, @Param('id') id: string, @Body() body: { reason?: string }) {
    const context = this.contextService.fromGlobalRequest(req, 'Asia/Shanghai');
    if (!this.rolloutSequenceService) throw new NotFoundException('灰度序列服务不可用');
    return this.rolloutSequenceService.pause(Number(id), String(body.reason ?? ''), context.userId);
  }

  @Post('governance/rollout-sequences/:id/resume')
  @Permissions('core:brain-governance:release')
  resumeRolloutSequence(@Req() req: Request, @Param('id') id: string) {
    const context = this.contextService.fromGlobalRequest(req, 'Asia/Shanghai');
    if (!this.rolloutSequenceService) throw new NotFoundException('灰度序列服务不可用');
    return this.rolloutSequenceService.resume(Number(id), context.userId);
  }

  @Post('governance/rollout-sequences/:id/rollback')
  @Permissions('core:brain-governance:release')
  rollbackRolloutSequence(@Req() req: Request, @Param('id') id: string, @Body() body: { reason?: string }) {
    const context = this.contextService.fromGlobalRequest(req, 'Asia/Shanghai');
    if (!this.rolloutSequenceService) throw new NotFoundException('灰度序列服务不可用');
    return this.rolloutSequenceService.rollback(Number(id), String(body.reason ?? ''), context.userId);
  }

  @Get('governance/releases')
  @Permissions('core:brain-governance:view')
  async listReleases(@Query('includeSnapshot') includeSnapshot?: string, @Query('take') take?: string) {
    return {
      items: this.releaseService
          ? await this.releaseService.listReleases({
            includeSnapshot: includeSnapshot !== 'false',
            includeReadiness: true,
            take: take ? Number(take) : undefined,
          })
        : [],
    };
  }

  @Get('governance/releases/:releaseId/readiness')
  @Permissions('core:brain-governance:view')
  getReleaseReadiness(@Param('releaseId') releaseId: string) {
    if (!this.releaseService) throw new NotFoundException('发布服务不可用');
    return this.releaseService.getReleaseReadiness(Number(releaseId));
  }

  @Get('governance/runtime-config')
  @Permissions('core:brain-governance:view')
  async getRuntimeConfig(@Req() req: Request) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    const configured = this.runtimeConfigService?.runtime ?? null;
    const roleKey = context.roles?.find((role) => role.trim().length > 0) ?? 'store_manager';
    const resolved = this.releaseService
      ? await this.releaseService.resolveRuntimeSummary({ storeId: context.storeId, userId: context.userId, roleKey })
      : { mode: undefined, release: null };
    const release = resolved.release as
      | { id?: number; releaseKey?: string; rollout?: Prisma.JsonValue }
      | null
      | undefined;
    const rollout =
      release?.rollout && typeof release.rollout === 'object' && !Array.isArray(release.rollout)
        ? (release.rollout as Record<string, unknown>)
        : {};
    const catalogValidation =
      release?.id && this.releaseService && typeof this.releaseService.validateReleaseCatalog === 'function'
        ? await this.releaseService.validateReleaseCatalog(release.id)
        : null;

    return {
      configured,
      effective: {
        mode: resolved.mode ?? configured?.cognitionMode ?? 'rules',
        releaseId: release?.id ?? null,
        releaseKey: release?.releaseKey ?? null,
        stage: typeof rollout.stage === 'string' ? rollout.stage : null,
        userPercentage: Number.isFinite(Number(rollout.userPercentage)) ? Number(rollout.userPercentage) : null,
      },
      catalogValidation,
    };
  }

  @Post('governance/releases/:releaseId/activate')
  @Permissions('core:brain-governance:release')
  activateRelease(@Req() req: Request, @Param('releaseId') releaseId: string) {
    const context = this.contextService.fromGlobalRequest(req, 'Asia/Shanghai');
    if (!this.releaseService) throw new NotFoundException('发布服务不可用');
    return this.releaseService.activateRelease({ releaseId: Number(releaseId), activatedBy: context.userId });
  }

  @Post('governance/releases/:releaseId/rollback')
  @Permissions('core:brain-governance:release')
  rollbackRelease(@Param('releaseId') releaseId: string, @Body() body: { reason?: string }) {
    if (!this.releaseService) throw new NotFoundException('发布服务不可用');
    return this.releaseService.rollbackRelease({
      releaseId: Number(releaseId),
      reason: String(body.reason ?? 'manual_rollback'),
    });
  }

  @Post('governance/releases/:releaseId/rollback-to-rules')
  @Permissions('core:brain-governance:release')
  rollbackReleaseToRules(@Param('releaseId') releaseId: string, @Body() body: { reason?: string }) {
    if (!this.releaseService) throw new NotFoundException('发布服务不可用');
    return this.releaseService.rollbackToRules({
      releaseId: Number(releaseId),
      reason: String(body.reason ?? 'production_baseline_rollback'),
    });
  }

  @Post('governance/releases/:releaseId/rollback-to-baseline')
  @Permissions('core:brain-governance:release')
  rollbackReleaseToBaseline(@Param('releaseId') releaseId: string, @Body() body: { reason?: string }) {
    if (!this.releaseService) throw new NotFoundException('发布服务不可用');
    return this.releaseService.rollbackToProductionBaseline({
      releaseId: Number(releaseId),
      reason: String(body.reason ?? 'production_baseline_rollback'),
    });
  }

  @Post('governance/releases/:releaseId/reject')
  @Permissions('core:brain-governance:release')
  rejectRelease(@Param('releaseId') releaseId: string, @Body() body: { reason?: string }) {
    if (!this.releaseService) throw new NotFoundException('发布服务不可用');
    return this.releaseService.rejectRelease({
      releaseId: Number(releaseId),
      reason: String(body.reason ?? 'governance_rejected'),
    });
  }

  @Post('governance/releases/:releaseId/modification-requirements')
  @Permissions('core:brain-governance:manage')
  submitReleaseModification(
    @Req() req: Request,
    @Param('releaseId') releaseId: string,
    @Body() body: { requirement?: string },
  ) {
    const context = this.contextService.fromGlobalRequest(req, 'Asia/Shanghai');
    if (!this.governanceApprovalService) throw new NotFoundException('治理审批服务不可用');
    return this.governanceApprovalService.submitModificationRequirement({
      releaseId: Number(releaseId),
      requirement: String(body.requirement ?? ''),
      createdBy: context.userId,
    });
  }

  @Get('governance/regeneration-jobs')
  @Permissions('core:brain-governance:view')
  listCapabilityRegenerationJobs(@Query('releaseId') releaseId?: string) {
    if (!this.capabilityRegenerationService) throw new NotFoundException('能力再生成服务不可用');
    return this.capabilityRegenerationService.listPublicJobs(releaseId ? Number(releaseId) : undefined);
  }

  @Get('governance/regeneration-jobs/:id')
  @Permissions('core:brain-governance:view')
  getCapabilityRegenerationJob(@Param('id') id: string) {
    if (!this.capabilityRegenerationService) throw new NotFoundException('能力再生成服务不可用');
    return this.capabilityRegenerationService.getPublicJob(Number(id));
  }

  @Post('governance/regeneration-jobs/:id/retry')
  @Permissions('core:brain-governance:manage')
  retryCapabilityRegenerationJob(@Param('id') id: string) {
    if (!this.capabilityRegenerationService) throw new NotFoundException('能力再生成服务不可用');
    return this.capabilityRegenerationService.retryJob(Number(id));
  }

  @Post('feedback')
  @Permissions('core:brain:use')
  createFeedback(@Req() req: Request, @Body() dto: CreateBrainFeedbackDto) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    if (this.feedbackService) {
      return this.feedbackService.createFeedback({
        runId: dto.runId,
        userId: context.userId,
        storeId: context.storeId,
        rating: dto.rating,
        correction: dto.correction as Prisma.InputJsonValue | undefined,
      });
    }

    return { status: 'open', runId: dto.runId, rating: dto.rating, storeId: context.storeId };
  }

  @Get('feedback/issues')
  @Permissions('core:brain:use')
  listFeedbackIssues(@Req() req: Request, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    if (this.feedbackService) {
      return this.feedbackService.listUserIssues({
        storeId: context.storeId,
        userId: context.userId,
        page: Number(page),
        pageSize: Number(pageSize),
      });
    }

    return {
      items: [],
      total: 0,
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.max(1, Number(pageSize) || 10),
      storeId: context.storeId,
    };
  }

  @Get('governance/feedback')
  @Permissions('core:brain-governance:view')
  async listFeedback(@Req() req: Request) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    return { items: this.feedbackService ? await this.feedbackService.listFeedback({ storeId: context.storeId }) : [] };
  }

  @Get('governance/dashboard')
  @Permissions('core:brain-governance:view')
  getGovernanceDashboard(@Req() req: Request) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    return this.feedbackService?.getDashboard({ storeId: context.storeId }) ?? {};
  }

  private createGovernanceDraft(
    req: Request,
    resourceType: BrainGovernanceResourceType,
    resourceKey: string,
    payload: Record<string, unknown>,
  ) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    if (!this.governanceResourceService) throw new NotFoundException('治理资源服务不可用');
    return this.governanceResourceService.createDraft({
      resourceType,
      resourceKey,
      payload,
      createdBy: context.userId,
    });
  }

  private semanticResourceType(resource: string): BrainGovernanceResourceType {
    if (resource === 'metrics') return 'metric';
    if (resource === 'entities') return 'ontology_entity';
    if (resource === 'relations') return 'ontology_relation';
    throw new NotFoundException(`不支持的语义资源：${resource}`);
  }

  private semanticGovernanceResourceType(resource: string): BrainSemanticGovernanceResourceType {
    if (resource === 'actions') return 'action';
    return this.semanticResourceType(resource) as BrainSemanticGovernanceResourceType;
  }

  private resourceKey(resourceType: BrainGovernanceResourceType, body: Record<string, unknown>) {
    const field =
      resourceType === 'metric'
        ? 'metricKey'
        : resourceType === 'ontology_entity'
          ? 'entityKey'
          : resourceType === 'ontology_relation'
            ? 'relationKey'
            : resourceType === 'agent_profile'
              ? 'roleKey'
              : resourceType === 'skill'
                ? 'skillKey'
                : 'ruleKey';
    return String(body[field] ?? '');
  }
}
