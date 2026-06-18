import { buildDefaultPromotionAssets, seedPromotionAssets, verifyPromotionAssets } from '../../prisma/seed-promotion-assets';

describe('default promotion assets seed', () => {
  it('should provide 24 approved active system assets with required matching metadata', () => {
    const assets = buildDefaultPromotionAssets();
    const codes = new Set(assets.map((asset) => asset.code));

    expect(assets).toHaveLength(24);
    expect(codes.size).toBe(24);
    expect(assets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'system_new_customer_first_trial', scenario: 'new_customer' }),
        expect.objectContaining({ code: 'system_care_cycle_due_coupon', scenario: 'care_cycle_due' }),
        expect.objectContaining({ code: 'system_vip_privilege_care', scenario: 'vip_privilege_care' }),
        expect.objectContaining({ code: 'system_inventory_clearance_coupon', scenario: 'product_expiry_clearance' }),
        expect.objectContaining({ code: 'system_low_peak_booking_gift', scenario: 'project_idle_capacity' }),
        expect.objectContaining({ code: 'system_coupon_claimed_unused_reminder', scenario: 'coupon_claimed_unused' }),
      ]),
    );

    for (const asset of assets) {
      expect(asset.source).toBe('system');
      expect(asset.storeId).toBeNull();
      expect(asset.status).toBe('active');
      expect(asset.approvalStatus).toBe('approved');
      expect(asset.stackable).toBe(false);
      expect(asset.issuedCount).toBe(0);
      expect(asset.usedCount).toBe(0);
      expect(asset.scenario).toEqual(expect.any(String));
      expect(asset.type).toEqual(expect.any(String));
      expect(asset.audienceTags.length).toBeGreaterThan(0);
      expect(asset.metadata).toEqual(
        expect.objectContaining({
          reason: expect.any(String),
          preferredExecutionModes: expect.any(Array),
          offerStrength: expect.any(String),
        }),
      );
      expect((asset.metadata.preferredExecutionModes as unknown[]).length).toBeGreaterThan(0);
      expect(asset.grossMarginGuard).toBeTruthy();
    }
  });

  it('should summarize seed coverage for dry-run and apply reports', async () => {
    const assets = buildDefaultPromotionAssets();
    const delegate = {
      findMany: jest.fn().mockResolvedValue([{ code: assets[0].code }, { code: assets[1].code }]),
      createMany: jest.fn(),
    };
    const existingCodes = new Set([assets[0].code, assets[1].code]);

    await expect(seedPromotionAssets({ promotion: delegate }, true)).resolves.toEqual({
      expected: 24,
      existing: 2,
      created: 22,
      skipped: 2,
      complete: false,
    });
    expect(delegate.createMany).not.toHaveBeenCalled();

    await expect(seedPromotionAssets({ promotion: delegate }, false)).resolves.toEqual({
      expected: 24,
      existing: 2,
      created: 22,
      skipped: 2,
      complete: true,
    });
    expect(delegate.createMany).toHaveBeenCalledWith({
      data: assets.filter((asset) => !existingCodes.has(asset.code)),
      skipDuplicates: true,
    });
  });

  it('should verify persisted promotion assets and report missing or invalid records', async () => {
    const assets = buildDefaultPromotionAssets();
    const completePrisma = {
      promotion: {
        findMany: jest.fn().mockResolvedValue(assets.map((asset) => ({
          code: asset.code,
          source: asset.source,
          storeId: asset.storeId,
          status: asset.status,
          approvalStatus: asset.approvalStatus,
          scenario: asset.scenario,
          type: asset.type,
          audienceTags: asset.audienceTags,
          metadata: asset.metadata,
          grossMarginGuard: asset.grossMarginGuard,
        }))),
      },
    };

    await expect(verifyPromotionAssets(completePrisma)).resolves.toMatchObject({
      expected: 24,
      existing: 24,
      missing: [],
      invalid: [],
      complete: true,
    });

    const invalidAsset = {
      ...assets[1],
      status: 'draft',
      metadata: { reason: assets[1].metadata.reason },
    };
    const partialPrisma = {
      promotion: {
        findMany: jest.fn().mockResolvedValue([
          {
            code: assets[0].code,
            source: assets[0].source,
            storeId: assets[0].storeId,
            status: assets[0].status,
            approvalStatus: assets[0].approvalStatus,
            scenario: assets[0].scenario,
            type: assets[0].type,
            audienceTags: assets[0].audienceTags,
            metadata: assets[0].metadata,
            grossMarginGuard: assets[0].grossMarginGuard,
          },
          {
            code: invalidAsset.code,
            source: invalidAsset.source,
            storeId: invalidAsset.storeId,
            status: invalidAsset.status,
            approvalStatus: invalidAsset.approvalStatus,
            scenario: invalidAsset.scenario,
            type: invalidAsset.type,
            audienceTags: invalidAsset.audienceTags,
            metadata: invalidAsset.metadata,
            grossMarginGuard: invalidAsset.grossMarginGuard,
          },
        ]),
      },
    };

    await expect(verifyPromotionAssets(partialPrisma)).resolves.toMatchObject({
      expected: 24,
      existing: 2,
      complete: false,
      missing: expect.arrayContaining([assets[2].code]),
      invalid: [
        expect.objectContaining({
          code: invalidAsset.code,
          issues: expect.arrayContaining(['status', 'metadata.preferredExecutionModes', 'metadata.offerStrength']),
        }),
      ],
    });
  });
});
