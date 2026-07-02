import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, Headers, ParseIntPipe, Req, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { InventoryService } from './inventory.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';

@ApiTags('Inventory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private inventoryService: InventoryService) {}

  private assertAdjustmentPermission(dto: any, user: any) {
    const permissions = new Set<string>(user?.permissions ?? []);
    if (permissions.has('*')) return;
    const adjustmentType = String(dto?.adjustmentType ?? '');
    const requiredPermission = ['stocktake_gain', 'stocktake_loss'].includes(adjustmentType)
      ? 'core:inventory:stocktake'
      : 'core:inventory:adjustment';
    if (!permissions.has(requiredPermission)) {
      throw new ForbiddenException(`缺少库存操作权限：${requiredPermission}`);
    }
  }

  @Get('stock')
  @Permissions('core:inventory:stock')
  @ApiOperation({ summary: '获取库存列表' })
  getStock(
    @Headers('x-store-id') storeId?: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('categoryId') categoryId?: number,
    @Query('status') status?: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.inventoryService.getStock({
      storeId: storeId ? Number(storeId) : undefined,
      categoryId: categoryId ? Number(categoryId) : undefined,
      status,
      keyword,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('stock/paginated')
  @Permissions('core:inventory:stock')
  @ApiOperation({ summary: '分页获取库存' })
  getStockPaginated(
    @Headers('x-store-id') storeId?: string,
    @Query('storeId') queryStoreId?: number,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('categoryId') categoryId?: number,
    @Query('status') status?: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.inventoryService.getStock({
      storeId: queryStoreId ? Number(queryStoreId) : storeId ? Number(storeId) : undefined,
      categoryId: categoryId ? Number(categoryId) : undefined,
      status,
      keyword,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('batches')
  @Permissions('core:inventory:stock')
  @ApiOperation({ summary: '获取批次列表' })
  getBatches(@Query('productId', ParseIntPipe) productId: number) {
    return this.inventoryService.getBatches(productId);
  }

  @Get('stock-movements')
  @Permissions('core:inventory:stock')
  @ApiOperation({ summary: '获取库存流水' })
  getStockMovements(
    @Headers('x-store-id') headerStoreId?: string,
    @Query('storeId') storeId?: number,
    @Query('productId') productId?: number,
    @Query('sourceType') sourceType?: string,
    @Query('sourceId') sourceId?: number,
    @Query('movementType') movementType?: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.inventoryService.getStockMovements({
      storeId: storeId ? Number(storeId) : headerStoreId ? Number(headerStoreId) : undefined,
      productId: productId ? Number(productId) : undefined,
      sourceType,
      sourceId: sourceId ? Number(sourceId) : undefined,
      movementType,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('expiring')
  @Permissions('core:inventory:expiry')
  @ApiOperation({ summary: '获取临期商品' })
  getExpiring(
    @Headers('x-store-id') storeId?: string,
    @Query('period') period?: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.inventoryService.getExpiring(page, pageSize, storeId ? Number(storeId) : undefined, period);
  }

  @Get('expiring/summary')
  @Permissions('core:inventory:expiry')
  @ApiOperation({ summary: '获取临期统计' })
  getExpiringSummary(
    @Headers('x-store-id') storeId?: string,
    @Query('period') period?: string,
  ) {
    return this.inventoryService.getExpiringSummary(storeId ? Number(storeId) : undefined, period);
  }

  @Get('expiring/paginated')
  @Permissions('core:inventory:expiry')
  @ApiOperation({ summary: '分页获取临期商品' })
  getExpiringPaginated(
    @Headers('x-store-id') storeId?: string,
    @Query('period') period?: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.inventoryService.getExpiring(page, pageSize, storeId ? Number(storeId) : undefined, period);
  }

  @Post('inbound')
  @Permissions('core:inventory:purchase')
  @ApiOperation({ summary: '入库' })
  inbound(@Body() dto: any, @Req() req: any) {
    return this.inventoryService.inbound({ ...dto, operatorId: dto.operatorId ?? req.user?.id });
  }

  @Post('adjustments')
  @Permissions('core:inventory:adjustment', 'core:inventory:stocktake')
  @ApiOperation({ summary: '库存调整' })
  createAdjustment(@Body() dto: any, @Req() req: any) {
    this.assertAdjustmentPermission(dto, req.user);
    return this.inventoryService.createAdjustment({ ...dto, operatorId: dto.operatorId ?? req.user?.id });
  }

  @Get('purchase-orders')
  @Permissions('core:inventory:purchase')
  @ApiOperation({ summary: '获取采购单列表' })
  getPurchaseOrders(@Query('page') page?: number, @Query('pageSize') pageSize?: number) {
    return this.inventoryService.getPurchaseOrders(page, pageSize);
  }

  @Get('purchase-orders/paginated')
  @Permissions('core:inventory:purchase')
  @ApiOperation({ summary: '鍒嗛〉鑾峰彇閲囪喘鍗曞垪琛?' })
  getPurchaseOrdersPaginated(@Query('page') page?: number, @Query('pageSize') pageSize?: number) {
    return this.inventoryService.getPurchaseOrders(page, pageSize);
  }

  @Post('purchase-orders')
  @Permissions('core:inventory:purchase')
  @ApiOperation({ summary: '创建采购单' })
  createPurchaseOrder(@Body() dto: any) {
    return this.inventoryService.createPurchaseOrder(dto);
  }

  @Patch('purchase-orders/:id/status')
  @Permissions('core:inventory:purchase')
  @ApiOperation({ summary: '更新手动采购单状态' })
  updatePurchaseOrderStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.inventoryService.updatePurchaseOrderStatus(id, dto);
  }

  @Post('purchase-orders/:id/receive')
  @Permissions('core:inventory:purchase')
  @ApiOperation({ summary: '手动采购单收货入库' })
  receivePurchaseOrder(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: any,
    @Req() req: any,
    @Headers('x-store-id') storeId?: string,
  ) {
    return this.inventoryService.receivePurchaseOrder(id, {
      ...dto,
      storeId: dto.storeId ?? (storeId ? Number(storeId) : undefined),
      operatorId: dto.operatorId ?? req.user?.id,
    });
  }

  @Get('transfers/suggestions')
  @Permissions('core:inventory:transfer')
  @ApiOperation({ summary: '获取调拨建议' })
  getTransferSuggestions(@Headers('x-store-id') storeId?: string) {
    return this.inventoryService.getTransferSuggestions(storeId ? Number(storeId) : undefined);
  }

  @Get('transfers/paginated')
  @Permissions('core:inventory:transfer')
  @ApiOperation({ summary: '获取调拨单列表' })
  getTransfers(@Query('page') page?: number, @Query('pageSize') pageSize?: number) {
    return this.inventoryService.getTransfers(page, pageSize);
  }

  @Post('transfers')
  @Permissions('core:inventory:transfer')
  @ApiOperation({ summary: '创建调拨单' })
  createTransfer(@Body() dto: any, @Req() req: any) {
    return this.inventoryService.createTransfer({ ...dto, operatorId: dto.operatorId ?? req.user?.id });
  }

  @Get('replenishment')
  @Permissions('core:inventory:stock')
  @ApiOperation({ summary: '获取补货建议' })
  getReplenishment(@Headers('x-store-id') storeId?: string) {
    return this.inventoryService.getReplenishment(storeId ? +storeId : undefined);
  }
}
