import { Injectable } from '@nestjs/common';
import type { AgentPlan, AgentToolResult, AuraResponseBlock } from '../agent.types.js';
import type { AmiBusinessSkillOutputContract, AmiBusinessSkillOutputKind } from '../skills/index.js';
import type {
  AgentAnswerContract,
  AgentAnswerContractValidation,
  AgentAnswerContractValidationInput,
} from './answer-contract.types.js';

@Injectable()
export class AnswerContractValidatorService {
  validate(input: AgentAnswerContractValidationInput): AgentAnswerContractValidation {
    const contract = this.resolveContract(input.plan);
    const missingKinds = contract.requiredKinds.filter((kind) => !this.hasOutputKind(kind, input));
    const warnings = this.buildWarnings(contract, input);
    const errors = missingKinds.map((kind) => `missing_required_output_kind:${kind}`);

    return {
      valid: errors.length === 0,
      contract,
      missingKinds,
      warnings,
      errors,
      checkedAt: new Date().toISOString(),
    };
  }

  private resolveContract(plan?: AgentPlan): AgentAnswerContract {
    const planContract = this.asContract(plan?.outputContract);
    if (planContract) return { ...planContract, source: 'business_task' };

    const skillContract = this.asContract(plan?.skillPlan?.outputContract);
    if (skillContract) return { ...skillContract, source: 'skill' };

    const businessTask = this.asObject(plan?.businessTask);
    const outputIntent = String(businessTask?.outputIntent ?? '');
    if (outputIntent === 'show_table') {
      return {
        source: 'business_task',
        requiredKinds: ['table', 'evidence_panel'],
        preferredKinds: ['kpi', 'table', 'evidence_panel'],
        minItems: 0,
        evidenceRequired: true,
        maxFollowUps: 3,
      };
    }
    if (outputIntent === 'show_kpi') {
      return {
        source: 'business_task',
        requiredKinds: ['kpi', 'evidence_panel'],
        preferredKinds: ['kpi', 'table', 'evidence_panel'],
        evidenceRequired: true,
        maxFollowUps: 3,
      };
    }
    if (outputIntent === 'show_chart') {
      return {
        source: 'business_task',
        requiredKinds: ['chart', 'evidence_panel'],
        preferredKinds: ['chart', 'table', 'evidence_panel'],
        evidenceRequired: true,
        maxFollowUps: 3,
      };
    }
    if (outputIntent === 'confirm_action') {
      return {
        source: 'business_task',
        requiredKinds: ['action_card', 'evidence_panel'],
        preferredKinds: ['action_card', 'evidence_panel'],
        evidenceRequired: false,
        approvalRequired: true,
        maxFollowUps: 1,
      };
    }
    if (outputIntent === 'ask_clarification') {
      return {
        source: 'business_task',
        requiredKinds: ['clarify'],
        preferredKinds: ['text', 'clarify'],
        evidenceRequired: false,
        maxFollowUps: 1,
      };
    }

    return {
      source: 'default',
      requiredKinds: ['text'],
      preferredKinds: ['text'],
      evidenceRequired: false,
      maxFollowUps: 3,
    };
  }

  private hasOutputKind(kind: AmiBusinessSkillOutputKind, input: AgentAnswerContractValidationInput) {
    const blocks = input.renderedBlocks ?? [];
    if (kind === 'text') return blocks.some((block) => block.kind === 'text') || input.answer.trim().length > 0;
    if (kind === 'kpi') return blocks.some((block) => block.kind === 'kpi_card') || this.answerHasNumber(input.answer);
    if (kind === 'table') return blocks.some((block) => block.kind === 'table') || this.toolResultsHaveItems(input.toolResults);
    if (kind === 'chart') return blocks.some((block) => block.kind === 'chart');
    if (kind === 'link_card') return blocks.some((block) => block.kind === 'link_card') || this.toolResultsHaveLink(input.toolResults);
    if (kind === 'action_card') {
      return blocks.some((block) => block.kind === 'action_card' || block.kind === 'confirm_action' || block.kind === 'activity_draft_card');
    }
    if (kind === 'clarification_card') return blocks.some((block) => block.kind === 'clarification_card');
    if (kind === 'clarify') return Boolean(input.plan?.clarificationNeeded) || input.answer.trim().length > 0;
    if (kind === 'evidence' || kind === 'evidence_panel') {
      return blocks.some((block) => block.kind === 'evidence_panel') || input.toolResults.some((result) => Boolean(result.evidence));
    }
    if (kind === 'data_gap') return blocks.some((block) => block.kind === 'data_gap') || input.toolResults.some((result) => result.status === 'no_data');
    if (kind === 'permission_notice') return blocks.some((block) => block.kind === 'permission_notice');
    return false;
  }

