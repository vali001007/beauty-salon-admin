import { Controller, Get, Optional, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BrainActiveReleaseWarmupService } from '../brain/governance/brain-active-release-warmup.service.js';
import { BrainReleaseService } from '../brain/governance/brain-release.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly brainActiveReleaseWarmup?: BrainActiveReleaseWarmupService,
    @Optional() private readonly brainReleaseService?: BrainReleaseService,
  ) {}

  @Get()
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      deployment: deploymentIdentity(),
    };
  }

  @Get('ready')
  async ready() {
    await this.prisma.$queryRaw`SELECT 1`;
    const brainActiveReleaseWarmup = this.brainActiveReleaseWarmup?.getStatus() ?? null;
    const brainActiveReleaseWarmupRequired =
      this.brainActiveReleaseWarmup?.isApplicationReadinessRequired() ?? false;
    if (
      brainActiveReleaseWarmupRequired &&
      brainActiveReleaseWarmup &&
      brainActiveReleaseWarmup.state !== 'ready'
    ) {
      throw new ServiceUnavailableException(
        `brain_active_release_ontology_warmup_not_ready:${brainActiveReleaseWarmup.state}`,
      );
    }
    const deployment = deploymentIdentity();
    const brainModel = brainModelIdentity();
    const databaseTarget = databaseTargetIdentity();
    const releaseGate = releaseHealthGateConfig();
    const brainRuntimeRelease = releaseGate.enabled
      ? await this.assertReleaseHealthGate(deployment, brainModel, databaseTarget, releaseGate)
      : null;
    return {
      status: 'ready',
      database: 'connected',
      deployment,
      databaseTarget,
      brainModel,
      releaseGate: {
        enabled: releaseGate.enabled,
        stage: releaseGate.stage,
      },
      brainRuntimeRelease,
      brainActiveReleaseWarmup,
      brainActiveReleaseWarmupRequired,
      degradedComponents:
        brainActiveReleaseWarmup && brainActiveReleaseWarmup.state !== 'ready'
          ? ['brain_active_release_ontology_warmup']
          : [],
      timestamp: new Date().toISOString(),
    };
  }

  @Get('brain-ready')
  async brainReady() {
    await this.prisma.$queryRaw`SELECT 1`;
    const brainActiveReleaseWarmup = this.brainActiveReleaseWarmup?.getStatus() ?? null;
    if (!brainActiveReleaseWarmup || brainActiveReleaseWarmup.state !== 'ready') {
      throw new ServiceUnavailableException(
        `brain_active_release_ontology_warmup_not_ready:${brainActiveReleaseWarmup?.state ?? 'unavailable'}`,
      );
    }
    return {
      status: 'ready',
      database: 'connected',
      brainActiveReleaseWarmup,
      timestamp: new Date().toISOString(),
    };
  }

  private async assertReleaseHealthGate(
    deployment: ReturnType<typeof deploymentIdentity>,
    brainModel: ReturnType<typeof brainModelIdentity>,
    databaseTarget: ReturnType<typeof databaseTargetIdentity>,
    gate: ReturnType<typeof releaseHealthGateConfig>,
  ) {
    if (!deployment.commit || !/^[a-f0-9]{40}$/u.test(deployment.commit)) {
      throw new ServiceUnavailableException('brain_release_deployment_commit_missing_or_invalid');
    }
    if (!deployment.branch) throw new ServiceUnavailableException('brain_release_deployment_branch_missing');
    if (!deployment.buildId) throw new ServiceUnavailableException('brain_release_deployment_build_id_missing');
    if (!deployment.environment) throw new ServiceUnavailableException('brain_release_deployment_environment_missing');
    if (!brainModel.provider || !brainModel.model || !brainModel.timeoutMs || !brainModel.fallbackPolicy) {
      throw new ServiceUnavailableException('brain_release_model_identity_incomplete');
    }
    if (!databaseTarget) throw new ServiceUnavailableException('brain_release_database_identity_incomplete');
    if (!gate.storeId) throw new ServiceUnavailableException('brain_release_health_store_id_missing');
    if (!gate.userId) throw new ServiceUnavailableException('brain_release_health_user_id_missing');
    if (!gate.expectedProductProfile) {
      throw new ServiceUnavailableException('brain_release_expected_product_profile_missing');
    }
    if (!this.brainReleaseService) {
      throw new ServiceUnavailableException('brain_release_runtime_service_unavailable');
    }
    const runtime = await this.brainReleaseService.resolveRuntimeDeploymentIdentity({
      storeId: gate.storeId,
      userId: gate.userId,
      roleKey: gate.roleKey,
    });
    const release = runtime.release as { id?: unknown; releaseKey?: unknown } | null | undefined;
    const releaseId = Number(release?.id);
    const releaseKey = typeof release?.releaseKey === 'string' ? release.releaseKey.trim() : '';
    const profile = runtime.productProfile;
    if (!Number.isInteger(releaseId) || releaseId <= 0 || !releaseKey) {
      throw new ServiceUnavailableException('brain_release_runtime_identity_missing');
    }
    if (!runtime.releaseFingerprint || !/^[a-f0-9]{64}$/u.test(runtime.releaseFingerprint)) {
      throw new ServiceUnavailableException('brain_release_fingerprint_missing_or_invalid');
    }
    if (
      profile.productProfile !== gate.expectedProductProfile ||
      !profile.productProfileFingerprint ||
      !/^[a-f0-9]{64}$/u.test(profile.productProfileFingerprint)
    ) {
      throw new ServiceUnavailableException('brain_release_product_profile_missing_or_mismatched');
    }
    if (profile.actionsEnabled || profile.actionExecutionPolicy !== 'deny') {
      throw new ServiceUnavailableException('brain_release_action_policy_not_denied');
    }
    if (!deploymentActionExecutionExplicitlyDisabled()) {
      throw new ServiceUnavailableException('brain_release_action_kill_switch_not_disabled');
    }
    return {
      releaseId,
      releaseKey,
      runtimeIdentity: runtime.productIdentity ?? null,
      governancePolicyIdentity: runtime.governancePolicyIdentity ?? null,
      governanceTransitionStatus: runtime.governanceTransitionStatus ?? null,
      governanceTransitionStep: runtime.governanceTransitionStep ?? null,
      releaseFingerprint: runtime.releaseFingerprint,
      mode: runtime.mode ?? null,
      productProfile: profile.productProfile,
      actionsEnabled: profile.actionsEnabled,
      actionExecutionPolicy: profile.actionExecutionPolicy,
      allowedCapabilityManifest: profile.allowedCapabilityManifest,
      productProfileFingerprint: profile.productProfileFingerprint,
      healthContext: { storeId: gate.storeId, userId: gate.userId, roleKey: gate.roleKey },
    };
  }
}

