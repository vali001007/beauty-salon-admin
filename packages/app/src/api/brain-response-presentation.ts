import type { BrainChatResponse, BrainResponseBlock } from './brain';

export interface BrainChatPresentation {
  content: string;
  blocks: BrainResponseBlock[];
  status: BrainChatResponse['status'];
}

export function presentBrainChatResponse(result: BrainChatResponse): BrainChatPresentation {
  if (result.status === 'failed') {
    return terminalPresentation(result, '本次请求执行失败，未生成可信业务结论。', 'capability_failed');
  }
  if (result.status === 'cancelled') {
    return terminalPresentation(result, '本次请求已取消，未生成新的业务结论。', 'request_cancelled');
  }
  if (result.status === 'queued' || result.status === 'running') {
    return {
      status: result.status,
      content: 'Ami Brain 正在处理，本次业务结果尚未完成。',
      blocks: [
        { kind: 'text', text: 'Ami Brain 正在处理，本次业务结果尚未完成。' },
        { kind: 'limitations', items: ['request_processing'] },
      ],
    };
  }

  return {
    status: result.status,
    content: formatCompletedAnswer(result),
    blocks: completeBlocks(result),
  };
}

function terminalPresentation(
  result: BrainChatResponse,
  message: string,
  limitation: 'capability_failed' | 'request_cancelled',
): BrainChatPresentation {
  const evidence = evidenceBlock(result);
  return {
    status: result.status,
    content: message,
    blocks: [
      { kind: 'text', text: message },
      { kind: 'limitations', items: [limitation] },
      ...(evidence ? [evidence] : []),
    ],
  };
}

function completeBlocks(result: BrainChatResponse): BrainResponseBlock[] {
  const blocks = [...(result.blocks ?? [])];
  if (result.clarification && !blocks.some((block) => block.kind === 'clarification')) {
    blocks.push({ kind: 'clarification', ...result.clarification });
  }
  if (result.suggestedActions.length && !blocks.some((block) => block.kind === 'action_preview')) {
    blocks.push({ kind: 'action_preview', actions: result.suggestedActions });
  }
  if (result.citations.length && !blocks.some((block) => block.kind === 'evidence')) {
    blocks.push({ kind: 'evidence', citations: result.citations });
  }
  return blocks;
}

function evidenceBlock(result: BrainChatResponse): Extract<BrainResponseBlock, { kind: 'evidence' }> | undefined {
  const existing = result.blocks?.find(
    (block): block is Extract<BrainResponseBlock, { kind: 'evidence' }> => block.kind === 'evidence',
  );
  if (existing) return existing;
  return result.citations.length ? { kind: 'evidence', citations: result.citations } : undefined;
}

function formatCompletedAnswer(result: BrainChatResponse) {
  const lines = [result.answer];
  if (result.citations.length) {
    lines.push('');
    lines.push(`数据依据：${result.citations.map((item) => item.label ?? item.sourceId).join('、')}`);
  }
  if (result.suggestedActions.length) {
    lines.push('');
    lines.push(...result.suggestedActions.map((action) => `待确认动作：${action.summary}（${action.riskLevel}）`));
  }
  if (result.clarification) {
    lines.push('');
    lines.push(result.clarification.question);
  }
  return lines.join('\n');
}
