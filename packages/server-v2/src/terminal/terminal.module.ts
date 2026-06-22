import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TerminalService } from './terminal.service.js';
import { TerminalDashboardCacheService } from './terminal-dashboard-cache.service.js';
import { AiModule } from '../ai/ai.module.js';
import { CommissionModule } from '../commission/commission.module.js';
import { CustomersModule } from '../customers/customers.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { TerminalAdminDeviceController, TerminalDeviceAdminCompatController } from './terminal-admin-device.controller.js';
import {
  TerminalDeviceController,
  TerminalBootstrapController,
  TerminalConversationAdminController,
  TerminalConversationController,
  TerminalCustomerController,
  TerminalTaskController,
  TerminalCardController,
  TerminalCashierController,
  TerminalOrderController,
  TerminalSkinTestController,
  TerminalReservationController,
  TerminalInventoryController,
  TerminalAutomationController,
  TerminalBeauticianController,
  TerminalDashboardController,
  TerminalContextController,
} from './terminal.controller.js';
import { DeviceAuthGuard } from './guards/device-auth.guard.js';

@Module({
  imports: [
    AiModule,
    CommissionModule,
    CustomersModule,
    OrdersModule,
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
    TerminalAdminDeviceController,
    TerminalDeviceAdminCompatController,
    TerminalDeviceController,
    TerminalBootstrapController,
    TerminalConversationAdminController,
    TerminalConversationController,
    TerminalCustomerController,
    TerminalTaskController,
    TerminalCardController,
    TerminalCashierController,
    TerminalOrderController,
    TerminalSkinTestController,
    TerminalReservationController,
    TerminalInventoryController,
    TerminalAutomationController,
    TerminalBeauticianController,
    TerminalDashboardController,
    TerminalContextController,
  ],
  providers: [TerminalService, TerminalDashboardCacheService, DeviceAuthGuard],
  exports: [TerminalService, TerminalDashboardCacheService],
})
export class TerminalModule {}
