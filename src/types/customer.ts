export interface Customer {
  id: number;
  name: string;
  phone: string;
  gender: '男' | '女';
  age?: number;
  memberLevel: string;
  totalSpent: number;
  visitCount: number;
  lastVisitDate: string;
  tags: string[];
  source: string;
  storeName: string;
  createdAt: string;
  // Extended fields
  email?: string;
  landline?: string;
  wechat?: string;
  maritalStatus?: '未知' | '已婚' | '未婚';
  birthday?: string;
  height?: number;
  weight?: number;
  occupation?: string;
  workplace?: string;
  address?: string;
  hasAllergy?: '无' | '有';
  hasSurgery?: '无' | '有';
  skinCondition?: string;
  remark?: string;
  cashBalance?: number;
  giftBalance?: number;
  totalBalance?: number;
  activeCustomerCardsCount?: number;
}

export interface CustomerTag {
  id: number;
  name: string;
  color: string;
}

export interface CustomerConsumptionRecord {
  id: number;
  customerId: number;
  userName: string;
  consumeType: string;
  consumeContent: string;
  payMethod: string;
  amount: string;
  campaign: string;
  consumeTime: string;
}

export interface CustomerHealthProfile {
  id: number;
  customerId: number;
  photo: string;
  name: string;
  skinType: string;
  skinStatus: string;
  mainProblems: string;
  allergyHistory: string;
  goals: string;
  recommendedCare: string;
  instrument: string;
  lastCheck: string;
}

export interface CustomerMiniappBehaviorSummary {
  totalCustomers: number;
  boundCustomers: number;
  activeCustomers7d: number;
  activeCustomers30d: number;
  avgEngagementScore: number;
  reservationIntentCount: number;
  marketingTouchCount: number;
  conversionCount: number;
  generatedAt: string;
  dataSource: 'derived_from_core_records' | 'miniapp_events';
}

export interface CustomerMiniappBehaviorFunnelItem {
  stage: string;
  count: number;
  rate: string;
}

export interface CustomerMiniappEntryModule {
  name: string;
  eventCount: number;
  customerCount: number;
  conversionHint: string;
}

export interface CustomerMiniappBehaviorSegment {
  label: string;
  customerCount: number;
  activeRate: string;
  avgScore: number;
  conversionRate: string;
  suggestion: string;
}

export interface CustomerMiniappBehaviorCustomer {
  customerId: number;
  name: string;
  phone?: string;
  storeName: string;
  lastActiveAt?: string;
  miniappStatus: '高活跃' | '有意向' | '低活跃' | '待绑定';
  visitCount: number;
  clickCount: number;
  reservationCount: number;
  orderCount: number;
  marketingTouchCount: number;
  conversionCount: number;
  engagementScore: number;
  intentLevel: '高' | '中' | '低';
  nextAction: string;
  evidence: string[];
}

export interface CustomerMiniappEventContractField {
  field: string;
  label: string;
  required: boolean;
}

export interface CustomerMiniappBehaviorAnalysis {
  summary: CustomerMiniappBehaviorSummary;
  funnel: CustomerMiniappBehaviorFunnelItem[];
  entryModules: CustomerMiniappEntryModule[];
  segments: CustomerMiniappBehaviorSegment[];
  customers: CustomerMiniappBehaviorCustomer[];
  eventContract: CustomerMiniappEventContractField[];
}
