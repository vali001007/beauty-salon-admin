import { Controller, Get, Post, Put, Body, Param, Query, UseGuards, ParseIntPipe, Headers } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { OrdersService } from './orders.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';

@ApiTags('Orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @Get('product')
  @Permissions('core:order:products')
  @ApiOperation({ summary: '获取商品订单列表' })
  findProductOrders(
    @Query('keyword') keyword?: string,
    @Query('status') status?: string,
    @Query('storeId') storeId?: number,
    @Headers('x-store-id') storeHeader?: string,
  ) {
    return this.ordersService.findProductOrders({ keyword, status, storeId: storeId ?? storeHeader });
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
    return this.ordersService.findProductOrders({ page, pageSize, keyword, status, storeId: storeId ?? storeHeader });
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
  openMemberCard(@Body() dto: any) {
    return this.ordersService.openMemberCard(dto);
  }

  @Post('member-cards/:id/recharge')
  @Permissions('core:order:member-cards')
  @ApiOperation({ summary: '会员卡充值' })
  rechargeMemberCard(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.ordersService.rechargeMemberCard(id, dto);
  }

  @Post('member-cards/:id/gift')
  @Permissions('core:order:member-cards')
  @ApiOperation({ summary: '会员卡赠送余额' })
  giftMemberCard(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.ordersService.giftMemberCard(id, dto);
  }

  @Post('member-cards/:id/deduct')
  @Permissions('core:order:member-cards')
  @ApiOperation({ summary: '会员卡划扣' })
  deductMemberCard(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.ordersService.deductMemberCard(id, dto);
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
  ) {
    return this.ordersService.findCardUsageRecordsPaginated({ page, pageSize, customerId });
  }
}