  private buildWarnings(contract: AgentAnswerContract, input: AgentAnswerContractValidationInput) {
    const warnings: string[] = [];
    if (contract.evidenceRequired && !this.hasOutputKind('evidence_panel', input)) warnings.push('missing_evidence_for_contract');
    if (contract.approvalRequired && !this.hasOutputKind('action_card', input)) warnings.push('missing_action_card_for_approval_contract');
    if (contract.minItems && contract.minItems > 0 && this.itemCount(input.toolResults) < contract.minItems) {
      warnings.push(`item_count_below_contract:${this.itemCount(input.toolResults)}<${contract.minItems}`);
    }
    const actionCards = input.renderedBlocks.filter((block) => block.kind === 'follow_up_chips');
    for (const block of actionCards) {
      if (block.kind === 'follow_up_chips' && block.suggestions.length > (contract.maxFollowUps ?? 3)) {
        warnings.push('follow_up_suggestions_exceed_contract');
      }
    }
    return warnings;
  }

  private asContract(value: unknown): AmiBusinessSkillOutputContract | null {
    const record = this.asObject(value);
    if (!record) return null;
    const requiredKinds = this.outputKinds(record.requiredKinds);
    if (!requiredKinds.length) return null;
    return {
      requiredKinds,
      preferredKinds: this.outputKinds(record.preferredKinds),
      minItems: this.optionalNumber(record.minItems),
      evidenceRequired: typeof record.evidenceRequired === 'boolean' ? record.evidenceRequired : undefined,
      approvalRequired: typeof record.approvalRequired === 'boolean' ? record.approvalRequired : undefined,
      maxFollowUps: this.optionalNumber(record.maxFollowUps),
    };
  }

  private outputKinds(value: unknown): AmiBusinessSkillOutputKind[] {
    if (!Array.isArray(value)) return [];
    const allowed = new Set<AmiBusinessSkillOutputKind>([
      'text',
      'kpi',
      'table',
      'chart',
      'link_card',
      'action_card',
      'clarification_card',
      'clarify',
      'evidence',
      'evidence_panel',
      'data_gap',
      'permission_notice',
    ]);
    return value
      .map((item) => String(item))
      .filter((item): item is AmiBusinessSkillOutputKind => allowed.has(item as AmiBusinessSkillOutputKind))
      .map((item) => item === 'evidence' ? 'evidence_panel' : item);
  }

  private toolResultsHaveItems(toolResults: AgentToolResult[]) {
    return this.itemCount(toolResults) > 0;
  }

  private toolResultsHaveLink(toolResults: AgentToolResult[]) {
    return toolResults.some((result) => {
      const data = this.asObject(result.data);
      const card = this.asObject(data?.card) ?? this.asObject(this.asObject(data?.raw)?.card);
      const items = Array.isArray(card?.items) ? card.items : Array.isArray(data?.items) ? data.items : [];
      return items.some((item) => {
        const record = this.asObject(item);
        return Boolean(record?.shareUrl || record?.primaryUrl || record?.['活动链接'] || record?.miniappPath || record?.['小程序路径'] || record?.qrCodeUrl || record?.['二维码']);
      });
    });
  }

  private itemCount(toolResults: AgentToolResult[]) {
    return toolResults.reduce((count, result) => {
      const data = this.asObject(result.data);
      const card = this.asObject(data?.card);
      const items = Array.isArray(data?.items) ? data.items : Array.isArray(card?.items) ? card.items : [];
      return count + items.length;
    }, 0);
  }

  private answerHasNumber(answer: string) {
    return /[\d￥¥%]/.test(answer);
  }

  private optionalNumber(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  }

  private asObject(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
  }
}
