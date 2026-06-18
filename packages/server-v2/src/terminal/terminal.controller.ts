import { Body, Controller, Delete, Get, Headers, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { Public } from '../common/decorators/public.decorator.js';
import { CurrentDevice } from './decorators/current-device.decorator.js';
import {
  CheckoutDto,
  ConsumeCardDto,
  ConsumeBalanceDto,
  CreateTerminalAutomationDto,
  CreateCardOrderDto,
  CreateRechargeOrderDto,
  CreateReservationDto,
  CreateServiceTaskDto,
  CreateSkinTestDto,
  CreateTerminalServiceRecordDto,
  DeviceHeartbeatDto,
  DeviceLoginDto,
  QuickCreateCustomerDto,
  QueryTerminalConversationsDto,
  RefundBalanceDto,
  ReservationAvailabilityQueryDto,
  RescheduleReservationDto,
  UpdateTerminalCustomerHealthProfileDto,
  UpdateReservationDto,
  UpdateTerminalAutomationDto,
  AdjustBalanceDto,
  SaveTerminalConversationDto,
  VerifyCardDto,
  AssignTerminalFollowUpTaskDto,
  CompleteTerminalFollowUpTaskDto,
  CreateTerminalFollowUpTaskDto,
  QueryTerminalFollowUpTasksDto,
} from './dto/index.js';
import { DeviceAuthGuard } from './guards/device-auth.guard.js';
import { TerminalService } from './terminal.service.js';

@ApiTags('Terminal - 设备管理')
@Controller('terminal/devices')
export class TerminalDeviceController {
  constructor(private terminalService: TerminalService) {}

  @Post('login')
  @Public()
  @ApiOperation({ summary: '设备登录' })
  login(@Body() dto: DeviceLoginDto) {
    return this.terminalService.deviceLogin(dto);
  }

  @Post('heartbeat')
  @UseGuards(DeviceAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '设备心跳' })
  heartbeat(@CurrentDevice('id') deviceId: number, @Body() dto: DeviceHeartbeatDto) {
    return this.terminalService.deviceHeartbeat(deviceId, dto);
  }

  @Post('unbind')
  @UseGuards(DeviceAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '解绑设备' })
  unbind(@CurrentDevice('id') deviceId: number) {
    return this.terminalService.unbindDevice(deviceId);
  }

  @Get('info')
  @UseGuards(DeviceAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '当前设备信息' })
  getInfo(@CurrentDevice('id') deviceId: number) {
    return this.terminalService.getDeviceInfo(deviceId);
  }

  @Get('status')
  @UseGuards(DeviceAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '终端设备与外设状态' })
  getDeviceStatus(@CurrentDevice('storeId') storeId: number, @CurrentDevice('id') deviceId: number) {
    return this.terminalService.getDeviceStatus(storeId, deviceId);
  }
}

@ApiTags('Terminal - 启动上下文')
@ApiBearerAuth()
@UseGuards(DeviceAuthGuard)
@Controller('terminal')
export class TerminalBootstrapController {
  constructor(private terminalService: TerminalService) {}

  @Get('bootstrap')
  @ApiOperation({ summary: '终端启动上下文' })
  bootstrap(
    @CurrentDevice('storeId') storeId: number,
    @CurrentDevice('userId') userId?: number,
    @Query('operatorId') operatorId?: string,
    @Query('role') role?: string,
  ) {
    return this.terminalService.getBootstrap(storeId, userId, role, operatorId ? Number(operatorId) : undefined);
  }

  @Get('config')
  @ApiOperation({ summary: '终端配置' })
  config() {
    return this.terminalService.getConfig();
  }

  @Get('sync/catalog')
  @ApiOperation({ summary: '终端目录同步' })
  catalog(@CurrentDevice('storeId') storeId: number, @Query('since') since?: string) {
    return this.terminalService.getCatalogSync(storeId, since);
  }
}

@ApiTags('Terminal - 对话历史')
@ApiBearerAuth()
@UseGuards(DeviceAuthGuard)
@Controller('terminal/conversations')
export class TerminalConversationController {
  constructor(private terminalService: TerminalService) {}

  @Post('save')
  @ApiOperation({ summary: '保存终端当天对话' })
  save(
    @CurrentDevice('storeId') storeId: number,
    @CurrentDevice('deviceCode') deviceCode: string,
    @CurrentDevice('userId') userId: number | undefined,
    @Body() dto: SaveTerminalConversationDto,
  ) {
    return this.terminalService.saveConversation(storeId, deviceCode, userId, dto);
  }

