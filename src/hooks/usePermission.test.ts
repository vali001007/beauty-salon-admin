import { renderHook } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { usePermission } from './usePermission';
import { useAuthStore } from '../stores/authStore';
import type { AuthUser } from '../types';

function createMockUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 1,
    username: 'testuser',
    name: 'Test User',
    phone: '13800000000',
    roles: ['store_manager'],
    permissions: [],
    deniedPermissions: [],
    storeIds: [1],
    ...overrides,
  };
}

describe('usePermission', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, token: null, isAuthenticated: false });
  });

  it('returns false when user is null', () => {
    const { result } = renderHook(() => usePermission('core:customer:view'));
    expect(result.current).toBe(false);
  });

  it('super_admin with ["*"] has all permissions', () => {
    useAuthStore.setState({
      user: createMockUser({
        roles: ['super_admin'],
        permissions: ['*'],
      }),
    });

    const { result: viewResult } = renderHook(() => usePermission('core:customer:view'));
    const { result: exportResult } = renderHook(() => usePermission('core:customer:export'));
    const { result: systemResult } = renderHook(() => usePermission('core:system:roles'));

    expect(viewResult.current).toBe(true);
    expect(exportResult.current).toBe(true);
    expect(systemResult.current).toBe(true);
  });

  it('user with specific permissions only has those permissions', () => {
    useAuthStore.setState({
      user: createMockUser({
        permissions: ['core:customer:view', 'core:customer:create'],
      }),
    });

    const { result: viewResult } = renderHook(() => usePermission('core:customer:view'));
    const { result: createResult } = renderHook(() => usePermission('core:customer:create'));
    const { result: deleteResult } = renderHook(() => usePermission('core:customer:delete'));
    const { result: exportResult } = renderHook(() => usePermission('core:customer:export'));

    expect(viewResult.current).toBe(true);
    expect(createResult.current).toBe(true);
    expect(deleteResult.current).toBe(false);
    expect(exportResult.current).toBe(false);
  });

  it('denied permissions override granted ones', () => {
    useAuthStore.setState({
      user: createMockUser({
        permissions: ['*'],
        deniedPermissions: ['core:customer:export'],
      }),
    });

    const { result: viewResult } = renderHook(() => usePermission('core:customer:view'));
    const { result: exportResult } = renderHook(() => usePermission('core:customer:export'));

    expect(viewResult.current).toBe(true);
    expect(exportResult.current).toBe(false);
  });

  it('denied wildcard blocks all permissions', () => {
    useAuthStore.setState({
      user: createMockUser({
        permissions: ['core:customer:view', 'core:customer:create'],
        deniedPermissions: ['*'],
      }),
    });

    const { result: viewResult } = renderHook(() => usePermission('core:customer:view'));
    const { result: createResult } = renderHook(() => usePermission('core:customer:create'));

    expect(viewResult.current).toBe(false);
    expect(createResult.current).toBe(false);
  });
});
