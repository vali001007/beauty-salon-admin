import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AgentActor, AgentToolDefinition } from './agent.types.js';

@Injectable()
export class AgentPolicyService {
  validateToolAccess(tool: AgentToolDefinition, actor: AgentActor) {
    if (!tool.allowedRoles.includes(actor.role)) {
      throw new ForbiddenException(`当前角色暂不能调用工具 ${tool.name}`);
    }
    if (!actor.storeId || Number.isNaN(Number(actor.storeId))) {
      throw new ForbiddenException('缺少门店上下文，无法执行 Agent 工具');
    }
    if (!this.hasRequiredPermission(actor.permissions ?? [], tool.requiredPermissions ?? [])) {
      throw new ForbiddenException(`当前账号缺少工具「${tool.name}」所需权限，无法执行该经营查询。`);
    }
    return {
      allowed: true,
      requiresApproval: tool.requiresApproval || tool.riskLevel === 'medium' || tool.riskLevel === 'high',
      riskLevel: tool.riskLevel,
      reason: this.approvalReason(tool),
    };
  }

  private approvalReason(tool: AgentToolDefinition) {
    if (tool.requiresApproval) return `工具「${tool.name}」声明需要人工审批，执行前必须确认影响范围。`;
    if (tool.riskLevel === 'high') return `工具「${tool.name}」为高风险能力，可能影响真实客户、订单、财务或库存数据，必须人工审批。`;
    if (tool.riskLevel === 'medium') return `工具「${tool.name}」为中风险能力，可能生成草稿、任务或业务动作，执行前需要人工确认。`;
    return '低风险只读工具可直接执行。';
  }

  private hasRequiredPermission(userPermissions: string[], requiredPermissions: string[]) {
    if (!requiredPermissions.length) return true;
    if (userPermissions.includes('*')) return true;
    return requiredPermissions.some((permission) => userPermissions.includes(permission));
  }
}
