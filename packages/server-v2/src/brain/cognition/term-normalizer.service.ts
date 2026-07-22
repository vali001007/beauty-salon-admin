import { Injectable } from '@nestjs/common';

export type BrainNormalizedTermType = 'metric' | 'dimension' | 'entity';

export interface BrainNormalizedTerm {
  raw: string;
  canonicalKey: string;
  label: string;
  type: BrainNormalizedTermType;
  index: number;
  end: number;
}

export interface BrainTermNormalizationResult {
  normalizedText: string;
  terms: BrainNormalizedTerm[];
  metrics: string[];
  dimensions: string[];
  unsupportedTerms: string[];
}

interface TermAlias {
  raw: string;
  canonicalKey: string;
  label: string;
  type: BrainNormalizedTermType;
}

const TERM_ALIASES: TermAlias[] = [
  { raw: '预约数', canonicalKey: 'appointment_count', label: '预约数', type: 'metric' },
  { raw: '预约', canonicalKey: 'appointment_count', label: '预约数', type: 'metric' },
  { raw: '实收流水', canonicalKey: 'paid_revenue', label: '实收流水', type: 'metric' },
  { raw: '流水', canonicalKey: 'paid_revenue', label: '实收流水', type: 'metric' },
  { raw: '业绩', canonicalKey: 'paid_revenue', label: '实收流水', type: 'metric' },
  { raw: '收入', canonicalKey: 'paid_revenue', label: '实收流水', type: 'metric' },
  { raw: '毛利率', canonicalKey: 'gross_margin_rate', label: '毛利率', type: 'metric' },
  { raw: '毛利', canonicalKey: 'gross_margin', label: '毛利额', type: 'metric' },
  { raw: '利润', canonicalKey: 'gross_margin', label: '毛利额', type: 'metric' },
  { raw: '到店率', canonicalKey: 'reservation_arrival_rate', label: '到店率', type: 'metric' },
  { raw: '次卡履约率', canonicalKey: 'card_consumption_rate', label: '次卡履约率', type: 'metric' },
  { raw: '次卡', canonicalKey: 'card_liability', label: '次卡/储值负债', type: 'metric' },
  { raw: '储值负债', canonicalKey: 'card_liability', label: '次卡/储值负债', type: 'metric' },
  { raw: '复购率', canonicalKey: 'repurchase_rate', label: '复购率', type: 'metric' },
  { raw: '复购', canonicalKey: 'repurchase_rate', label: '复购率', type: 'metric' },
  { raw: '客单价', canonicalKey: 'average_order_value', label: '客单价', type: 'metric' },
  { raw: '订单平均金额', canonicalKey: 'average_order_value', label: '客单价', type: 'metric' },
  { raw: '每笔订单平均收款', canonicalKey: 'average_order_value', label: '客单价', type: 'metric' },
  { raw: '人效', canonicalKey: 'staff_productivity', label: '人效', type: 'metric' },
  { raw: '缺货', canonicalKey: 'stockout_sku_count', label: '缺货 SKU 数', type: 'metric' },
  { raw: '临期库存', canonicalKey: 'expiring_stock_value', label: '临期库存金额', type: 'metric' },
  { raw: '营销 ROI', canonicalKey: 'marketing_roi', label: '营销 ROI', type: 'metric' },
  { raw: 'ROI', canonicalKey: 'marketing_roi', label: '营销 ROI', type: 'metric' },
  { raw: '投放效果', canonicalKey: 'marketing_roi', label: '营销 ROI', type: 'metric' },
  { raw: '本周', canonicalKey: 'date', label: '日期', type: 'dimension' },
  { raw: '这周', canonicalKey: 'date', label: '日期', type: 'dimension' },
  { raw: '上周', canonicalKey: 'date', label: '日期', type: 'dimension' },
  { raw: '今天', canonicalKey: 'date', label: '日期', type: 'dimension' },
  { raw: '本月', canonicalKey: 'month', label: '月份', type: 'dimension' },
  { raw: '这个月', canonicalKey: 'month', label: '月份', type: 'dimension' },
  { raw: '上个月', canonicalKey: 'month', label: '月份', type: 'dimension' },
  { raw: '美容师', canonicalKey: 'beautician', label: '美容师', type: 'dimension' },
  { raw: '门店', canonicalKey: 'store', label: '门店', type: 'dimension' },
];

@Injectable()
export class TermNormalizerService {
  normalize(text: string): BrainTermNormalizationResult {
    const matches = TERM_ALIASES.flatMap((alias) => this.findAll(text, alias));
    const terms = this.removeOverlaps(
      matches.sort((left, right) => left.index - right.index || right.raw.length - left.raw.length),
    );

    return {
      normalizedText: terms.reduce(
        (current, term) => current.replace(term.raw, `[${term.type}:${term.canonicalKey}]`),
        text,
      ),
      terms,
      metrics: this.uniqueKeys(terms, 'metric'),
      dimensions: this.uniqueKeys(terms, 'dimension'),
      unsupportedTerms: this.extractUnsupportedTerms(text, terms),
    };
  }

  private findAll(text: string, alias: TermAlias): BrainNormalizedTerm[] {
    const terms: BrainNormalizedTerm[] = [];
    let start = text.indexOf(alias.raw);

    while (start >= 0) {
      terms.push({
        ...alias,
        index: start,
        end: start + alias.raw.length,
      });
      start = text.indexOf(alias.raw, start + alias.raw.length);
    }

    return terms;
  }

  private removeOverlaps(terms: BrainNormalizedTerm[]) {
    const accepted: BrainNormalizedTerm[] = [];

    for (const term of terms) {
      const overlaps = accepted.some((item) => term.index < item.end && term.end > item.index);
      if (!overlaps) {
        accepted.push(term);
      }
    }

    return accepted.sort((left, right) => left.index - right.index);
  }

  private uniqueKeys(terms: BrainNormalizedTerm[], type: BrainNormalizedTermType) {
    const keys = new Set<string>();

    for (const term of terms) {
      if (term.type === type) {
        keys.add(term.canonicalKey);
      }
    }

    return Array.from(keys);
  }

  private extractUnsupportedTerms(text: string, terms: BrainNormalizedTerm[]) {
    const unsupported = new Set<string>();
    const matchedMetricRanges = terms.filter((term) => term.type === 'metric');
    const metricLikeTerms = text.match(/[\u4e00-\u9fa5A-Za-z0-9]+指数/g) ?? [];

    for (const raw of metricLikeTerms) {
      const index = text.indexOf(raw);
      const alreadyCovered = matchedMetricRanges.some((term) => index >= term.index && index + raw.length <= term.end);
      if (!alreadyCovered) {
        unsupported.add(raw);
      }
    }

    return Array.from(unsupported);
  }
}
