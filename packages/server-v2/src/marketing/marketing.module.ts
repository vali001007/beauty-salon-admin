import { Module } from '@nestjs/common';
import { MarketingService } from './marketing.service.js';
import { MarketingController } from './marketing.controller.js';
import { ProductProjectRecommendationService } from './product-project-recommendation.service.js';
import { CustomerMarketingProfileService } from './customer-marketing-profile.service.js';
import { CustomerLifecycleOntologyService } from './customer-lifecycle-ontology.service.js';
import { TerminalModule } from '../terminal/terminal.module.js';
import { MarketingChannelService } from './marketing-channel.service.js';
import { MarketingSchedulerService } from './marketing-scheduler.service.js';
import { MarketingPredictionRunService } from './prediction/marketing-prediction-run.service.js';
import { MarketingFeatureFlagsService } from './marketing-feature-flags.service.js';
import { PredictionRecommendationProvider } from './recommendation/prediction-recommendation.provider.js';
import { LifecycleRecommendationProvider } from './recommendation/lifecycle-recommendation.provider.js';
import { ProductProjectRecommendationProvider } from './recommendation/product-project-recommendation.provider.js';
import { MarketingRecommendationOrchestratorService } from './recommendation/marketing-recommendation-orchestrator.service.js';
import { MarketingRecommendationQueryService } from './recommendation/marketing-recommendation-query.service.js';
import { MarketingRecommendationOfferService } from './recommendation/marketing-recommendation-offer.service.js';
import { MarketingRecommendationAdoptionService } from './recommendation/marketing-recommendation-adoption.service.js';
import { MarketingAudienceService } from './automation/marketing-audience.service.js';
import { MarketingExecutionService } from './automation/marketing-execution.service.js';
import { MarketingDeliveryWorkerService } from './automation/marketing-delivery-worker.service.js';
import { MarketingAttributionModule } from './attribution/marketing-attribution.module.js';

@Module({
  imports: [TerminalModule, MarketingAttributionModule],
  controllers: [MarketingController],
  providers: [
    MarketingService,
    MarketingPredictionRunService,
    MarketingFeatureFlagsService,
    MarketingChannelService,
    MarketingSchedulerService,
    ProductProjectRecommendationService,
    CustomerMarketingProfileService,
    CustomerLifecycleOntologyService,
    PredictionRecommendationProvider,
    LifecycleRecommendationProvider,
    ProductProjectRecommendationProvider,
    MarketingRecommendationOfferService,
    MarketingRecommendationOrchestratorService,
    MarketingRecommendationQueryService,
    MarketingRecommendationAdoptionService,
    MarketingAudienceService,
    MarketingExecutionService,
    MarketingDeliveryWorkerService,
  ],
  exports: [
    MarketingService,
    MarketingPredictionRunService,
    MarketingFeatureFlagsService,
    MarketingChannelService,
    ProductProjectRecommendationService,
    CustomerMarketingProfileService,
    CustomerLifecycleOntologyService,
    MarketingRecommendationOfferService,
    MarketingRecommendationOrchestratorService,
    MarketingRecommendationQueryService,
    MarketingRecommendationAdoptionService,
    MarketingAudienceService,
    MarketingExecutionService,
  ],
})
export class MarketingModule {}
