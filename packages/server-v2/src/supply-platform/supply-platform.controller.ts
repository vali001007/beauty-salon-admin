import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import {
  AuditSupplyQuoteDto,
  AuditSupplySkuDto,
  CreateProcurementOrderDto,
  CreateShipmentDto,
  CreateSupplierQualificationDto,
  CreateSupplyCatalogMappingDto,
  CreateSupplyQuoteDto,
  CreateSupplySkuDto,
  CreateSupplySupplierDto,
  GenerateSupplySettlementDto,
  QueryProcurementOrdersDto,
  QuerySupplyQuotesDto,
  QuerySupplySkusDto,
  QuerySupplySuppliersDto,
  ReceiveProcurementOrderDto,
  UpdateProcurementOrderStatusDto,
  UpdateSupplyQuoteDto,
  UpdateSupplySkuDto,
  UpdateSupplySupplierDto,
  UpdateSupplySupplierStatusDto,
} from './dto/supply-platform.dto.js';
import { SupplyPlatformService } from './supply-platform.service.js';

type SupplyPlatformRequest = Request & {
  user?: {
    id?: number;
    permissions?: string[];
    supplySupplierId?: number | null;
  };
};

@ApiTags('Supply Platform')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('supply-platform')
export class SupplyPlatformController {
  constructor(private supplyPlatformService: SupplyPlatformService) {}

  @Get('suppliers')
  @Permissions('core:supply:view', 'core:supply:manage', 'core:supply:supplier')
  @ApiOperation({ summary: '供应链平台供应商列表' })
  suppliers(@Query() query: QuerySupplySuppliersDto, @Req() req: SupplyPlatformRequest) {
    return this.supplyPlatformService.findSuppliers(query, req.user);
  }

  @Get('suppliers/:id')
  @Permissions('core:supply:view', 'core:supply:manage', 'core:supply:supplier')
  @ApiOperation({ summary: '供应链平台供应商详情' })
  supplier(@Param('id', ParseIntPipe) id: number, @Req() req: SupplyPlatformRequest) {
    return this.supplyPlatformService.findSupplier(id, req.user);
  }

  @Post('suppliers')
  @Permissions('core:supply:manage')
  @ApiOperation({ summary: '创建供应链平台供应商' })
  createSupplier(@Body() dto: CreateSupplySupplierDto) {
    return this.supplyPlatformService.createSupplier(dto);
  }

  @Patch('suppliers/:id')
  @Permissions('core:supply:manage', 'core:supply:supplier')
  @ApiOperation({ summary: '更新供应链平台供应商' })
  updateSupplier(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSupplySupplierDto, @Req() req: SupplyPlatformRequest) {
    return this.supplyPlatformService.updateSupplier(id, dto, req.user);
  }

