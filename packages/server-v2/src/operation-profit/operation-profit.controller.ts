import { Controller, Get, Headers, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import {
  QueryBeauticianPerformanceDto,
  QueryOperationProfitDto,
  QueryPrepaidLiabilitiesDto,
  QueryProductMarginsDto,
  QueryProjectMarginsDto,
} from './dto.js';
import { OperationProfitService } from './operation-profit.service.js';

@ApiTags('Operation Profit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('operation-profit')
export class OperationProfitController {
  constructor(private readonly operationProfitService: OperationProfitService) {}

  @Get('overview')
  @Permissions('core:operation-profit:view')
  @ApiOperation({ summary: '经营利润总览' })
  getOverview(@Query() query: QueryOperationProfitDto, @Headers('x-store-id') storeHeader?: string) {
    return this.operationProfitService.getOverview(query, storeHeader);
  }

  @Get('project-margins')
  @Permissions('core:project-margin:view', 'core:operation-profit:view')
  @ApiOperation({ summary: '项目毛利分析' })
  getProjectMargins(@Query() query: QueryProjectMarginsDto, @Headers('x-store-id') storeHeader?: string) {
    return this.operationProfitService.getProjectMargins(query, storeHeader);
  }

  @Get('product-margins')
  @Permissions('core:product-margin:view', 'core:operation-profit:view')
  @ApiOperation({ summary: '商品毛利分析' })
  getProductMargins(@Query() query: QueryProductMarginsDto, @Headers('x-store-id') storeHeader?: string) {
    return this.operationProfitService.getProductMargins(query, storeHeader);
  }

  @Get('prepaid-liabilities')
  @Permissions('core:prepaid-liability:view', 'core:operation-profit:view')
  @ApiOperation({ summary: '会员卡预收履约风险' })
  getPrepaidLiabilities(@Query() query: QueryPrepaidLiabilitiesDto, @Headers('x-store-id') storeHeader?: string) {
    return this.operationProfitService.getPrepaidLiabilities(query, storeHeader);
  }

  @Get('beautician-performance')
  @Permissions('core:beautician-performance:view', 'core:operation-profit:view')
  @ApiOperation({ summary: '员工人效分析' })
  getBeauticianPerformance(@Query() query: QueryBeauticianPerformanceDto, @Headers('x-store-id') storeHeader?: string) {
    return this.operationProfitService.getBeauticianPerformance(query, storeHeader);
  }
}