function deploymentIdentity() {
  const commit = firstPresentEnv([
    'ZEABUR_GIT_COMMIT_SHA',
    'GIT_COMMIT_SHA',
    'GITHUB_SHA',
    'COMMIT_SHA',
    'SOURCE_COMMIT',
  ]);
  const platformBuildId = firstPresentEnv(['ZEABUR_DEPLOYMENT_ID', 'DEPLOYMENT_ID', 'BUILD_ID', 'GITHUB_RUN_ID']);
  return {
    commit,
    branch: firstPresentEnv(['ZEABUR_GIT_BRANCH', 'GIT_BRANCH', 'GITHUB_REF_NAME', 'BRANCH_NAME']),
    buildId: platformBuildId ?? (commit ? `commit:${commit}` : null),
    buildIdentitySource: platformBuildId ? 'platform' : commit ? 'commit_fallback' : null,
    environment: firstPresentEnv(['NODE_ENV', 'APP_ENV', 'RAILWAY_ENVIRONMENT', 'VERCEL_ENV']),
  };
}

function brainModelIdentity() {
  const defaultRoute = process.env.NODE_ENV?.trim().toLowerCase() === 'production' ? 'fallback' : 'primary';
  const routeMode = (process.env.BRAIN_LLM_PRIMARY_ROUTE?.trim().toLowerCase() || defaultRoute) === 'fallback'
    ? 'fallback_promoted'
    : 'primary';
  return {
    provider: routeMode === 'fallback_promoted'
      ? firstPresentEnv(['LLM_FALLBACK_PROVIDER'])
      : firstPresentEnv(['LLM_PROVIDER']),
    model: routeMode === 'fallback_promoted'
      ? firstPresentEnv(['LLM_FALLBACK_MODEL'])
      : firstPresentEnv(['LLM_MODEL']),
    timeoutMs: routeMode === 'fallback_promoted'
      ? positiveIntegerEnv('LLM_FALLBACK_TIMEOUT_MS') ?? positiveIntegerEnv('LLM_TIMEOUT_MS')
      : positiveIntegerEnv('LLM_TIMEOUT_MS'),
    fallbackPolicy: routeMode === 'fallback_promoted'
      ? 'disabled'
      : firstPresentEnv(['BRAIN_FALLBACK_POLICY']),
    routeMode,
  };
}

function databaseTargetIdentity() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) return null;
  try {
    const parsed = new URL(connectionString);
    const protocol = parsed.protocol.replace(':', '');
    if (!['postgres', 'postgresql'].includes(protocol) || !parsed.hostname || !parsed.pathname.replace(/^\//u, '')) {
      return null;
    }
    return {
      protocol,
      host: parsed.hostname,
      port: parsed.port || '5432',
      database: parsed.pathname.replace(/^\//u, ''),
      schema: parsed.searchParams.get('schema') || 'public',
    };
  } catch {
    return null;
  }
}

function releaseHealthGateConfig() {
  const stage = process.env.BRAIN_RELEASE_STAGE?.trim().toLowerCase() || 'development';
  return {
    enabled: stage === 'release',
    stage,
    storeId: positiveIntegerEnv('BRAIN_RELEASE_HEALTH_STORE_ID'),
    userId:
      positiveIntegerEnv('BRAIN_RELEASE_HEALTH_USER_ID') ??
      positiveIntegerEnv('BRAIN_GOVERNANCE_SYSTEM_USER_ID'),
    roleKey: process.env.BRAIN_RELEASE_HEALTH_ROLE_KEY?.trim() || 'store_manager',
    expectedProductProfile: process.env.BRAIN_EXPECTED_PRODUCT_PROFILE?.trim() || null,
  };
}

function positiveIntegerEnv(name: string) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function deploymentActionExecutionExplicitlyDisabled() {
  const value = process.env.BRAIN_ACTION_EXECUTION_ENABLED?.trim().toLowerCase();
  return value === 'false' || value === '0' || value === 'off' || value === 'no';
}

function firstPresentEnv(names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return null;
}
