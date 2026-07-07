import { PrismaService } from '../../prisma/prisma.service.js';
import { AgentV3SemanticRouterAdminService } from './agent-v3-semantic-router-admin.service.js';
import { AgentV3SemanticRouterService } from './agent-v3-semantic-router.service.js';
import { AgentV3SemanticViewRegistryService } from './agent-v3-semantic-view-registry.service.js';

describe('AgentV3SemanticRouterAdminService', () => {
  it('generates independent V3 KG snapshots into V3 tables', async () => {
    const createdAt = new Date('2026-07-07T00:00:00.000Z');
    const prisma = {
      agentV3SemanticKgSnapshot: {
        create: jest.fn(async ({ data }) => ({
          id: 1,
          version: data.version,
          source: data.source,
          status: data.status,
          statsJson: data.statsJson,
          generatedFromVersion: data.generatedFromVersion ?? null,
          activatedAt: null,
          createdAt,
          updatedAt: createdAt,
        })),
      },
    } as unknown as PrismaService;
    const registry = new AgentV3SemanticViewRegistryService();
    const service = new AgentV3SemanticRouterAdminService(prisma, new AgentV3SemanticRouterService(registry));

    const result = await service.generateSnapshot({ createdBy: 7, generatedFromVersion: 'manual-test' });

    expect(result.source).toBe('v3_kg_local_fixture');
    expect(result.generatedFromVersion).toBe('manual-test');
    expect(prisma.agentV3SemanticKgSnapshot.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        source: 'v3_kg_local_fixture',
        status: 'draft',
        createdBy: 7,
      }),
    }));
  });

  it('routes project popularity questions to the project semantic view in inspect mode', async () => {
    const prisma = {
      agentV3SemanticKgSnapshot: {
        findFirst: jest.fn(async () => null),
      },
    } as unknown as PrismaService;
    const registry = new AgentV3SemanticViewRegistryService();
    const service = new AgentV3SemanticRouterAdminService(prisma, new AgentV3SemanticRouterService(registry));

    const result = await service.inspect({
      question: '最近一个月最受欢迎的项目有哪几个',
      permissions: ['*'],
      roleCodes: ['manager'],
    });

    expect(result.route.entity.type).toBe('project');
    expect(result.route.selectedView).toBe('agent_v3_project_service_sales_view');
    expect(result.activeSnapshot).toBeNull();
  });
});
