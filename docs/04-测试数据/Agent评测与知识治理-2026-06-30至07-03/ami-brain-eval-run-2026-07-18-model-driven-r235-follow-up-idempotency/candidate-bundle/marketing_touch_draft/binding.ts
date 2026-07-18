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

type TargetMethod = Pick<BrainActionCapabilityExecutor, 'marketingTouchDraft'>['marketingTouchDraft'];

export interface GeneratedCapabilityExecutionContextProvider {
  current(): Parameters<TargetMethod>[1];
}

export const GENERATED_CAPABILITY_BINDING = Object.freeze({
  "schemaVersion": 1,
  "capabilityKey": "marketing_touch_draft",
  "sourceFingerprint": "1e35a43df127e2452e32aa91e409590d697f6f667ef5bddc76ac3c729b5d88eb",
  "target": {
    "kind": "service",
    "className": "BrainActionCapabilityExecutor",
    "methodName": "marketingTouchDraft",
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
  "generatedSourcePath": "packages/server-v2/src/brain/capability/generated/marketing_touch_draft/binding.ts",
  "targetImportPath": "../../executors/brain-action-capability.executor.js",
  "requiredPermissions": [
    "core:brain:use",
    "core:marketing:create"
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
  "bindingFingerprint": "a792502819d74699ce32b3431e144d23d844b4a2de967ac12a9ed859ade91fc4"
} as const);

export class MarketingTouchDraftGeneratedCapabilityBinding {
  constructor(private readonly target: Pick<BrainActionCapabilityExecutor, 'marketingTouchDraft'>, private readonly contextProvider: GeneratedCapabilityExecutionContextProvider) {}

  execute(args: GeneratedCapabilityArgs): ReturnType<TargetMethod> {
    assertGeneratedCapabilityArgs(GENERATED_CAPABILITY_BINDING.inputSchema, args);
    return this.target.marketingTouchDraft(args, this.contextProvider.current());
  }
}
