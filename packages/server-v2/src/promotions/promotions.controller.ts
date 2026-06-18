import { Body, Controller, Delete, Get, Headers, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { CreatePromotionDto, UpdatePromotionDto } from './dto.js';
import { PromotionsService } from './promotions.service.js';

@ApiTags('Promotions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('promotions')
export class PromotionsController {
  constructor(private promotionsService: PromotionsService) {}

  @Get()
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '获取优惠活动列表' })
  findAll(@Query() query: any, @Headers('x-store-id') storeId?: string) {
    return this.promotionsService.findAll({ ...query, storeId: query.storeId ?? storeId });
  }

  @Get('paginated')
  @Permissions('core:marketing:view')
  @ApiOperation({ summary: '分页获取优惠活动' })
  findPaginated(@Query() query: any, @Headers('x-store-id') storeId?: string) {
    return this.promotionsService.findPaginated({ ...query, storeId: query.storeId ?? storeId });
  }

  @Post()
  @Permissions('core:marketing:create')
  @ApiOperation({ summary: '创建优惠活动' })
  create(@Body() dto: CreatePromotionDto, @Headers('x-store-id') storeId?: string) {
    return this.promotionsService.create(dto, storeId ? Number(storeId) : undefined);
  }

  @Put(':id')
  @Permissions('core:marketing:update')
  @ApiOperation({ summary: '更新优惠活动' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePromotionDto, @Headers('x-store-id') storeId?: string) {
    return this.promotionsService.update(id, dto, storeId ? Number(storeId) : undefined);
  }

  @Delete(':id')
  @Permissions('core:marketing:delete')
  @ApiOperation({ summary: '删除优惠活动' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.promotionsService.remove(id);
  }

  @Post(':id/publish')
  @Permissions('core:marketing:update')
  @ApiOperation({ summary: '发布优惠活动' })
  publish(@Param('id', ParseIntPipe) id: number) {
    return this.promotionsService.publish(id);
  }

  @Post(':id/offline')
  @Permissions('core:marketing:update')
  @ApiOperation({ summary: '下线优惠活动' })
  offline(@Param('id', ParseIntPipe) id: number) {
    return this.promotionsService.offline(id);
  }
}
