import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, ParseIntPipe, Headers } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MarketingService } from './marketing.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';

@ApiTags('Marketing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('marketing')
export class MarketingController {
  constructor(private marketingService: MarketingService) {}

  // Recommendations
  @Get('recommendations')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '获取营销推荐列表' })
  getRecommendations(@Headers('x-store-id') storeId?: string) {
    return this.marketingService.getRecommendations(storeId ? Number(storeId) : undefined);
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

  @Post('customer-events')
  @Permissions('core:marketing:create')
  @ApiOperation({ summary: '写入客户小程序/营销行为事件' })
  recordCustomerBehaviorEvent(@Body() dto: any) {
    return this.marketingService.recordCustomerBehaviorEvent(dto);
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
  findActivities(@Query('page') page?: number, @Query('pageSize') pageSize?: number, @Query('status') status?: string) {
    return this.marketingService.findActivities({ page, pageSize, status });
  }

  @Post('activities')
  @Permissions('core:marketing:create')
  @ApiOperation({ summary: '创建营销活动' })
  createActivity(@Body() dto: any) {
    return this.marketingService.createActivity(dto);
  }

  @Put('activities/:id')
  @Permissions('core:marketing:update')
  @ApiOperation({ summary: '更新营销活动' })
  updateActivity(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.marketingService.updateActivity(id, dto);
  }

  @Delete('activities/:id')
  @Permissions('core:marketing:delete')
  @ApiOperation({ summary: '删除营销活动' })
  deleteActivity(@Param('id', ParseIntPipe) id: number) {
    return this.marketingService.deleteActivity(id);
  }

  // Automation
  @Get('automation/trigger-options')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '获取触发规则选项' })
  getTriggerOptions() {
    return this.marketingService.getTriggerOptions();
  }

  @Get('automation/strategies/paginated')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '分页获取自动化策略' })
  findStrategies(@Query('page') page?: number, @Query('pageSize') pageSize?: number, @Query('status') status?: string) {
    return this.marketingService.findStrategies({ page, pageSize, status });
  }

  @Post('automation/strategies')
  @Permissions('core:marketing:create')
  @ApiOperation({ summary: '创建自动化策略' })
  createStrategy(@Body() dto: any) {
    return this.marketingService.createStrategy(dto);
  }

  @Put('automation/strategies/:id')
  @Permissions('core:marketing:update')
  @ApiOperation({ summary: '更新自动化策略' })
  updateStrategy(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.marketingService.updateStrategy(id, dto);
  }

  @Delete('automation/strategies/:id')
  @Permissions('core:marketing:delete')
  @ApiOperation({ summary: '删除自动化策略' })
  deleteStrategy(@Param('id', ParseIntPipe) id: number) {
    return this.marketingService.deleteStrategy(id);
  }

  @Post('automation/strategies/:id/enable')
  @Permissions('core:marketing:update')
  @ApiOperation({ summary: '启用策略' })
  enableStrategy(@Param('id', ParseIntPipe) id: number) {
    return this.marketingService.enableStrategy(id);
  }

  @Post('automation/strategies/:id/pause')
  @Permissions('core:marketing:update')
  @ApiOperation({ summary: '暂停策略' })
  pauseStrategy(@Param('id', ParseIntPipe) id: number) {
    return this.marketingService.pauseStrategy(id);
  }

  @Post('automation/strategies/:id/execute')
  @Permissions('core:marketing:update')
  @ApiOperation({ summary: '执行策略' })
  executeStrategy(@Param('id', ParseIntPipe) id: number) {
    return this.marketingService.executeStrategy(id);
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
  findExecutions(@Query('page') page?: number, @Query('pageSize') pageSize?: number, @Query('strategyId') strategyId?: number) {
    return this.marketingService.findExecutions({ page, pageSize, strategyId });
  }

  @Get('automation/executions/:id')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '获取执行记录详情' })
  getExecutionById(@Param('id', ParseIntPipe) id: number) {
    return this.marketingService.getExecutionById(id);
  }

  @Get('automation/effects')
  @Permissions('core:marketing:analytics')
  @ApiOperation({ summary: '获取策略效果' })
  getEffects() {
    return this.marketingService.getEffects();
  }

  @Get('strategies/effects')
  @Permissions('core:marketing:analytics')
  @ApiOperation({ summary: '获取自动营销策略效果汇总' })
  getStrategyEffects() {
    return this.marketingService.getStrategyEffects();
  }
}