  @Get('history')
  @ApiOperation({ summary: '查询终端历史对话' })
  history(
    @CurrentDevice('storeId') storeId: number,
    @CurrentDevice('deviceCode') deviceCode: string,
    @Query() query: QueryTerminalConversationsDto,
  ) {
    return this.terminalService.getConversationHistory(storeId, deviceCode, query);
  }

  @Get(':id')
  @ApiOperation({ summary: '查看终端历史对话详情' })
  detail(
    @CurrentDevice('storeId') storeId: number,
    @CurrentDevice('deviceCode') deviceCode: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.terminalService.getConversationDetail(storeId, deviceCode, id);
  }

}

@ApiTags('Terminal - 对话历史')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('terminal/conversations')
export class TerminalConversationAdminController {
  constructor(private terminalService: TerminalService) {}

  @Delete(':id')
  @Permissions('core:system:stores')
  @ApiOperation({ summary: '管理员删除终端历史对话' })
  delete(@Param('id', ParseIntPipe) id: number, @Headers('x-store-id') storeId?: string) {
    return this.terminalService.deleteConversationAsAdmin(id, storeId ? +storeId : undefined);
  }
}

@ApiTags('Terminal - 客户操作')
@ApiBearerAuth()
@UseGuards(DeviceAuthGuard)
@Controller('terminal/customers')
export class TerminalCustomerController {
  constructor(private terminalService: TerminalService) {}

  @Get('search')
  @ApiOperation({ summary: '搜索客户' })
  search(@CurrentDevice('storeId') storeId: number, @Query('keyword') keyword: string) {
    return this.terminalService.searchCustomers(storeId, keyword || '');
  }

  @Post('quick-create')
  @ApiOperation({ summary: '快速创建客户' })
  quickCreate(@CurrentDevice('storeId') storeId: number, @Body() dto: QuickCreateCustomerDto) {
    return this.terminalService.quickCreateCustomer(storeId, dto);
  }

  @Get('growth-candidates')
  @ApiOperation({ summary: 'Customer growth candidates from latest prediction run' })
  getGrowthCandidates(@CurrentDevice('storeId') storeId: number, @Query('limit') limit?: string) {
    return this.terminalService.getGrowthCandidates(storeId, limit ? Number(limit) : 10);
  }

  @Get(':id/profile')
  @ApiOperation({ summary: 'Terminal customer profile' })
  getProfile(@CurrentDevice('storeId') storeId: number, @Param('id', ParseIntPipe) id: number) {
    return this.terminalService.getTerminalCustomerProfile(storeId, id);
  }
  @Get(':id/summary')
  @ApiOperation({ summary: '客户摘要' })
  getSummary(@Param('id', ParseIntPipe) id: number) {
    return this.terminalService.getCustomerSummary(id);
  }

  @Get(':id/health-profile')
  @ApiOperation({ summary: '客户健康档案' })
  getHealthProfile(@Param('id', ParseIntPipe) id: number) {
    return this.terminalService.getCustomerHealthProfile(id);
  }

  @Put(':id/health-profile')
  @ApiOperation({ summary: '更新客户健康档案' })
  updateHealthProfile(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTerminalCustomerHealthProfileDto,
  ) {
    return this.terminalService.updateCustomerHealthProfile(id, dto);
  }

  @Get(':id/behavior-profile')
  @ApiOperation({ summary: '客户行为画像' })
  getBehaviorProfile(@Param('id', ParseIntPipe) id: number) {
    return this.terminalService.getCustomerBehaviorProfile(id);
  }

  @Get(':id/consumption-records/paginated')
  @ApiOperation({ summary: '客户消费记录分页' })
  getConsumptionRecords(@Param('id', ParseIntPipe) id: number, @Query() query: any) {
    return this.terminalService.getCustomerConsumptionRecords(id, query);
  }

  @Get(':id/cards')
  @ApiOperation({ summary: '客户可用卡项' })
  getCards(@Param('id', ParseIntPipe) id: number) {
    return this.terminalService.getCustomerCards(id);
  }

  @Get(':id/balance')
  @ApiOperation({ summary: '客户储值余额' })
  getBalance(@CurrentDevice('storeId') storeId: number, @Param('id', ParseIntPipe) id: number) {
    return this.terminalService.getCustomerBalance(storeId, id);
  }

