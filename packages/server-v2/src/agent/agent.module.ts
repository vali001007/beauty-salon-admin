import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AiModule } from '../ai/ai.module.js';
import { BusinessQueryModule } from '../business-query/business-query.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { MarketingModule } from '../marketing/marketing.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SchedulingModule } from '../scheduling/scheduling.module.js';
import { DeviceAuthGuard } from '../terminal/guards/device-auth.guard.js';
import { TerminalModule } from '../terminal/terminal.module.js';
import { AgentController } from './agent.controller.js';
import { AnswerContractValidatorService } from './answer-contract/index.js';
import { AgentCapabilityCandidateService } from './agent-capability-candidate.service.js';
import { AgentAutomationService } from './agent-automation.service.js';
import { AgentEvidenceService } from './agent-evidence.service.js';
import { AgentEvalService } from './agent-eval.service.js';
import { AgentFieldScopeSanitizerService } from './agent-field-scope-sanitizer.service.js';
import { AgentMemoryService } from './agent-memory.service.js';
import { AgentObservabilityService } from './agent-observability.service.js';
import { AgentOrchestratorService } from './agent-orchestrator.service.js';
import { AgentPersonaService } from './agent-persona.service.js';
import { AgentPlannerService } from './agent-planner.service.js';
import { AgentPolicyService } from './agent-policy.service.js';
import { AgentResponseSafetyService } from './agent-response-safety.service.js';
import { AgentRouterService } from './agent-router.service.js';
import { AgentSchemaReadinessService } from './agent-schema-readiness.service.js';
import { AgentToolRegistryService } from './agent-tool-registry.service.js';
import { AgentWorkflowRuntimeService } from './agent-workflow-runtime.service.js';
import { BusinessTaskCompilerService } from './business-task/business-task-compiler.service.js';
import { BusinessTaskLlmCompilerService } from './business-task/business-task-llm-compiler.service.js';
import { BusinessTaskPreParserService } from './business-task/business-task-preparser.service.js';
import { CapabilityRegistryService } from './capabilities/capability-registry.service.js';
import { AgentSkillsRegistryService } from './skills/index.js';
import { SemanticMetricRegistryService } from '../semantic-data/semantic-metric-registry.service.js';
import { SemanticDataModule } from '../semantic-data/semantic-data.module.js';
import { SemanticQueryModule } from '../semantic-query/semantic-query.module.js';
import { SemanticSqlDecisionService } from '../semantic-sql/semantic-sql-decision.service.js';
import { SemanticSqlExecutorService } from '../semantic-sql/semantic-sql-executor.service.js';

@Module({
  imports: [
    PrismaModule,
    SemanticDataModule,
    SemanticQueryModule,
    AiModule,
    BusinessQueryModule,
    MarketingModule,
    InventoryModule,
    TerminalModule,
    SchedulingModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: { expiresIn: '30d' },
      }),
    }),
  ],
  controllers: [AgentController],
  providers: [
    AgentOrchestratorService,
    AgentCapabilityCandidateService,
    AgentAutomationService,
    AgentPersonaService,
    AgentWorkflowRuntimeService,
    AgentPlannerService,
    AgentPolicyService,
    AgentToolRegistryService,
    AgentEvidenceService,
    AgentEvalService,
    AgentMemoryService,
    AgentObservabilityService,
    AgentFieldScopeSanitizerService,
    AgentResponseSafetyService,
    AgentRouterService,
    AgentSchemaReadinessService,
    AnswerContractValidatorService,
    BusinessTaskCompilerService,
    BusinessTaskLlmCompilerService,
    BusinessTaskPreParserService,
    CapabilityRegistryService,
    AgentSkillsRegistryService,
    SemanticMetricRegistryService,
    SemanticSqlDecisionService,
    SemanticSqlExecutorService,
    DeviceAuthGuard,
  ],
  exports: [
    AgentOrchestratorService,
    AgentToolRegistryService,
    AgentEvalService,
    AgentMemoryService,
    AgentObservabilityService,
    AgentAutomationService,
    AgentSchemaReadinessService,
  ],
})
export class AgentModule {}
