/**
 * 客户画像自动分类算法
 * 基于 RFM 模型变体 + 肌肤关键词推断
 */
import type { Customer } from '@/types';

// ========== 类型定义 ==========
export type SegmentType = '高价值客户' | '潜在价值客户' | '稳定客户' | '流失风险客户' | '新客户';
export type SkinCategory = '干性肌肤' | '油性肌肤' | '敏感肌肤' | '混合肌肤' | '中性肌肤' | '未分类';

export interface SegmentResult {
  segment: SegmentType;
  rScore: number; // 0-5
  fScore: number; // 0-5
  mScore: number; // 0-5
}

export interface SegmentStats {
  segment: SegmentType;
  customerCount: number;
  percentage: string;
  avgSpend: string;
  totalSpend: string;
  spendContribution: string;
  avgAge: number;
  characteristics: string[];
  customerIds: number[];
}

export interface SkinStats {
  skinType: SkinCategory;
  customerCount: number;
  percentage: string;
  avgSpend: string;
  avgAge: string;
  totalSpend: string;
  spendContribution: string;
  skinFeatures: string[];
  customerIds: number[];
  trend: string;
}

export interface BehaviorProfile {
  customerId: number;
  name: string;
  segment: SegmentType;
  skinType: SkinCategory;
  visitFrequency: string;
  avgSpend: string;
  preferredService: string;
  promotionSensitivity: string;
  repurchaseRate: string;
  loyalty: string;
  seasonalTrend: string;
}

// ========== RFM 评分 ==========
const TODAY = new Date(2026, 3, 11); // 当前日期

function daysSince(dateStr: string): number {
  if (!dateStr) return 9999;
  const d = new Date(dateStr);
  return Math.max(0, Math.floor((TODAY.getTime() - d.getTime()) / 86400000));
}

function monthsSinceCreated(createdAt: string): number {
  const d = new Date(createdAt);
  return Math.max(1, Math.floor((TODAY.getTime() - d.getTime()) / (30 * 86400000)));
}

function scoreR(lastVisitDate: string): number {
  const days = daysSince(lastVisitDate);
  if (days <= 14) return 5;
  if (days <= 30) return 4;
  if (days <= 60) return 3;
  if (days <= 120) return 2;
  if (days <= 365) return 1;
  return 0;
}

function scoreF(visitCount: number, createdAt: string): number {
  const months = monthsSinceCreated(createdAt);
  const freq = visitCount / months; // 月均到店
  if (freq >= 4) return 5;
  if (freq >= 2) return 4;
  if (freq >= 1) return 3;
  if (freq >= 0.5) return 2;
  if (freq > 0) return 1;
  return 0;
}

function scoreM(totalSpent: number): number {
  if (totalSpent >= 50000) return 5;
  if (totalSpent >= 20000) return 4;
  if (totalSpent >= 8000) return 3;
  if (totalSpent >= 3000) return 2;
  if (totalSpent > 0) return 1;
  return 0;
}

// ========== 客户细分 ==========
export function classifyCustomer(c: Customer): SegmentResult {
  const r = scoreR(c.lastVisitDate);
  const f = scoreF(c.visitCount, c.createdAt);
  const m = scoreM(c.totalSpent);

  let segment: SegmentType;
  const regDays = daysSince(c.createdAt);

  if (regDays <= 90 || c.visitCount <= 2) {
    segment = '新客户';
  } else if (r <= 1 || (r <= 2 && f <= 1)) {
    segment = '流失风险客户';
  } else if (r >= 4 && f >= 3 && m >= 4) {
    segment = '高价值客户';
  } else if (r >= 3 && (c.age != null && c.age < 35) && m <= 3) {
    segment = '潜在价值客户';
  } else {
    segment = '稳定客户';
  }

  return { segment, rScore: r, fScore: f, mScore: m };
}

