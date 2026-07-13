import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AgentV2AutoPublishService } from './agent-v2-auto-publish.service.js';

describe('AgentV2AutoPublishService', () => {
  function createService(overrides: { publish?: jest.Mock; importDrafts?: jest.Mock; runPostPublishSmokeTest?: jest.Mock } = {}) {
    const run = {
      id: 1,
      runNo: 'agent-auto-pub-1',
      status: 'running',
      inputJson: {},
      resultJson: null,
      requestedBy: 7,
      startedAt: new Date('2026-07-05T10:00:00.000Z'),
      completedAt: null,
      createdAt: new Date('2026-07-05T10:00:00.000Z'),
    };
    const prisma = {
      agentCapabilityPublishRun: {
        create: jest.fn().mockResolvedValue(run),
        update: jest.fn().mockResolvedValue({ ...run, status: 'completed' }),
        findMany: jest.fn().mockResolvedValue([run]),
        count: jest.fn().mockResolvedValue(1),
        findUnique: jest.fn().mockResolvedValue(run),
      },
      agentCapabilityDraft: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const capabilityCenter = {
      importDrafts: overrides.importDrafts ?? jest.fn().mockResolvedValue({ created: 2, updated: 1, skipped: 3 }),
      publish: overrides.publish ?? jest.fn().mockResolvedValue({
        version: 'cap-20260705180000',
        itemCount: 35,
        publishedDraftCount: 3,
        publishedCapabilityIds: ['order.product.records.list', 'card.package.inactive-customers.list'],
        activeManifestVersion: 'cap-20260705180000',
      }),
      runPostPublishSmokeTest: overrides.runPostPublishSmokeTest ?? jest.fn().mockResolvedValue({
        capabilityId: 'order.product.records.list',
        pass: true,
        selectedCapabilityId: 'order.product.records.list',
        issues: [{ code: 'post_publish_smoke_pass', level: 'pass' }],
      }),
    };
    return {
      service: new AgentV2AutoPublishService(prisma as any, capabilityCenter as any),
      prisma,
      capabilityCenter,
    };
  }

  it('runs full auto publish by importing drafts and publishing auto candidates', async () => {
    const { service, prisma, capabilityCenter } = createService();

    const result = await service.run({
      trigger: 'deploy_hook',
      scanMode: 'full',
      path: 'docs/report.json',
      requestedBy: 7,
    });

    expect(capabilityCenter.importDrafts).toHaveBeenCalledWith(expect.objectContaining({
      path: 'docs/report.json',
      overwriteReviewed: false,
    }));
    expect(capabilityCenter.publish).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'auto',
      publishedBy: 7,
    }));
    expect(result).toMatchObject({
      status: 'completed',
      trigger: 'deploy_hook',
      output: {
        newOrUpdatedCandidates: 3,
        deprecatedCandidates: 0,
        autoPublishedCount: 3,
        blockedReasons: [],
        activeManifestVersion: 'cap-20260705180000',
        postPublishSmokePass: true,
      },
      postPublishSmoke: {
        requested: false,
        executed: false,
        pass: true,
      },
    });
    expect(prisma.agentCapabilityPublishRun.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 1 },
      data: expect.objectContaining({ status: 'completed' }),
    }));
  });

  it('can run post-publish runtime smoke and persist the result in the pipeline log', async () => {
    const runPostPublishSmokeTest = jest.fn()
      .mockResolvedValueOnce({
        capabilityId: 'order.product.records.list',
        pass: true,
        selectedCapabilityId: 'order.product.records.list',
        issues: [{ code: 'post_publish_smoke_pass', level: 'pass' }],
      });
    const { service, prisma } = createService({ runPostPublishSmokeTest });

    const result = await service.run({
      trigger: 'manual',
      scanMode: 'full',
      path: 'docs/report.json',
      requestedBy: 7,
      postPublishSmoke: true,
      postPublishSmokeLimit: 1,
      postPublishSmokeStoreId: 2,
    });

    expect(runPostPublishSmokeTest).toHaveBeenCalledWith(
      'order.product.records.list',
      expect.objectContaining({ storeId: 2, userId: 7 }),
    );
    expect(result).toMatchObject({
      status: 'completed',
      output: { postPublishSmokePass: true },
      postPublishSmoke: {
        requested: true,
        executed: true,
        pass: true,
        capabilityIds: ['order.product.records.list'],
        skippedCapabilityCount: 1,
        results: [
          expect.objectContaining({
            capabilityId: 'order.product.records.list',
            pass: true,
          }),
        ],
      },
    });
    expect(prisma.agentCapabilityPublishRun.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        resultJson: expect.objectContaining({
          postPublishSmoke: expect.objectContaining({ pass: true }),
        }),
      }),
    }));
  });

  it('logs failed pipeline without publishing partial success as completed', async () => {
    const { service, prisma } = createService({
      publish: jest.fn().mockRejectedValue(new Error('Eval Gate 未通过。')),
    });

    const result = await service.run({ trigger: 'manual', scanMode: 'hash', requestedBy: 7 });

    expect(result).toMatchObject({
      status: 'failed',
      trigger: 'manual',
      scanMode: 'hash',
      errorMessage: 'Eval Gate 未通过。',
    });
    expect((result as any).scanModeStatus).toMatchObject({ implemented: true });
    expect(prisma.agentCapabilityPublishRun.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 1 },
      data: expect.objectContaining({ status: 'failed', errorMessage: 'Eval Gate 未通过。' }),
    }));
  });

  it('skips hash auto publish when candidate fingerprints have not changed', async () => {
    const { service, prisma, capabilityCenter } = createService();
    const reportPath = 'docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-capability-drafts.json';
    const firstDraft = JSON.parse(readFileSync(workspacePath(reportPath), 'utf8')).drafts[0];
    const scannerFingerprint = fingerprint(firstDraft);
    prisma.agentCapabilityDraft.findMany.mockResolvedValue([
      { capabilityId: firstDraft.capabilityId, scannerFingerprint },
    ]);

    const result = await service.run({
      trigger: 'manual',
      scanMode: 'hash',
      path: reportPath,
      limit: 1,
      requestedBy: 7,
    });

    expect(result).toMatchObject({
      status: 'completed',
      outcome: 'skipped',
      scanModeStatus: expect.objectContaining({
        implemented: true,
        matchedCapabilityCount: 0,
      }),
    });
    expect(capabilityCenter.importDrafts).not.toHaveBeenCalled();
    expect(capabilityCenter.publish).not.toHaveBeenCalled();
    expect(prisma.agentCapabilityPublishRun.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'completed' }),
    }));
  });

  it('limits hash auto publish to changed candidate capability IDs', async () => {
    const { service, capabilityCenter } = createService();
    const reportPath = 'docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-v2-capability-drafts.json';
    const firstDraft = JSON.parse(readFileSync(workspacePath(reportPath), 'utf8')).drafts[0];

    const result = await service.run({
      trigger: 'manual',
      scanMode: 'hash',
      path: reportPath,
      limit: 1,
      requestedBy: 7,
    });

    expect(capabilityCenter.importDrafts).toHaveBeenCalledWith(expect.objectContaining({
      capabilityIds: [firstDraft.capabilityId],
    }));
    expect(capabilityCenter.publish).toHaveBeenCalledWith(expect.objectContaining({
      capabilityIds: [firstDraft.capabilityId],
      mode: 'auto',
    }));
    expect((result as any).scanPlan).toMatchObject({
      capabilityIds: [firstDraft.capabilityId],
      capabilityIdCount: 1,
    });
  });

  it('lists auto publish logs from publish run table', async () => {
    const { service, prisma } = createService();

    const result = await service.listRuns({ page: 1, pageSize: 10, trigger: 'all' });

    expect(prisma.agentCapabilityPublishRun.findMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: { startedAt: 'desc' },
      take: 10,
    }));
    expect(result.items[0]).toMatchObject({ runNo: 'agent-auto-pub-1', status: 'running' });
  });
});

function fingerprint(raw: Record<string, unknown>) {
  const text = JSON.stringify({
    capabilityId: raw.capabilityId,
    sourceApis: raw.sourceApis,
    sourceModels: raw.sourceModels,
    executor: raw.executor,
    permissionCodes: raw.permissionCodes,
  });
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  return Math.abs(hash).toString(36);
}

function workspacePath(path: string) {
  return resolve(process.cwd(), '../..', path);
}
