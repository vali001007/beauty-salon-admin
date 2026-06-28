import { expect, test, type Page, type Route } from '@playwright/test';

const user = {
  id: 1,
  username: 'admin',
  name: '系统管理员',
  roles: ['super_admin'],
  permissions: ['*', 'core:agent:view'],
  deniedPermissions: [],
  storeIds: [1],
};

const store = {
  id: 1,
  name: 'Ami 全量演示门店',
  city: '上海',
  address: '上海市测试路 1 号',
  phone: '021-00000000',
  status: 'active',
  shiftRequired: false,
  skuCount: 12,
  totalValue: 38000,
  healthScore: 96,
  mode: '独立',
};

function fulfillJson(route: Route, data: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(data),
  });
}

function emptyPage() {
  return { items: [], data: [], total: 0, page: 1, pageSize: 20 };
}

function personas() {
  return [
    {
      code: 'manager',
      name: '店长经营 Agent',
      role: 'manager',
      description: '门店每日经营总入口',
      toolGroups: ['business.query'],
      suggestedQuestions: ['今天经营有什么风险？'],
      enabled: true,
      version: 1,
    },
  ];
}

function agentRunFor(message: string) {
  if (message.includes('无数据')) {
    return {
      runId: 9101,
      runNo: 'MGMT-NO-DATA',
      status: 'completed',
      answer: '未来 90 天暂无临期库存。',
      toolResults: [{ status: 'no_data', title: '临期库存', summary: '未来 90 天暂无临期库存。' }],
      actions: [],
      evidence: { source: ['Inventory'], dateRange: '未来 90 天' },
    };
  }

  if (message.includes('暂不支持')) {
    return {
      runId: 9102,
      runNo: 'MGMT-UNSUPPORTED',
      status: 'completed',
      answer: '当前暂不支持查询这个指标。',
      toolResults: [{ status: 'unsupported', title: '暂不支持', summary: '当前暂不支持查询这个指标。' }],
      actions: [],
      evidence: { source: ['CapabilityRegistry'] },
    };
  }

  return {
    runId: 9103,
    runNo: 'MGMT-FAILED',
    status: 'failed',
    answer: '库存数据加载失败。',
    toolResults: [{ status: 'failed', title: '库存工具失败', summary: '库存数据加载失败。' }],
    actions: [],
    evidence: { source: ['Inventory'] },
  };
}

function terminalFactAuditRun() {
  return {
    id: 9201,
    runNo: 'KIOSK-TERMINAL-FACTS',
    storeId: 1,
    userId: 101,
    deviceId: 501,
    role: 'manager',
    entrypoint: 'terminal:kiosk',
    agentCode: 'business',
    personaCode: 'manager',
    status: 'completed',
    userInput: '看看这些客户怎么跟进',
    contextJson: {
      terminalFacts: {
        role: 'manager',
        currentPersonaCode: 'manager',
        latestMessageKind: 'agentRun',
        latestAgentRunId: 9020,
        visibleFlowCards: ['operation.cashier', 'operation.verify'],
      },
      previousRun: {
        runId: 9020,
        status: 'completed',
      },
    },
    evidenceJson: { source: ['AgentRun', 'TerminalFacts'], dateRange: '当前会话' },
    resultJson: {
      answer: '已沿用终端事实继续生成跟进建议。',
      renderedBlocks: [{ kind: 'summary_text', content: '已沿用终端事实继续生成跟进建议。' }],
    },
    createdAt: '2026-06-28T10:00:00.000Z',
    updatedAt: '2026-06-28T10:00:02.000Z',
    toolCallCount: 1,
    approvalCount: 0,
  };
}

function terminalFactAuditDetail() {
  const run = terminalFactAuditRun();
  return {
    run,
    messages: [
      { id: 1, runId: run.id, role: 'user', content: run.userInput, createdAt: run.createdAt },
      { id: 2, runId: run.id, role: 'assistant', content: '已沿用终端事实继续生成跟进建议。', createdAt: run.updatedAt },
    ],
    steps: [
      {
        id: 1,
        runId: run.id,
        stepType: 'planning',
        name: 'agent.plan',
        status: 'success',
        startedAt: run.createdAt,
        endedAt: run.updatedAt,
      },
    ],
    toolCalls: [
      {
        id: 1,
        runId: run.id,
        toolName: 'customer.followup.task.draft',
        riskLevel: 'medium',
        status: 'success',
        argsJson: { context: run.contextJson },
        resultJson: { summary: '已沿用终端事实继续生成跟进建议。' },
        createdAt: run.createdAt,
      },
    ],
    approvals: [],
  };
}

