import { expect, test, type Page, type Route } from '@playwright/test';

type PermissionSet = string[];

const store = { id: 1, name: 'Ami 治理验收门店', status: 'active' };
const capabilityPolicy = {
  id: 11,
  resourceType: 'capability_policy',
  resourceKey: 'customer_facts',
  version: 2,
  status: 'draft',
  checksum: 'a'.repeat(64),
  snapshot: {},
  createdBy: 1,
  createdAt: '2026-08-01T00:00:00.000Z',
  policy: {
    schemaVersion: 1,
    capabilityKey: 'customer_facts',
    riskLevel: 'medium',
    mode: 'preview',
    whitelistStatus: 'pending',
    runtimeEnforcementStatus: 'pending_runtime',
    permissions: ['core:customer:view'],
    owners: { product: 'crm' },
    evidence: [{ receiptId: 'receipt-1', expiresAt: '2099-08-03T00:00:00.000Z' }],
    impact: {},
    reason: '中风险预览能力',
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
};

function fulfillJson(route: Route, data: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
}

async function installGovernanceMocks(page: Page, permissions: PermissionSet) {
  let policyPublished = false;
  const user = { id: 1, username: 'admin', name: '治理管理员', roles: ['governance_admin'], permissions, deniedPermissions: [], storeIds: [1] };
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return route.fallback();
    const path = url.pathname.replace(/^\/api/, '') || '/';
    if (path === '/auth/user-info') return fulfillJson(route, user);
    if (path === '/stores/accessible' || path === '/stores') return fulfillJson(route, [store]);
    if (path === '/brain/governance/overview') return fulfillJson(route, {
      pending: { unclassified: 2, evaluating: 1, pendingApproval: 1, revisionRequired: 0 },
      risk: { low: 2, medium: 1, high: 0, critical: 0, unclassified: 2 },
      whitelist: { not_allowed: 2, pending: 1, approved: 2, suspended: 0, expired: 0 },
      runtimePending: 1,
      latestPolicySnapshot: { id: 7, releaseKey: 'governance-v7', scope: 'governance_policy', rollout: {}, status: 'active', createdAt: '2026-08-01T00:00:00.000Z' },
      runtimeRelease: { id: 416, releaseKey: 'runtime-r416', scope: 'global', rollout: {}, status: 'active', createdAt: '2026-07-22T00:00:00.000Z' },
      runtimeConsistency: 'policy_published_runtime_pending',
      efficiency: { completed7d: 4, p50DurationMs: 2000, p95DurationMs: 5000, autoAdmissionRate: 0.5, manualOverrideRate: 0.25 },
    });
    if (path === '/brain/governance/capability-policies' && request.method() === 'GET') {
      return fulfillJson(route, { items: [capabilityPolicy], total: 1, page: 1, pageSize: 20 });
    }
    if (path === '/brain/governance/capability-policies/customer_facts' && request.method() === 'GET') {
      return fulfillJson(route, { current: capabilityPolicy, history: [capabilityPolicy], evidence: [] });
    }
    if (path === '/brain/governance/capability-policies/customer_facts/approve' && request.method() === 'POST') {
      if (!permissions.includes('*') && !permissions.includes('core:brain-governance:approve')) return fulfillJson(route, { message: 'Forbidden' }, 403);
      return fulfillJson(route, { ...capabilityPolicy, policy: { ...capabilityPolicy.policy, whitelistStatus: 'approved' } });
    }
    if (path === '/brain/governance/tasks') return fulfillJson(route, { items: [], total: 0, page: 1, pageSize: 20 });
    if (path === '/brain/governance/policy-snapshots' && request.method() === 'GET') {
      return fulfillJson(route, { items: [{ id: 7, releaseKey: 'governance-v7', scope: 'governance_policy', rollout: {}, status: policyPublished ? 'active' : 'draft', previousReleaseId: 6, createdAt: '2026-08-01T00:00:00.000Z', items: [capabilityPolicy] }], total: 1, page: 1, pageSize: 20 });
    }
    if (path === '/brain/governance/policy-snapshots/7/publish' && request.method() === 'POST') {
      if (!permissions.includes('*') && !permissions.includes('core:brain-governance:publish')) return fulfillJson(route, { message: 'Forbidden' }, 403);
      policyPublished = true;
      return fulfillJson(route, { id: 7, releaseKey: 'governance-v7', scope: 'governance_policy', rollout: {}, status: 'active', createdAt: '2026-08-01T00:00:00.000Z', items: [capabilityPolicy] });
    }
    return fulfillJson(route, { items: [], total: 0, page: 1, pageSize: 20 });
  });
  await page.addInitScript(() => window.localStorage.setItem('token', 'token-governance-e2e'));
}

test('governance overview opens a URL-restorable pending approval filter', async ({ page }) => {
  await installGovernanceMocks(page, ['*']);
  await page.goto('/brain-governance');
  await expect(page.getByRole('heading', { name: '治理总览' })).toBeVisible();
  await expect(page.getByText('策略已发布，运行待接入')).toBeVisible();
  await page.getByRole('button', { name: /待审批/ }).click();
  await expect(page).toHaveURL(/\/brain-governance\/tasks\?status=pending_approval$/);
});

test('medium-risk capability approval uses the dedicated approve permission', async ({ page }) => {
  await installGovernanceMocks(page, ['core:brain-governance:view', 'core:brain-governance:manage', 'core:brain-governance:approve']);
  await page.goto('/brain-governance/capabilities?riskLevel=medium');
  await expect(page.getByText('customer_facts')).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept('证据完整，批准预览准入'));
  await page.getByRole('button', { name: '审批准入' }).click();
  await expect(page.getByText('能力策略已审批')).toBeVisible();
});

test('publishing a governance policy snapshot does not claim runtime activation', async ({ page }) => {
  await installGovernanceMocks(page, ['core:brain-governance:view', 'core:brain-governance:manage', 'core:brain-governance:publish']);
  await page.goto('/brain-governance/policy-snapshots');
  await expect(page.getByText(/不会自动激活 Skill、Semantic 或当前 Brain Runtime Release/)).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '发布策略' }).click();
  await expect(page.getByText('治理策略已发布；运行接入状态仍需单独确认')).toBeVisible();
});

test('permission rejection hides approval/publish controls and backend mock returns 403', async ({ page }) => {
  await installGovernanceMocks(page, ['core:brain-governance:view', 'core:brain-governance:manage']);
  await page.goto('/brain-governance/capabilities');
  await expect(page.getByText('customer_facts')).toBeVisible();
  await expect(page.getByRole('button', { name: '审批准入' })).toHaveCount(0);
  const status = await page.evaluate(async () => (await fetch('/api/brain/governance/capability-policies/customer_facts/approve', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ decision: 'approve', reason: 'unauthorized' }),
  })).status);
  expect(status).toBe(403);
  await page.goto('/brain-governance/policy-snapshots');
  await expect(page.getByRole('button', { name: '发布策略' })).toHaveCount(0);
});
