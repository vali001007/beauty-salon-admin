import { assertGeneratedCapabilityArgs } from './brain-generated-capability-binding.js';

describe('generated capability args validation', () => {
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['objective'],
    properties: {
      objective: { type: 'string' },
      filters: { type: 'array', items: { type: 'object' } },
    },
  };

  it('rejects additional fields through JSON Schema', () => {
    expect(() => assertGeneratedCapabilityArgs(schema, { objective: '查询', extra: true })).toThrow(
      'generated_capability_args_schema_invalid',
    );
  });

  it('rejects nested identity keys', () => {
    expect(() =>
      assertGeneratedCapabilityArgs(schema, { objective: '查询', filters: [{ field: 'storeId' }] }),
    ).toThrow('generated_capability_control_metadata_forbidden');
  });

  it('rejects path and URL strings even when the field is otherwise allowed by schema', () => {
    expect(() => assertGeneratedCapabilityArgs(schema, { objective: '/api/customers' })).toThrow(
      'generated_capability_control_metadata_forbidden',
    );
    expect(() => assertGeneratedCapabilityArgs(schema, { objective: 'https://example.com/customers' })).toThrow(
      'generated_capability_control_metadata_forbidden',
    );
  });

  it.each([
    '../../etc/passwd',
    'C:\\Windows\\System32',
    '\\\\server\\share',
    'file:///etc/passwd',
    '/etc/passwd',
    '..\\..\\Windows\\System32',
    'folder/secret.txt',
    'folder\\secret.txt',
  ])('rejects filesystem path strings: %s', (objective) => {
    expect(() => assertGeneratedCapabilityArgs(schema, { objective })).toThrow(
      'generated_capability_control_metadata_forbidden',
    );
  });

  it('rejects filesystem path strings nested in arrays and objects', () => {
    expect(() =>
      assertGeneratedCapabilityArgs(schema, {
        objective: '查询',
        filters: [{ field: 'customerName', value: '../../etc/passwd' }],
      }),
    ).toThrow('generated_capability_control_metadata_forbidden');
  });
});
