import { TerminalCardController } from './terminal.controller.js';

describe('TerminalCardController card usage idempotency', () => {
  const consumeCard = jest.fn();
  const controller = new TerminalCardController({ consumeCard } as never);

  beforeEach(() => {
    jest.clearAllMocks();
    consumeCard.mockResolvedValue({ id: 71, idempotencyStatus: 'committed' });
  });

  it('requires an idempotency key before invoking the service', () => {
    expect(() =>
      controller.consume(99, 21, undefined, {
        customerCardId: 66,
        projectId: 101,
      }),
    ).toThrow(expect.objectContaining({
      response: expect.objectContaining({ code: 'TERMINAL_IDEMPOTENCY_KEY_REQUIRED' }),
    }));
    expect(consumeCard).not.toHaveBeenCalled();
  });

  it('rejects conflicting header and body keys', () => {
    expect(() =>
      controller.consume(99, 21, 'header-key-123', {
        idempotencyKey: 'body-key-456',
        customerCardId: 66,
        projectId: 101,
      }),
    ).toThrow(expect.objectContaining({
      response: expect.objectContaining({ code: 'TERMINAL_IDEMPOTENCY_KEY_MISMATCH' }),
    }));
    expect(consumeCard).not.toHaveBeenCalled();
  });

  it('passes one normalized key and the current operator to the service', async () => {
    await controller.consume(99, 21, 'terminal-card-usage-71', {
      customerCardId: 66,
      projectId: 101,
      times: 1,
    });

    expect(consumeCard).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'terminal-card-usage-71',
        operatorId: 21,
      }),
      99,
    );
  });
});
