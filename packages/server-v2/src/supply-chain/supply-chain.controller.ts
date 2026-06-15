import { Body, Controller, Delete, Get, Headers, Param, ParseIntPipe, Patch, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import {
  CreateSupplierDto,
  CreateSupplierOrderDto,
  GenerateSupplierSettlementDto,
  LinkProductSupplierDto,
  QuerySupplierOrdersDto,
  QuerySupplierSettlementsDto,
  QuerySuppliersDto,
  ReceiveSupplierOrderDto,
  UpdateSupplierDto,
  UpdateSupplierOrderStatusDto,
} from './dto/supply-chain.dto.js';
import { SupplyChainService } from './supply-chain.service.js';

@ApiTags('Supply Chain')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('supply-chain')
export class SupplyChainController {
  constructor(private supplyChainService: SupplyChainService) {}

  private storeIdFrom(headerStoreId?: string) {
    const value = Number(headerStoreId ?? 0);
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }

  @Get('suppliers')
  @Permissions('core:supply:view', 'core:supply:manage')
  @ApiOperation({ summary: '供应商列表' })
  getSuppliers(@Query() query: QuerySuppliersDto, @Headers('x-store-id') storeHeader?: string) {
    return this.supplyChainService.findSuppliers({
      ...query,
      storeId: query.storeId ?? this.storeIdFrom(storeHeader),
    });
  }

  @Get('suppliers/:id')
  @Permissions('core:supply:view', 'core:supply:manage')
  @ApiOperation({ summary: '供应商详情' })
  getSupplier(@Param('id', ParseIntPipe) id: number) {
    return this.supplyChainService.findSupplier(id);
  }

  @Post('suppliers')
  @Permissions('core:supply:manage')
  @ApiOperation({ summary: '创建供应商' })
  createSupplier(@Body() dto: CreateSupplierDto, @Headers('x-store-id') storeHeader?: string) {
    return this.supplyChainService.createSupplier(dto, this.storeIdFrom(storeHeader));
  }

  @Put('suppliers/:id')
  @Permissions('core:supply:manage')
  @ApiOperation({ summary: '更新供应商' })
  updateSupplier(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSupplierDto, @Headers('x-store-id') storeHeader?: string) {
    return this.supplyChainService.updateSupplier(id, dto, this.storeIdFrom(storeHeader));
  }

  @Delete('suppliers/:id')
  @Permissions('core:supply:manage')
  @ApiOperation({ summary: '归档供应商' })
  deleteSupplier(@Param('id', ParseIntPipe) id: number) {
    return this.supplyChainService.deleteSupplier(id);
  }

  @Post('suppliers/:id/products')
  @Permissions('core:supply:manage')
  @ApiOperation({ summary: '关联供应商产品' })
  linkProduct(@Param('id', ParseIntPipe) id: number, @Body() dto: LinkProductSupplierDto) {
    return this.supplyChainService.linkProduct(id, dto);
  }

  @Delete('suppliers/:id/products/:productId')
  @Permissions('core:supply:manage')
  @ApiOperation({ summary: '移除供应商产品关联' })
  unlinkProduct(@Param('id', ParseIntPipe) id: number, @Param('productId', ParseIntPipe) productId: number) {
    return this.supplyChainService.unlinkProduct(id, productId);
  }

  @Get('orders')
  @Permissions('core:supply:view', 'core:supply:manage')
  @ApiOperation({ summary: '供应链采购单列表' })
  getOrders(@Query() query: QuerySupplierOrdersDto, @Headers('x-store-id') storeHeader?: string) {
    return this.supplyChainService.findOrders({
      ...query,
      storeId: query.storeId ?? this.storeIdFrom(storeHeader),
    });
  }

  @Get('orders/:id')
  @Permissions('core:supply:view', 'core:supply:manage')
  @ApiOperation({ summary: '供应链采购单详情' })
  getOrder(@Param('id', ParseIntPipe) id: number) {
    return this.supplyChainService.findOrder(id);
  }

  @Post('orders')
  @Permissions('core:supply:manage')
  @ApiOperation({ summary: '创建供应链采购单' })
  createOrder(@Body() dto: CreateSupplierOrderDto, @Headers('x-store-id') storeHeader?: string) {
    return this.supplyChainService.createOrder(dto, this.storeIdFrom(storeHeader));
  }

  @Patch('orders/:id/status')
  @Permissions('core:supply:manage')
  @ApiOperation({ summary: '更新供应链采购单状态' })
  updateOrderStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSupplierOrderStatusDto) {
    return this.supplyChainService.updateOrderStatus(id, dto);
  }

  @Put('orders/:id/confirm')
  @Permissions('core:supply:manage')
  @ApiOperation({ summary: '确认供应链采购单' })
  confirmOrder(@Param('id', ParseIntPipe) id: number) {
    return this.supplyChainService.confirmOrder(id);
  }

  @Put('orders/:id/receive')
  @Permissions('core:supply:manage')
  @ApiOperation({ summary: '供应链采购单收货入库' })
  receiveOrderCompat(@Param('id', ParseIntPipe) id: number, @Body() dto: ReceiveSupplierOrderDto) {
    return this.supplyChainService.receiveOrder(id, dto);
  }

  @Post('orders/:id/receive')
  @Permissions('core:supply:manage')
  @ApiOperation({ summary: '供应链采购单收货入库' })
  receiveOrder(@Param('id', ParseIntPipe) id: number, @Body() dto: ReceiveSupplierOrderDto) {
    return this.supplyChainService.receiveOrder(id, dto);
  }

  @Put('orders/:id/settle')
  @Permissions('core:supply:manage')
  @ApiOperation({ summary: '标记供应链采购单已结算' })
  settleOrder(@Param('id', ParseIntPipe) id: number) {
    return this.supplyChainService.settleOrder(id);
  }

  @Get('settlements')
  @Permissions('core:supply:view', 'core:supply:manage')
  @ApiOperation({ summary: '供应商结算单列表' })
  getSettlements(@Query() query: QuerySupplierSettlementsDto) {
    return this.supplyChainService.findSettlements(query);
  }

  @Get('settlements/export')
  @Permissions('core:supply:manage')
  @ApiOperation({ summary: '导出供应商对账单' })
  async exportSettlements(@Query() query: QuerySupplierSettlementsDto, @Res() res: Response) {
    const file = await this.supplyChainService.exportSettlements(query);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.filename)}"`);
    res.send(file.content);
  }

  @Get('settlements/:id')
  @Permissions('core:supply:view', 'core:supply:manage')
  @ApiOperation({ summary: '供应商结算单详情' })
  getSettlement(@Param('id', ParseIntPipe) id: number) {
    return this.supplyChainService.findSettlement(id);
  }

  @Post('settlements/generate')
  @Permissions('core:supply:manage')
  @ApiOperation({ summary: '生成供应商月度结算单' })
  generateSettlement(@Body() dto: GenerateSupplierSettlementDto) {
    return this.supplyChainService.generateSettlement(dto);
  }

  @Put('settlements/:id/confirm')
  @Permissions('core:supply:manage')
  @ApiOperation({ summary: '确认供应商结算单' })
  confirmSettlement(@Param('id', ParseIntPipe) id: number) {
    return this.supplyChainService.confirmSettlement(id);
  }

  @Put('settlements/:id/mark-paid')
  @Permissions('core:supply:manage')
  @ApiOperation({ summary: '标记供应商结算单已付款' })
  markSettlementPaid(@Param('id', ParseIntPipe) id: number) {
    return this.supplyChainService.markSettlementPaid(id);
  }
}
