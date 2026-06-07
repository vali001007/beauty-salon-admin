import { Controller, Post, Get, Body, Query, UseGuards, Headers } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AiService } from './ai.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';

@ApiTags('AI')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private aiService: AiService) {}

  @Post('chat/messages')
  @ApiOperation({ summary: '智能对话' })
  chat(@Body('messages') messages: any[], @CurrentUser('id') userId: number, @Headers('x-store-id') storeId?: string) {
    return this.aiService.chat(messages, userId, storeId ? +storeId : undefined);
  }

  @Post('generate/customer-invitation-script')
  @ApiOperation({ summary: '生成邀约话术' })
  generateInvitationScript(@Body() dto: any, @CurrentUser('id') userId: number, @Headers('x-store-id') storeId?: string) {
    return this.aiService.generateInvitationScript(dto, userId, storeId ? +storeId : undefined);
  }

  @Post('generate/marketing-copy')
  @ApiOperation({ summary: '生成营销文案' })
  generateMarketingCopy(@Body() dto: any, @CurrentUser('id') userId: number, @Headers('x-store-id') storeId?: string) {
    return this.aiService.generateMarketingCopy(dto, userId, storeId ? +storeId : undefined);
  }

  @Post('generate/activity-page')
  @ApiOperation({ summary: '生成小程序活动页结构' })
  generateActivityPage(@Body() dto: any, @CurrentUser('id') userId: number, @Headers('x-store-id') storeId?: string) {
    return this.aiService.generateActivityPage(dto, userId, storeId ? +storeId : undefined);
  }

  @Post('generate/campaign-variants')
  @ApiOperation({ summary: '生成营销活动多渠道版本' })
  generateCampaignVariants(@Body() dto: any, @CurrentUser('id') userId: number, @Headers('x-store-id') storeId?: string) {
    return this.aiService.generateCampaignVariants(dto, userId, storeId ? +storeId : undefined);
  }

  @Post('generate/customer-summary')
  @ApiOperation({ summary: '生成客户摘要' })
  generateCustomerSummary(@Body() dto: any, @CurrentUser('id') userId: number, @Headers('x-store-id') storeId?: string) {
    return this.aiService.generateCustomerSummary(dto, userId, storeId ? +storeId : undefined);
  }

  @Post('generate/service-note-summary')
  @ApiOperation({ summary: '生成服务记录摘要' })
  generateServiceNoteSummary(@Body() dto: any, @CurrentUser('id') userId: number, @Headers('x-store-id') storeId?: string) {
    return this.aiService.generateServiceNoteSummary(dto, userId, storeId ? +storeId : undefined);
  }

  @Post('generate/skin-test-explanation')
  @ApiOperation({ summary: '皮肤检测解读' })
  generateSkinTestExplanation(@Body() dto: any, @CurrentUser('id') userId: number, @Headers('x-store-id') storeId?: string) {
    return this.aiService.generateSkinTestExplanation(dto, userId, storeId ? +storeId : undefined);
  }

  @Post('analyze/skin-photo')
  @ApiOperation({ summary: 'AI 肤质拍照检测' })
  analyzeSkinPhoto(@Body() dto: any, @CurrentUser('id') userId: number, @Headers('x-store-id') storeId?: string) {
    return this.aiService.analyzeSkinPhoto(dto, userId, storeId ? +storeId : undefined);
  }

  @Post('generate/terminal-service-advice')
  @ApiOperation({ summary: '生成终端服务建议' })
  generateTerminalServiceAdvice(@Body() dto: any, @CurrentUser('id') userId: number, @Headers('x-store-id') storeId?: string) {
    return this.aiService.generateTerminalServiceAdvice(dto, userId, storeId ? +storeId : undefined);
  }

  @Post('recommend/next-best-action')
  @ApiOperation({ summary: 'NBA推荐' })
  recommendNextBestAction(@Body() dto: any, @CurrentUser('id') userId: number, @Headers('x-store-id') storeId?: string) {
    return this.aiService.recommendNextBestAction(dto, userId, storeId ? +storeId : undefined);
  }

  @Post('terminal/resolve-intent')
  @ApiOperation({ summary: 'Ami Aura Lite 终端意图解析' })
  resolveTerminalIntent(@Body() dto: any, @CurrentUser('id') userId: number, @Headers('x-store-id') storeId?: string) {
    return this.aiService.resolveTerminalIntent(dto, userId, storeId ? +storeId : undefined);
  }

  @Get('audit-logs/summary')
  @Permissions('core:system:view')
  @ApiOperation({ summary: 'AI审计日志今日汇总' })
  getAuditLogSummary(@Query('scenario') scenario?: string, @Query('status') status?: string) {
    return this.aiService.getAuditLogSummary({ scenario, status });
  }

  @Get('audit-logs/paginated')
  @Permissions('core:system:view')
  @ApiOperation({ summary: '获取AI审计日志' })
  getAuditLogs(
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('scenario') scenario?: string,
    @Query('status') status?: string,
  ) {
    return this.aiService.getAuditLogs({ page, pageSize, scenario, status });
  }
}
