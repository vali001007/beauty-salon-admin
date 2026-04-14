/**
 * 高级营销分析算法
 * 1. 关联规则分析（交叉销售推荐）
 * 2. 流失概率评分
 * 3. LTV（客户生命周期价值）预测
 */
import type { Customer } from '@/types';

const TODAY = new Date(2026, 3, 11);
function daysSince(dateStr: string): number {
  if (!dateStr) return 9999;
  return Math.max(0, Math.floor((TODAY.getTime() - new Date(dateStr).getTime()) / 86400000));
}

// ========== 1. 关联规则分析 ==========

export interface AssociationRule {
  antecedent: string;   // 前项（如"面部护理"）
  consequent: string;   // 后项（如"玻尿酸精华液"）
  support: number;      // 支持度（同时出现的比例）
  confidence: number;   // 置信度（买A后买B的概率）
  lift: number;         // 提升度（>1表示正相关）
  count: number;        // 同时出现次数
}

export function computeAssociationRules(
  consumptionRecords: Array<{ customerId: number; consumeContent: string; consumeType: string }>
): AssociationRule[] {
  // 按客户聚合消费内容
  const customerItems = new Map<number, Set<string>>();
  for (const r of consumptionRecords) {
    if (!customerItems.has(r.customerId)) customerItems.set(r.customerId, new Set());
    // 提取核心项目名（去掉 x数量 后缀）
    const item = r.consumeContent.replace(/\s*x\d+$/, '').trim();
    customerItems.get(r.customerId)!.add(item);
  }

  const totalCustomers = customerItems.size;
  if (totalCustomers < 10) return [];

  // 统计单项频率
  const itemFreq = new Map<string, number>();
  for (const items of customerItems.values()) {
    for (const item of items) {
      itemFreq.set(item, (itemFreq.get(item) || 0) + 1);
    }
  }

  // 只保留出现次数 >= 5 的项目
  const frequentItems = [...itemFreq.entries()].filter(([, count]) => count >= 5).map(([item]) => item);

  // 统计两两共现频率
  const pairFreq = new Map<string, number>();
  for (const items of customerItems.values()) {
    const arr = [...items].filter((i) => frequentItems.includes(i));
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const key = [arr[i], arr[j]].sort().join('|||');
        pairFreq.set(key, (pairFreq.get(key) || 0) + 1);
      }
    }
  }

  // 生成关联规则
  const rules: AssociationRule[] = [];
  for (const [key, count] of pairFreq.entries()) {
    if (count < 3) continue;
    const [a, b] = key.split('|||');
    const freqA = itemFreq.get(a) || 1;
    const freqB = itemFreq.get(b) || 1;
    const support = count / totalCustomers;
    const confidenceAB = count / freqA;
    const confidenceBA = count / freqB;
    const liftAB = confidenceAB / (freqB / totalCustomers);

    if (confidenceAB >= 0.15) {
      rules.push({ antecedent: a, consequent: b, support, confidence: confidenceAB, lift: liftAB, count });
    }
    if (confidenceBA >= 0.15) {
      rules.push({ antecedent: b, consequent: a, support, confidence: confidenceBA, lift: liftAB, count });
    }
  }

  return rules.sort((a, b) => b.confidence - a.confidence).slice(0, 20);
}

// ========== 2. 流失概率评分 ==========

export interface ChurnScore {
  customerId: number;
  name: string;
  churnProbability: number;  // 0-100
  riskLevel: '极高' | '高' | '中' | '低';
  factors: string[];
  lastVisitDays: number;
  avgVisitGap: number;
  currentGap: number;
  memberLevel: string;
  totalSpent: number;
}

