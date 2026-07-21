import { Module } from '@nestjs/common';
import { CommissionModule } from '../../commission/commission.module.js';
import { MarketingFeatureFlagsService } from '../marketing-feature-flags.service.js';
import { MarketingAttributionService } from './marketing-attribution.service.js';
import { MarketingEffectFactService } from './marketing-effect-fact.service.js';

@Module({
  imports: [CommissionModule],
  providers: [MarketingFeatureFlagsService, MarketingEffectFactService, MarketingAttributionService],
  exports: [MarketingFeatureFlagsService, MarketingEffectFactService, MarketingAttributionService],
})
export class MarketingAttributionModule {}
