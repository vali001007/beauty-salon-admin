import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Brain Prisma migration', () => {
  it('creates the independent brain namespace tables', () => {
    const migration = readFileSync(
      resolve(process.cwd(), 'prisma/migrations/20260710190000_ami_brain_independent_namespace/migration.sql'),
      'utf8',
    );

    expect(migration).toContain('CREATE TYPE "BrainMessageRole"');
    expect(migration).toContain('CREATE TABLE "brain_conversation"');
    expect(migration).toContain('CREATE TABLE "brain_metric"');
    expect(migration).toContain('CREATE TABLE "brain_skill_registry"');
    expect(migration).toContain('CREATE TABLE "brain_eval_case"');
    expect(migration).toContain('CONSTRAINT "brain_message_conversationId_fkey"');
  });
});
