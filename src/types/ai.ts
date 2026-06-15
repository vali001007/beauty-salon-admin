export type AiProvider = 'mock' | 'deepseek' | 'openai_compatible' | 'claude_compatible';

export type AiScenario =
  | 'assistant_chat'
  | 'customer_invitation_script'
  | 'marketing_copy'
  | 'activity_page'
  | 'campaign_variants'
  | 'customer_summary'
  | 'service_note_summary'
  | 'skin_test_explanation'
  | 'skin_photo_analyze'
  | 'terminal_dashboard_insights'
  | 'terminal_service_advice'
  | 'next_best_action'
  | 'terminal_intent';

export interface AiSafetyInfo {
  masked: boolean;
  blocked: boolean;
  reasons: string[];
}

export interface AiUsageInfo {
  provider: AiProvider | string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost?: number;
}

export interface AiAuditLog {
  id: number;
  scenario: AiScenario | string;
  userId?: number | null;
  deviceId?: number | null;
  storeId?: number | null;
  provider: AiProvider | string;
  model: string;
  promptTemplate?: string | null;
  inputSummary?: string | null;
  outputSummary?: string | null;
  inputPreview?: string | null;
  outputPreview?: string | null;
  safetyBlocked?: boolean;
  inputTokens: number;
  outputTokens: number;
  latencyMs?: number | null;
  status: 'success' | 'failed' | 'failed_fallback' | string;
  createdAt: string;
}

export interface AiAuditLogQuery {
  page: number;
  pageSize: number;
  scenario?: string;
  status?: string;
}

export interface AiAuditSummary {
  total: number;
  successCount: number;
  failedCount: number;
  successRate: number;
  averageLatencyMs: number;
  blockedCount: number;
}

export interface AiGenerationVariant {
  title: string;
  text: string;
  channel?: string;
}

export interface AiGenerationResult<TStructured = Record<string, unknown>> {
  id: string;
  scenario: AiScenario | string;
  text: string;
  variants?: AiGenerationVariant[];
  structured?: TStructured;
  safety: AiSafetyInfo;
  usage: AiUsageInfo;
}

export interface AiChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AiChatRequest {
  role?: 'receptionist' | 'manager' | 'beautician';
  messages: AiChatMessage[];
  stream?: boolean;
  context?: Record<string, unknown>;
}

export interface CustomerInvitationScriptRequest {
  scenario?: 'project' | 'promotion' | 'custom';
  customerId?: number;
  customerName?: string;
  skinType?: string;
  lastVisit?: string;
  projectName?: string;
  activityName?: string;
  promotionName?: string;
  offer?: string;
  targetAudience?: string;
  invitationReason?: string;
  preferredTime?: string;
  specialOffer?: string;
  evidence?: string[];
  channel?: 'sms' | 'wechat' | 'miniapp' | 'group' | 'store' | 'moments';
}

export type MarketingCopyChannel = 'sms' | 'wechat' | 'miniapp' | 'group' | 'store' | 'moments';

export type MarketingCopyStyleInstruction = 'warmer' | 'premium' | 'shorter' | 'urgent' | 'consultative';

export interface MarketingCopyVariant {
  id: string;
  channel: MarketingCopyChannel;
  title: string;
  text: string;
  tone: string;
  reasonTags: string[];
  riskWarnings: string[];
}

export interface MarketingCopyStructured {
  variants: MarketingCopyVariant[];
  recommendedVariantId?: string;
  context: {
    campaignName: string;
    targetAudience: string;
    offer: string;
    source?: string;
    segment?: string;
    skinType?: string;
    triggerReasons: string[];
  };
}

export type ActivityPageTone = 'warm' | 'professional' | 'premium' | 'friendly';

export type ActivityPageSectionType =
  | 'hero'
  | 'offer'
  | 'benefits'
  | 'project_recommendation'
  | 'product_recommendation'
  | 'skin_care_advice'
  | 'consultant_note'
  | 'faq'
  | 'notice'
  | 'store_info';

