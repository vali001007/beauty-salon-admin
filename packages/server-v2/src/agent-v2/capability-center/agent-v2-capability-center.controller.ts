import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { Permissions, Public } from '../../common/decorators/index.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { AgentV2DeployHookGuard } from './agent-v2-deploy-hook.guard.js';
import { AgentV2AutoPublishService } from './agent-v2-auto-publish.service.js';
import { AgentV2CapabilityCenterService } from './agent-v2-capability-center.service.js';
import {
  AgentV2AutoPublishRunDto,
  AgentV2AutoPublishRunListQueryDto,
  AgentV2CapabilityDraftListQueryDto,
  AgentV2DeployHookRunDto,
  AgentV2EvalGateDto,
  AgentV2ImportDraftsDto,
  AgentV2PostPublishSmokeDto,
  AgentV2PublishDto,
  AgentV2QueryKeyListQueryDto,
  AgentV2ReviewDraftDto,
  AgentV2StoreScopedBodyDto,
  AgentV2UpdateDraftDto,
} from './agent-v2-capability-center.dto.js';

type AuthedRequest = Request & { user?: { id?: number } };

@ApiTags('Agent V2 Capability Center')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('agent-v2/capability-center')
export class AgentV2CapabilityCenterController {
  constructor(
    private readonly capabilityCenter: AgentV2CapabilityCenterService,
    private readonly autoPublish: AgentV2AutoPublishService,
  ) {}