async function installMocks(page: Page) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api')) {
      await route.fallback();
      return;
    }
    const path = url.pathname.replace(/^\/api/, '') || '/';

    if (path === '/auth/csrf-token') return fulfillJson(route, { csrfToken: 'csrf-e2e' });
    if (path === '/auth/login') return fulfillJson(route, { token: 'token-e2e', user });
    if (path === '/auth/user-info') return fulfillJson(route, user);
    if (path === '/stores/accessible' || path === '/stores') return fulfillJson(route, [store]);

    if (path === '/agent/personas') return fulfillJson(route, personas());
    if (path === '/agent/schema-readiness') {
      return fulfillJson(route, { ready: true, groups: [], missingMigrations: [], missingTables: [] });
    }
    if (path === '/agent/quality-report') {
      return fulfillJson(route, {
        range: { days: 7 },
        kpis: { runCount: 12, completed: 10, failed: 2, successRate: 10 / 12, feedbackCount: 3, adopted: 2, rejected: 1, adoptionRate: 2 / 3 },
        personaBreakdown: [],
        entrypointBreakdown: [
          { name: 'terminal:kiosk', runCount: 8, completed: 7, failed: 1, successRate: 7 / 8 },
          { name: 'ami-agent:manager', runCount: 3, completed: 3, failed: 0, successRate: 1 },
          { name: 'api', runCount: 1, completed: 0, failed: 1, successRate: 0 },
        ],
        toolBreakdown: [],
        recommendations: [],
      });
    }
    if (path === '/agent/automations/triggers') return fulfillJson(route, []);
    if (path.startsWith('/agent/memories')) return fulfillJson(route, emptyPage());
    if (path.startsWith('/agent/daily-archives')) return fulfillJson(route, emptyPage());
    if (path.startsWith('/agent/automations/runs')) return fulfillJson(route, emptyPage());
    if (path.startsWith('/agent/automations')) return fulfillJson(route, emptyPage());

    if (path === '/agent/runs' && request.method() === 'POST') {
      const payload = request.postDataJSON() as { message?: string };
      return fulfillJson(route, agentRunFor(payload.message ?? ''));
    }
    const appendMatch = path.match(/^\/agent\/runs\/(\d+)\/messages$/);
    if (appendMatch) {
      const payload = request.postDataJSON() as { message?: string };
      return fulfillJson(route, { ...agentRunFor(payload.message ?? ''), runId: Number(appendMatch[1]) });
    }
    if (path === '/agent/runs' && request.method() === 'GET') {
      const run = terminalFactAuditRun();
      return fulfillJson(route, { items: [run], data: [run], total: 1, page: 1, pageSize: 20 });
    }
    if (path === '/agent/runs/9201/detail') return fulfillJson(route, terminalFactAuditDetail());
    if (path.startsWith('/agent/runs')) return fulfillJson(route, emptyPage());
    if (path === '/agent/approvals' && request.method() === 'GET') {
      return fulfillJson(route, {
        items: [
          {
            id: 701,
            runId: 9201,
            toolCallId: 1,
            status: 'pending',
            requestedBy: 101,
            beforeJson: {
              tool: 'marketing.activity.draft',
              args: { segment: '高价值客户' },
              riskLevel: 'medium',
            },
            createdAt: '2026-06-28T10:00:00.000Z',
            run: {
              id: 9201,
              runNo: 'KIOSK-APPROVAL',
              userInput: '生成高价值客户复购活动草稿',
              status: 'waiting_approval',
              role: 'manager',
              entrypoint: 'terminal:kiosk',
              agentCode: 'business',
            },
            toolCall: {
              id: 1,
              toolName: 'marketing.activity.draft',
              riskLevel: 'medium',
              status: 'waiting_approval',
              argsJson: { segment: '高价值客户' },
              resultJson: null,
            },
          },
        ],
        data: [],
        total: 1,
        page: 1,
        pageSize: 20,
      });
    }
    const approvalDecisionMatch = path.match(/^\/agent\/approvals\/(\d+)\/(approve|reject)$/);
    if (approvalDecisionMatch) {
      return fulfillJson(route, {
        runId: 9201,
        runNo: 'KIOSK-APPROVAL',
        status: approvalDecisionMatch[2] === 'approve' ? 'completed' : 'cancelled',
        answer: approvalDecisionMatch[2] === 'approve' ? '审批已通过。' : '审批已拒绝。',
        toolResults: [],
        actions: [],
      });
    }
    if (path.startsWith('/agent/approvals')) return fulfillJson(route, emptyPage());
    if (path.startsWith('/agent/feedback/failures')) return fulfillJson(route, { results: [], total: 0 });

    return fulfillJson(route, {});
  });
}

