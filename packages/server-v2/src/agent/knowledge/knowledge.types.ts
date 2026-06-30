import type { AgentPersonaCode, AgentRole } from '../agent.types.js';

export type BusinessObjectType =
  | 'MarketingActivity'
  | 'MarketingPage'
  | 'Customer'
  | 'InventoryProduct'
  | 'Project'
  | 'Beautician'
  | 'Order'
  | 'MemberCard'
  | 'Reservation'
  | 'Schedule'
  | 'Supplier'
  | 'Terminal'
  | 'Automation'
  | 'FinanceMetric'
  | 'BusinessOverview'
  | 'Unknown';

export type BusinessActionIntent =
  | 'lookup'
  | 'list'
  | 'summary'
  | 'get_link'
  | 'analyze'
  | 'diagnose'
  | 'recommend'
  | 'compare'
  | 'draft'
  | 'confirm_action'
  | 'print'
  | 'unknown';

export type EntityResolutionStatus = 'resolved' | 'ambiguous' | 'not_found' | 'permission_denied';

export type EntityMatchStrategy = 'exact_title' | 'exact_name' | 'contains' | 'alias' | 'fuzzy' | 'semantic_candidate';

export type EntityResolutionCandidate = {
  objectType: BusinessObjectType;
  entityId: string;
  displayName: string;
  matchedText: string;
  confidence: number;
  matchStrategy: EntityMatchStrategy;
  sourceModel: string;
  evidence: string[];
  metadata?: Record<string, unknown>;
};

export type EntityResolutionResult = {
  status: EntityResolutionStatus;
  query: string;
  entity?: EntityResolutionCandidate;
  candidates: EntityResolutionCandidate[];
  clarificationQuestion?: string | null;
  deniedReason?: string | null;
};

export type EntityResolveInput = {
  text: string;
  storeId?: number;
  role?: AgentRole;
  preferredObjectTypes?: BusinessObjectType[];
  limit?: number;
};

export type BusinessObjectDefinition = {
  objectType: BusinessObjectType;
  displayName: string;
  sourceModels: string[];
  aliases: string[];
  description: string;
  queryableFields: string[];
  displayFields: Record<string, string>;
  supportedActions: BusinessActionIntent[];
};

export type AgentCapabilityDefinition = {
  capabilityId: string;
  displayName: string;
  description: string;
  personaCodes: AgentPersonaCode[];
  objectTypes: BusinessObjectType[];
  actions: BusinessActionIntent[];
  requiredEntities: BusinessObjectType[];
  optionalEntities?: BusinessObjectType[];
  outputKinds: string[];
  queryTemplateId?: string;
  businessQueryCapabilityId?: string;
  toolName?: string;
  permissionCodes?: string[];
  riskLevel: 'low' | 'medium' | 'high';
  examples: string[];
  negativeExamples: string[];
  triggerKeywords?: string[];
};

export type CapabilityResolutionInput = {
  text: string;
  role?: AgentPersonaCode;
  entities?: EntityResolutionCandidate[];
  action?: BusinessActionIntent;
};

export type CapabilityResolutionResult = {
  capability?: AgentCapabilityDefinition;
  action: BusinessActionIntent;
  confidence: number;
  reason: string;
  candidates: Array<{ capabilityId: string; score: number; reason: string }>;
};
