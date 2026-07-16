import { resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { loadWorkspaceEnvironment } from '../src/brain/capability/brain-capability-cli.helpers.js';
import { BrainCapabilityCatalogService } from '../src/brain/capability/brain-capability-catalog.service.js';
import { BrainCapabilityDefinitionSnapshotSourceService } from '../src/brain/capability/brain-capability-definition-snapshot-source.service.js';
import { BrainCapabilitySemanticVerifierService } from '../src/brain/capability/brain-capability-semantic-verifier.service.js';
import { loadRegisteredBrainPermissionCodes } from '../src/brain/capability/brain-registered-permission-codes.provider.js';
import { BrainRuntimeConfigService } from '../src/brain/config/brain-runtime-config.service.js';
import { BrainReleaseService } from '../src/brain/governance/brain-release.service.js';
import { BrainSkillRegistryService } from '../src/brain/skills/brain-skill-registry.service.js';
import { BusinessDefinitionProjectionCompilerService } from '../src/semantic-data/business-definition-projection-compiler.service.js';
import { BusinessDefinitionRegistryService } from '../src/semantic-data/business-definition-registry.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

async function main() {
  loadWorkspaceEnvironment(resolve(process.cwd(), '..', '..'));
  const releaseId = Number(process.argv.find((item) => item.startsWith('--release-id='))?.split('=')[1]);
  if (!Number.isInteger(releaseId) || releaseId < 1) throw new Error('capability_catalog_release_id_required');
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const definitionSource = new BrainCapabilityDefinitionSnapshotSourceService(
      new BusinessDefinitionRegistryService(prisma, new BusinessDefinitionProjectionCompilerService()),
    );
    const catalog = new BrainCapabilityCatalogService(
      new BrainSkillRegistryService(prisma),
      new BrainRuntimeConfigService(new ConfigService(process.env)),
      await loadRegisteredBrainPermissionCodes(prisma),
      new BrainCapabilitySemanticVerifierService(definitionSource),
    );
    const snapshot = await new BrainReleaseService(prisma).freezeEvaluationRelease(releaseId);
    const report = await catalog.validateEnabledCapabilities(snapshot.capabilityCandidates);
    process.stdout.write(`${JSON.stringify({
      releaseId,
      releaseFingerprint: snapshot.releaseFingerprint,
      capabilityCount: snapshot.capabilityCandidates.length,
      valid: report.valid,
      cardCount: report.cards.length,
      issues: report.issues,
    }, null, 2)}\n`);
    if (!report.valid) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
