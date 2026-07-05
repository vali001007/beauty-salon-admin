import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppendAgentMessageDto, CreateAgentRunDto } from '../agent/dto/create-agent-run.dto.js';
import type { AgentActor, AgentFieldScopes, AgentRole } from '../agent/agent.types.js';
import { CurrentDevice } from '../terminal/decorators/current-device.decorator.js';
import { DeviceAuthGuard } from '../terminal/guards/device-auth.guard.js';
import { AgentV2OrchestratorService } from './agent-v2-orchestrator.service.js';

@ApiTags('Agent V2')
@ApiBearerAuth()
@UseGuards(DeviceAuthGuard)
@Controller('agent-v2')
export class AgentV2Controller {
  constructor(private readonly orchestrator: AgentV2OrchestratorService) {}

  @Post('runs')
  @ApiOperation({ summary: '创建 Agent V2 独立运行任务' })
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
  @ApiOperation({ summary: '分页查询 Agent V2 运行审计列表' })
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
  @ApiOperation({ summary: '获取 Agent V2 运行审计详情' })
  getRunDetail(@Param('id', ParseIntPipe) id: number, @CurrentDevice('storeId') storeId: number | undefined) {
    return this.orchestrator.getRunDetail(id, storeId);
  }

  @Get('runs/:id')
  @ApiOperation({ summary: '获取 Agent V2 运行详情' })
  getRun(@Param('id', ParseIntPipe) id: number, @CurrentDevice('storeId') storeId: number | undefined) {
    return this.orchestrator.getRun(id, storeId);
  }

  @Post('runs/:id/messages')
  @ApiOperation({ summary: '向 Agent V2 运行追加消息并继续执行' })
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

  @Get('tools')
  @ApiOperation({ summary: '获取 Agent V2 工具列表' })
  listTools() {
    return this.orchestrator.listTools();
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
