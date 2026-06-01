import { LegacyMessagesController } from './legacy-messages.controller';

describe('LegacyMessagesController', () => {
  it('returns Anthropic-compatible content blocks and forwards normalized messages', async () => {
    const aiService = {
      chat: jest.fn().mockResolvedValue({
        id: 'ai-chat-1',
        text: 'legacy response',
        usage: {
          provider: 'mock',
          model: 'ami-core-mock-llm',
          inputTokens: 12,
          outputTokens: 8,
        },
      }),
    };
    const controller = new LegacyMessagesController(aiService as any);

    const result = await controller.create({
      model: 'claude-test',
      system: 'answer in Chinese',
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'hello' }] },
        { role: 'assistant', content: 'hi' },
      ],
    });

    expect(aiService.chat).toHaveBeenCalledWith([
      { role: 'user', content: 'System instruction:\nanswer in Chinese' },
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ]);
    expect(result).toMatchObject({
      id: 'ai-chat-1',
      type: 'message',
      role: 'assistant',
      model: 'ami-core-mock-llm',
      content: [{ type: 'text', text: 'legacy response' }],
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 12,
        output_tokens: 8,
      },
    });
  });
});
