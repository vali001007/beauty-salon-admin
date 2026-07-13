import { ForbiddenException } from '@nestjs/common';
import type { AgentToolDefinition } from '../../agent/agent.types.js';
import { AGENT_V2_CAPABILITY_MANIFESTS } from '../capability/agent-v2-capability-manifest.js';
import { AgentV2PolicyGatewayService } from './agent-v2-policy-gateway.service.js';

describe('AgentV2PolicyGatewayService', () => {
  const service = new AgentV2PolicyGatewayService();
  const tool: AgentToolDefinition = {
    name: 'business.metric.query',
    description: '指标查询',
    riskLevel: 'low',
    allowedRoles: ['manager', 'reception', 'beautician'],
    requiredPermissions: [],
    requiresApproval: false,
    timeoutMs: 1000,
    execute: async () => ({
      status: 'success',
      title: '指标查询',
      summary: '已完成。',
      actions: [],
    }),
  };

  it('rejects capabilities when actor lacks required permission', () => {
    const capability = AGENT_V2_CAPABILITY_MANIFESTS.find((item) => item.capabilityId === 'inventory.scrap.records.list');

    expect(() => service.assertCapabilityAccess(capability, {
      storeId: 1,
      userId: 1,
      role: 'manager',
      entrypoint: 'kiosk',
      permissions: ['core:customer:view'],
    })).toThrow(ForbiddenException);
  });

  it('evaluates finance capability through V2 permission and persona checks', () => {
    const capability = AGENT_V2_CAPABILITY_MANIFESTS.find((item) => item.capabilityId === 'finance.daily-settlement.metric');

    const denied = service.evaluateCapabilityAccess(capability, {
      storeId: 1,
      userId: 1,
      role: 'reception',
      entrypoint: 'kiosk',
      permissions: ['core:finance:view'],
    });
    const allowed = service.evaluateCapabilityAccess(capability, {
      storeId: 1,
      userId: 2,
      role: 'manager',
      entrypoint: 'kiosk',
      permissions: ['core:finance:view'],
    });

    expect(denied.allowed).toBe(false);
    expect(denied.checks).toContainEqual(expect.objectContaining({ name: 'persona', status: 'deny' }));
    expect(allowed.allowed).toBe(true);
    expect(allowed.checks).toContainEqual(expect.objectContaining({ name: 'permission', status: 'pass' }));
  });

  it('denies store-scoped capabilities without store context', () => {
    const capability = AGENT_V2_CAPABILITY_MANIFESTS.find((item) => item.capabilityId === 'finance.daily-settlement.metric');

    const result = service.evaluateCapabilityAccess(capability, {
      storeId: undefined,
      userId: 1,
      role: 'manager',
      entrypoint: 'kiosk',
      permissions: ['*'],
    } as any);

    expect(result.allowed).toBe(false);
    expect(result.checks).toContainEqual(expect.objectContaining({ name: 'store_scope', status: 'deny' }));
  });

  it('requires all declared permissions for multi-domain capabilities', () => {
    const capability = AGENT_V2_CAPABILITY_MANIFESTS.find((item) => item.capabilityId === 'agent.multi-domain.summary');

    const partial = service.evaluateCapabilityAccess(capability, {
      storeId: 1,
      userId: 1,
      role: 'manager',
      entrypoint: 'kiosk',
      permissions: ['core:finance:view', 'core:inventory:view'],
    });
    const full = service.evaluateCapabilityAccess(capability, {
      storeId: 1,
      userId: 1,
      role: 'manager',
      entrypoint: 'kiosk',
      permissions: ['core:finance:view', 'core:inventory:view', 'core:customer:view', 'core:order:view', 'core:store:view'],
    });

    expect(partial.allowed).toBe(false);
    expect(partial.denialReason).toContain('core:customer:view');
    expect(full.allowed).toBe(true);
  });

  it('allows action draft execution while leaving the final write for approval', () => {
    const capability = AGENT_V2_CAPABILITY_MANIFESTS.find((item) => item.capabilityId === 'inventory.stock.operation.draft');

    const result = service.assertToolAccess(
      capability,
      { ...tool, name: 'business.action.draft', riskLevel: 'medium' },
      { storeId: 1, userId: 1, role: 'manager', entrypoint: 'kiosk', permissions: ['core:inventory:adjustment'] },
    );

    expect(result.allowed).toBe(true);
    expect(result.requiresApproval).toBe(false);
    expect(result.checks).toContainEqual(expect.objectContaining({ name: 'release_strategy', status: 'pass' }));
  });

  it('blocks write-blocked capabilities before a tool runs', () => {
    const base = AGENT_V2_CAPABILITY_MANIFESTS.find((item) => item.capabilityId === 'finance.daily-settlement.metric');
    const blocked = base ? { ...base, releaseStrategy: 'write_blocked' as const } : null;

    expect(() => service.assertToolAccess(
      blocked,
      tool,
      { storeId: 1, userId: 1, role: 'manager', entrypoint: 'kiosk', permissions: ['*'] },
    )).toThrow(ForbiddenException);
  });

  it('blocks high-risk tools from auto-publish capabilities', () => {
    const base = AGENT_V2_CAPABILITY_MANIFESTS.find((item) => item.capabilityId === 'finance.daily-settlement.metric');
    const result = service.evaluateCapabilityAccess(
      base,
      { storeId: 1, userId: 1, role: 'manager', entrypoint: 'kiosk', permissions: ['*'] },
      { ...tool, name: 'business.high-risk.write', riskLevel: 'high' },
    );

    expect(result.allowed).toBe(false);
    expect(result.denialReason).toContain('不能自动发布执行');
    expect(result.checks).toContainEqual(expect.objectContaining({ name: 'release_strategy', status: 'deny' }));
  });

  it('allows low-risk custom metric services such as staff efficiency to auto-publish', () => {
    const capability = AGENT_V2_CAPABILITY_MANIFESTS.find((item) => item.capabilityId === 'finance.staff-efficiency.metric');

    const result = service.evaluateCapabilityAccess(
      capability,
      { storeId: 1, userId: 1, role: 'manager', entrypoint: 'kiosk', permissions: ['*'] },
      tool,
    );

    expect(result.allowed).toBe(true);
    expect(result.requiresApproval).toBe(false);
    expect(result.checks).toContainEqual(expect.objectContaining({ name: 'release_strategy', status: 'pass' }));
  });

  it('blocks coupon issue capabilities with explicit release-strategy reason', () => {
    const capability = AGENT_V2_CAPABILITY_MANIFESTS.find((item) => item.capabilityId === 'marketing.coupon.issue.blocked');

    const result = service.evaluateCapabilityAccess(
      capability,
      { storeId: 1, userId: 1, role: 'manager', entrypoint: 'agent_governance_debug', permissions: ['*'] },
      { ...tool, name: 'business.action.draft', riskLevel: 'medium' },
    );

    expect(result.allowed).toBe(false);
    expect(result.requiresApproval).toBe(false);
    expect(result.denialReason).toContain('当前不允许自动执行');
    expect(result.checks).toContainEqual(expect.objectContaining({ name: 'release_strategy', status: 'deny' }));
  });

  it('applies manifest field policy before data enters the answer context', () => {
    const capability = AGENT_V2_CAPABILITY_MANIFESTS.find((item) => item.capabilityId === 'order.product.records.list');
    const result = service.applyResultPolicy(
      {
        status: 'success',
        title: '商品订单记录',
        summary: '找到 1 条商品订单。',
        data: {
          items: [
            {
              orderId: 9,
              orderNo: 'POMQPDGTF8',
              customerName: '杨紫萱',
              customerPhone: '13700000000',
              storeName: 'Ami 全量演示门店',
              itemSummary: '玻尿酸保湿精华 x1',
              netAmountText: '¥590.00',
              discountAmountText: '¥38.00',
              payMethodLabel: '微信',
              statusLabel: '已完成',
              createdAt: '2026-07-01 12:00:00',
              remark: '内部备注',
            },
          ],
        },
        evidence: {
          source: ['ProductOrder'],
          filters: ['storeId=1'],
          metricDefinition: '商品订单。',
          sampleSize: 1,
          limitations: ['只读订单。'],
        },
        actions: [],
      },
      capability,
      { storeId: 1, userId: 1, role: 'manager', entrypoint: 'kiosk', permissions: ['*'] },
    );

    const item = (result.data as any).items[0];
    expect(item).toMatchObject({
      orderNo: 'POMQPDGTF8',
      customerName: '杨紫萱',
      remark: '已脱敏',
    });
    expect(item.orderId).toBeUndefined();
    expect(item.customerPhone).toBeUndefined();
    expect((result.data as any).fieldPolicyApplied).toMatchObject({
      mode: 'manifest_field_policy',
      maskedFields: ['remark'],
    });
    expect(result.evidence?.fieldPolicyApplied).toMatchObject({
      mode: 'manifest_field_policy',
      maskedFields: ['remark'],
    });
    expect(result.evidence?.sourceModels).toEqual(expect.arrayContaining(['ProductOrder']));
    expect(result.evidence?.storeScope).toBe('required');
    expect(result.evidence?.limitations?.join(' ')).toContain('已应用 V2 字段策略');
  });

  it('normalizes missing evidence into an authorized evidence package', () => {
    const capability = AGENT_V2_CAPABILITY_MANIFESTS.find((item) => item.capabilityId === 'finance.daily-settlement.metric');
    const result = service.applyResultPolicy(
      {
        status: 'success',
        title: '日结报表',
        summary: '今日实收 ¥100.00。',
        data: { metrics: { totalRevenueText: '¥100.00' } },
        actions: [],
      },
      capability,
      { storeId: 1, userId: 1, role: 'manager', entrypoint: 'kiosk', permissions: ['*'] },
    );

    expect(result.evidence).toMatchObject({
      source: expect.arrayContaining(['DailySettlement']),
      sourceModels: expect.arrayContaining(['DailySettlement']),
      filters: [],
      storeScope: 'required',
      sampleSize: 1,
    });
    expect(result.evidence?.limitations?.join(' ')).toContain('V2 权限网关');
  });
});
