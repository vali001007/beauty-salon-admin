import apiClient from '../client';
import type {
  BusinessDefinitionDetail,
  BusinessDefinitionListQuery,
  BusinessDefinitionListResult,
  BusinessDefinitionProjection,
  BusinessDefinitionVersion,
  PublishBusinessDefinitionVersionInput,
  ValidateBusinessDefinitionVersionInput,
} from '@/types/businessDefinition';

const BASE_PATH = '/business-definitions';

export async function getBusinessDefinitions(
  params: BusinessDefinitionListQuery = {},
): Promise<BusinessDefinitionListResult> {
  return apiClient.get(BASE_PATH, { params });
}

export async function getBusinessDefinition(kind: string, definitionKey: string): Promise<BusinessDefinitionDetail> {
  return apiClient.get(`${BASE_PATH}/${encodeURIComponent(kind)}/${encodeURIComponent(definitionKey)}`);
}

export async function validateBusinessDefinitionVersion(
  versionId: number,
  data: ValidateBusinessDefinitionVersionInput = {},
): Promise<BusinessDefinitionVersion> {
  return apiClient.post(`${BASE_PATH}/versions/${versionId}/validate`, data);
}

export async function publishBusinessDefinitionVersion(
  versionId: number,
  data: PublishBusinessDefinitionVersionInput = {},
): Promise<BusinessDefinitionVersion> {
  return apiClient.post(`${BASE_PATH}/versions/${versionId}/publish`, data);
}

export async function previewBusinessDefinitionVersionProjections(
  versionId: number,
): Promise<BusinessDefinitionProjection[]> {
  return apiClient.get(`${BASE_PATH}/versions/${versionId}/projections/preview`);
}
