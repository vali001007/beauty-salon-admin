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
      reason: tool.requiresApproval ? '工具风险等级要求人工确认' : '低风险只读工具可直接执行',
    };
  }

  private hasRequiredPermission(userPermissions: string[], requiredPermissions: string[]) {
    if (!requiredPermissions.length) return true;
    if (userPermissions.includes('*')) return true;
    return requiredPermissions.some((permission) => userPermissions.includes(permission));
  }
}
