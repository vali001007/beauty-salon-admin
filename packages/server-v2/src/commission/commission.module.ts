import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CommissionController, TerminalCommissionController } from './commission.controller.js';
import { CommissionService } from './commission.service.js';
import { DeviceAuthGuard } from '../terminal/guards/device-auth.guard.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: { expiresIn: '30d' },
      }),
    }),
  ],
  controllers: [CommissionController, TerminalCommissionController],
  providers: [CommissionService, DeviceAuthGuard],
  exports: [CommissionService],
})
export class CommissionModule {}
