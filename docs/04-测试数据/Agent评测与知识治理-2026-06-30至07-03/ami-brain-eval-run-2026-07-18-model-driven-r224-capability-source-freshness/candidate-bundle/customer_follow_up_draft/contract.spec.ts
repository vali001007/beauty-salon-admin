import { GENERATED_CAPABILITY_BINDING } from './binding.js';

export function assertGeneratedBindingContract(): void {
  if (GENERATED_CAPABILITY_BINDING.capabilityKey !== "customer_follow_up_draft") {
    throw new Error('generated_binding_capability_key_mismatch');
  }
  if (GENERATED_CAPABILITY_BINDING.sourceFingerprint !== "1286cfee6e3141b329d84898a1ab94f92d3bb9743530d01ae4812e0b867d2b57") {
    throw new Error('generated_binding_source_fingerprint_mismatch');
  }
  if (GENERATED_CAPABILITY_BINDING.bindingFingerprint !== "ea0c6c109494e400644c5ad4ca89c98b0648cfb50aa8539bfe5586b0fe6711ef") {
    throw new Error('generated_binding_fingerprint_mismatch');
  }
  if (GENERATED_CAPABILITY_BINDING.target.kind !== "service" ||
      GENERATED_CAPABILITY_BINDING.target.className !== "BrainActionCapabilityExecutor" ||
      GENERATED_CAPABILITY_BINDING.target.methodName !== "customerFollowUpDraft" ||
      GENERATED_CAPABILITY_BINDING.target.sourcePath !== "packages/server-v2/src/brain/capability/executors/brain-action-capability.executor.ts") {
    throw new Error('generated_binding_target_mismatch');
  }
}

assertGeneratedBindingContract();
