import { Controller, Get, Post, Put, Body, Param, Query, UseGuards, ParseIntPipe, Headers, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { OrdersService } from './orders.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';

@ApiTags('Orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  private canViewProjectOrderProfit(user?: { roles?: string[]; permissions?: string[] }) {
    const roles = user?.roles ?? [];
    const permissions = user?.permissions ?? [];
    return permissions.includes('*') || roles.includes('super_admin') || roles.includes('store_manager');
  }

  @Get('product')
  @Permissions('core:order:products')
  @ApiOperation({ summary: '获取商品订单列表' })
  findProductOrders(
    @Query('keyword') keyword?: string,
    @Query('status') status?: string,
    @Query('storeId') storeId?: number,
    @Headers('x-store-id') storeHeader?: string,
  ) {
    return this.ordersService.findProductOrders({ keyword, status, storeId: storeId ?? storeHeader, itemType: 'product' });
  }

  @Get('product/paginated')
  @Permissions('core:order:products')
  @ApiOperation({ summary: '分页获取商品订单' })
  findProductOrdersPaginated(
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('keyword') keyword?: string,
    @Query('status') status?: string,
    @Query('storeId') storeId?: number,
    @Headers('x-store-id') storeHeader?: string,
  ) {
    return this.ordersService.findProductOrders({ page, pageSize, keyword, status, storeId: storeId ?? storeHeader, itemType: 'product' });
  }

  @Get('project')
  @Permissions('core:order:projects')
  @ApiOperation({ summary: '获取项目订单列表' })
  findProjectOrders(
    @Query('keyword') keyword?: string,
    @Query('status') status?: string,
    @Query('storeId') storeId?: number,
    @Headers('x-store-id') storeHeader?: string,
  ) {
    return this.ordersService.findProjectOrders({ keyword, status, storeId: storeId ?? storeHeader });
  }

  @Get('project/paginated')
  @Permissions('core:order:projects')
  @ApiOperation({ summary: '分页获取项目订单' })
  findProjectOrdersPaginated(
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('keyword') keyword?: string,
    @Query('status') status?: string,
    @Query('storeId') storeId?: number,
    @Headers('x-store-id') storeHeader?: string,
  ) {
    return this.ordersService.findProjectOrders({ page, pageSize, keyword, status, storeId: storeId ?? storeHeader });
  }

  @Get('project/:id/profit')
  @Permissions('core:order:projects', 'core:project-order-profit:view')
  @ApiOperation({ summary: '获取项目订单利润明细' })
  findProjectOrderProfit(@Param('id', ParseIntPipe) id: number, @CurrentUser() user?: any) {
    if (!this.canViewProjectOrderProfit(user)) {
      throw new ForbiddenException('仅店长和系统管理员可查看项目订单利润');
    }
    return this.ordersService.findProjectOrderProfit(id);
  }

  @Get('project/:id')
  @Permissions('core:order:projects')
  @ApiOperation({ summary: '获取项目订单详情' })
  findProjectOrderById(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.findProjectOrderById(id);
  }

  @Post('project')
  @Permissions('core:order:create')
  @ApiOperation({ summary: '创建项目订单' })
  createProjectOrder(@Body() dto: any) {
    return this.ordersService.createProjectOrder(dto);
  }

  @Get('product/:id')
  @Permissions('core:order:products')
  @ApiOperation({ summary: '获取订单详情' })
  findProductOrderById(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.findProductOrderById(id);
  }

  @Post('product')
  @Permissions('core:order:create')
  @ApiOperation({ summary: '创建商品订单' })
  createProductOrder(@Body() dto: any) {
    return this.ordersService.createProductOrder(dto);
  }

  @Post('card')
  @Permissions('core:order:card-orders')
  @ApiOperation({ summary: '创建次卡开卡记录' })
  createCardOrder(@Body() dto: any, @CurrentUser('id') userId?: number, @Headers('x-store-id') storeHeader?: string) {
    return this.ordersService.createCardOrder(Number(dto.storeId ?? dto.store?.id ?? storeHeader ?? 0), dto, userId);
  }

  @Put('product/:id')
  @Permissions('core:order:update')
  @ApiOperation({ summary: '更新商品订单' })
  updateProductOrder(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.ordersService.updateProductOrder(id, dto);
  }

  @Post('product/:id/refund')
  @Permissions('core:order:refund')
  @ApiOperation({ summary: '订单退款' })
  refundOrder(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.ordersService.refundOrder(id, dto);
  }

  @Get('member-cards/paginated')
  @Permissions('core:order:member-cards')
  @ApiOperation({ summary: '分页获取会员卡账户' })
  findMemberCardsPaginated(
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('keyword') keyword?: string,
    @Query('storeId') storeId?: number,
    @Headers('x-store-id') storeHeader?: string,
  ) {
    return this.ordersService.findMemberCardsPaginated({ page, pageSize, keyword, storeId: storeId ?? storeHeader });
  }

  @Post('member-cards/open')
  @Permissions('core:order:member-cards')
  @ApiOperation({ summary: '会员开卡' })
  openMemberCard(@Body() dto: any, @CurrentUser('id') userId?: number) {
    return this.ordersService.openMemberCard(dto, userId);
  }

  @Post('member-cards/:id/recharge')
  @Permissions('core:order:member-cards')
  @ApiOperation({ summary: '会员卡充值' })
  rechargeMemberCard(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @CurrentUser('id') userId?: number) {
    return this.ordersService.rechargeMemberCard(id, dto, userId);
  }

  @Post('member-cards/:id/gift')
  @Permissions('core:order:member-cards')
  @ApiOperation({ summary: '会员卡赠送余额' })
  giftMemberCard(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @CurrentUser('id') userId?: number) {
    return this.ordersService.giftMemberCard(id, dto, userId);
  }

  @Post('member-cards/:id/deduct')
  @Permissions('core:order:member-cards')
  @ApiOperation({ summary: '会员卡划扣' })
  deductMemberCard(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @CurrentUser('id') userId?: number) {
    return this.ordersService.deductMemberCard(id, dto, userId);
  }

  @Get('member-cards/deduct-records/paginated')
  @Permissions('core:order:member-cards')
  @ApiOperation({ summary: '分页获取会员卡划扣流水' })
  findMemberCardDeductRecordsPaginated(
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('keyword') keyword?: string,
    @Query('storeId') storeId?: number,
    @Headers('x-store-id') storeHeader?: string,
  ) {
    return this.ordersService.findMemberCardDeductTransactionsPaginated({
      page,
      pageSize,
      keyword,
      storeId: storeId ?? storeHeader,
    });
  }

  @Get('member-cards/:id/transactions')
  @Permissions('core:order:member-cards')
  @ApiOperation({ summary: '会员卡流水明细' })
  findMemberCardTransactions(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.findMemberCardTransactions(id);
  }

  @Get('card-orders/paginated')
  @Permissions('core:order:card-orders')
  @ApiOperation({ summary: '分页获取次卡开卡记录' })
  findCardOrdersPaginated(
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('userName') userName?: string,
    @Query('cardName') cardName?: string,
  ) {
    return this.ordersService.findCardOrdersPaginated({ page, pageSize, userName, cardName });
  }

  @Get('card-usage/paginated')
  @Permissions('core:order:card-usage')
  @ApiOperation({ summary: '分页获取次卡核销记录' })
  findCardUsageRecordsPaginated(
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('customerId') customerId?: number,
    @Query('cardName') cardName?: string,
    @Query('userName') userName?: string,
    @Query('projectName') projectName?: string,
  ) {
    return this.ordersService.findCardUsageRecordsPaginated({ page, pageSize, customerId, cardName, userName, projectName });
  }
}
