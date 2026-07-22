import { summarizeMarketingRecommendationV2Verification } from '../../../prisma/marketing-recommendation-v2-verify';

describe('marketing recommendation v2 verification', () => {
  it('passes only when the new schema is ready and store boundaries are intact', () => {
    expect(
      summarizeMarketingRecommendationV2Verification({
        schemaReady: true,
        storeScopedRunsMissingIdentity: 0,
        recommendationInstancesMissingStore: 0,
        crossStoreAudienceMembers: 0,
        crossStoreAdoptions: 0,
        legacyActivitiesMissingLinks: 0,
        legacyTasksMissingLinks: 0,
        crossStoreActivityLinks: 0,
        crossStorePageLinks: 0,
        crossStoreTaskLinks: 0,
        staleRunningExecutions: 0,
        invalidDeliveryFacts: 0,
        eligibleDeliveryTouchesMissingFacts: 0,
        duplicatePrimaryRevenueFacts: 0,
        supersededTerminalPrimaryConversions: 0,
      }).passed,
    ).toBe(true);

    expect(
      summarizeMarketingRecommendationV2Verification({
        schemaReady: false,
        storeScopedRunsMissingIdentity: 0,
        recommendationInstancesMissingStore: 0,
        crossStoreAudienceMembers: 0,
        crossStoreAdoptions: 0,
        legacyActivitiesMissingLinks: 0,
        legacyTasksMissingLinks: 0,
        crossStoreActivityLinks: 0,
        crossStorePageLinks: 0,
        crossStoreTaskLinks: 0,
        staleRunningExecutions: 0,
        invalidDeliveryFacts: 0,
        eligibleDeliveryTouchesMissingFacts: 0,
        duplicatePrimaryRevenueFacts: 0,
        supersededTerminalPrimaryConversions: 0,
      }).passed,
    ).toBe(false);

    expect(
      summarizeMarketingRecommendationV2Verification({
        schemaReady: true,
        storeScopedRunsMissingIdentity: 0,
        recommendationInstancesMissingStore: 0,
        crossStoreAudienceMembers: 0,
        crossStoreAdoptions: 0,
        legacyActivitiesMissingLinks: 1,
        legacyTasksMissingLinks: 0,
        crossStoreActivityLinks: 0,
        crossStorePageLinks: 0,
        crossStoreTaskLinks: 0,
        staleRunningExecutions: 0,
        invalidDeliveryFacts: 0,
        eligibleDeliveryTouchesMissingFacts: 0,
        duplicatePrimaryRevenueFacts: 0,
        supersededTerminalPrimaryConversions: 0,
      }).passed,
    ).toBe(false);

    expect(
      summarizeMarketingRecommendationV2Verification({
        schemaReady: true,
        storeScopedRunsMissingIdentity: 0,
        recommendationInstancesMissingStore: 0,
        crossStoreAudienceMembers: 0,
        crossStoreAdoptions: 0,
        legacyActivitiesMissingLinks: 0,
        legacyTasksMissingLinks: 0,
        crossStoreActivityLinks: 0,
        crossStorePageLinks: 0,
        crossStoreTaskLinks: 0,
        staleRunningExecutions: 0,
        invalidDeliveryFacts: 0,
        eligibleDeliveryTouchesMissingFacts: 0,
        duplicatePrimaryRevenueFacts: 0,
        supersededTerminalPrimaryConversions: 1,
      }).passed,
    ).toBe(false);
  });
});
