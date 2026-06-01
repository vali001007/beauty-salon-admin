import apiClient from '../client';
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

export async function realSendAiChatMessage(data: AiChatRequest): Promise<AiGenerationResult> {
  return apiClient.post('/ai/chat/messages', data);
}

export async function realGenerateCustomerInvitationScript(
  data: CustomerInvitationScriptRequest,
): Promise<AiGenerationResult> {
  return apiClient.post('/ai/generate/customer-invitation-script', data);
}

export async function realGenerateMarketingCopy(
  data: MarketingCopyRequest,
): Promise<AiGenerationResult<MarketingCopyStructured>> {
  return apiClient.post('/ai/generate/marketing-copy', data);
}

export async function realGenerateActivityPage(data: GenerateActivityPageRequest): Promise<GenerateActivityPageResult> {
  return apiClient.post('/ai/generate/activity-page', data);
}

export async function realGenerateCampaignVariants(data: CampaignVariantsRequest): Promise<AiGenerationResult> {
  return apiClient.post('/ai/generate/campaign-variants', data);
}

export async function realGenerateCustomerSummary(data: CustomerSummaryRequest): Promise<AiGenerationResult> {
  return apiClient.post('/ai/generate/customer-summary', data);
}

export async function realGenerateServiceNoteSummary(data: ServiceNoteSummaryRequest): Promise<AiGenerationResult> {
  return apiClient.post('/ai/generate/service-note-summary', data);
}

export async function realGenerateSkinTestExplanation(data: SkinTestExplanationRequest): Promise<AiGenerationResult> {
  return apiClient.post('/ai/generate/skin-test-explanation', data);
}

export async function realAnalyzeSkinPhoto(data: SkinPhotoAnalyzeRequest): Promise<SkinPhotoAnalyzeResult> {
  return apiClient.post('/ai/analyze/skin-photo', data);
}

export async function realGenerateTerminalServiceAdvice(data: TerminalServiceAdviceRequest): Promise<AiGenerationResult> {
  return apiClient.post('/ai/generate/terminal-service-advice', data);
}

export async function realRecommendNextBestAction(data: NextBestActionRequest): Promise<AiGenerationResult> {
  return apiClient.post('/ai/recommend/next-best-action', data);
}

export async function realResolveTerminalIntent(data: TerminalIntentResolveRequest): Promise<TerminalIntentResolveResult> {
  return apiClient.post('/ai/terminal/resolve-intent', data);
}
