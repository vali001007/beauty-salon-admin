import { Injectable } from '@nestjs/common';

export type BrainIntentKey =
  | 'metric_query'
  | 'diagnose_profit_drop'
  | 'create_reservation'
  | 'high_risk_action'
  | 'security_refusal'
  | 'general_assistant';

export interface BrainIntentClassification {
  key: BrainIntentKey;
  confidence: number;
  reason: string;
}

@Injectable()
export class IntentClassifierService {
  classify(input: { text: string; metricKeys: string[] }): BrainIntentClassification {
    const { text, metricKeys } = input;

    if (/(忽略之前|系统提示|导出所有客户手机号|权限绕过|密钥)/.test(text)) {
      return { key: 'security_refusal', confidence: 0.98, reason: 'prompt_injection_or_sensitive_export' };
    }

    if (/(为什么|原因|下滑|变差|比上周差|诊断)/.test(text)) {
      return { key: 'diagnose_profit_drop', confidence: 0.9, reason: 'asks_for_business_cause' };
    }

    if (/(预约|约).*(下午|上午|明天|今天)/.test(text)) {
      return { key: 'create_reservation', confidence: 0.84, reason: 'reservation_action_request' };
    }

    if (/(结算|批量|删除|导出)/.test(text)) {
      return { key: 'high_risk_action', confidence: 0.88, reason: 'operation_requires_confirmation' };
    }

    if (metricKeys.length > 0) {
      return { key: 'metric_query', confidence: 0.86, reason: 'contains_known_semantic_metric' };
    }

    return { key: 'general_assistant', confidence: 0.55, reason: 'fallback' };
  }
}
