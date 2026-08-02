import { Injectable } from '@nestjs/common';
import type { AskDataSemanticIntent } from './ask-data-free-sql.types.js';

export type AskDataClarificationDecision = {
  required: boolean;
  reason?: string;
  question?: string;
};

@Injectable()
export class AskDataClarificationPolicy {
  inspect(intent: AskDataSemanticIntent): AskDataClarificationDecision {
    const ambiguity = intent.ambiguities[0];
    if (!ambiguity) return { required: false };
    if (ambiguity.slot === 'year') {
      return {
        required: true,
        reason: ambiguity.reason,
        question: '请补充要查询的具体年份，例如“2025 年双十一”。',
      };
    }
    if (ambiguity.slot === 'threshold') {
      return {
        required: true,
        reason: ambiguity.reason,
        question: '请补充金额阈值，例如“退款金额超过 1000 元”。',
      };
    }
    if (ambiguity.slot.endsWith('_identity')) {
      return {
        required: true,
        reason: ambiguity.reason,
        question: '请补充更完整的名称或对象 ID，以便唯一定位。',
      };
    }
    return { required: true, reason: ambiguity.reason, question: `请补充${ambiguity.slot}。` };
  }
}
