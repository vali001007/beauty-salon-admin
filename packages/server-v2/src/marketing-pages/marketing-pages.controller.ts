import { BadRequestException, Body, Controller, Get, Headers, Param, ParseIntPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import {
  CreateMarketingPageDto,
  RecordMarketingPageEventDto,
  SubmitMarketingPageLeadDto,
  UpdateMarketingPageDto,
} from './dto.js';
import { MarketingPagesService } from './marketing-pages.service.js';

@ApiTags('Marketing Pages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class MarketingPagesController {
  constructor(private readonly marketingPagesService: MarketingPagesService) {}

  private requireStoreId(storeId?: string) {
    const parsed = Number(storeId);
    if (!Number.isInteger(parsed) || parsed <= 0) throw new BadRequestException('X-Store-Id is required');
    return parsed;
  }

  @Get('marketing/pages')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '分页获取营销页面' })
  findPages(
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('keyword') keyword?: string,
    @Query('status') status?: string,
    @Query('sourceType') sourceType?: string,
    @Query('storeId') storeId?: number,
    @Headers('x-store-id') headerStoreId?: string,
  ) {
    return this.marketingPagesService.findPages({
      page,
      pageSize,
      keyword,
      status,
      sourceType,
      storeId: this.requireStoreId(headerStoreId),
    });
  }

  @Get('marketing/pages/attribution/summary')
  @Permissions('core:marketing:analytics')
  @ApiOperation({ summary: '营销页面归因汇总' })
  getAttributionSummary(
    @Headers('x-store-id') storeId?: string,
    @Query('storeId') queryStoreId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.marketingPagesService.getAttributionSummary(
      queryStoreId ? Number(queryStoreId) : storeId ? Number(storeId) : undefined,
      startDate,
      endDate,
    );
  }

  @Post('marketing/pages')
  @Permissions('core:marketing:create')
  @ApiOperation({ summary: '创建营销页面草稿' })
  createPage(@Body() dto: CreateMarketingPageDto, @CurrentUser('id') userId?: number, @Headers('x-store-id') storeId?: string) {
    return this.marketingPagesService.createPage(
      {
        ...dto,
        storeId: this.requireStoreId(storeId),
      },
      userId,
    );
  }

  @Get('marketing/pages/:id')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '获取营销页面详情' })
  getPage(@Param('id', ParseIntPipe) id: number) {
    return this.marketingPagesService.getPage(id);
  }

  @Put('marketing/pages/:id')
  @Permissions('core:marketing:update')
  @ApiOperation({ summary: '更新营销页面' })
  updatePage(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMarketingPageDto) {
    return this.marketingPagesService.updatePage(id, dto);
  }

  @Post('marketing/pages/:id/publish')
  @Permissions('core:marketing:update')
  @ApiOperation({ summary: '发布营销页面' })
  publishPage(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId?: number) {
    return this.marketingPagesService.publishPage(id, userId);
  }

  @Post('marketing/pages/:id/offline')
  @Permissions('core:marketing:update')
  @ApiOperation({ summary: '下线营销页面' })
  offlinePage(@Param('id', ParseIntPipe) id: number) {
    return this.marketingPagesService.offlinePage(id);
  }

  @Post('marketing/pages/:id/duplicate')
  @Permissions('core:marketing:create')
  @ApiOperation({ summary: '复制营销页面' })
  duplicatePage(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId?: number) {
    return this.marketingPagesService.duplicatePage(id, userId);
  }

  @Get('marketing/pages/:id/effects')
  @Permissions('core:marketing:analytics')
  @ApiOperation({ summary: '获取营销页面效果统计' })
  getPageEffects(@Param('id', ParseIntPipe) id: number) {
    return this.marketingPagesService.getPageEffects(id);
  }

  @Get('marketing/pages/:id/attribution')
  @Permissions('core:marketing:analytics')
  @ApiOperation({ summary: '获取营销页面归因统计' })
  getPageAttribution(@Param('id', ParseIntPipe) id: number) {
    return this.marketingPagesService.getPageAttribution(id);
  }

  @Get('marketing/pages/:id/events')
  @Permissions('core:marketing:analytics')
  @ApiOperation({ summary: '获取营销页面事件明细' })
  getPageEvents(@Param('id', ParseIntPipe) id: number) {
    return this.marketingPagesService.getPageEvents(id);
  }

  @Get('marketing/pages/:id/leads')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '获取营销页面线索' })
  getPageLeads(@Param('id', ParseIntPipe) id: number) {
    return this.marketingPagesService.getPageLeads(id);
  }

  @Public()
  @Get('public/marketing/pages/:slug')
  @ApiOperation({ summary: '公开获取已发布营销页面' })
  getPublicPage(@Param('slug') slug: string) {
    return this.marketingPagesService.getPublicPage(slug);
  }

  @Public()
  @Post('public/marketing/pages/:slug/events')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @ApiOperation({ summary: '公开上报营销页面事件' })
  recordPublicEvent(@Param('slug') slug: string, @Body() dto: RecordMarketingPageEventDto, @Req() req: Request) {
    return this.marketingPagesService.recordPublicEvent(slug, dto, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  }

  @Public()
  @Post('public/marketing/pages/:slug/leads')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: '公开提交营销页面线索' })
  submitLead(@Param('slug') slug: string, @Body() dto: SubmitMarketingPageLeadDto, @Req() req: Request) {
    return this.marketingPagesService.submitLead(slug, dto, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  }

  @Public()
  @Post('public/marketing/pages/:slug/bookings')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: '公开提交营销页面预约意向' })
  submitBooking(@Param('slug') slug: string, @Body() dto: SubmitMarketingPageLeadDto, @Req() req: Request) {
    return this.marketingPagesService.submitBooking(slug, dto, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  }
}
