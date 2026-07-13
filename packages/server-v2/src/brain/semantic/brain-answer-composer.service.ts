import { Injectable } from '@nestjs/common';

export type BrainAnswerComposerShape = 'scalar' | 'comparison' | 'ranking' | 'list';

export interface BrainAnswerComposerInput {
  shape: BrainAnswerComposerShape;
  label: string;
  metric: string;
  valueField?: string;
  rows: Array<Record<string, unknown>>;
}

@Injectable()
export class BrainAnswerComposerService {
  compose(input: BrainAnswerComposerInput) {
    if (input.shape === 'comparison') return this.composeComparison(input);
    if (input.shape === 'ranking') return this.composeRanking(input);
    if (input.shape === 'list') return this.composeList(input);
    return this.composeScalar(input);
  }

  private composeScalar(input: BrainAnswerComposerInput) {
    const value = this.numberValue(input.rows[0]?.[input.valueField ?? input.metric]);
    return `${input.label}为 ${this.formatValue(input.metric, value)}。`;
  }

  private composeComparison(input: BrainAnswerComposerInput) {
    const row = input.rows[0] ?? {};
    const current = this.numberValue(row.current_value);
    const previous = this.numberValue(row.previous_value);
    const delta = this.numberValue(row.delta_value);
    const rawRate = row.delta_rate;
    const rate = rawRate === null || rawRate === undefined ? undefined : this.numberValue(rawRate);
    const rateText = rate === undefined ? '上期为 0，变化率不计算' : `变化率为 ${(rate * 100).toFixed(1)}%`;
    return `${input.label}本期为 ${this.formatValue(input.metric, current)}，上期为 ${this.formatValue(input.metric, previous)}，差值为 ${this.formatValue(input.metric, delta)}，${rateText}。`;
  }

  private composeRanking(input: BrainAnswerComposerInput) {
    const firstRow = input.rows[0];
    if (!firstRow || (!firstRow.rank_label && !firstRow.dimension_label)) {
      return '当前查询需要排名结果，但 Ami Brain 只拿到了单值指标，系统已停止返回不匹配答案。';
    }

    return input.rows
      .slice(0, 5)
      .map((row, index) => {
        const label = String(row.rank_label ?? row.dimension_label ?? row.name ?? '未命名');
        const value = this.numberValue(row.metric_value ?? row[input.valueField ?? input.metric]);
        return `${index + 1}. ${label}：${this.formatValue(input.metric, value)}`;
      })
      .join('\n');
  }

  private composeList(input: BrainAnswerComposerInput) {
    const firstRow = input.rows[0];
    if (!firstRow || (!firstRow.item_label && !firstRow.dimension_label)) {
      return '当前查询需要名单结果，但 Ami Brain 只拿到了单值指标，系统已停止返回不匹配答案。';
    }

    return input.rows
      .slice(0, 10)
      .map((row) => `- ${String(row.item_label ?? row.dimension_label)}`)
      .join('\n');
  }

  private numberValue(value: unknown) {
    if (typeof value === 'number') return value;
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'string') return Number(value);
    if (value && typeof value === 'object' && 'toString' in value) return Number(value.toString());
    return 0;
  }

  private formatValue(metric: string, value: number) {
    const normalized = Number.isFinite(value) ? value : 0;
    if (metric.endsWith('_rate') || metric === 'repurchase_rate') return `${(normalized * 100).toFixed(1)}%`;
    if (metric.includes('revenue') || metric.includes('margin') || metric.includes('liability') || metric.includes('value')) {
      return `${normalized.toFixed(2)} 元`;
    }
    return String(Math.round(normalized));
  }
}
