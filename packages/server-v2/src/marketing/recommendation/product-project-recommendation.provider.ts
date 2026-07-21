import { Injectable } from '@nestjs/common';
import { ProductProjectRecommendationService } from '../product-project-recommendation.service.js';
import type { RecommendationProvider } from './recommendation-provider.interface.js';
import type { RecommendationBuildContext } from './marketing-recommendation.types.js';
import { normalizeRecommendationCard } from './recommendation-provider.utils.js';

@Injectable()
export class ProductProjectRecommendationProvider implements RecommendationProvider {
  readonly sourceType = 'product_project' as const;

  constructor(private readonly productProjectService: ProductProjectRecommendationService) {}

  async build(context: RecommendationBuildContext) {
    const cards = await this.productProjectService.getCards(context.storeId, { limit: 50, matchPromotion: false });
    return cards.map((card: any) => {
      const type = card.recommendationType ?? card.triggerType ?? 'opportunity';
      const stableEntity = card.productId ?? card.projectId ?? card.recommendedItems?.[0]?.id;
      const key = card.recommendationKey
        ?? `${type}:${stableEntity ? `${card.recommendedItems?.[0]?.type ?? 'entity'}:${stableEntity}` : `legacy:${card.id}`}`;
      return normalizeRecommendationCard(card, context, this.sourceType, key, 2);
    });
  }
}
