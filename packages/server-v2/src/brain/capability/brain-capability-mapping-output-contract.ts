import type { BrainCapabilityCard } from './brain-capability.types.js';

const MAPPING_OUTPUT_DEFINITION_KEY = 'brainMappingOutputs';
const MAPPING_OUTPUT_KEY_PATTERN = /^[a-z][A-Za-z0-9]*$/;

export function withBrainCapabilityMappingOutputs(
  schema: Record<string, unknown>,
  mappingOutputs: readonly string[] | undefined,
): Record<string, unknown> {
  const keys = normalizeMappingOutputKeys(mappingOutputs);
  if (!keys.length) return schema;
  const definitions = isRecord(schema.$defs) ? schema.$defs : {};
  return {
    ...schema,
    $defs: {
      ...definitions,
      [MAPPING_OUTPUT_DEFINITION_KEY]: {
        type: 'object',
        additionalProperties: false,
        properties: Object.fromEntries(keys.map((key) => [key, {}])),
      },
    },
  };
}

export function brainCapabilityMappingOutputPaths(card: Pick<BrainCapabilityCard, 'outputSchema'>): string[] {
  const definitions = isRecord(card.outputSchema.$defs) ? card.outputSchema.$defs : undefined;
  const contract = definitions && isRecord(definitions[MAPPING_OUTPUT_DEFINITION_KEY])
    ? definitions[MAPPING_OUTPUT_DEFINITION_KEY]
    : undefined;
  const properties = contract && isRecord(contract.properties) ? contract.properties : undefined;
  return properties
    ? Object.keys(properties)
        .filter((key) => MAPPING_OUTPUT_KEY_PATTERN.test(key))
        .sort()
        .map((key) => `$.data.${key}`)
    : [];
}

function normalizeMappingOutputKeys(values: readonly string[] | undefined): string[] {
  const keys = [...new Set(values ?? [])].sort();
  for (const key of keys) {
    if (!MAPPING_OUTPUT_KEY_PATTERN.test(key)) {
      throw new Error(`brain_capability_mapping_output_key_invalid:${key}`);
    }
  }
  return keys;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
