import {
  getDefaultPersona,
  getPersonasForRole,
  resolvePersonaForRole,
  type AgentPersonaCode,
  type AgentRole,
} from '@ami/agent-core';
import type { Role } from '../types';

export type TerminalAgentPersonaCode = AgentPersonaCode;

export function toTerminalAgentRole(role: Role): AgentRole {
  return role === 'beautician' ? 'beautician' : role === 'reception' ? 'reception' : 'manager';
}

export function getDefaultTerminalPersona(role: Role): TerminalAgentPersonaCode {
  return getDefaultPersona(toTerminalAgentRole(role));
}

export function getTerminalPersonasForRole(role: Role): TerminalAgentPersonaCode[] {
  return getPersonasForRole(toTerminalAgentRole(role));
}

export function canUseTerminalPersona(role: Role, personaCode: string | undefined | null): personaCode is TerminalAgentPersonaCode {
  return Boolean(personaCode && getTerminalPersonasForRole(role).includes(personaCode as TerminalAgentPersonaCode));
}

export function resolveTerminalPersona(role: Role, personaCode?: string | null): TerminalAgentPersonaCode {
  return resolvePersonaForRole(toTerminalAgentRole(role), personaCode);
}
