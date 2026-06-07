import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TerminalService } from './terminal.service.js';
import { AiModule } from '../ai/ai.module.js';
import {
  TerminalDeviceController,
  TerminalBootstrapController,
  TerminalCustomerController,
  TerminalTaskController,
  TerminalCardController,
  TerminalCashierController,
  TerminalOrderController,
  TerminalSkinTestController,
  TerminalReservationController,
  TerminalInventoryController,
  TerminalAutomationController,
  TerminalDashboardController,
} from './terminal.controller.js';
import { DeviceAuthGuard } from './guards/device-auth.guard.js';

@Module({
  imports: [
    AiModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: { expiresIn: '30d' },
      }),
    }),
  ],
  controllers: [
    TerminalDeviceController,
    TerminalBootstrapController,
    TerminalCustomerController,
    TerminalTaskController,
    TerminalCardController,
    TerminalCashierController,
    TerminalOrderController,
    TerminalSkinTestController,
    TerminalReservationController,
    TerminalInventoryController,
    TerminalAutomationController,
    TerminalDashboardController,
  ],
  providers: [TerminalService, DeviceAuthGuard],
  exports: [TerminalService],
})
export class TerminalModule {}
