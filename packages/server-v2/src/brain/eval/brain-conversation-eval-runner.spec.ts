import { runBrainEvalConversation } from './brain-conversation-eval-runner.js';

describe('runBrainEvalConversation', () => {
  it('creates one conversation and executes all turns sequentially against it', async () => {
    const events: string[] = [];
    const result = await runBrainEvalConversation({
      turns: ['first', 'second'],
      createConversation: async () => {
        events.push('create');
        return { id: 12 };
      },
      runTurn: async (turn, conversation, index) => {
        events.push(`${index}:${turn}:${conversation.id}`);
        return `${turn}-done`;
      },
    });

    expect(events).toEqual(['create', '0:first:12', '1:second:12']);
    expect(result).toEqual({ conversation: { id: 12 }, results: ['first-done', 'second-done'] });
  });

  it('fails closed for an empty conversation scenario', async () => {
    await expect(runBrainEvalConversation({
      turns: [],
      createConversation: async () => ({ id: 1 }),
      runTurn: async () => 'unused',
    })).rejects.toThrow('ami_brain_eval_conversation_turns_missing');
  });
});
