import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { BrainContextService } from './context/brain-context.service.js';
import { ConfirmBrainActionDto, CreateBrainConversationDto, SendBrainMessageDto } from './dto/brain-chat.dto.js';
import { CreateBrainFeedbackDto } from './dto/brain-governance.dto.js';
import { BrainEvalService } from './governance/brain-eval.service.js';
import { BrainFeedbackService } from './governance/brain-feedback.service.js';
import { BrainReleaseService } from './governance/brain-release.service.js';
import { BrainTraceService } from './governance/brain-trace.service.js';
import { BrainInspectionService } from './inspection/brain-inspection.service.js';
import { BrainAgentProfileService } from './orchestrator/brain-agent-profile.service.js';
import { BrainKnowledgeGraphService } from './semantic/brain-knowledge-graph.service.js';
import { BrainMetricRegistryService } from './semantic/brain-metric-registry.service.js';
import { BrainOntologyService } from './semantic/brain-ontology.service.js';
import { BrainSkillRegistryService } from './skills/brain-skill-registry.service.js';

@UseGuards(JwtAuthGuard)
@Controller('brain')
export class BrainController {
  constructor(
    private readonly contextService: BrainContextService,
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
  ) {}

  @Post('conversations')
  @Permissions('core:brain:use')
  createConversation(@Req() req: Request, @Body() dto: CreateBrainConversationDto) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    return { id: 0, title: dto.title ?? '新会话', storeId: context.storeId };
  }

  @Get('conversations')
  @Permissions('core:brain:use')
  listConversations(@Req() req: Request) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    return { items: [], total: 0, storeId: context.storeId };
  }

  @Post('conversations/:id/messages')
  @Permissions('core:brain:use')
  sendMessage(@Req() req: Request, @Param('id') id: string, @Body() dto: SendBrainMessageDto) {
    const context = this.contextService.fromRequest(req, dto.timezone ?? 'Asia/Shanghai');
    return {
      conversationId: Number(id),
      runId: 0,
      status: 'queued',
      answer: '',
      citations: [],
      suggestedActions: [],
      contextStoreId: context.storeId,
    };
  }

  @Get('conversations/:id/messages')
  @Permissions('core:brain:use')
  listMessages(@Req() req: Request, @Param('id') id: string) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    return { conversationId: Number(id), items: [], total: 0, storeId: context.storeId };
  }

  @Get('runs/:runId/events')
  @Permissions('core:brain:use')
  getRunEvents(@Param('runId') runId: string) {
    return { runId: Number(runId), events: [] };
  }

  @Post('actions/:actionId/confirm')
  @Permissions('core:brain:execute')
  confirmAction(@Req() req: Request, @Param('actionId') actionId: string, @Body() dto: ConfirmBrainActionDto) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    return { actionId, runId: dto.runId, status: 'confirmed', storeId: context.storeId };
  }

  @Post('actions/:actionId/reject')
  @Permissions('core:brain:execute')
  rejectAction(@Req() req: Request, @Param('actionId') actionId: string, @Body() dto: ConfirmBrainActionDto) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    return { actionId, runId: dto.runId, status: 'rejected', storeId: context.storeId };
  }

  @Get('governance/traces')
  @Permissions('core:brain-governance:view')
  async listTraces() {
    if (!this.traceService?.listTraces) {
      return { items: [], total: 0 };
    }

    return this.traceService.listTraces();
  }

  @Get('governance/traces/:runId')
  @Permissions('core:brain-governance:view')
  getTrace(@Param('runId') runId: string) {
    if (!this.traceService) {
      return null;
    }
    return this.traceService.getRunTrace(Number(runId));
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
  createSemanticResource(@Param('resource') resource: string, @Body() body: Record<string, unknown>) {
    return { resource, status: 'draft_created', payload: body };
  }

  @Patch('governance/semantic/:resource/:key')
  @Permissions('core:brain-governance:manage')
  updateSemanticResource(
    @Param('resource') resource: string,
    @Param('key') key: string,
    @Body() body: Record<string, unknown>,
  ) {
    return { resource, key, status: 'draft_updated', payload: body };
  }

  @Get('governance/roles')
  @Permissions('core:brain-governance:view')
  async listRoleProfiles() {
    return { items: this.agentProfileService ? await this.agentProfileService.listActiveProfiles() : [] };
  }

  @Post('governance/roles')
  @Permissions('core:brain-governance:manage')
  createRoleProfile(@Body() body: Record<string, unknown>) {
    return { status: 'draft_created', payload: body };
  }

  @Patch('governance/roles/:roleKey')
  @Permissions('core:brain-governance:manage')
  updateRoleProfile(@Param('roleKey') roleKey: string, @Body() body: Record<string, unknown>) {
    return { roleKey, status: 'draft_updated', payload: body };
  }

  @Get('governance/skills')
  @Permissions('core:brain-governance:view')
  async listSkills() {
    return { items: this.skillRegistryService ? await this.skillRegistryService.listEnabledSkills() : [] };
  }

  @Post('governance/skills')
  @Permissions('core:brain-governance:manage')
  createSkill(@Body() body: Record<string, unknown>) {
    return { status: 'draft_created', payload: body };
  }

  @Patch('governance/skills/:skillKey')
  @Permissions('core:brain-governance:manage')
  updateSkill(@Param('skillKey') skillKey: string, @Body() body: Record<string, unknown>) {
    return { skillKey, status: 'draft_updated', payload: body };
  }

  @Get('governance/inspection-rules')
  @Permissions('core:brain-governance:view')
  async listInspectionRules() {
    if (!this.inspectionService) {
      return { items: [] };
    }

    return { items: await this.inspectionService.listRules() };
  }

  @Post('governance/inspection-rules')
  @Permissions('core:brain-governance:manage')
  createInspectionRule(@Body() body: Record<string, unknown>) {
    return { status: 'draft_created', payload: body };
  }

  @Patch('governance/inspection-rules/:ruleKey')
  @Permissions('core:brain-governance:manage')
  updateInspectionRule(@Param('ruleKey') ruleKey: string, @Body() body: Record<string, unknown>) {
    return { ruleKey, status: 'draft_updated', payload: body };
  }

  @Post('governance/evals/runs')
  @Permissions('core:brain-governance:manage')
  createEvalRun(@Body() body: { releaseId?: string; caseKeys?: string[] }) {
    return {
      status: 'queued',
      releaseId: body.releaseId,
      caseCount: body.caseKeys?.length ?? 0,
      summary: this.evalService?.summarizeResults([]),
    };
  }

  @Post('governance/releases')
  @Permissions('core:brain-governance:manage')
  createRelease(@Req() req: Request, @Body() body: Record<string, unknown>) {
    const context = this.contextService.fromRequest(req, 'Asia/Shanghai');
    return {
      status: 'draft',
      releaseKey: body.releaseKey,
      createdBy: context.userId,
      rollbackPlan: this.releaseService?.buildRollbackPlan(String(body.releaseKey ?? ''), 'previous_stable'),
    };
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
}
