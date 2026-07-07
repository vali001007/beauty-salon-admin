import { Injectable } from '@nestjs/common';
import type {
  AgentV2SemanticView,
  AgentV2TextToSqlEvidence,
  AgentV2TextToSqlExecutionResult,
  AgentV2TextToSqlPlan,
} from './agent-v2-text-to-sql.types.js';

@Injectable()
export class AgentV2TextToSqlAnswerComposerService {
  compose(input: {
    question: string;
    plan: AgentV2TextToSqlPlan;
    execution: AgentV2TextToSqlExecutionResult;
    selectedViews: AgentV2SemanticView[];
  }) {
    if (input.execution.status === 'blocked') {
      return `受控 Text-to-SQL 已阻断：${input.execution.blockedReason ?? 'unknown'}。`;
    }
    if (input.execution.status === 'dry_run') {
      const views = input.selectedViews.map((viewDef) => viewDef.viewName).join('、') || '无';
      return `已生成受控只读查询计划，命中语义视图：${views}。当前为 dry-run，未访问数据库。`;
    }
    if (input.execution.status === 'failed') {
      return `受控 Text-to-SQL 查询执行失败：${input.execution.blockedReason ?? 'db_error'}。请在治理中心查看审计并按只读库、权限或超时配置排查。`;
    }
    if (!input.execution.rows.length) return '当前筛选范围内没有匹配数据。';
    return `已查询到 ${input.execution.rows.length} 条结果。`;
  }

  evidence(input: { selectedViews: AgentV2SemanticView[]; storeIds: number[] }): AgentV2TextToSqlEvidence {
    return {
      sourceViews: input.selectedViews.map((viewDef) => viewDef.viewName),
      storeScope: input.storeIds.length ? `限定门店：${input.storeIds.join(',')}` : '缺少门店范围',
      fieldPolicies: input.selectedViews.flatMap((viewDef) =>
        viewDef.fields.map((field) => ({
          field: `${viewDef.viewName}.${field.name}`,
          policy: field.policy,
        })),
      ),
      limitations: [
        '仅允许 SELECT 只读查询。',
        '仅允许访问 Agent V2 白名单语义视图。',
        '敏感字段按字段策略脱敏或禁止返回。',
      ],
    };
  }
}
