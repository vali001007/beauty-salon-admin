import { Module } from '@nestjs/common';
import { BrainModule } from '../brain/brain.module.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [BrainModule],
  controllers: [HealthController],
})
export class HealthModule {}
