import { Module } from '@nestjs/common';
import { SchedulingService } from './scheduling.service.js';
import { SchedulingController } from './scheduling.controller.js';
import { TerminalModule } from '../terminal/terminal.module.js';
import { SmartSchedulingController } from './smart-scheduling.controller.js';
import { SmartSchedulingService } from './smart-scheduling.service.js';
import { CommissionModule } from '../commission/commission.module.js';
import { GapOpportunityController } from './gap-opportunity.controller.js';
import { GapOpportunityService } from './gap-opportunity.service.js';

@Module({
  imports: [TerminalModule, CommissionModule],
  controllers: [SchedulingController, SmartSchedulingController, GapOpportunityController],
  providers: [SchedulingService, SmartSchedulingService, GapOpportunityService],
  exports: [SchedulingService, SmartSchedulingService, GapOpportunityService],
})
export class SchedulingModule {}
