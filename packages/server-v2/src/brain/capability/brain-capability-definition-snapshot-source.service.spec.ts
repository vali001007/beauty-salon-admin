import type { BusinessDefinitionRegistryService } from '../../semantic-data/business-definition-registry.service.js';
import { BrainCapabilityDefinitionSnapshotSourceService } from './brain-capability-definition-snapshot-source.service.js';

describe('BrainCapabilityDefinitionSnapshotSourceService', () => {
  it('loads the immutable published snapshot from the shared registry', async () => {
    const snapshot = { snapshotFingerprint: 'a'.repeat(64), definitions: [] };
    const registry = {
      getPublishedSnapshot: jest.fn().mockResolvedValue(snapshot),
    } as unknown as jest.Mocked<BusinessDefinitionRegistryService>;
    const source = new BrainCapabilityDefinitionSnapshotSourceService(registry);

    await expect(source.loadPublishedSnapshot()).resolves.toBe(snapshot);
    expect(registry.getPublishedSnapshot).toHaveBeenCalledWith();
  });

  it('loads a read-only evaluation snapshot for validated candidate definition versions', async () => {
    const snapshot = { snapshotFingerprint: 'b'.repeat(64), definitions: [] };
    const registry = {
      getEvaluationSnapshot: jest.fn().mockResolvedValue(snapshot),
    } as unknown as jest.Mocked<BusinessDefinitionRegistryService>;
    const source = new BrainCapabilityDefinitionSnapshotSourceService(registry);

    await expect(source.loadEvaluationSnapshot([128, 129])).resolves.toBe(snapshot);
    expect(registry.getEvaluationSnapshot).toHaveBeenCalledWith([128, 129]);
  });
});
