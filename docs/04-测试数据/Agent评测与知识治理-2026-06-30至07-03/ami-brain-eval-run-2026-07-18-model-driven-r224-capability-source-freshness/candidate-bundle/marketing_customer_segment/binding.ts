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

type TargetMethod = Pick<BrainDomainServiceCapabilityExecutor, 'marketingCustomerSegment'>['marketingCustomerSegment'];

export interface GeneratedCapabilityExecutionContextProvider {
  current(): Parameters<TargetMethod>[1];
}

export const GENERATED_CAPABILITY_BINDING = Object.freeze({
  "schemaVersion": 1,
  "capabilityKey": "marketing_customer_segment",
  "sourceFingerprint": "ef7f756616082dc302c503a24fd83b9d05a56a4950a39d2d88c59f30285cf922",
  "target": {
    "kind": "service",
    "className": "BrainDomainServiceCapabilityExecutor",
    "methodName": "marketingCustomerSegment",
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
  "generatedSourcePath": "packages/server-v2/src/brain/capability/generated/marketing_customer_segment/binding.ts",
  "targetImportPath": "../../executors/brain-domain-service-capability.executor.js",
  "requiredPermissions": [
    "core:brain:use",
    "core:marketing:analytics"
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
  "bindingFingerprint": "378caeba580dd34a56d5eab9cbb0c45d676bffecba0f00deaa503799cd691ece"
} as const);

export class MarketingCustomerSegmentGeneratedCapabilityBinding {
  constructor(private readonly target: Pick<BrainDomainServiceCapabilityExecutor, 'marketingCustomerSegment'>, private readonly contextProvider: GeneratedCapabilityExecutionContextProvider) {}

  execute(args: GeneratedCapabilityArgs): ReturnType<TargetMethod> {
    assertGeneratedCapabilityArgs(GENERATED_CAPABILITY_BINDING.inputSchema, args);
    return this.target.marketingCustomerSegment(args, this.contextProvider.current());
  }
}
