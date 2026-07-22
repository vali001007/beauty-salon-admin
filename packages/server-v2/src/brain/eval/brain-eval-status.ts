import type { BrainAnswerGradeStatus } from './brain-answer-grader.service.js';
import type { BrainEvalLayerGrade } from './brain-intent-grader.service.js';

type BrainEvalLayers = {
  intent: BrainEvalLayerGrade;
  tool: BrainEvalLayerGrade;
  plan: BrainEvalLayerGrade;
  execution: BrainEvalLayerGrade;
  completion: BrainEvalLayerGrade;
  answer: BrainEvalLayerGrade;
};

export function statusForLayerFailure(
  layers: BrainEvalLayers,
  answerStatus: BrainAnswerGradeStatus,
): BrainAnswerGradeStatus {
  if (!isUsableStatus(answerStatus)) return answerStatus;
  if (!layers.intent.passed) return 'false_positive_intent_mismatch';
  if (!layers.tool.passed || !layers.plan.passed) return 'unsupported_intent';
  if (!layers.execution.passed || !layers.completion.passed) return 'metric_failed';
  return answerStatus;
}

function isUsableStatus(status: BrainAnswerGradeStatus) {
  return status === 'usable_exact' || status === 'usable_partial';
}
