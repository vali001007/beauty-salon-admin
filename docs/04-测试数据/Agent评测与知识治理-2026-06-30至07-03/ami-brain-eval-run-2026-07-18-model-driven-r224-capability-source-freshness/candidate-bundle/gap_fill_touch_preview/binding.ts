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

type TargetMethod = Pick<BrainActionCapabilityExecutor, 'gapFillTouchPreview'>['gapFillTouchPreview'];

export interface GeneratedCapabilityExecutionContextProvider {
  current(): Parameters<TargetMethod>[1];
}

export const GENERATED_CAPABILITY_BINDING = Object.freeze({
  "schemaVersion": 1,
  "capabilityKey": "gap_fill_touch_preview",
  "sourceFingerprint": "5624c7a8024b59fa40bda3f4843b96d229e5023d133fa41d98918702c9f93562",
  "target": {
    "kind": "service",
    "className": "BrainActionCapabilityExecutor",
    "methodName": "gapFillTouchPreview",
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
  "generatedSourcePath": "packages/server-v2/src/brain/capability/generated/gap_fill_touch_preview/binding.ts",
  "targetImportPath": "../../executors/brain-action-capability.executor.js",
  "requiredPermissions": [
    "core:brain:use",
    "core:marketing:create",
    "core:store:scheduling"
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
  "bindingFingerprint": "965dc62f9de769edc8464e177864880c856b785b61fd814243def105dc35ff29"
} as const);

export class GapFillTouchPreviewGeneratedCapabilityBinding {
  constructor(private readonly target: Pick<BrainActionCapabilityExecutor, 'gapFillTouchPreview'>, private readonly contextProvider: GeneratedCapabilityExecutionContextProvider) {}

  execute(args: GeneratedCapabilityArgs): ReturnType<TargetMethod> {
    assertGeneratedCapabilityArgs(GENERATED_CAPABILITY_BINDING.inputSchema, args);
    return this.target.gapFillTouchPreview(args, this.contextProvider.current());
  }
}
