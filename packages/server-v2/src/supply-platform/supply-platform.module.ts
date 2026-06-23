import { Module } from '@nestjs/common';
import { SupplyPlatformController } from './supply-platform.controller.js';
import { SupplyPlatformService } from './supply-platform.service.js';

@Module({
  controllers: [SupplyPlatformController],
  providers: [SupplyPlatformService],
  exports: [SupplyPlatformService],
})
export class SupplyPlatformModule {}
