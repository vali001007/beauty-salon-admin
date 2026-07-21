export async function runBrainEvalConversation<TTurn, TConversation, TResult>(input: {
  turns: readonly TTurn[];
  createConversation: () => Promise<TConversation>;
  runTurn: (turn: TTurn, conversation: TConversation, index: number) => Promise<TResult>;
}) {
  if (!input.turns.length) throw new Error('ami_brain_eval_conversation_turns_missing');
  const conversation = await input.createConversation();
  const results: TResult[] = [];
  for (const [index, turn] of input.turns.entries()) {
    results.push(await input.runTurn(turn, conversation, index));
  }
  return { conversation, results };
}
