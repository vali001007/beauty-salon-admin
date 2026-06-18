import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AiModule } from '../ai/ai.module.js';
import { CustomerAppController } from './customer-app.controller.js';
import { CustomerAppService } from './customer-app.service.js';
import { CustomerAppAuthGuard } from './guards/customer-app-auth.guard.js';

@Module({
  imports: [
    AiModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET') || 'ami-glow-dev-secret',
        signOptions: { expiresIn: '30d' },
      }),
    }),
  ],
  controllers: [CustomerAppController],
  providers: [CustomerAppService, CustomerAppAuthGuard],
  exports: [CustomerAppService],
})
export class CustomerAppModule {}