export function computeChurnScores(
  customers: Customer[],
  consumptionRecords: Array<{ customerId: number; consumeTime: string }>
): ChurnScore[] {
  // 按客户聚合消费时间
  const customerTimes = new Map<number, string[]>();
  for (const r of consumptionRecords) {
    if (!customerTimes.has(r.customerId)) customerTimes.set(r.customerId, []);
    customerTimes.get(r.customerId)!.push(r.consumeTime);
  }

  const scores: ChurnScore[] = [];

  for (const c of customers) {
    if (c.visitCount === 0) continue;

    const times = (customerTimes.get(c.id) || []).sort();
    const lastVisitDays = daysSince(c.lastVisitDate);

    // 计算平均到店间隔
    let avgGap = 30; // 默认30天
    if (times.length >= 2) {
      const gaps: number[] = [];
      for (let i = 1; i < times.length; i++) {
        const gap = daysSince(times[i - 1]) - daysSince(times[i]);
        if (gap > 0) gaps.push(gap);
      }
      if (gaps.length > 0) avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    }

    // 流失概率计算（多因子加权）
    let prob = 0;
    const factors: string[] = [];

    // 因子1: 到店间隔异常（权重40%）
    const gapRatio = lastVisitDays / Math.max(avgGap, 7);
    if (gapRatio > 3) { prob += 40; factors.push(`到店间隔是平均值的${gapRatio.toFixed(1)}倍`); }
    else if (gapRatio > 2) { prob += 30; factors.push(`到店间隔偏长`); }
    else if (gapRatio > 1.5) { prob += 15; factors.push(`到店间隔略长`); }

    // 因子2: 绝对天数（权重25%）
    if (lastVisitDays > 180) { prob += 25; factors.push(`超过6个月未到店`); }
    else if (lastVisitDays > 90) { prob += 18; factors.push(`超过3个月未到店`); }
    else if (lastVisitDays > 60) { prob += 10; factors.push(`超过2个月未到店`); }

    // 因子3: 消费趋势（权重20%）
    if (times.length >= 4) {
      const recentHalf = times.slice(Math.floor(times.length / 2));
      const earlyHalf = times.slice(0, Math.floor(times.length / 2));
      const recentFreq = recentHalf.length;
      const earlyFreq = earlyHalf.length;
      if (recentFreq < earlyFreq * 0.5) { prob += 20; factors.push('消费频率明显下降'); }
      else if (recentFreq < earlyFreq * 0.8) { prob += 10; factors.push('消费频率有所下降'); }
    }

    // 因子4: 会员等级（权重15%）
    if (c.memberLevel === '普通会员' || c.memberLevel === '无') { prob += 10; factors.push('会员等级较低'); }
    else if (c.memberLevel === '钻石会员' || c.memberLevel === '金卡会员') { prob -= 5; }

    prob = Math.max(0, Math.min(100, Math.round(prob)));

    let riskLevel: ChurnScore['riskLevel'];
    if (prob >= 70) riskLevel = '极高';
    else if (prob >= 45) riskLevel = '高';
    else if (prob >= 25) riskLevel = '中';
    else riskLevel = '低';

    scores.push({
      customerId: c.id,
      name: c.name,
      churnProbability: prob,
      riskLevel,
      factors: factors.length > 0 ? factors : ['暂无明显流失风险'],
      lastVisitDays,
      avgVisitGap: Math.round(avgGap),
      currentGap: lastVisitDays,
      memberLevel: c.memberLevel,
      totalSpent: c.totalSpent,
    });
  }

  return scores.sort((a, b) => b.churnProbability - a.churnProbability);
}

// ========== 3. LTV（客户生命周期价值）预测 ==========

export interface LTVPrediction {
  customerId: number;
  name: string;
  memberLevel: string;
  historicalLTV: number;       // 历史累计消费
  predictedLTV6M: number;     // 预测未来6个月消费
  predictedLTV12M: number;    // 预测未来12个月消费
  monthlyAvg: number;         // 月均消费
  trend: '上升' | '稳定' | '下降';
  ltvTier: '铂金' | '黄金' | '白银' | '青铜';
  confidence: number;         // 预测置信度 0-100
}

