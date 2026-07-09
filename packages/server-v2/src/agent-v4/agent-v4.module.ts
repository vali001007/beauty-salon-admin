import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AgentEvidenceService } from '../agent/agent-evidence.service.js';
import { AgentWorkflowRuntimeService } from '../agent/agent-workflow-runtime.service.js';
import { AgentV3TextToSqlModule } from '../agent-v3/text-to-sql/agent-v3-text-to-sql.module.js';
import { MarketingModule } from '../marketing/marketing.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { DeviceAuthGuard } from '../terminal/guards/device-auth.guard.js';
import { AgentV4Controller } from './agent-v4.controller.js';
import { AgentV4OrchestratorService } from './agent-v4-orchestrator.service.js';

@Module({
  imports: [
    PrismaModule,
    AgentV3TextToSqlModule,
    MarketingModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: { expiresIn: '30d' },
      }),
    }),
  ],
  controllers: [AgentV4Controller],
  providers: [
    AgentWorkflowRuntimeService,
    AgentEvidenceService,
    AgentV4OrchestratorService,
    DeviceAuthGuard,
  ],
  exports: [
    AgentV4OrchestratorService,
  ],
})
export class AgentV4Module {}
