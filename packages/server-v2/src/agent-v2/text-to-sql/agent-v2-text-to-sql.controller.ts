import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { AgentV2ControlledTextToSqlService } from './agent-v2-controlled-text-to-sql.service.js';
import { AgentV2TextToSqlAuditService } from './agent-v2-text-to-sql-audit.service.js';
import { AgentV2TextToSqlCandidateService } from './agent-v2-text-to-sql-candidate.service.js';
import type { AgentV2TextToSqlExecutionMode } from './agent-v2-text-to-sql.types.js';

type AuthedRequest = Request & {
  user?: {
    id?: number;
    storeId?: number;
    permissions?: string[];
    roles?: Array<{ role?: { key?: string; permissions?: string[] } }>;
  };
};

type TextToSqlDryRunBody = {
  question?: string;
  storeId?: number;
  storeIds?: number[];
  mode?: AgentV2TextToSqlExecutionMode;
};

type GuardInspectBody = {
  sql?: string;
  storeId?: number;
  storeIds?: number[];
};

type FeedbackBody = {
  rating?: number;
  feedbackText?: string;
  isUseful?: boolean;
  isWrongAnswer?: boolean;
  isPermissionConcern?: boolean;
};

type PromoteCandidateBody = {
  clusterKey?: string;
};

@ApiTags('Agent V2 Governance Text-to-SQL')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('agent-v2/text-to-sql')
export class AgentV2TextToSqlController {
  constructor(
    private readonly service: AgentV2ControlledTextToSqlService,
    private readonly audit: AgentV2TextToSqlAuditService,
    private readonly candidates: AgentV2TextToSqlCandidateService,
  ) {}

