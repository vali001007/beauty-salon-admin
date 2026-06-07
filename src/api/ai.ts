import type {
  AiAuditLog,
  AiAuditLogQuery,
  AiAuditSummary,
  AiChatRequest,
  AiGenerationResult,
  CampaignVariantsRequest,
  CustomerInvitationScriptRequest,
  CustomerSummaryRequest,
  GenerateActivityPageRequest,
  GenerateActivityPageResult,
  MarketingCopyRequest,
  MarketingCopyStructured,
  NextBestActionRequest,
  NextBestActionResult,
  ServiceNoteSummaryRequest,
  SkinPhotoAnalyzeRequest,
  SkinPhotoAnalyzeResult,
  SkinTestExplanationRequest,
  TerminalServiceAdviceRequest,
  TerminalServiceAdviceResult,
  TerminalIntentResolveRequest,
  TerminalIntentResolveResult,
} from '@/types/ai';
import type { PaginatedResponse } from '@/types/pagination';
import {
  realGetAiAuditLogsPaginated,
  realGetAiAuditSummary,
  realGenerateCampaignVariants,
  realGenerateCustomerInvitationScript,
  realGenerateCustomerSummary,
  realGenerateActivityPage,
  realGenerateMarketingCopy,
  realGenerateServiceNoteSummary,
  realAnalyzeSkinPhoto,
  realGenerateSkinTestExplanation,
  realGenerateTerminalServiceAdvice,
  realRecommendNextBestAction,
  realResolveTerminalIntent,
  realSendAiChatMessage,
} from './real/ai';

export const sendAiChatMessage: (data: AiChatRequest) => Promise<AiGenerationResult> =
  realSendAiChatMessage;

export const generateCustomerInvitationScript: (
  data: CustomerInvitationScriptRequest,
) => Promise<AiGenerationResult> = realGenerateCustomerInvitationScript;

export const generateMarketingCopy: (data: MarketingCopyRequest) => Promise<AiGenerationResult<MarketingCopyStructured>> =
  realGenerateMarketingCopy;

export const generateActivityPage: (data: GenerateActivityPageRequest) => Promise<GenerateActivityPageResult> =
  realGenerateActivityPage;

export const generateCampaignVariants: (data: CampaignVariantsRequest) => Promise<AiGenerationResult> =
  realGenerateCampaignVariants;

export const generateCustomerSummary: (data: CustomerSummaryRequest) => Promise<AiGenerationResult> =
  realGenerateCustomerSummary;

export const generateServiceNoteSummary: (data: ServiceNoteSummaryRequest) => Promise<AiGenerationResult> =
  realGenerateServiceNoteSummary;

export const generateSkinTestExplanation: (data: SkinTestExplanationRequest) => Promise<AiGenerationResult> =
  realGenerateSkinTestExplanation;

export const analyzeSkinPhoto: (data: SkinPhotoAnalyzeRequest) => Promise<SkinPhotoAnalyzeResult> =
  realAnalyzeSkinPhoto;

export const generateTerminalServiceAdvice: (data: TerminalServiceAdviceRequest) => Promise<TerminalServiceAdviceResult> =
  realGenerateTerminalServiceAdvice;

export const recommendNextBestAction: (data: NextBestActionRequest) => Promise<NextBestActionResult> =
  realRecommendNextBestAction;

export const resolveTerminalIntent: (data: TerminalIntentResolveRequest) => Promise<TerminalIntentResolveResult> =
  realResolveTerminalIntent;

export const getAiAuditLogsPaginated: (params: AiAuditLogQuery) => Promise<PaginatedResponse<AiAuditLog>> =
  realGetAiAuditLogsPaginated;

export const getAiAuditSummary: (params?: { scenario?: string; status?: string }) => Promise<AiAuditSummary> =
  realGetAiAuditSummary;
