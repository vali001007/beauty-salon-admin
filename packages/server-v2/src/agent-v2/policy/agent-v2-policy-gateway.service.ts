import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AgentActor, AgentEvidence, AgentPersonaCode, AgentToolDefinition, AgentToolResult } from '../../agent/agent.types.js';
import type { AgentV2CapabilityManifest, AgentV2FieldPolicy } from '../capability/agent-v2-capability.types.js';

export type AgentV2FieldPolicyAudit = {
  mode: 'manifest_field_policy';
  allowedFields: string[];
  maskedFields: string[];
  deniedFields: string[];
  droppedFields: string[];
};

export type AgentV2PolicyCheck = {
  name: 'status' | 'store_scope' | 'persona' | 'permission' | 'release_strategy' | 'tool_role' | 'tool_approval';
  status: 'pass' | 'deny' | 'review';
  reason: string;
};

export type AgentV2PolicyEvaluation = {
  allowed: boolean;
  requiresApproval: boolean;
  denialReason?: string;
  approvalReason?: string;
  checks: AgentV2PolicyCheck[];
};

@Injectable()
export class AgentV2PolicyGatewayService {
  assertCapabilityAccess(capability: AgentV2CapabilityManifest | null | undefined, actor: AgentActor) {
    const evaluation = this.evaluateCapabilityAccess(capability, actor);
    if (!evaluation.allowed) throw new ForbiddenException(evaluation.denialReason);
    return evaluation;
  }

  assertToolAccess(
    capability: AgentV2CapabilityManifest | null | undefined,
    tool: AgentToolDefinition,
    actor: AgentActor,
  ): AgentV2PolicyEvaluation {
    const evaluation = this.evaluateCapabilityAccess(capability, actor, tool);
    if (!evaluation.allowed) throw new ForbiddenException(evaluation.denialReason);
    return evaluation;
  }

  evaluateCapabilityAccess(
    capability: AgentV2CapabilityManifest | null | undefined,
    actor: AgentActor,
    tool?: AgentToolDefinition,
  ): AgentV2PolicyEvaluation {
    if (!capability) {
      return {
        allowed: true,
        requiresApproval: Boolean(tool?.requiresApproval),
        approvalReason: tool?.requiresApproval ? '工具定义要求人工确认。' : undefined,
        checks: [],
      };
    }

    const checks: AgentV2PolicyCheck[] = [
      this.statusCheck(capability),
      this.storeScopeCheck(capability, actor),
      this.personaCheck(capability, actor),
      this.permissionCheck(capability, actor),
      this.releaseStrategyCheck(capability, tool),
    ];
    if (tool) {
      checks.push(this.toolRoleCheck(tool, actor));
      checks.push(this.toolApprovalCheck(capability, tool));
    }

    const denied = checks.find((check) => check.status === 'deny');
    return {
      allowed: !denied,
      requiresApproval: !denied && checks.some((check) => check.name === 'tool_approval' && check.status === 'review'),
      denialReason: denied ? denied.reason : undefined,
      approvalReason: checks.find((check) => check.name === 'tool_approval' && check.status === 'review')?.reason,
      checks,
    };
  }

  applyResultPolicy(
    result: AgentToolResult,
    capability: AgentV2CapabilityManifest | null | undefined,
    actor: AgentActor,
  ): AgentToolResult {
    const policyEvaluation = this.evaluateCapabilityAccess(capability, actor);
    if (!policyEvaluation.allowed) throw new ForbiddenException(policyEvaluation.denialReason);
    if (!capability?.fieldPolicies?.length) {
      return {
        ...result,
        evidence: this.normalizeEvidence(result, capability, policyEvaluation),
      };
    }
    const audit = this.audit(capability.fieldPolicies);
    const data = this.applyDataPolicy(result.data, capability.fieldPolicies, actor, audit);
    const evidence = this.normalizeEvidence(result, capability, policyEvaluation, audit);

    return {
      ...result,
      data,
      evidence,
    };
  }