  @Get('drafts')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: '候选能力草稿列表' })
  listDrafts(@Query() query: AgentV2CapabilityDraftListQueryDto) {
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
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: '候选能力草稿详情' })
  getDraft(@Param('capabilityId') capabilityId: string) {
    return this.capabilityCenter.getDraft(capabilityId);
  }

  @Post('drafts/import')
  @Permissions('core:agent-governance:manage')
  @ApiOperation({ summary: '从扫描报告导入候选能力草稿' })
  importDrafts(@Body() body: AgentV2ImportDraftsDto) {
    return this.capabilityCenter.importDrafts(body);
  }

  @Patch('drafts/:capabilityId')
  @Permissions('core:agent-governance:manage')
  @ApiOperation({ summary: '更新候选能力草稿' })
  updateDraft(@Param('capabilityId') capabilityId: string, @Body() body: AgentV2UpdateDraftDto) {
    return this.capabilityCenter.updateDraft(capabilityId, body as Record<string, unknown>);
  }

  @Post('drafts/:capabilityId/validate')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: '预检候选能力草稿' })
  validateDraft(@Param('capabilityId') capabilityId: string) {
    return this.capabilityCenter.validateDraft(capabilityId);
  }

  @Post('drafts/:capabilityId/dry-run')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: '执行候选能力 queryKey dry-run' })
  dryRunDraft(@Param('capabilityId') capabilityId: string, @Body() body: AgentV2StoreScopedBodyDto, @Req() req: AuthedRequest) {
    return this.capabilityCenter.dryRunDraft(capabilityId, {
      storeId: body?.storeId,
      userId: req.user?.id,
    });
  }

  @Post('drafts/:capabilityId/eval-gate')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: '执行候选能力 Eval Gate' })
  runDraftEvalGate(@Param('capabilityId') capabilityId: string) {
    return this.capabilityCenter.runEvalGate({ capabilityIds: [capabilityId] });
  }

  @Post('drafts/:capabilityId/post-publish-smoke-test')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: '执行候选能力发布后烟测' })
  runPostPublishSmokeTest(
    @Param('capabilityId') capabilityId: string,
    @Body() body: AgentV2PostPublishSmokeDto,
    @Req() req: AuthedRequest,
  ) {
    return this.capabilityCenter.runPostPublishSmokeTest(capabilityId, {
      storeId: body?.storeId,
      question: body?.question,
      userId: req.user?.id,
    });
  }

  @Post('eval-gate')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: '执行 Agent V2 Eval Gate' })
  runEvalGate(@Body() body: AgentV2EvalGateDto = {}) {
    return this.capabilityCenter.runEvalGate(body);
  }

  @Post('auto-publish/run')
  @Permissions('core:agent-governance:manage')
  @ApiOperation({ summary: '手动触发 Agent V2 自动发布流水线' })
  runAutoPublish(
    @Body() body: AgentV2AutoPublishRunDto,
    @Req() req: AuthedRequest,
  ) {
    return this.autoPublish.run({
      trigger: 'manual',
      scanMode: body?.scanMode,
      path: body?.path,
      limit: body?.limit,
      overwriteReviewed: body?.overwriteReviewed,
      postPublishSmoke: body?.postPublishSmoke,
      postPublishSmokeLimit: body?.postPublishSmokeLimit,
      postPublishSmokeStoreId: body?.postPublishSmokeStoreId,
      title: body?.title,
      summary: body?.summary,
      requestedBy: req.user?.id,
    });
  }

  @Post('auto-publish/deploy-hook')
  @Public()
  @UseGuards(AgentV2DeployHookGuard)
  @ApiOperation({ summary: '部署钩子触发 Agent V2 自动发布流水线' })
  runAutoPublishDeployHook(
    @Body() body: AgentV2DeployHookRunDto,
  ) {
    return this.autoPublish.run({
      trigger: 'deploy_hook',
      scanMode: body?.scanMode ?? 'full',
      path: body?.path,
      limit: body?.limit,
      postPublishSmoke: body?.postPublishSmoke,
      postPublishSmokeLimit: body?.postPublishSmokeLimit,
      postPublishSmokeStoreId: body?.postPublishSmokeStoreId,
      title: body?.title,
      summary: body?.summary,
    });
  }

  @Get('auto-publish/runs')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: 'Agent V2 自动发布流水线日志' })
  listAutoPublishRuns(@Query() query: AgentV2AutoPublishRunListQueryDto) {
    return this.autoPublish.listRuns({
      page: Number(query.page),
      pageSize: Number(query.pageSize),
      status: query.status,
      trigger: query.trigger,
    });
  }

  @Get('auto-publish/runs/:id')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: 'Agent V2 自动发布流水线详情' })
  getAutoPublishRun(@Param('id', ParseIntPipe) id: number) {
    return this.autoPublish.getRun(id);
  }

  @Post('reviews')
  @Permissions('core:agent-governance:manage')
  @ApiOperation({ summary: '审核候选能力草稿' })
  reviewDraft(
    @Body() body: AgentV2ReviewDraftDto,
    @Req() req: AuthedRequest,
  ) {
    return this.capabilityCenter.reviewDraft({
      ...body,
      reviewerId: req.user?.id,
    });
  }

  @Post('publish')
  @Permissions('core:agent-governance:manage')
  @ApiOperation({ summary: '发布候选能力到 Agent V2 Manifest' })
  publish(
    @Body() body: AgentV2PublishDto,
    @Req() req: AuthedRequest,
  ) {
    return this.capabilityCenter.publish({
      ...body,
      publishedBy: req.user?.id,
    });
  }

  @Get('versions')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: 'Agent V2 Manifest 版本列表' })
  listVersions() {
    return this.capabilityCenter.listVersions();
  }

  @Post('versions/:id/activate')
  @Permissions('core:agent-governance:manage')
  @ApiOperation({ summary: '激活指定 Agent V2 Manifest 版本' })
  activateVersion(@Param('id', ParseIntPipe) id: number) {
    return this.capabilityCenter.activateVersion(id);
  }

  @Get('query-keys')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: 'Agent V2 QueryKey 工具登记列表' })
  listQueryKeys(@Query() query: AgentV2QueryKeyListQueryDto) {
    return this.capabilityCenter.listQueryKeys({
      status: query.status,
      domain: query.domain,
    });
  }
}
