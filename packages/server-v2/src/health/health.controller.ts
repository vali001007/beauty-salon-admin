import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service.js';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

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
    return {
      status: 'ready',
      database: 'connected',
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
