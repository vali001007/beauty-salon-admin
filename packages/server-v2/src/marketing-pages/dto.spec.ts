import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  CreateMarketingPageDto,
  RecordMarketingPageEventDto,
  SubmitMarketingPageLeadDto,
} from './dto';

function validateDto<T extends object>(DtoClass: new () => T, payload: Record<string, unknown>) {
  return validateSync(plainToInstance(DtoClass, payload), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}

describe('Marketing page DTOs', () => {
  it('accepts a valid marketing page create payload', () => {
    const errors = validateDto(CreateMarketingPageDto, {
      sourceType: 'product',
      sourceId: 101,
      title: '水光护理体验页',
      runtimeType: 'h5',
      pageSchema: { schemaVersion: '1.0', sections: [] },
      shareTitle: '水光护理限时体验',
    });

    expect(errors).toHaveLength(0);
  });

  it('rejects invalid source types and unknown admin fields', () => {
    const errors = validateDto(CreateMarketingPageDto, {
      sourceType: 'internal_model',
      title: '测试页',
      pageSchema: { sections: [] },
      costPrice: 12,
    });

    expect(errors.some((error) => error.property === 'sourceType')).toBe(true);
    expect(errors.some((error) => error.property === 'costPrice')).toBe(true);
  });

  it('accepts public attribution event payloads', () => {
    const errors = validateDto(RecordMarketingPageEventDto, {
      eventType: 'click_cta',
      sessionId: 'session-1',
      channel: 'poster',
      staffId: 8,
      campaignId: 'summer-hydration',
      source: 'wechat',
      medium: 'group',
      metadataJson: { ctaAction: 'book' },
    });

    expect(errors).toHaveLength(0);
  });

  it('rejects unsupported public events and internal identifiers', () => {
    const errors = validateDto(RecordMarketingPageEventDto, {
      eventType: 'delete_page',
      pageId: 1,
      storeId: 8,
    });

    expect(errors.some((error) => error.property === 'eventType')).toBe(true);
    expect(errors.some((error) => error.property === 'pageId')).toBe(true);
    expect(errors.some((error) => error.property === 'storeId')).toBe(true);
  });

  it('accepts local mobile numbers for H5 leads', () => {
    const errors = validateDto(SubmitMarketingPageLeadDto, {
      phone: '13800138000',
      name: '王女士',
      intentType: 'consult',
      channel: 'wechat_group',
    });

    expect(errors).toHaveLength(0);
  });

  it('rejects invalid lead phone numbers and unknown status fields', () => {
    const errors = validateDto(SubmitMarketingPageLeadDto, {
      phone: '12345',
      status: 'contacted',
    });

    expect(errors.some((error) => error.property === 'phone')).toBe(true);
    expect(errors.some((error) => error.property === 'status')).toBe(true);
  });
});
