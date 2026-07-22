import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

const DEFAULT_ANALYTICS_DAYS = 30;

@Injectable()
export class CustomerWaitingService {
  constructor(private readonly prisma: PrismaService) {}

  async startForReservation(
    storeId: number,
    userId: number | undefined,
    reservationId: number,
    expectedWaitMinutes?: number,
    sourceChannel = 'reservation_check_in',
  ) {
    this.assertStoreId(storeId);
    const reservation = await this.prisma.reservation.findFirst({
      where: { id: reservationId, storeId },
      select: { id: true, customerId: true, status: true, checkedInAt: true },
    });
    if (!reservation) throw new NotFoundException('预约不存在或不属于当前门店');
    if (reservation.status !== 'checked_in' && !reservation.checkedInAt) {
      throw new BadRequestException('客户到店后才能开始等待记录');
    }
    const active = await this.prisma.customerWaitingEpisode.findFirst({
      where: { storeId, reservationId, status: 'waiting' },
      orderBy: { startedAt: 'desc' },
    });
    if (active) {
      if (expectedWaitMinutes !== undefined && active.expectedWaitMinutes !== expectedWaitMinutes) {
        return this.prisma.customerWaitingEpisode.update({
          where: { id: active.id },
          data: { expectedWaitMinutes, recordedByUserId: userId ?? active.recordedByUserId },
        });
      }
      return active;
    }
    return this.prisma.customerWaitingEpisode.create({
      data: {
        storeId,
        reservationId,
        customerId: reservation.customerId,
        expectedWaitMinutes,
        sourceChannel,
        recordedByUserId: userId,
      },
    });
  }

  async markServed(storeId: number, userId: number | undefined, episodeId: number) {
    return this.endEpisode(storeId, userId, episodeId, 'served');
  }

  async markLeft(
    storeId: number,
    userId: number | undefined,
    episodeId: number,
    reasonCode: string,
    reasonNote?: string,
  ) {
    return this.endEpisode(storeId, userId, episodeId, 'left', reasonCode, reasonNote);
  }

  async analytics(storeId: number, query: { startDate?: string; endDate?: string } = {}) {
    this.assertStoreId(storeId);
    const range = this.range(query);
    const [episodes, checkedInReservations] = await Promise.all([
      this.prisma.customerWaitingEpisode.findMany({
        where: { storeId, startedAt: { gte: range.startDate, lte: range.endDate } },
        include: { customer: { select: { id: true, name: true, phone: true } } },
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        take: 20_000,
      }),
      this.prisma.reservation.count({
        where: { storeId, checkedInAt: { gte: range.startDate, lte: range.endDate } },
      }),
    ]);
    const activeWaiting = episodes.filter((item) => item.status === 'waiting');
    const ended = episodes.filter((item) => item.status === 'ended' && item.endedAt);
    const longWaitLeaves = ended.filter(
      (item) => item.outcome === 'left' && item.leaveReasonCode === 'wait_too_long',
    );
    const linkedReservationCount = new Set(
      episodes.map((item) => item.reservationId).filter((value): value is number => Boolean(value)),
    ).size;
    const totalWaitMinutes = ended.reduce((sum, item) => sum + this.waitMinutes(item), 0);
    return {
      range,
      summary: {
        waitingEpisodeCount: episodes.length,
        activeWaitingCount: activeWaiting.length,
        endedWaitingCount: ended.length,
        servedCount: ended.filter((item) => item.outcome === 'served').length,
        leftCount: ended.filter((item) => item.outcome === 'left').length,
        longWaitDepartureCount: longWaitLeaves.length,
        averageWaitMinutes: ended.length ? totalWaitMinutes / ended.length : null,
        checkedInReservationCount: checkedInReservations,
        linkedReservationCount,
        collectionCoverageRate: checkedInReservations > 0 ? linkedReservationCount / checkedInReservations : 0,
      },
      longWaitDepartures: longWaitLeaves.slice(0, 100).map((item) => ({
        id: item.id,
        customerId: item.customerId,
        customerName: item.customer?.name ?? '未关联客户',
        customerPhone: item.customer?.phone ?? null,
        reservationId: item.reservationId,
        startedAt: item.startedAt,
        endedAt: item.endedAt,
        actualWaitMinutes: this.waitMinutes(item),
        expectedWaitMinutes: item.expectedWaitMinutes,
        reasonNote: item.leaveReasonNote,
      })),
      activeWaiting: activeWaiting.slice(0, 100).map((item) => ({
        id: item.id,
        customerId: item.customerId,
        customerName: item.customer?.name ?? '未关联客户',
        customerPhone: item.customer?.phone ?? null,
        reservationId: item.reservationId,
        startedAt: item.startedAt,
        expectedWaitMinutes: item.expectedWaitMinutes,
        actualWaitMinutes: this.waitMinutes(item),
      })),
    };
  }

  private async endEpisode(
    storeId: number,
    userId: number | undefined,
    episodeId: number,
    outcome: 'served' | 'left',
    leaveReasonCode?: string,
    leaveReasonNote?: string,
  ) {
    this.assertStoreId(storeId);
    const episode = await this.prisma.customerWaitingEpisode.findFirst({ where: { id: episodeId, storeId } });
    if (!episode) throw new NotFoundException('等待记录不存在或不属于当前门店');
    if (episode.status !== 'waiting') throw new BadRequestException('等待记录已经结束');
    const endedAt = new Date();
    const actualWaitMinutes = Math.max(0, Math.round((endedAt.getTime() - episode.startedAt.getTime()) / 60_000));
    return this.prisma.customerWaitingEpisode.update({
      where: { id: episode.id },
      data: {
        status: 'ended',
        outcome,
        leaveReasonCode: outcome === 'left' ? leaveReasonCode : null,
        leaveReasonNote: outcome === 'left' ? leaveReasonNote?.trim() || null : null,
        endedAt,
        actualWaitMinutes,
        recordedByUserId: userId ?? episode.recordedByUserId,
      },
    });
  }

  private waitMinutes(item: { actualWaitMinutes: number | null; startedAt: Date; endedAt: Date | null }) {
    if (item.actualWaitMinutes !== null) return item.actualWaitMinutes;
    if (!item.endedAt) return 0;
    return Math.max(0, Math.round((item.endedAt.getTime() - item.startedAt.getTime()) / 60_000));
  }

  private range(query: { startDate?: string; endDate?: string }) {
    const endDate = query.endDate ? new Date(query.endDate) : new Date();
    const startDate = query.startDate ? new Date(query.startDate) : new Date(endDate);
    if (!query.startDate) startDate.setDate(startDate.getDate() - DEFAULT_ANALYTICS_DAYS);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate > endDate) {
      throw new BadRequestException('等待分析时间范围无效');
    }
    return { startDate, endDate };
  }

  private assertStoreId(storeId: number) {
    if (!Number.isInteger(storeId) || storeId < 1) throw new BadRequestException('缺少有效门店上下文');
  }
}
