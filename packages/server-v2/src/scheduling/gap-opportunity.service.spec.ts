import { GapOpportunityService } from './gap-opportunity.service';

describe('GapOpportunityService', () => {
  let service: GapOpportunityService;
  let prisma: any;
  let terminalService: { createFollowUpTask: jest.Mock };

  const weekStart = '2099-07-06';
  const opportunity = {
    id: 1,
    storeId: 1,
    date: new Date('2099-07-06T00:00:00.000Z'),
    startTime: '10:00',
    endTime: '11:00',
    beauticianIds: [1],
    projectIds: [100],
    durationMinutes: 60,
    capacity: 1,
    bookedCount: 0,
    availableCapacity: 1,
    source: 'heatmap',
    gapType: 'available_capacity',
    score: 80,
    estimatedRevenue: 398,
    expectedFillRate: 0,
    candidateCount: 0,
    status: 'open',
    confirmationDraftJson: null,
    expiresAt: new Date('2099-07-06T10:00:00.000Z'),
    candidates: [],
  };
  const customer = {
    id: 11,
    storeId: 1,
    name: '李丽丽',
    phone: '13700000000',
    email: null,
    wechat: null,
    totalSpent: 5000,
    visitCount: 8,
    skinType: '干性',
    skinCondition: '缺水',
    healthProfile: { skinType: '干性', skinStatus: '缺水脱皮', mainProblems: '屏障弱', goals: '补水修护', recommendedCare: '补水护理' },
  };
  const candidate = {
    id: 21,
    opportunityId: 1,
    storeId: 1,
    customerId: 11,
    customer,
    project: { id: 100, name: '深层补水护理', price: 398 },
    projectId: 100,
    score: 92,
    expectedFillRate: 0.92,
    estimatedRevenue: 398,
    recommendedChannel: 'phone',
    messageDraft: '确认草稿',
    reasonJson: ['复购分高'],
    riskJson: [],
    scoreBreakdown: { repurchaseScore: 90 },
    status: 'candidate',
  };

  beforeEach(() => {
    prisma = {
      schedule: { findMany: jest.fn().mockResolvedValue([{ beauticianId: 1, date: new Date('2099-07-06T00:00:00.000Z'), startTime: '10:00', endTime: '11:00', status: 'available' }]) },
      reservation: { findMany: jest.fn().mockResolvedValue([]) },
      project: { findMany: jest.fn().mockResolvedValue([{ id: 100, name: '深层补水护理', price: 398, duration: 60, careCycleWeeks: 4, treatmentCourseTimes: 6 }]) },
      beautician: { findMany: jest.fn().mockResolvedValue([{ id: 1, name: '宋乔', userId: 301, status: 'active' }]) },
      customer: { findMany: jest.fn().mockResolvedValue([customer]) },
      beauticianTimeOff: { findMany: jest.fn().mockResolvedValue([]) },
      customerAppIdentity: { findMany: jest.fn().mockResolvedValue([]) },
      customerPredictionSnapshot: {
        findMany: jest.fn().mockResolvedValue([
          { customerId: 11, repurchase30dScore: 95, marketingResponseScore: 90, ltvTier: '高', createdAt: new Date() },
        ]),
      },
      marketingAutomationTouch: { findMany: jest.fn().mockResolvedValue([]) },
      terminalFollowUpTask: { findMany: jest.fn().mockResolvedValue([]) },
      customerCard: {
        findMany: jest.fn().mockResolvedValue([
          { customerId: 11, cardName: '深层补水护理卡', totalTimes: 6, remainingTimes: 3, expiryDate: new Date('2099-08-01'), recognizedUnitValue: 398 },
        ]),
      },
      appointmentGapOpportunity: {
        upsert: jest.fn().mockResolvedValue(opportunity),
        findMany: jest.fn().mockResolvedValue([{ ...opportunity, candidateCount: 1, candidates: [candidate] }]),
        findFirst: jest.fn().mockResolvedValue({ ...opportunity, candidates: [candidate] }),
        update: jest.fn().mockResolvedValue(opportunity),
      },
      appointmentGapCandidate: {
        upsert: jest.fn().mockResolvedValue(candidate),
        findMany: jest.fn().mockResolvedValue([candidate]),
        update: jest.fn().mockResolvedValue({ ...candidate, status: 'task_created', followUpTaskId: 88 }),
      },
      appointmentGapOpportunityEvent: {
        create: jest.fn().mockResolvedValue({ id: 1 }),
      },
    };
    terminalService = { createFollowUpTask: jest.fn().mockResolvedValue({ id: 88, status: 'pending' }) };
    service = new GapOpportunityService(prisma, terminalService as any);
  });

  it('generates opportunity when schedule has available capacity', async () => {
    const result = await service.list({ storeId: 1, weekStart });

    expect(prisma.appointmentGapOpportunity.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          storeId: 1,
          startTime: '10:00',
          endTime: '11:00',
          capacity: 1,
          availableCapacity: 1,
        }),
      }),
    );
    expect(result.summary.opportunityCount).toBe(1);
    expect(result.opportunities[0].candidateCount).toBe(1);
  });

  it('does not generate opportunity when slot is fully booked', async () => {
    prisma.reservation.findMany.mockResolvedValueOnce([
      { id: 1000, customerId: 33, beauticianId: 1, date: new Date('2099-07-06T00:00:00.000Z'), startTime: '10:00', endTime: '11:00' },
    ]);
    prisma.appointmentGapOpportunity.findMany.mockResolvedValue([]);

    const result = await service.list({ storeId: 1, weekStart });

    expect(prisma.appointmentGapOpportunity.upsert).not.toHaveBeenCalled();
    expect(result.summary.opportunityCount).toBe(0);
  });

  it('excludes future reservation customers and ranks candidates by prediction and card signals', async () => {
    prisma.appointmentGapOpportunity.findFirst.mockResolvedValue(opportunity);
    prisma.customer.findMany.mockResolvedValue([
      customer,
      { id: 12, storeId: 1, name: '王路', phone: '13800000000', totalSpent: 100, visitCount: 1 },
    ]);
    prisma.reservation.findMany.mockResolvedValueOnce([{ customerId: 12 }]).mockResolvedValueOnce([
      { customerId: 11, projectId: 100, beauticianId: 1, date: new Date('2099-06-01T00:00:00.000Z'), startTime: '10:30' },
    ]);

    const result = await service.refreshCandidates(1, 1, { limit: 3 });

    expect(prisma.appointmentGapCandidate.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.appointmentGapCandidate.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ customerId: 11, score: expect.any(Number) }),
      }),
    );
    expect(result[0].customerId).toBe(11);
  });

  it('uses care cycle, treatment progress, skin fit and period preference in candidate reasons', async () => {
    prisma.appointmentGapOpportunity.findFirst.mockResolvedValue(opportunity);
    prisma.reservation.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { customerId: 11, projectId: 100, beauticianId: 1, date: new Date('2099-06-01T00:00:00.000Z'), startTime: '10:30' },
    ]);

    await service.refreshCandidates(1, 1, { limit: 3 });

    const createPayload = prisma.appointmentGapCandidate.upsert.mock.calls[0][0].create;
    expect(createPayload.projectId).toBe(100);
    expect(createPayload.scoreBreakdown).toEqual(
      expect.objectContaining({
        timeFitScore: expect.any(Number),
        careCycleDueScore: 100,
        treatmentProgressScore: expect.any(Number),
        skinFitScore: expect.any(Number),
        preferredBeauticianId: 1,
        preferredBeauticianUserId: 301,
        preferredBeauticianName: '宋乔',
      }),
    );
    expect(createPayload.reasonJson.slice(0, 3).join(' ')).toContain('护理周期');
    expect(createPayload.reasonJson.slice(0, 3).join(' ')).toContain('疗程建议6次');
    expect(createPayload.reasonJson.join(' ')).toContain('周一上午');
    expect(createPayload.reasonJson.join(' ')).toContain('护理周期');
    expect(createPayload.reasonJson.join(' ')).toContain('疗程建议6次');
    expect(createPayload.reasonJson.join(' ')).toContain('缺水/干性护理诉求');
  });

  it('creates follow-up task from selected candidate and marks candidate as task created', async () => {
    const result = await service.createFollowUpTasks(1, 1, { candidateIds: [21], assigneeRole: 'manager', assigneeBeauticianId: 1, createdById: 7 });

    expect(terminalService.createFollowUpTask).toHaveBeenCalledWith(
      1,
      undefined,
      expect.objectContaining({
        customerId: 11,
        source: 'gap_fill',
        triggerType: 'appointment_gap',
        sourceRecommendationKey: 'gap:1:11',
        assigneeRole: 'consultant',
        assigneeBeauticianId: 1,
      }),
      7,
    );
    expect(prisma.appointmentGapCandidate.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'task_created', followUpTaskId: 88 }) }),
    );
    expect(result.items[0].task.id).toBe(88);
  });

  it('creates confirmation draft without sending message', async () => {
    const result = await service.createConfirmationDraft(1, 1, { candidateId: 21, channel: 'sms' });

    expect(terminalService.createFollowUpTask).not.toHaveBeenCalled();
    expect(prisma.appointmentGapOpportunity.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          confirmationDraftJson: expect.objectContaining({ sent: false, status: 'draft' }),
        }),
      }),
    );
    expect(result.sent).toBe(false);
    expect(result.status).toBe('draft');
  });

  it('creates personalized benefit draft without sending message', async () => {
    const result = await service.createBenefitDraft(1, 1, { candidateId: 21, channel: 'sms' });

    expect(terminalService.createFollowUpTask).not.toHaveBeenCalled();
    expect(prisma.appointmentGapOpportunityEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'benefit_draft_created',
          candidateId: 21,
          customerId: 11,
        }),
      }),
    );
    expect(result.sent).toBe(false);
    expect(result.status).toBe('draft');
    expect(result.copy).toContain('权益草稿');
    expect(result.link).toContain('opportunityId=1');
  });
});
