export type CustomerProfilePredictionDto = {
  id: number;
  runId: number;
  churnScore: number;
  churnLevel: string;
  repurchase30dScore: number;
  marketingResponseScore: number;
  ltv6m: number;
  ltv12m: number;
  ltvTier: string;
  featureJson: any;
  reasonJson: any;
  recommendedActionsJson: any;
  updatedAt: string;
};

export type CustomerProfileDto = {
  customerId: number;
  storeId: number;
  generatedAt: string;
  basic: {
    name: string;
    phone?: string | null;
    gender?: string | null;
    age?: number | null;
    memberLevel?: string | null;
    source?: string | null;
    tags: string[];
    skinType?: string | null;
    skinCondition?: string | null;
    totalSpent: number;
    visitCount: number;
    lastVisitDate?: string | null;
  };
  health: {
    skinType?: string | null;
    skinStatus?: string | null;
    mainProblems?: string | null;
    allergyHistory?: string | null;
    goals?: string | null;
    recommendedCare?: string | null;
    instrument?: string | null;
    lastCheck?: string | null;
  } | null;
  consumption: {
    totalSpent: number;
    visitCount: number;
    lastVisitDate?: string | null;
    lastVisitDays?: number | null;
    avgSpentPerVisit: number;
    preferredProjects: Array<{ name: string; count: number }>;
    recentRecords: Array<{
      id: number;
      consumeType: string;
      consumeContent: string;
      payMethod?: string | null;
      amount: number;
      consumeTime: string;
    }>;
  };
  cards: {
    activeCards: any[];
    expiringCards: any[];
    usedUpCards: any[];
  };
  prediction: CustomerProfilePredictionDto | null;
  touchHistory: any[];
  recommendationEvents: any[];
};
