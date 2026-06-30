import { Controller, Get, Post, Put, Body, Param, Query, UseGuards, ParseIntPipe, Headers } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ReservationsService } from './reservations.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';

@ApiTags('Reservations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reservations')
export class ReservationsController {
  constructor(private reservationsService: ReservationsService) {}

  @Get('paginated')
  @Permissions('core:store:reservations')
  @ApiOperation({ summary: '分页获取预约' })
  findPaginated(
    @Headers('x-store-id') storeId?: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('status') status?: string,
    @Query('date') date?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('storeName') storeName?: string,
    @Query('userName') userName?: string,
    @Query('projectName') projectName?: string,
    @Query('beauticianName') beauticianName?: string,
    @Query('scope') scope?: string,
  ) {
    return this.reservationsService.findPaginated({
      page,
      pageSize,
      storeId: storeId ? +storeId : undefined,
      status,
      date,
      startDate,
      endDate,
      storeName,
      userName,
      projectName,
      beauticianName,
      scope,
    });
  }

  @Get(':id')
  @Permissions('core:store:reservations')
  @ApiOperation({ summary: '预约详情' })
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.reservationsService.findById(id);
  }

  @Post()
  @Permissions('core:store:reservations')
  @ApiOperation({ summary: '创建预约' })
  create(@Body() dto: any) {
    return this.reservationsService.create(dto);
  }

  @Put(':id')
  @Permissions('core:store:reservations')
  @ApiOperation({ summary: '更新预约' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.reservationsService.update(id, dto);
  }

  @Post(':id/confirm')
  @Permissions('core:store:reservations')
  @ApiOperation({ summary: '确认预约' })
  confirm(@Param('id', ParseIntPipe) id: number) {
    return this.reservationsService.confirm(id);
  }

  @Post(':id/check-in')
  @Permissions('core:store:reservations')
  @ApiOperation({ summary: '预约签到' })
  checkIn(@Param('id', ParseIntPipe) id: number) {
    return this.reservationsService.checkIn(id);
  }

  @Post(':id/cancel')
  @Permissions('core:store:reservations')
  @ApiOperation({ summary: '取消预约' })
  cancel(@Param('id', ParseIntPipe) id: number, @Body('reason') reason?: string) {
    return this.reservationsService.cancel(id, reason);
  }
}
