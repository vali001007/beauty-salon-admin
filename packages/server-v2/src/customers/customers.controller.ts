import {
  Controller, Get, Post, Put, Body, Param, Query, UseGuards, ParseIntPipe, Headers,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CustomersService } from './customers.service.js';
import { CustomerProfileService } from './customer-profile.service.js';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
import { UpdateCustomerDto } from './dto/update-customer.dto.js';
import { QueryCustomersDto } from './dto/query-customers.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';

@ApiTags('Customers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('customers')
export class CustomersController {
  constructor(
    private customersService: CustomersService,
    private customerProfileService: CustomerProfileService,
  ) {}

  @Get()
  @Permissions('core:customer:view')
  @ApiOperation({ summary: '获取客户列表' })
  findAll(@Headers('x-store-id') storeId?: string) {
    return this.customersService.findAll(storeId ? +storeId : undefined);
  }

  @Get('paginated')
  @Permissions('core:customer:view')
  @ApiOperation({ summary: '分页获取客户' })
  findPaginated(
    @Query() query: QueryCustomersDto,
    @Headers('x-store-id') storeId?: string,
  ) {
    return this.customersService.findPaginated(query, storeId ? +storeId : undefined);
  }

  @Get('card-portraits')
  @Permissions('core:customer:view')
  @ApiOperation({ summary: '分页获取客户卡项画像' })
  getCardPortraits(
    @Query() query: QueryCustomersDto,
    @Headers('x-store-id') storeId?: string,
  ) {
    return this.customersService.getCardPortraits(query, storeId ? +storeId : undefined);
  }

  @Get('consumption-records')
  @Permissions('core:customer:view')
  @ApiOperation({ summary: '获取客户消费记录' })
  getAllConsumptionRecords(@Headers('x-store-id') storeId?: string) {
    return this.customersService.getAllConsumptionRecords(storeId ? +storeId : undefined);
  }

  @Get('consumption-records/paginated')
  @Permissions('core:customer:view')
  @ApiOperation({ summary: '分页获取客户消费记录' })
  getConsumptionRecordsPaginated(
    @Query() query: PaginationDto & { keyword?: string },
    @Headers('x-store-id') storeId?: string,
  ) {
    return this.customersService.getConsumptionRecordsPaginated(query, storeId ? +storeId : undefined);
  }

  @Get('health-profiles')
  @Permissions('core:customer:view')
  @ApiOperation({ summary: '获取客户健康档案列表' })
  getAllHealthProfiles(@Headers('x-store-id') storeId?: string) {
    return this.customersService.getAllHealthProfiles(storeId ? +storeId : undefined);
  }

  @Get('miniapp-behavior-analysis')
  @Permissions('core:customer:profile')
  @ApiOperation({ summary: '获取客户小程序行为分析' })
  getMiniappBehaviorAnalysis(@Headers('x-store-id') storeId?: string) {
    return this.customersService.getMiniappBehaviorAnalysis(storeId ? +storeId : undefined);
  }

  @Get('segment-count')
  @Permissions('core:customer:view')
  @ApiOperation({ summary: '获取客户分群计数' })
  getSegmentCount(
    @Query() query: any,
    @Headers('x-store-id') storeId?: string,
  ) {
    return this.customersService.getSegmentCount({
      ...query,
      storeId: query.storeId ?? storeId,
    });
  }

  @Get('profile-analytics')
  @Permissions('core:customer:profile')
  @ApiOperation({ summary: '获取客户画像聚合分析' })
  getProfileAnalytics(@Headers('x-store-id') storeId?: string) {
    return this.customersService.getProfileAnalytics(storeId ? +storeId : undefined);
  }

  @Get('profile-analytics/overview')
  @Permissions('core:customer:profile')
  @ApiOperation({ summary: '获取客户画像首屏概览' })
  getProfileAnalyticsOverview(@Headers('x-store-id') storeId?: string) {
    return this.customersService.getProfileAnalyticsOverview(storeId ? +storeId : undefined);
  }

  @Get('profile-analytics/segment')
  @Permissions('core:customer:profile')
  @ApiOperation({ summary: '获取客户画像客户细分' })
  getProfileAnalyticsSegment(@Headers('x-store-id') storeId?: string) {
    return this.customersService.getProfileAnalyticsSegment(storeId ? +storeId : undefined);
  }

  @Get('profile-analytics/skin')
  @Permissions('core:customer:profile')
  @ApiOperation({ summary: '获取客户画像肌质分析' })
  getProfileAnalyticsSkin(@Headers('x-store-id') storeId?: string) {
    return this.customersService.getProfileAnalyticsSkin(storeId ? +storeId : undefined);
  }

  @Get('profile-analytics/behavior')
  @Permissions('core:customer:profile')
  @ApiOperation({ summary: '分页获取客户消费画像' })
  getProfileAnalyticsBehavior(
    @Query() query: PaginationDto & { segment?: string; skinType?: string },
    @Headers('x-store-id') storeId?: string,
  ) {
    return this.customersService.getProfileAnalyticsBehavior(query, storeId ? +storeId : undefined);
  }

  @Get('profile-analytics/prediction')
  @Permissions('core:customer:profile')
  @ApiOperation({ summary: '分页获取客户预测视角' })
  getProfileAnalyticsPrediction(
    @Query() query: PaginationDto,
    @Headers('x-store-id') storeId?: string,
  ) {
    return this.customersService.getProfileAnalyticsPrediction(query, storeId ? +storeId : undefined);
  }

  @Get(':id/profile')
  @Permissions('core:customer:view')
  @ApiOperation({ summary: '获取客户统一画像' })
  getCustomerProfile(@Param('id', ParseIntPipe) id: number) {
    return this.customerProfileService.getCustomerProfile(id);
  }

  @Get(':id')
  @Permissions('core:customer:view')
  @ApiOperation({ summary: '获取客户详情' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.customersService.findById(id);
  }

  @Post()
  @Permissions('core:customer:create')
  @ApiOperation({ summary: '创建客户' })
  create(@Body() dto: CreateCustomerDto) {
    return this.customersService.create(dto);
  }

  @Put(':id')
  @Permissions('core:customer:update')
  @ApiOperation({ summary: '更新客户' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCustomerDto) {
    return this.customersService.update(id, dto);
  }

  @Post('batch-delete')
  @Permissions('core:customer:delete')
  @ApiOperation({ summary: '批量删除客户' })
  batchDelete(@Body('ids') ids: number[]) {
    return this.customersService.remove(ids);
  }

  @Post('import')
  @Permissions('core:customer:create')
  @ApiOperation({ summary: '导入客户' })
  importCustomers(@Body() body: { customers?: CreateCustomerDto[]; data?: CreateCustomerDto[] }) {
    return this.customersService.importCustomers(body.customers ?? body.data ?? []);
  }

  @Get(':id/consumption-records/paginated')
  @Permissions('core:customer:view')
  @ApiOperation({ summary: '获取客户消费记录' })
  getConsumptionRecords(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: PaginationDto,
  ) {
    return this.customersService.getConsumptionRecords(id, query.page, query.pageSize);
  }

  @Get(':id/health-profile')
  @Permissions('core:customer:view')
  @ApiOperation({ summary: '获取客户健康档案' })
  getHealthProfile(@Param('id', ParseIntPipe) id: number) {
    return this.customersService.getHealthProfile(id);
  }

  @Put(':id/health-profile')
  @Permissions('core:customer:update')
  @ApiOperation({ summary: '更新客户健康档案' })
  updateHealthProfile(@Param('id', ParseIntPipe) id: number, @Body() data: any) {
    return this.customersService.upsertHealthProfile(id, data);
  }
}
