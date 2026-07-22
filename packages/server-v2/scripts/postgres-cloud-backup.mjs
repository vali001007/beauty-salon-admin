import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { config } from 'dotenv';

const packageRoot = resolve(import.meta.dirname, '..');
config({ path: resolve(packageRoot, '.env') });

function argValue(name) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requireConfirmation() {
  if (!process.argv.includes('--apply') || !process.argv.includes('--yes')) {
    throw new Error('Backup writes a local artifact. Re-run with --apply --yes.');
  }
}

function run(command, args, timeout = 600000) {
  const result = spawnSync(command, args, {
    cwd: packageRoot,
    encoding: 'utf8',
    shell: false,
    timeout,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      [
        `Command failed: ${command}`,
        result.error?.message,
        result.stdout?.trim(),
        result.stderr?.trim(),
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }
  return { stdout: result.stdout?.trim() ?? '', stderr: result.stderr?.trim() ?? '' };
}

function safeSegment(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase();
}

function directoryEvidence(root) {
  const files = [];
  const walk = (directory, prefix = '') => {
    for (const name of readdirSync(directory).sort((left, right) => left.localeCompare(right))) {
      const path = resolve(directory, name);
      const relativePath = prefix ? `${prefix}/${name}` : name;
      const stats = statSync(path);
      if (stats.isDirectory()) walk(path, relativePath);
      else files.push({ path, relativePath, size: stats.size });
    }
  };
  walk(root);
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(`${file.relativePath}:${file.size}\n`);
    hash.update(readFileSync(file.path));
  }
  return {
    fileCount: files.length,
    sizeBytes: files.reduce((sum, file) => sum + file.size, 0),
    sha256: hash.digest('hex').toUpperCase(),
  };
}

async function main() {
  requireConfirmation();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required.');
  const parsed = new URL(connectionString);
  if (!['postgresql:', 'postgres:'].includes(parsed.protocol)) throw new Error('DATABASE_URL must be PostgreSQL.');

  const host = parsed.hostname;
  const port = parsed.port || '5432';
  const database = parsed.pathname.replace(/^\//, '');
  const user = decodeURIComponent(parsed.username);
  const password = decodeURIComponent(parsed.password);
  const schema = argValue('schema') || parsed.searchParams.get('schema') || 'public';
  const sslMode = parsed.searchParams.get('sslmode') || (host.includes('supabase.com') ? 'require' : 'prefer');
  const image = argValue('image') || 'postgres:17-alpine';
  const format = argValue('format') || 'custom';
  const mode = argValue('mode') || 'full';
  const tables = (argValue('tables') || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const compression = Number(argValue('compress') || 3);
  const jobs = Number(argValue('jobs') || 4);
  const timeoutMs = Number(argValue('timeout-ms') || 1800000);
  if (!['custom', 'directory'].includes(format)) throw new Error('format must be custom or directory.');
  if (!['full', 'schema-only', 'data-only'].includes(mode)) {
    throw new Error('mode must be full, schema-only or data-only.');
  }
  if (mode === 'schema-only' && tables.length) throw new Error('schema-only backup does not accept tables.');
  if (!Number.isInteger(compression) || compression < 0 || compression > 9) {
    throw new Error('compress must be an integer from 0 to 9.');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 60000) {
    throw new Error('timeout-ms must be an integer of at least 60000.');
  }
  if (!Number.isInteger(jobs) || jobs < 1 || jobs > 16) throw new Error('jobs must be an integer from 1 to 16.');
  const defaultRoot = resolve(
    process.env.LOCALAPPDATA || process.env.TEMP || packageRoot,
    'Codex',
    'Backups',
    'beauty-salon-admin',
  );
  const outputDir = resolve(argValue('output-dir') || defaultRoot);
  const prefix = safeSegment(argValue('prefix') || 'ami-brain-pre-migration');
  const artifactName = `${prefix}-${timestamp()}.${format === 'directory' ? 'dir' : 'dump'}`;
  const metadataName = `${artifactName}.json`;
  const outputPath = resolve(outputDir, artifactName);
  const metadataPath = resolve(outputDir, metadataName);
  const containerName = `ami-cloud-backup-${Date.now()}`;

  mkdirSync(outputDir, { recursive: true });
  run('docker', ['version', '--format', '{{.Server.Version}}'], 30000);
  try {
    run(
      'docker',
      [
        'run',
        '--name',
        containerName,
        '--rm',
        '-e',
        `PGPASSWORD=${password}`,
        '-e',
        `PGSSLMODE=${sslMode}`,
        '-v',
        `${outputDir}:/backup`,
        image,
        'pg_dump',
        `--format=${format}`,
        `--compress=${compression}`,
        ...(format === 'directory' ? [`--jobs=${jobs}`] : []),
        '--lock-wait-timeout=30s',
        '--no-owner',
        '--no-privileges',
        ...(mode === 'schema-only' ? ['--schema-only'] : []),
        ...(mode === 'data-only' ? ['--data-only'] : []),
        `--host=${host}`,
        `--port=${port}`,
        `--username=${user}`,
        `--dbname=${database}`,
        `--schema=${schema}`,
        ...tables.map((table) => `--table=${schema}."${table.replaceAll('"', '""')}"`),
        `--file=/backup/${artifactName}`,
      ],
      timeoutMs,
    );
  } catch (error) {
    spawnSync('docker', ['rm', '-f', containerName], { encoding: 'utf8', timeout: 30000 });
    rmSync(outputPath, { recursive: true, force: true });
    throw error;
  }

  if (!existsSync(outputPath)) throw new Error('pg_dump completed without creating the backup file.');
  const restoreList = run('docker', [
    'run',
    '--rm',
    '-v',
    `${outputDir}:/backup`,
    image,
    'pg_restore',
    '--list',
    `/backup/${artifactName}`,
  ]);
  const artifactEvidence = format === 'directory'
    ? directoryEvidence(outputPath)
    : { fileCount: 1, sizeBytes: readFileSync(outputPath).length, sha256: sha256File(outputPath) };
  if (artifactEvidence.sizeBytes <= 0) throw new Error('Backup artifact is empty.');
  const listEntries = restoreList.stdout
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith(';')).length;
  if (listEntries === 0) throw new Error('pg_restore --list returned no archive entries.');

  const metadata = {
    createdAt: new Date().toISOString(),
    status: 'verified',
    databaseWritePerformed: false,
    target: { host, port, database, schema },
    image,
    format,
    mode,
    tables,
    compression,
    jobs: format === 'directory' ? jobs : 1,
    backupArtifact: outputPath,
    fileCount: artifactEvidence.fileCount,
    sizeBytes: artifactEvidence.sizeBytes,
    sha256: artifactEvidence.sha256,
    pgRestoreListEntries: listEntries,
  };
  writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ...metadata, metadataFile: metadataPath }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
