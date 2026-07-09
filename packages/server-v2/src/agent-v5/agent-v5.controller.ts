import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppendAgentMessageDto, CreateAgentRunDto } from '../agent/dto/create-agent-run.dto.js';
import type { AgentActor, AgentFieldScopes, AgentRole } from '../agent/agent.types.js';
import { CurrentDevice } from '../terminal/decorators/current-device.decorator.js';
import { DeviceAuthGuard } from '../terminal/guards/device-auth.guard.js';
import { AgentV5OrchestratorService } from './agent-v5-orchestrator.service.js';
import { AgentV5GovernanceReportService } from './governance/agent-v5-governance-report.service.js';

@ApiTags('Agent V5')
@ApiBearerAuth()
@UseGuards(DeviceAuthGuard)
@Controller('agent-v5')
export class AgentV5Controller {
  constructor(
    private readonly orchestrator: AgentV5OrchestratorService,
    private readonly governanceReport: AgentV5GovernanceReportService,
  ) {}

  @Post('runs')
  @ApiOperation({ summary: '创建 Agent V5 全业务 Ontology 经营运行任务' })
  createRun(
    @CurrentDevice('storeId') storeId: number,
    @CurrentDevice('userId') userId: number | undefined,
    @CurrentDevice('id') deviceId: number | undefined,
    @CurrentDevice('permissions') permissions: string[] | undefined,
    @CurrentDevice('fieldScopes') fieldScopes: AgentFieldScopes | undefined,
    @Body() dto: CreateAgentRunDto,
  ) {
    return this.orchestrator.createRun({
      message: dto.message,
      context: dto.context,
      actor: this.buildActor({ storeId, userId, deviceId, role: dto.role, entrypoint: dto.entrypoint, personaCode: dto.personaCode, permissions, fieldScopes }),
    });
  }

  @Get('runs')
  @ApiOperation({ summary: '分页查询 Agent V5 运行审计列表' })
  findRuns(
    @CurrentDevice('storeId') storeId: number | undefined,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('role') role?: string,
    @Query('personaCode') personaCode?: string,
    @Query('entrypoint') entrypoint?: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.orchestrator.findRuns({ page, pageSize, status, role, personaCode, entrypoint, keyword, storeId });
  }

  @Get('runs/:id/detail')
  @ApiOperation({ summary: '获取 Agent V5 运行审计详情' })
  getRunDetail(@Param('id', ParseIntPipe) id: number, @CurrentDevice('storeId') storeId: number | undefined) {
    return this.orchestrator.getRunDetail(id, storeId);
  }

  @Get('runs/:id')
  @ApiOperation({ summary: '获取 Agent V5 运行详情' })
  getRun(@Param('id', ParseIntPipe) id: number, @CurrentDevice('storeId') storeId: number | undefined) {
    return this.orchestrator.getRun(id, storeId);
  }

  @Get('governance/overview')
  @ApiOperation({ summary: 'Agent V5 治理中心概览' })
  getGovernanceOverview(@CurrentDevice('storeId') storeId: number) {
    return this.governanceReport.getOverview(Number(storeId));
  }

  @Get('governance/routes')
  @ApiOperation({ summary: 'Agent V5 Ontology Router 命中与能力覆盖' })
  getGovernanceRoutes(@CurrentDevice('storeId') storeId: number) {
    return this.governanceReport.getRoutes(Number(storeId));
  }

  @Get('governance/adapters')
  @ApiOperation({ summary: 'Agent V5 垂直 Ontology Adapter 覆盖' })
  getGovernanceAdapters() {
    return this.governanceReport.getAdapters();
  }

  @Get('governance/clarifications')
  @ApiOperation({ summary: 'Agent V5 模糊问法追问记录' })
  getGovernanceClarifications(@CurrentDevice('storeId') storeId: number) {
    return this.governanceReport.getClarifications(Number(storeId));
  }

  @Get('governance/memory')
  @ApiOperation({ summary: 'Agent V5 记忆使用概览' })
  getGovernanceMemory(@CurrentDevice('storeId') storeId: number) {
    return this.governanceReport.getMemory(Number(storeId));
  }

  @Get('governance/failures')
  @ApiOperation({ summary: 'Agent V5 失败诊断记录' })
  getGovernanceFailures(@CurrentDevice('storeId') storeId: number) {
    return this.governanceReport.getFailures(Number(storeId));
  }

  @Get('governance/eval')
  @ApiOperation({ summary: 'Agent V5 轻量评测指标' })
  getGovernanceEval(@CurrentDevice('storeId') storeId: number) {
    return this.governanceReport.getEval(Number(storeId));
  }

  @Post('runs/:id/messages')
  @ApiOperation({ summary: '向 Agent V5 运行追加消息并继续执行' })
  appendMessage(
    @Param('id', ParseIntPipe) id: number,
    @CurrentDevice('storeId') storeId: number,
    @CurrentDevice('userId') userId: number | undefined,
    @CurrentDevice('id') deviceId: number | undefined,
    @CurrentDevice('permissions') permissions: string[] | undefined,
    @CurrentDevice('fieldScopes') fieldScopes: AgentFieldScopes | undefined,
    @Body() dto: AppendAgentMessageDto,
  ) {
    return this.orchestrator.appendMessage({
      runId: id,
      message: dto.message,
      context: dto.context,
      actor: this.buildActor({ storeId, userId, deviceId, role: dto.role, entrypoint: dto.entrypoint, personaCode: dto.personaCode, permissions, fieldScopes }),
    });
  }

  private buildActor(input: {
    storeId: number;
    userId?: number;
    deviceId?: number;
    role?: AgentRole;
    entrypoint?: string;
    personaCode?: string;
    permissions?: string[];
    fieldScopes?: AgentFieldScopes;
  }): AgentActor {
    return {
      storeId: Number(input.storeId),
      userId: input.userId,
      deviceId: input.deviceId,
      role: input.role ?? 'manager',
      entrypoint: input.entrypoint ?? 'api',
      personaCode: input.personaCode,
      permissions: input.permissions,
      fieldScopes: input.fieldScopes,
    };
  }
}
