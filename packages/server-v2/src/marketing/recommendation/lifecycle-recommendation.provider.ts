import { Injectable } from '@nestjs/common';
import { CustomerLifecycleOntologyService } from '../customer-lifecycle-ontology.service.js';
import type { RecommendationProvider } from './recommendation-provider.interface.js';
import type { RecommendationBuildContext } from './marketing-recommendation.types.js';
import { normalizeRecommendationCard } from './recommendation-provider.utils.js';

@Injectable()
export class LifecycleRecommendationProvider implements RecommendationProvider {
  readonly sourceType = 'lifecycle' as const;

  constructor(private readonly lifecycleService: CustomerLifecycleOntologyService) {}

  async build(context: RecommendationBuildContext) {
    const cards = await this.lifecycleService.buildRecommendationCards(context.storeId, 50);
    return cards.map((card: any) => {
      const type = card.recommendationType ?? card.triggerType ?? card.id;
      const key = card.recommendationKey ?? `lifecycle:${type}`;
      return normalizeRecommendationCard(card, context, this.sourceType, key, 6);
    });
  }
}
