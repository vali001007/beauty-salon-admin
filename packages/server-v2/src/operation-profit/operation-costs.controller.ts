import { Body, Controller, Delete, Get, Headers, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { CopyOperationCostsDto, CreateOperationCostDto, QueryOperationCostsDto, UpdateOperationCostDto } from './dto.js';
import { OperationCostsService } from './operation-costs.service.js';

@ApiTags('Operation Costs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('operation-costs')
export class OperationCostsController {
  constructor(private readonly operationCostsService: OperationCostsService) {}

  @Get()
  @Permissions('core:operation-cost:view')
  @ApiOperation({ summary: '经营成本列表' })
  findAll(@Query() query: QueryOperationCostsDto, @Headers('x-store-id') storeHeader?: string) {
    return this.operationCostsService.findAll(query, storeHeader);
  }

  @Post()
  @Permissions('core:operation-cost:manage')
  @ApiOperation({ summary: '创建经营成本' })
  create(@Body() dto: CreateOperationCostDto, @Headers('x-store-id') storeHeader?: string, @CurrentUser('id') userId?: number) {
    return this.operationCostsService.create(dto, storeHeader, userId);
  }

  @Patch(':id')
  @Permissions('core:operation-cost:manage')
  @ApiOperation({ summary: '更新经营成本' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateOperationCostDto) {
    return this.operationCostsService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('core:operation-cost:manage')
  @ApiOperation({ summary: '删除经营成本' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.operationCostsService.remove(id);
  }

  @Post('copy-from-previous-month')
  @Permissions('core:operation-cost:manage')
  @ApiOperation({ summary: '复制上月经营成本' })
  copyFromPreviousMonth(
    @Body() dto: CopyOperationCostsDto,
    @Headers('x-store-id') storeHeader?: string,
    @CurrentUser('id') userId?: number,
  ) {
    return this.operationCostsService.copyFromPreviousMonth(dto, storeHeader, userId);
  }
}
