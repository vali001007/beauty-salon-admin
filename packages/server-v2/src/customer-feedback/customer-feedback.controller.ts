import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { CustomerFeedbackService } from './customer-feedback.service.js';
import {
  CreateCustomerFeedbackDto,
  CustomerFeedbackAnalyticsQueryDto,
  QueryCustomerFeedbackDto,
  UpdateCustomerFeedbackDto,
} from './dto/customer-feedback.dto.js';

@ApiTags('Customer Service Feedback')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('customer-feedback')
export class CustomerFeedbackController {
  constructor(private readonly service: CustomerFeedbackService) {}

  @Get()
  @Permissions('core:customer:view')
  @ApiOperation({ summary: '分页查询客户投诉、满意度与服务评价' })
  list(@Headers('x-store-id') storeId: string | undefined, @Query() query: QueryCustomerFeedbackDto) {
    return this.service.list(Number(storeId), query);
  }

  @Get('analytics')
  @Permissions('core:customer:view')
  @ApiOperation({ summary: '查询客户反馈总体与员工维度分析' })
  analytics(@Headers('x-store-id') storeId: string | undefined, @Query() query: CustomerFeedbackAnalyticsQueryDto) {
    return this.service.analytics(Number(storeId), query);
  }

  @Get(':id')
  @Permissions('core:customer:view')
  @ApiOperation({ summary: '查询客户反馈详情' })
  findOne(@Headers('x-store-id') storeId: string | undefined, @Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(Number(storeId), id);
  }

  @Post()
  @Permissions('core:customer:update')
  @ApiOperation({ summary: '录入投诉、满意度或服务评价' })
  create(
    @Headers('x-store-id') storeId: string | undefined,
    @CurrentUser('id') userId: number | undefined,
    @Body() dto: CreateCustomerFeedbackDto,
  ) {
    return this.service.create(Number(storeId), userId, dto);
  }

  @Put(':id')
  @Permissions('core:customer:update')
  @ApiOperation({ summary: '处理、解决或关闭客户反馈' })
  update(
    @Headers('x-store-id') storeId: string | undefined,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number | undefined,
    @Body() dto: UpdateCustomerFeedbackDto,
  ) {
    return this.service.update(Number(storeId), id, userId, dto);
  }
}
