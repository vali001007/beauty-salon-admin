import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AgentEvidenceService } from '../agent/agent-evidence.service.js';
import { AgentWorkflowRuntimeService } from '../agent/agent-workflow-runtime.service.js';
import { AiModule } from '../ai/ai.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { DeviceAuthGuard } from '../terminal/guards/device-auth.guard.js';
import { AgentV2Controller } from './agent-v2.controller.js';
import { AgentV2OrchestratorService } from './agent-v2-orchestrator.service.js';
import { AgentV2RuntimeService } from './agent-v2-runtime.service.js';
import { AgentV2GrayStrategyService } from './agent-v2-gray-strategy.service.js';
import { AgentV2ToolRegistryService } from './agent-v2-tool-registry.service.js';
import { AgentV2CapabilityDecisionService } from './capability/agent-v2-capability-decision.service.js';
import { AgentV2CapabilityMappingService } from './capability/agent-v2-capability-mapping.service.js';
import { AgentV2AutoPublishService } from './capability-center/agent-v2-auto-publish.service.js';
import { AgentV2CapabilityCenterController } from './capability-center/agent-v2-capability-center.controller.js';
import { AgentV2CapabilityCenterService } from './capability-center/agent-v2-capability-center.service.js';
import { AgentV2DeployHookGuard } from './capability-center/agent-v2-deploy-hook.guard.js';
import { AgentV2ManifestProviderService } from './capability-center/agent-v2-manifest-provider.service.js';
import { AgentV2AnswerContractValidatorService } from './contracts/agent-v2-answer-contract-validator.service.js';
import { AgentV2EvidenceService } from './evidence/agent-v2-evidence.service.js';
import { AgentV2GovernanceController } from './governance/agent-v2-governance.controller.js';
import { AgentV2GovernanceService } from './governance/agent-v2-governance.service.js';
import { AgentV2IntentExtractionService } from './intent/agent-v2-intent-extraction.service.js';
import { KnowledgeGraphIntentContextService } from './intent/knowledge-graph-intent-context.service.js';
import { GenericQueryEngineService } from './query-engine/generic-query-engine.service.js';
import { AgentV2BusinessActionDraftService } from './tools/agent-v2-business-action-draft.service.js';
import { AgentV2BusinessDetailQueryService } from './tools/agent-v2-business-detail-query.service.js';
import { AgentV2BusinessMetricQueryService } from './tools/agent-v2-business-metric-query.service.js';
import { AgentV2BusinessRecordQueryService } from './tools/agent-v2-business-record-query.service.js';
import { AgentV2BusinessTrendQueryService } from './tools/agent-v2-business-trend-query.service.js';
import { AgentV2NavigationService } from './tools/agent-v2-navigation.service.js';
import { AgentV2PolicyGatewayService } from './policy/agent-v2-policy-gateway.service.js';
import { AgentV2TextToSqlModule } from './text-to-sql/agent-v2-text-to-sql.module.js';

@Module({
  imports: [
    PrismaModule,
    AiModule,
    AgentV2TextToSqlModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: { expiresIn: '30d' },
      }),
    }),
  ],
  controllers: [AgentV2Controller, AgentV2CapabilityCenterController, AgentV2GovernanceController],
  providers: [
    AgentWorkflowRuntimeService,
    AgentEvidenceService,
    AgentV2OrchestratorService,
    AgentV2RuntimeService,
    AgentV2GrayStrategyService,
    AgentV2ToolRegistryService,
    AgentV2ManifestProviderService,
    AgentV2CapabilityCenterService,
    AgentV2AutoPublishService,
    AgentV2DeployHookGuard,
    AgentV2CapabilityDecisionService,
    AgentV2CapabilityMappingService,
    AgentV2EvidenceService,
    KnowledgeGraphIntentContextService,
    AgentV2IntentExtractionService,
    AgentV2GovernanceService,
    GenericQueryEngineService,
    AgentV2AnswerContractValidatorService,
    AgentV2PolicyGatewayService,
    AgentV2BusinessMetricQueryService,
    AgentV2BusinessRecordQueryService,
    AgentV2BusinessTrendQueryService,
    AgentV2BusinessDetailQueryService,
    AgentV2BusinessActionDraftService,
    AgentV2NavigationService,
    DeviceAuthGuard,
  ],
  exports: [
    AgentV2OrchestratorService,
    AgentV2RuntimeService,
    AgentV2GrayStrategyService,
    AgentV2ToolRegistryService,
    AgentV2ManifestProviderService,
    AgentV2CapabilityCenterService,
    AgentV2AutoPublishService,
    AgentV2CapabilityDecisionService,
    AgentV2CapabilityMappingService,
    AgentV2EvidenceService,
    KnowledgeGraphIntentContextService,
    AgentV2IntentExtractionService,
    AgentV2GovernanceService,
    GenericQueryEngineService,
    AgentV2AnswerContractValidatorService,
    AgentV2PolicyGatewayService,
    AgentV2BusinessMetricQueryService,
    AgentV2BusinessRecordQueryService,
    AgentV2BusinessTrendQueryService,
    AgentV2BusinessDetailQueryService,
    AgentV2BusinessActionDraftService,
    AgentV2NavigationService,
  ],
})
export class AgentV2Module {}
