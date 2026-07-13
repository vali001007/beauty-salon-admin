import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ReservationsModule } from '../reservations/reservations.module.js';
import { TerminalModule } from '../terminal/terminal.module.js';
import { BrainController } from './brain.controller.js';
import { BrainChatService } from './brain-chat.service.js';
import { BrainCognitionService } from './cognition/brain-cognition.service.js';
import { BrainQuestionIntentService } from './cognition/brain-question-intent.service.js';
import { BrainTimeRangeParserService } from './cognition/brain-time-range-parser.service.js';
import { EntityLinkerService } from './cognition/entity-linker.service.js';
import { IntentClassifierService } from './cognition/intent-classifier.service.js';
import { TermNormalizerService } from './cognition/term-normalizer.service.js';
import { BrainContextService } from './context/brain-context.service.js';
import { BrainConversationContextService } from './context/brain-conversation-context.service.js';
import { BrainCustomerFactResolverService } from './domain/brain-customer-fact-resolver.service.js';
import { BrainActionTargetResolverService } from './domain/brain-action-target-resolver.service.js';
import {
  BRAIN_DOMAIN_ADAPTERS,
  BrainDomainAdapterRegistryService,
} from './domain/brain-domain-adapter-registry.service.js';
import { BrainRoleIntentRouterService } from './domain/brain-role-intent-router.service.js';
import { BrainBeauticianDomainAdapter } from './domain/adapters/brain-beautician-domain.adapter.js';
import { BrainFinanceDomainAdapter } from './domain/adapters/brain-finance-domain.adapter.js';
import { BrainFrontDeskDomainAdapter } from './domain/adapters/brain-front-desk-domain.adapter.js';
import { BrainInventoryDomainAdapter } from './domain/adapters/brain-inventory-domain.adapter.js';
import { BrainMarketingDomainAdapter } from './domain/adapters/brain-marketing-domain.adapter.js';
import { BrainStoreManagerDomainAdapter } from './domain/adapters/brain-store-manager-domain.adapter.js';
import { BrainCustomerServiceDomainAdapter } from './domain/adapters/brain-customer-service-domain.adapter.js';
import { BrainAnswerGraderService } from './eval/brain-answer-grader.service.js';
import { BrainEvalService } from './governance/brain-eval.service.js';
import { BrainFeedbackService } from './governance/brain-feedback.service.js';
import { BrainReleaseService } from './governance/brain-release.service.js';
import { BrainTraceService } from './governance/brain-trace.service.js';
import { BrainGovernanceResourceService } from './governance/brain-governance-resource.service.js';
import { BrainMemoryConsolidationService } from './memory/brain-memory-consolidation.service.js';
import { BrainMemoryRepository } from './memory/brain-memory.repository.js';
import { BrainMemoryService } from './memory/brain-memory.service.js';
import { BrainInspectionService } from './inspection/brain-inspection.service.js';
import { BrainAgentProfileService } from './orchestrator/brain-agent-profile.service.js';
import { BrainOrchestratorService } from './orchestrator/brain-orchestrator.service.js';
import { BrainTaskExecutorService } from './orchestrator/brain-task-executor.service.js';
import { BrainPermissionService } from './security/brain-permission.service.js';
import { BrainRedactionService } from './security/brain-redaction.service.js';
import { BrainRoleSkillPolicyService } from './security/brain-role-skill-policy.service.js';
import { PromptInjectionGuardService } from './security/prompt-injection-guard.service.js';
import { BrainKnowledgeGraphService } from './semantic/brain-knowledge-graph.service.js';
import { BrainMetricRegistryService } from './semantic/brain-metric-registry.service.js';
import { BrainOntologyService } from './semantic/brain-ontology.service.js';
import { BrainAnswerComposerService } from './semantic/brain-answer-composer.service.js';
import { BrainQueryCompilerService } from './semantic/brain-query-compiler.service.js';
import { BrainReadonlyQueryExecutorService } from './semantic/brain-readonly-query-executor.service.js';
import { BrainSemanticQueryEngineService } from './semantic/brain-semantic-query-engine.service.js';
import { BrainAnalysisSkillsService } from './skills/brain-analysis-skills.service.js';
import { BrainActionConfirmationService } from './skills/brain-action-confirmation.service.js';
import { BrainBeauticianSkillsService } from './skills/brain-beautician-skills.service.js';
import { BrainCapabilityGatewayService } from './skills/brain-capability-gateway.service.js';
import { BrainFinanceSkillsService } from './skills/brain-finance-skills.service.js';
import { BrainInventorySkillsService } from './skills/brain-inventory-skills.service.js';
import { BrainManagerSkillsService } from './skills/brain-manager-skills.service.js';
import { BrainMarketingSkillsService } from './skills/brain-marketing-skills.service.js';
import { BrainPredictionSkillsService } from './skills/brain-prediction-skills.service.js';
import { BrainQuerySkillsService } from './skills/brain-query-skills.service.js';
import { BrainReceptionSkillsService } from './skills/brain-reception-skills.service.js';
import { BrainRiskSkillsService } from './skills/brain-risk-skills.service.js';
import { BrainSkillRegistryService } from './skills/brain-skill-registry.service.js';
import { BrainSkillRuntimeService } from './skills/brain-skill-runtime.service.js';

