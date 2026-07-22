import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { TerminalService } from '../terminal/terminal.service.js';

export type MarketingChannel = 'terminal' | 'in_app' | 'sms' | 'wechat';

export type MarketingDeliveryRequest = {
  channel: MarketingChannel;
  storeId: number;
  customerId: number;
  strategyId: number;
  executionId?: number;
  deliveryJobId?: number;
  touchId?: number;
  recommendationInstanceId?: string | null;
  adoptionId?: number | null;
  assigneeRole?: 'manager' | 'consultant' | 'reception';
  assigneeUserId?: number;
  assigneeBeauticianId?: number;
  title: string;
  content: string;
};

export type MarketingDeliveryResult = {
  status: 'delivered' | 'failed';
  externalId?: string;
  errorCode?: string;
  duplicated?: boolean;
};

@Injectable()
export class MarketingChannelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly terminalService: TerminalService,
  ) {}

  async deliverBatch(requests: MarketingDeliveryRequest[]): Promise<MarketingDeliveryResult[]> {
    if (requests.length === 0) return [];
    if (requests.some((request) => request.channel !== 'in_app' || !request.deliveryJobId)) {
      return Promise.all(requests.map((request) => this.deliver(request)));
    }
    const now = new Date();
    const values = Prisma.join(
      requests.map(
        (request) => Prisma.sql`(
      ${Number(request.deliveryJobId)},
      ${Number(request.storeId)},
      ${Number(request.customerId)},
      ${Number(request.strategyId)},
      ${request.executionId ? Number(request.executionId) : null},
      ${String(request.title)},
      ${String(request.content)},
      'delivered',
      ${now},
      ${now},
      ${now}
    )`,
      ),
    );
    const notifications = await this.prisma.$queryRaw<Array<{ deliveryJobId: number; id: number }>>(Prisma.sql`
      INSERT INTO "MarketingInAppNotification" (
        "deliveryJobId", "storeId", "customerId", "strategyId", "executionId",
        "title", "content", "status", "deliveredAt", "createdAt", "updatedAt"
      )
      VALUES ${values}
      ON CONFLICT ("deliveryJobId") DO UPDATE
        SET "deliveryJobId" = EXCLUDED."deliveryJobId"
      RETURNING "deliveryJobId", "id"
    `);
    const notificationByJobId = new Map(
      notifications.map((notification) => [Number(notification.deliveryJobId), String(notification.id)]),
    );
    return requests.map((request) => {
      const externalId = notificationByJobId.get(Number(request.deliveryJobId));
      return externalId
        ? { status: 'delivered', externalId }
        : { status: 'failed', errorCode: 'in_app_notification_not_created' };
    });
  }

  async deliver(request: MarketingDeliveryRequest): Promise<MarketingDeliveryResult> {
    if (request.channel === 'terminal') {
      const result = await this.terminalService.batchCreateFollowUpTasks(request.storeId, {
        customerId: request.customerId,
        customerIds: [request.customerId],
        source: 'marketing_automation',
        sourceRecommendationKey: request.deliveryJobId ? `delivery-job:${request.deliveryJobId}` : undefined,
        recommendationInstanceId: request.recommendationInstanceId ?? undefined,
        adoptionId: request.adoptionId ?? undefined,
        assigneeRole: request.assigneeRole,
        assigneeUserId: request.assigneeUserId,
        assigneeBeauticianId: request.assigneeBeauticianId,
        attribution: {
          strategyId: request.strategyId,
          executionId: request.executionId,
          deliveryJobId: request.deliveryJobId,
          touchId: request.touchId,
        },
        triggerType: 'automation',
        title: request.title,
        script: request.content,
        note: `自动营销策略 ${request.strategyId} 下发`,
        channel: 'terminal',
      });
      const task = result.items?.[0];
      return task
        ? { status: 'delivered', externalId: String(task.id), ...(task.duplicated ? { duplicated: true } : {}) }
        : { status: 'failed', errorCode: 'terminal_task_not_created' };
    }

    if (request.channel === 'in_app') {
      const data = {
        deliveryJobId: request.deliveryJobId ?? null,
        storeId: request.storeId,
        customerId: request.customerId,
        strategyId: request.strategyId,
        executionId: request.executionId ?? null,
        title: request.title,
        content: request.content,
        status: 'delivered',
        deliveredAt: new Date(),
      };
      const notification = request.deliveryJobId
        ? await (this.prisma as any).marketingInAppNotification.upsert({
            where: { deliveryJobId: request.deliveryJobId },
            create: data,
            update: {},
          })
        : await (this.prisma as any).marketingInAppNotification.create({ data });
      return { status: 'delivered', externalId: String(notification.id) };
    }

    return { status: 'failed', errorCode: 'channel_not_configured' };
  }
}
