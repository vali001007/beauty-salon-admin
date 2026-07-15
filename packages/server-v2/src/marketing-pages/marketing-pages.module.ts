import { Module } from '@nestjs/common';
import { MarketingPagesController } from './marketing-pages.controller.js';
import { MarketingPagesService } from './marketing-pages.service.js';
import { MarketingAttributionModule } from '../marketing/attribution/marketing-attribution.module.js';

@Module({
  imports: [MarketingAttributionModule],
  controllers: [MarketingPagesController],
  providers: [MarketingPagesService],
  exports: [MarketingPagesService],
})
export class MarketingPagesModule {}
