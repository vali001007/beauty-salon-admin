import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { TerminalService } from '../terminal/terminal.service.js';

export type MarketingChannel = 'terminal' | 'in_app' | 'sms' | 'wechat';

export type MarketingDeliveryRequest = {
  channel: MarketingChannel;
  storeId: number;
  customerId: number;
  strategyId: number;
  executionId?: number;
  title: string;
  content: string;
};

export type MarketingDeliveryResult = {
  status: 'delivered' | 'failed';
  externalId?: string;
  errorCode?: string;
};

@Injectable()
export class MarketingChannelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly terminalService: TerminalService,
  ) {}

  async deliver(request: MarketingDeliveryRequest): Promise<MarketingDeliveryResult> {
    if (request.channel === 'terminal') {
      const result = await this.terminalService.batchCreateFollowUpTasks(request.storeId, {
        customerId: request.customerId,
        customerIds: [request.customerId],
        source: 'marketing_automation',
        triggerType: 'automation',
        title: request.title,
        script: request.content,
        note: `自动营销策略 ${request.strategyId} 下发`,
        channel: 'terminal',
      });
      const task = result.items?.[0];
      return task ? { status: 'delivered', externalId: String(task.id) } : { status: 'failed', errorCode: 'terminal_task_not_created' };
    }

    if (request.channel === 'in_app') {
      const notification = await (this.prisma as any).marketingInAppNotification.create({
        data: {
          storeId: request.storeId,
          customerId: request.customerId,
          strategyId: request.strategyId,
          executionId: request.executionId ?? null,
          title: request.title,
          content: request.content,
          status: 'delivered',
          deliveredAt: new Date(),
        },
      });
      return { status: 'delivered', externalId: String(notification.id) };
    }

    return { status: 'failed', errorCode: 'channel_not_configured' };
  }
}
