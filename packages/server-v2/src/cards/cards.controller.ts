import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CardsService } from './cards.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';

@ApiTags('Cards')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('cards')
export class CardsController {
  constructor(private cardsService: CardsService) {}

  @Get()
  @Permissions('core:goods:cards')
  @ApiOperation({ summary: '获取次卡列表' })
  findAll() {
    return this.cardsService.findAll();
  }

  @Get(':id')
  @Permissions('core:goods:cards')
  @ApiOperation({ summary: '获取次卡详情' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.cardsService.findById(id);
  }

  @Post()
  @Permissions('core:goods:cards')
  @ApiOperation({ summary: '创建次卡' })
  create(@Body() dto: any) {
    return this.cardsService.create(dto);
  }

  @Put(':id')
  @Permissions('core:goods:cards')
  @ApiOperation({ summary: '更新次卡' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.cardsService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('core:goods:cards')
  @ApiOperation({ summary: '删除次卡' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.cardsService.remove(id);
  }

  @Post('customer-cards')
  @Permissions('core:order:card-orders')
  @ApiOperation({ summary: '客户次卡开卡' })
  createCustomerCard(@Body() dto: any, @CurrentUser('id') userId?: number) {
    return this.cardsService.createCustomerCard(dto, userId);
  }

  @Post('verify-usage')
  @Permissions('core:order:card-usage')
  @ApiOperation({ summary: '次卡核销' })
  verifyUsage(@Body() dto: any, @CurrentUser('id') userId?: number) {
    return this.cardsService.verifyCardUsage({ ...dto, operatorId: dto.operatorId ?? userId });
  }

  @Post('usage')
  @Permissions('core:order:card-usage')
  @ApiOperation({ summary: '次卡核销（兼容入口）' })
  createUsage(@Body() dto: any, @CurrentUser('id') userId?: number) {
    return this.cardsService.verifyCardUsage({ ...dto, operatorId: dto.operatorId ?? userId });
  }
}
