import type { AuraResolvedIntent } from '../intent/intentTypes';
import type { Role } from '../types';
import type { MicroAppRunResult } from '../microApps/microAppTypes';
import type { BusinessQueryContext } from '@/types/businessQuery';
import type { AgentRunResult } from '@/types/agent';
import { appendTerminalAgentMessage, createTerminalAgentRun } from './agentRuntimeService';

export interface TerminalAgentAdapterOptions {
  businessQueryContext?: BusinessQueryContext;
  agentContext?: Record<string, unknown>;
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
  return {
    ...(options.agentContext ?? {}),
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
  const data: AgentRunResult = previousRunId
    ? await appendTerminalAgentMessage({
        activeRunId: previousRunId,
        command,
        role,
        sourceAction: intent.action ?? null,
        source: intent.source,
        context,
      })
    : await createTerminalAgentRun({
        command,
        role,
        sourceAction: intent.action ?? null,
        source: intent.source,
        context,
      });

  return {
    messages: [{ type: 'dashboard', payload: { kind: 'agentRun', data } }],
  };
}
