import {
  brainCapabilityMappingOutputPaths,
  withBrainCapabilityMappingOutputs,
} from './brain-capability-mapping-output-contract.js';

describe('brain capability mapping output contract', () => {
  it('stores declared mapping outputs in standard JSON Schema definitions', () => {
    const outputSchema = withBrainCapabilityMappingOutputs(
      { type: 'object', properties: { status: { type: 'string' } } },
      ['customerIds', 'priorityCustomers', 'customerIds'],
    );

    expect(brainCapabilityMappingOutputPaths({ outputSchema } as never)).toEqual([
      '$.data.customerIds',
      '$.data.priorityCustomers',
    ]);
    expect(outputSchema).toMatchObject({
      $defs: {
        brainMappingOutputs: {
          additionalProperties: false,
          properties: { customerIds: {}, priorityCustomers: {} },
        },
      },
    });
  });

  it('rejects malformed output keys before capability generation', () => {
    expect(() => withBrainCapabilityMappingOutputs({}, ['customer.ids'])).toThrow(
      'brain_capability_mapping_output_key_invalid:customer.ids',
    );
  });
});
