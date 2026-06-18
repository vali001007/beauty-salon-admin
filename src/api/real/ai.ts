import apiClient from '../client';
import { useStoreStore } from '@/stores/storeStore';
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
import { normalizePaginatedResponse } from './response';

export async function realSendAiChatMessage(data: AiChatRequest): Promise<AiGenerationResult> {
  return apiClient.post('/ai/chat/messages', data);
}

function getCsrfToken(): string {
  const match = document.cookie.match(/csrf_token=([^;]+)/);
  return match ? match[1] : '';
}

export async function* realStreamAiChatMessage(data: AiChatRequest): AsyncGenerator<string> {
  const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';
  const normalizedBase = baseURL.replace(/\/$/, '');
  const token = localStorage.getItem('token');
  const currentStoreId = useStoreStore.getState().currentStoreId;

  const response = await fetch(`${normalizedBase}/ai/chat/messages/stream`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(currentStoreId !== null ? { 'X-Store-Id': String(currentStoreId) } : {}),
      'X-CSRF-Token': getCsrfToken(),
    },
    body: JSON.stringify(data),
  });

  if (!response.ok || !response.body) {
    throw new Error(`AI 流式响应失败：${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const parseEvent = (event: string) => {
    const line = event
      .split(/\r?\n/)
      .map((item) => item.trim())
      .find((item) => item.startsWith('data:'));
    if (!line) return null;

    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') return null;
    const parsed = JSON.parse(payload) as { delta?: string; error?: string };
    if (parsed.error) throw new Error(parsed.error);
    return parsed.delta || null;
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\n\n/);
    buffer = events.pop() ?? '';

    for (const event of events) {
      const delta = parseEvent(event);
      if (delta) yield delta;
    }
  }

  const tail = decoder.decode();
  if (tail) buffer += tail;
  const delta = parseEvent(buffer);
  if (delta) yield delta;
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

export async function realGenerateTerminalServiceAdvice(
  data: TerminalServiceAdviceRequest,
): Promise<TerminalServiceAdviceResult> {
  return apiClient.post('/ai/generate/terminal-service-advice', data);
}

export async function realRecommendNextBestAction(data: NextBestActionRequest): Promise<NextBestActionResult> {
  return apiClient.post('/ai/recommend/next-best-action', data);
}

export async function realResolveTerminalIntent(data: TerminalIntentResolveRequest): Promise<TerminalIntentResolveResult> {
  return apiClient.post('/ai/terminal/resolve-intent', data);
}

export async function realGetAiAuditLogsPaginated(
  params: AiAuditLogQuery,
): Promise<PaginatedResponse<AiAuditLog>> {
  const response = await apiClient.get<unknown, unknown>('/ai/audit-logs/paginated', { params });
  return normalizePaginatedResponse<AiAuditLog, AiAuditLog>(response, (item) => item);
}

export async function realGetAiAuditSummary(params?: {
  scenario?: string;
  status?: string;
}): Promise<AiAuditSummary> {
  return apiClient.get('/ai/audit-logs/summary', { params });
}
