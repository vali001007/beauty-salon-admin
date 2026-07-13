import { Module } from '@nestjs/common';
import { MarketingService } from './marketing.service.js';
import { MarketingController } from './marketing.controller.js';
import { ProductProjectRecommendationService } from './product-project-recommendation.service.js';
import { CustomerMarketingProfileService } from './customer-marketing-profile.service.js';
import { CustomerLifecycleOntologyService } from './customer-lifecycle-ontology.service.js';
import { TerminalModule } from '../terminal/terminal.module.js';
import { MarketingChannelService } from './marketing-channel.service.js';
import { MarketingSchedulerService } from './marketing-scheduler.service.js';

@Module({
  imports: [TerminalModule],
  controllers: [MarketingController],
  providers: [MarketingService, MarketingChannelService, MarketingSchedulerService, ProductProjectRecommendationService, CustomerMarketingProfileService, CustomerLifecycleOntologyService],
  exports: [MarketingService, MarketingChannelService, ProductProjectRecommendationService, CustomerMarketingProfileService, CustomerLifecycleOntologyService],
})
export class MarketingModule {}
