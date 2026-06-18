import { Controller, Get, Put, Body, Query, UseGuards, Headers } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SchedulingService } from './scheduling.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';

@ApiTags('Scheduling')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('scheduling')
export class SchedulingController {
  constructor(private schedulingService: SchedulingService) {}

  @Get()
  @Permissions('core:store:scheduling')
  @ApiOperation({ summary: '获取排班' })
  findAll(
    @Headers('x-store-id') storeId?: string,
    @Query('date') date?: string,
    @Query('beauticianId') beauticianId?: string,
    @Query('weekStart') weekStart?: string,
  ) {
    return this.schedulingService.findAll(
      storeId ? +storeId : undefined,
      date,
      beauticianId ? +beauticianId : undefined,
      weekStart,
    );
  }

  @Put()
  @Permissions('core:store:scheduling')
  @ApiOperation({ summary: '保存排班' })
  save(@Headers('x-store-id') storeId: string | undefined, @Body() body: any) {
    return this.schedulingService.save(
      body?.schedules ?? [],
      storeId ? +storeId : undefined,
      body?.beauticianId ? +body.beauticianId : undefined,
      body?.weekStart,
    );
  }
}
