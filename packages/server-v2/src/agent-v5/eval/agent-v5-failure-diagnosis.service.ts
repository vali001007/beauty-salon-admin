import { Injectable } from '@nestjs/common';
import type { AgentV5FailureDiagnosis, AgentV5RouteDecision } from '../agent-v5.types.js';

@Injectable()
export class AgentV5FailureDiagnosisService {
  diagnose(input: { route: AgentV5RouteDecision; status?: string; reason?: string }): AgentV5FailureDiagnosis | null {
    const reason = String(input.reason ?? '');
    if (input.route.missingSlots.length) {
      return { code: 'missing_required_slot', message: `缺少必要信息：${input.route.missingSlots.join(', ')}`, recoverable: true, nextSteps: ['补充缺失信息后重试。'] };
    }
    if (/permission|权限/.test(reason)) {
      return { code: 'permission_denied', message: reason || '当前权限不足。', recoverable: true, nextSteps: ['切换有权限账号或申请授权。'] };
    }
    if (/blocked|SQL Guard|无法生成安全查询|time_range|missing_time_range/.test(reason)) {
      return { code: 'readonly_query_blocked', message: reason || '只读问数被阻断。', recoverable: true, nextSteps: ['补充时间范围、业务对象或缩小查询范围。'] };
    }
    if (input.status === 'no_data') {
      return { code: 'data_not_found', message: '当前筛选范围内没有匹配数据。', recoverable: true, nextSteps: ['调整时间范围或检查是否已有业务数据。'] };
    }
    if (input.status === 'failed') {
      return { code: 'tool_execution_failed', message: reason || '工具执行失败。', recoverable: true, nextSteps: ['查看 V5 trace 和后端日志。'] };
    }
    return null;
  }
}
