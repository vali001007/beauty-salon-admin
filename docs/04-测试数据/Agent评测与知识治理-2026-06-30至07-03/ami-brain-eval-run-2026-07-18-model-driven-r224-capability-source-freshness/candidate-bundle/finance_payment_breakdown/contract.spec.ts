import { GENERATED_CAPABILITY_BINDING } from './binding.js';

export function assertGeneratedBindingContract(): void {
  if (GENERATED_CAPABILITY_BINDING.capabilityKey !== "finance_payment_breakdown") {
    throw new Error('generated_binding_capability_key_mismatch');
  }
  if (GENERATED_CAPABILITY_BINDING.sourceFingerprint !== "17c0d4a5966212fc379219be6bdc6f81e5d837c1d6c1ade5dc5878c7125bc000") {
    throw new Error('generated_binding_source_fingerprint_mismatch');
  }
  if (GENERATED_CAPABILITY_BINDING.bindingFingerprint !== "cbce7ce2acd2c2231de2d36931f37861def85230f0154ff358f1932a1f4feaf8") {
    throw new Error('generated_binding_fingerprint_mismatch');
  }
  if (GENERATED_CAPABILITY_BINDING.target.kind !== "service" ||
      GENERATED_CAPABILITY_BINDING.target.className !== "BrainDomainServiceCapabilityExecutor" ||
      GENERATED_CAPABILITY_BINDING.target.methodName !== "financePaymentBreakdown" ||
      GENERATED_CAPABILITY_BINDING.target.sourcePath !== "packages/server-v2/src/brain/capability/executors/brain-domain-service-capability.executor.ts") {
    throw new Error('generated_binding_target_mismatch');
  }
}

assertGeneratedBindingContract();
