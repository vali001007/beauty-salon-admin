import type { AgentEvidence, AgentToolExecutionContext, AgentToolResult } from '../../agent/agent.types.js';
import type { AgentV2CapabilityManifest, AgentV2FieldPolicy, AgentV2QueryAggregation } from '../capability/agent-v2-capability.types.js';
import type { AgentV2DateRange } from '../utils/agent-v2-date-range.js';

export type GenericQueryExecutionKind =
  | 'record.query'
  | 'metric.query'
  | 'trend.query'
  | 'detail.query'
  | 'action.draft'
  | 'navigation.open';

export type GenericQueryInput = {
  manifest: AgentV2CapabilityManifest;
  args: Record<string, unknown>;
  context: AgentToolExecutionContext;
};

export type GenericQueryDateRange = AgentV2DateRange;

export type GenericQueryTrace = {
  engine: 'generic_query_engine';
  queryKey: string;
  kind: GenericQueryExecutionKind;
  sourceModel: string;
  sourceModels: string[];
  storeScope: AgentV2CapabilityManifest['storeScope'];
  where: Record<string, unknown>;
  include?: string[];
  select?: string[];
  orderBy?: unknown;
  aggregation?: AgentV2QueryAggregation[];
  graphRelationPath?: string[];
  take: number;
  filters: string[];
  fieldPolicies: Array<Pick<AgentV2FieldPolicy, 'field' | 'label' | 'visibility'>>;
  permissionCheck: {
    required: string[];
    granted: string[];
    missing: string[];
    wildcard: boolean;
    allowed: boolean;
  };
  sqlSummary: {
    dialect: 'prisma_sql_summary';
    operation: 'findMany' | 'findFirst';
    model: string;
    statementPreview: string;
    whereClauses: string[];
    include?: string[];
    select?: string[];
    orderBy?: string;
    take: number;
    sensitiveValuesRedacted: true;
  };
};

export type GenericQueryResult = AgentToolResult & {
  evidence: AgentEvidence;
  data: Record<string, unknown> & {
    queryTrace: GenericQueryTrace;
  };
};
