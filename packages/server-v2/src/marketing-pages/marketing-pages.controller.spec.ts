import { BadRequestException } from '@nestjs/common';
import { MarketingPagesController } from './marketing-pages.controller';

describe('MarketingPagesController store scope', () => {
  const pages = {
    findPages: jest.fn(),
    getAttributionSummary: jest.fn(),
    createPage: jest.fn(),
    getPage: jest.fn(),
    updatePage: jest.fn(),
    publishPage: jest.fn(),
    offlinePage: jest.fn(),
    duplicatePage: jest.fn(),
    getPageEffects: jest.fn(),
    getPageAttribution: jest.fn(),
    getPageEvents: jest.fn(),
    getPageLeads: jest.fn(),
  } as any;
  const controller = new MarketingPagesController(pages);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requires X-Store-Id for admin page reads', () => {
    expect(() => controller.getPage(1, undefined)).toThrow(BadRequestException);
    expect(pages.getPage).not.toHaveBeenCalled();
  });

  it('uses the header store for attribution summary and ignores a query override', async () => {
    pages.getAttributionSummary.mockResolvedValue({ totalAttributions: 0 });

    await controller.getAttributionSummary('6', '99', '2026-07-01', '2026-07-31');

    expect(pages.getAttributionSummary).toHaveBeenCalledWith(6, '2026-07-01', '2026-07-31');
  });

  it('passes the active store to every page management and analytics action', async () => {
    await controller.getPage(8, '6');
    await controller.updatePage(8, { title: '新标题' }, '6');
    await controller.publishPage(8, 91, '6');
    await controller.offlinePage(8, '6');
    await controller.duplicatePage(8, 91, '6');
    await controller.getPageEffects(8, '6');
    await controller.getPageAttribution(8, '6');
    await controller.getPageEvents(8, '6');
    await controller.getPageLeads(8, '6');

    expect(pages.getPage).toHaveBeenCalledWith(8, 6);
    expect(pages.updatePage).toHaveBeenCalledWith(8, { title: '新标题' }, 6);
    expect(pages.publishPage).toHaveBeenCalledWith(8, 6, 91);
    expect(pages.offlinePage).toHaveBeenCalledWith(8, 6);
    expect(pages.duplicatePage).toHaveBeenCalledWith(8, 6, 91);
    expect(pages.getPageEffects).toHaveBeenCalledWith(8, 6);
    expect(pages.getPageAttribution).toHaveBeenCalledWith(8, 6);
    expect(pages.getPageEvents).toHaveBeenCalledWith(8, 6);
    expect(pages.getPageLeads).toHaveBeenCalledWith(8, 6);
  });
});
