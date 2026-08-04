import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type AiProviderCircuitState = 'closed' | 'open' | 'half_open';

type ProviderCircuit = {
  state: AiProviderCircuitState;
  consecutiveFailures: number;
  openedAt: number | null;
  lastFailureAt: number | null;
  lastSuccessAt: number | null;
  lastErrorCode: string | null;
  probeInFlight: boolean;
};

export type AiProviderCallDecision = {
  allowed: boolean;
  state: AiProviderCircuitState;
  reason: 'closed' | 'cooldown' | 'half_open_probe' | 'probe_in_flight';
};

@Injectable()
export class AiProviderHealthService {
  private readonly circuits = new Map<string, ProviderCircuit>();
  private readonly failureThreshold: number;
  private readonly openMs: number;

  constructor(private readonly config: ConfigService) {
    this.failureThreshold = this.positiveInteger('LLM_CIRCUIT_FAILURE_THRESHOLD', 3);
    this.openMs = this.positiveInteger('LLM_CIRCUIT_OPEN_MS', 30_000);
  }

  beginRequest(key: string, now = Date.now()): AiProviderCallDecision {
    const circuit = this.getCircuit(key);
    if (circuit.state === 'closed') return { allowed: true, state: 'closed', reason: 'closed' };
    if (circuit.state === 'open' && circuit.openedAt !== null && now - circuit.openedAt < this.openMs) {
      return { allowed: false, state: 'open', reason: 'cooldown' };
    }
    circuit.state = 'half_open';
    if (circuit.probeInFlight) return { allowed: false, state: 'half_open', reason: 'probe_in_flight' };
    circuit.probeInFlight = true;
    return { allowed: true, state: 'half_open', reason: 'half_open_probe' };
  }

  recordSuccess(key: string, now = Date.now()) {
    const circuit = this.getCircuit(key);
    circuit.state = 'closed';
    circuit.consecutiveFailures = 0;
    circuit.openedAt = null;
    circuit.lastSuccessAt = now;
    circuit.lastErrorCode = null;
    circuit.probeInFlight = false;
  }

  recordFailure(key: string, errorCode: string, now = Date.now()) {
    const circuit = this.getCircuit(key);
    circuit.consecutiveFailures += 1;
    circuit.lastFailureAt = now;
    circuit.lastErrorCode = errorCode;
    circuit.probeInFlight = false;
    if (circuit.state === 'half_open' || circuit.consecutiveFailures >= this.failureThreshold) {
      circuit.state = 'open';
      circuit.openedAt = now;
    }
  }

  snapshot() {
    return [...this.circuits.entries()].map(([key, circuit]) => ({ key, ...circuit }));
  }

  redundancyMode(primaryKey: string, fallbackKey?: string) {
    if (!fallbackKey) return 'disabled' as const;
    return primaryKey === fallbackKey ? 'same_route_retry' as const : 'independent_route' as const;
  }

  private getCircuit(key: string): ProviderCircuit {
    const existing = this.circuits.get(key);
    if (existing) return existing;
    const created: ProviderCircuit = {
      state: 'closed',
      consecutiveFailures: 0,
      openedAt: null,
      lastFailureAt: null,
      lastSuccessAt: null,
      lastErrorCode: null,
      probeInFlight: false,
    };
    this.circuits.set(key, created);
    return created;
  }

  private positiveInteger(key: string, fallback: number) {
    const value = Number(this.config.get(key, String(fallback)));
    return Number.isInteger(value) && value > 0 ? value : fallback;
  }
}
