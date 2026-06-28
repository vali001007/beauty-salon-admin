import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePersona } from './usePersona';
import type { AgentPersonaSummary } from '../types/persona';

const personas: AgentPersonaSummary[] = [
  {
    code: 'manager',
    name: '店长经营 Agent',
    description: '店长经营',
    targetRoles: ['manager'],
    toolGroups: [],
    suggestedQuestions: [],
  },
  {
    code: 'marketing',
    name: '营销增长 Agent',
    description: '营销增长',
    targetRoles: ['manager', 'reception'],
    toolGroups: [],
    suggestedQuestions: [],
  },
  {
    code: 'finance',
    name: '财务风控 Agent',
    description: '财务风控',
    targetRoles: ['manager'],
    toolGroups: [],
    suggestedQuestions: [],
  },
];

describe('usePersona', () => {
  it('loads personas and filters them by role when requested', async () => {
    const api = {
      getPersonas: vi.fn(async () => personas),
    };

    const { result } = renderHook(() =>
      usePersona({
        api,
        role: 'reception',
        filterByRole: true,
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.personas.map((persona) => persona.code)).toEqual(['marketing']);
    expect(result.current.activePersona?.code).toBe('marketing');
  });

  it('falls back to built-in personas when remote personas fail', async () => {
    const api = {
      getPersonas: vi.fn(async () => {
        throw new Error('network error');
      }),
    };

    const { result } = renderHook(() =>
      usePersona({
        api,
        role: 'manager',
        filterByRole: true,
      }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeTruthy();
    expect(result.current.personas.map((persona) => persona.code)).toEqual([
      'manager',
      'marketing',
      'reception',
      'inventory',
      'finance',
    ]);
    expect(result.current.activePersona?.code).toBe('manager');
  });

  it('can switch persona by code', async () => {
    const { result } = renderHook(() =>
      usePersona({
        fallbackPersonas: personas,
        filterByRole: false,
      }),
    );

    act(() => {
      result.current.changePersona('finance');
    });

    expect(result.current.activePersona?.code).toBe('finance');
  });
});
