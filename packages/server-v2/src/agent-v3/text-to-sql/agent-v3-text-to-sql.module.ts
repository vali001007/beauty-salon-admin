import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { AgentV3AnswerRelevanceGuardService } from './agent-v3-answer-relevance-guard.service.js';
import { AgentV3ControlledTextToSqlService } from './agent-v3-controlled-text-to-sql.service.js';
import { AgentV3ReadOnlySqlExecutorService } from './agent-v3-readonly-sql-executor.service.js';
import { AgentV3SemanticRouterAdminService } from './agent-v3-semantic-router-admin.service.js';
import { AgentV3SemanticRouterController } from './agent-v3-semantic-router.controller.js';
import { AgentV3SemanticRouterService } from './agent-v3-semantic-router.service.js';
import { AgentV3SemanticViewRegistryService } from './agent-v3-semantic-view-registry.service.js';
import { AgentV3SqlAstParserService } from './agent-v3-sql-ast-parser.service.js';
import { AgentV3SqlCostGuardService } from './agent-v3-sql-cost-guard.service.js';
import { AgentV3SqlGuardService } from './agent-v3-sql-guard.service.js';
import { AgentV3TextToSqlAnswerComposerService } from './agent-v3-text-to-sql-answer-composer.service.js';
import { AgentV3TextToSqlAuditService } from './agent-v3-text-to-sql-audit.service.js';
import { AgentV3TextToSqlController } from './agent-v3-text-to-sql.controller.js';
import { AgentV3TextToSqlPlannerService } from './agent-v3-text-to-sql-planner.service.js';

const providers = [
  AgentV3AnswerRelevanceGuardService,
  AgentV3ControlledTextToSqlService,
  AgentV3ReadOnlySqlExecutorService,
  AgentV3SemanticRouterAdminService,
  AgentV3SemanticRouterService,
  AgentV3SemanticViewRegistryService,
  AgentV3SqlAstParserService,
  AgentV3SqlCostGuardService,
  AgentV3SqlGuardService,
  AgentV3TextToSqlAnswerComposerService,
  AgentV3TextToSqlAuditService,
  AgentV3TextToSqlPlannerService,
];

@Module({
  imports: [PrismaModule],
  controllers: [AgentV3TextToSqlController, AgentV3SemanticRouterController],
  providers,
  exports: providers,
})
export class AgentV3TextToSqlModule {}
