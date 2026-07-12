import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { BrainChatService } from './brain-chat.service.js';
import { BrainContextService } from './context/brain-context.service.js';
import { ConfirmBrainActionDto, CreateBrainConversationDto, SendBrainMessageDto } from './dto/brain-chat.dto.js';
import { CreateBrainFeedbackDto } from './dto/brain-governance.dto.js';
import { BrainEvalService } from './governance/brain-eval.service.js';
import { BrainFeedbackService } from './governance/brain-feedback.service.js';
import { BrainReleaseService } from './governance/brain-release.service.js';
import { BrainTraceService } from './governance/brain-trace.service.js';
import { BrainGovernanceResourceService, type BrainGovernanceResourceType } from './governance/brain-governance-resource.service.js';
import { BrainInspectionService } from './inspection/brain-inspection.service.js';
import { BrainAgentProfileService } from './orchestrator/brain-agent-profile.service.js';
import { BrainKnowledgeGraphService } from './semantic/brain-knowledge-graph.service.js';
import { BrainMetricRegistryService } from './semantic/brain-metric-registry.service.js';
import { BrainOntologyService } from './semantic/brain-ontology.service.js';
import { BrainActionConfirmationService } from './skills/brain-action-confirmation.service.js';
import { BrainSkillRegistryService } from './skills/brain-skill-registry.service.js';
import { BrainMemoryService } from './memory/brain-memory.service.js';

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
  ) {}

  @Post('conversations')
  @Permissions('core:brain:use')
  createConversation(@Req() req: Request, @Body() dto: CreateBrainConversationDto) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    return this.chatService.createConversation(context, dto);
  }

  @Get('conversations')
  @Permissions('core:brain:use')
  listConversations(@Req() req: Request) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    return this.chatService.listConversations(context);
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

    emit('run_started', { conversationId, transport: 'sse', answerMode: 'buffered_chunks' });
    try {
      let answerEmitted = false;
      const emitAnswer = (result: { runId: number; answer: string; suggestedActions?: unknown[] }) => {
        if (answerEmitted) return;
        answerEmitted = true;
        emit('step', { conversationId, runId: result.runId, stepKey: 'answer_ready', status: 'completed' });
        for (const action of result.suggestedActions ?? []) {
          emit('action_preview', { conversationId, runId: result.runId, action });
        }
        const chunks = result.answer.match(/[\s\S]{1,24}/g) ?? [];
        for (const delta of chunks) emit('answer_delta', { conversationId, runId: result.runId, delta });
      };
      const result = await this.chatService.sendMessage(context, conversationId, dto, { onAnswerReady: emitAnswer });
      emitAnswer(result);
      emit('completed', result as unknown as Record<string, unknown>);
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

  @Post('governance/semantic/:resource')
  @Permissions('core:brain-governance:manage')
  createSemanticResource(@Req() req: Request, @Param('resource') resource: string, @Body() body: Record<string, unknown>) {
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
    return this.memoryService?.listForGovernance({
      storeId: context.storeId,
      userId: context.userId,
      includeDeleted: true,
    }) ?? { items: [], total: 0 };
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
  async listSkills() {
    return { items: this.skillRegistryService ? await this.skillRegistryService.listEnabledSkills() : [] };
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
  @Permissions('core:brain:use')
  async listInspectionFindings(@Req() req: Request, @Query('status') status?: string) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    if (!this.inspectionService) return { items: [] };
    return { items: await this.inspectionService.listFindings({ storeId: context.storeId, status }) };
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
  async listResourceVersions(@Query('resourceType') resourceType?: string, @Query('status') status?: string) {
    return { items: this.governanceResourceService ? await this.governanceResourceService.listVersions({ resourceType, status }) : [] };
  }

  @Patch('governance/resource-versions/:id/status')
  @Permissions('core:brain-governance:manage')
  changeResourceVersionStatus(@Param('id') id: string, @Body() body: { status: 'draft' | 'active' | 'disabled' | 'archived' }) {
    if (!this.governanceResourceService) throw new NotFoundException('治理资源服务不可用');
    return this.governanceResourceService.changeStatus({ id: Number(id), status: body.status });
  }

  @Post('governance/evals/runs')
  @Permissions('core:brain-governance:manage')
  createEvalRun(@Req() req: Request, @Body() body: { releaseId?: number; caseKeys?: string[]; roleKey?: string; modelVersion?: string }) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    if (!this.evalService) throw new NotFoundException('评测服务不可用');
    return this.evalService.createEvalRun({
      storeId: context.storeId,
      userId: context.userId,
      permissions: context.permissions.filter((permission) => !context.deniedPermissions.includes(permission)),
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

  @Get('governance/evals/runs/:evalRunId')
  @Permissions('core:brain-governance:view')
  getEvalRun(@Req() req: Request, @Param('evalRunId') evalRunId: string) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    return this.evalService?.getRun({ storeId: context.storeId, evalRunId: Number(evalRunId) }) ?? null;
  }

  @Post('governance/releases')
  @Permissions('core:brain-governance:manage')
  createRelease(@Req() req: Request, @Body() body: { releaseKey?: string; scope?: string; rollout?: Record<string, unknown>; resourceVersionIds?: number[] }) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    if (!this.releaseService) throw new NotFoundException('发布服务不可用');
    return this.releaseService.createRelease({
      releaseKey: String(body.releaseKey ?? ''),
      scope: String(body.scope ?? 'global'),
      rollout: body.rollout ?? {},
      resourceVersionIds: body.resourceVersionIds ?? [],
      createdBy: context.userId,
    });
  }

  @Get('governance/releases')
  @Permissions('core:brain-governance:view')
  async listReleases() {
    return { items: this.releaseService ? await this.releaseService.listReleases() : [] };
  }

  @Post('governance/releases/:releaseId/activate')
  @Permissions('core:brain-governance:manage')
  activateRelease(@Req() req: Request, @Param('releaseId') releaseId: string) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    if (!this.releaseService) throw new NotFoundException('发布服务不可用');
    return this.releaseService.activateRelease({ releaseId: Number(releaseId), activatedBy: context.userId });
  }

  @Post('governance/releases/:releaseId/rollback')
  @Permissions('core:brain-governance:manage')
  rollbackRelease(@Param('releaseId') releaseId: string, @Body() body: { reason?: string }) {
    if (!this.releaseService) throw new NotFoundException('发布服务不可用');
    return this.releaseService.rollbackRelease({ releaseId: Number(releaseId), reason: String(body.reason ?? 'manual_rollback') });
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
    return this.governanceResourceService.createDraft({ resourceType, resourceKey, payload, createdBy: context.userId });
  }

  private semanticResourceType(resource: string): BrainGovernanceResourceType {
    if (resource === 'metrics') return 'metric';
    if (resource === 'entities') return 'ontology_entity';
    if (resource === 'relations') return 'ontology_relation';
    throw new NotFoundException(`不支持的语义资源：${resource}`);
  }

  private resourceKey(resourceType: BrainGovernanceResourceType, body: Record<string, unknown>) {
    const field = resourceType === 'metric'
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
