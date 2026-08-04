import { Controller, Get, Optional, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BrainActiveReleaseWarmupService } from '../brain/governance/brain-active-release-warmup.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly brainActiveReleaseWarmup?: BrainActiveReleaseWarmupService,
  ) {}

  @Get()
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      deployment: {
        commit: firstPresentEnv([
          'ZEABUR_GIT_COMMIT_SHA',
          'GIT_COMMIT_SHA',
          'GITHUB_SHA',
          'COMMIT_SHA',
          'SOURCE_COMMIT',
        ]),
        branch: firstPresentEnv([
          'ZEABUR_GIT_BRANCH',
          'GIT_BRANCH',
          'GITHUB_REF_NAME',
          'BRANCH_NAME',
        ]),
        buildId: firstPresentEnv([
          'ZEABUR_DEPLOYMENT_ID',
          'DEPLOYMENT_ID',
          'BUILD_ID',
          'GITHUB_RUN_ID',
        ]),
        environment: firstPresentEnv([
          'NODE_ENV',
          'APP_ENV',
          'RAILWAY_ENVIRONMENT',
          'VERCEL_ENV',
        ]),
      },
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
    return {
      status: 'ready',
      database: 'connected',
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
}

function firstPresentEnv(names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return null;
}
