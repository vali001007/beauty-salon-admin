import { Injectable } from '@nestjs/common';
import { AiService } from '../ai/ai.service.js';
import type { ReadOnlySqlView } from '../read-only-sql-kernel/read-only-sql-kernel.types.js';
import { ASK_DATA_ANSWER_SCHEMA, buildAnswerMessages } from './ask-data-free-sql.prompts.js';
import type { AskDataAnswer, AskDataFreeSqlContext } from './ask-data-free-sql.types.js';

@Injectable()
export class AskDataFreeSqlAnswerService {
  constructor(private readonly aiService: AiService) {}

  async compose(input: {
    question: string;
    explanation: string;
    rows: Array<Record<string, unknown>>;
    selectedViews: ReadOnlySqlView[];
    context: AskDataFreeSqlContext;
    timeRange: string;
    truncated: boolean;
  }): Promise<AskDataAnswer> {
    const fallback = this.fallback(input.rows, input.truncated);
    if (!input.rows.length) return { ...fallback, summary: '当前筛选范围内没有匹配数据。' };
    try {
      const result = await this.aiService.generateStructured<AskDataAnswer>({
        scenario: 'ask_data_free_sql_answer',
        messages: buildAnswerMessages({
          question: input.question,
          explanation: input.explanation,
          rows: input.rows.slice(0, 100),
          sources: input.selectedViews.map((view) => view.label),
          timeRange: input.timeRange,
          storeScope: `门店 ${input.context.storeId}`,
          truncated: input.truncated,
        }),
        schema: ASK_DATA_ANSWER_SCHEMA,
        timeoutMs: 15000,
        temperature: 0,
        userId: input.context.userId,
        storeId: input.context.storeId,
      });
      const answer = this.normalize(result.data, fallback);
      return this.isGrounded(answer, input.rows, input.timeRange)
        ? answer
        : {
            ...fallback,
            caveats: [...fallback.caveats, '模型总结包含结果外数字，已回退为确定性摘要。'],
          };
    } catch {
      return fallback;
    }
  }

  private normalize(value: AskDataAnswer, fallback: AskDataAnswer): AskDataAnswer {
    return {
      summary: String(value?.summary ?? '').trim() || fallback.summary,
      keyFindings: Array.isArray(value?.keyFindings)
        ? value.keyFindings
            .map(String)
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, 5)
        : [],
      caveats: Array.isArray(value?.caveats)
        ? value.caveats
            .map(String)
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, 5)
        : fallback.caveats,
      displayMode: ['table', 'ranking', 'trend', 'metric'].includes(value?.displayMode)
        ? value.displayMode
        : fallback.displayMode,
    };
  }

  private fallback(rows: Array<Record<string, unknown>>, truncated: boolean): AskDataAnswer {
    const first = rows[0] ?? {};
    const values = Object.entries(first)
      .slice(0, 3)
      .map(([key, value]) => `${key}=${this.formatValue(value)}`);
    return {
      summary: rows.length
        ? `已查询到 ${rows.length} 条结果${values.length ? `，首条为 ${values.join('、')}` : ''}。`
        : '当前筛选范围内没有匹配数据。',
      keyFindings: [],
      caveats: truncated ? ['结果超过展示上限，当前仅展示前 100 条。'] : [],
      displayMode: rows.length === 1 ? 'metric' : 'table',
    };
  }

  private isGrounded(answer: AskDataAnswer, rows: Array<Record<string, unknown>>, timeRange: string) {
    const evidence = new Set(this.extractNumbers(`${JSON.stringify(rows)} ${rows.length} ${timeRange}`));
    const claimed = this.extractNumbers([answer.summary, ...answer.keyFindings].join(' '));
    return claimed.every((number) => evidence.has(number));
  }

  private extractNumbers(value: string) {
    return (value.match(/-?\d+(?:\.\d+)?/g) ?? []).map((item) => String(Number(item)));
  }

  private formatValue(value: unknown) {
    if (value === null || value === undefined || value === '') return '-';
    // Match JSON/result-table serialization so deterministic summaries remain
    // grounded when pg returns DATE/TIMESTAMP values as JavaScript Date objects.
    if (value instanceof Date) return value.toISOString();
    // Keep the exact database number in deterministic fallbacks. Rounding here can
    // make the summary disagree with the result table and fail numeric grounding.
    if (typeof value === 'number') return String(value);
    return String(value).slice(0, 40);
  }
}
