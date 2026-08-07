export type AmiDatabaseMode = 'local' | 'shared';

export interface DatabaseTargetIdentity {
  mode: AmiDatabaseMode | 'unmanaged';
  protocol: 'postgres' | 'postgresql';
  host: string;
  port: string;
  database: string;
  schema: string;
}

export function inspectDatabaseTarget(
  databaseUrl: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): DatabaseTargetIdentity {
  if (!databaseUrl?.trim()) throw new Error('database_target_guard:database_url_missing');

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('database_target_guard:database_url_invalid');
  }

  const protocol = parsed.protocol.replace(':', '');
  if (protocol !== 'postgres' && protocol !== 'postgresql') {
    throw new Error('database_target_guard:protocol_not_postgresql');
  }
  const host = parsed.hostname.toLowerCase();
  const database = parsed.pathname.replace(/^\//u, '');
  if (!host || !database) throw new Error('database_target_guard:target_incomplete');
  if (database === 'ami_core') throw new Error('database_target_guard:legacy_ami_core_rejected');

  const rawMode = env.AMI_DATABASE_MODE?.trim().toLowerCase();
  if (!rawMode) {
    if (env.AMI_DATABASE_GUARD?.trim().toLowerCase() === 'required') {
      throw new Error('database_target_guard:mode_required');
    }
    return {
      mode: 'unmanaged',
      protocol,
      host,
      port: parsed.port || '5432',
      database,
      schema: parsed.searchParams.get('schema') || 'public',
    };
  }
  if (rawMode !== 'local' && rawMode !== 'shared') {
    throw new Error(`database_target_guard:mode_invalid:${rawMode}`);
  }

  if (rawMode === 'local') {
    if (host !== '127.0.0.1' && host !== 'localhost') {
      throw new Error(`database_target_guard:local_host_rejected:${host}`);
    }
    if (!/^ami_dev_s(?:0[1-9]|[1-9][0-9])$/u.test(database)) {
      throw new Error(`database_target_guard:local_database_rejected:${database}`);
    }
    const expectedSlot = env.AMI_DEV_SLOT?.trim().toLowerCase();
    if (expectedSlot && database !== `ami_dev_${expectedSlot}`) {
      throw new Error(`database_target_guard:slot_database_mismatch:${expectedSlot}:${database}`);
    }
  }

  if (rawMode === 'shared') {
    const approvedHosts = (env.AMI_APPROVED_SUPABASE_HOSTS ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    if (!approvedHosts.length) throw new Error('database_target_guard:approved_supabase_hosts_missing');
    if (!approvedHosts.includes(host)) {
      throw new Error(`database_target_guard:shared_host_rejected:${host}`);
    }
    if (!host.endsWith('.supabase.co') && !host.endsWith('.pooler.supabase.com')) {
      throw new Error(`database_target_guard:not_supabase_host:${host}`);
    }
  }

  return {
    mode: rawMode,
    protocol,
    host,
    port: parsed.port || '5432',
    database,
    schema: parsed.searchParams.get('schema') || 'public',
  };
}
