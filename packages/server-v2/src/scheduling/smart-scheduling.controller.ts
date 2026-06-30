import { Body, Controller, Get, Headers, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { SmartSchedulingService } from './smart-scheduling.service.js';
import {
  EvaluateSmartSchedulingDto,
  OneClickSmartSchedulingDto,
  PreviewSmartSchedulingDto,
  PublishSmartSchedulingDto,
  RollbackSmartSchedulingDto,
} from './dto/smart-scheduling.dto.js';

@ApiTags('Smart Scheduling')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('scheduling')
export class SmartSchedulingController {
  constructor(private smartSchedulingService: SmartSchedulingService) {}

  @Post('smart/one-click')
  @Permissions('core:store:scheduling')
  @ApiOperation({ summary: '一键生成智能排班方案' })
  oneClick(
    @Headers('x-store-id') storeId: string | undefined,
    @CurrentUser('id') userId: number | undefined,
    @Body() body: OneClickSmartSchedulingDto,
  ) {
    return this.smartSchedulingService.oneClick({
      ...body,
      createdById: userId,
      storeId: body?.storeId ? Number(body.storeId) : storeId ? Number(storeId) : undefined,
    });
  }

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
  publish(
    @Headers('x-store-id') storeId: string | undefined,
    @CurrentUser('id') userId: number | undefined,
    @Body() body: PublishSmartSchedulingDto,
  ) {
    return this.smartSchedulingService.publish({
      ...body,
      createdById: userId,
      storeId: body?.storeId ? Number(body.storeId) : storeId ? Number(storeId) : undefined,
    });
  }

  @Post('smart/rollback')
  @Permissions('core:store:scheduling')
  @ApiOperation({ summary: '回滚到历史智能排班版本' })
  rollback(
    @Headers('x-store-id') storeId: string | undefined,
    @CurrentUser('id') userId: number | undefined,
    @Body() body: RollbackSmartSchedulingDto,
  ) {
    return this.smartSchedulingService.rollback({
      ...body,
      createdById: userId,
      storeId: body?.storeId ? Number(body.storeId) : storeId ? Number(storeId) : undefined,
    });
  }

  @Get('smart/runs')
  @Permissions('core:store:scheduling')
  @ApiOperation({ summary: '查看智能排班运行记录和发布版本' })
  runs(
    @Headers('x-store-id') storeId: string | undefined,
    @Query('weekStart') weekStart?: string,
    @Query('storeId') queryStoreId?: string,
  ) {
    return this.smartSchedulingService.runs({
      storeId: queryStoreId ? Number(queryStoreId) : storeId ? Number(storeId) : undefined,
      weekStart,
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
