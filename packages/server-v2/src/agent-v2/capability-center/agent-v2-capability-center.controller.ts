import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { AgentV2CapabilityCenterService } from './agent-v2-capability-center.service.js';

type AuthedRequest = Request & { user?: { id?: number } };

@ApiTags('Agent V2 Capability Center')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('agent-v2/capability-center')
export class AgentV2CapabilityCenterController {
  constructor(private readonly capabilityCenter: AgentV2CapabilityCenterService) {}

  @Get('drafts')
  @Permissions('core:system:view')
  @ApiOperation({ summary: '候选能力草稿列表' })
  listDrafts(@Query() query: Record<string, string>) {
    return this.capabilityCenter.listDrafts({
      page: Number(query.page),
      pageSize: Number(query.pageSize),
      keyword: query.keyword,
      status: query.status,
      domain: query.domain,
      riskLevel: query.riskLevel,
      releaseStrategy: query.releaseStrategy,
    });
  }

  @Get('drafts/:capabilityId')
  @Permissions('core:system:view')
  @ApiOperation({ summary: '候选能力草稿详情' })
  getDraft(@Param('capabilityId') capabilityId: string) {
    return this.capabilityCenter.getDraft(capabilityId);
  }

  @Post('drafts/import')
  @Permissions('core:system:permissions')
  @ApiOperation({ summary: '从扫描报告导入候选能力草稿' })
  importDrafts(@Body() body: { path?: string; limit?: number; overwriteReviewed?: boolean }) {
    return this.capabilityCenter.importDrafts(body);
  }

  @Patch('drafts/:capabilityId')
  @Permissions('core:system:permissions')
  @ApiOperation({ summary: '更新候选能力草稿' })
  updateDraft(@Param('capabilityId') capabilityId: string, @Body() body: Record<string, unknown>) {
    return this.capabilityCenter.updateDraft(capabilityId, body);
  }

  @Post('drafts/:capabilityId/validate')
  @Permissions('core:system:view')
  @ApiOperation({ summary: '预检候选能力草稿' })
  validateDraft(@Param('capabilityId') capabilityId: string) {
    return this.capabilityCenter.validateDraft(capabilityId);
  }

  @Post('drafts/:capabilityId/dry-run')
  @Permissions('core:system:view')
  @ApiOperation({ summary: '执行候选能力 queryKey dry-run' })
  dryRunDraft(@Param('capabilityId') capabilityId: string, @Body() body: { storeId?: number }, @Req() req: AuthedRequest) {
    return this.capabilityCenter.dryRunDraft(capabilityId, {
      storeId: body?.storeId,
      userId: req.user?.id,
    });
  }

  @Post('drafts/:capabilityId/eval-gate')
  @Permissions('core:system:view')
  @ApiOperation({ summary: '执行候选能力 Eval Gate' })
  runDraftEvalGate(@Param('capabilityId') capabilityId: string) {
    return this.capabilityCenter.runEvalGate({ capabilityIds: [capabilityId] });
  }

  @Post('drafts/:capabilityId/post-publish-smoke-test')
  @Permissions('core:system:view')
  @ApiOperation({ summary: '执行候选能力发布后烟测' })
  runPostPublishSmokeTest(
    @Param('capabilityId') capabilityId: string,
    @Body() body: { storeId?: number; question?: string },
    @Req() req: AuthedRequest,
  ) {
    return this.capabilityCenter.runPostPublishSmokeTest(capabilityId, {
      storeId: body?.storeId,
      question: body?.question,
      userId: req.user?.id,
    });
  }

  @Post('eval-gate')
  @Permissions('core:system:view')
  @ApiOperation({ summary: '执行 Agent V2 Eval Gate' })
  runEvalGate(@Body() body: { capabilityIds?: string[] } = {}) {
    return this.capabilityCenter.runEvalGate(body);
  }

  @Post('reviews')
  @Permissions('core:system:permissions')
  @ApiOperation({ summary: '审核候选能力草稿' })
  reviewDraft(
    @Body() body: { capabilityId: string; decision: string; comment?: string; changes?: Record<string, unknown> },
    @Req() req: AuthedRequest,
  ) {
    return this.capabilityCenter.reviewDraft({
      ...body,
      reviewerId: req.user?.id,
    });
  }

  @Post('publish')
  @Permissions('core:system:permissions')
  @ApiOperation({ summary: '发布候选能力到 Agent V2 Manifest' })
  publish(
    @Body() body: { capabilityIds?: string[]; mode?: 'selected' | 'approved' | 'auto'; title?: string; summary?: string },
    @Req() req: AuthedRequest,
  ) {
    return this.capabilityCenter.publish({
      ...body,
      publishedBy: req.user?.id,
    });
  }

  @Get('versions')
  @Permissions('core:system:view')
  @ApiOperation({ summary: 'Agent V2 Manifest 版本列表' })
  listVersions() {
    return this.capabilityCenter.listVersions();
  }

  @Post('versions/:id/activate')
  @Permissions('core:system:permissions')
  @ApiOperation({ summary: '激活指定 Agent V2 Manifest 版本' })
  activateVersion(@Param('id', ParseIntPipe) id: number) {
    return this.capabilityCenter.activateVersion(id);
  }

  @Get('query-keys')
  @Permissions('core:system:view')
  @ApiOperation({ summary: 'Agent V2 QueryKey 工具登记列表' })
  listQueryKeys(@Query() query: Record<string, string>) {
    return this.capabilityCenter.listQueryKeys({
      status: query.status,
      domain: query.domain,
    });
  }
}
