import { AiController } from './ai.controller';

describe('AiController', () => {
  it('exposes redacted provider routes and circuit state for governance', () => {
    const service = {
      getProviderHealth: jest.fn().mockReturnValue({
        primary: { provider: 'openai_responses', model: 'gpt-5.6-terra', gateway: 'primary.example', configured: true },
        fallback: { provider: 'openai_responses', model: 'gpt-5.6-terra', gateway: 'fallback.example', configured: true },
        redundancyMode: 'independent_route',
        circuits: [{ key: 'primary', state: 'closed', consecutiveFailures: 0 }],
      }),
    };
    const controller = new AiController(service as never);

    expect(controller.getProviderHealth()).toMatchObject({
      redundancyMode: 'independent_route',
      primary: { configured: true },
      fallback: { configured: true },
    });
    expect(service.getProviderHealth).toHaveBeenCalledTimes(1);
  });
});
