import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { CardsModule } from '../cards/cards.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { MarketingModule } from '../marketing/marketing.module.js';
import { OperationProfitModule } from '../operation-profit/operation-profit.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReservationsModule } from '../reservations/reservations.module.js';
import { TerminalModule } from '../terminal/terminal.module.js';
import { StoreMetricsModule } from '../store-metrics/store-metrics.module.js';
import { BusinessDefinitionModule } from '../semantic-data/business-definition.module.js';
import { SemanticDataModule } from '../semantic-data/semantic-data.module.js';
import { BrainController } from './brain.controller.js';
import { BrainChatService } from './brain-chat.service.js';
import { BrainCapabilityCatalogService } from './capability/brain-capability-catalog.service.js';
import { BRAIN_REGISTERED_PERMISSION_CODES } from './capability/brain-capability.types.js';
import { loadRegisteredBrainPermissionCodes } from './capability/brain-registered-permission-codes.provider.js';
import { BrainCapabilityArgsValidatorService } from './capability/brain-capability-args-validator.service.js';
import { BrainCapabilityRetrieverService } from './capability/brain-capability-retriever.service.js';
import { BrainCapabilitySemanticVerifierService } from './capability/brain-capability-semantic-verifier.service.js';
import { BrainCapabilityGenerationGateService } from './capability/brain-capability-generation-gate.service.js';
import { BrainCapabilityPublishedGateService } from './capability/brain-capability-published-gate.service.js';
import { BrainGeneratedCapabilityDraftService } from './capability/brain-generated-capability-draft.service.js';
import { BrainConversationGuidanceService } from './guidance/brain-conversation-guidance.service.js';
import {
  BRAIN_CAPABILITY_DEFINITION_SNAPSHOT_SOURCE,
  BRAIN_CAPABILITY_NARRATIVE_GENERATOR,
  BrainCapabilityCodegenService,
} from './capability/brain-capability-codegen.service.js';
import { BrainCapabilityDefinitionSnapshotSourceService } from './capability/brain-capability-definition-snapshot-source.service.js';
import { BrainCapabilityNarrativeGeneratorService } from './capability/brain-capability-narrative.service.js';
import {
  BRAIN_CAPABILITY_SEMANTIC_MODEL,
  BrainCapabilitySemanticCompilerService,
} from './capability/brain-capability-semantic-compiler.service.js';
import { BrainCapabilitySemanticModelService } from './capability/brain-capability-semantic-model.service.js';
import { BrainCapabilityScannerService } from './capability/brain-capability-scanner.service.js';
import {
  BRAIN_CAPABILITY_EXECUTORS,
  BrainCapabilityExecutorRegistryService,
} from './capability/brain-capability-executor.registry.js';
import { BrainActionCapabilityExecutor } from './capability/executors/brain-action-capability.executor.js';
import { BrainDomainServiceCapabilityExecutor } from './capability/executors/brain-domain-service-capability.executor.js';
import { BrainFocusedBusinessCapabilityExecutor } from './capability/executors/brain-focused-business-capability.executor.js';
import { BrainMarketingCampaignCapabilityExecutor } from './capability/executors/brain-marketing-campaign-capability.executor.js';
import { BrainSemanticQueryCapabilityExecutor } from './capability/executors/brain-semantic-query-capability.executor.js';
import { BrainCognitionService } from './cognition/brain-cognition.service.js';
import { BrainCognitionShadowService } from './cognition/brain-cognition-shadow.service.js';
import { BrainOntologyRuntimeService } from './cognition/brain-ontology-runtime.service.js';
import { BrainSemanticIntentCompilerService } from './cognition/brain-semantic-intent-compiler.service.js';
import { BrainSemanticIntentValidatorService } from './cognition/brain-semantic-intent-validator.service.js';
import { BrainQuestionIntentService } from './cognition/brain-question-intent.service.js';
import { BrainTimeRangeParserService } from './cognition/brain-time-range-parser.service.js';
import { BrainRuntimeConfigService } from './config/brain-runtime-config.service.js';
import { EntityLinkerService } from './cognition/entity-linker.service.js';
import { IntentClassifierService } from './cognition/intent-classifier.service.js';
import { TermNormalizerService } from './cognition/term-normalizer.service.js';
import { BrainContextService } from './context/brain-context.service.js';
import { BrainConversationContextService } from './context/brain-conversation-context.service.js';
import { BrainResultReferenceService } from './context/brain-result-reference.service.js';
import { BrainIntentCompletenessPolicyService } from './cognition/brain-intent-completeness-policy.service.js';
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
import { BrainCapabilityGraderService } from './eval/brain-capability-grader.service.js';
import { BrainCompletionGraderService } from './eval/brain-completion-grader.service.js';
import { BrainIntentGraderService } from './eval/brain-intent-grader.service.js';
import { BrainPlanGraderService } from './eval/brain-plan-grader.service.js';
import { BrainEvalService } from './governance/brain-eval.service.js';
import { BrainFeedbackService } from './governance/brain-feedback.service.js';
import { BrainReleaseService } from './governance/brain-release.service.js';
import { BrainTraceService } from './governance/brain-trace.service.js';
import { BrainGovernanceResourceService } from './governance/brain-governance-resource.service.js';
import { BrainGovernanceApprovalService } from './governance/brain-governance-approval.service.js';
import { BrainCapabilityGovernancePolicyService } from './governance/brain-capability-governance-policy.service.js';
import { BrainCapabilityRegenerationService } from './governance/brain-capability-regeneration.service.js';
import { BrainCapabilityRegenerationWorkerService } from './governance/brain-capability-regeneration-worker.service.js';
import { BrainCapabilityRequirementInterpreterService } from './governance/brain-capability-requirement-interpreter.service.js';
import { BrainMemoryConsolidationService } from './memory/brain-memory-consolidation.service.js';
import { BrainMemoryRepository } from './memory/brain-memory.repository.js';
import { BrainMemoryService } from './memory/brain-memory.service.js';
import { BrainInspectionService } from './inspection/brain-inspection.service.js';
import { BrainInspectionPlanBridgeService } from './inspection/brain-inspection-plan-bridge.service.js';
import { BrainDataQualityGuardService } from './inspection/brain-data-quality-guard.service.js';
import { BrainInspectionRepairPreviewService } from './inspection/brain-inspection-repair-preview.service.js';
import { BrainAgentProfileService } from './orchestrator/brain-agent-profile.service.js';
import { BrainOrchestratorService } from './orchestrator/brain-orchestrator.service.js';
import { BrainTaskExecutorService } from './orchestrator/brain-task-executor.service.js';
import { BrainSingleStepPlannerService } from './planning/brain-single-step-planner.service.js';
import { BrainExecutionPlanValidatorService } from './planning/brain-execution-plan-validator.service.js';
import { BrainExecutionBudgetService } from './execution/brain-execution-budget.service.js';
import { BrainSupervisorPlannerService } from './planning/brain-supervisor-planner.service.js';
import { BrainReplannerService } from './planning/brain-replanner.service.js';
import { BrainObservationService } from './execution/brain-observation.service.js';
import { BrainCompletionVerifierService } from './execution/brain-completion-verifier.service.js';
import { BrainBoundedExecutorService } from './execution/brain-bounded-executor.service.js';
import { BrainAnswerCompletionGuardService } from './response/brain-answer-completion-guard.service.js';
import { BrainGroundedAnswerComposerService } from './response/brain-grounded-answer-composer.service.js';
import { BrainRoleContextBuilderService } from './role/brain-role-context-builder.service.js';
import { BrainPermissionService } from './security/brain-permission.service.js';
import { BrainRedactionService } from './security/brain-redaction.service.js';
import { BrainRoleSkillPolicyService } from './security/brain-role-skill-policy.service.js';
import { PromptInjectionGuardService } from './security/prompt-injection-guard.service.js';
import { BrainUntrustedActionClaimGuardService } from './security/brain-untrusted-action-claim-guard.service.js';
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
import { SchedulingModule } from '../scheduling/scheduling.module.js';
import { CustomerFeedbackModule } from '../customer-feedback/customer-feedback.module.js';
import { AgentV2BusinessMetricQueryService } from '../agent-v2/tools/agent-v2-business-metric-query.service.js';