  private applyDataPolicy(
    data: unknown,
    policies: AgentV2FieldPolicy[],
    actor: AgentActor,
    audit: AgentV2FieldPolicyAudit,
  ) {
    if (!this.isRecord(data)) return data;
    const copy: Record<string, unknown> = { ...data };
    if (Array.isArray(copy.items)) copy.items = copy.items.map((item) => this.applyObjectPolicy(item, policies, actor, audit));
    if (Array.isArray(copy.rows)) copy.rows = copy.rows.map((item) => this.applyObjectPolicy(item, policies, actor, audit));
    if (this.isRecord(copy.metrics)) copy.metrics = this.applyObjectPolicy(copy.metrics, policies, actor, audit);
    copy.fieldPolicyApplied = audit;
    copy.evidencePolicyApplied = {
      mode: 'agent_v2_authorized_evidence',
      allowedFields: audit.allowedFields,
      maskedFields: audit.maskedFields,
      deniedFields: audit.deniedFields,
    };
    return copy;
  }

  private applyObjectPolicy(
    value: unknown,
    policies: AgentV2FieldPolicy[],
    actor: AgentActor,
    audit: AgentV2FieldPolicyAudit,
  ): Record<string, unknown> {
    if (!this.isRecord(value)) return {};
    const policyByField = new Map(policies.map((policy) => [policy.field, policy]));
    const filtered: Record<string, unknown> = {};
    for (const policy of policies) {
      if (policy.visibility === 'deny') continue;
      if (!(policy.field in value)) continue;
      filtered[policy.field] = policy.visibility === 'mask' && !this.canSeeMaskedField(policy.field, actor)
        ? this.maskValue(value[policy.field])
        : value[policy.field];
    }
    for (const field of Object.keys(value)) {
      if (!policyByField.has(field) && !audit.droppedFields.includes(field)) audit.droppedFields.push(field);
    }
    return filtered;
  }

  private canSeeMaskedField(field: string, actor: AgentActor) {
    if ((actor.fieldScopes?.[field] ?? '') === 'visible') return true;
    return false;
  }

  private audit(policies: AgentV2FieldPolicy[]): AgentV2FieldPolicyAudit {
    return {
      mode: 'manifest_field_policy',
      allowedFields: policies.filter((policy) => policy.visibility === 'allow').map((policy) => policy.field),
      maskedFields: policies.filter((policy) => policy.visibility === 'mask').map((policy) => policy.field),
      deniedFields: policies.filter((policy) => policy.visibility === 'deny').map((policy) => policy.field),
      droppedFields: [],
    };
  }

  private maskValue(value: unknown) {
    if (value === null || value === undefined || value === '') return '-';
    return '已脱敏';
  }

  private normalizeEvidence(
    result: AgentToolResult,
    capability: AgentV2CapabilityManifest | null | undefined,
    policyEvaluation: AgentV2PolicyEvaluation,
    fieldAudit?: AgentV2FieldPolicyAudit,
  ): AgentEvidence {
    const base = result.evidence ?? {
      source: capability?.sourceModels?.length ? capability.sourceModels : ['AgentV2CapabilityManifest'],
      sourceModels: capability?.sourceModels ?? ['AgentV2CapabilityManifest'],
      sourceApis: capability?.sourceApis ?? [],
      sourceTables: capability?.sourceModels ?? ['AgentV2CapabilityManifest'],
      storeScope: capability?.storeScope,
      metricDefinition: capability
        ? `${capability.displayName} = ${capability.description}`
        : 'Agent V2 工具未返回原始证据包，已按能力目录补充最低限度证据说明。',
      filters: [],
      sampleSize: this.sampleSizeFromData(result.data),
      limitations: ['工具未返回完整证据包，当前证据来自 V2 policy gateway 兜底。'],
    };
    const limitations = [
      ...(base.limitations ?? []),
      `已通过 V2 权限网关：${policyEvaluation.checks.map((check) => `${check.name}:${check.status}`).join('，') || '无额外检查'}`,
    ];
    if (fieldAudit) {
      limitations.push(
        `已应用 V2 字段策略：允许 ${fieldAudit.allowedFields.length} 个字段，脱敏 ${fieldAudit.maskedFields.length} 个字段，拒绝 ${fieldAudit.deniedFields.length} 个字段。`,
      );
    }
    return {
      ...base,
      source: base.source?.length ? base.source : capability?.sourceModels ?? ['AgentV2CapabilityManifest'],
      sourceModels: base.sourceModels?.length
        ? base.sourceModels
        : capability?.sourceModels?.length
          ? capability.sourceModels
          : base.sourceTables ?? base.source,
      sourceApis: base.sourceApis?.length ? base.sourceApis : capability?.sourceApis ?? [],
      sourceTables: base.sourceTables?.length ? base.sourceTables : capability?.sourceModels,
      timeRange: base.timeRange ?? base.dateRange,
      metricDefinition: base.metricDefinition || capability?.description || '未提供指标定义。',
      filters: base.filters ?? [],
      storeScope: base.storeScope ?? capability?.storeScope,
      sampleSize: base.sampleSize ?? this.sampleSizeFromData(result.data),
      limitations,
      fieldPolicyApplied: fieldAudit ?? base.fieldPolicyApplied,
      queryTraceId: base.queryTraceId ?? this.queryTraceIdFromData(result.data),
    };
  }