  @Patch('suppliers/:id/status')
  @Permissions('core:supply:manage')
  @ApiOperation({ summary: '审核/启停供应商' })
  updateSupplierStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSupplySupplierStatusDto, @Req() req: SupplyPlatformRequest) {
    return this.supplyPlatformService.updateSupplierStatus(id, dto, req.user);
  }

  @Post('supplier-qualifications')
  @Permissions('core:supply:manage', 'core:supply:supplier')
  @ApiOperation({ summary: '提交供应商资质' })
  createQualification(@Body() dto: CreateSupplierQualificationDto, @Req() req: SupplyPlatformRequest) {
    return this.supplyPlatformService.createQualification(dto, req.user);
  }

  @Get('skus')
  @Permissions('core:supply:view', 'core:supply:manage', 'core:supply:supplier', 'core:inventory:purchase')
  @ApiOperation({ summary: '供应链商品列表' })
  skus(@Query() query: QuerySupplySkusDto, @Req() req: SupplyPlatformRequest) {
    return this.supplyPlatformService.findSkus(query, req.user);
  }

  @Get('skus/:id')
  @Permissions('core:supply:view', 'core:supply:manage', 'core:supply:supplier', 'core:inventory:purchase')
  @ApiOperation({ summary: '供应链商品详情' })
  sku(@Param('id', ParseIntPipe) id: number, @Req() req: SupplyPlatformRequest) {
    return this.supplyPlatformService.findSku(id, req.user);
  }

  @Post('skus')
  @Permissions('core:supply:manage', 'core:supply:supplier')
  @ApiOperation({ summary: '供应商提交商品' })
  createSku(@Body() dto: CreateSupplySkuDto, @Req() req: SupplyPlatformRequest) {
    return this.supplyPlatformService.createSku(dto, req.user);
  }

  @Patch('skus/:id')
  @Permissions('core:supply:manage', 'core:supply:supplier')
  @ApiOperation({ summary: '更新供应链商品' })
  updateSku(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSupplySkuDto, @Req() req: SupplyPlatformRequest) {
    return this.supplyPlatformService.updateSku(id, dto, req.user);
  }

  @Patch('skus/:id/audit')
  @Permissions('core:supply:manage')
  @ApiOperation({ summary: '审核供应链商品' })
  auditSku(@Param('id', ParseIntPipe) id: number, @Body() dto: AuditSupplySkuDto, @Req() req: SupplyPlatformRequest) {
    return this.supplyPlatformService.auditSku(id, dto, req.user);
  }

  @Get('quotes')
  @Permissions('core:supply:view', 'core:supply:manage', 'core:supply:supplier', 'core:inventory:purchase')
  @ApiOperation({ summary: '供应链报价列表' })
  quotes(@Query() query: QuerySupplyQuotesDto, @Req() req: SupplyPlatformRequest) {
    return this.supplyPlatformService.findQuotes(query, req.user);
  }

  @Post('quotes')
  @Permissions('core:supply:manage', 'core:supply:supplier')
  @ApiOperation({ summary: '供应商提交报价' })
  createQuote(@Body() dto: CreateSupplyQuoteDto, @Req() req: SupplyPlatformRequest) {
    return this.supplyPlatformService.createQuote(dto, req.user);
  }

  @Patch('quotes/:id')
  @Permissions('core:supply:manage', 'core:supply:supplier')
  @ApiOperation({ summary: '更新供应链报价' })
  updateQuote(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSupplyQuoteDto, @Req() req: SupplyPlatformRequest) {
    return this.supplyPlatformService.updateQuote(id, dto, req.user);
  }

  @Patch('quotes/:id/audit')
  @Permissions('core:supply:manage')
  @ApiOperation({ summary: '审核供应链报价' })
  auditQuote(@Param('id', ParseIntPipe) id: number, @Body() dto: AuditSupplyQuoteDto, @Req() req: SupplyPlatformRequest) {
    return this.supplyPlatformService.auditQuote(id, dto, req.user);
  }

  @Post('mappings')
  @Permissions('core:supply:manage', 'core:inventory:purchase')
  @ApiOperation({ summary: '绑定供应链商品与门店商品/行业商品模板' })
  createMapping(@Body() dto: CreateSupplyCatalogMappingDto) {
    return this.supplyPlatformService.createMapping(dto);
  }

  @Get('procurement/orders')
  @Permissions('core:supply:view', 'core:supply:manage', 'core:supply:supplier', 'core:inventory:purchase')
  @ApiOperation({ summary: '供应链平台采购订单列表' })
  orders(@Query() query: QueryProcurementOrdersDto, @Req() req: SupplyPlatformRequest) {
    return this.supplyPlatformService.findOrders(query, req.user);
  }

  @Get('procurement/orders/:id')
  @Permissions('core:supply:view', 'core:supply:manage', 'core:supply:supplier', 'core:inventory:purchase')
  @ApiOperation({ summary: '供应链平台采购订单详情' })
  order(@Param('id', ParseIntPipe) id: number, @Req() req: SupplyPlatformRequest) {
    return this.supplyPlatformService.findOrder(id, req.user);
  }

  @Post('procurement/orders')
  @Permissions('core:inventory:purchase', 'core:supply:manage')
  @ApiOperation({ summary: '创建供应链平台采购订单' })
  createOrder(@Body() dto: CreateProcurementOrderDto) {
    return this.supplyPlatformService.createOrder(dto);
  }

  @Patch('procurement/orders/:id/status')
  @Permissions('core:supply:manage', 'core:supply:supplier')
  @ApiOperation({ summary: '更新采购订单状态' })
  updateOrderStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProcurementOrderStatusDto, @Req() req: SupplyPlatformRequest) {
    return this.supplyPlatformService.updateOrderStatus(id, dto, req.user);
  }

  @Post('procurement/orders/:id/shipments')
  @Permissions('core:supply:manage', 'core:supply:supplier')
  @ApiOperation({ summary: '供应商发货' })
  createShipment(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateShipmentDto, @Req() req: SupplyPlatformRequest) {
    return this.supplyPlatformService.createShipment(id, dto, req.user);
  }

  @Post('procurement/orders/:id/receipts')
  @Permissions('core:inventory:purchase', 'core:supply:manage')
  @ApiOperation({ summary: '门店确认收货并入库' })
  receiveOrder(@Param('id', ParseIntPipe) id: number, @Body() dto: ReceiveProcurementOrderDto) {
    return this.supplyPlatformService.receiveOrder(id, dto);
  }

  @Get('settlements')
  @Permissions('core:supply:view', 'core:supply:manage', 'core:supply:supplier')
  @ApiOperation({ summary: '供应链平台供应商结算列表' })
  settlements(@Query() query: QueryProcurementOrdersDto, @Req() req: SupplyPlatformRequest) {
    return this.supplyPlatformService.findSettlements(query, req.user);
  }

  @Post('settlements/generate')
  @Permissions('core:supply:manage')
  @ApiOperation({ summary: '生成供应链平台供应商月结' })
  generateSettlement(@Body() dto: GenerateSupplySettlementDto) {
    return this.supplyPlatformService.generateSettlement(dto);
  }
}
