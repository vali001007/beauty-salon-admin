import apiClient from '../client';
import type {
  AgentCapabilityDraftDetail,
  AgentCapabilityDraftListQuery,
  AgentCapabilityDraftListResult,
  AgentCapabilityDryRunResult,
  AgentCapabilityEvalGateResult,
  AgentCapabilityImportResult,
  AgentCapabilityManifestVersion,
  AgentCapabilityPostPublishSmokeResult,
  AgentCapabilityPublishResult,
  AgentCapabilityValidationResult,
  AgentToolQueryKeyItem,
} from '@/types/agentCapabilityCenter';

const BASE_PATH = '/agent-v2/capability-center';

export async function getAgentCapabilityDrafts(params: AgentCapabilityDraftListQuery): Promise<AgentCapabilityDraftListResult> {
  return apiClient.get(`${BASE_PATH}/drafts`, { params });
}

export async function getAgentCapabilityDraft(capabilityId: string): Promise<AgentCapabilityDraftDetail> {
  return apiClient.get(`${BASE_PATH}/drafts/${encodeURIComponent(capabilityId)}`);
}

export async function importAgentCapabilityDrafts(data: {
  path?: string;
  limit?: number;
  overwriteReviewed?: boolean;
} = {}): Promise<AgentCapabilityImportResult> {
  return apiClient.post(`${BASE_PATH}/drafts/import`, data);
}

export async function updateAgentCapabilityDraft(
  capabilityId: string,
  data: Record<string, unknown>,
): Promise<AgentCapabilityDraftDetail> {
  return apiClient.patch(`${BASE_PATH}/drafts/${encodeURIComponent(capabilityId)}`, data);
}

export async function validateAgentCapabilityDraft(capabilityId: string): Promise<AgentCapabilityValidationResult> {
  return apiClient.post(`${BASE_PATH}/drafts/${encodeURIComponent(capabilityId)}/validate`, {});
}

export async function dryRunAgentCapabilityDraft(
  capabilityId: string,
  data: { storeId?: number } = {},
): Promise<AgentCapabilityDryRunResult> {
  return apiClient.post(`${BASE_PATH}/drafts/${encodeURIComponent(capabilityId)}/dry-run`, data, { timeout: 60000 });
}

export async function runAgentCapabilityDraftEvalGate(capabilityId: string): Promise<AgentCapabilityEvalGateResult> {
  return apiClient.post(`${BASE_PATH}/drafts/${encodeURIComponent(capabilityId)}/eval-gate`, {}, { timeout: 60000 });
}

export async function runAgentCapabilityPostPublishSmokeTest(
  capabilityId: string,
  data: { storeId?: number; question?: string } = {},
): Promise<AgentCapabilityPostPublishSmokeResult> {
  return apiClient.post(`${BASE_PATH}/drafts/${encodeURIComponent(capabilityId)}/post-publish-smoke-test`, data, {
    timeout: 60000,
  });
}

export async function runAgentCapabilityEvalGate(data: { capabilityIds?: string[] } = {}): Promise<AgentCapabilityEvalGateResult> {
  return apiClient.post(`${BASE_PATH}/eval-gate`, data, { timeout: 60000 });
}

export async function reviewAgentCapabilityDraft(data: {
  capabilityId: string;
  decision: 'approve' | 'reject' | 'needs_changes' | 'draft' | string;
  comment?: string;
  changes?: Record<string, unknown>;
}): Promise<AgentCapabilityDraftDetail> {
  return apiClient.post(`${BASE_PATH}/reviews`, data);
}

export async function publishAgentCapabilities(data: {
  capabilityIds?: string[];
  mode?: 'selected' | 'approved' | 'auto';
  title?: string;
  summary?: string;
}): Promise<AgentCapabilityPublishResult> {
  return apiClient.post(`${BASE_PATH}/publish`, data, { timeout: 60000 });
}

export async function getAgentCapabilityManifestVersions(): Promise<AgentCapabilityManifestVersion[]> {
  return apiClient.get(`${BASE_PATH}/versions`);
}

export async function activateAgentCapabilityManifestVersion(id: number): Promise<{ activeManifestVersion: string }> {
  return apiClient.post(`${BASE_PATH}/versions/${id}/activate`, {});
}

export async function getAgentToolQueryKeys(params: { status?: string; domain?: string } = {}): Promise<AgentToolQueryKeyItem[]> {
  return apiClient.get(`${BASE_PATH}/query-keys`, { params });
}
