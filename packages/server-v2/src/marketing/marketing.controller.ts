import { BadRequestException, Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, ParseIntPipe, Headers, Patch } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MarketingService } from './marketing.service.js';
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

@ApiTags('Marketing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('marketing')
export class MarketingController {
  constructor(
    private marketingService: MarketingService,
    private terminalService: TerminalService,
  ) {}

  private requireStoreId(storeId?: string) {
    const parsed = Number(storeId);
    if (!Number.isInteger(parsed) || parsed <= 0) throw new BadRequestException('X-Store-Id is required');
    return parsed;
  }

  // Recommendations
  @Get('recommendations')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '获取营销推荐列表' })
  getRecommendations(
    @Headers('x-store-id') storeId?: string,
    @Query('scope') scope?: string,
    @Query('type') type?: string,
    @Query('limit') limit?: string,
    @Query('refresh') refresh?: string,
  ) {
    return this.marketingService.getRecommendations(storeId ? Number(storeId) : undefined, {
      scope,
      type,
      limit: limit ? Number(limit) : undefined,
      refresh: refresh === 'true',
    });
  }

  @Get('recommendations/:id/audience')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '获取营销推荐受众' })
  getRecommendationAudience(@Param('id', ParseIntPipe) id: number, @Headers('x-store-id') storeId?: string) {
    return this.marketingService.getRecommendationAudience(id, storeId ? Number(storeId) : undefined);
  }

  @Post('recommendations')
  @Permissions('core:marketing:create')
  @ApiOperation({ summary: '创建营销推荐' })
  createRecommendation(@Body() dto: any) {
    return this.marketingService.createRecommendation(dto);
  }

  @Put('recommendations/:id')
  @Permissions('core:marketing:update')
  @ApiOperation({ summary: '更新营销推荐' })
  updateRecommendation(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.marketingService.updateRecommendation(id, dto);
  }

  @Delete('recommendations/:id')
  @Permissions('core:marketing:delete')
  @ApiOperation({ summary: '删除营销推荐' })
  deleteRecommendation(@Param('id', ParseIntPipe) id: number) {
    return this.marketingService.deleteRecommendation(id);
  }

  @Post('recommendations/:id/adopt')
  @Permissions('core:marketing:create')
  @ApiOperation({ summary: '采纳营销推荐' })
  adoptRecommendation(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.marketingService.adoptRecommendation(id, dto);
  }

  @Post('recommendations/:id/adoptions')
  @Permissions('core:marketing:create')
  @ApiOperation({ summary: '在当前门店事务化采纳营销推荐' })
  adoptRecommendationTransaction(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: any,
    @Headers('x-store-id') storeId?: string,
  ) {
    return this.marketingService.adoptRecommendation(id, this.requireStoreId(storeId), dto);
  }

  @Post('recommendations/:id/activity-draft')
  @Permissions('core:marketing:create')
  @ApiOperation({ summary: '根据推荐生成活动草稿' })
  createRecommendationActivityDraft(@Param('id', ParseIntPipe) id: number) {
    return this.marketingService.createRecommendationActivityDraft(id);
  }

  @Post('recommendations/:id/automation-draft')
  @Permissions('core:marketing:create')
  @ApiOperation({ summary: '根据推荐生成自动营销规则草稿' })
  createRecommendationAutomationDraft(@Param('id', ParseIntPipe) id: number) {
    return this.marketingService.createRecommendationAutomationDraft(id);
  }

  @Post('recommendations/:id/follow-up-tasks')
  @Permissions('core:marketing:create')
  @ApiOperation({ summary: '根据推荐批量下发终端跟进任务' })
  async createRecommendationFollowUpTasks(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: BatchCreateTerminalFollowUpTaskDto,
    @Headers('x-store-id') storeId?: string,
    @CurrentUser('id') userId?: number,
  ) {
    const scopedStoreId = storeId ? Number(storeId) : Number((dto as any).storeId ?? 1);
    return this.terminalService.batchCreateFollowUpTasks(scopedStoreId, {
      ...dto,
      recommendationId: id,
      customerIds: dto.customerIds,
      source: dto.source ?? 'recommendation',
    }, userId);
  }

  @Get('follow-up-tasks')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '查询终端跟进任务' })
  getFollowUpTasks(@Query() query: QueryTerminalFollowUpTasksDto, @Headers('x-store-id') storeId?: string) {
    return this.terminalService.getFollowUpTasks(storeId ? Number(storeId) : 1, query);
  }

  @Get('follow-up-tasks/summary')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '终端跟进任务统计' })
  async getFollowUpTaskSummary(@Headers('x-store-id') storeId?: string) {
    const result = await this.terminalService.getFollowUpTasks(storeId ? Number(storeId) : 1, { page: 1, pageSize: 1 });
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
    return this.terminalService.assignFollowUpTask(storeId ? Number(storeId) : 1, id, dto);
  }

  @Patch('follow-up-tasks/:id/cancel')
  @Permissions('core:marketing:update')
  @ApiOperation({ summary: '取消终端跟进任务' })
  cancelFollowUpTask(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelTerminalFollowUpTaskDto,
    @Headers('x-store-id') storeId?: string,
  ) {
    return this.terminalService.cancelFollowUpTask(storeId ? Number(storeId) : 1, id, dto.note);
  }

  @Post('customer-events')
  @Permissions('core:marketing:create')
  @ApiOperation({ summary: '写入客户小程序/营销行为事件' })
  recordCustomerBehaviorEvent(@Body() dto: any) {
    return this.marketingService.recordCustomerBehaviorEvent(dto);
  }

  @Post('lifecycle/rebuild')
  @Permissions('core:marketing:analytics')
  @ApiOperation({ summary: '重建客户生命周期小本体快照和机会' })
  rebuildLifecycleOntology(
    @Headers('x-store-id') headerStoreId?: string,
    @Body() dto: { storeId?: number; predictionRunId?: number; includeServiceCycles?: boolean; includeFulfillmentChecks?: boolean; includeAttribution?: boolean } = {},
  ) {
    const scopedStoreId = dto.storeId ? Number(dto.storeId) : headerStoreId ? Number(headerStoreId) : undefined;
    return this.marketingService.rebuildLifecycleOntology(scopedStoreId, dto.predictionRunId ? Number(dto.predictionRunId) : undefined, {
      includeServiceCycles: dto.includeServiceCycles,
      includeFulfillmentChecks: dto.includeFulfillmentChecks,
      includeAttribution: dto.includeAttribution,
    });
  }

  @Get('lifecycle/service-cycles')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '查询客户-项目服务周期状态' })
  getLifecycleServiceCycles(@Query() query: any, @Headers('x-store-id') storeId?: string) {
    return this.marketingService.getLifecycleServiceCycles(query, storeId ? Number(storeId) : undefined);
  }

  @Get('lifecycle/opportunities')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '查询客户生命周期机会' })
  getLifecycleOpportunities(@Query() query: any, @Headers('x-store-id') storeId?: string) {
    return this.marketingService.getLifecycleOpportunities(query, storeId ? Number(storeId) : undefined);
  }

  @Get('lifecycle/opportunities/:id/fulfillment')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '查询客户生命周期机会承接校验' })
  getLifecycleOpportunityFulfillment(@Param('id', ParseIntPipe) id: number) {
    return this.marketingService.getLifecycleOpportunityFulfillment(id);
  }

  @Get('lifecycle/attribution')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '查询客户生命周期归因事件' })
  getLifecycleAttribution(@Query() query: any, @Headers('x-store-id') storeId?: string) {
    return this.marketingService.getLifecycleAttribution(query, storeId ? Number(storeId) : undefined);
  }

  @Get('lifecycle/quality')
  @Permissions('core:marketing:analytics')
  @ApiOperation({ summary: '查询客户生命周期本体质量快照' })
  getLifecycleQuality(@Headers('x-store-id') storeId?: string) {
    return this.marketingService.getLifecycleQuality(storeId ? Number(storeId) : undefined);
  }

  @Get('lifecycle/rules')
  @Permissions('core:marketing:analytics')
  @ApiOperation({ summary: '查询客户生命周期本体规则版本' })
  getLifecycleRules(@Query() query: any, @Headers('x-store-id') storeId?: string) {
    return this.marketingService.getLifecycleRules(query, storeId ? Number(storeId) : undefined);
  }

  @Post('lifecycle/rules')
  @Permissions('core:marketing:analytics')
  @ApiOperation({ summary: '创建客户生命周期本体规则草稿' })
  createLifecycleRule(@Body() dto: any, @Headers('x-store-id') storeId?: string) {
    return this.marketingService.createLifecycleRule(dto, storeId ? Number(storeId) : undefined);
  }

  @Post('lifecycle/rules/:id/publish')
  @Permissions('core:marketing:analytics')
  @ApiOperation({ summary: '发布客户生命周期本体规则版本' })
  publishLifecycleRule(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.marketingService.publishLifecycleRule(id, user?.id ? Number(user.id) : undefined);
  }

  @Post('lifecycle/rules/:id/rollback')
  @Permissions('core:marketing:analytics')
  @ApiOperation({ summary: '回滚客户生命周期本体规则版本' })
  rollbackLifecycleRule(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.marketingService.rollbackLifecycleRule(id, user?.id ? Number(user.id) : undefined);
  }

  @Post('lifecycle/business-plans')
  @Permissions('core:marketing:analytics')
  @ApiOperation({ summary: '生成客户生命周期经营计划草稿' })
  createLifecycleBusinessPlan(@Body() dto: any, @Headers('x-store-id') storeId?: string, @CurrentUser() user?: any) {
    return this.marketingService.createLifecycleBusinessPlan(dto, storeId ? Number(storeId) : undefined, user?.id ? Number(user.id) : undefined);
  }

  @Post('lifecycle/business-plans/:id/submit-actions')
  @Permissions('core:marketing:analytics')
  @ApiOperation({ summary: '提交经营计划动作进入人工审批' })
  submitLifecycleBusinessPlanActions(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @CurrentUser() user: any) {
    return this.marketingService.submitLifecycleBusinessPlanActions(id, dto, user?.id ? Number(user.id) : undefined);
  }

  @Get('lifecycle/customers/:id')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '获取单客户生命周期上下文' })
  getCustomerLifecycleContext(@Param('id', ParseIntPipe) id: number, @Headers('x-store-id') storeId?: string) {
    return this.marketingService.getCustomerLifecycleContext(id, storeId ? Number(storeId) : undefined);
  }

  @Get('invitation-candidates')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '获取客户邀约候选' })
  getInvitationCandidates(
    @Headers('x-store-id') headerStoreId?: string,
    @Query('storeId') storeId?: number,
    @Query('limit') limit?: number,
  ) {
    const scopedStoreId = storeId ? Number(storeId) : headerStoreId ? Number(headerStoreId) : undefined;
    return this.marketingService.getInvitationCandidates({ storeId: scopedStoreId, limit: limit ? Number(limit) : undefined });
  }

  @Post('predictions/run')
  @Permissions('core:marketing:analytics')
  @ApiOperation({ summary: '手动触发客户预测批次' })
  runPredictions(@Body() dto: { storeId?: number }) {
    return this.marketingService.runPredictions(dto?.storeId);
  }

  @Get('predictions/latest')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '获取最新预测批次汇总' })
  getLatestPredictionSummary(@Query('storeId') storeId?: number) {
    return this.marketingService.getLatestPredictionSummary(storeId ? Number(storeId) : undefined);
  }

  @Get('predictions/customers')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '分页获取客户预测快照' })
  findPredictionCustomers(
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('storeId') storeId?: number,
    @Query('churnLevel') churnLevel?: string,
    @Query('ltvTier') ltvTier?: string,
    @Query('minRepurchaseScore') minRepurchaseScore?: number,
    @Query('minMarketingResponseScore') minMarketingResponseScore?: number,
  ) {
    return this.marketingService.findPredictionCustomers({
      page,
      pageSize,
      storeId,
      churnLevel,
      ltvTier,
      minRepurchaseScore,
      minMarketingResponseScore,
    });
  }

  @Get('predictions/customers/:id')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '获取单客户最新预测快照' })
  getCustomerPrediction(@Param('id', ParseIntPipe) id: number) {
    return this.marketingService.getCustomerPrediction(id);
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
  ) {
    return this.marketingService.findRuleTemplates({ page, pageSize, source, category, scenario, priority, status, keyword });
  }

  @Get('automation/rule-templates/:id')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '获取自动营销规则详情' })
  getRuleTemplateById(@Param('id', ParseIntPipe) id: number) {
    return this.marketingService.getRuleTemplateById(id);
  }

  @Post('automation/rule-templates/:id/clone')
  @Permissions('core:marketing:create')
  @ApiOperation({ summary: '复制系统规则为门店自定义规则' })
  cloneRuleTemplate(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.marketingService.cloneRuleTemplate(id, dto);
  }

  @Post('automation/rule-templates')
  @Permissions('core:marketing:create')
  @ApiOperation({ summary: '创建门店自定义规则' })
  createRuleTemplate(@Body() dto: any) {
    return this.marketingService.createRuleTemplate(dto);
  }

  @Put('automation/rule-templates/:id')
  @Permissions('core:marketing:update')
  @ApiOperation({ summary: '更新门店自定义规则' })
  updateRuleTemplate(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.marketingService.updateRuleTemplate(id, dto);
  }

  @Post('automation/rule-templates/:id/preview-audience')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '预估规则命中客户' })
  previewRuleTemplateAudience(@Param('id', ParseIntPipe) id: number) {
    return this.marketingService.previewRuleTemplateAudience(id);
  }

  @Post('automation/rule-templates/:id/enable')
  @Permissions('core:marketing:create')
  @ApiOperation({ summary: '基于规则创建并启用自动营销策略' })
  enableRuleTemplate(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.marketingService.enableRuleTemplate(id, dto);
  }

  @Post('automation/rule-templates/:id/disable')
  @Permissions('core:marketing:update')
  @ApiOperation({ summary: '停用规则及关联策略' })
  disableRuleTemplate(@Param('id', ParseIntPipe) id: number) {
    return this.marketingService.disableRuleTemplate(id);
  }

  @Get('automation/rule-templates/:id/effects')
  @Permissions('core:marketing:analytics')
  @ApiOperation({ summary: '获取规则效果' })
  getRuleTemplateEffects(@Param('id', ParseIntPipe) id: number) {
    return this.marketingService.getRuleTemplateEffects(id);
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
  previewStrategyAudience(@Param('id', ParseIntPipe) id: number, @Body() dto: { triggerRules: any[]; ruleRelation: string }) {
    return this.marketingService.previewAudience(dto.triggerRules, dto.ruleRelation, id);
  }

  @Post('automation/strategies/preview-audience')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '预览受众' })
  previewAudience(@Body() dto: { triggerRules: any[]; ruleRelation: string }) {
    return this.marketingService.previewAudience(dto.triggerRules, dto.ruleRelation);
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
  getStrategyEffects() {
    return this.marketingService.getStrategyEffects();
  }
}
