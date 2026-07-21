import { Body, Controller, Get, Headers, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { CustomerWaitingService } from './customer-waiting.service.js';
import { CustomerWaitingAnalyticsQueryDto, EndCustomerWaitingDto, StartCustomerWaitingDto } from './dto/customer-waiting.dto.js';

@ApiTags('Customer Waiting')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('customer-waiting')
export class CustomerWaitingController {
  constructor(private readonly service: CustomerWaitingService) {}

  @Get('analytics')
  @Permissions('core:store:reservations')
  @ApiOperation({ summary: '查询客户等待、离店与采集覆盖率' })
  analytics(@Headers('x-store-id') storeId: string | undefined, @Query() query: CustomerWaitingAnalyticsQueryDto) {
    return this.service.analytics(Number(storeId), query);
  }

  @Post('reservations/:reservationId/start')
  @Permissions('core:store:reservations')
  @ApiOperation({ summary: '开始或更新预约客户等待记录' })
  start(
    @Headers('x-store-id') storeId: string | undefined,
    @CurrentUser('id') userId: number | undefined,
    @Param('reservationId', ParseIntPipe) reservationId: number,
    @Body() dto: StartCustomerWaitingDto,
  ) {
    return this.service.startForReservation(Number(storeId), userId, reservationId, dto.expectedWaitMinutes, 'manual');
  }

  @Post('episodes/:episodeId/served')
  @Permissions('core:store:reservations')
  @ApiOperation({ summary: '记录等待结束并开始服务' })
  served(
    @Headers('x-store-id') storeId: string | undefined,
    @CurrentUser('id') userId: number | undefined,
    @Param('episodeId', ParseIntPipe) episodeId: number,
  ) {
    return this.service.markServed(Number(storeId), userId, episodeId);
  }

  @Post('episodes/:episodeId/left')
  @Permissions('core:store:reservations')
  @ApiOperation({ summary: '记录客户离店及结构化原因' })
  left(
    @Headers('x-store-id') storeId: string | undefined,
    @CurrentUser('id') userId: number | undefined,
    @Param('episodeId', ParseIntPipe) episodeId: number,
    @Body() dto: EndCustomerWaitingDto,
  ) {
    return this.service.markLeft(Number(storeId), userId, episodeId, dto.reasonCode, dto.reasonNote);
  }
}
