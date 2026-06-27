import { ForbiddenException } from '@nestjs/common';
import { AgentPolicyService } from './agent-policy.service.js';
import type { AgentActor, AgentToolDefinition } from './agent.types.js';

describe('AgentPolicyService', () => {
  const service = new AgentPolicyService();
  const tool: AgentToolDefinition = {
    name: 'finance.margin.diagnose',
    description: '诊断财务毛利',
    riskLevel: 'low',
    allowedRoles: ['manager'],
    requiredPermissions: ['core:order:view'],
    requiresApproval: false,
    maxRows: 50,
    timeoutMs: 5000,
    execute: jest.fn(),
  };
  const actor: AgentActor = {
    storeId: 1,
    userId: 7,
    deviceId: 0,
    role: 'manager',
    entrypoint: 'test',
    permissions: ['core:order:view'],
  };

  it('allows a role with required permission', () => {
    expect(service.validateToolAccess(tool, actor)).toMatchObject({
      allowed: true,
      requiresApproval: false,
      riskLevel: 'low',
      reason: '低风险只读工具可直接执行。',
    });
  });

  it('explains why medium and high risk tools require approval', () => {
    expect(service.validateToolAccess({ ...tool, riskLevel: 'medium' }, actor)).toMatchObject({
      requiresApproval: true,
      reason: expect.stringContaining('中风险能力'),
    });
    expect(service.validateToolAccess({ ...tool, riskLevel: 'high' }, actor)).toMatchObject({
      requiresApproval: true,
      reason: expect.stringContaining('高风险能力'),
    });
    expect(service.validateToolAccess({ ...tool, requiresApproval: true }, actor)).toMatchObject({
      requiresApproval: true,
      reason: expect.stringContaining('声明需要人工审批'),
    });
  });

  it('allows super permission wildcard', () => {
    expect(service.validateToolAccess(tool, { ...actor, permissions: ['*'] })).toMatchObject({
      allowed: true,
    });
  });

  it('rejects a role without required permission', () => {
    expect(() => service.validateToolAccess(tool, { ...actor, permissions: ['core:customer:view'] })).toThrow(ForbiddenException);
    expect(() => service.validateToolAccess(tool, { ...actor, permissions: ['core:customer:view'] })).toThrow(
      '当前账号缺少工具「finance.margin.diagnose」所需权限',
    );
  });

  it('rejects actor without store context', () => {
    expect(() => service.validateToolAccess(tool, { ...actor, storeId: 0 })).toThrow('缺少门店上下文');
  });
});
