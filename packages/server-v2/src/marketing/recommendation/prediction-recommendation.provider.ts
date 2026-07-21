import { Injectable } from '@nestjs/common';
import { MarketingService } from '../marketing.service.js';
import type { RecommendationProvider } from './recommendation-provider.interface.js';
import type { RecommendationBuildContext } from './marketing-recommendation.types.js';
import { normalizeRecommendationCard } from './recommendation-provider.utils.js';

@Injectable()
export class PredictionRecommendationProvider implements RecommendationProvider {
  readonly sourceType = 'prediction' as const;

  constructor(private readonly marketingService: MarketingService) {}

  async build(context: RecommendationBuildContext) {
    const cards = await this.marketingService.getRecommendations(context.storeId, {
      scope: 'customer',
      limit: 50,
      refresh: true,
      matchPromotion: false,
    });
    return cards
      .filter((card: any) => card.source !== 'customer_lifecycle')
      .map((card: any) => {
        const type = card.predictionType ?? card.triggerType ?? card.recommendationType ?? card.id;
        return normalizeRecommendationCard(card, context, this.sourceType, `prediction:${type}`, 30);
      });
  }
}
