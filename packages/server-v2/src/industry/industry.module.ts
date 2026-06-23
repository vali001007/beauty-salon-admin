import { Module } from '@nestjs/common';
import { IndustryController } from './industry.controller.js';
import { IndustryService } from './industry.service.js';

@Module({
  controllers: [IndustryController],
  providers: [IndustryService],
  exports: [IndustryService],
})
export class IndustryModule {}
