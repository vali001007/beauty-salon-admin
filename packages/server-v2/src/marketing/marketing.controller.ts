import { BadRequestException, Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, ParseIntPipe, Headers, Patch, Header, Logger, ServiceUnavailableException, applyDecorators } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MarketingService } from './marketing.service.js';
import { MarketingPredictionRunService } from './prediction/marketing-prediction-run.service.js';
import { MarketingRecommendationQueryService } from './recommendation/marketing-recommendation-query.service.js';
import { MarketingRecommendationOrchestratorService } from './recommendation/marketing-recommendation-orchestrator.service.js';
import { MarketingFeatureFlagsService } from './marketing-feature-flags.service.js';
import { MarketingRecommendationAdoptionService, type AdoptRecommendationInstanceRequest } from './recommendation/marketing-recommendation-adoption.service.js';
import { TerminalService } from '../terminal/terminal.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import {
  AssignTerminalFollowUpTaskDto,
  BatchCreateTerminalFollowUpTaskDto,
  CancelTerminalFollowUpTaskDto,
  QueryTerminalFollowUpTasksDto,
} from '../terminal/dto/index.js';

const LEGACY_RECOMMENDATION_SUNSET = '2026-09-30';

function LegacyRecommendationApi(successor = '/marketing/recommendation-instances') {
  return applyDecorators(
    Header('Deprecation', 'true'),
    Header('Sunset', LEGACY_RECOMMENDATION_SUNSET),
    Header('Link', `<${successor}>; rel="successor-version"`),
  );
}

