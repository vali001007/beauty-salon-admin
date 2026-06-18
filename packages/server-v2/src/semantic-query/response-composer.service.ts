import { Injectable } from '@nestjs/common';
import type { SemanticQueryResult } from './query-plan.types.js';

type ComposedResultDetail = {
  title: string;
  items: Array<{ label: string; value: string }>;
};

export type ComposedSemanticQueryResponse = {
  title: string;
  status: SemanticQueryResult['status'];
  overview: {
    conclusion: string;
    reason?: string;
    suggestion?: string;
  };
  details: ComposedResultDetail[];
  nextActions: Array<{ label: string; action: string; riskLevel: string }>;
  userEvidence?: SemanticQueryResult['userEvidence'];
};

const INTERNAL_KEY_LABELS: Record<string, string> = {
  productName: '商品',
  projectName: '项目',
  customerName: '客户',
  beauticianName: '员工',
  cardName: '卡项',
  campaignName: '活动',
  date: '日期',
  revenue: '营业额',
  paidAmount: '实收金额',
  refundAmount: '退款金额',
  netAmount: '净收金额',
  orderCount: '订单数',
  customerCount: '客户数',
  averageOrderValue: '客单价',
  quantity: '销量',
  previousQuantity: '上期销量',
  growthQuantity: '增长数量',
  growthRateText: '增长率',
  salesAmount: '销售额',
  currentStock: '当前库存',
  safetyStock: '安全库存',
  stockGap: '库存缺口',
  totalBalance: '余额合计',
  cashBalance: '现金余额',
  giftBalance: '赠送余额',
  memberLevel: '会员等级',
  phone: '手机号',
  usageTimes: '核销次数',
  arrivalRateText: '到店率',
  reservationCount: '预约数',
  completedCount: '已完成',
  noShowCount: '未到店',
  score: '综合分',
  conversionRateText: '转化率',
  leadCount: '线索数',
  viewCount: '访问数',
};

const HIDDEN_KEYS = new Set([
  'id',
  'productId',
  'projectId',
  'customerId',
  'beauticianId',
  'campaignId',
  'cardId',
  'riskScore',
  'growthRate',
]);

const INTERNAL_VALUE_LABELS: Record<string, string> = {
  recommended: '建议优先跟进',
  opportunity: '有转化机会',
  high: '高',
  medium: '中',
  low: '低',
  completed: '已完成',
  pending: '待处理',
  active: '启用',
};

@Injectable()
export class ResponseComposerService {
  compose(result: SemanticQueryResult): ComposedSemanticQueryResponse {
    return {
      title: this.cleanText(result.title || 'Ami 智能问答'),
      status: result.status,
      overview: {
        conclusion: this.cleanText(result.summary || '已完成查询。'),
        reason: this.composeReason(result),
        suggestion: this.composeSuggestion(result),
      },
      details: this.composeDetails(result.rows),
      nextActions: result.actions.length
        ? result.actions.map((action) => ({
            label: this.cleanText(action.label),
            action: action.action,
            riskLevel: this.cleanText(action.riskLevel),
          }))
        : [{ label: '暂无待执行动作', action: 'none', riskLevel: '低' }],
      userEvidence: result.userEvidence,
    };
  }

  private composeReason(result: SemanticQueryResult) {
    if (result.status === 'no_data') return '当前业务数据不足，无法生成排行或趋势。';
    if (result.status === 'rejected') return this.cleanText(result.rejectedReason || '当前账号或查询条件不满足要求。');
    if (result.userEvidence?.dataSummary) return this.cleanText(result.userEvidence.dataSummary);
    return undefined;
  }

  private composeSuggestion(result: SemanticQueryResult) {
    if (result.actions.length) return `建议：${result.actions.map((action) => this.cleanText(action.label)).join('、')}`;
    if (result.status === 'success') return '建议结合明细安排下一步跟进。';
    return '建议补充查询条件后再试。';
  }

  private composeDetails(rows: Array<Record<string, unknown>>) {
    return rows.slice(0, 10).map((row, index) => {
      const title =
        this.valueOf(row, ['productName', 'projectName', 'customerName', 'beauticianName', 'cardName', 'campaignName', 'date']) || `明细 ${index + 1}`;
      return {
        title: this.cleanText(title),
        items: Object.entries(row)
          .filter(([key, value]) => !HIDDEN_KEYS.has(key) && value !== undefined && value !== null && value !== '')
          .map(([key, value]) => ({
            label: INTERNAL_KEY_LABELS[key] ?? this.fallbackLabel(key),
            value: this.cleanText(String(value)),
          }))
          .filter((item) => item.label && item.value)
          .slice(0, 8),
      };
    });
  }

  private valueOf(row: Record<string, unknown>, keys: string[]) {
    const value = keys.map((key) => row[key]).find((item) => item !== undefined && item !== null && item !== '');
    return value === undefined || value === null ? '' : String(value);
  }

  private fallbackLabel(key: string) {
    return INTERNAL_KEY_LABELS[key] ?? key.replace(/([A-Z])/g, ' $1').trim();
  }

  private cleanText(value: string) {
    return value.replace(/\b(recommended|opportunity|completed|pending|active|high|medium|low)\b/g, (match) => INTERNAL_VALUE_LABELS[match] ?? match);
  }
}
