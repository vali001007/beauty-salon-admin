import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AgentEvidenceService } from '../agent/agent-evidence.service.js';
import { AgentWorkflowRuntimeService } from '../agent/agent-workflow-runtime.service.js';
import { AgentV3TextToSqlModule } from '../agent-v3/text-to-sql/agent-v3-text-to-sql.module.js';
import { MarketingModule } from '../marketing/marketing.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { DeviceAuthGuard } from '../terminal/guards/device-auth.guard.js';
import { AgentV5BeauticianAdapter } from './adapters/agent-v5-beautician.adapter.js';
import { AgentV5BusinessToolAdapter } from './adapters/agent-v5-business-tool.adapter.js';
import { AgentV5CashierAdapter } from './adapters/agent-v5-cashier.adapter.js';
import { AgentV5FinanceAdapter } from './adapters/agent-v5-finance.adapter.js';
import { AgentV5GovernanceAdapter } from './adapters/agent-v5-governance.adapter.js';
import { AgentV5InventorySupplyAdapter } from './adapters/agent-v5-inventory-supply.adapter.js';
import { AgentV5LegacyToolAdapter } from './adapters/agent-v5-legacy-tool.adapter.js';
import { AgentV5LifecycleAdapter } from './adapters/agent-v5-lifecycle.adapter.js';
import { AgentV5MarketingAdapter } from './adapters/agent-v5-marketing.adapter.js';
import { AgentV5ReceptionAdapter } from './adapters/agent-v5-reception.adapter.js';
import { AgentV5ReadonlyQueryAdapter } from './adapters/agent-v5-readonly-query.adapter.js';
import { AgentV5ScheduleAdapter } from './adapters/agent-v5-schedule.adapter.js';
import { AgentV5StaffPerformanceAdapter } from './adapters/agent-v5-staff-performance.adapter.js';
import { AgentV5Controller } from './agent-v5.controller.js';
import { AgentV5OrchestratorService } from './agent-v5-orchestrator.service.js';
import { AgentV5FailureDiagnosisService } from './eval/agent-v5-failure-diagnosis.service.js';
import { AgentV5GovernanceReportService } from './governance/agent-v5-governance-report.service.js';
import { AgentV5ClarificationService } from './ontology/agent-v5-clarification.service.js';
import { AgentV5ConstraintGuardService } from './ontology/agent-v5-constraint-guard.service.js';
import { AgentV5ContextBuilderService } from './ontology/agent-v5-context-builder.service.js';
import { AgentV5EvidencePackService } from './ontology/agent-v5-evidence-pack.service.js';
import { AgentV5MemoryService } from './ontology/agent-v5-memory.service.js';
import { AgentV5SemanticRouterService } from './ontology/agent-v5-semantic-router.service.js';
import { BusinessOntologyRegistry } from './ontology/business-ontology.registry.js';

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
  controllers: [AgentV5Controller],
  providers: [
    AgentWorkflowRuntimeService,
    AgentEvidenceService,
    DeviceAuthGuard,
    BusinessOntologyRegistry,
    AgentV5SemanticRouterService,
    AgentV5ContextBuilderService,
    AgentV5EvidencePackService,
    AgentV5ClarificationService,
    AgentV5MemoryService,
    AgentV5ConstraintGuardService,
    AgentV5FailureDiagnosisService,
    AgentV5ReadonlyQueryAdapter,
    AgentV5LifecycleAdapter,
    AgentV5BusinessToolAdapter,
    AgentV5GovernanceAdapter,
    AgentV5LegacyToolAdapter,
    AgentV5ReceptionAdapter,
    AgentV5CashierAdapter,
    AgentV5BeauticianAdapter,
    AgentV5ScheduleAdapter,
    AgentV5FinanceAdapter,
    AgentV5InventorySupplyAdapter,
    AgentV5StaffPerformanceAdapter,
    AgentV5MarketingAdapter,
    AgentV5GovernanceReportService,
    AgentV5OrchestratorService,
  ],
  exports: [AgentV5OrchestratorService],
})
export class AgentV5Module {}
