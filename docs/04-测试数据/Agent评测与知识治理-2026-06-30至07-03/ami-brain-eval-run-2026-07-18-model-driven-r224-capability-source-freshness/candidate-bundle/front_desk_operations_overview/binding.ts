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

type TargetMethod = Pick<BrainDomainServiceCapabilityExecutor, 'frontDeskOperationsOverview'>['frontDeskOperationsOverview'];

export interface GeneratedCapabilityExecutionContextProvider {
  current(): Parameters<TargetMethod>[1];
}

export const GENERATED_CAPABILITY_BINDING = Object.freeze({
  "schemaVersion": 1,
  "capabilityKey": "front_desk_operations_overview",
  "sourceFingerprint": "4f2e5fa0fb9bca564185352a5d4e5422f154b667e3f0b2abb2b49198235e10d2",
  "target": {
    "kind": "service",
    "className": "BrainDomainServiceCapabilityExecutor",
    "methodName": "frontDeskOperationsOverview",
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
  "generatedSourcePath": "packages/server-v2/src/brain/capability/generated/front_desk_operations_overview/binding.ts",
  "targetImportPath": "../../executors/brain-domain-service-capability.executor.js",
  "requiredPermissions": [
    "core:brain:use",
    "core:store:reservations"
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
  "bindingFingerprint": "acd7c932bacb9d86edd217654c0520b9e316ff4b402f2cbe8e51da105bdb91b0"
} as const);

export class FrontDeskOperationsOverviewGeneratedCapabilityBinding {
  constructor(private readonly target: Pick<BrainDomainServiceCapabilityExecutor, 'frontDeskOperationsOverview'>, private readonly contextProvider: GeneratedCapabilityExecutionContextProvider) {}

  execute(args: GeneratedCapabilityArgs): ReturnType<TargetMethod> {
    assertGeneratedCapabilityArgs(GENERATED_CAPABILITY_BINDING.inputSchema, args);
    return this.target.frontDeskOperationsOverview(args, this.contextProvider.current());
  }
}
