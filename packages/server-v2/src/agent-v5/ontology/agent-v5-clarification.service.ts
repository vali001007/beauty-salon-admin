import { Injectable } from '@nestjs/common';
import type { AuraClarificationOption, AuraResponseBlock } from '../../agent/agent.types.js';
import type { AgentV5ClarificationTrace, AgentV5RouteDecision } from '../agent-v5.types.js';

type InspectInput = {
  message: string;
  route: AgentV5RouteDecision;
};

export type AgentV5ClarificationResult = {
  required: boolean;
  trace: AgentV5ClarificationTrace;
  block?: Extract<AuraResponseBlock, { kind: 'clarification_card' }>;
};

@Injectable()
export class AgentV5ClarificationService {
  inspect(input: InspectInput): AgentV5ClarificationResult {
    const ambiguity = this.detectAmbiguity(String(input.message ?? ''), input.route);
    if (!ambiguity) {
      return {
        required: false,
        trace: {
          runId: 0,
          ambiguityType: 'domain',
          candidates: [],
          question: '',
          resolved: true,
          adapterBefore: input.route.adapterCandidates,
          adapterAfter: input.route.adapterCandidates,
        },
      };
    }

    const trace: AgentV5ClarificationTrace = {
      runId: 0,
      ambiguityType: ambiguity.type,
      candidates: ambiguity.options.map((item) => item.value),
      question: ambiguity.question,
      resolved: false,
      adapterBefore: input.route.adapterCandidates,
    };

    return {
      required: true,
      trace,
      block: {
        kind: 'clarification_card',
        title: ambiguity.title,
        question: ambiguity.question,
        options: ambiguity.options.map((option) => ({
          ...option,
          actionId: option.actionId ?? `agent-v5:clarification:${option.value}`,
        })),
        allowFreeText: true,
      },
    };
  }

  private detectAmbiguity(message: string, route: AgentV5RouteDecision): null | {
    type: AgentV5ClarificationTrace['ambiguityType'];
    title: string;
    question: string;
    options: AuraClarificationOption[];
  } {
    const trimmed = message.trim();
    if (/^(今天|最近|本周)?(情况|怎么样|咋样|如何)\??$/.test(trimmed) || /今天情况怎么样|最近情况怎么样/.test(message)) {
      return {
        type: 'domain',
        title: '需要确认业务视角',
        question: '你想看哪个方向的情况？',
        options: [
          { label: '经营概览', value: 'business_overview', description: '收入、预约、客户、库存和风险汇总' },
          { label: '预约现场', value: 'reservation_coordination', description: '今日预约、到店和空档' },
          { label: '财务收入', value: 'finance_margin', description: '营业额、实收、毛利和异常' },
          { label: '客户跟进', value: 'lifecycle_diagnosis', description: '生命周期机会和重点客户' },
        ],
      };
    }

    if (/(她|他|这个客户|那个客户)/.test(message) && !route.entities?.length) {
      return {
        type: 'entity',
        title: '需要确认客户',
        question: '你说的是哪个客户？可以输入姓名、手机号后四位或从候选客户中选择。',
        options: [
          { label: '输入客户姓名', value: 'input_customer_name' },
          { label: '输入手机号后四位', value: 'input_phone_suffix' },
        ],
      };
    }

    if (/处理|执行|发|群发|扣|退款|改|下单/.test(message)) {
      return {
        type: 'action',
        title: '需要确认动作边界',
        question: '你希望我执行到哪一步？',
        options: [
          { label: '只看建议', value: 'view_recommendation', description: '只输出原因和建议动作' },
          { label: '生成草稿', value: 'create_draft', description: '创建活动、规则或跟进任务草稿' },
          { label: '提交审批', value: 'submit_approval', description: '进入人工审批，不直接执行' },
        ],
      };
    }

    if (route.confidence < 0.68) {
      return {
        type: 'domain',
        title: '需要进一步明确问题',
        question: '这个问题更接近哪个业务域？',
        options: [
          { label: '客户', value: 'customer' },
          { label: '收银', value: 'cashier' },
          { label: '库存', value: 'inventory' },
          { label: '财务', value: 'finance' },
        ],
      };
    }

    return null;
  }
}
