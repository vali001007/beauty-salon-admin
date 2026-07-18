import type { BrainDomainServiceCapabilityExecutor } from "../../executors/brain-domain-service-capability.executor.js";
import { assertGeneratedCapabilityArgs } from '../../brain-generated-capability-binding.js';

export interface GeneratedCapabilityArgs {
  readonly [key: string]: unknown;
  readonly "comparisonTarget"?: Record<string, unknown>;
  readonly "dimensions": Array<Record<string, unknown>>;
  readonly "entities": Array<Record<string, unknown>>;
  readonly "filters": Array<Record<string, unknown>>;
  readonly "limit"?: number;
  readonly "metrics": Array<Record<string, unknown>>;
  readonly "objective": string;
  readonly "orderBy": Array<Record<string, unknown>>;
  readonly "time"?: Record<string, unknown>;
}

type TargetMethod = Pick<BrainDomainServiceCapabilityExecutor, 'inventoryOperationsOverview'>['inventoryOperationsOverview'];

export interface GeneratedCapabilityExecutionContextProvider {
  current(): Parameters<TargetMethod>[1];
}

export const GENERATED_CAPABILITY_BINDING = Object.freeze({
  "schemaVersion": 1,
  "capabilityKey": "inventory_operations_overview",
  "sourceFingerprint": "7e4a4b6216e393ac01b1f51c717569c9a47364710a9e0eb0e72828635811bfd0",
  "target": {
    "kind": "service",
    "className": "BrainDomainServiceCapabilityExecutor",
    "methodName": "inventoryOperationsOverview",
    "sourcePath": "packages/server-v2/src/brain/capability/executors/brain-domain-service-capability.executor.ts",
    "exportedClass": true,
    "methodAccess": "public",
    "parameterCount": 2,
    "parameterTypes": [
      "BrainCapabilityToolArgs",
      "BrainCapabilityExecutionInput"
    ],
    "returnType": "unknown"
  },
  "generatedSourcePath": "packages/server-v2/src/brain/capability/generated/inventory_operations_overview/binding.ts",
  "targetImportPath": "../../executors/brain-domain-service-capability.executor.js",
  "requiredPermissions": [
    "core:brain:use",
    "core:inventory:stock"
  ],
  "storeScope": "required",
  "requiresConfirmation": false,
  "idempotency": "not_applicable",
  "readOnly": true,
  "sideEffect": false,
  "inputSchema": {
    "type": "object",
    "properties": {
      "comparisonTarget": {
        "type": "object"
      },
      "dimensions": {
        "type": "array",
        "items": {
          "type": "object"
        }
      },
      "entities": {
        "type": "array",
        "items": {
          "type": "object"
        }
      },
      "filters": {
        "type": "array",
        "items": {
          "type": "object"
        }
      },
      "limit": {
        "type": "number"
      },
      "metrics": {
        "type": "array",
        "items": {
          "type": "object"
        }
      },
      "objective": {
        "type": "string"
      },
      "orderBy": {
        "type": "array",
        "items": {
          "type": "object"
        }
      },
      "time": {
        "type": "object"
      }
    },
    "required": [
      "dimensions",
      "entities",
      "filters",
      "metrics",
      "objective",
      "orderBy"
    ],
    "additionalProperties": false
  },
  "outputSchema": {
    "type": "object"
  },
  "bindingFingerprint": "56ce4df2d324aada6be2c95255927af6b698d2aeeee45889f25fe54f6f708308"
} as const);

export class InventoryOperationsOverviewGeneratedCapabilityBinding {
  constructor(private readonly target: Pick<BrainDomainServiceCapabilityExecutor, 'inventoryOperationsOverview'>, private readonly contextProvider: GeneratedCapabilityExecutionContextProvider) {}

  execute(args: GeneratedCapabilityArgs): ReturnType<TargetMethod> {
    assertGeneratedCapabilityArgs(GENERATED_CAPABILITY_BINDING.inputSchema, args);
    return this.target.inventoryOperationsOverview(args, this.contextProvider.current());
  }
}
