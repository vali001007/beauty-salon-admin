import { Controller, Get, Headers, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { DashboardService } from './dashboard.service.js';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('overview')
  @Permissions('core:dashboard:view')
  @ApiOperation({ summary: '获取管理端仪表盘概览' })
  getOverview(@Headers('x-store-id') storeId?: string) {
    return this.dashboardService.getOverview(storeId ? Number(storeId) : undefined);
  }
}
