import { describe, expect, it, vi } from 'vitest';
import { createAgentApi, type AgentHttpClient } from './agentApi';

function createMockClient(): AgentHttpClient & {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
} {
  return {
    get: vi.fn(async () => ({})),
    post: vi.fn(async () => ({})),
  };
}

describe('createAgentApi', () => {
  it('creates and appends Agent runs with long-task request config', async () => {
    const client = createMockClient();
    const api = createAgentApi(client);

    await api.createRun({ message: '今天经营有什么风险', role: 'manager', entrypoint: 'terminal:kiosk' });
    await api.appendMessage(101, { message: '继续看库存', role: 'manager', entrypoint: 'terminal:kiosk' });

    expect(client.post).toHaveBeenNthCalledWith(
      1,
      '/agent/runs',
      { message: '今天经营有什么风险', role: 'manager', entrypoint: 'terminal:kiosk' },
      { timeout: 60000, skipRetry: true },
    );
    expect(client.post).toHaveBeenNthCalledWith(
      2,
      '/agent/runs/101/messages',
      { message: '继续看库存', role: 'manager', entrypoint: 'terminal:kiosk' },
      { timeout: 60000, skipRetry: true },
    );
  });

  it('uses shared persona, detail, and feedback endpoints', async () => {
    const client = createMockClient();
    const api = createAgentApi(client);

    await api.getPersonas();
    await api.getPersonaByCode('inventory');
    await api.getRunDetail(101);
    await api.submitFeedback(101, { adopted: false, rating: 1 });

    expect(client.get).toHaveBeenNthCalledWith(1, '/agent/personas');
    expect(client.get).toHaveBeenNthCalledWith(2, '/agent/personas/inventory');
    expect(client.get).toHaveBeenNthCalledWith(3, '/agent/runs/101/detail');
    expect(client.post).toHaveBeenCalledWith('/agent/runs/101/feedback', { adopted: false, rating: 1 });
  });
});
