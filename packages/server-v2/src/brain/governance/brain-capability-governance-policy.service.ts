import { Injectable } from '@nestjs/common';
import type { BrainCapabilityCandidate } from '../capability/brain-capability-scan.types.js';
import type { BrainCapabilityGenerationProposal } from '../capability/brain-capability-codegen.service.js';
import {
  createGeneratedCapabilityProposalFingerprint,
  generatedBindingFingerprint,
  renderGeneratedCapabilityBindingSource,
  renderGeneratedCapabilityContractTestSource,
} from '../capability/brain-generated-capability-binding.js';
import type { BrainCapabilityInterpretedChanges } from './brain-capability-requirement-interpreter.service.js';

export type BrainCapabilityInferredChanges = BrainCapabilityInterpretedChanges;

export type BrainCapabilityGovernancePolicyResult =
  | { status: 'ready'; capability: BrainCapabilityCandidate; proposal: BrainCapabilityGenerationProposal; riskReport: Record<string, unknown> }
  | { status: 'blocked'; reasons: string[]; riskReport: Record<string, unknown> };

@Injectable()
export class BrainCapabilityGovernancePolicyService {
  apply(input: {
    capability: BrainCapabilityCandidate;
    proposal: BrainCapabilityGenerationProposal;
    requirement: string;
    inferredChanges: BrainCapabilityInferredChanges;
  }): BrainCapabilityGovernancePolicyResult {
    const changes = input.inferredChanges;
    const contractRefresh = isContractRefreshRequirement(input.requirement);
    const reasons = this.validate(input.requirement, input.capability, input.proposal, changes);
    if (reasons.length) return blocked(reasons, changes.rolloutPercentage);

    const baseRequiredPermissions = unique(input.capability.requiredPermissions).sort();
    const additionalPermissions = unique(changes.additionalPermissions).filter((item) => !baseRequiredPermissions.includes(item)).sort();
    const requiredPermissions = unique([...baseRequiredPermissions, ...additionalPermissions]).sort();
    const existingRoles = unique(input.proposal.manifest.allowedRoles).sort();
    const allowedRoles = changes.allowedRoles.length ? unique(changes.allowedRoles).sort() : existingRoles;
    const capability = clone(input.capability);
    capability.requiredPermissions = requiredPermissions;
    const proposal = this.rebuildProposal(input.proposal, requiredPermissions, allowedRoles, {
      verified: true,
      baseRequiredPermissions,
      additionalPermissions,
      allowedRoles,
    });
    return {
      status: 'ready',
      capability,
      proposal,
      riskReport: {
        overall: additionalPermissions.length || allowedRoles.length ? 'medium' : 'low',
        appliedCapabilityChanges: {
          contractRefresh,
          allowedRoles,
          additionalPermissions,
          readOnly: changes.readOnly === 'require' ? 'required' : 'unchanged',
          redaction: 'unchanged',
          confirmation: 'unchanged',
        },
        requestedRolloutForNextRelease: changes.rolloutPercentage,
      },
    };
  }