  @Get(':id/recommendations')
  @ApiOperation({ summary: '客户推荐' })
  getRecommendations(@Param('id', ParseIntPipe) id: number) {
    return this.terminalService.getCustomerRecommendations(id);
  }

  @Get(':id/next-best-actions')
  @ApiOperation({ summary: '客户下一步最佳动作' })
  getNextBestActions(@CurrentDevice('storeId') storeId: number, @Param('id', ParseIntPipe) id: number) {
    return this.terminalService.getCustomerNextBestActions(storeId, id);
  }
}

@ApiTags('Terminal - 服务任务')
@ApiBearerAuth()
@UseGuards(DeviceAuthGuard)
@Controller('terminal/tasks')
export class TerminalTaskController {
  constructor(private terminalService: TerminalService) {}

  @Get()
  @ApiOperation({ summary: '今日服务任务' })
  list(
    @CurrentDevice('storeId') storeId: number,
    @CurrentDevice('id') deviceId: number,
    @Query('date') date?: string,
    @Query('status') status?: string,
    @Query('beauticianId') beauticianId?: string,
  ) {
    return this.terminalService.listTasks(storeId, deviceId, {
      date,
      status,
      beauticianId: beauticianId ? Number(beauticianId) : undefined,
    });
  }

  @Get(':id/service-record')
  @ApiOperation({ summary: '服务记录详情' })
  getServiceRecord(@Param('id', ParseIntPipe) id: number) {
    return this.terminalService.getServiceRecord(id);
  }

  @Put(':id/service-record')
  @ApiOperation({ summary: '补充或修改服务记录' })
  updateServiceRecord(@CurrentDevice('storeId') storeId: number, @Param('id', ParseIntPipe) id: number, @Body() dto: CreateTerminalServiceRecordDto) {
    return this.terminalService.updateServiceRecord(storeId, id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: '服务任务详情' })
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.terminalService.getTaskById(id);
  }

  @Post()
  @ApiOperation({ summary: '创建服务任务' })
  create(@CurrentDevice('storeId') storeId: number, @CurrentDevice('id') deviceId: number, @Body() dto: CreateServiceTaskDto) {
    return this.terminalService.createTask(storeId, deviceId, dto);
  }

  @Patch(':id/start')
  @ApiOperation({ summary: '开始服务' })
  start(@Param('id', ParseIntPipe) id: number, @CurrentDevice('id') deviceId: number) {
    return this.terminalService.startTask(id, deviceId);
  }

  @Patch(':id/complete')
  @ApiOperation({ summary: '完成服务' })
  complete(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.terminalService.completeTask(id, dto);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: '取消服务' })
  cancel(@Param('id', ParseIntPipe) id: number, @Body('reason') reason?: string) {
    return this.terminalService.cancelTask(id, reason);
  }

  @Post(':id/transfer-cashier')
  @ApiOperation({ summary: '服务任务转前台收银' })
  transferCashier(@Param('id', ParseIntPipe) id: number, @Body('remark') remark?: string) {
    return this.terminalService.transferTaskToCashier(id, remark);
  }
}

@ApiTags('Terminal - 卡项核销')
@ApiBearerAuth()
@UseGuards(DeviceAuthGuard)
@Controller('terminal/cards')
export class TerminalCardController {
  constructor(private terminalService: TerminalService) {}

  @Post('verify')
  @ApiOperation({ summary: '核销预览' })
  verify(@Body() dto: VerifyCardDto) {
    return this.terminalService.verifyCard(dto);
  }

  @Post('consume')
  @ApiOperation({ summary: '确认核销' })
  consume(@CurrentDevice('id') deviceId: number, @Body() dto: ConsumeCardDto) {
    return this.terminalService.consumeCard(dto, deviceId);
  }
}

@ApiTags('Terminal - 收银')
@ApiBearerAuth()
@UseGuards(DeviceAuthGuard)
@Controller('terminal/cashier')
export class TerminalCashierController {
  constructor(private terminalService: TerminalService) {}

  @Post('checkout')
  @ApiOperation({ summary: '收银开单并收款' })
  checkout(@CurrentDevice('storeId') storeId: number, @CurrentDevice('id') deviceId: number, @Body() dto: CheckoutDto) {
    return this.terminalService.checkout(storeId, dto, deviceId);
  }

