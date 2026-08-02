import { BadRequestException, Controller, Get, Headers, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import type { WorkbenchJwtUser } from './dashboard-workbench.types.js';
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
  getOverview(@Headers('x-store-id') storeId?: string, @Headers('x-perf-baseline') perfBaseline?: string) {
    const load = () => this.dashboardService.getOverview(storeId ? Number(storeId) : undefined);
    return perfBaseline === '1' ? this.dashboardService.measureDatabaseQueries(load) : load();
  }

  @Get('workbench')
  @Permissions('core:dashboard:view')
  @ApiOperation({ summary: '获取管理端角色化工作台' })
  getWorkbench(
    @CurrentUser() user: WorkbenchJwtUser,
    @Headers('x-store-id') storeId?: string,
    @Headers('x-perf-baseline') perfBaseline?: string,
    @Query('role') role?: string,
  ) {
    const parsedStoreId = storeId ? Number(storeId) : undefined;
    if (storeId && !Number.isFinite(parsedStoreId)) {
      throw new BadRequestException('门店 ID 无效');
    }
    const load = () => this.dashboardService.getWorkbench({ user, storeId: parsedStoreId, role });
    return perfBaseline === '1' ? this.dashboardService.measureDatabaseQueries(load) : load();
  }
}
