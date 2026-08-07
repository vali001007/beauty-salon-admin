export interface BrainEvidencePacket {
  sourceType: string;
  sourceId: string;
  label: string;
  timeRange?: string;
  filters: string[];
  metrics: string[];
  formula?: {
    key?: string;
    version?: string;
    expression?: string;
    inputs?: Record<string, unknown>;
    computedValues?: Record<string, unknown>;
    calculationSteps?: string[];
  };
  sampleRows: Array<Record<string, unknown>>;
  limitations: string[];
}

export interface BrainEvidencePacketSourceCitation {
  sourceType: string;
  sourceId: string;
  label?: string;
  definition?: string;
  timeRange?: string;
  filters?: string[];
  metrics?: string[];
  formula?: BrainEvidencePacket['formula'];
  sampleRows?: Array<Record<string, unknown>>;
  limitations?: string[];
}
