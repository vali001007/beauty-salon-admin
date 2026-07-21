import { GENERATED_CAPABILITY_BINDING } from './binding.js';

export function assertGeneratedBindingContract(): void {
  if (GENERATED_CAPABILITY_BINDING.capabilityKey !== "marketing_customer_segment") {
    throw new Error('generated_binding_capability_key_mismatch');
  }
  if (GENERATED_CAPABILITY_BINDING.sourceFingerprint !== "ef7f756616082dc302c503a24fd83b9d05a56a4950a39d2d88c59f30285cf922") {
    throw new Error('generated_binding_source_fingerprint_mismatch');
  }
  if (GENERATED_CAPABILITY_BINDING.bindingFingerprint !== "378caeba580dd34a56d5eab9cbb0c45d676bffecba0f00deaa503799cd691ece") {
    throw new Error('generated_binding_fingerprint_mismatch');
  }
  if (GENERATED_CAPABILITY_BINDING.target.kind !== "service" ||
      GENERATED_CAPABILITY_BINDING.target.className !== "BrainDomainServiceCapabilityExecutor" ||
      GENERATED_CAPABILITY_BINDING.target.methodName !== "marketingCustomerSegment" ||
      GENERATED_CAPABILITY_BINDING.target.sourcePath !== "packages/server-v2/src/brain/capability/executors/brain-domain-service-capability.executor.ts") {
    throw new Error('generated_binding_target_mismatch');
  }
}

assertGeneratedBindingContract();
