export interface BrainEvalCatalogBase {
  questionId: string;
  question: string;
  questionType: string;
  intentType: string;
  persona: string;
  passed: boolean | null;
  status: string;
  hitRate: number | null;
  runId: number | null;
  failureReason: string | null;
  diagnosis: string;
  improvementSuggestion: string;
}

export interface BrainEvalCatalogItem extends BrainEvalCatalogBase {
  averageLatencyMs: number | null;
}

export interface BrainEvalCatalogLayerResult {
  layer: string;
  passed: boolean | null;
  score: number | null;
  checked: number | null;
  failures: string[];
}

export interface BrainEvalCatalogTestHistoryItem {
  releaseId: number | null;
  generatedAt: string | null;
  runId: number | null;
  status: string;
  brainStatus: string | null;
  passed: boolean | null;
  latencyMs: number | null;
  answer: string;
  graderReason: string | null;
  expectedIntent: string | null;
  actualIntent: string | null;
  expectedShape: string | null;
  actualShape: string | null;
  capabilityKeys: string[];
  citations: Array<{ sourceType: string; sourceId: string; label: string }>;
  layers: BrainEvalCatalogLayerResult[];
}

export interface BrainEvalCatalogDetail extends BrainEvalCatalogBase {
  semanticKeys: string[];
  dataTables: string[];
  testHistory: BrainEvalCatalogTestHistoryItem[];
}

export interface BrainEvalCatalogSnapshot {
  metadata: {
    generatedAt: string;
    sourceGeneratedAt: string | null;
    releaseId: number | null;
    storeId: number | null;
    total: number;
    passed: number;
    failed: number;
    unavailable: number;
    passRate: number | null;
    averageHitRate: number | null;
    sourceQuestionFile: string;
    sourceResultFile: string;
  };
  items: BrainEvalCatalogDetail[];
}