export function computeLTVPredictions(
  customers: Customer[],
  consumptionRecords: Array<{ customerId: number; amount: string; consumeTime: string }>
): LTVPrediction[] {
  // 按客户聚合月度消费
  const customerMonthly = new Map<number, Map<string, number>>();
  for (const r of consumptionRecords) {
    if (!customerMonthly.has(r.customerId)) customerMonthly.set(r.customerId, new Map());
    const monthKey = r.consumeTime.slice(0, 7); // "2026-04"
    const amount = parseFloat(r.amount.replace(/[¥,]/g, '')) || 0;
    const monthly = customerMonthly.get(r.customerId)!;
    monthly.set(monthKey, (monthly.get(monthKey) || 0) + amount);
  }

  const predictions: LTVPrediction[] = [];

  for (const c of customers) {
    if (c.visitCount === 0) continue;

    const monthly = customerMonthly.get(c.id);
    const regMonths = Math.max(1, Math.floor(daysSince(c.createdAt) / 30));

    // 月均消费
    const monthlyAvg = c.totalSpent / regMonths;

    // 趋势分析：比较前半段和后半段的月均消费
    let trend: LTVPrediction['trend'] = '稳定';
    if (monthly && monthly.size >= 4) {
      const entries = [...monthly.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      const mid = Math.floor(entries.length / 2);
      const earlyAvg = entries.slice(0, mid).reduce((s, [, v]) => s + v, 0) / mid;
      const lateAvg = entries.slice(mid).reduce((s, [, v]) => s + v, 0) / (entries.length - mid);
      if (lateAvg > earlyAvg * 1.2) trend = '上升';
      else if (lateAvg < earlyAvg * 0.7) trend = '下降';
    }

    // 预测未来消费（简单线性外推 + 趋势调整）
    let trendMultiplier = 1.0;
    if (trend === '上升') trendMultiplier = 1.15;
    else if (trend === '下降') trendMultiplier = 0.75;

    // 流失风险调整
    const lastDays = daysSince(c.lastVisitDate);
    let churnDiscount = 1.0;
    if (lastDays > 180) churnDiscount = 0.1;
    else if (lastDays > 90) churnDiscount = 0.4;
    else if (lastDays > 60) churnDiscount = 0.7;

    const predicted6M = Math.round(monthlyAvg * 6 * trendMultiplier * churnDiscount);
    const predicted12M = Math.round(monthlyAvg * 12 * trendMultiplier * churnDiscount * 0.95); // 12个月略打折

    // 置信度：数据越多越准
    const dataPoints = monthly?.size || 0;
    const confidence = Math.min(95, 30 + dataPoints * 8 + (c.visitCount > 20 ? 15 : 0));

    // LTV 分层
    const totalPredicted = c.totalSpent + predicted12M;
    let ltvTier: LTVPrediction['ltvTier'];
    if (totalPredicted >= 80000) ltvTier = '铂金';
    else if (totalPredicted >= 30000) ltvTier = '黄金';
    else if (totalPredicted >= 10000) ltvTier = '白银';
    else ltvTier = '青铜';

    predictions.push({
      customerId: c.id,
      name: c.name,
      memberLevel: c.memberLevel,
      historicalLTV: c.totalSpent,
      predictedLTV6M: predicted6M,
      predictedLTV12M: predicted12M,
      monthlyAvg: Math.round(monthlyAvg),
      trend,
      ltvTier,
      confidence,
    });
  }

  return predictions.sort((a, b) => (b.historicalLTV + b.predictedLTV12M) - (a.historicalLTV + a.predictedLTV12M));
}

// ========== 汇总统计 ==========

export interface AnalyticsSummary {
  topCrossSellingRules: AssociationRule[];
  highChurnCustomers: ChurnScore[];
  topLTVCustomers: LTVPrediction[];
  churnDistribution: { level: string; count: number; percentage: string }[];
  ltvDistribution: { tier: string; count: number; totalLTV: string; avgLTV: string }[];
}

export function computeAnalyticsSummary(
  customers: Customer[],
  consumptionRecords: Array<{ customerId: number; consumeContent: string; consumeType: string; amount: string; consumeTime: string }>
): AnalyticsSummary {
  const rules = computeAssociationRules(consumptionRecords);
  const churnScores = computeChurnScores(customers, consumptionRecords);
  const ltvPredictions = computeLTVPredictions(customers, consumptionRecords);

  // 流失分布
  const churnLevels = ['极高', '高', '中', '低'];
  const churnDist = churnLevels.map((level) => {
    const list = churnScores.filter((s) => s.riskLevel === level);
    return { level, count: list.length, percentage: churnScores.length > 0 ? `${Math.round(list.length / churnScores.length * 100)}%` : '0%' };
  });

  // LTV分布
  const ltvTiers = ['铂金', '黄金', '白银', '青铜'];
  const ltvDist = ltvTiers.map((tier) => {
    const list = ltvPredictions.filter((p) => p.ltvTier === tier);
    const total = list.reduce((s, p) => s + p.historicalLTV + p.predictedLTV12M, 0);
    const avg = list.length > 0 ? Math.round(total / list.length) : 0;
    return {
      tier,
      count: list.length,
      totalLTV: total >= 10000 ? `¥${(total / 10000).toFixed(1)}万` : `¥${total.toLocaleString()}`,
      avgLTV: `¥${avg.toLocaleString()}`,
    };
  });

  return {
    topCrossSellingRules: rules.slice(0, 10),
    highChurnCustomers: churnScores.filter((s) => s.churnProbability >= 45).slice(0, 20),
    topLTVCustomers: ltvPredictions.slice(0, 20),
    churnDistribution: churnDist,
    ltvDistribution: ltvDist,
  };
}
