import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { AskDataModule } from '../ask-data/ask-data.module.js';
import { ReadOnlySqlKernelModule } from '../read-only-sql-kernel/read-only-sql-kernel.module.js';
import { AskDataFreeSqlAnswerService } from './ask-data-free-sql.answer.service.js';
import { AskDataFreeSqlAuditService } from './ask-data-free-sql-audit.service.js';
import { AskDataFreeSqlController } from './ask-data-free-sql.controller.js';
import { AskDataFreeSqlService } from './ask-data-free-sql.service.js';
import { AskDataClarificationPolicy } from './ask-data-clarification-policy.js';
import { AskDataIntentParser } from './ask-data-intent-parser.js';
import { AskDataSemanticRouter } from './ask-data-semantic-router.js';

@Module({
  imports: [AiModule, AskDataModule, ReadOnlySqlKernelModule],
  controllers: [AskDataFreeSqlController],
  providers: [
    AskDataClarificationPolicy,
    AskDataIntentParser,
    AskDataSemanticRouter,
    AskDataFreeSqlAnswerService,
    AskDataFreeSqlAuditService,
    AskDataFreeSqlService,
  ],
})
export class AskDataFreeSqlModule {}
