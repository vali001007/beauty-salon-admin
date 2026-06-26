import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

type MigrationAudit = {
  migration: string;
  file: string;
  requiredSnippets: string[];
};

const audits: MigrationAudit[] = [
  {
    migration: '20260626123000_agent_memory_archive',
    file: resolve(import.meta.dirname, 'migrations/20260626123000_agent_memory_archive/migration.sql'),
    requiredSnippets: [
      'CREATE TABLE "agent_memories"',
      'CREATE TABLE "agent_daily_archives"',
      'CONSTRAINT "agent_memories_pkey"',
      'CONSTRAINT "agent_daily_archives_pkey"',
      'CREATE INDEX "agent_memories_storeId_personaCode_status_idx"',
      'CREATE INDEX "agent_memories_storeId_memoryType_status_idx"',
      'CREATE UNIQUE INDEX "agent_daily_archives_storeId_archiveDate_personaCode_key"',
      'CREATE INDEX "agent_daily_archives_storeId_archiveDate_idx"',
    ],
  },
  {
    migration: '20260626160000_agent_automation_engine',
    file: resolve(import.meta.dirname, 'migrations/20260626160000_agent_automation_engine/migration.sql'),
    requiredSnippets: [
      'CREATE TABLE "agent_automation_definitions"',
      'CREATE TABLE "agent_automation_runs"',
      'CREATE TABLE "agent_automation_effects"',
      'CONSTRAINT "agent_automation_definitions_pkey"',
      'CONSTRAINT "agent_automation_runs_pkey"',
      'CONSTRAINT "agent_automation_effects_pkey"',
      'CREATE INDEX "agent_automation_definitions_storeId_status_idx"',
      'CREATE INDEX "agent_automation_definitions_storeId_personaCode_status_idx"',
      'CREATE INDEX "agent_automation_runs_storeId_status_idx"',
      'CREATE INDEX "agent_automation_effects_storeId_occurredAt_idx"',
    ],
  },
];

const results = audits.map((audit) => {
  if (!existsSync(audit.file)) {
    return {
      migration: audit.migration,
      file: audit.file,
      exists: false,
      ready: false,
      missingSnippets: audit.requiredSnippets,
    };
  }

  const sql = readFileSync(audit.file, 'utf8');
  const missingSnippets = audit.requiredSnippets.filter((snippet) => !sql.includes(snippet));
  return {
    migration: audit.migration,
    file: audit.file,
    exists: true,
    ready: missingSnippets.length === 0,
    missingSnippets,
  };
});

const ready = results.every((result) => result.ready);

console.log(JSON.stringify({ ready, results }, null, 2));

if (!ready) {
  console.error('Agent migration files are incomplete. Fix missing SQL snippets before applying migrations.');
  process.exitCode = 1;
}