  private validate(
    requirement: string,
    capability: BrainCapabilityCandidate,
    proposal: BrainCapabilityGenerationProposal,
    changes: BrainCapabilityInferredChanges,
  ): string[] {
    const reasons: string[] = [];
    const prohibitedRequests = changes.prohibitedRequests ?? [];
    const ambiguities = changes.ambiguities ?? [];
    if (!Number.isFinite(changes.confidence) || changes.confidence < 0.85) reasons.push('requirement_interpretation_low_confidence');
    if (changes.ambiguous || ambiguities.length) reasons.push('requirement_interpretation_ambiguous');
    reasons.push(...prohibitedRequests.map((request) => `prohibited_request:${request}`));
    if (/(无需权限|取消权限|移除权限|不需要权限|允许所有人|任何角色)/.test(requirement)) reasons.push('permission_removal_forbidden');
    if (/(取消确认|无需确认|不再审批|直接执行)/.test(requirement)) reasons.push('confirmation_removal_forbidden');
    if (/(改为写入|改成写入|允许写入|自动执行|自动下单|自动核销|自动群发)/.test(requirement)) reasons.push('read_only_to_write_forbidden');
    if (/(取消脱敏|显示完整手机号|显示完整身份证|不再脱敏)/.test(requirement)) reasons.push('redaction_removal_forbidden');
    if (changes.redaction === 'require') reasons.push('runtime_redaction_policy_unavailable');
    if (changes.confirmation === 'require' && proposal.manifest.readOnly) reasons.push('runtime_confirmation_policy_unavailable');
    if (!capability.readOnly || capability.sideEffect) reasons.push('read_only_to_write_forbidden');
    const existingRoles = unique(proposal.manifest.allowedRoles);
    if (existingRoles.length && changes.allowedRoles.some((role) => !existingRoles.includes(role))) reasons.push('role_scope_expansion_forbidden');
    if (changes.rolloutPercentage !== null && (!Number.isFinite(changes.rolloutPercentage) || changes.rolloutPercentage < 1 || changes.rolloutPercentage > 100)) {
      reasons.push('rollout_percentage_invalid');
    }
    if (changes.additionalPermissions.some((permission) => !/^[a-z0-9_-]+:[a-z0-9_-]+(?::[a-z0-9_-]+)+$/i.test(permission))) {
      reasons.push('additional_permission_invalid');
    }
    if (!reasons.length && !hasSupportedChange(changes) && !isContractRefreshRequirement(requirement)) {
      reasons.push('requirement_no_supported_change');
    }
    return unique(reasons);
  }

  private rebuildProposal(
    source: BrainCapabilityGenerationProposal,
    requiredPermissions: string[],
    allowedRoles: string[],
    governanceOverlay: NonNullable<BrainCapabilityGenerationProposal['governanceOverlay']>,
  ): BrainCapabilityGenerationProposal {
    const manifest = clone(source.manifest);
    manifest.requiredPermissions = [...requiredPermissions];
    manifest.allowedRoles = [...allowedRoles];
    const executorBinding = clone(source.executorBinding);
    executorBinding.requiredPermissions = [...requiredPermissions];
    executorBinding.bindingFingerprint = generatedBindingFingerprint(executorBinding);
    const bindingSource = renderGeneratedCapabilityBindingSource(executorBinding);
    const contractTestSource = renderGeneratedCapabilityContractTestSource(executorBinding);
    const contractArtifact = clone(source.contractArtifact);
    contractArtifact.manifest = manifest;
    contractArtifact.scanEvidence.requiredPermissions = [...requiredPermissions];
    contractArtifact.scanEvidence.executorBinding = executorBinding;
    contractArtifact.proposal.executorBinding = executorBinding;
    const proposalFingerprint = createGeneratedCapabilityProposalFingerprint({ sourceFingerprint: source.sourceFingerprint, manifest, executorBinding, bindingSource, contractTestSource });
    return { ...clone(source), proposalFingerprint, manifest, executorBinding, bindingSource, contractArtifact, contractTestSource, governanceOverlay };
  }
}

function blocked(reasons: string[], rolloutPercentage: number | null): BrainCapabilityGovernancePolicyResult {
  return {
    status: 'blocked',
    reasons: unique(reasons),
    riskReport: {
      overall: 'blocked',
      appliedCapabilityChanges: {},
      requestedRolloutForNextRelease: rolloutPercentage,
      blockingReasons: unique(reasons),
    },
  };
}

function unique<T>(items: T[]): T[] { return [...new Set(items)]; }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function hasSupportedChange(changes: BrainCapabilityInferredChanges): boolean {
  return changes.allowedRoles.length > 0 || changes.additionalPermissions.length > 0 || changes.redaction === 'require'
    || changes.readOnly === 'require' || changes.confirmation === 'require' || changes.rolloutPercentage !== null;
}

function isContractRefreshRequirement(requirement: string): boolean {
  return /(重新生成|重新编译|重新构建|同步最新.{0,8}(语义|合同|契约|定义)|\bregenerat(?:e|ion)\b|\brecompil(?:e|ation)\b|\bcontract refresh\b)/i.test(
    requirement,
  );
}
