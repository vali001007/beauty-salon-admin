import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BUILTIN_AGENT_PERSONAS,
  type AgentPersonaCode,
  type AgentPersonaSummary,
  type AgentRole,
} from '../types/persona';
import { getDefaultPersona, getPersonasForRole } from '../logic/personaAccess';

export interface PersonaApi {
  getPersonas(): Promise<AgentPersonaSummary[]>;
}

export interface UsePersonaOptions {
  api?: PersonaApi;
  role?: AgentRole;
  initialCode?: AgentPersonaCode | string | null;
  filterByRole?: boolean;
  fallbackPersonas?: AgentPersonaSummary[];
}

function filterPersonasByRole(personas: AgentPersonaSummary[], role?: AgentRole, filterByRole = true): AgentPersonaSummary[] {
  if (!filterByRole || !role) return personas;
  const allowedCodes = new Set(getPersonasForRole(role));
  return personas.filter((persona) => allowedCodes.has(persona.code));
}

function resolveInitialPersona(
  personas: AgentPersonaSummary[],
  role?: AgentRole,
  initialCode?: AgentPersonaCode | string | null,
): AgentPersonaSummary | null {
  if (!personas.length) return null;
  const requested = initialCode ? personas.find((persona) => persona.code === initialCode) : undefined;
  if (requested) return requested;
  const defaultCode = role ? getDefaultPersona(role) : personas[0].code;
  return personas.find((persona) => persona.code === defaultCode) ?? personas[0];
}

export function usePersona(options: UsePersonaOptions = {}) {
  const fallbackPersonas = options.fallbackPersonas ?? BUILTIN_AGENT_PERSONAS;
  const [rawPersonas, setRawPersonas] = useState<AgentPersonaSummary[]>(fallbackPersonas);
  const [activePersona, setActivePersona] = useState<AgentPersonaSummary | null>(() =>
    resolveInitialPersona(
      filterPersonasByRole(fallbackPersonas, options.role, options.filterByRole),
      options.role,
      options.initialCode,
    ),
  );
  const [loading, setLoading] = useState(Boolean(options.api));
  const [error, setError] = useState<unknown>(null);

  const personas = useMemo(
    () => filterPersonasByRole(rawPersonas, options.role, options.filterByRole),
    [options.filterByRole, options.role, rawPersonas],
  );

  const ensureActivePersona = useCallback(
    (nextPersonas: AgentPersonaSummary[]) => {
      setActivePersona((current) => {
        if (current && nextPersonas.some((persona) => persona.code === current.code)) return current;
        return resolveInitialPersona(nextPersonas, options.role, options.initialCode);
      });
    },
    [options.initialCode, options.role],
  );

  const reload = useCallback(async () => {
    if (!options.api) {
      const filtered = filterPersonasByRole(fallbackPersonas, options.role, options.filterByRole);
      setRawPersonas(fallbackPersonas);
      ensureActivePersona(filtered);
      return fallbackPersonas;
    }

    setLoading(true);
    try {
      const result = await options.api.getPersonas();
      const next = result.length ? result : fallbackPersonas;
      setRawPersonas(next);
      ensureActivePersona(filterPersonasByRole(next, options.role, options.filterByRole));
      setError(null);
      return next;
    } catch (nextError) {
      setRawPersonas(fallbackPersonas);
      ensureActivePersona(filterPersonasByRole(fallbackPersonas, options.role, options.filterByRole));
      setError(nextError);
      return fallbackPersonas;
    } finally {
      setLoading(false);
    }
  }, [ensureActivePersona, fallbackPersonas, options.api, options.filterByRole, options.role]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    ensureActivePersona(personas);
  }, [ensureActivePersona, personas]);

  const changePersona = useCallback(
    (personaOrCode: AgentPersonaSummary | AgentPersonaCode | string) => {
      const nextCode = typeof personaOrCode === 'string' ? personaOrCode : personaOrCode.code;
      const nextPersona = personas.find((persona) => persona.code === nextCode);
      if (nextPersona) setActivePersona(nextPersona);
      return nextPersona ?? null;
    },
    [personas],
  );

  return {
    personas,
    activePersona,
    activePersonaCode: activePersona?.code ?? null,
    setActivePersona,
    changePersona,
    loading,
    error,
    reload,
  };
}