  @Get('payment-methods')
  @ApiOperation({ summary: '支付方式' })
  getPaymentMethods() {
    return this.terminalService.getPaymentMethods();
  }
}

@ApiTags('Terminal - 办卡充值')
@ApiBearerAuth()
@UseGuards(DeviceAuthGuard)
@Controller('terminal')
export class TerminalOrderController {
  constructor(private terminalService: TerminalService) {}

  @Post('card-orders')
  @ApiOperation({ summary: '办卡订单' })
  createCardOrder(@CurrentDevice('storeId') storeId: number, @Body() dto: CreateCardOrderDto) {
    return this.terminalService.createCardOrder(storeId, dto);
  }

  @Post('cashier-orders/:id/complete-payment')
  @ApiOperation({ summary: '完成收银支付' })
  completePayment(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.terminalService.completePayment(id, dto);
  }

  @Post('recharge-orders')
  @ApiOperation({ summary: '充值订单' })
  createRechargeOrder(@CurrentDevice('storeId') storeId: number, @Body() dto: CreateRechargeOrderDto) {
    return this.terminalService.createRechargeOrder(storeId, dto);
  }

  @Post('balance/consume')
  @ApiOperation({ summary: '会员余额消费' })
  consumeBalance(@CurrentDevice('storeId') storeId: number, @Body() dto: ConsumeBalanceDto) {
    return this.terminalService.consumeBalance(storeId, dto);
  }

  @Post('balance/refund')
  @ApiOperation({ summary: '会员余额退款' })
  refundBalance(@CurrentDevice('storeId') storeId: number, @Body() dto: RefundBalanceDto) {
    return this.terminalService.refundBalance(storeId, dto);
  }

  @Post('balance/adjust')
  @ApiOperation({ summary: '会员余额调整' })
  adjustBalance(@CurrentDevice('storeId') storeId: number, @Body() dto: AdjustBalanceDto) {
    return this.terminalService.adjustBalance(storeId, dto);
  }

  @Post('print-jobs')
  @ApiOperation({ summary: '创建打印任务' })
  createPrintJob(@CurrentDevice('storeId') storeId: number, @Body() dto: any) {
    return this.terminalService.createPrintJob(storeId, dto);
  }

  @Get('print-jobs')
  @ApiOperation({ summary: '打印任务队列' })
  listPrintJobs(@CurrentDevice('storeId') storeId: number, @Query() query: any) {
    return this.terminalService.listPrintJobs(storeId, query);
  }

  @Get('print-jobs/:id')
  @ApiOperation({ summary: '打印任务状态' })
  getPrintJob(@CurrentDevice('storeId') storeId: number, @Param('id', ParseIntPipe) id: number) {
    return this.terminalService.getPrintJob(storeId, id);
  }

  @Post('print-jobs/:id/retry')
  @ApiOperation({ summary: '重试打印任务' })
  retryPrintJob(@CurrentDevice('storeId') storeId: number, @Param('id', ParseIntPipe) id: number) {
    return this.terminalService.retryPrintJob(storeId, id);
  }

  @Patch('print-jobs/:id/status')
  @ApiOperation({ summary: '更新打印任务状态' })
  updatePrintJobStatus(@CurrentDevice('storeId') storeId: number, @Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.terminalService.updatePrintJobStatus(storeId, id, dto);
  }

  @Get('card-usage-records/paginated')
  @ApiOperation({ summary: '核销记录分页' })
  getCardUsageRecords(@Query() query: any) {
    return this.terminalService.getCardUsageRecords(query);
  }

  @Post('consumption-records')
  @ApiOperation({ summary: '提交服务消耗记录' })
  createConsumptionRecord(@CurrentDevice('storeId') storeId: number, @Body() dto: any) {
    return this.terminalService.createConsumptionRecord(dto, storeId);
  }

  @Post('service-records')
  @ApiOperation({ summary: '提交终端服务记录' })
  createServiceRecord(@CurrentDevice('storeId') storeId: number, @Body() dto: CreateTerminalServiceRecordDto) {
    return this.terminalService.createServiceRecord(storeId, dto);
  }

