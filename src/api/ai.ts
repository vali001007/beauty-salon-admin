import type {
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
  ServiceNoteSummaryRequest,
  SkinPhotoAnalyzeRequest,
  SkinPhotoAnalyzeResult,
  SkinTestExplanationRequest,
  TerminalServiceAdviceRequest,
  TerminalIntentResolveRequest,
  TerminalIntentResolveResult,
} from '@/types/ai';
import {
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

export const generateTerminalServiceAdvice: (data: TerminalServiceAdviceRequest) => Promise<AiGenerationResult> =
  realGenerateTerminalServiceAdvice;

export const recommendNextBestAction: (data: NextBestActionRequest) => Promise<AiGenerationResult> =
  realRecommendNextBestAction;

export const resolveTerminalIntent: (data: TerminalIntentResolveRequest) => Promise<TerminalIntentResolveResult> =
  realResolveTerminalIntent;
