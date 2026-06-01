import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator.js';
import { CurrentDevice } from './decorators/current-device.decorator.js';
import {
  CheckoutDto,
  ConsumeCardDto,
  CreateCardOrderDto,
  CreateRechargeOrderDto,
  CreateServiceTaskDto,
  CreateSkinTestDto,
  DeviceHeartbeatDto,
  DeviceLoginDto,
  QuickCreateCustomerDto,
  UpdateTerminalCustomerHealthProfileDto,
  VerifyCardDto,
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
    @Query('role') role?: string,
  ) {
    return this.terminalService.getBootstrap(storeId, userId, role);
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

  @Get(':id/recommendations')
  @ApiOperation({ summary: '客户推荐' })
  getRecommendations(@Param('id', ParseIntPipe) id: number) {
    return this.terminalService.getCustomerRecommendations(id);
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
  list(@CurrentDevice('storeId') storeId: number, @CurrentDevice('id') deviceId: number) {
    return this.terminalService.listTasks(storeId, deviceId);
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
  checkout(@CurrentDevice('storeId') storeId: number, @Body() dto: CheckoutDto) {
    return this.terminalService.checkout(storeId, dto);
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

  @Post('print-jobs')
  @ApiOperation({ summary: '创建打印任务' })
  createPrintJob(@CurrentDevice('storeId') storeId: number, @Body() dto: any) {
    return this.terminalService.createPrintJob(storeId, dto);
  }

  @Get('print-jobs/:id')
  @ApiOperation({ summary: '打印任务状态' })
  getPrintJob(@CurrentDevice('storeId') storeId: number, @Param('id', ParseIntPipe) id: number) {
    return this.terminalService.getPrintJob(storeId, id);
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

  @Post()
  @ApiOperation({ summary: '创建预约' })
  create(@CurrentDevice('storeId') storeId: number, @Body() dto: any) {
    return this.terminalService.createReservation(storeId, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新预约' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.terminalService.updateReservation(id, dto);
  }

  @Patch(':id/confirm')
  @ApiOperation({ summary: '确认预约' })
  confirm(@Param('id', ParseIntPipe) id: number) {
    return this.terminalService.confirmReservation(id);
  }

  @Patch(':id/check-in')
  @ApiOperation({ summary: '预约到店' })
  checkIn(@Param('id', ParseIntPipe) id: number) {
    return this.terminalService.checkInReservation(id);
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
}