  @Post('follow-up-tasks')
  @ApiOperation({ summary: '创建客户邀约跟进任务' })
  createFollowUpTask(
    @CurrentDevice('storeId') storeId: number,
    @CurrentDevice('id') deviceId: number,
    @CurrentDevice('userId') userId: number | undefined,
    @Body() dto: CreateTerminalFollowUpTaskDto,
  ) {
    return this.terminalService.createFollowUpTask(storeId, deviceId, dto, userId);
  }

  @Get('follow-up-tasks')
  @ApiOperation({ summary: '查询终端待跟进任务' })
  getFollowUpTasks(
    @CurrentDevice('storeId') storeId: number,
    @CurrentDevice('userId') userId: number | undefined,
    @Query() query: QueryTerminalFollowUpTasksDto,
  ) {
    return this.terminalService.getFollowUpTasks(storeId, { ...query, assigneeUserId: query.assigneeUserId ?? userId });
  }

  @Patch('follow-up-tasks/:id/start')
  @ApiOperation({ summary: '开始客户邀约跟进任务' })
  startFollowUpTask(
    @CurrentDevice('storeId') storeId: number,
    @CurrentDevice('userId') userId: number | undefined,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.terminalService.startFollowUpTask(storeId, id, userId);
  }

  @Patch('follow-up-tasks/:id/complete')
  @ApiOperation({ summary: '完成客户邀约跟进任务' })
  completeFollowUpTask(
    @CurrentDevice('storeId') storeId: number,
    @CurrentDevice('userId') userId: number | undefined,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CompleteTerminalFollowUpTaskDto,
  ) {
    return this.terminalService.completeFollowUpTask(storeId, id, dto, userId);
  }

  @Patch('follow-up-tasks/:id/return')
  @ApiOperation({ summary: '退回客户邀约跟进任务到店长队列' })
  returnFollowUpTask(
    @CurrentDevice('storeId') storeId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignTerminalFollowUpTaskDto,
  ) {
    return this.terminalService.assignFollowUpTask(storeId, id, { ...dto, assigneeRole: 'manager' });
  }
}

@ApiTags('Terminal - 皮肤检测')
@ApiBearerAuth()
@UseGuards(DeviceAuthGuard)
@Controller('terminal/skin-tests')
export class TerminalSkinTestController {
  constructor(private terminalService: TerminalService) {}

  @Post()
  @ApiOperation({ summary: '创建皮肤检测' })
  create(@CurrentDevice('id') deviceId: number, @Body() dto: CreateSkinTestDto) {
    return this.terminalService.createSkinTest(deviceId, dto);
  }

  @Get()
  @ApiOperation({ summary: '皮肤检测列表' })
  list(@Query('customerId') customerId?: string) {
    return this.terminalService.getSkinTests(customerId ? Number(customerId) : undefined);
  }

  @Get(':id')
  @ApiOperation({ summary: '皮肤检测详情' })
  getOne(@Param('id', ParseIntPipe) id: number) {
    return this.terminalService.getSkinTestById(id);
  }

  @Post(':id/bind-customer')
  @ApiOperation({ summary: '绑定皮肤检测客户' })
  bindCustomer(@Param('id', ParseIntPipe) id: number, @Body('customerId', ParseIntPipe) customerId: number) {
    return this.terminalService.bindSkinTestCustomer(id, customerId);
  }

  @Get(':id/recommendations')
  @ApiOperation({ summary: '检测推荐' })
  getSkinRecommendations(@Param('id', ParseIntPipe) id: number) {
    return this.terminalService.getSkinTestRecommendations(id);
  }
}

@ApiTags('Terminal - 预约')
@ApiBearerAuth()
@UseGuards(DeviceAuthGuard)
@Controller('terminal/reservations')
export class TerminalReservationController {
  constructor(private terminalService: TerminalService) {}

  @Get('today')
  @ApiOperation({ summary: '今日预约' })
  getToday(@CurrentDevice('storeId') storeId: number) {
    return this.terminalService.getTodayReservations(storeId);
  }

  @Get('availability')
  @ApiOperation({ summary: '查询可预约时段' })
  getAvailability(@CurrentDevice('storeId') storeId: number, @Query() query: ReservationAvailabilityQueryDto) {
    return this.terminalService.getReservationAvailability(storeId, query);
  }

