import { SetMetadata } from '@nestjs/common';
import type { BrainCapabilityDecoratorMetadata } from './brain-capability-scan.types.js';

export const BRAIN_CAPABILITY_METADATA = 'ami-brain:capability';

export const BrainCapability = (metadata: BrainCapabilityDecoratorMetadata): MethodDecorator & ClassDecorator =>
  SetMetadata(BRAIN_CAPABILITY_METADATA, metadata);
