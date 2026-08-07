import { inspectDatabaseTarget } from './database-target-guard.js';

describe('database target guard', () => {
  it('accepts only the current local slot database', () => {
    expect(
      inspectDatabaseTarget('postgresql://ami:secret@127.0.0.1:55432/ami_dev_s07?schema=public', {
        AMI_DATABASE_MODE: 'local',
        AMI_DATABASE_GUARD: 'required',
        AMI_DEV_SLOT: 's07',
      }),
    ).toMatchObject({ mode: 'local', host: '127.0.0.1', port: '55432', database: 'ami_dev_s07' });
  });

  it('rejects the legacy local ami_core database', () => {
    expect(() =>
      inspectDatabaseTarget('postgresql://ami:secret@127.0.0.1:5432/ami_core', {
        AMI_DATABASE_MODE: 'local',
      }),
    ).toThrow('database_target_guard:legacy_ami_core_rejected');
  });

  it('rejects local mode when database belongs to another slot', () => {
    expect(() =>
      inspectDatabaseTarget('postgresql://ami:secret@127.0.0.1:55432/ami_dev_s08', {
        AMI_DATABASE_MODE: 'local',
        AMI_DEV_SLOT: 's07',
      }),
    ).toThrow('database_target_guard:slot_database_mismatch:s07:ami_dev_s08');
  });

  it('accepts only an explicitly approved Supabase host in shared mode', () => {
    expect(
      inspectDatabaseTarget('postgresql://ami:secret@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres', {
        AMI_DATABASE_MODE: 'shared',
        AMI_APPROVED_SUPABASE_HOSTS: 'aws-1-ap-southeast-1.pooler.supabase.com',
      }),
    ).toMatchObject({ mode: 'shared', database: 'postgres' });

    expect(() =>
      inspectDatabaseTarget('postgresql://ami:secret@unknown.example.com:5432/postgres', {
        AMI_DATABASE_MODE: 'shared',
        AMI_APPROVED_SUPABASE_HOSTS: 'aws-1-ap-southeast-1.pooler.supabase.com',
      }),
    ).toThrow('database_target_guard:shared_host_rejected:unknown.example.com');
  });
});
