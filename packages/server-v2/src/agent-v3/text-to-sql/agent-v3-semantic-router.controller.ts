import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { AgentV3SemanticRouterAdminService } from './agent-v3-semantic-router-admin.service.js';

type AuthedRequest = Request & {
  user?: {
    id?: number;
    permissions?: string[];
    roles?: Array<{ role?: { key?: string; permissions?: string[] } }>;
  };
};

type InspectBody = {
  question?: string;
};

type GenerateSnapshotBody = {
  generatedFromVersion?: string;
};

type FeedbackBody = {
  question?: string;
  expectedView?: string;
  feedbackText?: string;
  isWrongAnswer?: boolean;
};

@ApiTags('Agent V3 Semantic Router')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('agent-v3/semantic-router')
export class AgentV3SemanticRouterController {
  constructor(private readonly service: AgentV3SemanticRouterAdminService) {}

  @Post('inspect')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: '检查 Agent V3 语义路由结果' })
  inspect(@Body() body: InspectBody, @Req() req: AuthedRequest) {
    return this.service.inspect({
      question: body.question ?? '',
      roleCodes: this.roleCodes(req),
      permissions: this.permissions(req),
    });
  }

  @Get('snapshots')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: 'Agent V3 KG snapshot 列表' })
  listSnapshots(@Query() query: Record<string, string>) {
    return this.service.listSnapshots({
      page: Number(query.page),
      pageSize: Number(query.pageSize),
      status: query.status,
    });
  }

  @Get('snapshots/active')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: 'Agent V3 当前 active KG snapshot' })
  activeSnapshot() {
    return this.service.getActiveSnapshot();
  }

  @Post('snapshots/generate')
  @Permissions('core:agent-governance:manage')
  @ApiOperation({ summary: '从当前 V3 语义路由配置生成独立 KG snapshot' })
  generateSnapshot(@Body() body: GenerateSnapshotBody, @Req() req: AuthedRequest) {
    return this.service.generateSnapshot({
      createdBy: req.user?.id,
      generatedFromVersion: body.generatedFromVersion,
    });
  }

  @Post('snapshots/generate-from-agent-v2')
  @Permissions('core:agent-governance:manage')
  @ApiOperation({ summary: '以 Agent V2 KG 为离线参考生成 Agent V3 独立 KG snapshot' })
  generateSnapshotFromAgentV2(@Req() req: AuthedRequest) {
    return this.service.generateSnapshotFromAgentV2({
      createdBy: req.user?.id,
    });
  }

  @Post('snapshots/:id/activate')
  @Permissions('core:agent-governance:manage')
  @ApiOperation({ summary: '激活 Agent V3 KG snapshot' })
  activateSnapshot(@Param('id', ParseIntPipe) id: number, @Req() req: AuthedRequest) {
    return this.service.activateSnapshot({ id, activatedBy: req.user?.id });
  }

  @Post('feedback')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: '记录 Agent V3 语义路由反馈' })
  createFeedback(@Body() body: FeedbackBody, @Req() req: AuthedRequest) {
    return this.service.createFeedback({
      question: body.question ?? '',
      expectedView: body.expectedView,
      feedbackText: body.feedbackText,
      isWrongAnswer: body.isWrongAnswer ?? true,
      createdBy: req.user?.id,
      roleCodes: this.roleCodes(req),
      permissions: this.permissions(req),
    });
  }

  @Get('feedback')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: 'Agent V3 语义路由反馈列表' })
  listFeedback(@Query() query: Record<string, string>) {
    return this.service.listFeedback({
      page: Number(query.page),
      pageSize: Number(query.pageSize),
      status: query.status,
      isWrongAnswer: query.isWrongAnswer === undefined ? undefined : query.isWrongAnswer === 'true',
    });
  }

  @Post('feedback/:id/resolve')
  @Permissions('core:agent-governance:manage')
  @ApiOperation({ summary: '标记 Agent V3 语义路由反馈已处理' })
  resolveFeedback(@Param('id', ParseIntPipe) id: number, @Req() req: AuthedRequest) {
    return this.service.resolveFeedback({ id, resolvedBy: req.user?.id });
  }

  private permissions(req: Partial<AuthedRequest>) {
    const direct = Array.isArray(req.user?.permissions) ? req.user.permissions : [];
    const fromRoles = (req.user?.roles ?? []).flatMap((item) => (Array.isArray(item.role?.permissions) ? item.role.permissions : []));
    return [...new Set([...direct, ...fromRoles])];
  }

  private roleCodes(req: AuthedRequest) {
    return [...new Set((req.user?.roles ?? []).map((item) => item.role?.key).filter((value): value is string => Boolean(value)))];
  }
}