  @Post()
  @ApiOperation({ summary: '创建预约' })
  create(@CurrentDevice('storeId') storeId: number, @Body() dto: CreateReservationDto) {
    return this.terminalService.createReservation(storeId, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新预约' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateReservationDto) {
    return this.terminalService.updateReservation(id, dto);
  }

  @Post(':id/reschedule')
  @ApiOperation({ summary: '预约改期' })
  reschedule(@Param('id', ParseIntPipe) id: number, @Body() dto: RescheduleReservationDto) {
    return this.terminalService.rescheduleReservation(id, dto);
  }

  @Post(':id/no-show')
  @ApiOperation({ summary: '标记爽约' })
  noShow(@Param('id', ParseIntPipe) id: number, @Body('reason') reason?: string) {
    return this.terminalService.markReservationNoShow(id, reason);
  }

  @Post(':id/create-task')
  @ApiOperation({ summary: '由预约创建服务任务' })
  createTask(@CurrentDevice('id') deviceId: number, @Param('id', ParseIntPipe) id: number) {
    return this.terminalService.createTaskFromReservation(id, deviceId);
  }

  @Patch(':id/confirm')
  @ApiOperation({ summary: '确认预约' })
  confirm(@Param('id', ParseIntPipe) id: number) {
    return this.terminalService.confirmReservation(id);
  }

  @Patch(':id/check-in')
  @ApiOperation({ summary: '预约到店' })
  checkIn(@CurrentDevice('id') deviceId: number, @Param('id', ParseIntPipe) id: number) {
    return this.terminalService.checkInReservation(id, deviceId);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: '取消预约' })
  cancel(@Param('id', ParseIntPipe) id: number, @Body('reason') reason?: string) {
    return this.terminalService.cancelReservation(id, reason);
  }
}

@ApiTags('Terminal - 库存推荐')
@ApiBearerAuth()
@UseGuards(DeviceAuthGuard)
@Controller('terminal')
export class TerminalInventoryController {
  constructor(private terminalService: TerminalService) {}

  @Get('inventory/stock')
  @ApiOperation({ summary: '库存查询' })
  getStock(@CurrentDevice('storeId') storeId: number, @Query() query: any) {
    return this.terminalService.getInventoryStock(storeId, query);
  }

  @Get('inventory/alerts')
  @ApiOperation({ summary: '库存预警' })
  getInventoryAlerts(@CurrentDevice('storeId') storeId: number) {
    return this.terminalService.getInventoryAlerts(storeId);
  }

  @Get('projects/:id/bom')
  @ApiOperation({ summary: '项目 BOM' })
  getBom(@Param('id', ParseIntPipe) id: number) {
    return this.terminalService.getProjectBom(id);
  }

  @Post('recommendation-events')
  @ApiOperation({ summary: '推荐反馈' })
  recordEvent(@CurrentDevice('storeId') storeId: number, @CurrentDevice('id') deviceId: number, @Body() dto: any) {
    return this.terminalService.recordRecommendationEvent(storeId, deviceId, dto);
  }

  @Get('promotions/available')
  @ApiOperation({ summary: '可用活动' })
  getPromotions(@CurrentDevice('storeId') storeId: number, @Query() query: any) {
    return this.terminalService.getPromotions(storeId, query);
  }

  @Post('promotions/:id/use')
  @ApiOperation({ summary: '核销权益并记录效果事件' })
  usePromotion(
    @CurrentDevice('storeId') storeId: number,
    @CurrentDevice('id') deviceId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: any,
  ) {
    return this.terminalService.usePromotion(storeId, deviceId, { ...dto, promotionId: id });
  }
}

@ApiTags('Terminal - 自动化')
@ApiBearerAuth()
@UseGuards(DeviceAuthGuard)
@Controller('terminal/automations')
export class TerminalAutomationController {
  constructor(private terminalService: TerminalService) {}

  @Get('templates')
  @ApiOperation({ summary: '终端自动化 P0 模板' })
  templates() {
    return this.terminalService.getTerminalAutomationTemplates();
  }

  @Get()
  @ApiOperation({ summary: '终端自动化策略列表' })
  list(@CurrentDevice('storeId') storeId: number) {
    return this.terminalService.listTerminalAutomationStrategies(storeId);
  }

  @Post('preview')
  @ApiOperation({ summary: '预览终端自动化命中对象与风险' })
  preview(@CurrentDevice('storeId') storeId: number, @Body() dto: CreateTerminalAutomationDto) {
    return this.terminalService.previewTerminalAutomationStrategy(storeId, dto);
  }