@Module({
  imports: [PrismaModule, ReservationsModule, InventoryModule, TerminalModule],
  controllers: [BrainController],
  providers: [
    BrainContextService,
    BrainConversationContextService,
    BrainChatService,
    BrainRoleIntentRouterService,
    BrainDomainAdapterRegistryService,
    BrainCustomerFactResolverService,
    BrainActionTargetResolverService,
    BrainStoreManagerDomainAdapter,
    BrainFrontDeskDomainAdapter,
    BrainMarketingDomainAdapter,
    BrainBeauticianDomainAdapter,
    BrainInventoryDomainAdapter,
    BrainFinanceDomainAdapter,
    BrainCustomerServiceDomainAdapter,
    {
      provide: BRAIN_DOMAIN_ADAPTERS,
      inject: [
        BrainStoreManagerDomainAdapter,
        BrainFrontDeskDomainAdapter,
        BrainMarketingDomainAdapter,
        BrainBeauticianDomainAdapter,
        BrainInventoryDomainAdapter,
        BrainFinanceDomainAdapter,
        BrainCustomerServiceDomainAdapter,
      ],
      useFactory: (
        storeManager: BrainStoreManagerDomainAdapter,
        frontDesk: BrainFrontDeskDomainAdapter,
        marketing: BrainMarketingDomainAdapter,
        beautician: BrainBeauticianDomainAdapter,
        inventory: BrainInventoryDomainAdapter,
        finance: BrainFinanceDomainAdapter,
        customerService: BrainCustomerServiceDomainAdapter,
      ) => [storeManager, frontDesk, marketing, beautician, inventory, finance, customerService],
    },
    BrainAnswerGraderService,
    BrainQuestionIntentService,
    BrainTimeRangeParserService,
    TermNormalizerService,
    EntityLinkerService,
    IntentClassifierService,
    BrainCognitionService,
    BrainTraceService,
    BrainGovernanceResourceService,
    BrainEvalService,
    BrainReleaseService,
    BrainFeedbackService,
    BrainPermissionService,
    BrainRedactionService,
    BrainRoleSkillPolicyService,
    PromptInjectionGuardService,
    BrainMemoryRepository,
    BrainMemoryService,
    BrainMemoryConsolidationService,
    BrainInspectionService,
    BrainAgentProfileService,
    BrainOrchestratorService,
    BrainTaskExecutorService,
    BrainKnowledgeGraphService,
    BrainMetricRegistryService,
    BrainOntologyService,
    BrainAnswerComposerService,
    BrainQueryCompilerService,
    BrainReadonlyQueryExecutorService,
    BrainSemanticQueryEngineService,
    BrainSkillRegistryService,
    BrainQuerySkillsService,
    BrainManagerSkillsService,
    BrainReceptionSkillsService,
    BrainMarketingSkillsService,
    BrainInventorySkillsService,
    BrainFinanceSkillsService,
    BrainBeauticianSkillsService,
    BrainAnalysisSkillsService,
    BrainRiskSkillsService,
    BrainPredictionSkillsService,
    BrainSkillRuntimeService,
    BrainActionConfirmationService,
    BrainCapabilityGatewayService,
  ],
  exports: [
    BrainContextService,
    BrainConversationContextService,
    BrainChatService,
    BrainRoleIntentRouterService,
    BrainDomainAdapterRegistryService,
    BrainCustomerFactResolverService,
    BrainActionTargetResolverService,
    BrainAnswerGraderService,
    BrainQuestionIntentService,
    BrainTimeRangeParserService,
    TermNormalizerService,
    EntityLinkerService,
    IntentClassifierService,
    BrainCognitionService,
    BrainTraceService,
    BrainGovernanceResourceService,
    BrainEvalService,
    BrainReleaseService,
    BrainFeedbackService,
    BrainPermissionService,
    BrainRedactionService,
    BrainRoleSkillPolicyService,
    PromptInjectionGuardService,
    BrainMemoryRepository,
    BrainMemoryService,
    BrainMemoryConsolidationService,
    BrainInspectionService,
    BrainAgentProfileService,
    BrainOrchestratorService,
    BrainTaskExecutorService,
    BrainKnowledgeGraphService,
    BrainMetricRegistryService,
    BrainOntologyService,
    BrainAnswerComposerService,
    BrainQueryCompilerService,
    BrainReadonlyQueryExecutorService,
    BrainSemanticQueryEngineService,
    BrainSkillRegistryService,
    BrainQuerySkillsService,
    BrainManagerSkillsService,
    BrainReceptionSkillsService,
    BrainMarketingSkillsService,
    BrainInventorySkillsService,
    BrainFinanceSkillsService,
    BrainBeauticianSkillsService,
    BrainAnalysisSkillsService,
    BrainRiskSkillsService,
    BrainPredictionSkillsService,
    BrainSkillRuntimeService,
    BrainActionConfirmationService,
    BrainCapabilityGatewayService,
  ],
})
export class BrainModule {}
