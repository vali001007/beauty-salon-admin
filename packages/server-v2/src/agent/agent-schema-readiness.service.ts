import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

type AgentSchemaGroupCode = 'memory_archive' | 'automation_engine';

type AgentSchemaGroup = {
  code: AgentSchemaGroupCode;
  name: string;
  migration: string;
  requiredTables: string[];
};

const SCHEMA_GROUPS: AgentSchemaGroup[] = [
  {
    code: 'memory_archive',
    name: '阶段 6 记忆归档',
    migration: '20260626123000_agent_memory_archive',
    requiredTables: ['agent_memories', 'agent_daily_archives'],
  },
  {
    code: 'automation_engine',
    name: '阶段 7 自动化执行引擎',
    migration: '20260626160000_agent_automation_engine',
    requiredTables: ['agent_automation_definitions', 'agent_automation_runs', 'agent_automation_effects'],
  },
];

const REQUIRED_TABLES = SCHEMA_GROUPS.flatMap((group) => group.requiredTables);
const REQUIRED_MIGRATIONS = SCHEMA_GROUPS.map((group) => group.migration);

@Injectable()
export class AgentSchemaReadinessService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus() {
    const tableRows = await this.prisma.$queryRaw<Array<{ table_name: string }>>(Prisma.sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_type = 'BASE TABLE'
        AND table_name IN (${Prisma.join([...REQUIRED_TABLES, '_prisma_migrations'])})
    `);
    const existingTables = new Set(tableRows.map((row) => row.table_name));
    const appliedMigrations = existingTables.has('_prisma_migrations')
      ? await this.listAppliedMigrations()
      : new Set<string>();
    const groups = SCHEMA_GROUPS.map((group) => {
      const missingTables = group.requiredTables.filter((tableName) => !existingTables.has(tableName));
      const migrationApplied = appliedMigrations.has(group.migration);
      return {
        ...group,
        ready: missingTables.length === 0 && migrationApplied,
        migrationApplied,
        missingTables,
      };
    });
    const missingTables = groups.flatMap((group) => group.missingTables);
    const missingMigrations = groups
      .filter((group) => !group.migrationApplied)
      .map((group) => group.migration);
    return {
      ready: missingTables.length === 0 && missingMigrations.length === 0,
      checkedAt: new Date().toISOString(),
      groups,
      missingTables,
      missingMigrations,
    };
  }

  private async listAppliedMigrations() {
    const rows = await this.prisma.$queryRaw<Array<{ migration_name: string }>>(Prisma.sql`
      SELECT migration_name
      FROM "_prisma_migrations"
      WHERE migration_name IN (${Prisma.join(REQUIRED_MIGRATIONS)})
        AND finished_at IS NOT NULL
        AND rolled_back_at IS NULL
    `);
    return new Set(rows.map((row) => row.migration_name));
  }
}