  @Post('dry-run')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: '治理工具：受控 Text-to-SQL dry-run，不参与 Agent V2 用户运行链路自动兜底' })
  async dryRun(@Body() body: TextToSqlDryRunBody, @Req() req: AuthedRequest) {
    const result = await this.service.run({
      question: body.question ?? '',
      userId: req.user?.id,
      storeIds: this.storeIds(body, req),
      roleCodes: this.roleCodes(req),
      permissions: this.permissions(req),
      mode: 'dry_run',
    });
    return this.canManage(req) ? result : this.redactRawSqlForViewer(result);
  }

  @Post('execute')
  @Permissions('core:agent-governance:manage')
  @ApiOperation({ summary: '治理工具：受控 Text-to-SQL 只读执行，仅用于治理诊断/候选能力沉淀' })
  execute(@Body() body: TextToSqlDryRunBody, @Req() req: AuthedRequest) {
    return this.service.run({
      question: body.question ?? '',
      userId: req.user?.id,
      storeIds: this.storeIds(body, req),
      roleCodes: this.roleCodes(req),
      permissions: this.permissions(req),
      mode: 'execute',
    });
  }

  @Post('guard/inspect')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: '治理工具：检查 SQL 是否通过受控 Text-to-SQL Guard' })
  inspect(@Body() body: GuardInspectBody, @Req() req: AuthedRequest) {
    const result = this.service.inspectSql({
      sql: body.sql ?? '',
      storeIds: this.storeIds(body, req),
      roleCodes: this.roleCodes(req),
      permissions: this.permissions(req),
    });
    return this.canManage(req) ? result : this.redactRawSqlForViewer(result);
  }

  @Get('semantic-views')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: '治理工具：受控 Text-to-SQL 白名单语义视图' })
  listViews(@Query('includePlanned') includePlanned?: string, @Query('includeAdmin') includeAdmin?: string, @Req() req?: AuthedRequest) {
    return this.service.listSemanticViews({
      includePlanned: includePlanned === 'true',
      includeAdmin: includeAdmin === 'true' && this.canManage(req ?? {}),
    });
  }

  @Get('status')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: '治理工具：受控 Text-to-SQL 配置状态' })
  getStatus() {
    return this.service.getConfigStatus();
  }

  @Post('semantic-views/:id/test')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: '治理工具：受控 Text-to-SQL 语义视图 Guard 测试' })
  testSemanticView(@Param('id') id: string, @Body() body: GuardInspectBody, @Req() req: AuthedRequest) {
    const result = this.service.testSemanticView({
      viewName: id,
      storeIds: this.storeIds(body, req),
      roleCodes: this.roleCodes(req),
      permissions: this.permissions(req),
    });
    return this.canManage(req) ? result : this.redactRawSqlForViewer(result);
  }

  @Get('runs')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: '治理工具：受控 Text-to-SQL 审计运行列表' })
  async listRuns(@Query() query: Record<string, string>) {
    const result = await this.audit.listRuns({
      page: Number(query.page),
      pageSize: Number(query.pageSize),
      status: query.status,
      userId: query.userId ? Number(query.userId) : undefined,
    });
    return this.redactRawSqlForAudit(result);
  }

  @Get('runs/:id')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: '治理工具：受控 Text-to-SQL 审计运行详情' })
  async getRun(@Param('id', ParseIntPipe) id: number) {
    const result = await this.audit.getRun(id);
    return this.redactRawSqlForAudit(result);
  }

  @Post('runs/:id/feedback')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: '治理工具：记录受控 Text-to-SQL 用户反馈' })
  createFeedback(@Param('id', ParseIntPipe) id: number, @Body() body: FeedbackBody, @Req() req: AuthedRequest) {
    return this.audit.createFeedback({
      runId: id,
      userId: req.user?.id,
      rating: body.rating,
      feedbackText: body.feedbackText,
      isUseful: body.isUseful,
      isWrongAnswer: body.isWrongAnswer,
      isPermissionConcern: body.isPermissionConcern,
    });
  }

  @Post('runs/:id/promote')
  @Permissions('core:agent-governance:manage')
  @ApiOperation({ summary: '治理工具：将单条受控 Text-to-SQL 审计运行沉淀为能力草稿' })
  promoteRun(@Param('id', ParseIntPipe) id: number, @Req() req: AuthedRequest) {
    return this.candidates.promoteRunToDraft({
      runId: id,
      requestedBy: req.user?.id,
    });
  }

  @Get('candidates')
  @Permissions('core:agent-governance:view')
  @ApiOperation({ summary: '治理工具：受控 Text-to-SQL 高频候选能力' })
  listCandidates(@Query('limit') limit?: string, @Query('minHitCount') minHitCount?: string) {
    return this.candidates.listCandidates({
      limit: limit ? Number(limit) : undefined,
      minHitCount: minHitCount ? Number(minHitCount) : undefined,
    });
  }

  @Post('candidates/promote')
  @Permissions('core:agent-governance:manage')
  @ApiOperation({ summary: '治理工具：将受控 Text-to-SQL 高频候选沉淀为能力草稿' })
  promoteCandidate(@Body() body: PromoteCandidateBody, @Req() req: AuthedRequest) {
    return this.candidates.promoteToDraft({
      clusterKey: body.clusterKey ?? '',
      requestedBy: req.user?.id,
    });
  }

  private storeIds(body: { storeId?: number; storeIds?: number[] }, req: AuthedRequest) {
    const values = body.storeIds?.length ? body.storeIds : [body.storeId ?? req.user?.storeId].filter((value): value is number => typeof value === 'number');
    return [...new Set(values)];
  }

  private permissions(req: Partial<AuthedRequest>) {
    const direct = Array.isArray(req.user?.permissions) ? req.user.permissions : [];
    const fromRoles = (req.user?.roles ?? []).flatMap((item) => (Array.isArray(item.role?.permissions) ? item.role.permissions : []));
    return [...new Set([...direct, ...fromRoles])];
  }

  private roleCodes(req: AuthedRequest) {
    return [...new Set((req.user?.roles ?? []).map((item) => item.role?.key).filter((value): value is string => Boolean(value)))];
  }

  private canManage(req: Partial<AuthedRequest>) {
    const permissions = this.permissions(req);
    return permissions.includes('*') || permissions.includes('core:agent-governance:manage');
  }

  private redactRawSqlForViewer<T>(value: T): T {
    return this.redactRawSqlValue(value) as T;
  }

  private redactRawSqlForAudit<T>(value: T): T {
    return this.redactRawSqlValue(value, undefined, '审计接口仅展示 redactedSql 和 SQL hash') as T;
  }

  private redactRawSqlValue(value: unknown, key?: string, replacement = '仅 core:agent-governance:manage 可查看'): unknown {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') {
      if (/^(generatedSql|safeSql|sql)$/i.test(key ?? '')) return replacement;
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) return value.map((item) => this.redactRawSqlValue(item, key, replacement));
    if (typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
        entryKey,
        this.redactRawSqlValue(entryValue, entryKey, replacement),
      ]),
    );
  }
}
