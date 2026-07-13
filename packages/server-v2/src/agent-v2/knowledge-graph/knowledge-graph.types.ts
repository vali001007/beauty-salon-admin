import type { AgentV2CapabilityManifest } from '../capability/agent-v2-capability.types.js';

export type KnowledgeGraphNodeType =
  | 'Domain'
  | 'BusinessObject'
  | 'DataModel'
  | 'Field'
  | 'Capability'
  | 'ActionIntent'
  | 'Word'
  | 'PermissionCode';

export type KnowledgeGraphEdgeType =
  | 'BELONGS_TO'
  | 'COMPOSED_OF'
  | 'HAS_FIELD'
  | 'FK_RELATION'
  | 'SYNONYM_OF'
  | 'TRIGGERS'
  | 'SUPPORTS_ACTION'
  | 'EXCLUDES'
  | 'REQUIRES_PERM';

export type KnowledgeGraphSource =
  | 'prisma'
  | 'business_object_catalog'
  | 'semantic_lexicon'
  | 'controller'
  | 'frontend_route'
  | 'manifest'
  | 'manual_override'
  | 'llm_generated';

export type KnowledgeGraphNode = {
  id: string;
  type: KnowledgeGraphNodeType;
  name: string;
  displayName?: string;
  description?: string;
  source: KnowledgeGraphSource;
  sourcePath?: string;
  confidence: number;
  updatedAt: string;
  properties?: Record<string, unknown>;
};

export type KnowledgeGraphEdge = {
  id: string;
  type: KnowledgeGraphEdgeType;
  from: string;
  to: string;
  label?: string;
  source: KnowledgeGraphSource;
  sourcePath?: string;
  confidence: number;
  updatedAt: string;
  properties?: Record<string, unknown>;
};

export type KnowledgeGraphSummary = {
  generatedAt: string;
  schemaHash: string;
  nodeCount: number;
  edgeCount: number;
  nodeCountsByType: Record<KnowledgeGraphNodeType, number>;
  edgeCountsByType: Record<KnowledgeGraphEdgeType, number>;
  businessObjectCount: number;
  dataModelCount: number;
  activeCapabilityCount: number;
  permissionCodeCount: number;
};

export type KnowledgeGraphGapSeverity = 'blocker' | 'warning' | 'info';

export type KnowledgeGraphGap = {
  code: string;
  severity: KnowledgeGraphGapSeverity;
  title: string;
  detail: string;
  targetId?: string;
  sourcePath?: string;
  suggestedFix: string;
};

export type KnowledgeGraphCoverageReport = {
  generatedAt: string;
  schemaHash: string;
  passed: boolean;
  summary: KnowledgeGraphSummary;
  manualOverrides: {
    total: number;
    synonyms: number;
    excludes: number;
    adopted: number;
    skipped: number;
    conflicts: number;
    details: KnowledgeGraphManualOverrideMergeDetail[];
  };
  gaps: KnowledgeGraphGap[];
  blockers: KnowledgeGraphGap[];
  warnings: KnowledgeGraphGap[];
};

export type KnowledgeGraphSnapshot = {
  generatedAt: string;
  schemaHash: string;
  summary: KnowledgeGraphSummary;
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  report: KnowledgeGraphCoverageReport;
};

export type KnowledgeGraphControllerEndpointSource = {
  method: string;
  path: string;
  file: string;
  handler: string;
  line: number;
  permissions: string[];
  dtoNames: string[];
};

export type KnowledgeGraphFrontendRouteSource = {
  path: string;
  file: string;
  line: number;
  permission?: string;
};

export type KnowledgeGraphSemanticTermSource = {
  term: string;
  sourcePath: string;
  category: string;
};

export type KnowledgeGraphManualOverrideSource = {
  id: number;
  overrideType: string;
  relationType: string;
  sourceNodeId?: string | null;
  targetNodeId?: string | null;
  value?: string | null;
  label?: string | null;
  reason?: string | null;
  confidence?: number | null;
  payload?: Record<string, unknown> | null;
};

export type KnowledgeGraphManualOverrideMergeStatus = 'adopted' | 'skipped' | 'conflict';

export type KnowledgeGraphManualOverrideMergeDetail = {
  id: number;
  overrideType: string;
  relationType: string;
  status: KnowledgeGraphManualOverrideMergeStatus;
  sourceNodeId?: string | null;
  targetNodeId?: string | null;
  value?: string | null;
  label?: string | null;
  nodeId?: string;
  edgeId?: string;
  issue?: string;
  sourcePath: string;
};

export type BuildAgentV2KnowledgeGraphInput = {
  generatedAt: string;
  schema: string;
  schemaPath: string;
  businessObjectCatalogPath: string;
  semanticLexiconPath: string;
  manifests: AgentV2CapabilityManifest[];
  controllerEndpoints: KnowledgeGraphControllerEndpointSource[];
  frontendRoutes: KnowledgeGraphFrontendRouteSource[];
  semanticTerms: KnowledgeGraphSemanticTermSource[];
  manualOverrides?: KnowledgeGraphManualOverrideSource[];
};