export interface ActivityPageSectionBase {
  type: ActivityPageSectionType;
  title?: string;
}

export interface ActivityHeroSection extends ActivityPageSectionBase {
  type: 'hero';
  badge?: string;
  title: string;
  subtitle?: string;
  description?: string;
  imageUrl?: string;
}

export interface ActivityOfferSection extends ActivityPageSectionBase {
  type: 'offer';
  title: string;
  offer: string;
  description?: string;
  validFrom?: string;
  validTo?: string;
  highlights?: string[];
}

export interface ActivityBenefitsSection extends ActivityPageSectionBase {
  type: 'benefits';
  title: string;
  items: Array<{ title: string; description: string; icon?: string }>;
}

export interface ActivityProjectRecommendationSection extends ActivityPageSectionBase {
  type: 'project_recommendation';
  title: string;
  items: Array<{
    name: string;
    description?: string;
    originalPrice?: number;
    activityPrice?: number;
    reason?: string;
  }>;
}

export interface ActivityProductRecommendationSection extends ActivityPageSectionBase {
  type: 'product_recommendation';
  title: string;
  items: Array<{
    name: string;
    description?: string;
    originalPrice?: number;
    activityPrice?: number;
    category?: string;
  }>;
}

export interface ActivitySkinCareAdviceSection extends ActivityPageSectionBase {
  type: 'skin_care_advice';
  title: string;
  advice: string;
  tags?: string[];
}

export interface ActivityConsultantNoteSection extends ActivityPageSectionBase {
  type: 'consultant_note';
  title: string;
  note: string;
  consultantName?: string;
}

export interface ActivityFaqSection extends ActivityPageSectionBase {
  type: 'faq';
  title: string;
  items: Array<{ question: string; answer: string }>;
}

export interface ActivityNoticeSection extends ActivityPageSectionBase {
  type: 'notice';
  title: string;
  items: string[];
}

export interface ActivityStoreInfoSection extends ActivityPageSectionBase {
  type: 'store_info';
  title: string;
  storeName: string;
  address?: string;
  phone?: string;
}

export type ActivityPageSection =
  | ActivityHeroSection
  | ActivityOfferSection
  | ActivityBenefitsSection
  | ActivityProjectRecommendationSection
  | ActivityProductRecommendationSection
  | ActivitySkinCareAdviceSection
  | ActivityConsultantNoteSection
  | ActivityFaqSection
  | ActivityNoticeSection
  | ActivityStoreInfoSection;

export interface ActivityPageSchema {
  schemaVersion: '1.0';
  title: string;
  subtitle?: string;
  audienceLabel: string;
  theme: {
    tone: ActivityPageTone;
    primaryColor?: string;
    backgroundColor?: string;
  };
  sections: ActivityPageSection[];
  cta: {
    text: string;
    action: 'book' | 'claim_coupon' | 'contact_consultant';
  };
  safety: {
    customerFacing: boolean;
    blocked: boolean;
    reasons: string[];
  };
}

export interface ActivityPageVariant {
  id: string;
  name: string;
  pageSchema: ActivityPageSchema;
  reasonTags: string[];
}

export interface GenerateActivityPageRequest {
  strategyId?: number;
  sourceRecommendationId?: number | string;
  campaignName?: string;
  targetAudience?: string;
  offer?: string;
  source?: string;
  segment?: string;
  skinType?: string;
  triggerReasons?: string[];
  projectNames?: string[];
  productNames?: string[];
  startDate?: string;
  endDate?: string;
  storeName?: string;
  storePhone?: string;
  storeAddress?: string;
  styleInstruction?: MarketingCopyStyleInstruction | ActivityPageTone;
}

export interface ActivityPageStructured {
  pageSchema: ActivityPageSchema;
  variants?: ActivityPageVariant[];
  recommendedVariantId?: string;
  promptTemplateVersion: string;
  context: {
    campaignName: string;
    targetAudience: string;
    offer: string;
    source?: string;
    segment?: string;
    skinType?: string;
    triggerReasons: string[];
  };
}

