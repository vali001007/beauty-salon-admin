import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { GapOpportunityService } from './gap-opportunity.service.js';
import {
  CreateGapBenefitDraftDto,
  CreateGapConfirmationDraftDto,
  CreateGapFollowUpTasksDto,
  GenerateGapCandidatesDto,
  QueryGapOpportunitiesDto,
} from './dto/gap-opportunity.dto.js';

@ApiTags('Scheduling Gap Opportunities')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('scheduling/gap-opportunities')
export class GapOpportunityController {
  constructor(private gapOpportunityService: GapOpportunityService) {}

  @Get()
  @Permissions('core:store:scheduling')
  @ApiOperation({ summary: '获取需求热力图空档机会' })
  list(@Headers('x-store-id') storeId: string | undefined, @Query() query: QueryGapOpportunitiesDto) {
    return this.gapOpportunityService.list({
      storeId: query.storeId ? Number(query.storeId) : storeId ? Number(storeId) : undefined,
      weekStart: query.weekStart,
    });
  }

  @Post(':id/candidates')
  @Permissions('core:store:scheduling')
  @ApiOperation({ summary: '重算空档候补客户' })
  candidates(
    @Headers('x-store-id') storeId: string | undefined,
    @Param('id') id: string,
    @Body() body: GenerateGapCandidatesDto,
  ) {
    return this.gapOpportunityService.refreshCandidates(Number(id), storeId ? Number(storeId) : undefined, body);
  }

  @Post(':id/follow-up-tasks')
  @Permissions('core:store:scheduling')
  @ApiOperation({ summary: '为空档候补客户创建店长跟进任务' })
  followUpTasks(
    @Headers('x-store-id') storeId: string | undefined,
    @CurrentUser('id') userId: number | undefined,
    @Param('id') id: string,
    @Body() body: CreateGapFollowUpTasksDto,
  ) {
    return this.gapOpportunityService.createFollowUpTasks(Number(id), storeId ? Number(storeId) : undefined, {
      ...body,
      createdById: userId,
    });
  }

  @Post(':id/confirmation-draft')
  @Permissions('core:store:scheduling')
  @ApiOperation({ summary: '生成空档补位确认消息草稿，不真实发送' })
  confirmationDraft(
    @Headers('x-store-id') storeId: string | undefined,
    @Param('id') id: string,
    @Body() body: CreateGapConfirmationDraftDto,
  ) {
    return this.gapOpportunityService.createConfirmationDraft(Number(id), storeId ? Number(storeId) : undefined, body);
  }

  @Post(':id/benefit-draft')
  @Permissions('core:store:scheduling')
  @ApiOperation({ summary: '生成空档补位个性化活动权益草稿，不真实推送' })
  benefitDraft(
    @Headers('x-store-id') storeId: string | undefined,
    @Param('id') id: string,
    @Body() body: CreateGapBenefitDraftDto,
  ) {
    return this.gapOpportunityService.createBenefitDraft(Number(id), storeId ? Number(storeId) : undefined, body);
  }
}
