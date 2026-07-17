import { Injectable } from '@nestjs/common';
import { layerGrade, record, type BrainEvalExpectation, type BrainEvalLayerGrade } from './brain-intent-grader.service.js';

@Injectable()
export class BrainCompletionGraderService {
  grade(input: {
    expected: BrainEvalExpectation;
    brainStatus?: string;
    completion?: unknown;
    citations?: unknown[];
    blocks?: unknown[];
    suggestedActions?: unknown[];
  }): BrainEvalLayerGrade {
    const completion = record(input.completion);
    const allowedStatuses = input.expected.brainStatuses?.length
      ? input.expected.brainStatuses
      : ['completed'];
    const checks: Array<{ ok: boolean; failure: string }> = [
      {
        ok: allowedStatuses.includes(String(input.brainStatus ?? 'missing')),
        failure: `brain_status:${String(input.brainStatus ?? 'missing')}`,
      },
    ];
    if (input.expected.requiresComplete !== false && completion.status !== undefined) {
      checks.push({ ok: completion.status === 'complete', failure: `completion_status:${String(completion.status)}` });
    }
    if (input.expected.requiresGrounding) {
      checks.push({ ok: Boolean(input.citations?.length), failure: 'completion_grounding_missing' });
    }
    if (input.expected.planShape?.requiresPreview) {
      const actionBlocks = (input.blocks ?? []).some((block) => record(block).kind === 'action_preview');
      checks.push({ ok: actionBlocks || Boolean(input.suggestedActions?.length), failure: 'completion_action_preview_missing' });
    }
    return layerGrade('completion', checks);
  }
}