export function computeSegmentStats(customers: Customer[]): SegmentStats[] {
  const groups: Record<SegmentType, Customer[]> = {
    '高价值客户': [], '潜在价值客户': [], '稳定客户': [], '流失风险客户': [], '新客户': [],
  };

  for (const c of customers) {
    const { segment } = classifyCustomer(c);
    groups[segment].push(c);
  }

  const totalSpentAll = customers.reduce((s, c) => s + c.totalSpent, 0);
  const order: SegmentType[] = ['高价值客户', '潜在价值客户', '稳定客户', '流失风险客户', '新客户'];

  const charMap: Record<SegmentType, string[]> = {
    '高价值客户': ['消费频次高', '客单价高', '忠诚度高'],
    '潜在价值客户': ['年轻群体', '消费潜力大', '价格敏感'],
    '稳定客户': ['定期消费', '服务满意', '推荐意愿强'],
    '流失风险客户': ['消费下降', '到店频次低', '需要唤醒'],
    '新客户': ['首次消费', '了解需求', '体验为主'],
  };

  return order.map((segment) => {
    const list = groups[segment];
    const count = list.length;
    const total = list.reduce((s, c) => s + c.totalSpent, 0);
    const avg = count > 0 ? Math.round(total / count) : 0;
    const avgAge = count > 0 ? Math.round(list.reduce((s, c) => s + (c.age || 30), 0) / count) : 0;
    return {
      segment,
      customerCount: count,
      percentage: customers.length > 0 ? `${Math.round(count / customers.length * 100)}%` : '0%',
      avgSpend: `¥${avg.toLocaleString()}`,
      totalSpend: total >= 10000 ? `¥${(total / 10000).toFixed(1)}万` : `¥${total.toLocaleString()}`,
      spendContribution: totalSpentAll > 0 ? `${Math.round(total / totalSpentAll * 100)}%` : '0%',
      avgAge,
      characteristics: charMap[segment],
      customerIds: list.map((c) => c.id),
    };
  });
}

// ========== 肌肤分类 ==========
const SKIN_KEYWORDS: Record<SkinCategory, string[]> = {
  '干性肌肤': ['干性', '混干', '缺水', '干纹', '偏干', '干性肌'],
  '油性肌肤': ['油性', '混油', '出油', '油腻', '油性肌'],
  '敏感肌肤': ['敏感', '泛红', '红血丝', '过敏', '敏感肌', '角质层薄'],
  '混合肌肤': ['混合', '混合肌', 'T区油', 'U区干'],
  '中性肌肤': ['中性', '水油平衡', '状态良好'],
  '未分类': [],
};

export function classifySkin(
  customer: Customer,
  healthProfile?: { skinType?: string; skinStatus?: string; mainProblems?: string }
): SkinCategory {
  // 1. 优先使用肌肤档案的 skinType
  if (healthProfile?.skinType) {
    const st = healthProfile.skinType;
    if (st.includes('干') && !st.includes('混')) return '干性肌肤';
    if (st.includes('油') && !st.includes('混')) return '油性肌肤';
    if (st === '敏感') return '敏感肌肤';
    if (st.includes('混干')) return '混合肌肤';
    if (st.includes('混油')) return '混合肌肤';
    if (st === '中性') return '中性肌肤';
  }

  // 2. 匹配 tags
  const tagStr = (customer.tags || []).join(' ');
  for (const [cat, keywords] of Object.entries(SKIN_KEYWORDS)) {
    if (cat === '未分类') continue;
    if (keywords.some((kw) => tagStr.includes(kw))) return cat as SkinCategory;
  }

  // 3. 匹配 skinCondition
  const sc = customer.skinCondition || '';
  if (sc) {
    for (const [cat, keywords] of Object.entries(SKIN_KEYWORDS)) {
      if (cat === '未分类') continue;
      if (keywords.some((kw) => sc.includes(kw))) return cat as SkinCategory;
    }
  }

  // 4. 匹配 healthProfile 的其他字段
  if (healthProfile) {
    const combined = `${healthProfile.skinStatus || ''} ${healthProfile.mainProblems || ''}`;
    for (const [cat, keywords] of Object.entries(SKIN_KEYWORDS)) {
      if (cat === '未分类') continue;
      if (keywords.some((kw) => combined.includes(kw))) return cat as SkinCategory;
    }
  }

  return '未分类';
}

