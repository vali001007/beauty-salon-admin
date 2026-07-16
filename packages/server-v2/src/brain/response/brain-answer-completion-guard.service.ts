import { BadRequestException, Injectable } from '@nestjs/common';
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
}
