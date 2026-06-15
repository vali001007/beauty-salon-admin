import { Module } from '@nestjs/common';
import { SchedulingService } from './scheduling.service.js';
import { SchedulingController } from './scheduling.controller.js';
import { TerminalModule } from '../terminal/terminal.module.js';
import { SmartSchedulingController } from './smart-scheduling.controller.js';
import { SmartSchedulingService } from './smart-scheduling.service.js';
import { CommissionModule } from '../commission/commission.module.js';

@Module({
  imports: [TerminalModule, CommissionModule],
  controllers: [SchedulingController, SmartSchedulingController],
  providers: [SchedulingService, SmartSchedulingService],
  exports: [SchedulingService, SmartSchedulingService],
})
export class SchedulingModule {}
