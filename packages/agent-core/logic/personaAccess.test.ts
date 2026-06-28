import { describe, expect, it } from 'vitest';
import { canAccessPersona, getDefaultPersona, getPersonasForRole, resolvePersonaForRole } from './personaAccess';

describe('personaAccess', () => {
  it('restricts personas by terminal role', () => {
    expect(getPersonasForRole('manager')).toEqual(['manager', 'marketing', 'reception', 'inventory', 'finance']);
    expect(getPersonasForRole('reception')).toEqual(['reception', 'marketing']);
    expect(getPersonasForRole('beautician')).toEqual(['beautician']);
  });

  it('uses the role default when requested persona is unavailable', () => {
    expect(canAccessPersona('reception', 'finance')).toBe(false);
    expect(resolvePersonaForRole('reception', 'finance')).toBe('reception');
    expect(resolvePersonaForRole('beautician', 'marketing')).toBe('beautician');
    expect(getDefaultPersona('manager')).toBe('manager');
  });

  it('keeps allowed persona selections unchanged', () => {
    expect(resolvePersonaForRole('manager', 'inventory')).toBe('inventory');
    expect(resolvePersonaForRole('reception', 'marketing')).toBe('marketing');
  });
});
