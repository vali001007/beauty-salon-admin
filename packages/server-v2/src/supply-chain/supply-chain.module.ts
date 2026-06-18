import { Module } from '@nestjs/common';
import { SupplyChainController } from './supply-chain.controller.js';
import { SupplyChainService } from './supply-chain.service.js';

@Module({
  controllers: [SupplyChainController],
  providers: [SupplyChainService],
})
export class SupplyChainModule {}
