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

type TargetMethod = Pick<BrainActionCapabilityExecutor, 'customerFollowUpDraft'>['customerFollowUpDraft'];

export interface GeneratedCapabilityExecutionContextProvider {
  current(): Parameters<TargetMethod>[1];
}

export const GENERATED_CAPABILITY_BINDING = Object.freeze({
  "schemaVersion": 1,
  "capabilityKey": "customer_follow_up_draft",
  "sourceFingerprint": "0669f02d24915e23ca734e4624e558c208d5d349390e11c7048a6eed05c7fe75",
  "target": {
    "kind": "service",
    "className": "BrainActionCapabilityExecutor",
    "methodName": "customerFollowUpDraft",
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
  "generatedSourcePath": "packages/server-v2/src/brain/capability/generated/customer_follow_up_draft/binding.ts",
  "targetImportPath": "../../executors/brain-action-capability.executor.js",
  "requiredPermissions": [
    "core:brain:use",
    "core:customer:view"
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
  "bindingFingerprint": "766b8e1b6f5c1a5168a3cb0acfdef9ce73a9a1234adf9abf850dc6d8a075e8bd"
} as const);

export class CustomerFollowUpDraftGeneratedCapabilityBinding {
  constructor(private readonly target: Pick<BrainActionCapabilityExecutor, 'customerFollowUpDraft'>, private readonly contextProvider: GeneratedCapabilityExecutionContextProvider) {}

  execute(args: GeneratedCapabilityArgs): ReturnType<TargetMethod> {
    assertGeneratedCapabilityArgs(GENERATED_CAPABILITY_BINDING.inputSchema, args);
    return this.target.customerFollowUpDraft(args, this.contextProvider.current());
  }
}
