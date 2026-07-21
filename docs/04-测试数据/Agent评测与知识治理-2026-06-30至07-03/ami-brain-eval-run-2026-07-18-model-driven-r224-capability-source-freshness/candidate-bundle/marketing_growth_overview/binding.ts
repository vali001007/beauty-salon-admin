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

type TargetMethod = Pick<BrainDomainServiceCapabilityExecutor, 'marketingGrowthOverview'>['marketingGrowthOverview'];

export interface GeneratedCapabilityExecutionContextProvider {
  current(): Parameters<TargetMethod>[1];
}

export const GENERATED_CAPABILITY_BINDING = Object.freeze({
  "schemaVersion": 1,
  "capabilityKey": "marketing_growth_overview",
  "sourceFingerprint": "ff93f37217a7651dc00763bad5f8b0218242a205dd3c97ccf9b861c8a0e3e3f0",
  "target": {
    "kind": "service",
    "className": "BrainDomainServiceCapabilityExecutor",
    "methodName": "marketingGrowthOverview",
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
  "generatedSourcePath": "packages/server-v2/src/brain/capability/generated/marketing_growth_overview/binding.ts",
  "targetImportPath": "../../executors/brain-domain-service-capability.executor.js",
  "requiredPermissions": [
    "core:brain:use",
    "core:customer:view",
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
  "bindingFingerprint": "2be9e6e463bc1eed21ebebbebe0d0f29d13a11f2d9971488e2c09f70fcab5405"
} as const);

export class MarketingGrowthOverviewGeneratedCapabilityBinding {
  constructor(private readonly target: Pick<BrainDomainServiceCapabilityExecutor, 'marketingGrowthOverview'>, private readonly contextProvider: GeneratedCapabilityExecutionContextProvider) {}

  execute(args: GeneratedCapabilityArgs): ReturnType<TargetMethod> {
    assertGeneratedCapabilityArgs(GENERATED_CAPABILITY_BINDING.inputSchema, args);
    return this.target.marketingGrowthOverview(args, this.contextProvider.current());
  }
}