@Module({
  imports: [
    AiModule,
    CardsModule,
    PrismaModule,
    ReservationsModule,
    InventoryModule,
    MarketingModule,
    OperationProfitModule,
    SchedulingModule,
    TerminalModule,
    StoreMetricsModule,
    SemanticDataModule,
    BusinessDefinitionModule,
    CustomerFeedbackModule,
  ],
  controllers: [BrainController],
  providers: [
    AgentV2BusinessMetricQueryService,
    BrainContextService,
    BrainConversationContextService,
    BrainResultReferenceService,
    BrainIntentCompletenessPolicyService,
    BrainChatService,
    BrainConversationGuidanceService,
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
    BrainIntentGraderService,
    BrainCapabilityGraderService,
    BrainPlanGraderService,
    BrainCompletionGraderService,
    BrainQuestionIntentService,
    BrainRuntimeConfigService,
    BrainOntologyRuntimeService,
    BrainSemanticIntentCompilerService,
    BrainSemanticIntentValidatorService,
    BrainTimeRangeParserService,
    TermNormalizerService,
    EntityLinkerService,
    IntentClassifierService,
    BrainCognitionService,
    BrainCognitionShadowService,
    BrainTraceService,
    BrainGovernanceResourceService,
    BrainGovernanceApprovalService,
    BrainCapabilityGovernancePolicyService,
    BrainCapabilityRequirementInterpreterService,
    BrainCapabilityRegenerationService,
    BrainCapabilityRegenerationWorkerService,
    BrainEvalService,
    BrainReleaseService,
    BrainFeedbackService,
    BrainPermissionService,
    BrainRedactionService,
    BrainRoleSkillPolicyService,
    PromptInjectionGuardService,
    BrainUntrustedActionClaimGuardService,
    BrainMemoryRepository,
    BrainMemoryService,
    BrainMemoryConsolidationService,
    BrainInspectionService,
    BrainInspectionPlanBridgeService,
    BrainInspectionRepairPreviewService,
    BrainDataQualityGuardService,
    BrainAgentProfileService,
    BrainRoleContextBuilderService,
    BrainOrchestratorService,
    BrainTaskExecutorService,
    BrainSingleStepPlannerService,
    BrainSupervisorPlannerService,
    BrainReplannerService,
    BrainCapabilityArgsValidatorService,
    BrainExecutionBudgetService,
    BrainExecutionPlanValidatorService,
    BrainObservationService,
    BrainCompletionVerifierService,
    BrainBoundedExecutorService,
    BrainAnswerCompletionGuardService,
    BrainGroundedAnswerComposerService,
    BrainKnowledgeGraphService,
    BrainMetricRegistryService,
    BrainOntologyService,
    BrainAnswerComposerService,
    BrainQueryCompilerService,
    BrainReadonlyQueryExecutorService,
    BrainSemanticQueryEngineService,
    {
      provide: BRAIN_REGISTERED_PERMISSION_CODES,
      useFactory: loadRegisteredBrainPermissionCodes,
    },
    BrainCapabilityCatalogService,
    BrainCapabilityRetrieverService,
    BrainCapabilitySemanticVerifierService,
    BrainCapabilityGenerationGateService,
    BrainCapabilityPublishedGateService,
    BrainGeneratedCapabilityDraftService,
    BrainCapabilityScannerService,
    BrainSemanticQueryCapabilityExecutor,
    BrainDomainServiceCapabilityExecutor,
    BrainFocusedBusinessCapabilityExecutor,
    BrainMarketingCampaignCapabilityExecutor,
    BrainActionCapabilityExecutor,
    {
      provide: BRAIN_CAPABILITY_EXECUTORS,
      inject: [
        BrainSemanticQueryCapabilityExecutor,
        BrainDomainServiceCapabilityExecutor,
        BrainFocusedBusinessCapabilityExecutor,
        BrainMarketingCampaignCapabilityExecutor,
        BrainActionCapabilityExecutor,
      ],
      useFactory: (
        semantic: BrainSemanticQueryCapabilityExecutor,
        domain: BrainDomainServiceCapabilityExecutor,
        focusedBusiness: BrainFocusedBusinessCapabilityExecutor,
        marketingCampaign: BrainMarketingCampaignCapabilityExecutor,
        action: BrainActionCapabilityExecutor,
      ) => [semantic, domain, focusedBusiness, marketingCampaign, action],
    },
    BrainCapabilityExecutorRegistryService,
    BrainCapabilityDefinitionSnapshotSourceService,
    {
      provide: BRAIN_CAPABILITY_DEFINITION_SNAPSHOT_SOURCE,
      useExisting: BrainCapabilityDefinitionSnapshotSourceService,
    },
    BrainCapabilityNarrativeGeneratorService,
    {
      provide: BRAIN_CAPABILITY_NARRATIVE_GENERATOR,
      useExisting: BrainCapabilityNarrativeGeneratorService,
    },
    BrainCapabilitySemanticModelService,
    {
      provide: BRAIN_CAPABILITY_SEMANTIC_MODEL,
      useExisting: BrainCapabilitySemanticModelService,
    },
    BrainCapabilitySemanticCompilerService,
    BrainCapabilityCodegenService,
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
    BusinessDefinitionModule,
    BrainContextService,
    BrainConversationContextService,
    BrainResultReferenceService,
    BrainIntentCompletenessPolicyService,
    BrainChatService,
    BrainConversationGuidanceService,
    BrainRoleIntentRouterService,
    BrainDomainAdapterRegistryService,
    BrainCustomerFactResolverService,
    BrainActionTargetResolverService,
    BrainAnswerGraderService,
    BrainIntentGraderService,
    BrainCapabilityGraderService,
    BrainPlanGraderService,
    BrainCompletionGraderService,
    BrainQuestionIntentService,
    BrainRuntimeConfigService,
    SemanticDataModule,
    BrainOntologyRuntimeService,
    BrainSemanticIntentCompilerService,
    BrainSemanticIntentValidatorService,
    BrainTimeRangeParserService,
    TermNormalizerService,
    EntityLinkerService,
    IntentClassifierService,
    BrainCognitionService,
    BrainCognitionShadowService,
    BrainTraceService,
    BrainGovernanceResourceService,
    BrainGovernanceApprovalService,
    BrainCapabilityRegenerationService,
    BrainEvalService,
    BrainReleaseService,
    BrainFeedbackService,
    BrainPermissionService,
    BrainRedactionService,
    BrainRoleSkillPolicyService,
    PromptInjectionGuardService,
    BrainUntrustedActionClaimGuardService,
    BrainMemoryRepository,
    BrainMemoryService,
    BrainMemoryConsolidationService,
    BrainInspectionService,
    BrainInspectionPlanBridgeService,
    BrainDataQualityGuardService,
    BrainAgentProfileService,
    BrainRoleContextBuilderService,
    BrainOrchestratorService,
    BrainTaskExecutorService,
    BrainSingleStepPlannerService,
    BrainSupervisorPlannerService,
    BrainReplannerService,
    BrainCapabilityArgsValidatorService,
    BrainExecutionBudgetService,
    BrainExecutionPlanValidatorService,
    BrainObservationService,
    BrainCompletionVerifierService,
    BrainBoundedExecutorService,
    BrainAnswerCompletionGuardService,
    BrainGroundedAnswerComposerService,
    BrainKnowledgeGraphService,
    BrainMetricRegistryService,
    BrainOntologyService,
    BrainAnswerComposerService,
    BrainQueryCompilerService,
    BrainReadonlyQueryExecutorService,
    BrainSemanticQueryEngineService,
    BrainCapabilityCatalogService,
    BrainCapabilityRetrieverService,
    BrainCapabilitySemanticVerifierService,
    BrainCapabilityGenerationGateService,
    BrainCapabilityPublishedGateService,
    BrainGeneratedCapabilityDraftService,
    BrainCapabilityScannerService,
    BrainCapabilityExecutorRegistryService,
    BrainCapabilityCodegenService,
    BrainCapabilitySemanticCompilerService,
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