  private statusCheck(capability: AgentV2CapabilityManifest): AgentV2PolicyCheck {
    return capability.status === 'enabled'
      ? { name: 'status', status: 'pass', reason: `能力「${capability.displayName}」已启用。` }
      : { name: 'status', status: 'deny', reason: `能力「${capability.displayName}」未启用。` };
  }

  private storeScopeCheck(capability: AgentV2CapabilityManifest, actor: AgentActor): AgentV2PolicyCheck {
    if (capability.storeScope === 'required' && !actor.storeId) {
      return { name: 'store_scope', status: 'deny', reason: `能力「${capability.displayName}」需要明确门店范围。` };
    }
    if (capability.storeScope === 'forbidden' && actor.storeId) {
      return { name: 'store_scope', status: 'deny', reason: `能力「${capability.displayName}」不能携带门店范围执行。` };
    }
    return { name: 'store_scope', status: 'pass', reason: `门店范围符合 ${capability.storeScope} 策略。` };
  }

  private personaCheck(capability: AgentV2CapabilityManifest, actor: AgentActor): AgentV2PolicyCheck {
    const actorPersona = (actor.personaCode ?? actor.role) as AgentPersonaCode;
    const allowed = capability.personaCodes.includes(actorPersona);
    return allowed
      ? { name: 'persona', status: 'pass', reason: `当前身份 ${actorPersona} 可访问该能力。` }
      : {
          name: 'persona',
          status: 'deny',
          reason: `当前身份 ${actorPersona} 不在能力「${capability.displayName}」允许范围内。`,
        };
  }

  private permissionCheck(capability: AgentV2CapabilityManifest, actor: AgentActor): AgentV2PolicyCheck {
    const permissions = actor.permissions ?? [];
    const requiredPermissions = capability.permissionCodes ?? [];
    const missingPermissions = requiredPermissions.filter((permission) => !permissions.includes(permission));
    const allowed = !requiredPermissions.length || permissions.includes('*') || missingPermissions.length === 0;
    return allowed
      ? { name: 'permission', status: 'pass', reason: '权限码满足能力要求。' }
      : {
          name: 'permission',
          status: 'deny',
          reason: `当前账号缺少能力「${capability.displayName}」所需权限：${missingPermissions.join('、')}，无法执行该经营查询。`,
        };
  }

  private releaseStrategyCheck(capability: AgentV2CapabilityManifest, tool?: AgentToolDefinition): AgentV2PolicyCheck {
    if (capability.releaseStrategy === 'write_blocked') {
      return { name: 'release_strategy', status: 'deny', reason: `能力「${capability.displayName}」当前不允许自动执行。` };
    }
    if (capability.releaseStrategy === 'auto_publish') {
      if (capability.riskLevel === 'high' || tool?.riskLevel === 'high') {
        return {
          name: 'release_strategy',
          status: 'deny',
          reason: `能力「${capability.displayName}」或工具风险等级为 high，不能自动发布执行。`,
        };
      }
      if (this.isDirectMutationCapability(capability, tool)) {
        return {
          name: 'release_strategy',
          status: 'deny',
          reason: `能力「${capability.displayName}」疑似直接写入、删除、发券或下发，不能按 auto_publish 执行。`,
        };
      }
      if (capability.riskLevel !== 'low' && capability.executor.type !== 'business_action_draft') {
        return {
          name: 'release_strategy',
          status: 'deny',
          reason: `能力「${capability.displayName}」不是低风险只读或草稿，不能按 auto_publish 执行。`,
        };
      }
    }
    if (capability.releaseStrategy === 'approval_required' && this.isDirectMutationCapability(capability, tool)) {
      return {
        name: 'release_strategy',
        status: 'review',
        reason: `能力「${capability.displayName}」涉及写入、删除、发券或下发，必须人工确认。`,
      };
    }
    return { name: 'release_strategy', status: 'pass', reason: `发布策略 ${capability.releaseStrategy} 允许当前只读/草稿能力自动返回。` };
  }

