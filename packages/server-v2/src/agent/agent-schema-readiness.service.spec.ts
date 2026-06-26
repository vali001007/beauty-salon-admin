import { AgentSchemaReadinessService } from './agent-schema-readiness.service.js';

describe('AgentSchemaReadinessService', () => {
  let prisma: any;
  let service: AgentSchemaReadinessService;

  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn(),
    };
    service = new AgentSchemaReadinessService(prisma);
  });

  it('marks stage 6 and stage 7 schemas ready when all required tables exist', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([
      { table_name: 'agent_memories' },
      { table_name: 'agent_daily_archives' },
      { table_name: 'agent_automation_definitions' },
      { table_name: 'agent_automation_runs' },
      { table_name: 'agent_automation_effects' },
      { table_name: '_prisma_migrations' },
    ]);
    prisma.$queryRaw.mockResolvedValueOnce([
      { migration_name: '20260626123000_agent_memory_archive' },
      { migration_name: '20260626160000_agent_automation_engine' },
    ]);

    const result = await service.getStatus();

    expect(result.ready).toBe(true);
    expect(result.missingTables).toEqual([]);
    expect(result.missingMigrations).toEqual([]);
    expect(result.groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'memory_archive', ready: true, migrationApplied: true, missingTables: [] }),
        expect.objectContaining({ code: 'automation_engine', ready: true, migrationApplied: true, missingTables: [] }),
      ]),
    );
  });

  it('reports missing stage 6 and stage 7 tables before migrations are applied', async () => {
    prisma.$queryRaw.mockResolvedValue([{ table_name: 'agent_memories' }]);

    const result = await service.getStatus();

    expect(result.ready).toBe(false);
    expect(result.missingTables).toEqual([
      'agent_daily_archives',
      'agent_automation_definitions',
      'agent_automation_runs',
      'agent_automation_effects',
    ]);
    expect(result.missingMigrations).toEqual([
      '20260626123000_agent_memory_archive',
      '20260626160000_agent_automation_engine',
    ]);
    expect(result.groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'memory_archive',
          ready: false,
          migrationApplied: false,
          missingTables: ['agent_daily_archives'],
        }),
        expect.objectContaining({
          code: 'automation_engine',
          ready: false,
          migrationApplied: false,
          missingTables: ['agent_automation_definitions', 'agent_automation_runs', 'agent_automation_effects'],
        }),
      ]),
    );
  });

  it('does not mark schemas ready when tables exist but migration records are missing', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([
      { table_name: 'agent_memories' },
      { table_name: 'agent_daily_archives' },
      { table_name: 'agent_automation_definitions' },
      { table_name: 'agent_automation_runs' },
      { table_name: 'agent_automation_effects' },
      { table_name: '_prisma_migrations' },
    ]);
    prisma.$queryRaw.mockResolvedValueOnce([{ migration_name: '20260626123000_agent_memory_archive' }]);

    const result = await service.getStatus();

    expect(result.ready).toBe(false);
    expect(result.missingTables).toEqual([]);
    expect(result.missingMigrations).toEqual(['20260626160000_agent_automation_engine']);
    expect(result.groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'memory_archive', ready: true, migrationApplied: true }),
        expect.objectContaining({ code: 'automation_engine', ready: false, migrationApplied: false }),
      ]),
    );
  });
});
