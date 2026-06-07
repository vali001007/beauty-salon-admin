import { Module } from '@nestjs/common';
import { MarketingPagesController } from './marketing-pages.controller.js';
import { MarketingPagesService } from './marketing-pages.service.js';

@Module({
  controllers: [MarketingPagesController],
  providers: [MarketingPagesService],
  exports: [MarketingPagesService],
})
export class MarketingPagesModule {}
