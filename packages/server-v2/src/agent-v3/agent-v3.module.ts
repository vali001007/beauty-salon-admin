import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AgentEvidenceService } from '../agent/agent-evidence.service.js';
import { AgentWorkflowRuntimeService } from '../agent/agent-workflow-runtime.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { DeviceAuthGuard } from '../terminal/guards/device-auth.guard.js';
import { AgentV3Controller } from './agent-v3.controller.js';
import { AgentV3OrchestratorService } from './agent-v3-orchestrator.service.js';
import { AgentV3TextToSqlModule } from './text-to-sql/agent-v3-text-to-sql.module.js';

@Module({
  imports: [
    PrismaModule,
    AgentV3TextToSqlModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: { expiresIn: '30d' },
      }),
    }),
  ],
  controllers: [AgentV3Controller],
  providers: [
    AgentWorkflowRuntimeService,
    AgentEvidenceService,
    AgentV3OrchestratorService,
    DeviceAuthGuard,
  ],
  exports: [
    AgentV3OrchestratorService,
  ],
})
export class AgentV3Module {}