  @Post()
  @ApiOperation({ summary: '从终端草稿创建或启用自动化策略' })
  create(
    @CurrentDevice('storeId') storeId: number,
    @CurrentDevice('userId') userId: number | undefined,
    @Body() dto: CreateTerminalAutomationDto,
  ) {
    return this.terminalService.createTerminalAutomationStrategy(storeId, userId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新终端自动化策略' })
  update(
    @CurrentDevice('storeId') storeId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTerminalAutomationDto,
  ) {
    return this.terminalService.updateTerminalAutomationStrategy(storeId, id, dto);
  }

  @Post(':id/enable')
  @ApiOperation({ summary: '启用终端自动化策略' })
  enable(@CurrentDevice('storeId') storeId: number, @Param('id', ParseIntPipe) id: number) {
    return this.terminalService.enableTerminalAutomationStrategy(storeId, id);
  }

  @Post(':id/pause')
  @ApiOperation({ summary: '暂停终端自动化策略' })
  pause(@CurrentDevice('storeId') storeId: number, @Param('id', ParseIntPipe) id: number) {
    return this.terminalService.pauseTerminalAutomationStrategy(storeId, id);
  }

  @Post(':id/run-once')
  @ApiOperation({ summary: '手动执行一次终端自动化策略' })
  runOnce(@CurrentDevice('storeId') storeId: number, @Param('id', ParseIntPipe) id: number) {
    return this.terminalService.runTerminalAutomationOnce(storeId, id);
  }

  @Post('executions/run-due')
  @ApiOperation({ summary: '扫描并执行当前门店已到期自动化' })
  runDue(@CurrentDevice('storeId') storeId: number) {
    return this.terminalService.runDueTerminalAutomations(storeId);
  }

  @Get('executions/today')
  @ApiOperation({ summary: '今日终端自动化执行摘要' })
  getTodaySummary(@CurrentDevice('storeId') storeId: number) {
    return this.terminalService.getTerminalAutomationTodaySummary(storeId);
  }

  @Get('executions/:id')
  @ApiOperation({ summary: '终端自动化执行详情' })
  getExecutionDetail(@CurrentDevice('storeId') storeId: number, @Param('id', ParseIntPipe) id: number) {
    return this.terminalService.getTerminalAutomationExecutionDetail(storeId, id);
  }

  @Post('touches/:id/follow-up')
  @ApiOperation({ summary: '标记终端自动化触达已跟进' })
  markTouchFollowedUp(@CurrentDevice('storeId') storeId: number, @Param('id', ParseIntPipe) id: number) {
    return this.terminalService.markTerminalAutomationTouchFollowedUp(storeId, id);
  }
}

@ApiTags('Terminal - 门店看板')
@ApiBearerAuth()
@Controller('terminal/dashboard')
export class TerminalDashboardController {
  constructor(private terminalService: TerminalService) {}

  @Get('stats')
  @UseGuards(DeviceAuthGuard)
  @ApiOperation({ summary: '今日门店统计' })
  getStats(@CurrentDevice('storeId') storeId: number) {
    return this.terminalService.getDashboardStats(storeId);
  }

  @Get('role')
  @UseGuards(DeviceAuthGuard)
  @ApiOperation({ summary: 'Ami Aura Lite 角色首页聚合数据' })
  getRoleDashboard(@CurrentDevice('storeId') storeId: number, @Query('role') role?: string) {
    return this.terminalService.getRoleDashboard(storeId, role);
  }

  @Get('manager')
  @UseGuards(DeviceAuthGuard)
  @ApiOperation({ summary: 'Ami Aura Lite 店长经营看板轻量数据' })
  getManagerDashboard(@CurrentDevice('storeId') storeId: number) {
    return this.terminalService.getManagerDashboard(storeId);
  }

  @Get('staff-schedules')
  @UseGuards(DeviceAuthGuard)
  @ApiOperation({ summary: 'Ami Aura Lite 员工排班摘要轻量数据' })
  getStaffSchedules(@CurrentDevice('storeId') storeId: number) {
    return this.terminalService.getStaffSchedulesDashboard(storeId);
  }

  @Get('today-reservations')
  @UseGuards(DeviceAuthGuard)
  @ApiOperation({ summary: 'Ami Aura Lite 今日预约轻量数据' })
  getTodayReservations(@CurrentDevice('storeId') storeId: number) {
    return this.terminalService.getTodayReservationsDashboard(storeId);
  }

  @Get('customer-growth')
  @UseGuards(DeviceAuthGuard)
  @ApiOperation({ summary: 'Ami Aura Lite 客户增长与流失候选轻量数据' })
  getCustomerGrowth(@CurrentDevice('storeId') storeId: number) {
    return this.terminalService.getCustomerGrowthDashboard(storeId);
  }

  @Get('inventory-alerts')
  @UseGuards(DeviceAuthGuard)
  @ApiOperation({ summary: 'Ami Aura Lite 库存预警轻量数据' })
  getInventoryAlerts(@CurrentDevice('storeId') storeId: number) {
    return this.terminalService.getInventoryAlertsDashboard(storeId);
  }
}

@ApiTags('Terminal - 美容师工作台')
@ApiBearerAuth()
@UseGuards(DeviceAuthGuard)
@Controller('terminal/beautician')
export class TerminalBeauticianController {
  constructor(private terminalService: TerminalService) {}

  @Get('me')
  @ApiOperation({ summary: '当前终端美容师上下文' })
  me(
    @CurrentDevice('storeId') storeId: number,
    @CurrentDevice('userId') userId?: number,
    @Query('operatorId') operatorId?: string,
  ) {
    return this.terminalService.getTerminalBeauticianMe(storeId, userId, operatorId ? Number(operatorId) : undefined);
  }

  @Get('dashboard')
  @ApiOperation({ summary: '当前美容师首页聚合数据' })
  dashboard(
    @CurrentDevice('storeId') storeId: number,
    @CurrentDevice('id') deviceId: number,
    @CurrentDevice('userId') userId?: number,
    @Query('date') date?: string,
    @Query('operatorId') operatorId?: string,
  ) {
    return this.terminalService.getTerminalBeauticianDashboard(storeId, deviceId, userId, {
      date,
      operatorId: operatorId ? Number(operatorId) : undefined,
    });
  }

  @Get('tasks')
  @ApiOperation({ summary: '当前美容师服务任务' })
  tasks(
    @CurrentDevice('storeId') storeId: number,
    @CurrentDevice('id') deviceId: number,
    @CurrentDevice('userId') userId?: number,
    @Query('date') date?: string,
    @Query('status') status?: string,
    @Query('operatorId') operatorId?: string,
  ) {
    return this.terminalService.getTerminalBeauticianTasks(storeId, deviceId, userId, {
      date,
      status,
      operatorId: operatorId ? Number(operatorId) : undefined,
    });
  }

  @Get('commission')
  @ApiOperation({ summary: '当前美容师提成汇总' })
  commission(
    @CurrentDevice('storeId') storeId: number,
    @CurrentDevice('userId') userId?: number,
    @Query('period') period?: string,
    @Query('detailLimit') detailLimit?: string,
    @Query('operatorId') operatorId?: string,
  ) {
    return this.terminalService.getTerminalBeauticianCommission(storeId, userId, {
      period,
      detailLimit,
      operatorId: operatorId ? Number(operatorId) : undefined,
    });
  }

  @Get('customers')
  @ApiOperation({ summary: '当前美容师服务客户' })
  customers(
    @CurrentDevice('storeId') storeId: number,
    @CurrentDevice('userId') userId?: number,
    @Query('keyword') keyword?: string,
    @Query('operatorId') operatorId?: string,
  ) {
    return this.terminalService.getTerminalBeauticianCustomers(storeId, userId, {
      keyword,
      operatorId: operatorId ? Number(operatorId) : undefined,
    });
  }
}

@ApiTags('Terminal - 业务上下文')
@ApiBearerAuth()
@Controller('terminal/context')
export class TerminalContextController {
  constructor(private terminalService: TerminalService) {}

  @Get('cashier')
  @UseGuards(DeviceAuthGuard)
  @ApiOperation({ summary: 'Ami Aura Lite 收银上下文轻量数据' })
  getCashierContext(@CurrentDevice('storeId') storeId: number) {
    return this.terminalService.getCashierContext(storeId);
  }

  @Get('card-verification')
  @UseGuards(DeviceAuthGuard)
  @ApiOperation({ summary: 'Ami Aura Lite 次卡核销上下文轻量数据' })
  getCardVerificationContext(@CurrentDevice('storeId') storeId: number, @Query('keyword') keyword?: string) {
    return this.terminalService.getCardVerificationContext(storeId, keyword);
  }
}
