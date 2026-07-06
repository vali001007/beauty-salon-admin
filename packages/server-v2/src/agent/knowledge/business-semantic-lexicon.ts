import type { BusinessObjectType } from './knowledge.types.js';

const COMMON_FILLER_TERMS = [
  '请',
  '帮我',
  '麻烦',
  '一下',
  '查一下',
  '查询',
  '查看',
  '看看',
  '列出',
  '列一下',
  '发我',
  '给我',
  '给一下',
  '在哪里',
  '在哪',
  '复制',
];

const TIME_TERMS = ['今天', '今日', '昨天', '本月', '这个月', '上月', '最近', '近期', '近30天', '近一个月'];

const ACTION_TERMS = [
  '活动链接',
  '小程序路径',
  '小程序码',
  '二维码',
  '链接',
  '状态',
  '权益',
  '剩余次数',
  '剩几次',
  '还剩几次',
  '还剩',
  '几次',
  '到期',
  '库存',
  '补货',
  '临期',
  '缺货',
  '还够吗',
  '够吗',
  '够不够',
  '卖得好吗',
  '卖得好',
  '服务次数',
  '趋势',
  '业绩',
  '绩效',
  '排班',
  '提成',
  '表现',
  '明细',
  '详情',
  '打印',
];

const OBJECT_HINT_TERMS: Record<BusinessObjectType, string[]> = {
  MarketingActivity: ['营销活动', '推广活动', '优惠活动', '召回活动', '活动'],
  MarketingPage: ['推广页', '活动页', 'H5'],
  Customer: ['客户', '会员', '顾客'],
  InventoryProduct: ['库存商品', '商品', '产品', 'SKU', 'sku', '耗材'],
  Project: ['服务项目', '护理项目', '项目', '服务', '疗程', '加项'],
  Beautician: ['美容师', '员工', '店员', '顾问', '技师'],
  StaffEfficiency: ['人效', '员工人效', '员工效率', '员工表现', '表现排行', '服务完成率', '员工业绩'],
  Order: ['订单', '单号', '流水', '收银', '付款', '支付', '退款', '退费', '办卡', '充值', '核销'],
  MemberCard: ['卡项', '会员卡', '次卡', '疗程卡', '权益卡', '卡'],
  Reservation: ['预约', '项目预约', '到店', '约客', '约定时间'],
  Schedule: ['排班', '班表', '在岗', '请假', '空闲', '已预约'],
  Supplier: ['供应商', '供货商', '采购商'],
  Terminal: ['终端', '智能终端', '收银终端', '小票', '设备'],
  Automation: ['自动化', '自动触达', '自动任务', '规则'],
  FinanceMetric: ['财务', '收入', '成本', '利润', '毛利', '提成', '结算'],
  BusinessOverview: ['经营概览', '经营看板', '数据概览', '总览', '汇总'],
  Unknown: [],
};

const MARKETING_NAME_MODIFIERS = ['护理', '优惠', '促销', '营销', '推广', '活动'];

export function normalizeBusinessText(text: string) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

export function buildEntitySearchVariants(params: {
  text: string;
  objectType?: BusinessObjectType;
  minLength?: number;
  maxTerms?: number;
}) {
  const minLength = params.minLength ?? 2;
  const maxTerms = params.maxTerms ?? 8;
  const variants = new Set<string>();
  const objectTerms = params.objectType ? OBJECT_HINT_TERMS[params.objectType] ?? [] : [];

  const cleaned = stripTerms(params.text, [...COMMON_FILLER_TERMS, ...TIME_TERMS, ...ACTION_TERMS, ...objectTerms]);
  addVariant(variants, cleaned, minLength);

  if (params.objectType === 'MarketingActivity' || params.objectType === 'MarketingPage') {
    addVariant(variants, stripTerms(cleaned, MARKETING_NAME_MODIFIERS), minLength);
    if (cleaned.includes('回店')) {
      addVariant(variants, cleaned.replace(/护理礼/g, '礼'), minLength);
      addVariant(variants, cleaned.replace(/护理/g, ''), minLength);
      addVariant(variants, cleaned.match(/.*?回店/)?.[0] ?? '', minLength);
      addVariant(variants, cleaned.match(/回店.{0,4}?礼/)?.[0] ?? '', minLength);
    }
  }

  for (const part of splitBusinessTerms(cleaned)) addVariant(variants, part, minLength);

  return [...variants]
    .map((item) => item.trim())
    .filter((item) => normalizeBusinessText(item).length >= minLength)
    .sort((a, b) => normalizeBusinessText(b).length - normalizeBusinessText(a).length)
    .slice(0, maxTerms);
}

export function scoreBusinessNameMatch(params: { text: string; searchTerms: string[]; name: string }) {
  const text = normalizeBusinessText(params.text);
  const name = normalizeBusinessText(params.name);
  if (!name) return 0;
  if (text.includes(name)) return 0.96;

  let best = 0;
  for (const rawTerm of params.searchTerms) {
    const term = normalizeBusinessText(rawTerm);
    if (!term) continue;
    if (name === term) best = Math.max(best, 0.96);
    else if (name.includes(term)) best = Math.max(best, 0.9);
    else if (term.includes(name)) best = Math.max(best, 0.86);
    else {
      const common = longestCommonSubstringLength(term, name);
      const denominator = Math.max(name.length, Math.min(term.length, 16), 1);
      best = Math.max(best, common / denominator);
    }
  }

  return best;
}

function stripTerms(text: string, terms: string[]) {
  let result = String(text || '');
  for (const term of terms.sort((a, b) => b.length - a.length)) {
    result = result.replace(new RegExp(escapeRegExp(term), 'gi'), '');
  }
  return result.replace(/[，。！？!?、：:；;（）()【】[\]"'“”‘’]/g, '').trim();
}

function splitBusinessTerms(text: string) {
  return String(text || '')
    .split(/的|\s+|,|，|、|和|与/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function addVariant(variants: Set<string>, value: string, minLength: number) {
  const normalized = normalizeBusinessText(value);
  if (normalized.length >= minLength) variants.add(value.trim());
}

function longestCommonSubstringLength(a: string, b: string) {
  let best = 0;
  for (let i = 0; i < a.length; i += 1) {
    for (let j = i + 1; j <= a.length; j += 1) {
      const part = a.slice(i, j);
      if (part.length > best && b.includes(part)) best = part.length;
    }
  }
  return best;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
