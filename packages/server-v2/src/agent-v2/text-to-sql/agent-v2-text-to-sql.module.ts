import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { AgentV2ControlledTextToSqlService } from './agent-v2-controlled-text-to-sql.service.js';
import { AgentV2ReadOnlySqlExecutorService } from './agent-v2-readonly-sql-executor.service.js';
import { AgentV2SemanticViewRegistryService } from './agent-v2-semantic-view-registry.service.js';
import { AgentV2SqlAstParserService } from './agent-v2-sql-ast-parser.service.js';
import { AgentV2SqlCostGuardService } from './agent-v2-sql-cost-guard.service.js';
import { AgentV2SqlGuardService } from './agent-v2-sql-guard.service.js';
import { AgentV2TextToSqlAnswerComposerService } from './agent-v2-text-to-sql-answer-composer.service.js';
import { AgentV2TextToSqlAuditService } from './agent-v2-text-to-sql-audit.service.js';
import { AgentV2TextToSqlCandidateService } from './agent-v2-text-to-sql-candidate.service.js';
import { AgentV2TextToSqlController } from './agent-v2-text-to-sql.controller.js';
import { AgentV2TextToSqlPlannerService } from './agent-v2-text-to-sql-planner.service.js';

const providers = [
  AgentV2ControlledTextToSqlService,
  AgentV2ReadOnlySqlExecutorService,
  AgentV2SemanticViewRegistryService,
  AgentV2SqlAstParserService,
  AgentV2SqlCostGuardService,
  AgentV2SqlGuardService,
  AgentV2TextToSqlAnswerComposerService,
  AgentV2TextToSqlAuditService,
  AgentV2TextToSqlCandidateService,
  AgentV2TextToSqlPlannerService,
];

@Module({
  imports: [PrismaModule],
  controllers: [AgentV2TextToSqlController],
  providers,
  exports: providers,
})
export class AgentV2TextToSqlModule {}
