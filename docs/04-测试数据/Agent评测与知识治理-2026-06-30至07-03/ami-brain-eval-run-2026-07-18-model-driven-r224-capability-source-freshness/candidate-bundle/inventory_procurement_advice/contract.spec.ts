import { GENERATED_CAPABILITY_BINDING } from './binding.js';

export function assertGeneratedBindingContract(): void {
  if (GENERATED_CAPABILITY_BINDING.capabilityKey !== "inventory_procurement_advice") {
    throw new Error('generated_binding_capability_key_mismatch');
  }
  if (GENERATED_CAPABILITY_BINDING.sourceFingerprint !== "81a92f1b7e6dd2b30ebb642b0197de775e82eb9dc10e040de900b9df899d6dab") {
    throw new Error('generated_binding_source_fingerprint_mismatch');
  }
  if (GENERATED_CAPABILITY_BINDING.bindingFingerprint !== "af6424a1dc347adffa1c159b046c9af3812dca5a0c6ba0ab6298ed7e688b9351") {
    throw new Error('generated_binding_fingerprint_mismatch');
  }
  if (GENERATED_CAPABILITY_BINDING.target.kind !== "service" ||
      GENERATED_CAPABILITY_BINDING.target.className !== "BrainDomainServiceCapabilityExecutor" ||
      GENERATED_CAPABILITY_BINDING.target.methodName !== "inventoryProcurementAdvice" ||
      GENERATED_CAPABILITY_BINDING.target.sourcePath !== "packages/server-v2/src/brain/capability/executors/brain-domain-service-capability.executor.ts") {
    throw new Error('generated_binding_target_mismatch');
  }
}

assertGeneratedBindingContract();
