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

type TargetMethod = Pick<BrainDomainServiceCapabilityExecutor, 'financeRiskOverview'>['financeRiskOverview'];

export interface GeneratedCapabilityExecutionContextProvider {
  current(): Parameters<TargetMethod>[1];
}

export const GENERATED_CAPABILITY_BINDING = Object.freeze({
  "schemaVersion": 1,
  "capabilityKey": "finance_risk_overview",
  "sourceFingerprint": "b283f8678d4b2db8aaaba7dc71af2660d4f1dab2713f5be981c4dcde9bad8e5a",
  "target": {
    "kind": "service",
    "className": "BrainDomainServiceCapabilityExecutor",
    "methodName": "financeRiskOverview",
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
  "generatedSourcePath": "packages/server-v2/src/brain/capability/generated/finance_risk_overview/binding.ts",
  "targetImportPath": "../../executors/brain-domain-service-capability.executor.js",
  "requiredPermissions": [
    "core:brain:use",
    "core:finance:view"
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
  "bindingFingerprint": "c39c3079abe302755776457abced3fca2653d5ffa0a711a16541f8ba92a3063d"
} as const);

export class FinanceRiskOverviewGeneratedCapabilityBinding {
  constructor(private readonly target: Pick<BrainDomainServiceCapabilityExecutor, 'financeRiskOverview'>, private readonly contextProvider: GeneratedCapabilityExecutionContextProvider) {}

  execute(args: GeneratedCapabilityArgs): ReturnType<TargetMethod> {
    assertGeneratedCapabilityArgs(GENERATED_CAPABILITY_BINDING.inputSchema, args);
    return this.target.financeRiskOverview(args, this.contextProvider.current());
  }
}
