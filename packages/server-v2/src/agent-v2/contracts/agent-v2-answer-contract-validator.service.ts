import { Injectable } from '@nestjs/common';
import type { AgentPlan, AgentToolResult, AuraResponseBlock } from '../../agent/agent.types.js';

export type AgentV2AnswerContractValidationInput = {
  question: string;
  plan?: AgentPlan;
  answer: string;
  toolResults: AgentToolResult[];
  renderedBlocks?: AuraResponseBlock[];
};

export type AgentV2AnswerContractValidation = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

@Injectable()
export class AgentV2AnswerContractValidatorService {
  validate(input: AgentV2AnswerContractValidationInput): AgentV2AnswerContractValidation {
    const errors: string[] = [];
    const warnings: string[] = [];
    const question = this.normalize(input.question);
    const capabilityId = String(this.asObject(input.plan?.capabilityPlan)?.capabilityId ?? '');

    if (this.asksOccurredScrapRecords(question) && /inventory\.(expiring|risk)|inventory_supply_risk/.test(capabilityId)) {
      errors.push('question_capability_mismatch:asked_scrap_records_but_selected_inventory_risk');
    }
    if (this.asksInventoryRisk(question) && capabilityId === 'inventory.scrap.records.list') {
      errors.push('question_capability_mismatch:asked_inventory_risk_but_selected_scrap_records');
    }
    if (this.asksCardUsage(question) && capabilityId === 'order.card-package.records.list') {
      errors.push('question_capability_mismatch:asked_card_usage_but_selected_card_package_order');
    }
    if (this.asksCardPackageOrder(question) && capabilityId === 'card.usage.records.list') {
      errors.push('question_capability_mismatch:asked_card_package_order_but_selected_card_usage');
    }
    if (this.requiresTable(input) && !this.hasTableLikeOutput(input)) {
      errors.push('missing_required_output_kind:table');
    }
    if (this.requiresKpi(input) && !this.hasMetricLikeOutput(input)) {
      errors.push('missing_required_output_kind:kpi');
    }
    if (this.requiresChart(input) && !this.hasChartLikeOutput(input)) {
      errors.push('missing_required_output_kind:chart');
    }
    if (this.requiresActionCard(input) && !this.hasActionCardLikeOutput(input)) {
      errors.push('missing_required_output_kind:action_card');
    }
    if (this.requiresEvidence(capabilityId) && !input.toolResults.some((result) => this.hasEvidencePackage(result))) {
      errors.push('missing_required_output_kind:evidence_panel');
    }
    if (this.hasNumericAnswer(input.answer) && !input.toolResults.some((result) => this.hasEvidencePackage(result))) {
      errors.push('numeric_answer_missing_evidence_source');
    }
    if (this.requiresReasoningEvidence(question) && !input.toolResults.some((result) => this.hasEvidencePackage(result))) {
      errors.push('reasoning_answer_missing_evidence_source');
    }
    if (this.requiresReasoningEvidence(question) && !input.toolResults.some((result) => this.hasEvidenceLimitations(result))) {
      errors.push('reasoning_answer_missing_limitations');
    }
    if (capabilityId === 'inventory.scrap.records.list' && /临期|风险|可能|预计/.test(input.answer)) {
      warnings.push('answer_may_mix_scrap_records_with_risk_language');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private asksOccurredScrapRecords(question: string) {
    return /报废/.test(question) && (/已|已经|本周|本月|今天|昨天|记录|流水|明细|哪些/.test(question)) && !this.asksInventoryRisk(question);
  }

  private asksInventoryRisk(question: string) {
    return /临期|报废风险|过期风险|快报废|快过期|预计|可能|预警/.test(question);
  }

  private asksCardUsage(question: string) {
    return /次卡核销|核销记录|核销流水|核销服务|核销人/.test(question);
  }

  private asksCardPackageOrder(question: string) {
    return /次卡开卡|次卡订单|次卡购买|套餐卡|开次卡/.test(question);
  }

  private requiresTable(input: AgentV2AnswerContractValidationInput) {
    const contract = this.asObject(input.plan?.outputContract);
    const requiredKinds = Array.isArray(contract?.requiredKinds) ? contract.requiredKinds : [];
    const capabilityId = String(this.asObject(input.plan?.capabilityPlan)?.capabilityId ?? '');
    return requiredKinds.includes('table') || /\.records\.list$/.test(capabilityId);
  }

  private requiresKpi(input: AgentV2AnswerContractValidationInput) {
    const contract = this.asObject(input.plan?.outputContract);
    const requiredKinds = Array.isArray(contract?.requiredKinds) ? contract.requiredKinds : [];
    const capabilityId = String(this.asObject(input.plan?.capabilityPlan)?.capabilityId ?? '');
    return requiredKinds.includes('kpi') || /\.metric$/.test(capabilityId);
  }

  private requiresChart(input: AgentV2AnswerContractValidationInput) {
    const contract = this.asObject(input.plan?.outputContract);
    const requiredKinds = Array.isArray(contract?.requiredKinds) ? contract.requiredKinds : [];
    const capabilityId = String(this.asObject(input.plan?.capabilityPlan)?.capabilityId ?? '');
    return requiredKinds.includes('chart') || /\.trend$/.test(capabilityId);
  }

  private requiresActionCard(input: AgentV2AnswerContractValidationInput) {
    const contract = this.asObject(input.plan?.outputContract);
    const requiredKinds = Array.isArray(contract?.requiredKinds) ? contract.requiredKinds : [];
    const capabilityId = String(this.asObject(input.plan?.capabilityPlan)?.capabilityId ?? '');
    return requiredKinds.includes('action_card') || /operation\.draft$|\.draft$/.test(capabilityId);
  }

  private hasTableLikeOutput(input: AgentV2AnswerContractValidationInput) {
    if ((input.renderedBlocks ?? []).some((block) => block.kind === 'table')) return true;
    return input.toolResults.some((result) => {
      const data = this.asObject(result.data);
      return Array.isArray(data?.items) || Array.isArray(data?.rows);
    });
  }

  private hasMetricLikeOutput(input: AgentV2AnswerContractValidationInput) {
    return input.toolResults.some((result) => {
      const data = this.asObject(result.data);
      return Boolean(this.asObject(data?.metrics));
    });
  }

  private hasChartLikeOutput(input: AgentV2AnswerContractValidationInput) {
    if ((input.renderedBlocks ?? []).some((block) => block.kind === 'chart')) return true;
    return input.toolResults.some((result) => {
      const data = this.asObject(result.data);
      return Boolean(this.asObject(data?.chart));
    });
  }

  private hasActionCardLikeOutput(input: AgentV2AnswerContractValidationInput) {
    if ((input.renderedBlocks ?? []).some((block) => block.kind === 'action_card' || block.kind === 'confirm_action')) return true;
    return input.toolResults.some((result) => Boolean((result.actions ?? []).length || this.asObject(this.asObject(result.data)?.actionDraft)));
  }

  private requiresEvidence(capabilityId: string) {
    return Boolean(capabilityId);
  }

  private hasEvidencePackage(result: AgentToolResult) {
    const evidence = result.evidence;
    if (!evidence) return false;
    return Boolean(
      Array.isArray(evidence.source) &&
        evidence.source.length &&
        typeof evidence.metricDefinition === 'string' &&
        evidence.metricDefinition.trim() &&
        Array.isArray(evidence.filters),
    );
  }

  private hasEvidenceLimitations(result: AgentToolResult) {
    const evidence = result.evidence;
    return Boolean(Array.isArray(evidence?.limitations) && evidence.limitations.some((item) => String(item).trim()));
  }

  private hasNumericAnswer(answer: string) {
    return /(?:¥|￥)?\d+(?:,\d{3})*(?:\.\d+)?/.test(answer);
  }

  private requiresReasoningEvidence(question: string) {
    return /为什么|原因|怎么回事|是否|有没有|是不是|如何判断|如何确认/.test(question);
  }

  private normalize(value: string) {
    return String(value ?? '').trim().toLowerCase().replace(/\s+/g, '');
  }

  private asObject(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
  }
}
