import type { BrainActionCapabilityExecutor } from "../../executors/brain-action-capability.executor.js";
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

type TargetMethod = Pick<BrainActionCapabilityExecutor, 'purchaseOrderDraft'>['purchaseOrderDraft'];

export interface GeneratedCapabilityExecutionContextProvider {
  current(): Parameters<TargetMethod>[1];
}

export const GENERATED_CAPABILITY_BINDING = Object.freeze({
  "schemaVersion": 1,
  "capabilityKey": "purchase_order_draft",
  "sourceFingerprint": "6111121abf97d6b6a59b1899db7da9dcd2779f41dccabdb47f09bbc115faac07",
  "target": {
    "kind": "service",
    "className": "BrainActionCapabilityExecutor",
    "methodName": "purchaseOrderDraft",
    "sourcePath": "packages/server-v2/src/brain/capability/executors/brain-action-capability.executor.ts",
    "exportedClass": true,
    "methodAccess": "public",
    "parameterCount": 2,
    "parameterTypes": [
      "BrainCapabilityToolArgs",
      "BrainCapabilityExecutionInput"
    ],
    "returnType": "unknown"
  },
  "generatedSourcePath": "packages/server-v2/src/brain/capability/generated/purchase_order_draft/binding.ts",
  "targetImportPath": "../../executors/brain-action-capability.executor.js",
  "requiredPermissions": [
    "core:brain:use",
    "core:supply:manage"
  ],
  "storeScope": "required",
  "requiresConfirmation": true,
  "idempotency": "required",
  "readOnly": false,
  "sideEffect": true,
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
  "bindingFingerprint": "9e5d254073ec17be264bf4e9b760c7e8f358c62d209ca45fd9ca289c1411ec96"
} as const);

export class PurchaseOrderDraftGeneratedCapabilityBinding {
  constructor(private readonly target: Pick<BrainActionCapabilityExecutor, 'purchaseOrderDraft'>, private readonly contextProvider: GeneratedCapabilityExecutionContextProvider) {}

  execute(args: GeneratedCapabilityArgs): ReturnType<TargetMethod> {
    assertGeneratedCapabilityArgs(GENERATED_CAPABILITY_BINDING.inputSchema, args);
    return this.target.purchaseOrderDraft(args, this.contextProvider.current());
  }
}
