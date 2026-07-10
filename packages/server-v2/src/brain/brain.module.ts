import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { BrainController } from './brain.controller.js';
import { BrainCognitionService } from './cognition/brain-cognition.service.js';
import { EntityLinkerService } from './cognition/entity-linker.service.js';
import { IntentClassifierService } from './cognition/intent-classifier.service.js';
import { TermNormalizerService } from './cognition/term-normalizer.service.js';
import { BrainContextService } from './context/brain-context.service.js';
import { BrainEvalService } from './governance/brain-eval.service.js';
import { BrainFeedbackService } from './governance/brain-feedback.service.js';
import { BrainReleaseService } from './governance/brain-release.service.js';
import { BrainTraceService } from './governance/brain-trace.service.js';
import { BrainMemoryConsolidationService } from './memory/brain-memory-consolidation.service.js';
import { BrainMemoryRepository } from './memory/brain-memory.repository.js';
import { BrainMemoryService } from './memory/brain-memory.service.js';
import { BrainInspectionService } from './inspection/brain-inspection.service.js';
import { BrainAgentProfileService } from './orchestrator/brain-agent-profile.service.js';
import { BrainOrchestratorService } from './orchestrator/brain-orchestrator.service.js';
import { BrainPermissionService } from './security/brain-permission.service.js';
import { BrainRedactionService } from './security/brain-redaction.service.js';
import { PromptInjectionGuardService } from './security/prompt-injection-guard.service.js';
import { BrainKnowledgeGraphService } from './semantic/brain-knowledge-graph.service.js';
import { BrainMetricRegistryService } from './semantic/brain-metric-registry.service.js';
import { BrainOntologyService } from './semantic/brain-ontology.service.js';
import { BrainQueryCompilerService } from './semantic/brain-query-compiler.service.js';
import { BrainReadonlyQueryExecutorService } from './semantic/brain-readonly-query-executor.service.js';
import { BrainSemanticQueryEngineService } from './semantic/brain-semantic-query-engine.service.js';
import { BrainAnalysisSkillsService } from './skills/brain-analysis-skills.service.js';
import { BrainActionConfirmationService } from './skills/brain-action-confirmation.service.js';
import { BrainCapabilityGatewayService } from './skills/brain-capability-gateway.service.js';
import { BrainPredictionSkillsService } from './skills/brain-prediction-skills.service.js';
import { BrainQuerySkillsService } from './skills/brain-query-skills.service.js';
import { BrainRiskSkillsService } from './skills/brain-risk-skills.service.js';
import { BrainSkillRegistryService } from './skills/brain-skill-registry.service.js';
import { BrainSkillRuntimeService } from './skills/brain-skill-runtime.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [BrainController],
  providers: [
    BrainContextService,
    TermNormalizerService,
    EntityLinkerService,
    IntentClassifierService,
    BrainCognitionService,
    BrainTraceService,
    BrainEvalService,
    BrainReleaseService,
    BrainFeedbackService,
    BrainPermissionService,
    BrainRedactionService,
    PromptInjectionGuardService,
    BrainMemoryRepository,
    BrainMemoryService,
    BrainMemoryConsolidationService,
    BrainInspectionService,
    BrainAgentProfileService,
    BrainOrchestratorService,
    BrainKnowledgeGraphService,
    BrainMetricRegistryService,
    BrainOntologyService,
    BrainQueryCompilerService,
    BrainReadonlyQueryExecutorService,
    BrainSemanticQueryEngineService,
    BrainSkillRegistryService,
    BrainQuerySkillsService,
    BrainAnalysisSkillsService,
    BrainRiskSkillsService,
    BrainPredictionSkillsService,
    BrainSkillRuntimeService,
    BrainActionConfirmationService,
    BrainCapabilityGatewayService,
  ],
  exports: [
    BrainContextService,
    TermNormalizerService,
    EntityLinkerService,
    IntentClassifierService,
    BrainCognitionService,
    BrainTraceService,
    BrainEvalService,
    BrainReleaseService,
    BrainFeedbackService,
    BrainPermissionService,
    BrainRedactionService,
    PromptInjectionGuardService,
    BrainMemoryRepository,
    BrainMemoryService,
    BrainMemoryConsolidationService,
    BrainInspectionService,
    BrainAgentProfileService,
    BrainOrchestratorService,
    BrainKnowledgeGraphService,
    BrainMetricRegistryService,
    BrainOntologyService,
    BrainQueryCompilerService,
    BrainReadonlyQueryExecutorService,
    BrainSemanticQueryEngineService,
    BrainSkillRegistryService,
    BrainQuerySkillsService,
    BrainAnalysisSkillsService,
    BrainRiskSkillsService,
    BrainPredictionSkillsService,
    BrainSkillRuntimeService,
    BrainActionConfirmationService,
    BrainCapabilityGatewayService,
  ],
})
export class BrainModule {}
