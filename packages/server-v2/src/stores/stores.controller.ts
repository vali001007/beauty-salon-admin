import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { StoresService } from './stores.service.js';
import { CreateStoreDto } from './dto/create-store.dto.js';
import { UpdateStoreDto } from './dto/update-store.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';

@ApiTags('Stores')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('stores')
export class StoresController {
  constructor(private storesService: StoresService) {}

  @Get()
  @ApiOperation({ summary: '获取所有门店' })
  findAll() {
    return this.storesService.findAll();
  }

  @Get('accessible')
  @ApiOperation({ summary: '获取当前用户可访问的门店' })
  findAccessible(@CurrentUser('stores') storeIds: number[]) {
    return this.storesService.findAccessible(storeIds);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取门店详情' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.storesService.findById(id);
  }

  @Post()
  @Permissions('core:system:stores')
  @ApiOperation({ summary: '创建门店' })
  create(@Body() dto: CreateStoreDto) {
    return this.storesService.create(dto);
  }

  @Put(':id')
  @Permissions('core:system:stores')
  @ApiOperation({ summary: '更新门店' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateStoreDto) {
    return this.storesService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('core:system:stores')
  @ApiOperation({ summary: '删除门店' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.storesService.remove(id);
  }
}