async function loginAndOpenAmiAgent(page: Page) {
  await installMocks(page);
  await page.addInitScript(() => {
    window.localStorage.setItem('token', 'token-e2e');
  });
  await page.goto('/ami-agent');
  await expect(page.getByPlaceholder('问 店长经营 Agent...')).toBeVisible({ timeout: 15_000 });
}

async function ask(page: Page, question: string) {
  const input = page.getByPlaceholder('问 店长经营 Agent...');
  await input.fill(question);
  await input.press('Enter');
}

test('管理端 /ami-agent 浏览器运行态区分 no_data、unsupported 和 failed 状态提示', async ({ page }) => {
  await loginAndOpenAmiAgent(page);

  await ask(page, '无数据临期库存');
  await expect(page.getByText('暂无数据').last()).toBeVisible();
  await expect(page.getByText('未来 90 天暂无临期库存。').last()).toBeVisible();
  await expect(page.getByText('执行失败')).toHaveCount(0);

  await ask(page, '暂不支持查询门店星座偏好');
  await expect(page.getByText('暂不支持').last()).toBeVisible();
  await expect(page.getByText('当前暂不支持查询这个指标。').last()).toBeVisible();
  await expect(page.getByText('执行失败')).toHaveCount(0);

  await ask(page, '模拟失败库存风险');
  await expect(page.getByText('执行失败').last()).toBeVisible();
  await expect(page.getByText('库存数据加载失败。').last()).toBeVisible();
});

test('管理端 /ami-agent 审计详情可查看 Kiosk terminalFacts 上下文快照', async ({ page }) => {
  await loginAndOpenAmiAgent(page);

  await page.getByRole('button', { name: /运行审计/ }).click();
  const auditRun = page.getByRole('button', { name: /KIOSK-TERMINAL-FACTS/ });
  await expect(auditRun).toBeVisible();
  await auditRun.click();

  await expect(page.getByText('上下文快照')).toBeVisible();
  const contextSnapshot = page.locator('pre').filter({ hasText: 'terminalFacts' });
  await expect(contextSnapshot).toBeVisible();
  await expect(contextSnapshot).toContainText('visibleFlowCards');
  await expect(contextSnapshot).toContainText('operation.cashier');
  await expect(contextSnapshot).toContainText('latestAgentRunId');
});

test('管理端 /ami-agent 质量大盘展示灰度入口对比', async ({ page }) => {
  await loginAndOpenAmiAgent(page);

  await page.getByRole('button', { name: /质量大盘/ }).click();

  await expect(page.getByText('灰度入口对比')).toBeVisible();
  await expect(page.getByText('终端新链路 · terminal:kiosk')).toBeVisible();
  await expect(page.getByText('管理端 Agent · ami-agent:manager')).toBeVisible();
  await expect(page.getByText('API / 旧兼容入口 · api')).toBeVisible();
  await expect(page.getByText('运行 8 · 成功率 88% · 完成 7 · 失败 1')).toBeVisible();
});

test('管理端 /ami-agent 审批 Tab 支持填写拒绝原因并展示风险影响', async ({ page }) => {
  await loginAndOpenAmiAgent(page);

  await page.getByRole('button', { name: /审批管理/ }).click();

  await expect(page.getByText('审批 #701')).toBeVisible();
  await expect(page.getByText('风险等级 medium · 影响对象 高价值客户')).toBeVisible();
  await page.getByPlaceholder('拒绝原因，可选').fill('活动预算未确认');

  const rejectRequest = page.waitForRequest((request) =>
    request.url().includes('/api/agent/approvals/701/reject') && request.method() === 'POST',
  );
  await page.getByRole('button', { name: '拒绝' }).click();
  const payload = JSON.parse((await rejectRequest).postData() ?? '{}');

  expect(payload).toMatchObject({
    comment: '活动预算未确认',
  });
});
