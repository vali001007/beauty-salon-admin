import { BadRequestException, Injectable } from '@nestjs/common';
import type { BrainSemanticIntent } from '../cognition/brain-semantic-intent.types.js';
import type { BrainResponseEnvelope } from './brain-response.types.js';

const FACTUAL_KINDS = new Set(['kpi', 'ranking', 'table', 'chart', 'comparison', 'diagnosis']);

@Injectable()
export class BrainAnswerCompletionGuardService {
  assertValid(envelope: BrainResponseEnvelope) {
    const citationIds = new Set(envelope.citations.map((citation) => citation.sourceId));
    const limitations = envelope.blocks
      .filter((block) => block.kind === 'limitations')
      .flatMap((block) => block.items);
    for (const block of envelope.blocks) {
      if (block.kind === 'text' && /<\/?[a-z][^>]*>/i.test(block.text)) {
        throw new BadRequestException('brain_response_html_forbidden');
      }
      if (FACTUAL_KINDS.has(block.kind)) {
        const refs = 'citationIds' in block && Array.isArray(block.citationIds) ? block.citationIds : [];
        if (!refs.length || refs.some((ref) => !citationIds.has(ref))) {
          throw new BadRequestException(`brain_response_citation_required:${block.kind}`);
        }
      }
      if (block.kind === 'ranking' && block.rows.length < 1 && !limitations.some((item) => item.includes('no_data'))) {
        throw new BadRequestException('brain_response_ranking_rows_insufficient');
      }
    }
    if (envelope.completion.status !== 'complete' && !limitations.length) {
      throw new BadRequestException('brain_response_limitations_required');
    }
  }

  assertMatchesIntent(
    intent: Pick<BrainSemanticIntent, 'intent' | 'answerShape'>,
    envelope: BrainResponseEnvelope,
  ) {
    const kinds = new Set(envelope.blocks.map((block) => block.kind));
    const hasRows = envelope.blocks.some(
      (block) => (block.kind === 'table' || block.kind === 'ranking') && block.rows.length > 0,
    );
    const hasNoData = envelope.blocks.some(
      (block) => block.kind === 'limitations' && block.items.some((item) => item.startsWith('no_data:')),
    );
    const requireKind = (kind: string) => {
      if (!kinds.has(kind as never)) {
        throw new BadRequestException(`brain_response_answer_contract_mismatch:${intent.answerShape}:${kind}`);
      }
    };

    if (intent.intent === 'clarify' || intent.answerShape === 'clarification') {
      requireKind('clarification');
      return;
    }
    if (intent.intent === 'action' || intent.answerShape === 'action_preview') {
      if (kinds.has('clarification')) return;
      requireKind('action_preview');
      if (!envelope.suggestedActions.length) {
        throw new BadRequestException('brain_response_answer_contract_mismatch:action_preview:actions');
      }
      return;
    }
    if (intent.intent === 'draft' || intent.answerShape === 'draft') {
      if (!envelope.answer.trim() || kinds.has('kpi') || kinds.has('comparison') || kinds.has('ranking')) {
        throw new BadRequestException('brain_response_answer_contract_mismatch:draft:text');
      }
      return;
    }
    if (intent.intent === 'recommendation') {
      const hasRecommendationContent =
        kinds.has('text') || kinds.has('diagnosis') || kinds.has('table') || kinds.has('ranking') || hasNoData;
      if (!envelope.answer.trim() || !hasRecommendationContent) {
        throw new BadRequestException('brain_response_answer_contract_mismatch:recommendation:content');
      }
      return;
    }

    if (intent.answerShape === 'scalar') requireKind('kpi');
    if (intent.answerShape === 'comparison') requireKind('comparison');
    if (intent.answerShape === 'trend') requireKind('chart');
    if (intent.answerShape === 'ranking') requireKind('ranking');
    if (intent.answerShape === 'diagnosis') {
      const hasGroundedDiagnosticContext =
        envelope.citations.length > 0 &&
        ['kpi', 'chart', 'table', 'ranking', 'comparison'].some((kind) => kinds.has(kind as never));
      if (!kinds.has('diagnosis') && !hasGroundedDiagnosticContext && !hasNoData) {
        throw new BadRequestException('brain_response_answer_contract_mismatch:diagnosis:grounded_context');
      }
    }
    if (intent.answerShape === 'list' && !hasRows && !hasNoData) {
      throw new BadRequestException('brain_response_answer_contract_mismatch:list:rows');
    }
  }
}
