import { Injectable } from '@nestjs/common';
import { BusinessDefinitionRegistryService } from '../../semantic-data/business-definition-registry.service.js';
import type {
  BrainBusinessDefinitionSnapshot,
  BrainCapabilityDefinitionSnapshotSource,
} from './brain-capability-codegen.service.js';

@Injectable()
export class BrainCapabilityDefinitionSnapshotSourceService implements BrainCapabilityDefinitionSnapshotSource {
  constructor(private readonly registry: BusinessDefinitionRegistryService) {}

  async loadPublishedSnapshot(): Promise<BrainBusinessDefinitionSnapshot> {
    return (await this.registry.getPublishedSnapshot()) as BrainBusinessDefinitionSnapshot;
  }
}
