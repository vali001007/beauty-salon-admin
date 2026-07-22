import type { AuraResolvedIntent } from '../intent/intentTypes';
import type { Role } from '../types';
import type { MicroAppRunResult } from '../microApps/microAppTypes';
import type { AgentRunResult } from '@/types/agent';
import {
  appendTerminalAgentMessage,
  createTerminalAgentRun,
} from './agentRuntimeService';

export interface TerminalAgentAdapterOptions {
  agentContext?: Record<string, unknown>;
}

export function shouldUseTerminalAgentRuntime(intent: AuraResolvedIntent): boolean {
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

function getPreviousRunId(options: TerminalAgentAdapterOptions): number | null {
  const previousRun = options.agentContext?.previousRun;
  if (!previousRun || typeof previousRun !== 'object') return null;
  const runId = Number((previousRun as { runId?: unknown }).runId);
  return Number.isFinite(runId) && runId > 0 ? runId : null;
}

export async function runTerminalAgentIntent(
  _intent: AuraResolvedIntent,
  command: string,
  role: Role,
  options: TerminalAgentAdapterOptions = {},
): Promise<MicroAppRunResult> {
  const previousRunId = getPreviousRunId(options);
  const data: AgentRunResult = previousRunId
    ? await appendTerminalAgentMessage({
        activeRunId: previousRunId,
        command,
        role,
      })
    : await createTerminalAgentRun({
        command,
        role,
      });

  return {
    messages: [{ type: 'dashboard', payload: { kind: 'agentRun', data } }],
  };
}