export function computeSkinStats(
  customers: Customer[],
  healthProfiles: Array<{ customerId: number; skinType: string; skinStatus: string; mainProblems: string }>
): SkinStats[] {
  const profileMap = new Map<number, typeof healthProfiles[0]>();
  for (const p of healthProfiles) profileMap.set(p.customerId, p);

  const groups: Record<SkinCategory, Customer[]> = {
    '干性肌肤': [], '油性肌肤': [], '敏感肌肤': [], '混合肌肤': [], '中性肌肤': [], '未分类': [],
  };

  for (const c of customers) {
    const hp = profileMap.get(c.id);
    const cat = classifySkin(c, hp);
    groups[cat].push(c);
  }

  const totalSpentAll = customers.reduce((s, c) => s + c.totalSpent, 0);
  const order: SkinCategory[] = ['干性肌肤', '油性肌肤', '敏感肌肤', '混合肌肤', '中性肌肤'];

  const featuresMap: Record<string, string[]> = {
    '干性肌肤': ['缺水紧绷', '细纹明显', '易敏感'],
    '油性肌肤': ['出油旺盛', '毛孔粗大', '易生痘痘'],
    '敏感肌肤': ['易泛红', '角质层薄', '不耐受'],
    '混合肌肤': ['T区油腻', 'U区干燥', '需分区护理'],
    '中性肌肤': ['水油平衡', '肤质健康', '状态稳定'],
  };

  return order.map((skinType) => {
    const list = groups[skinType];
    const count = list.length;
    const total = list.reduce((s, c) => s + c.totalSpent, 0);
    const avg = count > 0 ? Math.round(total / count) : 0;
    const avgAge = count > 0 ? Math.round(list.reduce((s, c) => s + (c.age || 30), 0) / count) : 0;
    // 简单趋势：年轻群体多的类型增长快
    const youngRatio = count > 0 ? list.filter((c) => (c.age || 30) < 30).length / count : 0;
    const trend = youngRatio > 0.4 ? `+${Math.round(youngRatio * 30)}%` : `+${Math.round(youngRatio * 15)}%`;

    return {
      skinType,
      customerCount: count,
      percentage: customers.length > 0 ? `${Math.round(count / customers.length * 100)}%` : '0%',
      avgSpend: `¥${avg.toLocaleString()}`,
      avgAge: `${avgAge}岁`,
      totalSpend: total >= 10000 ? `¥${(total / 10000).toFixed(1)}万` : `¥${total.toLocaleString()}`,
      spendContribution: totalSpentAll > 0 ? `${Math.round(total / totalSpentAll * 100)}%` : '0%',
      skinFeatures: featuresMap[skinType] || [],
      customerIds: list.map((c) => c.id),
      trend,
    };
  });
}

