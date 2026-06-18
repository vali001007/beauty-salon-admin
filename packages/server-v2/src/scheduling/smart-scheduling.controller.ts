import { Body, Controller, Get, Headers, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { SmartSchedulingService } from './smart-scheduling.service.js';
import {
  EvaluateSmartSchedulingDto,
  PreviewSmartSchedulingDto,
  PublishSmartSchedulingDto,
} from './dto/smart-scheduling.dto.js';

@ApiTags('Smart Scheduling')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('scheduling')
export class SmartSchedulingController {
  constructor(private smartSchedulingService: SmartSchedulingService) {}

  @Post('smart/preview')
  @Permissions('core:store:scheduling')
  @ApiOperation({ summary: '生成智能排班预览' })
  preview(@Headers('x-store-id') storeId: string | undefined, @Body() body: PreviewSmartSchedulingDto) {
    return this.smartSchedulingService.preview({
      ...body,
      storeId: body?.storeId ? Number(body.storeId) : storeId ? Number(storeId) : undefined,
    });
  }

  @Post('smart/evaluate')
  @Permissions('core:store:scheduling')
  @ApiOperation({ summary: '评估排班方案' })
  evaluate(@Headers('x-store-id') storeId: string | undefined, @Body() body: EvaluateSmartSchedulingDto) {
    return this.smartSchedulingService.evaluate({
      ...body,
      storeId: body?.storeId ? Number(body.storeId) : storeId ? Number(storeId) : undefined,
    });
  }

  @Post('smart/publish')
  @Permissions('core:store:scheduling')
  @ApiOperation({ summary: '发布智能排班方案' })
  publish(@Headers('x-store-id') storeId: string | undefined, @Body() body: PublishSmartSchedulingDto) {
    return this.smartSchedulingService.publish({
      ...body,
      storeId: body?.storeId ? Number(body.storeId) : storeId ? Number(storeId) : undefined,
    });
  }

  @Get('demand')
  @Permissions('core:store:scheduling')
  @ApiOperation({ summary: '获取排班需求热力图' })
  demand(
    @Headers('x-store-id') storeId: string | undefined,
    @Query('weekStart') weekStart?: string,
  ) {
    return this.smartSchedulingService.demand({
      storeId: storeId ? Number(storeId) : undefined,
      weekStart,
    });
  }
}
