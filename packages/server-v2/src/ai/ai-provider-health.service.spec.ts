import { ConfigService } from '@nestjs/config';
import { AiProviderHealthService } from './ai-provider-health.service';

describe('AiProviderHealthService', () => {
  const service = new AiProviderHealthService({
    get: (key: string, fallback: string) => ({
      LLM_CIRCUIT_FAILURE_THRESHOLD: '2',
      LLM_CIRCUIT_OPEN_MS: '1000',
    } as Record<string, string>)[key] ?? fallback,
  } as ConfigService);

  it('opens after consecutive failures and allows one recovery probe after cooldown', () => {
    expect(service.beginRequest('primary', 0)).toMatchObject({ allowed: true, state: 'closed' });
    service.recordFailure('primary', 'PROVIDER_UNAVAILABLE', 10);
    expect(service.beginRequest('primary', 20)).toMatchObject({ allowed: true, state: 'closed' });
    service.recordFailure('primary', 'PROVIDER_UNAVAILABLE', 30);

    expect(service.beginRequest('primary', 500)).toMatchObject({ allowed: false, state: 'open', reason: 'cooldown' });
    expect(service.beginRequest('primary', 1030)).toMatchObject({ allowed: true, state: 'half_open', reason: 'half_open_probe' });
    expect(service.beginRequest('primary', 1031)).toMatchObject({ allowed: false, reason: 'probe_in_flight' });

    service.recordSuccess('primary', 1040);
    expect(service.beginRequest('primary', 1041)).toMatchObject({ allowed: true, state: 'closed' });
    expect(service.snapshot()).toEqual([
      expect.objectContaining({ key: 'primary', state: 'closed', consecutiveFailures: 0, lastSuccessAt: 1040 }),
    ]);
  });

  it('reports whether fallback uses an independent route', () => {
    expect(service.redundancyMode('provider|gateway-a|model', 'provider|gateway-a|model')).toBe('same_route_retry');
    expect(service.redundancyMode('provider|gateway-a|model', 'provider|gateway-b|model')).toBe('independent_route');
    expect(service.redundancyMode('provider|gateway-a|model')).toBe('disabled');
  });
});
