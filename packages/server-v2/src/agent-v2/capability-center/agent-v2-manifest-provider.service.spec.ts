import { listAgentV2CapabilityManifests } from '../capability/agent-v2-capability-manifest.js';
import { AgentV2ManifestProviderService } from './agent-v2-manifest-provider.service.js';

describe('AgentV2ManifestProviderService', () => {
  const originalTtl = process.env.AGENT_V2_MANIFEST_REFRESH_TTL_MS;
  const dynamicManifest = {
    ...listAgentV2CapabilityManifests().find((item) => item.capabilityId === 'order.product.records.list')!,
    capabilityId: 'order.product.records.dynamic',
    displayName: '动态商品订单查询',
  };

  afterEach(() => {
    if (originalTtl === undefined) {
      delete process.env.AGENT_V2_MANIFEST_REFRESH_TTL_MS;
    } else {
      process.env.AGENT_V2_MANIFEST_REFRESH_TTL_MS = originalTtl;
    }
    jest.restoreAllMocks();
  });

  it('uses only the active database manifest without merging builtin items', async () => {
    const prisma = {
      agentCapabilityManifestVersion: {
        findFirst: jest.fn().mockResolvedValue({
          id: 1,
          version: 'cap-active',
          status: 'active',
          items: [{ manifestJson: dynamicManifest }],
        }),
      },
    };
    const service = new AgentV2ManifestProviderService(prisma as any);

    await service.refreshFromDatabase();

    expect(service.getActiveVersion()).toBe('cap-active');
    expect(service.getActiveSource()).toBe('active');
    expect(service.listManifests().map((item) => item.capabilityId)).toEqual(['order.product.records.dynamic']);
  });

  it('returns an empty manifest when there is no active database version', async () => {
    const service = new AgentV2ManifestProviderService({
      agentCapabilityManifestVersion: { findFirst: jest.fn().mockResolvedValue(null) },
    } as any);

    await service.refreshFromDatabase();

    expect(service.getActiveVersion()).toBeNull();
    expect(service.getActiveSource()).toBe('missing');
    expect(service.listManifests()).toEqual([]);
    await expect(service.listManifestsForVersion('active')).resolves.toMatchObject({
      source: 'missing',
      found: false,
      itemCount: 0,
    });
  });

  it('does not fallback to builtin when initial database refresh fails', async () => {
    const service = new AgentV2ManifestProviderService({
      agentCapabilityManifestVersion: { findFirst: jest.fn().mockRejectedValue(new Error('database unavailable')) },
    } as any);

    await service.refreshFromDatabase();

    expect(service.getActiveVersion()).toBeNull();
    expect(service.getActiveSource()).toBe('database_error');
    expect(service.listManifests()).toEqual([]);
  });

  it('keeps the previous database active manifest when database refresh fails', async () => {
    const prisma = {
      agentCapabilityManifestVersion: {
        findFirst: jest.fn()
          .mockResolvedValueOnce({
            id: 1,
            version: 'cap-active',
            status: 'active',
            items: [{ manifestJson: dynamicManifest }],
          })
          .mockRejectedValueOnce(new Error('database unavailable')),
      },
    };
    const service = new AgentV2ManifestProviderService(prisma as any);

    await service.refreshFromDatabase();
    expect(service.getActiveVersion()).toBe('cap-active');
    expect(service.listManifests().map((item) => item.capabilityId)).toContain('order.product.records.dynamic');

    await service.refreshFromDatabase();

    expect(service.getActiveVersion()).toBe('cap-active');
    expect(service.listManifests().map((item) => item.capabilityId)).toEqual(['order.product.records.dynamic']);
  });

  it('keeps builtin manifests available only for explicit debug reads', async () => {
    const service = new AgentV2ManifestProviderService({
      agentCapabilityManifestVersion: { findFirst: jest.fn().mockResolvedValue(null) },
    } as any);

    const snapshot = await service.listManifestsForVersion('builtin');

    expect(snapshot.source).toBe('builtin');
    expect(snapshot.itemCount).toBe(listAgentV2CapabilityManifests().length);
    expect(snapshot.manifests.length).toBeGreaterThan(0);
  });

  it('schedules a background refresh when the manifest cache TTL expires', () => {
    process.env.AGENT_V2_MANIFEST_REFRESH_TTL_MS = '1';
    const service = new AgentV2ManifestProviderService({
      agentCapabilityManifestVersion: { findFirst: jest.fn().mockResolvedValue(null) },
    } as any);
    const refresh = jest.spyOn(service, 'refreshFromDatabase').mockResolvedValue(undefined);

    service.listManifests();

    expect(refresh).toHaveBeenCalled();
  });
});
