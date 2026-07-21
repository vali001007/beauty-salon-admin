import { GENERATED_CAPABILITY_BINDING } from './binding.js';

export function assertGeneratedBindingContract(): void {
  if (GENERATED_CAPABILITY_BINDING.capabilityKey !== "beautician_material_preparation") {
    throw new Error('generated_binding_capability_key_mismatch');
  }
  if (GENERATED_CAPABILITY_BINDING.sourceFingerprint !== "25e7001fdb588e1fc577d0587e59c0fe696404531d2e7bdbafaafb843b112901") {
    throw new Error('generated_binding_source_fingerprint_mismatch');
  }
  if (GENERATED_CAPABILITY_BINDING.bindingFingerprint !== "af978560b3046fe4ff64089aaf93e3e22d02d80d4bda77135ce53b20c7ae034c") {
    throw new Error('generated_binding_fingerprint_mismatch');
  }
  if (GENERATED_CAPABILITY_BINDING.target.kind !== "service" ||
      GENERATED_CAPABILITY_BINDING.target.className !== "BrainDomainServiceCapabilityExecutor" ||
      GENERATED_CAPABILITY_BINDING.target.methodName !== "beauticianMaterialPreparation" ||
      GENERATED_CAPABILITY_BINDING.target.sourcePath !== "packages/server-v2/src/brain/capability/executors/brain-domain-service-capability.executor.ts") {
    throw new Error('generated_binding_target_mismatch');
  }
}

assertGeneratedBindingContract();
