import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, ParseIntPipe, Headers } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { BeauticiansService } from './beauticians.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';

@ApiTags('Beauticians')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class BeauticiansController {
  constructor(private beauticiansService: BeauticiansService) {}

  @Get('beauticians')
  @Permissions('core:store:beauticians')
  @ApiOperation({ summary: '获取美容师列表' })
  findAll(@Headers('x-store-id') storeId?: string) {
    return this.beauticiansService.findAll(storeId ? +storeId : undefined);
  }

  @Get('beauticians/paginated')
  @Permissions('core:store:beauticians')
  @ApiOperation({ summary: '分页获取美容师列表' })
  findPaginated(
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('keyword') keyword?: string,
    @Query('storeName') storeName?: string,
    @Headers('x-store-id') storeId?: string,
  ) {
    return this.beauticiansService.findPaginated(
      { page: page ? +page : undefined, pageSize: pageSize ? +pageSize : undefined, keyword, storeName },
      storeId ? +storeId : undefined,
    );
  }

  @Get('beauticians/:id')
  @Permissions('core:store:beauticians')
  @ApiOperation({ summary: '获取美容师详情' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.beauticiansService.findById(id);
  }

  @Post('beauticians')
  @Permissions('core:store:beauticians')
  @ApiOperation({ summary: '创建美容师' })
  create(@Body() dto: any, @Headers('x-store-id') storeId?: string) {
    return this.beauticiansService.create(dto, storeId ? +storeId : undefined);
  }

  @Put('beauticians/:id')
  @Permissions('core:store:beauticians')
  @ApiOperation({ summary: '更新美容师' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @Headers('x-store-id') storeId?: string) {
    return this.beauticiansService.update(id, dto, storeId ? +storeId : undefined);
  }

  @Delete('beauticians/:id')
  @Permissions('core:store:beauticians')
  @ApiOperation({ summary: '删除美容师' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.beauticiansService.remove(id);
  }

  // Levels
  @Get('beautician-levels')
  @Permissions('core:store:beautician-levels')
  @ApiOperation({ summary: '获取美容师等级列表' })
  findAllLevels() {
    return this.beauticiansService.findAllLevels();
  }

  @Post('beautician-levels')
  @Permissions('core:store:beautician-levels')
  @ApiOperation({ summary: '创建美容师等级' })
  createLevel(@Body() dto: any) {
    return this.beauticiansService.createLevel(dto);
  }

  @Put('beautician-levels/:id')
  @Permissions('core:store:beautician-levels')
  @ApiOperation({ summary: '更新美容师等级' })
  updateLevel(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.beauticiansService.updateLevel(id, dto);
  }

  @Post('beautician-levels/batch-delete')
  @Permissions('core:store:beautician-levels')
  @ApiOperation({ summary: '批量删除美容师等级' })
  removeLevels(@Body('ids') ids: number[]) {
    return this.beauticiansService.removeLevels(ids);
  }
}
