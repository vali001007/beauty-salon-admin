import { CustomerAppService } from './customer-app.service';

describe('CustomerAppService promotion attribution', () => {
  let service: CustomerAppService;
  let prisma: jest.Mocked<any>;
  let reservationsService: { recoverIdempotentCreate: jest.Mock; createIdempotent: jest.Mock };

  const user = {
    sub: 'customer-app:1',
    openid: 'openid-1',
    identityId: 1,
    customerId: 10,
    storeId: 1,
  };

  const customer = {
    id: 10,
    storeId: 1,
    name: '周梦瑶',
    phone: '13800000001',
    store: { id: 1, name: 'Ami 门店' },
    healthProfile: null,
  };

  beforeEach(() => {
    prisma = {
      customer: {
        findFirst: jest.fn().mockResolvedValue(customer),
        update: jest.fn(),
      },
      customerAppIdentity: {
        upsert: jest.fn(),
      },
      promotion: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      customerAppEvent: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      customerBehaviorEvent: {
        create: jest.fn(),
      },
      marketingInAppNotification: {
        findMany: jest.fn(),
        count: jest.fn(),
        updateMany: jest.fn(),
        findFirst: jest.fn(),
      },
      marketingDeliveryJob: {
        findFirst: jest.fn(),
      },
      marketingAutomationTouch: {
        updateMany: jest.fn(),
      },
      project: {
        findFirst: jest.fn(),
      },
      beautician: {
        findFirst: jest.fn(),
      },
      reservation: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
      beauticianTimeOff: {
        findMany: jest.fn(),
      },
      schedulingRuleConfig: {
        findFirst: jest.fn(),
      },
    };

    reservationsService = {
      recoverIdempotentCreate: jest.fn().mockResolvedValue(undefined),
      createIdempotent: jest.fn(async (data: any) => ({
        replayed: false,
        reservation: await prisma.reservation.create({
          data,
          include: { store: true, customer: true, project: true, beautician: true },
        }),
      })),
    };
    service = new CustomerAppService(prisma as any, {} as any, {} as any, undefined, undefined, reservationsService as any);
  });

  it('lists only notifications delivered to the current customer and store', async () => {
    prisma.marketingInAppNotification.findMany.mockResolvedValue([
      {
        id: 51,
        storeId: 1,
        customerId: 10,
        title: '护理提醒',
        content: '您的护理权益即将到期',
        status: 'delivered',
        deliveredAt: new Date('2026-07-14T08:00:00.000Z'),
        openedAt: null,
        createdAt: new Date('2026-07-14T08:00:00.000Z'),
      },
    ]);
    prisma.marketingInAppNotification.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1);

    const result = await service.getMyNotifications(user, { page: 1, pageSize: 20 });

    expect(prisma.marketingInAppNotification.findMany).toHaveBeenCalledWith({
      where: { storeId: 1, customerId: 10, status: { in: ['delivered', 'opened', 'clicked', 'converted'] } },
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 20,
    });
    expect(result).toEqual(expect.objectContaining({
      total: 1,
      unreadCount: 1,
      page: 1,
      pageSize: 20,
      items: [expect.objectContaining({ id: 51, status: 'delivered' })],
    }));
  });

  it('opens a notification only inside the authenticated customer scope', async () => {
    const factService = { recordFact: jest.fn().mockResolvedValue({ id: 901 }) };
    service = new CustomerAppService(
      prisma as any,
      {} as any,
      {} as any,
      factService as any,
      { effectFactWrite: true } as any,
    );
    prisma.marketingInAppNotification.updateMany.mockResolvedValue({ count: 1 });
    prisma.marketingInAppNotification.findFirst
      .mockResolvedValueOnce({
        id: 51,
        deliveryJobId: 71,
        storeId: 1,
        customerId: 10,
        title: '护理提醒',
        content: '您的护理权益即将到期',
        status: 'delivered',
        deliveredAt: new Date('2026-07-14T08:00:00.000Z'),
        openedAt: null,
        createdAt: new Date('2026-07-14T08:00:00.000Z'),
      })
      .mockResolvedValueOnce({
        id: 51,
        deliveryJobId: 71,
        storeId: 1,
        customerId: 10,
        title: '护理提醒',
        content: '您的护理权益即将到期',
        status: 'opened',
        deliveredAt: new Date('2026-07-14T08:00:00.000Z'),
        openedAt: new Date('2026-07-14T09:00:00.000Z'),
        createdAt: new Date('2026-07-14T08:00:00.000Z'),
      });
    prisma.marketingDeliveryJob.findFirst.mockResolvedValue({
      id: 71,
      storeId: 1,
      customerId: 10,
      strategyId: 81,
      executionId: 91,
      touchId: 101,
      channel: 'in_app',
      strategy: {
        recommendationInstanceId: 'recommendation-instance-1',
        adoptionId: 111,
        actions: [{ promotionId: 31 }],
      },
    });
    prisma.marketingAutomationTouch.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.openMyNotification(user, 51);

    expect(prisma.marketingInAppNotification.findFirst).toHaveBeenNthCalledWith(1, {
      where: {
        id: 51,
        storeId: 1,
        customerId: 10,
        status: { in: ['delivered', 'opened', 'clicked', 'converted'] },
      },
    });
    expect(prisma.marketingInAppNotification.updateMany).toHaveBeenCalledWith({
      where: { id: 51, storeId: 1, customerId: 10, status: 'delivered' },
      data: { status: 'opened', openedAt: expect.any(Date) },
    });
    expect(prisma.marketingDeliveryJob.findFirst).toHaveBeenCalledWith({
      where: { id: 71, storeId: 1, customerId: 10, channel: 'in_app' },
      include: { strategy: { select: { recommendationInstanceId: true, adoptionId: true, actions: true } } },
    });
    expect(prisma.marketingAutomationTouch.updateMany).toHaveBeenCalledWith({
      where: { id: 101, status: { in: ['sent', 'delivered'] } },
      data: { status: 'opened' },
    });
    expect(factService.recordFact).toHaveBeenCalledWith(expect.objectContaining({
      storeId: 1,
      factType: 'open',
      metricSource: 'actual',
      sourceSystem: 'customer_app_in_app_notification',
      sourceEventId: 'notification:51',
      countValue: 1,
      dimensions: {
        recommendationInstanceId: 'recommendation-instance-1',
        adoptionId: 111,
        strategyId: 81,
        executionId: 91,
        touchId: 101,
        deliveryJobId: 71,
        promotionId: 31,
        customerId: 10,
        channel: 'in_app',
      },
      metadata: { status: 'opened', notificationId: 51 },
      occurredAt: expect.any(Date),
    }));
    expect(result).toEqual(expect.objectContaining({ id: 51, status: 'opened' }));
  });

  it('does not emit duplicate open effects when a notification was already opened', async () => {
    const factService = { recordFact: jest.fn() };
    service = new CustomerAppService(
      prisma as any,
      {} as any,
      {} as any,
      factService as any,
      { effectFactWrite: true } as any,
    );
    prisma.marketingInAppNotification.findFirst.mockResolvedValue({
      id: 51,
      deliveryJobId: 71,
      storeId: 1,
      customerId: 10,
      title: '护理提醒',
      content: '您的护理权益即将到期',
      status: 'opened',
      deliveredAt: new Date('2026-07-14T08:00:00.000Z'),
      openedAt: new Date('2026-07-14T09:00:00.000Z'),
      createdAt: new Date('2026-07-14T08:00:00.000Z'),
    });

    await service.openMyNotification(user, 51);

    expect(prisma.marketingInAppNotification.updateMany).not.toHaveBeenCalled();
    expect(prisma.marketingDeliveryJob.findFirst).not.toHaveBeenCalled();
    expect(prisma.marketingAutomationTouch.updateMany).not.toHaveBeenCalled();
    expect(factService.recordFact).not.toHaveBeenCalled();
  });

  it('lists only notifications delivered to the current customer and store', async () => {
    prisma.marketingInAppNotification.findMany.mockResolvedValue([
      {
        id: 51,
        storeId: 1,
        customerId: 10,
        title: '护理提醒',
        content: '您的护理权益即将到期',
        status: 'delivered',
        deliveredAt: new Date('2026-07-14T08:00:00.000Z'),
        openedAt: null,
        createdAt: new Date('2026-07-14T08:00:00.000Z'),
      },
    ]);
    prisma.marketingInAppNotification.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1);

    const result = await service.getMyNotifications(user, { page: 1, pageSize: 20 });

    expect(prisma.marketingInAppNotification.findMany).toHaveBeenCalledWith({
      where: { storeId: 1, customerId: 10, status: { in: ['delivered', 'opened', 'clicked', 'converted'] } },
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 20,
    });
    expect(result).toEqual(expect.objectContaining({
      total: 1,
      unreadCount: 1,
      page: 1,
      pageSize: 20,
      items: [expect.objectContaining({ id: 51, status: 'delivered' })],
    }));
  });

  it('opens a notification only inside the authenticated customer scope', async () => {
    const factService = { recordFact: jest.fn().mockResolvedValue({ id: 901 }) };
    service = new CustomerAppService(
      prisma as any,
      {} as any,
      {} as any,
      factService as any,
      { effectFactWrite: true } as any,
    );
    prisma.marketingInAppNotification.updateMany.mockResolvedValue({ count: 1 });
    prisma.marketingInAppNotification.findFirst
      .mockResolvedValueOnce({
        id: 51,
        deliveryJobId: 71,
        storeId: 1,
        customerId: 10,
        title: '护理提醒',
        content: '您的护理权益即将到期',
        status: 'delivered',
        deliveredAt: new Date('2026-07-14T08:00:00.000Z'),
        openedAt: null,
        createdAt: new Date('2026-07-14T08:00:00.000Z'),
      })
      .mockResolvedValueOnce({
        id: 51,
        deliveryJobId: 71,
        storeId: 1,
        customerId: 10,
        title: '护理提醒',
        content: '您的护理权益即将到期',
        status: 'opened',
        deliveredAt: new Date('2026-07-14T08:00:00.000Z'),
        openedAt: new Date('2026-07-14T09:00:00.000Z'),
        createdAt: new Date('2026-07-14T08:00:00.000Z'),
      });
    prisma.marketingDeliveryJob.findFirst.mockResolvedValue({
      id: 71,
      storeId: 1,
      customerId: 10,
      strategyId: 81,
      executionId: 91,
      touchId: 101,
      channel: 'in_app',
      strategy: {
        recommendationInstanceId: 'recommendation-instance-1',
        adoptionId: 111,
        actions: [{ promotionId: 31 }],
      },
    });
    prisma.marketingAutomationTouch.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.openMyNotification(user, 51);

    expect(prisma.marketingInAppNotification.findFirst).toHaveBeenNthCalledWith(1, {
      where: {
        id: 51,
        storeId: 1,
        customerId: 10,
        status: { in: ['delivered', 'opened', 'clicked', 'converted'] },
      },
    });
    expect(prisma.marketingInAppNotification.updateMany).toHaveBeenCalledWith({
      where: { id: 51, storeId: 1, customerId: 10, status: 'delivered' },
      data: { status: 'opened', openedAt: expect.any(Date) },
    });
    expect(prisma.marketingDeliveryJob.findFirst).toHaveBeenCalledWith({
      where: { id: 71, storeId: 1, customerId: 10, channel: 'in_app' },
      include: { strategy: { select: { recommendationInstanceId: true, adoptionId: true, actions: true } } },
    });
    expect(prisma.marketingAutomationTouch.updateMany).toHaveBeenCalledWith({
      where: { id: 101, status: { in: ['sent', 'delivered'] } },
      data: { status: 'opened' },
    });
    expect(factService.recordFact).toHaveBeenCalledWith(expect.objectContaining({
      storeId: 1,
      factType: 'open',
      metricSource: 'actual',
      sourceSystem: 'customer_app_in_app_notification',
      sourceEventId: 'notification:51',
      countValue: 1,
      dimensions: {
        recommendationInstanceId: 'recommendation-instance-1',
        adoptionId: 111,
        strategyId: 81,
        executionId: 91,
        touchId: 101,
        deliveryJobId: 71,
        promotionId: 31,
        customerId: 10,
        channel: 'in_app',
      },
      metadata: { status: 'opened', notificationId: 51 },
      occurredAt: expect.any(Date),
    }));
    expect(result).toEqual(expect.objectContaining({ id: 51, status: 'opened' }));
  });

  it('does not emit duplicate open effects when a notification was already opened', async () => {
    const factService = { recordFact: jest.fn() };
    service = new CustomerAppService(
      prisma as any,
      {} as any,
      {} as any,
      factService as any,
      { effectFactWrite: true } as any,
    );
    prisma.marketingInAppNotification.findFirst.mockResolvedValue({
      id: 51,
      deliveryJobId: 71,
      storeId: 1,
      customerId: 10,
      title: '护理提醒',
      content: '您的护理权益即将到期',
      status: 'opened',
      deliveredAt: new Date('2026-07-14T08:00:00.000Z'),
      openedAt: new Date('2026-07-14T09:00:00.000Z'),
      createdAt: new Date('2026-07-14T08:00:00.000Z'),
    });

    await service.openMyNotification(user, 51);

    expect(prisma.marketingInAppNotification.updateMany).not.toHaveBeenCalled();
    expect(prisma.marketingDeliveryJob.findFirst).not.toHaveBeenCalled();
    expect(prisma.marketingAutomationTouch.updateMany).not.toHaveBeenCalled();
    expect(factService.recordFact).not.toHaveBeenCalled();
  });

  it('creates an H5 guest token without using wechat login code', async () => {
    const signAsync = jest.fn().mockResolvedValue('signed-h5-token');
    service = new CustomerAppService(prisma as any, { signAsync } as any, {} as any);
    prisma.customerAppIdentity.upsert.mockResolvedValue({
      id: 101,
      storeId: 1,
      openid: 'h5_c2Vzc2lvbi0x',
      nickname: 'H5客户',
      avatarUrl: null,
      customer: null,
    });

    const result = await service.h5Guest({ sessionId: 'session-1', storeId: 1 });

    expect(prisma.customerAppIdentity.upsert).toHaveBeenCalledWith({
      where: { storeId_openid: { storeId: 1, openid: 'h5_c2Vzc2lvbi0x' } },
      create: expect.objectContaining({
        storeId: 1,
        openid: 'h5_c2Vzc2lvbi0x',
        bindStatus: 'unbound',
        source: 'ami_glow_h5',
      }),
      update: expect.objectContaining({
        source: 'ami_glow_h5',
      }),
      include: { customer: { include: { store: true, healthProfile: true } } },
    });
    expect(signAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: 'ami_glow:h5_c2Vzc2lvbi0x',
        openid: 'h5_c2Vzc2lvbi0x',
        identityId: 101,
        storeId: 1,
      }),
      { expiresIn: '30d' },
    );
    expect(result).toMatchObject({
      token: 'signed-h5-token',
      bindStatus: 'unbound',
      customer: null,
    });
  });

  it('records promotion claim events and increments issue count', async () => {
    const promotion = {
      id: 31,
      name: '护理周期预约券',
      description: '到店护理可用',
      discountText: '预约到店礼',
      type: 'service_gift',
      source: 'system',
      scenario: 'care_cycle_due',
      approvalStatus: 'approved',
      validDays: 14,
      maxIssueCount: 100,
      issuedCount: 3,
      usedCount: 1,
      applicableProjectIds: [],
      startAt: null,
      endAt: null,
    };
    prisma.promotion.findFirst.mockResolvedValue(promotion);
    prisma.customerAppEvent.findFirst.mockResolvedValue(null);
    prisma.promotion.update.mockResolvedValue({ ...promotion, issuedCount: 4 });
    prisma.customerAppEvent.create.mockImplementation(async ({ data }: any) => ({ id: 1, ...data }));

    const result = await service.claimPromotion(user, 31, { channel: 'miniapp', sessionId: 's1' });

    expect(prisma.promotion.update).toHaveBeenCalledWith({
      where: { id: 31 },
      data: { issuedCount: { increment: 1 } },
    });
    expect(prisma.customerAppEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        customerId: 10,
        storeId: 1,
        eventType: 'promotion_claimed',
        channel: 'miniapp',
        sessionId: 's1',
        targetType: 'promotion',
        targetId: '31',
        metadataJson: expect.objectContaining({
          source: 'ami_glow',
          channel: 'miniapp',
          openid: 'openid-1',
          payload: expect.objectContaining({
            promotionName: '护理周期预约券',
            discountText: '预约到店礼',
            validDays: 14,
          }),
        }),
      }),
    });
    expect(prisma.customerBehaviorEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        customerId: 10,
        storeId: 1,
        eventType: 'promotion_claimed',
        targetType: 'promotion',
        targetId: '31',
        metadataJson: expect.objectContaining({
          payload: expect.objectContaining({
            promotionName: '护理周期预约券',
            discountText: '预约到店礼',
          }),
        }),
      }),
    });
    expect(result).toMatchObject({
      success: true,
      promotion: expect.objectContaining({ id: 31, issuedCount: 4 }),
    });
  });

  it('preserves H5 source when recording anonymous events', async () => {
    const facts = { recordFact: jest.fn().mockResolvedValue({ id: 1 }) };
    service = new CustomerAppService(prisma as any, {} as any, {} as any, facts as any, { effectFactWrite: true } as any);
    prisma.customerAppEvent.create.mockImplementation(async ({ data }: any) => ({ id: 1, ...data }));

    await service.recordEvent(undefined, {
      eventType: 'h5_view_home',
      storeId: 1,
      sessionId: 'h5-session-1',
      channel: 'h5',
      source: 'ami_glow_h5',
      targetType: 'home',
      targetId: '1',
      payload: { campaignId: 'c1' },
    });

    expect(prisma.customerAppEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storeId: 1,
        customerId: undefined,
        sessionId: 'h5-session-1',
        eventType: 'h5_view_home',
        channel: 'h5',
        source: 'ami_glow_h5',
        targetType: 'home',
        targetId: '1',
        metadataJson: expect.objectContaining({
          source: 'ami_glow_h5',
          channel: 'h5',
          payload: expect.objectContaining({ campaignId: 'c1' }),
        }),
      }),
    });
    expect(prisma.customerBehaviorEvent.create).not.toHaveBeenCalled();
    expect(facts.recordFact).toHaveBeenCalledWith(expect.objectContaining({
      factType: 'open',
      sourceEventId: 'event:1',
      dimensions: expect.objectContaining({ channel: 'h5' }),
    }));
  });

  it('records promotion_reserved when reservation carries a promotion', async () => {
    prisma.project.findFirst.mockResolvedValue({ id: 7, storeId: 1, status: 'active', duration: 60 });
    prisma.schedulingRuleConfig.findFirst.mockResolvedValue({ businessStartTime: '09:00', businessEndTime: '20:00' });
    prisma.reservation.findMany.mockResolvedValue([]);
    prisma.beauticianTimeOff.findMany.mockResolvedValue([]);
    prisma.reservation.create.mockResolvedValue({
      id: 88,
      storeId: 1,
      customerId: 10,
      projectId: 7,
      beauticianId: null,
      date: new Date('2026-06-20T10:00:00.000Z'),
      startTime: '10:00',
      endTime: '11:00',
      status: 'pending',
      remark: '来源：Ami Glow；渠道：miniapp；活动ID：31',
      store: { id: 1, name: 'Ami 门店' },
      customer,
      project: { id: 7, name: '深层补水护理', duration: 60 },
      beautician: null,
    });
    prisma.customerAppEvent.create.mockImplementation(async ({ data }: any) => ({ id: 1, ...data }));

    const result = await service.createReservation(user as any, {
      storeId: 1,
      projectId: 7,
      date: '2026-06-20',
      startTime: '10:00',
      channel: 'miniapp',
      promotionId: 31,
    } as any);

    expect(result).toMatchObject({ id: 88, status: 'pending' });
    expect(prisma.customerAppEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        customerId: 10,
        storeId: 1,
        eventType: 'miniapp_reservation_success',
        channel: 'miniapp',
        targetType: 'project',
        targetId: '7',
        metadataJson: expect.objectContaining({
          source: 'ami_glow',
          channel: 'miniapp',
          openid: 'openid-1',
          payload: expect.objectContaining({ reservationId: 88, promotionId: 31 }),
        }),
      }),
    });
    expect(prisma.customerAppEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        customerId: 10,
        storeId: 1,
        eventType: 'promotion_reserved',
        channel: 'miniapp',
        targetType: 'promotion',
        targetId: '31',
        metadataJson: expect.objectContaining({
          source: 'ami_glow',
          channel: 'miniapp',
          openid: 'openid-1',
          payload: expect.objectContaining({ reservationId: 88, projectId: 7 }),
        }),
      }),
    });
    expect(prisma.customerBehaviorEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        customerId: 10,
        storeId: 1,
        eventType: 'promotion_reserved',
        targetType: 'promotion',
        targetId: '31',
        metadataJson: expect.objectContaining({
          payload: expect.objectContaining({ reservationId: 88, projectId: 7 }),
        }),
      }),
    });
  });

  it('returns an existing idempotent reservation before availability checks and does not duplicate events', async () => {
    reservationsService.recoverIdempotentCreate.mockResolvedValue({
      replayed: true,
      reservation: { id: 88, storeId: 1, customerId: 10, projectId: 7, status: 'pending' },
    });

    const result = await service.createReservation(user as any, {
      storeId: 1,
      projectId: 7,
      date: '2026-06-20',
      startTime: '10:00',
      idempotencyKey: 'ami-glow-replay-88',
    } as any);

    expect(result).toMatchObject({ id: 88 });
    expect(reservationsService.createIdempotent).not.toHaveBeenCalled();
    expect(prisma.project.findFirst).not.toHaveBeenCalled();
    expect(prisma.customerAppEvent.create).not.toHaveBeenCalled();
  });

  it('preserves H5 source when reservation carries a promotion', async () => {
    prisma.project.findFirst.mockResolvedValue({ id: 7, storeId: 1, status: 'active', duration: 60 });
    prisma.schedulingRuleConfig.findFirst.mockResolvedValue({ businessStartTime: '09:00', businessEndTime: '20:00' });
    prisma.reservation.findMany.mockResolvedValue([]);
    prisma.beauticianTimeOff.findMany.mockResolvedValue([]);
    prisma.reservation.create.mockResolvedValue({
      id: 89,
      storeId: 1,
      customerId: 10,
      projectId: 7,
      beauticianId: null,
      date: new Date('2026-06-20T10:00:00.000Z'),
      startTime: '10:00',
      endTime: '11:00',
      status: 'pending',
      remark: '来源：Ami Glow；渠道：h5_project_detail；活动ID：31',
      store: { id: 1, name: 'Ami 门店' },
      customer,
      project: { id: 7, name: '深层补水护理', duration: 60 },
      beautician: null,
    });
    prisma.customerAppEvent.create.mockImplementation(async ({ data }: any) => ({ id: 1, ...data }));

    await service.createReservation(user as any, {
      storeId: 1,
      projectId: 7,
      date: '2026-06-20',
      startTime: '10:00',
      channel: 'h5_project_detail',
      source: 'ami_glow_h5',
      campaignId: 'summer-care',
      staffId: 12,
      promotionId: 31,
    } as any);

    expect(prisma.reservation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          remark: expect.stringContaining('来源：Ami Glow H5'),
        }),
      }),
    );
    expect(prisma.reservation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          remark: expect.stringContaining('Campaign：summer-care'),
        }),
      }),
    );
    expect(prisma.reservation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          remark: expect.stringContaining('员工ID：12'),
        }),
      }),
    );
    expect(prisma.customerAppEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'miniapp_reservation_success',
        channel: 'h5_project_detail',
        source: 'ami_glow_h5',
        metadataJson: expect.objectContaining({
          source: 'ami_glow_h5',
          channel: 'h5_project_detail',
        }),
      }),
    });
    expect(prisma.customerAppEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'promotion_reserved',
        channel: 'h5_project_detail',
        source: 'ami_glow_h5',
        metadataJson: expect.objectContaining({
          source: 'ami_glow_h5',
          channel: 'h5_project_detail',
        }),
      }),
    });
  });
});
