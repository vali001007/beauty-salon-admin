import { Body, Controller, Delete, Get, Headers, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { CurrentCustomerAppUser } from './customer-app-user.decorator.js';
import { CustomerAppService } from './customer-app.service.js';
import {
  CustomerAppAdminDisplayConfigDto,
  CustomerAppAdminDisplayConfigQueryDto,
  CustomerAppAdminEventQueryDto,
  CustomerAppAdminUpdateDisplayConfigDto,
  CustomerAppAnalyzeSkinDto,
  CustomerAppAvailabilityQueryDto,
  CustomerAppBindPhoneDto,
  CustomerAppCancelReservationDto,
  CustomerAppCreateReservationDto,
  CustomerAppEventDto,
  CustomerAppH5GuestDto,
  CustomerAppHomeQueryDto,
  CustomerAppPaginationDto,
  CustomerAppProjectQueryDto,
  CustomerAppWechatLoginDto,
} from './dto/index.js';
import { CustomerAppAuthGuard } from './guards/customer-app-auth.guard.js';
import type { CustomerAppTokenPayload } from './types.js';

@ApiTags('Customer App - Ami Glow')
@Controller('customer-app')
export class CustomerAppController {
  constructor(private customerAppService: CustomerAppService) {}

  @Post('auth/wechat-login')
  @ApiOperation({ summary: 'Ami Glow 微信登录' })
  wechatLogin(@Body() dto: CustomerAppWechatLoginDto) {
    return this.customerAppService.wechatLogin(dto);
  }

  @Post('auth/h5-guest')
  @ApiOperation({ summary: 'Ami Glow H5 游客登录' })
  h5Guest(@Body() dto: CustomerAppH5GuestDto) {
    return this.customerAppService.h5Guest(dto);
  }

  @Post('auth/bind-phone')
  @ApiBearerAuth()
  @UseGuards(CustomerAppAuthGuard)
  @ApiOperation({ summary: 'Ami Glow 绑定手机号并匹配客户' })
  bindPhone(@CurrentCustomerAppUser() user: CustomerAppTokenPayload, @Body() dto: CustomerAppBindPhoneDto) {
    return this.customerAppService.bindPhone(user, dto);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(CustomerAppAuthGuard)
  @ApiOperation({ summary: 'Ami Glow 当前客户信息' })
  me(@CurrentCustomerAppUser() user: CustomerAppTokenPayload) {
    return this.customerAppService.getMe(user);
  }

  @Get('home')
  @ApiOperation({ summary: 'Ami Glow 首页聚合数据' })
  home(@Query() query: CustomerAppHomeQueryDto) {
    return this.customerAppService.getHome(query);
  }

  @Get('contact')
  @ApiOperation({ summary: 'Ami Glow 当前门店客服信息' })
  contact(@Query('storeId') storeId?: string) {
    return this.customerAppService.getContact(storeId ? Number(storeId) : undefined);
  }

  @Get('projects')
  @ApiOperation({ summary: 'Ami Glow 项目列表' })
  projects(@Query() query: CustomerAppProjectQueryDto) {
    return this.customerAppService.getProjects(query);
  }

  @Get('projects/:id')
  @ApiOperation({ summary: 'Ami Glow 项目详情' })
  projectDetail(@Param('id', ParseIntPipe) id: number, @Query('storeId') storeId?: string) {
    return this.customerAppService.getProjectDetail(id, storeId ? Number(storeId) : undefined);
  }

  @Get('projects/:id/available-beauticians')
  @ApiOperation({ summary: 'Ami Glow 项目可预约美容师' })
  availableBeauticians(@Param('id', ParseIntPipe) id: number, @Query('storeId') storeId?: string) {
    return this.customerAppService.getAvailableBeauticians(id, storeId ? Number(storeId) : undefined);
  }

  @Get('reservations/availability')
  @ApiOperation({ summary: 'Ami Glow 可预约时段' })
  reservationAvailability(@Query() query: CustomerAppAvailabilityQueryDto) {
    return this.customerAppService.getReservationAvailability(query);
  }

  @Post('reservations')
  @ApiBearerAuth()
  @UseGuards(CustomerAppAuthGuard)
  @ApiOperation({ summary: 'Ami Glow 创建预约' })
  createReservation(
    @CurrentCustomerAppUser() user: CustomerAppTokenPayload,
    @Body() dto: CustomerAppCreateReservationDto,
  ) {
    return this.customerAppService.createReservation(user, dto);
  }

  @Get('me/reservations')
  @ApiBearerAuth()
  @UseGuards(CustomerAppAuthGuard)
  @ApiOperation({ summary: 'Ami Glow 我的预约' })
  myReservations(@CurrentCustomerAppUser() user: CustomerAppTokenPayload, @Query() query: CustomerAppPaginationDto) {
    return this.customerAppService.getMyReservations(user, query);
  }

  @Post('me/reservations/:id/cancel')
  @ApiBearerAuth()
  @UseGuards(CustomerAppAuthGuard)
  @ApiOperation({ summary: 'Ami Glow 客户取消预约' })
  cancelReservation(
    @CurrentCustomerAppUser() user: CustomerAppTokenPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CustomerAppCancelReservationDto,
  ) {
    return this.customerAppService.cancelMyReservation(user, id, dto.reason);
  }

  @Get('me/cards')
  @ApiBearerAuth()
  @UseGuards(CustomerAppAuthGuard)
  @ApiOperation({ summary: 'Ami Glow 我的次卡' })
  myCards(@CurrentCustomerAppUser() user: CustomerAppTokenPayload) {
    return this.customerAppService.getMyCards(user);
  }

  @Get('me/consumption-records')
  @ApiBearerAuth()
  @UseGuards(CustomerAppAuthGuard)
  @ApiOperation({ summary: 'Ami Glow 消费记录' })
  myConsumptionRecords(
    @CurrentCustomerAppUser() user: CustomerAppTokenPayload,
    @Query() query: CustomerAppPaginationDto,
  ) {
    return this.customerAppService.getMyConsumptionRecords(user, query);
  }

  @Get('me/member-card')
  @ApiBearerAuth()
  @UseGuards(CustomerAppAuthGuard)
  @ApiOperation({ summary: 'Ami Glow 会员卡/储值信息' })
  myMemberCard(@CurrentCustomerAppUser() user: CustomerAppTokenPayload) {
    return this.customerAppService.getMyMemberCard(user);
  }

  @Get('me/notifications')
  @ApiBearerAuth()
  @UseGuards(CustomerAppAuthGuard)
  @ApiOperation({ summary: 'Ami Glow 我的站内通知' })
  myNotifications(
    @CurrentCustomerAppUser() user: CustomerAppTokenPayload,
    @Query() query: CustomerAppPaginationDto,
  ) {
    return this.customerAppService.getMyNotifications(user, query);
  }

  @Post('me/notifications/:id/open')
  @ApiBearerAuth()
  @UseGuards(CustomerAppAuthGuard)
  @ApiOperation({ summary: 'Ami Glow 标记站内通知已打开' })
  openMyNotification(
    @CurrentCustomerAppUser() user: CustomerAppTokenPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.customerAppService.openMyNotification(user, id);
  }

  @Post('skin-tests/analyze')
  @ApiBearerAuth()
  @UseGuards(CustomerAppAuthGuard)
  @ApiOperation({ summary: 'Ami Glow AI 测肤' })
  analyzeSkin(@CurrentCustomerAppUser() user: CustomerAppTokenPayload, @Body() dto: CustomerAppAnalyzeSkinDto) {
    return this.customerAppService.analyzeSkin(user, dto);
  }

  @Get('skin-tests/:id')
  @ApiBearerAuth()
  @UseGuards(CustomerAppAuthGuard)
  @ApiOperation({ summary: 'Ami Glow 测肤报告详情' })
  skinTest(@CurrentCustomerAppUser() user: CustomerAppTokenPayload, @Param('id', ParseIntPipe) id: number) {
    return this.customerAppService.getSkinTest(user, id);
  }

  @Get('skin-tests/:id/recommendations')
  @ApiBearerAuth()
  @UseGuards(CustomerAppAuthGuard)
  @ApiOperation({ summary: 'Ami Glow 测肤推荐项目' })
  skinTestRecommendations(
    @CurrentCustomerAppUser() user: CustomerAppTokenPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.customerAppService.getSkinTestRecommendations(user, id);
  }

  @Post('events')
  @ApiOperation({ summary: 'Ami Glow 行为事件上报' })
  events(@Body() dto: CustomerAppEventDto) {
    return this.customerAppService.recordEvent(undefined, dto);
  }

  @Post('promotions/:id/claim')
  @ApiBearerAuth()
  @UseGuards(CustomerAppAuthGuard)
  @ApiOperation({ summary: 'Ami Glow 领取权益' })
  claimPromotion(
    @CurrentCustomerAppUser() user: CustomerAppTokenPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { storeId?: number; channel?: string; source?: string; sessionId?: string },
  ) {
    return this.customerAppService.claimPromotion(user, id, dto);
  }

  @Get('admin/display-configs')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '管理端分页获取 Ami Glow 展示配置' })
  adminDisplayConfigs(
    @Query() query: CustomerAppAdminDisplayConfigQueryDto,
    @Headers('x-store-id') storeId?: string,
  ) {
    return this.customerAppService.findAdminDisplayConfigs({
      ...query,
      storeId: query.storeId ?? this.parseHeaderStoreId(storeId),
    });
  }

  @Post('admin/display-configs')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('core:marketing:update')
  @ApiOperation({ summary: '管理端创建 Ami Glow 展示配置' })
  createAdminDisplayConfig(@Body() dto: CustomerAppAdminDisplayConfigDto) {
    return this.customerAppService.createAdminDisplayConfig(dto);
  }

  @Put('admin/display-configs/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('core:marketing:update')
  @ApiOperation({ summary: '管理端更新 Ami Glow 展示配置' })
  updateAdminDisplayConfig(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CustomerAppAdminUpdateDisplayConfigDto,
  ) {
    return this.customerAppService.updateAdminDisplayConfig(id, dto);
  }

  @Delete('admin/display-configs/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('core:marketing:update')
  @ApiOperation({ summary: '管理端删除 Ami Glow 展示配置' })
  deleteAdminDisplayConfig(@Param('id', ParseIntPipe) id: number) {
    return this.customerAppService.deleteAdminDisplayConfig(id);
  }

  @Get('admin/events/paginated')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('core:marketing:view', 'core:customer:view')
  @ApiOperation({ summary: '管理端分页获取 Ami Glow 行为事件' })
  adminEvents(@Query() query: CustomerAppAdminEventQueryDto, @Headers('x-store-id') storeId?: string) {
    return this.customerAppService.findAdminEvents({
      ...query,
      storeId: query.storeId ?? this.parseHeaderStoreId(storeId),
    });
  }

  @Get('admin/events')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('core:marketing:view', 'core:customer:view')
  @ApiOperation({ summary: '管理端获取 Ami Glow 行为事件' })
  adminEventsAlias(@Query() query: CustomerAppAdminEventQueryDto, @Headers('x-store-id') storeId?: string) {
    return this.adminEvents(query, storeId);
  }

  private parseHeaderStoreId(value?: string) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
}
