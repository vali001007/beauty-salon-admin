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
  findAll(@Headers('x-store-id') storeId?: string, @Query('date') date?: string) {
    return this.schedulingService.findAll(storeId ? +storeId : undefined, date);
  }

  @Put()
  @Permissions('core:store:scheduling')
  @ApiOperation({ summary: '保存排班' })
  save(@Body('schedules') schedules: any[]) {
    return this.schedulingService.save(schedules);
  }
}
