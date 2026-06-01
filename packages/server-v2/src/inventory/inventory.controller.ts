import { Controller, Get, Post, Body, Query, UseGuards, Headers, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { InventoryService } from './inventory.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';

@ApiTags('Inventory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private inventoryService: InventoryService) {}

  @Get('stock')
  @Permissions('core:inventory:stock')
  @ApiOperation({ summary: '获取库存列表' })
  getStock(
    @Headers('x-store-id') storeId?: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.inventoryService.getStock(storeId ? +storeId : undefined, page, pageSize);
  }

  @Get('stock/paginated')
  @Permissions('core:inventory:stock')
  @ApiOperation({ summary: '分页获取库存' })
  getStockPaginated(
    @Headers('x-store-id') storeId?: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.inventoryService.getStock(storeId ? +storeId : undefined, page, pageSize);
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
  getExpiring(@Query('page') page?: number, @Query('pageSize') pageSize?: number) {
    return this.inventoryService.getExpiring(page, pageSize);
  }

  @Get('expiring/paginated')
  @Permissions('core:inventory:expiry')
  @ApiOperation({ summary: '分页获取临期商品' })
  getExpiringPaginated(@Query('page') page?: number, @Query('pageSize') pageSize?: number) {
    return this.inventoryService.getExpiring(page, pageSize);
  }

  @Post('inbound')
  @Permissions('core:inventory:purchase')
  @ApiOperation({ summary: '入库' })
  inbound(@Body() dto: any) {
    return this.inventoryService.inbound(dto);
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

  @Get('transfers/paginated')
  @Permissions('core:inventory:transfer')
  @ApiOperation({ summary: '获取调拨单列表' })
  getTransfers(@Query('page') page?: number, @Query('pageSize') pageSize?: number) {
    return this.inventoryService.getTransfers(page, pageSize);
  }

  @Post('transfers')
  @Permissions('core:inventory:transfer')
  @ApiOperation({ summary: '创建调拨单' })
  createTransfer(@Body() dto: any) {
    return this.inventoryService.createTransfer(dto);
  }

  @Get('replenishment')
  @Permissions('core:inventory:stock')
  @ApiOperation({ summary: '获取补货建议' })
  getReplenishment(@Headers('x-store-id') storeId?: string) {
    return this.inventoryService.getReplenishment(storeId ? +storeId : undefined);
  }
}
