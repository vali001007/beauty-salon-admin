import type { AuraResponseBlock } from './blocks';
import type { AgentPersonaCode, AgentRole } from './persona';
import type { AgentAnswerStatusNotice } from '../logic/answerContract';
import type { AgentEvidence, AgentRouteDecision, AgentSuggestedAction } from './result';

export interface RecentTurn {
  userInput: string;
  agentAnswer?: string;
  resolvedAction?: string | null;
  action?: string | null;
  keyEntities?: Record<string, unknown>;
  runId?: number | null;
  timestamp?: number;
  createdAt: string;
}

export interface ActiveEntities {
  customer?: { id: string | number; name: string };
  appointment?: { id: string | number; time?: string };
  dateRange?: { from: string; to: string };
  beautician?: { id: string | number; name: string };
  product?: { id: string | number; name: string };
  customerId?: number | string;
  customerName?: string;
  productId?: number | string;
  productName?: string;
  orderId?: number | string;
  runId?: number | string;
  [key: string]: unknown;
}

export interface ConversationContext {
  sessionId: string;
  role: AgentRole | string;
  storeId?: number;
  personaCode?: AgentPersonaCode | string;
  recentTurns: RecentTurn[];
  activeEntities: ActiveEntities;
}

export interface AgentConversationMessage {
  id: string;
  role: 'user' | 'agent';
  text?: string;
  blocks?: AuraResponseBlock[];
  evidence?: AgentEvidence;
  actions?: AgentSuggestedAction[];
  limitations?: string[];
  statusNotice?: AgentAnswerStatusNotice;
  metadata?: Record<string, unknown>;
  followUpSuggestions?: string[];
  loading?: boolean;
  error?: string;
  runId?: number;
  personaCode?: AgentPersonaCode | string;
  routeDecision?: AgentRouteDecision;
}
