import type { RecommendationBuildContext, RecommendationCandidate, RecommendationSourceType } from './marketing-recommendation.types.js';

export interface RecommendationProvider {
  readonly sourceType: RecommendationSourceType;
  build(context: RecommendationBuildContext): Promise<RecommendationCandidate[]>;
}
