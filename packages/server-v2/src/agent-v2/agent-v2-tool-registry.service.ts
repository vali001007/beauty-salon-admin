import { Injectable } from '@nestjs/common';
import type { AgentToolDefinition, AgentToolExecutionContext, AgentToolResult } from '../agent/agent.types.js';
import { AgentV2BusinessActionDraftService } from './tools/agent-v2-business-action-draft.service.js';
import { AgentV2BusinessDetailQueryService } from './tools/agent-v2-business-detail-query.service.js';
import { AgentV2BusinessMetricQueryService } from './tools/agent-v2-business-metric-query.service.js';
import { AgentV2BusinessRecordQueryService } from './tools/agent-v2-business-record-query.service.js';
import { AgentV2BusinessTrendQueryService } from './tools/agent-v2-business-trend-query.service.js';
import { AgentV2NavigationService } from './tools/agent-v2-navigation.service.js';

@Injectable()
export class AgentV2ToolRegistryService {
  private readonly tools = new Map<string, AgentToolDefinition>();

  constructor(
    private readonly businessRecordQuery: AgentV2BusinessRecordQueryService,
    private readonly businessMetricQuery: AgentV2BusinessMetricQueryService,
    private readonly businessTrendQuery: AgentV2BusinessTrendQueryService,
    private readonly businessDetailQuery: AgentV2BusinessDetailQueryService,
    private readonly businessActionDraft: AgentV2BusinessActionDraftService,
    private readonly navigation: AgentV2NavigationService,
  ) {
    this.register({
      name: 'business.record.query',
      description: '执行 Agent V2 业务记录查询，返回授权后的表格数据和证据包',
      riskLevel: 'low',
      allowedRoles: ['manager', 'reception', 'beautician'],
      requiredPermissions: [],
      requiresApproval: false,
      outputKinds: ['table', 'evidence_panel'],
      maxRows: 2000,
      timeoutMs: 10_000,
      execute: (args, context) => this.businessRecordQuery.execute(args, context),
    });
    this.register({
      name: 'business.metric.query',
      description: '执行 Agent V2 业务指标查询，返回授权后的指标、趋势和证据包',
      riskLevel: 'low',
      allowedRoles: ['manager', 'reception', 'beautician'],
      requiredPermissions: [],
      requiresApproval: false,
      outputKinds: ['kpi', 'table', 'evidence_panel'],
      maxRows: 2000,
      timeoutMs: 10_000,
      execute: (args, context) => this.businessMetricQuery.execute(args, context),
    });
    this.register({
      name: 'business.trend.query',
      description: '执行 Agent V2 趋势查询，返回授权后的图表、表格、指标和证据包',
      riskLevel: 'low',
      allowedRoles: ['manager', 'reception', 'beautician'],
      requiredPermissions: [],
      requiresApproval: false,
      outputKinds: ['chart', 'kpi', 'table', 'evidence_panel'],
      maxRows: 5000,
      timeoutMs: 10_000,
      execute: (args, context) => this.businessTrendQuery.execute(args, context),
    });
    this.register({
      name: 'business.detail.query',
      description: '执行 Agent V2 业务详情查询，按编号定位单据并返回授权后的详情和证据包',
      riskLevel: 'low',
      allowedRoles: ['manager', 'reception', 'beautician'],
      requiredPermissions: [],
      requiresApproval: false,
      outputKinds: ['table', 'evidence_panel'],
      maxRows: 200,
      timeoutMs: 10_000,
      execute: (args, context) => this.businessDetailQuery.execute(args, context),
    });
    this.register({
      name: 'business.action.draft',
      description: '执行 Agent V2 动作草稿生成，只生成待确认草稿，不直接写入业务数据',
      riskLevel: 'medium',
      allowedRoles: ['manager', 'reception', 'beautician'],
      requiredPermissions: [],
      requiresApproval: false,
      outputKinds: ['action_card', 'evidence_panel'],
      maxRows: 20,
      timeoutMs: 10_000,
      execute: (args, context) => this.businessActionDraft.execute(args, context),
    });
    this.register({
      name: 'navigation.open',
      description: '执行 Agent V2 低风险页面导航，只打开入口，不写入业务数据',
      riskLevel: 'low',
      allowedRoles: ['manager', 'reception', 'beautician'],
      requiredPermissions: [],
      requiresApproval: false,
      outputKinds: ['action_card', 'evidence_panel'],
      maxRows: 1,
      timeoutMs: 3_000,
      execute: (args, context) => this.navigation.execute(args, context),
    });
  }

  list() {
    return Array.from(this.tools.values());
  }

  get(name: string) {
    return this.tools.get(name) ?? null;
  }

  async execute(name: string, args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const tool = this.get(name);
    if (!tool) {
      return {
        status: 'unsupported',
        title: 'V2 工具未注册',
        summary: `Agent V2 未注册工具：${name}。`,
        evidence: {
          source: ['AgentV2ToolRegistry'],
          metricDefinition: '未执行数据查询。',
          filters: [],
          sampleSize: 0,
          limitations: ['缺少对应 V2 工具实现。'],
        },
        actions: [],
      };
    }
    return tool.execute(args, context);
  }

  private register(tool: AgentToolDefinition) {
    this.tools.set(tool.name, tool);
  }
}
