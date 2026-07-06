import type { AuraResolvedIntent } from '../intent/intentTypes';
import type { Role } from '../types';
import type { MicroAppRunResult } from '../microApps/microAppTypes';
import type { BusinessQueryContext } from '@/types/businessQuery';
import type { AgentRunResult } from '@/types/agent';
import {
  appendTerminalAgentMessage,
  createTerminalAgentRun,
  type TerminalAgentEngine,
  type TerminalAgentV2GrayMode,
} from './agentRuntimeService';

export interface TerminalAgentAdapterOptions {
  businessQueryContext?: BusinessQueryContext;
  agentContext?: Record<string, unknown>;
  agentEngine?: TerminalAgentEngine;
  agentV2GrayMode?: TerminalAgentV2GrayMode;
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
  const agentEngine = options.agentEngine ?? (options.agentContext?.agentEngine === 'agent_v2' ? 'agent_v2' : 'agent_v1');
  const agentV2GrayMode =
    agentEngine === 'agent_v2'
      ? options.agentV2GrayMode ?? resolveContextAgentV2GrayMode(options.agentContext) ?? 'kg_llm_preferred'
      : undefined;
  const agentV2Meta = agentV2GrayMode ? { agentV2GrayMode, architecture: 'kg_llm_agent' } : {};
  const terminalContext = ((options.agentContext ?? {}).terminal as Record<string, unknown> | undefined) ?? {};
  return {
    ...(options.agentContext ?? {}),
    agentEngine,
    ...agentV2Meta,
    terminal: {
      ...terminalContext,
      agentEngine,
      ...agentV2Meta,
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

function resolveContextAgentV2GrayMode(context?: Record<string, unknown>): TerminalAgentV2GrayMode | undefined {
  const direct = context?.agentV2GrayMode;
  if (isAgentV2GrayMode(direct)) return direct;
  const terminal = context?.terminal;
  if (!terminal || typeof terminal !== 'object') return undefined;
  const terminalMode = (terminal as { agentV2GrayMode?: unknown }).agentV2GrayMode;
  return isAgentV2GrayMode(terminalMode) ? terminalMode : undefined;
}

function isAgentV2GrayMode(value: unknown): value is TerminalAgentV2GrayMode {
  return (
    value === 'legacy_regex' ||
    value === 'shadow' ||
    value === 'kg_llm_preferred' ||
    value === 'kg_llm_only' ||
    value === 'legacy_retired'
  );
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
  const agentEngine = options.agentEngine ?? (context.agentEngine === 'agent_v2' ? 'agent_v2' : 'agent_v1');
  const agentV2GrayMode = isAgentV2GrayMode(context.agentV2GrayMode) ? context.agentV2GrayMode : undefined;
  const data: AgentRunResult = previousRunId
    ? await appendTerminalAgentMessage({
        activeRunId: previousRunId,
        command,
        role,
        sourceAction: intent.action ?? null,
        source: intent.source,
        agentEngine,
        agentV2GrayMode,
        context,
      })
    : await createTerminalAgentRun({
        command,
        role,
        sourceAction: intent.action ?? null,
        source: intent.source,
        agentEngine,
        agentV2GrayMode,
        context,
      });

  return {
    messages: [{ type: 'dashboard', payload: { kind: 'agentRun', data } }],
  };
}
