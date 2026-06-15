import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service.js';
import { InventoryController } from './inventory.controller.js';
import { TerminalModule } from '../terminal/terminal.module.js';
import { CommissionModule } from '../commission/commission.module.js';

@Module({
  imports: [TerminalModule, CommissionModule],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
