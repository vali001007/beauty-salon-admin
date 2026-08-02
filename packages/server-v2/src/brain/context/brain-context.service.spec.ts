import { BadRequestException } from '@nestjs/common';
import { BrainContextService } from './brain-context.service.js';

describe('BrainContextService', () => {
  const service = new BrainContextService();

  it('reads authorized stores and roles from the JWT request shape', () => {
    const context = service.fromRequest({
      headers: { 'x-store-id': '6', 'x-request-id': 'req-1' },
      user: {
        id: 9,
        permissions: ['core:brain:use'],
        stores: [5, 6],
        roles: ['store_manager'],
      },
    } as never);

    expect(context).toMatchObject({
      userId: 9,
      storeId: 6,
      visibleStoreIds: [5, 6],
      roles: ['store_manager'],
      requestId: 'req-1',
    });
  });

  it('keeps compatibility with requests that expose storeIds', () => {
    const context = service.fromRequest({
      headers: { 'x-store-id': '6' },
      user: { id: 9, permissions: ['core:brain:use'], storeIds: [6] },
    } as never);

    expect(context.visibleStoreIds).toEqual([6]);
  });

  it('binds an explicit client channel and hashes the device identifier without retaining the raw value', () => {
    const context = service.fromRequest({
      headers: {
        'x-store-id': '6',
        'x-ami-client-channel': 'admin_web',
        'x-ami-device-id': 'mac-front-desk-01',
      },
      user: { id: 9, permissions: ['core:brain:use'], storeIds: [6] },
    } as never);

    expect(context.requestChannel).toBe('admin_web');
    expect(context.deviceIdHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(context.deviceIdHash).not.toContain('mac-front-desk-01');
  });

  it('does not bind an unregistered caller-supplied channel', () => {
    const context = service.fromRequest({
      headers: {
        'x-store-id': '2',
        'x-ami-client-channel': 'forged_partner_portal',
      },
      user: { id: 9, permissions: ['core:brain:use'], storeIds: [2] },
    } as never);

    expect(context.requestChannel).toBeUndefined();
  });

  it('rejects a store outside the authenticated user scope', () => {
    expect(() =>
      service.fromRequest({
        headers: { 'x-store-id': '7' },
        user: { id: 9, permissions: ['core:brain:use'], stores: [6] },
      } as never),
    ).toThrow(new BadRequestException('当前账号无权访问该门店'));
  });

  it('returns a structured business blocker when a store-scoped request has no store selected', () => {
    try {
      service.fromRequest({ headers: {}, user: { id: 1, permissions: ['*'] } } as never);
      throw new Error('expected store scope rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toEqual(expect.objectContaining({
        code: 'store_scope_required',
        category: 'business_blocker',
        resolutionType: 'select_store',
        retryable: false,
      }));
    }
  });

  it('builds a global governance identity without requiring a store selection', () => {
    const context = service.fromGlobalRequest({
      headers: { 'x-request-id': 'governance-global-1' },
      user: {
        id: 12,
        roles: ['brain_governance_approver'],
        permissions: ['core:brain-governance:approve'],
        deniedPermissions: ['core:brain-governance:release'],
      },
    } as never);

    expect(context).toEqual(expect.objectContaining({
      userId: 12,
      roles: ['brain_governance_approver'],
      permissions: ['core:brain-governance:approve'],
      deniedPermissions: ['core:brain-governance:release'],
      requestId: 'governance-global-1',
      timezone: 'Asia/Shanghai',
    }));
    expect(context).not.toHaveProperty('storeId');
    expect(context).not.toHaveProperty('visibleStoreIds');
  });

  it('keeps trusted channel and device hashing on global governance requests', () => {
    const context = service.fromGlobalRequest({
      headers: {
        'x-ami-client-channel': 'admin_web',
        'x-ami-device-id': 'governance-console-01',
      },
      user: { id: 12, permissions: ['core:brain-governance:view'] },
    } as never);

    expect(context.requestChannel).toBe('admin_web');
    expect(context.deviceIdHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(context.deviceIdHash).not.toContain('governance-console-01');
  });

  it('allows wildcard administrators to select the current store when no store list is attached', () => {
    const context = service.fromRequest({
      headers: { 'x-store-id': '7' },
      user: { id: 1, permissions: ['*'], stores: [], roles: ['super_admin'] },
    } as never);

    expect(context.visibleStoreIds).toEqual([7]);
  });
});
