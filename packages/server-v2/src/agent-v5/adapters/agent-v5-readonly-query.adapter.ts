import { Injectable } from '@nestjs/common';
import { AgentV3ControlledTextToSqlService, type AgentV3TextToSqlResult } from '../../agent-v3/text-to-sql/index.js';
import type { AgentActor, AuraResponseBlock } from '../../agent/agent.types.js';
import { AGENT_V5_ARCHITECTURE, type AgentV5AdapterResult } from '../agent-v5.types.js';

@Injectable()
export class AgentV5ReadonlyQueryAdapter {
  constructor(private readonly textToSql: AgentV3ControlledTextToSqlService) {}

  async run(input: {
    message: string;
    actor: AgentActor;
    context?: Record<string, unknown>;
  }): Promise<AgentV5AdapterResult> {
    const result = await this.textToSql.run({
      question: input.message,
      userId: input.actor.userId,
      storeIds: [input.actor.storeId].filter((value) => Number.isFinite(value)),
      permissions: input.actor.permissions ?? [],
      roleCodes: [input.actor.role, input.actor.personaCode].filter((value): value is string => Boolean(value)),
      fieldScopes: input.actor.fieldScopes,
      runtimeContext: {
        ...(input.context ?? {}),
        architecture: AGENT_V5_ARCHITECTURE,
        readOnlyVia: 'agent_v3_text_to_sql_service',
        agentCode: 'agent_v5',
      },
      mode: input.context?.agentV5Mode === 'execute' ? 'execute' : 'dry_run',
    });

    return {
      status: result.status === 'failed' ? 'failed' : result.status === 'blocked' ? 'blocked' : 'success',
      title: 'V5 事实问数',
      summary: result.answer ?? this.fallbackAnswer(result),
      data: result,
      evidence: {
        sources: ['AgentV3ControlledTextToSqlService', ...(result.evidence?.sourceViews ?? [])],
        domains: ['readonly_query'],
        concepts: ['facts', 'semantic_view'],
        filters: [
          result.evidence?.storeScope ?? `storeId=${input.actor.storeId}`,
          ...(result.evidence?.fieldPolicies ?? []).map((policy) => `${policy.field}:${policy.policy}`),
        ],
        sampleSize: result.rows?.length ?? 0,
        facts: (result.rows ?? []).slice(0, 5).map((row, index) => ({
          source: 'agent_v3_text_to_sql',
          id: index,
          label: `row_${index + 1}`,
          value: JSON.stringify(row),
        })),
        limitations: [
          'V5 仅复用 V3 只读 Text-to-SQL 服务，不创建或修改 V3 AgentRun。',
          ...(result.evidence?.limitations ?? []),
        ],
      },
      renderedBlocks: this.buildBlocks(result),
      failureReason: result.blockedReason,
    };
  }

  private fallbackAnswer(result: AgentV3TextToSqlResult) {
    if (result.status === 'blocked') return `只读问数被拦截：${result.blockedReason ?? '未通过安全策略'}`;
    if (!result.rows?.length) return '当前没有查询到符合条件的数据。';
    return `已通过 V3 只读问数服务返回 ${result.rows.length} 条事实记录。`;
  }

  private buildBlocks(result: AgentV3TextToSqlResult): AuraResponseBlock[] {
    const rows = result.rows ?? [];
    const first = rows[0] ?? {};
    const columns = Object.keys(first).slice(0, 8);
    const blocks: AuraResponseBlock[] = [
      { kind: 'summary_text', content: result.answer ?? this.fallbackAnswer(result), title: 'V5 事实问数' },
    ];
    if (columns.length) {
      blocks.push({
        kind: 'table',
        columns,
        rows: rows.slice(0, 12).map((row) => columns.map((column) => String((row as Record<string, unknown>)[column] ?? '-'))),
        caption: '来源：Agent V3 只读 Text-to-SQL 服务',
      });
    } else if (result.status === 'blocked') {
      blocks.push({
        kind: 'permission_notice',
        title: '只读查询被拦截',
        message: result.blockedReason ?? '当前问题未通过 SQL 安全或权限策略。',
      });
    }
    return blocks;
  }
}
