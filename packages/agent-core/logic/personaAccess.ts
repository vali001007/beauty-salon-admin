import { PERSONA_ACCESS, type AgentPersonaCode, type AgentRole } from '../types/persona';

export function getPersonasForRole(role: AgentRole): AgentPersonaCode[] {
  return PERSONA_ACCESS[role] ?? PERSONA_ACCESS.manager;
}

export function canAccessPersona(role: AgentRole, persona: AgentPersonaCode): boolean {
  return getPersonasForRole(role).includes(persona);
}

export function getDefaultPersona(role: AgentRole): AgentPersonaCode {
  return getPersonasForRole(role)[0] ?? 'manager';
}

export function resolvePersonaForRole(role: AgentRole, persona?: string | null): AgentPersonaCode {
  return persona && canAccessPersona(role, persona as AgentPersonaCode) ? (persona as AgentPersonaCode) : getDefaultPersona(role);
}