export type GenerateActivityPageResult = AiGenerationResult<ActivityPageStructured> & {
  pageSchema: ActivityPageSchema;
  pageVariants?: ActivityPageVariant[];
};

export interface MarketingCopyRequest {
  strategyId?: number;
  campaignName?: string;
  targetAudience?: string;
  channel?: MarketingCopyChannel;
  channels?: MarketingCopyChannel[];
  offer?: string;
  tone?: 'professional' | 'warm' | 'premium' | 'urgent';
  constraints?: string[];
  source?: string;
  segment?: string;
  skinType?: string;
  triggerReasons?: string[];
  projectNames?: string[];
  productNames?: string[];
  startDate?: string;
  endDate?: string;
  storeName?: string;
  styleInstruction?: MarketingCopyStyleInstruction;
}

export interface CampaignVariantsRequest extends Omit<MarketingCopyRequest, 'channel'> {
  channels: MarketingCopyChannel[];
  variantCount?: number;
}

export interface CustomerSummaryRequest {
  customerId: number;
  includeConsumption?: boolean;
  includeHealthProfile?: boolean;
  includeRecommendations?: boolean;
}

export interface ServiceNoteSummaryRequest {
  customerId?: number;
  serviceTaskId?: number;
  notes: string;
}

export interface SkinTestExplanationRequest {
  customerId?: number;
  skinTestId?: number;
  metrics?: Array<{ key: string; label: string; value: number | string; unit?: string }>;
  skinType?: string;
  mainProblems?: string;
}

export interface SkinPhotoAnalyzeRequest {
  customerId?: number;
  customerName?: string;
  storeName?: string;
  imageDataUrl: string;
  capturedAt?: string;
}

export interface SkinPhotoAnalyzeResult {
  id: string;
  customerId?: number;
  customerName?: string;
  skinType: string;
  skinStatus: string;
  mainProblems: string;
  allergyHistory?: string;
  goals: string;
  recommendedCare: string;
  instrument: string;
  isFallback?: boolean;
  metrics: {
    moisture: number;
    oil: number;
    elasticity: number;
    sensitivity: number;
    pore: number;
    pigmentation: number;
  };
  confidence: number;
  imageUrl?: string;
  capturedAt: string;
  explanation: string;
}

export interface TerminalServiceAdviceRequest {
  customerId: number;
  projectId?: number;
  taskId?: number;
  skinTestId?: number;
}

export interface TerminalServiceAdviceStructured {
  preChecks: string[];
  keySteps: string[];
  materialUsage: string[];
  followUpAdvice: string;
  nextBookingHint: string;
}

export type TerminalServiceAdviceResult = AiGenerationResult<TerminalServiceAdviceStructured>;

export type NextBestActionType =
  | 'recommend_project'
  | 'send_care_reminder'
  | 'offer_card'
  | 'escalate_to_consultant';

export type NextBestActionUrgency = 'now' | 'this_week' | 'this_month';

export interface NextBestActionStructured {
  action: NextBestActionType;
  reason: string;
  projectName?: string;
  urgency: NextBestActionUrgency;
  confidence: number;
}

export interface NextBestActionRequest {
  customerId?: number;
  strategyId?: number;
  context?: Record<string, unknown>;
  ruleResults?: Array<{ type: string; score: number; reasons: string[] }>;
}

export type NextBestActionResult = AiGenerationResult<NextBestActionStructured>;

export interface TerminalIntentQuickAction {
  label: string;
  action: string;
}

export interface TerminalIntentResolveRequest {
  role: 'manager' | 'reception' | 'beautician';
  command: string;
  availableActions: string[];
  quickActions: TerminalIntentQuickAction[];
  currentStoreName?: string;
}

export interface TerminalIntentResolveResult {
  intentName: string;
  action: string | null;
  confidence: number;
  slots: Record<string, unknown>;
  missingSlots: string[];
  reason?: string;
}
