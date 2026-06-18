import { afterEach, describe, expect, it, vi } from 'vitest';

function createSseResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });

  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

async function collect(generator: AsyncGenerator<string>) {
  const chunks: string[] = [];
  for await (const chunk of generator) chunks.push(chunk);
  return chunks;
}

describe('realStreamAiChatMessage', () => {
  afterEach(() => {
    vi.doUnmock('@/stores/storeStore');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('parses SSE delta chunks and sends terminal auth headers', async () => {
    const fetchMock = vi.fn(async () =>
      createSseResponse([
        'data: {"delta":"第一段"}\n\n',
        'data: {"delta":"第二段"}\n\n',
        'data: [DONE]\n\n',
      ]),
    );
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => (key === 'token' ? 'test-token' : null)),
    });
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      writable: true,
      value: 'csrf_token=test-csrf',
    });
    vi.doMock('@/stores/storeStore', () => ({
      useStoreStore: {
        getState: () => ({ currentStoreId: 7 }),
      },
    }));
    vi.resetModules();

    const { realStreamAiChatMessage } = await import('./ai');
    const chunks = await collect(realStreamAiChatMessage({ messages: [{ role: 'user', content: '今日经营怎么样' }] }));

    expect(chunks).toEqual(['第一段', '第二段']);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ai/chat/messages/stream',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
          'X-Store-Id': '7',
          'X-CSRF-Token': 'test-csrf',
        }),
      }),
    );
  });

  it('keeps the final SSE delta when the stream closes without a trailing blank line', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => createSseResponse(['data: {"delta":"尾段"}'])));
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null) });
    vi.doMock('@/stores/storeStore', () => ({
      useStoreStore: {
        getState: () => ({ currentStoreId: null }),
      },
    }));
    vi.resetModules();

    const { realStreamAiChatMessage } = await import('./ai');
    const chunks = await collect(realStreamAiChatMessage({ messages: [{ role: 'user', content: '长回答' }] }));

    expect(chunks).toEqual(['尾段']);
  });
});
