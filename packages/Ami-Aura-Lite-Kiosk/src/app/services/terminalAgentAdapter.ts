import type { AuraResolvedIntent } from '../intent/intentTypes';
import type { Role } from '../types';
import type { MicroAppRunResult } from '../microApps/microAppTypes';
import type { BusinessQueryContext } from '@/types/businessQuery';
import type { AgentRunResult } from '@/types/agent';
import {
  appendTerminalAgentMessage,
  createTerminalAgentRun,
  type TerminalAgentEngine,
} from './agentRuntimeService';

export interface TerminalAgentAdapterOptions {
  businessQueryContext?: BusinessQueryContext;
  agentContext?: Record<string, unknown>;
  agentEngine?: TerminalAgentEngine;
}

export function isTerminalAgentRuntimeEnabled(): boolean {
  const value = String(import.meta.env.VITE_KIOSK_AGENT_RUNTIME_ENABLED ?? '').trim().toLowerCase();
  return !['0', 'false', 'off', 'disabled'].includes(value);
}

export function shouldUseTerminalAgentRuntime(intent: AuraResolvedIntent): boolean {
  if (!isTerminalAgentRuntimeEnabled()) return false;
  if (intent.deniedReason || !intent.action) return false;
  if (intent.source !== 'text' && intent.source !== 'voice') return intent.action === 'business.query';
  return [
    'business.query',
    'manager.dashboard',
    'manager.staff',
    'manager.customers',
    'manager.inventory',
  ].includes(intent.action);
}

function buildAdapterContext(intent: AuraResolvedIntent, options: TerminalAgentAdapterOptions): Record<string, unknown> {
  const agentEngine = options.agentEngine ?? resolveContextAgentEngine(options.agentContext);
  const agentEngineMeta = agentEngine === 'agent_v2'
    ? { architecture: 'kg_llm_agent' }
    : agentEngine === 'agent_v3'
      ? { architecture: 'agent_v3_text_to_sql', agentV3Mode: 'execute' }
      : agentEngine === 'agent_v5'
        ? { architecture: 'agent_v5_business_ontology_agent', agentV5Mode: 'execute', boundary: 'drafts_followups_and_approval_only' }
      : agentEngine === 'agent_v4'
        ? { architecture: 'agent_v4_lifecycle_business_agent', agentV4Mode: 'execute', boundary: 'drafts_and_approval_only' }
      : {};
  const terminalContext = ((options.agentContext ?? {}).terminal as Record<string, unknown> | undefined) ?? {};
  return {
    ...(options.agentContext ?? {}),
    agentEngine,
    ...agentEngineMeta,
    terminal: {
      ...terminalContext,
      agentEngine,
      ...agentEngineMeta,
    },
    ...(options.businessQueryContext ? { previousBusinessQuery: options.businessQueryContext } : {}),
    intent: {
      name: intent.name,
      action: intent.action,
      confidence: intent.confidence,
      slots: intent.slots,
      source: intent.source,
    },
  };
}

function resolveContextAgentEngine(context?: Record<string, unknown>): TerminalAgentEngine {
  if (context?.agentEngine === 'agent_v5') return 'agent_v5';
  if (context?.agentEngine === 'agent_v4') return 'agent_v4';
  if (context?.agentEngine === 'agent_v3') return 'agent_v3';
  if (context?.agentEngine === 'agent_v2') return 'agent_v2';
  return 'agent_v1';
}

function getPreviousRunId(options: TerminalAgentAdapterOptions): number | null {
  const previousRun = options.agentContext?.previousRun;
  if (!previousRun || typeof previousRun !== 'object') return null;
  const runId = Number((previousRun as { runId?: unknown }).runId);
  return Number.isFinite(runId) && runId > 0 ? runId : null;
}

export async function runTerminalAgentIntent(
  intent: AuraResolvedIntent,
  command: string,
  role: Role,
  options: TerminalAgentAdapterOptions = {},
): Promise<MicroAppRunResult> {
  const context = buildAdapterContext(intent, options);
  const previousRunId = getPreviousRunId(options);
  const agentEngine = options.agentEngine ?? resolveContextAgentEngine(context);
  const data: AgentRunResult = previousRunId
    ? await appendTerminalAgentMessage({
        activeRunId: previousRunId,
        command,
        role,
        sourceAction: intent.action ?? null,
        source: intent.source,
        agentEngine,
        context,
      })
    : await createTerminalAgentRun({
        command,
        role,
        sourceAction: intent.action ?? null,
        source: intent.source,
        agentEngine,
        context,
      });

  return {
    messages: [{ type: 'dashboard', payload: { kind: 'agentRun', data } }],
  };
}
