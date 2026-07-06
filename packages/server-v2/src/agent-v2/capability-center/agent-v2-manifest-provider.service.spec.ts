import { listAgentV2CapabilityManifests } from '../capability/agent-v2-capability-manifest.js';
import { AgentV2ManifestProviderService } from './agent-v2-manifest-provider.service.js';

describe('AgentV2ManifestProviderService', () => {
  const originalTtl = process.env.AGENT_V2_MANIFEST_REFRESH_TTL_MS;

  afterEach(() => {
    if (originalTtl === undefined) {
      delete process.env.AGENT_V2_MANIFEST_REFRESH_TTL_MS;
    } else {
      process.env.AGENT_V2_MANIFEST_REFRESH_TTL_MS = originalTtl;
    }
    jest.restoreAllMocks();
  });

  it('keeps the previous active manifest when database refresh fails', async () => {
    const dynamicManifest = {
      ...listAgentV2CapabilityManifests().find((item) => item.capabilityId === 'order.product.records.list')!,
      capabilityId: 'order.product.records.dynamic',
      displayName: '动态商品订单查询',
    };
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
    expect(service.listManifests().map((item) => item.capabilityId)).toContain('order.product.records.dynamic');
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