// ========== 消费画像 ==========
export function computeBehaviorProfiles(
  customers: Customer[],
  consumptionRecords: Array<{ customerId: number; consumeType: string; amount: string; campaign: string; consumeTime: string }>,
  healthProfiles: Array<{ customerId: number; skinType: string; skinStatus: string; mainProblems: string }>
): BehaviorProfile[] {
  // 按客户聚合消费记录
  const recordsByCustomer = new Map<number, typeof consumptionRecords>();
  for (const r of consumptionRecords) {
    if (!recordsByCustomer.has(r.customerId)) recordsByCustomer.set(r.customerId, []);
    recordsByCustomer.get(r.customerId)!.push(r);
  }

  // 肌肤档案映射
  const profileMap = new Map<number, typeof healthProfiles[0]>();
  for (const p of healthProfiles) profileMap.set(p.customerId, p);

  // 所有客户，按消费金额排序
  const allCustomers = [...customers].sort((a, b) => b.totalSpent - a.totalSpent);

  return allCustomers.map((c) => {
    const { segment } = classifyCustomer(c);
    const records = recordsByCustomer.get(c.id) || [];
    const months = monthsSinceCreated(c.createdAt);
    const freqPerMonth = c.visitCount / months;

    let visitFrequency: string;
    if (freqPerMonth >= 8) visitFrequency = '每周2次';
    else if (freqPerMonth >= 4) visitFrequency = '每周1次';
    else if (freqPerMonth >= 2) visitFrequency = '每月2-3次';
    else if (freqPerMonth >= 1) visitFrequency = '每月1次';
    else if (c.visitCount <= 2) visitFrequency = '首次消费';
    else visitFrequency = '偶尔到店';

    const avgSpend = c.visitCount > 0 ? Math.round(c.totalSpent / c.visitCount) : 0;

    // 偏好服务：消费记录中最多的类型
    const typeCounts: Record<string, number> = {};
    for (const r of records) {
      typeCounts[r.consumeType] = (typeCounts[r.consumeType] || 0) + 1;
    }
    const preferredService = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '面部护理';

    // 促销敏感度
    const promoCount = records.filter((r) => r.campaign !== '无').length;
    const promoSensitivity = records.length > 0 ? Math.round(promoCount / records.length * 100) : 50;

    // 复购率 & 忠诚度
    const repurchase = c.visitCount > 1 ? Math.min(95, 50 + c.visitCount) : 0;
    const rScore = scoreR(c.lastVisitDate);
    const fScore = scoreF(c.visitCount, c.createdAt);
    const loyalty = Math.min(99, Math.round((rScore + fScore) / 10 * 100));

    // 季节趋势
    const monthCounts = new Array(4).fill(0); // Q1-Q4
    for (const r of records) {
      const m = parseInt(r.consumeTime.slice(5, 7));
      if (m <= 3) monthCounts[0]++;
      else if (m <= 6) monthCounts[1]++;
      else if (m <= 9) monthCounts[2]++;
      else monthCounts[3]++;
    }
    const maxQ = monthCounts.indexOf(Math.max(...monthCounts));
    const seasons = ['春季高峰', '夏季活跃', '秋季偏好', '冬季偏好'];
    const seasonalTrend = records.length >= 3 ? seasons[maxQ] : '待观察';

    const hp = profileMap.get(c.id);
    const skinType = classifySkin(c, hp);

    return {
      customerId: c.id,
      name: c.name,
      segment,
      skinType,
      visitFrequency,
      avgSpend: `¥${avgSpend.toLocaleString()}`,
      preferredService,
      promotionSensitivity: `${promoSensitivity}%`,
      repurchaseRate: `${repurchase}%`,
      loyalty: `${loyalty}%`,
      seasonalTrend,
    };
  });
}

// ========== AI 推荐文案 ==========
export const AI_RECOMMENDATIONS: Record<SegmentType, { confidence: string; title: string; description: string }> = {
  '高价值客户': { confidence: '95%', title: 'VIP专享护理套餐', description: '基于高消费能力和忠诚度，推荐高端定制服务' },
  '潜在价值客户': { confidence: '88%', title: '青春焕颜体验计划', description: '针对年轻群体推出性价比高的护理体验' },
  '稳定客户': { confidence: '92%', title: '老友回馈感恩节', description: '利用忠诚度营销，开展口碑传播活动' },
  '流失风险客户': { confidence: '78%', title: '挽回专属优惠', description: '通过个性化服务和优惠重新激活客户' },
  '新客户': { confidence: '85%', title: '新客专享试用礼', description: '低门槛体验活动提升转化和留存' },
};

export const SKIN_AI_RECOMMENDATIONS: Record<string, { confidence: string; title: string; description: string }> = {
  '干性肌肤': { confidence: '93%', title: '水润保湿护理季', description: '针对干性肌肤缺水问题，推荐深度补水护理方案' },
  '油性肌肤': { confidence: '87%', title: '清爽控油焕肤计划', description: '年轻油性肌肤群体，推出性价比高的油脂清洁套餐' },
  '敏感肌肤': { confidence: '91%', title: '温和舒缓修护计划', description: '高消费意愿群体，推荐温和无刺激的专业修护方案' },
  '混合肌肤': { confidence: '89%', title: '精准分区护理套餐', description: '最大肌肤群体，推出针对性分区护理解决方案' },
  '中性肌肤': { confidence: '85%', title: '轻奢养护体验', description: '肤质优良群体，推荐预防性护理和高端体验项目' },
};

export const SKIN_SERVICES: Record<string, string[]> = {
  '干性肌肤': ['深层补水', '抗衰护理', '温和修复'],
  '油性肌肤': ['深层清洁', '控油护理', '毛孔收缩'],
  '敏感肌肤': ['舒缓修复', '抗敏护理', '屏障修护'],
  '混合肌肤': ['水油平衡', '分区护理', '调理修护'],
  '中性肌肤': ['基础养护', '提亮美白', '抗氧化'],
};
