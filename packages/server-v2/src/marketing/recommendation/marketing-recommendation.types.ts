export type RecommendationSourceType = 'prediction' | 'lifecycle' | 'product_project';
export type RecommendationExecutionMode = 'activity' | 'automation' | 'terminal_follow_up';

export type RecommendationBuildContext = {
  storeId: number;
  businessDate: string;
  predictionRunId: number;
  predictionModelVersion: string;
  generatedAt: Date;
};

export type RecommendationCandidate = {
  recommendationKey: string;
  sourceType: RecommendationSourceType;
  sourceVersion: string;
  title: string;
  description?: string;
  priority: 'P0' | 'P1' | 'P2';
  urgency: 'urgent' | 'recommended' | 'opportunity';
  preferredMode: RecommendationExecutionMode;
  executionModes: RecommendationExecutionMode[];
  customerIds: number[];
  audienceRule: Record<string, unknown>;
  audienceReasons: Array<{ customerId: number; score: number; reason: string }>;
  evidenceSnapshot: Record<string, unknown>;
  strategySnapshot?: Record<string, unknown>;
  offerContext: {
    selectedPromotionId?: number | null;
    offer?: Record<string, unknown> | null;
    alternatives?: unknown[];
    fitBreakdown?: Record<string, unknown> | null;
    inventorySnapshot?: Record<string, unknown> | null;
    capacitySnapshot?: Record<string, unknown> | null;
    riskWarnings?: string[];
  };
  expiresAt: Date;
};

export type RefreshRecommendationInstancesResult = {
  predictionRunId: number;
  reusedPredictionRun: boolean;
  createdInstanceIds: string[];
  reusedInstanceIds: string[];
  supersededInstanceIds: string[];
  generatedAt: string;
};
