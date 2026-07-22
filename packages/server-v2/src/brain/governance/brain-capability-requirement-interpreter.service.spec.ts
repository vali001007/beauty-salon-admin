import { BrainCapabilityRequirementInterpreterService } from './brain-capability-requirement-interpreter.service.js';

describe('BrainCapabilityRequirementInterpreterService', () => {
  it('uses governed structured generation and exposes only the approved change contract', async () => {
    const ai = { generateStructured: jest.fn().mockResolvedValue({ data: {
      confidence: 0.96, ambiguous: false, allowedRoles: ['store_manager'],
      additionalPermissions: ['core:finance:view'], redaction: 'unchanged', readOnly: 'require',
      confirmation: 'unchanged', rolloutPercentage: 5,
      prohibitedRequests: [], ambiguities: [],
    } }) };
    const service = new BrainCapabilityRequirementInterpreterService(ai as never);

    const result = await service.interpret({ requirement: '商品销售排行只允许店长查看，增加财务查看权限，下一版先走 5% 灰度', createdBy: 9 });

    expect(ai.generateStructured).toHaveBeenCalledWith(expect.objectContaining({
      scenario: 'brain.capability_regeneration_requirement.v1',
      schema: expect.objectContaining({ additionalProperties: false }),
    }));
    expect(result).toEqual(expect.objectContaining({ confidence: 0.96, ambiguous: false, additionalPermissions: ['core:finance:view'] }));
    expect(Object.keys(result).sort()).toEqual([
      'additionalPermissions', 'allowedRoles', 'ambiguities', 'ambiguous', 'confidence', 'confirmation', 'prohibitedRequests', 'readOnly', 'redaction', 'rolloutPercentage',
    ]);
    const call = ai.generateStructured.mock.calls[0][0];
    expect(call.schema.required).toEqual(expect.arrayContaining(['prohibitedRequests', 'ambiguities']));
    expect(call.messages[0].content).toMatch(/synonym|double-negation|languages/i);
    expect(call.messages[0].content).toContain('keep read-only');
  });

  it('fails closed when structured generation is unavailable', async () => {
    const service = new BrainCapabilityRequirementInterpreterService({ generateStructured: jest.fn().mockRejectedValue(new Error('provider down')) } as never);
    await expect(service.interpret({ requirement: '只允许店长', createdBy: 9 })).resolves.toMatchObject({ confidence: 0, ambiguous: true, ambiguities: expect.any(Array) });
  });

  it('preserves a null rollout request instead of coercing it to zero', async () => {
    const service = new BrainCapabilityRequirementInterpreterService({
      generateStructured: jest.fn().mockResolvedValue({
        data: {
          confidence: 0.9,
          ambiguous: false,
          allowedRoles: [],
          additionalPermissions: [],
          redaction: 'unchanged',
          readOnly: 'unchanged',
          confirmation: 'unchanged',
          rolloutPercentage: null,
          prohibitedRequests: [],
          ambiguities: [],
        },
      }),
    } as never);

    await expect(service.interpret({ requirement: '保持现有灰度策略', createdBy: 9 })).resolves.toMatchObject({
      rolloutPercentage: null,
    });
  });

  it('drops operation labels that do not match the backend permission code contract', async () => {
    const service = new BrainCapabilityRequirementInterpreterService({
      generateStructured: jest.fn().mockResolvedValue({
        data: {
          confidence: 0.9,
          ambiguous: false,
          allowedRoles: [],
          additionalPermissions: ['reservation_list:query', 'core:store:reservations'],
          redaction: 'unchanged',
          readOnly: 'unchanged',
          confirmation: 'unchanged',
          rolloutPercentage: null,
          prohibitedRequests: [],
          ambiguities: [],
        },
      }),
    } as never);

    await expect(service.interpret({ requirement: '重新生成预约技能', createdBy: 9 })).resolves.toMatchObject({
      additionalPermissions: ['core:store:reservations'],
    });
  });
});