  private toolRoleCheck(tool: AgentToolDefinition, actor: AgentActor): AgentV2PolicyCheck {
    const allowed = !tool.allowedRoles.length || tool.allowedRoles.includes(actor.role);
    return allowed
      ? { name: 'tool_role', status: 'pass', reason: `工具 ${tool.name} 允许角色 ${actor.role}。` }
      : { name: 'tool_role', status: 'deny', reason: `当前角色 ${actor.role} 不能执行工具 ${tool.name}。` };
  }

  private toolApprovalCheck(capability: AgentV2CapabilityManifest, tool: AgentToolDefinition): AgentV2PolicyCheck {
    if (tool.requiresApproval) {
      return { name: 'tool_approval', status: 'review', reason: `工具 ${tool.name} 要求人工确认。` };
    }
    if (capability.releaseStrategy === 'approval_required' && this.isDirectMutationCapability(capability, tool)) {
      return { name: 'tool_approval', status: 'review', reason: `能力「${capability.displayName}」对应动作需要人工确认。` };
    }
    return { name: 'tool_approval', status: 'pass', reason: `工具 ${tool.name} 当前不需要前置审批。` };
  }

  private isDirectMutationCapability(capability: AgentV2CapabilityManifest, tool?: AgentToolDefinition) {
    if (capability.executor.type === 'business_action_draft' || capability.executor.type === 'navigation') return false;
    if ([
      'business_record_query',
      'business_metric_query',
      'business_trend_query',
      'business_detail_query',
      'business_query',
    ].includes(capability.executor.type)) return false;
    const actionText = [
      capability.capabilityId,
      capability.displayName,
      capability.description,
      capability.executor.tool,
      tool?.name,
      ...capability.actions,
      ...(capability.eventTypes ?? []),
    ].join('|');
    return /写入|删除|发券|下发|退款|核销|扣减|create|update|delete|issue|send|follow/i.test(actionText);
  }

  private sampleSizeFromData(data: unknown) {
    if (!this.isRecord(data)) return undefined;
    if (Array.isArray(data.items)) return data.items.length;
    if (Array.isArray(data.rows)) return data.rows.length;
    if (this.isRecord(data.metrics)) return 1;
    return undefined;
  }

  private queryTraceIdFromData(data: unknown) {
    const queryTrace = this.findObjectByKeyDeep(data, 'queryTrace');
    if (!queryTrace) return undefined;
    const explicitTraceId = queryTrace.traceId ?? queryTrace.queryTraceId;
    if (typeof explicitTraceId === 'string' && explicitTraceId.trim()) return explicitTraceId;
    const queryKey = typeof queryTrace.queryKey === 'string' ? queryTrace.queryKey : '';
    const sourceModel = typeof queryTrace.sourceModel === 'string' ? queryTrace.sourceModel : '';
    const kind = typeof queryTrace.kind === 'string' ? queryTrace.kind : '';
    const parts = ['generic_query_engine', queryKey, sourceModel, kind].filter(Boolean);
    return parts.length > 1 ? parts.join(':') : undefined;
  }

  private findObjectByKeyDeep(value: unknown, key: string): Record<string, unknown> | undefined {
    if (value === null || value === undefined) return undefined;
    if (Array.isArray(value)) {
      for (const item of value) {
        const result = this.findObjectByKeyDeep(item, key);
        if (result) return result;
      }
      return undefined;
    }
    if (typeof value !== 'object') return undefined;
    const record = value as Record<string, unknown>;
    if (this.isRecord(record[key])) return record[key];
    for (const nested of Object.values(record)) {
      const result = this.findObjectByKeyDeep(nested, key);
      if (result) return result;
    }
    return undefined;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