@ApiTags('Marketing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('marketing')
export class MarketingController {
  private readonly logger = new Logger(MarketingController.name);

  constructor(
    private marketingService: MarketingService,
    private terminalService: TerminalService,
    private predictionRunService: MarketingPredictionRunService,
    private recommendationQueryService: MarketingRecommendationQueryService,
    private recommendationOrchestrator: MarketingRecommendationOrchestratorService,
    private recommendationAdoptionService: MarketingRecommendationAdoptionService,
    private marketingFeatureFlags: MarketingFeatureFlagsService,
  ) {}

  private requireStoreId(storeId?: string) {
    const parsed = Number(storeId);
    if (!Number.isInteger(parsed) || parsed <= 0) throw new BadRequestException('X-Store-Id is required');
    return parsed;
  }

  private warnLegacyRoute(route: string, storeId: number, successor = '/marketing/recommendation-instances') {
    this.logger.warn(
      `legacy_marketing_recommendation_api route=${route} storeId=${storeId} successor=${successor} sunset=${LEGACY_RECOMMENDATION_SUNSET}`,
    );
  }

  private featureEnabled(flag: 'recommendationInstanceWrite' | 'recommendationInstanceRead' | 'recommendationAdoptionV2', storeId: number) {
    return this.marketingFeatureFlags.isEnabledForStore(flag, storeId);
  }

  private requireFeature(flag: 'recommendationInstanceWrite' | 'recommendationInstanceRead' | 'recommendationAdoptionV2', storeId: number) {
    if (!this.featureEnabled(flag, storeId)) {
      throw new ServiceUnavailableException(`${flag}_not_enabled_for_store`);
    }
  }

  private managementUiV2Enabled(storeId: number) {
    return this.featureEnabled('recommendationInstanceRead', storeId)
      && this.featureEnabled('recommendationAdoptionV2', storeId);
  }

  // Recommendations
  @Get('recommendations')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '获取营销推荐列表' })
  @LegacyRecommendationApi()
  getRecommendations(
    @Headers('x-store-id') storeId?: string,
    @Query('scope') scope?: string,
    @Query('type') type?: string,
    @Query('limit') limit?: string,
    @Query('refresh') refresh?: string,
  ) {
    const scopedStoreId = this.requireStoreId(storeId);
    this.warnLegacyRoute('GET /marketing/recommendations', scopedStoreId);
    if (this.managementUiV2Enabled(scopedStoreId)) {
      return this.recommendationQueryService.findLegacy(scopedStoreId, {
        sourceType: ['prediction', 'lifecycle', 'product_project'].includes(String(type)) ? type : undefined,
        page: 1,
        pageSize: limit ? Number(limit) : 20,
      });
    }
    return this.marketingService.getRecommendations(scopedStoreId, {
      scope,
      type,
      limit: limit ? Number(limit) : undefined,
      refresh: refresh === 'true',
    });
  }

  @Get('recommendations/:id/audience')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '获取营销推荐受众' })
  @LegacyRecommendationApi('/marketing/recommendation-instances/:instanceId/audience')
  getRecommendationAudience(@Param('id', ParseIntPipe) id: number, @Headers('x-store-id') storeId?: string) {
    const scopedStoreId = this.requireStoreId(storeId);
    this.warnLegacyRoute('GET /marketing/recommendations/:id/audience', scopedStoreId, '/marketing/recommendation-instances/:instanceId/audience');
    return this.marketingService.getRecommendationAudience(id, scopedStoreId);
  }

  @Post('recommendations')
  @Permissions('core:marketing:create')
  @ApiOperation({ summary: '创建营销推荐' })
  @LegacyRecommendationApi()
  createRecommendation(@Body() dto: any, @Headers('x-store-id') storeId?: string) {
    const scopedStoreId = this.requireStoreId(storeId);
    this.warnLegacyRoute('POST /marketing/recommendations', scopedStoreId);
    return this.marketingService.createRecommendation(dto, scopedStoreId);
  }

  @Put('recommendations/:id')
  @Permissions('core:marketing:update')
  @ApiOperation({ summary: '更新营销推荐' })
  @LegacyRecommendationApi()
  updateRecommendation(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @Headers('x-store-id') storeId?: string) {
    const scopedStoreId = this.requireStoreId(storeId);
    this.warnLegacyRoute('PUT /marketing/recommendations/:id', scopedStoreId);
    return this.marketingService.updateRecommendation(id, dto, scopedStoreId);
  }

  @Delete('recommendations/:id')
  @Permissions('core:marketing:delete')
  @ApiOperation({ summary: '删除营销推荐' })
  @LegacyRecommendationApi()
  deleteRecommendation(@Param('id', ParseIntPipe) id: number, @Headers('x-store-id') storeId?: string) {
    const scopedStoreId = this.requireStoreId(storeId);
    this.warnLegacyRoute('DELETE /marketing/recommendations/:id', scopedStoreId);
    return this.marketingService.deleteRecommendation(id, scopedStoreId);
  }

  @Post('recommendations/:id/adopt')
  @Permissions('core:marketing:create')
  @ApiOperation({ summary: '采纳营销推荐' })
  @LegacyRecommendationApi('/marketing/recommendation-instances/:instanceId/adoptions')
  adoptRecommendation(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: any,
    @Headers('x-store-id') storeId?: string,
    @CurrentUser('id') userId?: number,
  ) {
    const scopedStoreId = this.requireStoreId(storeId);
    this.warnLegacyRoute('POST /marketing/recommendations/:id/adopt', scopedStoreId, '/marketing/recommendation-instances/:instanceId/adoptions');
    const { storeId: _ignoredStoreId, ...scopedDto } = dto ?? {};
    if (this.marketingFeatureFlags.isEnabledForStore('recommendationAdoptionV2', scopedStoreId)) {
      return this.recommendationAdoptionService.resolveLegacyInstance(id, scopedStoreId)
        .then((instanceId) => this.recommendationAdoptionService.adopt(instanceId, scopedStoreId, scopedDto, userId));
    }
    return this.marketingService.adoptRecommendation(id, scopedStoreId, scopedDto);
  }

  @Post('recommendations/:id/adoptions')
  @Permissions('core:marketing:create')
  @ApiOperation({ summary: '在当前门店事务化采纳营销推荐' })
  @LegacyRecommendationApi('/marketing/recommendation-instances/:instanceId/adoptions')
  adoptRecommendationTransaction(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: any,
    @Headers('x-store-id') storeId?: string,
    @CurrentUser('id') userId?: number,
  ) {
    const scopedStoreId = this.requireStoreId(storeId);
    this.warnLegacyRoute('POST /marketing/recommendations/:id/adoptions', scopedStoreId, '/marketing/recommendation-instances/:instanceId/adoptions');
    const { storeId: _ignoredStoreId, ...scopedDto } = dto ?? {};
    if (!this.marketingFeatureFlags.isEnabledForStore('recommendationAdoptionV2', scopedStoreId)) {
      return this.marketingService.adoptRecommendation(id, scopedStoreId, scopedDto);
    }
    return this.recommendationAdoptionService.resolveLegacyInstance(id, scopedStoreId)
      .then((instanceId) => this.recommendationAdoptionService.adopt(instanceId, scopedStoreId, scopedDto, userId));
  }

  @Post('recommendations/:id/activity-draft')
  @Permissions('core:marketing:create')
  @ApiOperation({ summary: '根据推荐生成活动草稿' })
  @LegacyRecommendationApi('/marketing/recommendation-instances/:instanceId/adoptions')
  createRecommendationActivityDraft(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-store-id') storeId?: string,
    @CurrentUser('id') userId?: number,
  ) {
    const scopedStoreId = this.requireStoreId(storeId);
    this.warnLegacyRoute('POST /marketing/recommendations/:id/activity-draft', scopedStoreId, '/marketing/recommendation-instances/:instanceId/adoptions');
    if (this.marketingFeatureFlags.isEnabledForStore('recommendationAdoptionV2', scopedStoreId)) {
      return this.recommendationAdoptionService.resolveLegacyInstance(id, scopedStoreId)
        .then((instanceId) => this.recommendationAdoptionService.adopt(instanceId, scopedStoreId, {
          mode: 'activity',
          clientRequestId: `legacy-activity-draft-${id}`,
          activity: { publishPage: false },
        }, userId));
    }
    return this.marketingService.createRecommendationActivityDraft(id, scopedStoreId);
  }

  @Post('recommendations/:id/automation-draft')
  @Permissions('core:marketing:create')
  @ApiOperation({ summary: '根据推荐生成自动营销规则草稿' })
  @LegacyRecommendationApi('/marketing/recommendation-instances/:instanceId/adoptions')
  createRecommendationAutomationDraft(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-store-id') storeId?: string,
    @CurrentUser('id') userId?: number,
  ) {
    const scopedStoreId = this.requireStoreId(storeId);
    this.warnLegacyRoute('POST /marketing/recommendations/:id/automation-draft', scopedStoreId, '/marketing/recommendation-instances/:instanceId/adoptions');
    if (this.marketingFeatureFlags.isEnabledForStore('recommendationAdoptionV2', scopedStoreId)) {
      return this.recommendationAdoptionService.resolveLegacyInstance(id, scopedStoreId)
        .then((instanceId) => this.recommendationAdoptionService.adopt(instanceId, scopedStoreId, {
          mode: 'automation',
          clientRequestId: `legacy-automation-draft-${id}`,
        }, userId));
    }
    return this.marketingService.createRecommendationAutomationDraft(id, scopedStoreId);
  }

  @Post('recommendations/:id/follow-up-tasks')
  @Permissions('core:marketing:create')
  @ApiOperation({ summary: '根据推荐批量下发终端跟进任务' })
  @LegacyRecommendationApi('/marketing/recommendation-instances/:instanceId/adoptions')
  async createRecommendationFollowUpTasks(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: BatchCreateTerminalFollowUpTaskDto,
    @Headers('x-store-id') storeId?: string,
    @CurrentUser('id') userId?: number,
  ) {
    const scopedStoreId = this.requireStoreId(storeId);
    this.warnLegacyRoute('POST /marketing/recommendations/:id/follow-up-tasks', scopedStoreId, '/marketing/recommendation-instances/:instanceId/adoptions');
    if (this.marketingFeatureFlags.isEnabledForStore('recommendationAdoptionV2', scopedStoreId)) {
      const customerKey = [...new Set(dto.customerIds.map(Number))].sort((left, right) => left - right).join('-');
      const instanceId = await this.recommendationAdoptionService.resolveLegacyInstance(id, scopedStoreId);
      return this.recommendationAdoptionService.adopt(instanceId, scopedStoreId, {
        mode: 'terminal_follow_up',
        clientRequestId: `legacy-follow-up-${id}-${customerKey}`,
        customerIds: dto.customerIds,
        assignments: dto.assignments as any,
      }, userId);
    }
    return this.marketingService.adoptRecommendation(id, scopedStoreId, {
      mode: 'terminal_follow_up',
      customerIds: dto.customerIds,
      assignments: dto.assignments,
    });
  }

  @Get('follow-up-tasks')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '查询终端跟进任务' })
  getFollowUpTasks(@Query() query: QueryTerminalFollowUpTasksDto, @Headers('x-store-id') storeId?: string) {
    return this.terminalService.getFollowUpTasks(this.requireStoreId(storeId), query);
  }

  @Get('follow-up-tasks/summary')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '终端跟进任务统计' })
  async getFollowUpTaskSummary(@Headers('x-store-id') storeId?: string) {
    const result = await this.terminalService.getFollowUpTasks(this.requireStoreId(storeId), { page: 1, pageSize: 1 });
    return result.summary;
  }

  @Patch('follow-up-tasks/:id/assign')
  @Permissions('core:marketing:update')
  @ApiOperation({ summary: '改派终端跟进任务' })
  assignFollowUpTask(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignTerminalFollowUpTaskDto,
    @Headers('x-store-id') storeId?: string,
  ) {
    return this.terminalService.assignFollowUpTask(this.requireStoreId(storeId), id, dto);
  }

  @Patch('follow-up-tasks/:id/cancel')
  @Permissions('core:marketing:update')
  @ApiOperation({ summary: '取消终端跟进任务' })
  cancelFollowUpTask(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelTerminalFollowUpTaskDto,
    @Headers('x-store-id') storeId?: string,
  ) {
    return this.terminalService.cancelFollowUpTask(this.requireStoreId(storeId), id, dto.note);
  }

  @Post('customer-events')
  @Permissions('core:marketing:create')
  @ApiOperation({ summary: '写入客户小程序/营销行为事件' })
  recordCustomerBehaviorEvent(@Body() dto: any, @Headers('x-store-id') storeId?: string) {
    return this.marketingService.recordCustomerBehaviorEvent(this.requireStoreId(storeId), dto);
  }

  @Post('lifecycle/rebuild')
  @Permissions('core:marketing:analytics')
  @ApiOperation({ summary: '重建客户生命周期小本体快照和机会' })
  rebuildLifecycleOntology(
    @Headers('x-store-id') headerStoreId?: string,
    @Body() dto: { storeId?: number; predictionRunId?: number; includeServiceCycles?: boolean; includeFulfillmentChecks?: boolean; includeAttribution?: boolean } = {},
  ) {
    const scopedStoreId = this.requireStoreId(headerStoreId);
    return this.marketingService.rebuildLifecycleOntology(scopedStoreId, dto.predictionRunId ? Number(dto.predictionRunId) : undefined, {
      includeServiceCycles: dto.includeServiceCycles,
      includeFulfillmentChecks: dto.includeFulfillmentChecks,
      includeAttribution: dto.includeAttribution,
    });
  }

  @Get('recommendation-instances')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '分页获取当前门店的持久化推荐实例' })
  findRecommendationInstances(
    @Headers('x-store-id') storeId?: string,
    @Query('sourceType') sourceType?: string,
    @Query('priority') priority?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const scopedStoreId = this.requireStoreId(storeId);
    this.requireFeature('recommendationInstanceRead', scopedStoreId);
    return this.recommendationQueryService.findMany(scopedStoreId, {
      sourceType,
      priority,
      status,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('recommendation-workspace')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '按门店灰度返回智能推荐工作台数据' })
  async getRecommendationWorkspace(
    @Headers('x-store-id') storeId?: string,
    @Query('sourceType') sourceType?: string,
    @Query('priority') priority?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('refresh') refresh?: string,
  ) {
    const scopedStoreId = this.requireStoreId(storeId);
    const normalizedPage = page ? Number(page) : 1;
    const normalizedPageSize = pageSize ? Number(pageSize) : 50;
    if (this.managementUiV2Enabled(scopedStoreId)) {
      if (refresh === 'true') {
        this.requireFeature('recommendationInstanceWrite', scopedStoreId);
        await this.recommendationOrchestrator.refreshForStore(scopedStoreId);
      }
      const response = await this.recommendationQueryService.findMany(scopedStoreId, {
        sourceType,
        priority,
        status,
        page: normalizedPage,
        pageSize: normalizedPageSize,
      });
      return { mode: 'v2' as const, ...response };
    }

    const [items, coverage] = await Promise.all([
      this.marketingService.getRecommendations(scopedStoreId, {
        type: sourceType,
        limit: normalizedPageSize,
        refresh: refresh === 'true',
      }),
      this.marketingService.getRecommendationCoverage(scopedStoreId),
    ]);
    const list = Array.isArray(items) ? items : [];
    return {
      mode: 'legacy' as const,
      items: list,
      total: list.length,
      page: normalizedPage,
      pageSize: normalizedPageSize,
      coverage,
    };
  }

  @Get('recommendation-instances/:instanceId')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '获取当前门店的推荐实例详情' })
  getRecommendationInstance(
    @Param('instanceId') instanceId: string,
    @Headers('x-store-id') storeId?: string,
  ) {
    const scopedStoreId = this.requireStoreId(storeId);
    this.requireFeature('recommendationInstanceRead', scopedStoreId);
    return this.recommendationQueryService.getById(instanceId, scopedStoreId);
  }

  @Get('recommendation-instances/:instanceId/audience')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '分页获取推荐实例的持久化受众快照' })
  getRecommendationInstanceAudience(
    @Param('instanceId') instanceId: string,
    @Headers('x-store-id') storeId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const scopedStoreId = this.requireStoreId(storeId);
    this.requireFeature('recommendationInstanceRead', scopedStoreId);
    return this.recommendationQueryService.getAudience(instanceId, scopedStoreId, {
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Post('recommendation-instances/refresh')
  @Permissions('core:marketing:analytics')
  @ApiOperation({ summary: '为当前门店生成或复用推荐实例' })
  refreshRecommendationInstances(@Headers('x-store-id') storeId?: string) {
    const scopedStoreId = this.requireStoreId(storeId);
    this.requireFeature('recommendationInstanceWrite', scopedStoreId);
    return this.recommendationOrchestrator.refreshForStore(scopedStoreId);
  }

  @Get('recommendation-capabilities')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '获取当前门店的智能推荐灰度能力' })
  getRecommendationCapabilities(@Headers('x-store-id') storeId?: string) {
    const scopedStoreId = this.requireStoreId(storeId);
    const recommendationInstanceWrite = this.featureEnabled('recommendationInstanceWrite', scopedStoreId);
    const recommendationInstanceRead = this.featureEnabled('recommendationInstanceRead', scopedStoreId);
    const recommendationAdoptionV2 = this.featureEnabled('recommendationAdoptionV2', scopedStoreId);
    return {
      recommendationInstanceWrite,
      recommendationInstanceRead,
      recommendationAdoptionV2,
      managementUiV2: recommendationInstanceRead && recommendationAdoptionV2,
    };
  }

  @Post('recommendation-instances/:instanceId/adoptions')
  @Permissions('core:marketing:create')
  @ApiOperation({ summary: '事务化采纳当前门店的持久化推荐实例' })
  adoptRecommendationInstance(
    @Param('instanceId') instanceId: string,
    @Body() dto: AdoptRecommendationInstanceRequest,
    @Headers('x-store-id') storeId?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
    @CurrentUser('id') userId?: number,
  ) {
    const scopedStoreId = this.requireStoreId(storeId);
    this.requireFeature('recommendationAdoptionV2', scopedStoreId);
    return this.recommendationAdoptionService.adopt(instanceId, scopedStoreId, {
      ...dto,
      clientRequestId: dto.clientRequestId || idempotencyKey || '',
    }, userId);
  }

  @Get('lifecycle/service-cycles')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '查询客户-项目服务周期状态' })
  getLifecycleServiceCycles(@Query() query: any, @Headers('x-store-id') storeId?: string) {
    return this.marketingService.getLifecycleServiceCycles(query, this.requireStoreId(storeId));
  }

  @Get('lifecycle/opportunities')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '查询客户生命周期机会' })
  getLifecycleOpportunities(@Query() query: any, @Headers('x-store-id') storeId?: string) {
    return this.marketingService.getLifecycleOpportunities(query, this.requireStoreId(storeId));
  }

  @Get('lifecycle/opportunities/:id/fulfillment')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '查询客户生命周期机会承接校验' })
  getLifecycleOpportunityFulfillment(@Param('id', ParseIntPipe) id: number, @Headers('x-store-id') storeId?: string) {
    return this.marketingService.getLifecycleOpportunityFulfillment(id, this.requireStoreId(storeId));
  }

  @Get('lifecycle/attribution')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '查询客户生命周期归因事件' })
  getLifecycleAttribution(@Query() query: any, @Headers('x-store-id') storeId?: string) {
    return this.marketingService.getLifecycleAttribution(query, this.requireStoreId(storeId));
  }

  @Get('lifecycle/quality')
  @Permissions('core:marketing:analytics')
  @ApiOperation({ summary: '查询客户生命周期本体质量快照' })
  getLifecycleQuality(@Headers('x-store-id') storeId?: string) {
    return this.marketingService.getLifecycleQuality(this.requireStoreId(storeId));
  }

  @Get('lifecycle/rules')
  @Permissions('core:marketing:analytics')
  @ApiOperation({ summary: '查询客户生命周期本体规则版本' })
  getLifecycleRules(@Query() query: any, @Headers('x-store-id') storeId?: string) {
    return this.marketingService.getLifecycleRules(query, this.requireStoreId(storeId));
  }

  @Post('lifecycle/rules')
  @Permissions('core:marketing:analytics')
  @ApiOperation({ summary: '创建客户生命周期本体规则草稿' })
  createLifecycleRule(@Body() dto: any, @Headers('x-store-id') storeId?: string) {
    return this.marketingService.createLifecycleRule(dto, this.requireStoreId(storeId));
  }

  @Post('lifecycle/rules/:id/publish')
  @Permissions('core:marketing:analytics')
  @ApiOperation({ summary: '发布客户生命周期本体规则版本' })
  publishLifecycleRule(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any, @Headers('x-store-id') storeId?: string) {
    return this.marketingService.publishLifecycleRule(id, this.requireStoreId(storeId), user?.id ? Number(user.id) : undefined);
  }

  @Post('lifecycle/rules/:id/rollback')
  @Permissions('core:marketing:analytics')
  @ApiOperation({ summary: '回滚客户生命周期本体规则版本' })
  rollbackLifecycleRule(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any, @Headers('x-store-id') storeId?: string) {
    return this.marketingService.rollbackLifecycleRule(id, this.requireStoreId(storeId), user?.id ? Number(user.id) : undefined);
  }

  @Post('lifecycle/business-plans')
  @Permissions('core:marketing:analytics')
  @ApiOperation({ summary: '生成客户生命周期经营计划草稿' })
  createLifecycleBusinessPlan(@Body() dto: any, @Headers('x-store-id') storeId?: string, @CurrentUser() user?: any) {
    return this.marketingService.createLifecycleBusinessPlan(dto, this.requireStoreId(storeId), user?.id ? Number(user.id) : undefined);
  }

  @Post('lifecycle/business-plans/:id/submit-actions')
  @Permissions('core:marketing:analytics')
  @ApiOperation({ summary: '提交经营计划动作进入人工审批' })
  submitLifecycleBusinessPlanActions(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: any,
    @CurrentUser() user: any,
    @Headers('x-store-id') storeId?: string,
  ) {
    return this.marketingService.submitLifecycleBusinessPlanActions(id, this.requireStoreId(storeId), dto, user?.id ? Number(user.id) : undefined);
  }

  @Get('lifecycle/customers/:id')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '获取单客户生命周期上下文' })
  getCustomerLifecycleContext(@Param('id', ParseIntPipe) id: number, @Headers('x-store-id') storeId?: string) {
    return this.marketingService.getCustomerLifecycleContext(id, this.requireStoreId(storeId));
  }

  @Get('invitation-candidates')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '获取客户邀约候选' })
  getInvitationCandidates(
    @Headers('x-store-id') headerStoreId?: string,
    @Query('storeId') _storeId?: number,
    @Query('limit') limit?: number,
  ) {
    const scopedStoreId = this.requireStoreId(headerStoreId);
    return this.marketingService.getInvitationCandidates({ storeId: scopedStoreId, limit: limit ? Number(limit) : undefined });
  }

  @Post('prediction-runs')
  @Permissions('core:marketing:analytics')
  @ApiOperation({ summary: '为当前门店生成或复用业务日预测批次' })
  runPrediction(@Headers('x-store-id') storeId?: string) {
    return this.predictionRunService.runForStore(this.requireStoreId(storeId));
  }

  @Post('predictions/run')
  @Permissions('core:marketing:analytics')
  @ApiOperation({ summary: '兼容入口：为当前门店生成或复用业务日预测批次' })
  runPredictions(@Body() _dto: { storeId?: number }, @Headers('x-store-id') storeId?: string) {
    return this.predictionRunService.runForStore(this.requireStoreId(storeId));
  }

  @Get('predictions/latest')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '获取最新预测批次汇总' })
  getLatestPredictionSummary(@Query('storeId') _storeId?: number, @Headers('x-store-id') storeId?: string) {
    return this.marketingService.getLatestPredictionSummary(this.requireStoreId(storeId));
  }

  @Get('predictions/customers')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '分页获取客户预测快照' })
  findPredictionCustomers(
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('storeId') _storeId?: number,
    @Query('churnLevel') churnLevel?: string,
    @Query('ltvTier') ltvTier?: string,
    @Query('minRepurchaseScore') minRepurchaseScore?: number,
    @Query('minMarketingResponseScore') minMarketingResponseScore?: number,
    @Headers('x-store-id') headerStoreId?: string,
  ) {
    return this.marketingService.findPredictionCustomers({
      page,
      pageSize,
      storeId: this.requireStoreId(headerStoreId),
      churnLevel,
      ltvTier,
      minRepurchaseScore,
      minMarketingResponseScore,
    });
  }

  @Get('predictions/customers/:id')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '获取单客户最新预测快照' })
  getCustomerPrediction(@Param('id', ParseIntPipe) id: number, @Headers('x-store-id') storeId?: string) {
    return this.marketingService.getCustomerPrediction(id, this.requireStoreId(storeId));
  }

  // Activities
  @Get('activities')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '获取营销活动列表' })
  findActivities(@Query('page') page?: number, @Query('pageSize') pageSize?: number, @Query('status') status?: string, @Headers('x-store-id') storeId?: string) {
    return this.marketingService.findActivities({ page, pageSize, status, storeId: this.requireStoreId(storeId) });
  }

  @Get('activities/:id')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '获取营销活动详情' })
  getActivity(@Param('id', ParseIntPipe) id: number, @Headers('x-store-id') storeId?: string) {
    return this.marketingService.getActivityById(id, this.requireStoreId(storeId));
  }

  @Post('activities')
  @Permissions('core:marketing:create')
  @ApiOperation({ summary: '创建营销活动' })
  createActivity(@Body() dto: any, @Headers('x-store-id') storeId?: string) {
    return this.marketingService.createActivity(dto, this.requireStoreId(storeId));
  }

  @Put('activities/:id')
  @Permissions('core:marketing:update')
  @ApiOperation({ summary: '更新营销活动' })
  updateActivity(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @Headers('x-store-id') storeId?: string) {
    return this.marketingService.updateActivity(id, dto, this.requireStoreId(storeId));
  }

  @Delete('activities/:id')
  @Permissions('core:marketing:delete')
  @ApiOperation({ summary: '删除营销活动' })
  deleteActivity(@Param('id', ParseIntPipe) id: number, @Headers('x-store-id') storeId?: string) {
    return this.marketingService.deleteActivity(id, this.requireStoreId(storeId));
  }

  // Automation
  @Get('automation/trigger-options')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '获取触发规则选项' })
  getTriggerOptions() {
    return this.marketingService.getTriggerOptions();
  }

  @Get('automation/rule-templates')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '分页获取自动营销规则库' })
  findRuleTemplates(
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('source') source?: string,
    @Query('category') category?: string,
    @Query('scenario') scenario?: string,
    @Query('priority') priority?: string,
    @Query('status') status?: string,
    @Query('keyword') keyword?: string,
    @Headers('x-store-id') storeId?: string,
  ) {
    return this.marketingService.findRuleTemplates(this.requireStoreId(storeId), { page, pageSize, source, category, scenario, priority, status, keyword });
  }

  @Get('automation/rule-templates/:id')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '获取自动营销规则详情' })
  getRuleTemplateById(@Param('id', ParseIntPipe) id: number, @Headers('x-store-id') storeId?: string) {
    return this.marketingService.getRuleTemplateById(id, this.requireStoreId(storeId));
  }

  @Post('automation/rule-templates/:id/clone')
  @Permissions('core:marketing:create')
  @ApiOperation({ summary: '复制系统规则为门店自定义规则' })
  cloneRuleTemplate(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @Headers('x-store-id') storeId?: string) {
    return this.marketingService.cloneRuleTemplate(id, this.requireStoreId(storeId), dto);
  }

  @Post('automation/rule-templates')
  @Permissions('core:marketing:create')
  @ApiOperation({ summary: '创建门店自定义规则' })
  createRuleTemplate(@Body() dto: any, @Headers('x-store-id') storeId?: string) {
    return this.marketingService.createRuleTemplate(this.requireStoreId(storeId), dto);
  }

  @Put('automation/rule-templates/:id')
  @Permissions('core:marketing:update')
  @ApiOperation({ summary: '更新门店自定义规则' })
  updateRuleTemplate(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @Headers('x-store-id') storeId?: string) {
    return this.marketingService.updateRuleTemplate(id, this.requireStoreId(storeId), dto);
  }

  @Post('automation/rule-templates/:id/preview-audience')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '预估规则命中客户' })
  previewRuleTemplateAudience(@Param('id', ParseIntPipe) id: number, @Headers('x-store-id') storeId?: string) {
    return this.marketingService.previewRuleTemplateAudience(id, this.requireStoreId(storeId));
  }

  @Post('automation/rule-templates/:id/enable')
  @Permissions('core:marketing:create')
  @ApiOperation({ summary: '基于规则创建并启用自动营销策略' })
  enableRuleTemplate(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @Headers('x-store-id') storeId?: string) {
    return this.marketingService.enableRuleTemplate(id, this.requireStoreId(storeId), dto);
  }

  @Post('automation/rule-templates/:id/disable')
  @Permissions('core:marketing:update')
  @ApiOperation({ summary: '停用规则及关联策略' })
  disableRuleTemplate(@Param('id', ParseIntPipe) id: number, @Headers('x-store-id') storeId?: string) {
    return this.marketingService.disableRuleTemplate(id, this.requireStoreId(storeId));
  }

  @Get('automation/rule-templates/:id/effects')
  @Permissions('core:marketing:analytics')
  @ApiOperation({ summary: '获取规则效果' })
  getRuleTemplateEffects(@Param('id', ParseIntPipe) id: number, @Headers('x-store-id') storeId?: string) {
    return this.marketingService.getRuleTemplateEffects(id, this.requireStoreId(storeId));
  }

  @Get('automation/strategies/paginated')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '分页获取自动化策略' })
  findStrategies(@Query('page') page?: number, @Query('pageSize') pageSize?: number, @Query('status') status?: string, @Headers('x-store-id') storeId?: string) {
    return this.marketingService.findStrategies({ page, pageSize, status, storeId: this.requireStoreId(storeId) });
  }

  @Post('automation/strategies')
  @Permissions('core:marketing:create')
  @ApiOperation({ summary: '创建自动化策略' })
  createStrategy(@Body() dto: any, @Headers('x-store-id') storeId?: string) {
    return this.marketingService.createStrategy(dto, this.requireStoreId(storeId));
  }

  @Put('automation/strategies/:id')
  @Permissions('core:marketing:update')
  @ApiOperation({ summary: '更新自动化策略' })
  updateStrategy(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @Headers('x-store-id') storeId?: string) {
    return this.marketingService.updateStrategy(id, dto, this.requireStoreId(storeId));
  }

  @Delete('automation/strategies/:id')
  @Permissions('core:marketing:delete')
  @ApiOperation({ summary: '删除自动化策略' })
  deleteStrategy(@Param('id', ParseIntPipe) id: number, @Headers('x-store-id') storeId?: string) {
    return this.marketingService.deleteStrategy(id, this.requireStoreId(storeId));
  }

  @Post('automation/strategies/:id/enable')
  @Permissions('core:marketing:update')
  @ApiOperation({ summary: '启用策略' })
  enableStrategy(@Param('id', ParseIntPipe) id: number, @Headers('x-store-id') storeId?: string) {
    return this.marketingService.enableStrategy(id, this.requireStoreId(storeId));
  }

  @Post('automation/strategies/:id/pause')
  @Permissions('core:marketing:update')
  @ApiOperation({ summary: '暂停策略' })
  pauseStrategy(@Param('id', ParseIntPipe) id: number, @Headers('x-store-id') storeId?: string) {
    return this.marketingService.pauseStrategy(id, this.requireStoreId(storeId));
  }

  @Post('automation/strategies/:id/execute')
  @Permissions('core:marketing:update')
  @ApiOperation({ summary: '执行策略' })
  executeStrategy(@Param('id', ParseIntPipe) id: number, @Headers('x-store-id') storeId?: string) {
    return this.marketingService.executeStrategy(id, this.requireStoreId(storeId));
  }

  @Post('automation/strategies/:id/preview-audience')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '预览指定策略受众' })
  previewStrategyAudience(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { triggerRules: any[]; ruleRelation: string },
    @Headers('x-store-id') storeId?: string,
  ) {
    const scopedStoreId = this.requireStoreId(storeId);
    return this.marketingService.previewAudience(dto.triggerRules, dto.ruleRelation, id, scopedStoreId);
  }

  @Post('automation/strategies/preview-audience')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '预览受众' })
  previewAudience(@Body() dto: { triggerRules: any[]; ruleRelation: string }, @Headers('x-store-id') storeId?: string) {
    return this.marketingService.previewAudience(dto.triggerRules, dto.ruleRelation, undefined, this.requireStoreId(storeId));
  }

  @Get('automation/executions/paginated')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '获取执行记录' })
  findExecutions(@Query('page') page?: number, @Query('pageSize') pageSize?: number, @Query('strategyId') strategyId?: number, @Headers('x-store-id') storeId?: string) {
    return this.marketingService.findExecutions({ page, pageSize, strategyId, storeId: this.requireStoreId(storeId) });
  }

  @Get('automation/executions/:id')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '获取执行记录详情' })
  getExecutionById(@Param('id', ParseIntPipe) id: number, @Headers('x-store-id') storeId?: string) {
    return this.marketingService.getExecutionById(id, this.requireStoreId(storeId));
  }

  @Get('automation/effects')
  @Permissions('core:marketing:analytics')
  @ApiOperation({ summary: '获取策略效果' })
  getEffects(@Headers('x-store-id') storeId?: string) {
    return this.marketingService.getEffects(this.requireStoreId(storeId));
  }

  @Get('effects/unified')
  @Permissions('core:marketing:analytics')
  @ApiOperation({ summary: '获取统一营销效果分析' })
  getUnifiedEffects(
    @Query('objectType') objectType?: string,
    @Query('objectId') objectId?: string,
    @Headers('x-store-id') headerStoreId?: string,
  ) {
    return this.marketingService.getUnifiedEffects({ objectType, objectId, storeId: this.requireStoreId(headerStoreId) });
  }

  @Get('strategies/effects')
  @Permissions('core:marketing:analytics')
  @ApiOperation({ summary: '获取自动营销策略效果汇总' })
  getStrategyEffects(@Headers('x-store-id') storeId?: string) {
    return this.marketingService.getStrategyEffects(this.requireStoreId(storeId));
  }
}
