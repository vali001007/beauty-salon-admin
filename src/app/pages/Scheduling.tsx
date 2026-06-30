import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, ClipboardList, ChevronLeft, ChevronRight, Gift, Loader2, MessageSquare, RotateCcw, Save, Sparkles, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { getBeauticians } from '@/api/beautician';
import {
  getSmartSchedulingRuns,
  getSchedulingDemand,
  getGapOpportunities,
  createGapConfirmationDraft,
  createGapBenefitDraft,
  createGapFollowUpTasks,
  getWeeklySchedules,
  oneClickSmartSchedule,
  publishSmartSchedule,
  rollbackSmartSchedule,
  saveSchedule,
  type ConfirmationDraft,
  type BenefitDraft,
  type DemandLoadLevel,
  type DemandRecommendedAction,
  type GapCandidate,
  type GapOpportunity,
  type GapOpportunityResult,
  type ScheduleVersion,
  type SchedulingDemandSlot,
  type SchedulingDemandResult,
  type SmartSchedulingAlternative,
  type SmartScheduleItem,
  type SmartSchedulingOptions,
  type SmartSchedulingResult,
} from '@/api/scheduling';
import type { Beautician, ScheduleSlot } from '@/types';
import { useStoreStore } from '@/stores/storeStore';
import { Button } from '../components/UI';
import { addBusinessDays, formatBusinessDate } from '@/utils/businessTime';

type ViewMode = 'week' | 'day';
type ScheduleView = 'raw' | 'demand' | 'smart';
type SlotStatus = 'free' | 'booked' | 'expired' | 'leave';
type ScheduleMap = Record<number, ScheduleSlot[][]>;

type DayInfo = {
  name: string;
  date: string;
  fullDate: string;
};

type DisplaySlot = {
  label: string;
  start: string;
  end: string;
  period: ScheduleSlot['period'];
  periodLabel: 'morning' | 'afternoon';
  sourceTimes: string[];
};

type DemandDisplayPeriod = {
  key: 'morning' | 'afternoon' | 'evening';
  label: string;
  timeRange: string;
  start: string;
  end: string;
  sourceSlots: DisplaySlot[];
};

type DemandPeriodSummary = SchedulingDemandSlot & {
  sourceSlotCount: number;
};

type WeeklyGapRecommendation = {
  key: string;
  opportunity: GapOpportunity;
  candidate: GapCandidate;
  appointmentTime: string;
};

type EditingSlot = {
  beauticianId: number;
  dayIndex: number;
  slotLabel: string;
} | null;

type SlotMarker = {
  recommended?: boolean;
  reservation?: boolean;
  hardConflict?: boolean;
  warning?: boolean;
};

type SmartConfig = Required<Pick<
  SmartSchedulingOptions,
  'mode' | 'objective' | 'keepConfirmedReservations' | 'allowOverrideBusy' | 'allowOverrideLeave'
>> & {
  period: 'current_view' | 'this_week' | 'next_week';
  peakMinStaff: number;
};

const t = {
  previousWeek: '\u4e0a\u4e00\u5468',
  nextWeek: '\u4e0b\u4e00\u5468',
  currentWeek: '\u672c\u5468',
  weeksAfter: '\u5468\u540e',
  weeksBefore: '\u5468\u524d',
  smartSchedule: '\u667a\u80fd\u6392\u73ed',
  rawScheduleView: '\u539f\u59cb\u89c6\u56fe',
  demandScheduleView: '\u9700\u6c42\u70ed\u529b\u56fe',
  smartScheduleView: '\u667a\u80fd\u6392\u73ed',
  oneClickSmartSchedule: '\u4e00\u952e\u667a\u80fd\u6392\u73ed',
  generatePreview: '\u751f\u6210\u9884\u89c8',
  smartConfig: '\u667a\u80fd\u6392\u73ed\u914d\u7f6e',
  previewStatus: '\u9884\u89c8\u672a\u53d1\u5e03',
  publishedStatus: '\u5df2\u53d1\u5e03',
  period: '\u6392\u73ed\u5468\u671f',
  currentViewWeek: '\u5f53\u524d\u67e5\u770b\u5468',
  thisWeek: '\u672c\u5468',
  nextCalendarWeek: '\u4e0b\u5468',
  mode: '\u751f\u6210\u65b9\u5f0f',
  objective: '\u4f18\u5148\u76ee\u6807',
  peakMinStaff: '\u9ad8\u5cf0\u6700\u4f4e\u5728\u5c97',
  copyLastWeekOptimize: '\u590d\u5236\u4e0a\u5468\u5e76\u4f18\u5316',
  blankGenerate: '\u4ece\u7a7a\u767d\u751f\u6210',
  optimizeCurrent: '\u57fa\u4e8e\u5f53\u524d\u73ed\u8868\u4f18\u5316',
  balancedMode: '\u5e73\u8861\u6a21\u5f0f',
  reservationFirst: '\u9884\u7ea6\u4f18\u5148',
  peakFirst: '\u9ad8\u5cf0\u4f18\u5148',
  costFirst: '\u6210\u672c\u4f18\u5148',
  fairnessFirst: '\u516c\u5e73\u4f18\u5148',
  coverReservations: '\u8986\u76d6\u9884\u7ea6',
  coverPeak: '\u8986\u76d6\u9ad8\u5cf0',
  fairness: '\u5de5\u65f6\u516c\u5e73',
  reduceStaff: '\u51cf\u5c11\u4eba\u529b',
  keepConfirmedReservations: '\u4fdd\u7559\u5df2\u786e\u8ba4\u9884\u7ea6\u7f8e\u5bb9\u5e08',
  allowOverrideBusy: '\u5141\u8bb8\u8986\u76d6\u5360\u7528\u65f6\u6bb5',
  allowOverrideLeave: '\u5141\u8bb8\u8986\u76d6\u8bf7\u5047\u65f6\u6bb5',
  publishConfirm: '\u53d1\u5e03\u524d\u4f1a\u518d\u6b21\u6821\u9a8c\u786c\u51b2\u7a81\uff0c\u5e76\u8986\u76d6\u672c\u5468\u5bf9\u5e94\u7f8e\u5bb9\u5e08\u73ed\u8868\u3002\u786e\u8ba4\u53d1\u5e03\uff1f',
  publishSmartSchedule: '\u53d1\u5e03\u667a\u80fd\u6392\u73ed',
  rollbackSchedule: '\u56de\u6eda\u7248\u672c',
  rollbackConfirm: '\u56de\u6eda\u524d\u4f1a\u6821\u9a8c\u5f53\u524d\u9884\u7ea6\u3001\u8bf7\u5047\u548c\u8d44\u6e90\u51b2\u7a81\u3002\u786e\u8ba4\u56de\u6eda\uff1f',
  rollbackSuccess: '\u5df2\u56de\u6eda\u5230\u5386\u53f2\u7248\u672c',
  rollbackFailed: '\u56de\u6eda\u5931\u8d25\uff0c\u76ee\u6807\u7248\u672c\u53ef\u80fd\u5df2\u4e0e\u5f53\u524d\u9884\u7ea6\u51b2\u7a81',
  alternatives: '\u5907\u9009\u65b9\u6848',
  skillMatch: '\u6280\u80fd\u5339\u914d',
  fairnessScore: '\u5de5\u65f6\u516c\u5e73',
  estimatedLaborCost: '\u9884\u8ba1\u4eba\u529b\u6210\u672c',
  solverStatus: '\u6c42\u89e3\u72b6\u6001',
  publishedVersion: '\u5df2\u53d1\u5e03\u7248\u672c',
  noPublishedVersion: '\u6682\u65e0\u53d1\u5e03\u7248\u672c',
  demandHeatmap: '\u9700\u6c42\u70ed\u529b\u56fe',
  byDay: '\u6309\u5929',
  byWeek: '\u6309\u5468',
  saveSchedule: '\u4fdd\u5b58\u6392\u73ed',
  saving: '\u4fdd\u5b58\u4e2d...',
  smartPreview: '\u667a\u80fd\u6392\u73ed\u9884\u89c8',
  score: '\u8bc4\u5206',
  reservationCoverage: '\u9884\u7ea6\u8986\u76d6',
  peakCoverage: '\u9ad8\u5cf0\u8986\u76d6',
  hardConflicts: '\u786c\u51b2\u7a81',
  warnings: '\u63d0\u9192',
  hardConflict: '\u786c\u51b2\u7a81',
  warning: '\u63d0\u9192',
  recommendedMark: '\u63a8',
  conflictMark: '\u51b2',
  reservationMark: '\u7ea6',
  cannotPublish: '\u5b58\u5728\u786c\u51b2\u7a81\uff0c\u9700\u8c03\u6574\u540e\u53d1\u5e03',
  demandSummary: '\u9700\u6c42\u70ed\u529b\u56fe',
  highDemandSlots: '\u9ad8\u9700\u6c42\u65f6\u6bb5',
  underStaffedSlots: '\u4eba\u624b\u4e0d\u8db3\u65f6\u6bb5',
  highLoadSlots: '\u9ad8\u8d1f\u8377\u65f6\u6bb5',
  lowLoadSlots: '\u4f4e\u8d1f\u8377\u65f6\u6bb5',
  demandLegend: '\u70ed\u529b\u56fe\u56fe\u4f8b',
  demandLow: '\u4f4e\u8d1f\u8377',
  demandMedium: '\u4e2d\u8d1f\u8377',
  demandHigh: '\u9ad8\u8d1f\u8377',
  demandUnderstaffed: '\u4eba\u624b\u4e0d\u8db3',
  expectedTraffic: '\u9884\u6d4b\u670d\u52a1\u9700\u6c42',
  suggestedStaff: '\u5efa\u8bae\u670d\u52a1\u5bb9\u91cf',
  scheduledStaff: '\u5df2\u6392\u670d\u52a1\u5bb9\u91cf',
  demandLowRange: '\u670d\u52a1\u5bb9\u91cf\u5bcc\u4f59\uff0c\u63a8\u8350\u8865\u5355\u6216\u5b89\u6392\u4f11\u5047',
  demandMediumRange: '\u670d\u52a1\u5bb9\u91cf\u5339\u914d\uff0c\u4fdd\u6301\u5f53\u524d\u914d\u7f6e',
  demandHighRange: '\u670d\u52a1\u5bb9\u91cf\u4e0d\u8db3\uff0c\u63a8\u8350\u52a0\u4eba\u6216\u52a0\u73ed',
  demandStaffHint: '\u8d1f\u8377\u6309\u53ef\u63a5\u5f85\u9879\u76ee\u670d\u52a1\u6b21\u6570\u8ba1\u7b97\uff1b\u7a7a\u6863\u8865\u4f4d\u7edf\u4e00\u5728\u53f3\u4fa7\u6309\u5468\u63a8\u8350',
  recommendedAction: '\u5efa\u8bae',
  fillGapAction: '\u8865\u5355',
  keepAction: '\u4fdd\u6301',
  addStaffAction: '\u52a0\u4eba',
  staffGap: '\u670d\u52a1\u7f3a\u53e3',
  gapOpportunities: '\u7a7a\u6863\u673a\u4f1a',
  weeklyGapRecommendations: '\u7a7a\u6863\u63a8\u8350\u5ba2\u6237\u540d\u5355',
  weeklyGapRecommendationSubtitle: '\u6309\u5468\u63a8\u8350\uff0c\u4f18\u5148\u5c55\u793a\u6700\u503c\u5f97\u8ddf\u8fdb\u7684\u8865\u4f4d\u5ba2\u6237',
  recommendedCustomers: '\u63a8\u8350\u5ba2\u6237',
  expectedFillRate: '\u9884\u8ba1\u8865\u4f4d\u7387',
  expectedRevenue: '\u9884\u8ba1\u6536\u76ca',
  recommendedProject: '\u63a8\u8350\u9879\u76ee',
  suggestedAppointmentTime: '\u5efa\u8bae\u9884\u7ea6\u65f6\u6bb5',
  recommendedFollowUpAssignee: '\u63a8\u8350\u8ddf\u8fdb\u5458\u5de5',
  customerDetails: '\u5ba2\u6237\u8be6\u60c5',
  sendFollowUp: '\u4e0b\u53d1\u8ddf\u8fdb',
  pushBenefit: '\u63a8\u9001\u6743\u76ca',
  benefitDraftTitle: '\u4e2a\u6027\u5316\u6d3b\u52a8\u6743\u76ca\u8349\u7a3f',
  benefitDraftCreated: '\u5df2\u751f\u6210\u4e2a\u6027\u5316\u6743\u76ca\u6587\u6848\uff08\u672a\u53d1\u9001\uff09',
  benefitDraftFailed: '\u6743\u76ca\u6587\u6848\u751f\u6210\u5931\u8d25',
  benefitCopy: '\u6743\u76ca\u6587\u6848',
  benefitLink: '\u6743\u76ca\u94fe\u63a5',
  followUpConfirmTitle: '\u786e\u8ba4\u4e0b\u53d1\u8ddf\u8fdb',
  followUpConfirmDescription: '\u7cfb\u7edf\u5c06\u4e3a\u5e97\u957f\u521b\u5efa\u4e00\u6761\u7a7a\u6863\u8865\u4f4d\u8ddf\u8fdb\u4efb\u52a1\uff0c\u4e0d\u4f1a\u81ea\u52a8\u53d1\u9001\u77ed\u4fe1\u3001\u9501\u6863\u6216\u521b\u5efa\u9884\u7ea6\u3002',
  followUpAssignee: '\u8ddf\u8fdb\u5458\u5de5',
  preferredBeautician: '\u5ba2\u6237\u719f\u6089',
  noFollowUpAssignee: '\u6682\u65e0\u53ef\u9009\u8ddf\u8fdb\u5458\u5de5',
  noWeeklyGapRecommendations: '\u672c\u5468\u6682\u65e0\u53ef\u8865\u4f4d\u5ba2\u6237',
  pendingProject: '\u63a8\u8350\u9879\u76ee\u5f85\u786e\u8ba4',
  viewCandidates: '\u67e5\u770b\u5019\u8865',
  createFollowUpTask: '\u5efa\u8ddf\u8fdb\u4efb\u52a1',
  confirmationDraft: '\u786e\u8ba4\u6d88\u606f\u8349\u7a3f',
  draftNotSent: '\u672a\u53d1\u9001',
  candidateReasons: '\u63a8\u8350\u539f\u56e0',
  riskTips: '\u98ce\u9669\u63d0\u793a',
  noGapOpportunity: '\u6682\u65e0\u7a7a\u6863\u673a\u4f1a',
  followUpTaskCreated: '\u5df2\u521b\u5efa\u5e97\u957f\u8ddf\u8fdb\u4efb\u52a1',
  followUpTaskFailed: '\u8ddf\u8fdb\u4efb\u52a1\u521b\u5efa\u5931\u8d25',
  confirmationDraftCreated: '\u786e\u8ba4\u6d88\u606f\u8349\u7a3f\u5df2\u751f\u6210\uff08\u672a\u53d1\u9001\uff09',
  confirmationDraftFailed: '\u786e\u8ba4\u6d88\u606f\u8349\u7a3f\u751f\u6210\u5931\u8d25',
  loadingSchedule: '\u52a0\u8f7d\u6392\u73ed\u6570\u636e...',
  morning: '\u4e0a\u5348',
  afternoon: '\u4e0b\u5348',
  evening: '\u665a\u4e0a',
  statusDescription: '\u72b6\u6001\u8bf4\u660e',
  viewing: '\u5f53\u524d\u67e5\u770b',
  weeklySchedule: '\u7684\u5468\u6392\u73ed',
  allStaffSchedule: '\u7684\u5168\u5458\u6392\u73ed',
  free: '\u7a7a\u95f2',
  booked: '\u5df2\u9884\u7ea6',
  expired: '\u5df2\u8fc7\u671f',
  leave: '\u8bf7\u5047',
  loadBeauticiansFailed: '\u52a0\u8f7d\u7f8e\u5bb9\u5e08\u5931\u8d25',
  loadScheduleFailed: '\u52a0\u8f7d\u6392\u73ed\u6570\u636e\u5931\u8d25',
  saveSuccess: '\u6392\u73ed\u4fdd\u5b58\u6210\u529f',
  saveFailed: '\u6392\u73ed\u4fdd\u5b58\u5931\u8d25\uff0c\u5df2\u56de\u6eda\u4fee\u6539',
  previewSuccess: '\u667a\u80fd\u6392\u73ed\u9884\u89c8\u5df2\u751f\u6210',
  previewFailed: '\u667a\u80fd\u6392\u73ed\u751f\u6210\u5931\u8d25',
  publishSuccess: '\u667a\u80fd\u6392\u73ed\u5df2\u53d1\u5e03',
  publishFailed: '\u5b58\u5728\u6392\u73ed\u51b2\u7a81\uff0c\u53d1\u5e03\u5931\u8d25',
  demandFailed: '\u9700\u6c42\u70ed\u529b\u56fe\u52a0\u8f7d\u5931\u8d25',
  storeRequired: '\u8bf7\u5148\u9009\u62e9\u5177\u4f53\u95e8\u5e97\u540e\u518d\u6392\u73ed',
};

const MORNING = 'morning' as ScheduleSlot['period'];
const AFTERNOON = 'afternoon' as ScheduleSlot['period'];

const DISPLAY_SLOTS: DisplaySlot[] = [
  { label: '09:00-10:00', start: '09:00', end: '10:00', period: MORNING, periodLabel: 'morning', sourceTimes: ['09:00', '09:30'] },
  { label: '10:00-11:00', start: '10:00', end: '11:00', period: MORNING, periodLabel: 'morning', sourceTimes: ['10:00', '10:30'] },
  { label: '11:00-12:00', start: '11:00', end: '12:00', period: MORNING, periodLabel: 'morning', sourceTimes: ['11:00', '11:30'] },
  { label: '14:00-15:00', start: '14:00', end: '15:00', period: AFTERNOON, periodLabel: 'afternoon', sourceTimes: ['14:00', '14:30'] },
  { label: '15:00-16:00', start: '15:00', end: '16:00', period: AFTERNOON, periodLabel: 'afternoon', sourceTimes: ['15:00', '15:30'] },
  { label: '16:00-17:00', start: '16:00', end: '17:00', period: AFTERNOON, periodLabel: 'afternoon', sourceTimes: ['16:00', '16:30'] },
  { label: '17:00-18:00', start: '17:00', end: '18:00', period: AFTERNOON, periodLabel: 'afternoon', sourceTimes: ['17:00', '17:30'] },
  { label: '18:00-19:00', start: '18:00', end: '19:00', period: AFTERNOON, periodLabel: 'afternoon', sourceTimes: ['18:00', '18:30'] },
  { label: '19:00-20:00', start: '19:00', end: '20:00', period: AFTERNOON, periodLabel: 'afternoon', sourceTimes: ['19:00', '19:30'] },
];

const TIME_SLOTS = DISPLAY_SLOTS.flatMap((slot) => slot.sourceTimes);
const HOUR_SLOTS = DISPLAY_SLOTS.map((slot) => ({ start: slot.start, sourceTimes: slot.sourceTimes }));
const DEMAND_PERIODS: DemandDisplayPeriod[] = [
  {
    key: 'morning',
    label: t.morning,
    timeRange: '09:00~12:00',
    start: '09:00',
    end: '12:00',
    sourceSlots: DISPLAY_SLOTS.filter((slot) => slot.start >= '09:00' && slot.end <= '12:00'),
  },
  {
    key: 'afternoon',
    label: t.afternoon,
    timeRange: '14:00~18:00',
    start: '14:00',
    end: '18:00',
    sourceSlots: DISPLAY_SLOTS.filter((slot) => slot.start >= '14:00' && slot.end <= '18:00'),
  },
  {
    key: 'evening',
    label: t.evening,
    timeRange: '18:00~20:00',
    start: '18:00',
    end: '20:00',
    sourceSlots: DISPLAY_SLOTS.filter((slot) => slot.start >= '18:00' && slot.end <= '20:00'),
  },
];

const DEFAULT_SMART_CONFIG: SmartConfig = {
  period: 'current_view',
  mode: 'balanced',
  objective: 'cover_reservations',
  keepConfirmedReservations: true,
  allowOverrideBusy: false,
  allowOverrideLeave: false,
  peakMinStaff: 3,
};

const SMART_GENERATION_STEPS = ['读取预约', '计算需求', '匹配技能', '检查请假/资源', '生成方案'];

function getWeekStart(offset: number): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1) + offset * 7;
  const monday = new Date(now);
  monday.setDate(diff);
  return formatBusinessDate(monday);
}

function getSmartWeekOffset(period: SmartConfig['period'], currentOffset: number): number {
  if (period === 'this_week') return 0;
  if (period === 'next_week') return 1;
  return currentOffset;
}

function addDays(dateText: string, days: number): string {
  return addBusinessDays(dateText, days);
}

function toMinutes(time: string | undefined): number {
  if (!time) return 0;
  const [hour = '0', minute = '0'] = time.split(':');
  return Number(hour) * 60 + Number(minute);
}

function toEndTime(time: string): string {
  const total = toMinutes(time) + 60;
  const hour = String(Math.floor(total / 60)).padStart(2, '0');
  const minute = String(total % 60).padStart(2, '0');
  return `${hour}:${minute}`;
}

function getWeekDays(weekStart: string): DayInfo[] {
  const dayNames = ['\u5468\u4e00', '\u5468\u4e8c', '\u5468\u4e09', '\u5468\u56db', '\u5468\u4e94', '\u5468\u516d', '\u5468\u65e5'];
  return dayNames.map((name, index) => {
    const fullDate = addDays(weekStart, index);
    return { name, fullDate, date: fullDate.slice(5) };
  });
}

function formatWeekRange(weekStart: string): string {
  const start = new Date(weekStart);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (date: Date) =>
    `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return `${fmt(start)} ~ ${fmt(end)}`;
}

function deepCloneSlots(slots: ScheduleSlot[][]): ScheduleSlot[][] {
  return slots.map((day) => day.map((slot) => ({ ...slot })));
}

function cloneScheduleMap(data: ScheduleMap): ScheduleMap {
  return Object.fromEntries(Object.entries(data).map(([id, slots]) => [Number(id), deepCloneSlots(slots)]));
}

function createEmptyWeekSlots(): ScheduleSlot[][] {
  return Array.from({ length: 7 }, () =>
    TIME_SLOTS.map((time) => ({
      time,
      period: DISPLAY_SLOTS.find((slot) => slot.sourceTimes.includes(time))?.period ?? MORNING,
      available: true,
      status: 'available',
    })),
  );
}

function normalizeSlotStatus(status: unknown): 'available' | 'booked' | 'leave' {
  const value = String(status ?? '').toLowerCase();
  if (['booked', 'reserved', 'reservation', '\u5df2\u9884\u7ea6'].includes(value)) return 'booked';
  if (['leave', 'busy', 'off', '\u8bf7\u5047', '\u5fd9\u788c'].includes(value)) return 'leave';
  return 'available';
}

function smartSchedulesToMap(items: SmartScheduleItem[], beauticians: Beautician[], weekStart: string): ScheduleMap {
  const next: ScheduleMap = Object.fromEntries(beauticians.map((beautician) => [beautician.id, createEmptyWeekSlots()]));
  for (const item of items) {
    const dayIndex = Math.round((new Date(item.date).getTime() - new Date(weekStart).getTime()) / 86_400_000);
    if (dayIndex < 0 || dayIndex > 6) continue;
    if (!next[item.beauticianId]) next[item.beauticianId] = createEmptyWeekSlots();
    next[item.beauticianId][dayIndex] = next[item.beauticianId][dayIndex].map((slot) => {
      const slotStart = toMinutes(slot.time);
      const itemStart = toMinutes(item.startTime);
      const itemEnd = toMinutes(item.endTime);
      if (slotStart < itemStart || slotStart >= itemEnd) return slot;
      const status = normalizeSlotStatus(item.status);
      return {
        ...slot,
        available: status === 'available',
        status,
      };
    });
  }
  return next;
}

function scheduleMapToSmartSchedules(data: ScheduleMap, weekStart: string): SmartScheduleItem[] {
  return Object.entries(data).flatMap(([beauticianId, weekSlots]) =>
    weekSlots.flatMap((daySlots, dayIndex) => {
      const date = addDays(weekStart, dayIndex);
      return HOUR_SLOTS.flatMap((slot) => {
        const sourceSlots = slot.sourceTimes.map((time) => daySlots.find((item) => item.time === time));
        const hasLeave = sourceSlots.some((item) => normalizeSlotStatus(item?.status) === 'leave');
        const hasBooked = sourceSlots.some((item) => normalizeSlotStatus(item?.status) === 'booked');
        const allAvailable = sourceSlots.every((item) => item?.available || normalizeSlotStatus(item?.status) === 'available');
        if (hasBooked) return [];
        if (!hasLeave && !allAvailable) return [];
        return [{
          beauticianId: Number(beauticianId),
          date,
          startTime: slot.start,
          endTime: toEndTime(slot.start),
          status: hasLeave ? 'leave' : 'available',
        }];
      });
    }),
  );
}

function getSlotMarkerKey(beauticianId: number, date: string, slot: DisplaySlot): string {
  return `${beauticianId}:${date}:${slot.start}:${slot.end}`;
}

function buildSlotMarkers(result: SmartSchedulingResult | null, slots: DisplaySlot[]): Map<string, SlotMarker> {
  const markers = new Map<string, SlotMarker>();
  if (!result) return markers;

  for (const item of result.schedules ?? []) {
    if (item.source !== 'generated' && item.source !== 'reservation') continue;
    for (const slot of slots) {
      if (!overlaps(item.startTime, item.endTime, slot.start, slot.end)) continue;
      const key = getSlotMarkerKey(item.beauticianId, item.date, slot);
      const marker = markers.get(key) ?? {};
      marker.recommended = item.source === 'generated' || marker.recommended;
      marker.reservation = item.source === 'reservation' || marker.reservation;
      markers.set(key, marker);
    }
  }

  for (const conflict of result.conflicts ?? []) {
    if (!conflict.beauticianId || !conflict.date || !conflict.startTime || !conflict.endTime) continue;
    for (const slot of slots) {
      if (!overlaps(conflict.startTime, conflict.endTime, slot.start, slot.end)) continue;
      const key = getSlotMarkerKey(conflict.beauticianId, conflict.date, slot);
      const marker = markers.get(key) ?? {};
      if (conflict.severity === 'hard') marker.hardConflict = true;
      if (conflict.severity === 'soft') marker.warning = true;
      markers.set(key, marker);
    }
  }

  return markers;
}

function overlaps(startA: string, endA: string, startB: string, endB: string): boolean {
  return toMinutes(startA) < toMinutes(endB) && toMinutes(startB) < toMinutes(endA);
}

function isPastSlot(day: DayInfo, slot: DisplaySlot): boolean {
  return new Date(`${day.fullDate}T${slot.end}:00`).getTime() < Date.now();
}

function getDisplaySlotStatus(daySlots: ScheduleSlot[], day: DayInfo, slot: DisplaySlot): SlotStatus {
  if (isPastSlot(day, slot)) return 'expired';
  const sourceSlots = slot.sourceTimes.map((time) => daySlots.find((item) => item.time === time));
  if (sourceSlots.some((item) => normalizeSlotStatus(item?.status) === 'booked')) return 'booked';
  if (sourceSlots.some((item) => normalizeSlotStatus(item?.status) === 'leave')) return 'leave';
  return 'free';
}

function setDisplaySlotStatus(
  daySlots: ScheduleSlot[],
  slot: DisplaySlot,
  status: Extract<SlotStatus, 'free' | 'leave'>,
): ScheduleSlot[] {
  return daySlots.map((item) =>
    slot.sourceTimes.includes(item.time)
      ? { ...item, available: status === 'free', status: status === 'free' ? 'available' : 'leave' }
      : item,
  );
}

function getStatusClass(status: SlotStatus) {
  const styles: Record<SlotStatus, string> = {
    free: 'border-green-400 bg-green-50 text-green-600 hover:bg-green-100',
    booked: 'border-blue-300 bg-blue-50 text-blue-600',
    expired: 'border-gray-300 bg-gray-50 text-gray-400',
    leave: 'border-red-300 bg-red-50 text-red-600',
  };
  return styles[status];
}

function getStatusLabel(status: SlotStatus, slot: DisplaySlot) {
  const labels: Record<SlotStatus, string> = {
    free: t.free,
    booked: t.booked,
    expired: t.expired,
    leave: t.leave,
  };
  return labels[status];
}

function getDisplaySlotReservations(sourceSlots: ScheduleSlot[]): NonNullable<ScheduleSlot['reservationInfo']>[] {
  const reservations = new Map<number, NonNullable<ScheduleSlot['reservationInfo']>>();
  for (const slot of sourceSlots) {
    if (normalizeSlotStatus(slot.status) !== 'booked' || !slot.reservationInfo) continue;
    reservations.set(slot.reservationInfo.id, slot.reservationInfo);
  }
  return Array.from(reservations.values());
}

function getReservationStatusLabel(status: string | undefined): string {
  const labels: Record<string, string> = {
    pending: '待确认',
    confirmed: '已确认',
    checked_in: '已到店',
    arrived: '已到店',
    in_progress: '服务中',
    completed: '已完成',
    cancelled: '已取消',
    canceled: '已取消',
  };
  const key = String(status ?? '').toLowerCase();
  return labels[key] ?? status ?? '-';
}

function buildReservationHoverText(reservations: NonNullable<ScheduleSlot['reservationInfo']>[]): string {
  if (!reservations.length) return t.booked;
  return reservations
    .map((reservation) => {
      const time = `${reservation.startTime ?? '-'}-${reservation.endTime ?? '-'}`;
      const customer = reservation.customerName || `客户 #${reservation.customerId ?? '-'}`;
      const project = reservation.projectName || '项目待确认';
      const phone = reservation.customerPhone ? `｜${reservation.customerPhone}` : '';
      return `${time}｜${customer}${phone}｜${project}｜${getReservationStatusLabel(reservation.status)}`;
    })
    .join('\n');
}

function getDemandSlotKey(date: string, slot: DisplaySlot): string {
  return `${date}:${slot.start}:${slot.end}`;
}

function buildDemandSlotMap(result: SchedulingDemandResult | null): Map<string, SchedulingDemandSlot> {
  const map = new Map<string, SchedulingDemandSlot>();
  for (const slot of result?.slots ?? []) {
    map.set(`${slot.date}:${slot.startTime}:${slot.endTime}`, slot);
  }
  return map;
}

function resolveDemandLoad(requiredStaff: number, scheduledStaff: number): {
  staffDelta: number;
  loadRatio: number;
  loadLevel: DemandLoadLevel;
  recommendedAction: DemandRecommendedAction;
} {
  const staffDelta = scheduledStaff - requiredStaff;
  const loadRatio = requiredStaff <= 0 && scheduledStaff <= 0 ? 0 : requiredStaff / Math.max(scheduledStaff, 1);
  const loadLevel: DemandLoadLevel = staffDelta > 0 ? 'low' : staffDelta < 0 ? 'high' : 'medium';
  const recommendedAction: DemandRecommendedAction = loadLevel === 'low' ? 'fill_gap' : loadLevel === 'high' ? 'add_staff' : 'keep';
  return { staffDelta, loadRatio, loadLevel, recommendedAction };
}

function getDemandServiceMetrics(slot: SchedulingDemandSlot | undefined) {
  if (!slot) return null;
  return {
    expectedServiceDemand: slot.expectedServiceDemand ?? slot.expectedReservations,
    requiredServiceCapacity: slot.requiredServiceCapacity ?? slot.requiredStaff,
    scheduledServiceCapacity: slot.scheduledServiceCapacity ?? slot.scheduledStaff,
  };
}

function getDemandLoad(slot: SchedulingDemandSlot | undefined) {
  if (!slot) return null;
  const metrics = getDemandServiceMetrics(slot);
  const fallback = resolveDemandLoad(metrics?.requiredServiceCapacity ?? slot.requiredStaff, metrics?.scheduledServiceCapacity ?? slot.scheduledStaff);
  return {
    staffDelta: slot.staffDelta ?? fallback.staffDelta,
    loadRatio: slot.loadRatio ?? fallback.loadRatio,
    loadLevel: slot.loadLevel ?? fallback.loadLevel,
    recommendedAction: slot.recommendedAction ?? fallback.recommendedAction,
  };
}

function getDemandCellClass(slot: SchedulingDemandSlot | undefined): string {
  if (!slot) return 'border-gray-200 bg-gray-50 text-gray-400';
  const load = getDemandLoad(slot);
  if (load?.loadLevel === 'high') return 'border-rose-300 bg-rose-50 text-rose-700';
  if (load?.loadLevel === 'medium') return 'border-amber-300 bg-amber-50 text-amber-700';
  return 'border-emerald-300 bg-emerald-50 text-emerald-700';
}

function getDemandLevelLabel(slot: SchedulingDemandSlot | undefined): string {
  if (!slot) return '-';
  const load = getDemandLoad(slot);
  if (load?.loadLevel === 'high') return t.demandHigh;
  if (load?.loadLevel === 'medium') return t.demandMedium;
  return t.demandLow;
}

function getDemandActionLabel(slot: SchedulingDemandSlot | undefined): string {
  const load = getDemandLoad(slot);
  if (!load) return '-';
  if (load.recommendedAction === 'add_staff') return t.addStaffAction;
  if (load.recommendedAction === 'fill_gap') return t.fillGapAction;
  return t.keepAction;
}

function aggregateDemandPeriod(
  date: string,
  period: DemandDisplayPeriod,
  demandSlotByKey: Map<string, SchedulingDemandSlot>,
): DemandPeriodSummary | undefined {
  const slots = period.sourceSlots
    .map((slot) => demandSlotByKey.get(getDemandSlotKey(date, slot)))
    .filter((slot): slot is SchedulingDemandSlot => Boolean(slot));
  if (!slots.length) return undefined;

  const expectedReservations = slots.reduce((sum, slot) => sum + slot.expectedReservations, 0);
  const expectedServiceDemand = slots.reduce((sum, slot) => sum + (slot.expectedServiceDemand ?? slot.expectedReservations), 0);
  const requiredServiceCapacity = slots.reduce((sum, slot) => sum + (slot.requiredServiceCapacity ?? slot.requiredStaff), 0);
  const scheduledServiceCapacity = slots.reduce((sum, slot) => sum + (slot.scheduledServiceCapacity ?? slot.scheduledStaff), 0);
  const requiredStaff = Math.max(...slots.map((slot) => slot.requiredStaff));
  const scheduledStaff = Math.min(...slots.map((slot) => slot.scheduledStaff));
  const level: SchedulingDemandSlot['level'] =
    requiredServiceCapacity >= 5 || expectedServiceDemand >= 5
      ? 'high'
      : requiredServiceCapacity >= 2 || expectedServiceDemand >= 2
      ? 'medium'
      : 'low';
  const load = resolveDemandLoad(requiredServiceCapacity, scheduledServiceCapacity);

  return {
    date,
    startTime: period.start,
    endTime: period.end,
    expectedReservations,
    requiredStaff,
    scheduledStaff,
    expectedServiceDemand,
    requiredServiceCapacity,
    scheduledServiceCapacity,
    level,
    ...load,
    sourceSlotCount: slots.length,
  };
}

function isPastDemandPeriod(date: string, period: DemandDisplayPeriod): boolean {
  const today = formatBusinessDate(new Date());
  if (date < today) return true;
  if (date > today) return false;
  return toMinutes(period.end) <= toMinutes(new Date().toTimeString().slice(0, 5));
}

function formatGapAppointmentTime(opportunity: GapOpportunity): string {
  return `${opportunity.date} ${opportunity.startTime}~${opportunity.endTime}`;
}

function buildWeeklyGapRecommendations(result: GapOpportunityResult | null): WeeklyGapRecommendation[] {
  const bestByCustomer = new Map<number, WeeklyGapRecommendation>();
  for (const opportunity of result?.opportunities ?? []) {
    if (opportunity.status && !['open', 'active', 'pending'].includes(opportunity.status)) continue;
    for (const candidate of opportunity.candidates ?? []) {
      const item: WeeklyGapRecommendation = {
        key: `${opportunity.id}:${candidate.id}`,
        opportunity,
        candidate,
        appointmentTime: formatGapAppointmentTime(opportunity),
      };
      const current = bestByCustomer.get(candidate.customerId);
      if (!current) {
        bestByCustomer.set(candidate.customerId, item);
        continue;
      }
      const currentScore = current.candidate.expectedFillRate * 100000 + current.candidate.estimatedRevenue + current.candidate.score;
      const nextScore = candidate.expectedFillRate * 100000 + candidate.estimatedRevenue + candidate.score;
      if (nextScore > currentScore) bestByCustomer.set(candidate.customerId, item);
    }
  }
  return Array.from(bestByCustomer.values()).sort(
    (a, b) =>
      b.candidate.expectedFillRate - a.candidate.expectedFillRate ||
      b.candidate.estimatedRevenue - a.candidate.estimatedRevenue ||
      b.candidate.score - a.candidate.score,
  );
}

function isPastDisplaySlot(date: string, slot: DisplaySlot): boolean {
  const today = formatBusinessDate(new Date());
  if (date < today) return true;
  if (date > today) return false;
  return toMinutes(slot.end) <= toMinutes(new Date().toTimeString().slice(0, 5));
}

function formatPercent(value?: number): string {
  return `${Math.round((value ?? 0) * 100)}%`;
}

function maskPhone(phone?: string): string {
  if (!phone || phone.length < 7) return phone ?? '-';
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

function getVisibleCandidateReasons(reasons?: string[], limit = 4): string[] {
  const source = reasons?.filter(Boolean) ?? [];
  if (!source.length) return ['基于卡项、历史预约和预测信号推荐'];

  const priorityKeywords = ['护理周期', '疗程', '剩余', '适配', '项目偏好', '推荐项目', '卡项'];
  const priority = source.filter((reason) => priorityKeywords.some((keyword) => reason.includes(keyword)));
  const secondary = source.filter((reason) => !priority.includes(reason));
  return [...priority, ...secondary].slice(0, limit);
}

function getDefaultFollowUpBeauticianId(recommendation: WeeklyGapRecommendation | null, beauticians: Beautician[]): number | null {
  if (!recommendation) return null;
  const activeIds = new Set(beauticians.filter((item) => item.status !== '离职').map((item) => item.id));
  const preferredId = Number(recommendation.candidate.preferredBeauticianId ?? 0);
  if (preferredId && activeIds.has(preferredId)) return preferredId;
  const opportunityId = recommendation.opportunity.beauticianIds.find((id) => activeIds.has(Number(id)));
  if (opportunityId) return Number(opportunityId);
  return beauticians.find((item) => item.status !== '离职')?.id ?? null;
}

function getRecommendedFollowUpBeauticianName(recommendation: WeeklyGapRecommendation, beauticians: Beautician[]): string {
  if (recommendation.candidate.preferredBeauticianName) return recommendation.candidate.preferredBeauticianName;
  const beauticianId = getDefaultFollowUpBeauticianId(recommendation, beauticians);
  return beauticians.find((item) => item.id === beauticianId)?.name ?? '-';
}

export function Scheduling() {
  const { currentStoreId, stores, setCurrentStore, loadStores } = useStoreStore();
  const [beauticians, setBeauticians] = useState<Beautician[]>([]);
  const [activeBeauticianId, setActiveBeauticianId] = useState<number | null>(null);
  const [activeDayIndex, setActiveDayIndex] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [scheduleView, setScheduleView] = useState<ScheduleView>('raw');
  const [weekOffset, setWeekOffset] = useState(0);
  const [scheduleByBeautician, setScheduleByBeautician] = useState<ScheduleMap>({});
  const [smartScheduleByBeautician, setSmartScheduleByBeautician] = useState<ScheduleMap>({});
  const [originalByBeautician, setOriginalByBeautician] = useState<ScheduleMap>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [smartLoading, setSmartLoading] = useState(false);
  const [smartPublishing, setSmartPublishing] = useState(false);
  const [demandLoading, setDemandLoading] = useState(false);
  const [smartResult, setSmartResult] = useState<SmartSchedulingResult | null>(null);
  const [demandResult, setDemandResult] = useState<SchedulingDemandResult | null>(null);
  const [gapResult, setGapResult] = useState<GapOpportunityResult | null>(null);
  const [selectedGap, setSelectedGap] = useState<GapOpportunity | null>(null);
  const [selectedGapCustomer, setSelectedGapCustomer] = useState<WeeklyGapRecommendation | null>(null);
  const [followUpRecommendation, setFollowUpRecommendation] = useState<WeeklyGapRecommendation | null>(null);
  const [followUpBeauticianId, setFollowUpBeauticianId] = useState<number | null>(null);
  const [gapActionLoading, setGapActionLoading] = useState<string | null>(null);
  const [confirmationDraft, setConfirmationDraft] = useState<ConfirmationDraft | null>(null);
  const [benefitDraft, setBenefitDraft] = useState<BenefitDraft | null>(null);
  const [editingSlot, setEditingSlot] = useState<EditingSlot>(null);
  const [smartConfig, setSmartConfig] = useState<SmartConfig>(DEFAULT_SMART_CONFIG);
  const [lastPublishedRunId, setLastPublishedRunId] = useState<string | null>(null);
  const [selectedAlternativeId, setSelectedAlternativeId] = useState<string | null>(null);
  const [scheduleVersions, setScheduleVersions] = useState<ScheduleVersion[]>([]);
  const [currentVersion, setCurrentVersion] = useState<ScheduleVersion | null>(null);
  const [rollingBackVersionId, setRollingBackVersionId] = useState<number | null>(null);

  const weekStart = getWeekStart(weekOffset);
  const days = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const activeScheduleByBeautician = scheduleView === 'smart' && smartResult ? smartScheduleByBeautician : scheduleByBeautician;
  const slotMarkers = useMemo(
    () => (scheduleView === 'smart' ? buildSlotMarkers(smartResult, DISPLAY_SLOTS) : new Map<string, SlotMarker>()),
    [scheduleView, smartResult],
  );
  const demandSlotByKey = useMemo(() => buildDemandSlotMap(demandResult), [demandResult]);
  const weeklyGapRecommendations = useMemo(() => buildWeeklyGapRecommendations(gapResult), [gapResult]);
  const activeBeautician = beauticians.find((item) => item.id === activeBeauticianId);
  const activeDay = days[activeDayIndex] ?? days[0];

  useEffect(() => {
    void loadStores();
  }, [loadStores]);

  useEffect(() => {
    if (currentStoreId === null && stores.length > 0) {
      setCurrentStore(stores[0].id);
    }
  }, [currentStoreId, setCurrentStore, stores]);

  useEffect(() => {
    const loadBeauticians = async () => {
      if (!currentStoreId) return;
      try {
        const list = await getBeauticians();
        setBeauticians(list);
        setActiveBeauticianId((current) => current ?? list[0]?.id ?? null);
      } catch {
        toast.error(t.loadBeauticiansFailed);
      }
    };
    void loadBeauticians();
  }, [currentStoreId]);

  const loadSchedule = useCallback(async () => {
    if (!currentStoreId || !beauticians.length) return;
    setLoading(true);
    try {
      const next = await getWeeklySchedules({
        beauticianIds: beauticians.map((beautician) => beautician.id),
        weekStart,
      });
      setScheduleByBeautician(next);
      setOriginalByBeautician(cloneScheduleMap(next));
      setSmartScheduleByBeautician({});
      setSmartResult(null);
      setDemandResult(null);
      setGapResult(null);
      setSelectedGap(null);
      setSelectedGapCustomer(null);
      setFollowUpRecommendation(null);
      setConfirmationDraft(null);
      setScheduleView('raw');
      try {
        const runs = await getSmartSchedulingRuns({ weekStart });
        setScheduleVersions(runs.versions ?? []);
        setCurrentVersion(runs.currentVersion ?? null);
      } catch (error) {
        console.warn('智能排班版本记录加载失败', error);
        setScheduleVersions([]);
        setCurrentVersion(null);
      }
    } catch (error) {
      console.error(error);
      toast.error(t.loadScheduleFailed);
    } finally {
      setLoading(false);
    }
  }, [beauticians, currentStoreId, weekStart]);

  useEffect(() => {
    void loadSchedule();
  }, [loadSchedule]);

  const applySmartResult = useCallback(
    (result: SmartSchedulingResult, targetWeekStart: string, alternative?: SmartSchedulingAlternative | null) => {
      const selected = alternative ?? result.recommended ?? result.alternatives?.[0] ?? null;
      const schedules = selected?.schedules?.length ? selected.schedules : result.schedules ?? [];
      setSelectedAlternativeId(selected?.id ?? null);
      setSmartResult({
        ...result,
        score: selected?.score ?? result.score,
        summary: selected?.summary ?? result.summary,
        schedules,
        conflicts: selected?.conflicts ?? result.conflicts,
        warnings: (selected?.conflicts ?? result.conflicts ?? []).filter((item) => item.severity === 'soft'),
        explanations: selected?.explanations ?? result.explanations,
      });
      setSmartScheduleByBeautician(smartSchedulesToMap(schedules, beauticians, targetWeekStart));
      setScheduleView('smart');
    },
    [beauticians],
  );

  const openSlotMenu = (beauticianId: number, dayIndex: number, slot: DisplaySlot) => {
    const day = days[dayIndex];
    if (scheduleView === 'smart') return;
    const currentSlots = scheduleByBeautician[beauticianId]?.[dayIndex] ?? [];
    const currentStatus = getDisplaySlotStatus(currentSlots, day, slot);
    if (currentStatus === 'expired' || currentStatus === 'booked') return;
    setEditingSlot((current) =>
      current?.beauticianId === beauticianId && current.dayIndex === dayIndex && current.slotLabel === slot.label
        ? null
        : { beauticianId, dayIndex, slotLabel: slot.label },
    );
  };

  const updateDisplaySlotStatus = async (
    beauticianId: number,
    dayIndex: number,
    slot: DisplaySlot,
    status: Extract<SlotStatus, 'free' | 'leave'>,
  ) => {
    if (!currentStoreId) {
      toast.error(t.storeRequired);
      return;
    }

    const next = cloneScheduleMap(scheduleByBeautician);
    if (!next[beauticianId]) next[beauticianId] = createEmptyWeekSlots();
    const target = next[beauticianId][dayIndex] ?? createEmptyWeekSlots()[dayIndex];
    next[beauticianId][dayIndex] = setDisplaySlotStatus(target, slot, status);

    setScheduleByBeautician(next);
    setOriginalByBeautician((current) => {
      const originalNext = cloneScheduleMap(current);
      if (!originalNext[beauticianId]) originalNext[beauticianId] = createEmptyWeekSlots();
      return originalNext;
    });
    setSmartResult((current) => {
      if (!current) return current;
      const date = addDays(weekStart, dayIndex);
      return {
        ...current,
        schedules: current.schedules?.filter(
          (item) =>
            item.beauticianId !== beauticianId ||
            item.date !== date ||
            !overlaps(item.startTime, item.endTime, slot.start, slot.end),
        ),
        conflicts: current.conflicts?.filter(
          (item) =>
            item.beauticianId !== beauticianId ||
            item.date !== date ||
            !item.startTime ||
            !item.endTime ||
            !overlaps(item.startTime, item.endTime, slot.start, slot.end),
        ),
      };
    });
    setEditingSlot(null);
    setSaving(true);
    try {
      await saveSchedule({ beauticianId, weekStart, slots: next[beauticianId] });
      setOriginalByBeautician((current) => ({
        ...cloneScheduleMap(current),
        [beauticianId]: deepCloneSlots(next[beauticianId]),
      }));
      setDemandResult(null);
      setGapResult(null);
      toast.success(t.saveSuccess);
    } catch {
      const rollbackSlots = originalByBeautician[beauticianId] ?? createEmptyWeekSlots();
      setScheduleByBeautician((current) => ({
        ...cloneScheduleMap(current),
        [beauticianId]: deepCloneSlots(rollbackSlots),
      }));
      toast.error(t.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!currentStoreId) {
      toast.error(t.storeRequired);
      return;
    }
    if (!beauticians.length) return;
    setSaving(true);
    try {
      await Promise.all(
        beauticians
          .filter((beautician) => scheduleByBeautician[beautician.id])
          .map((beautician) =>
            saveSchedule({ beauticianId: beautician.id, weekStart, slots: scheduleByBeautician[beautician.id] }),
          ),
      );
      setOriginalByBeautician(cloneScheduleMap(scheduleByBeautician));
      setDemandResult(null);
      setGapResult(null);
      toast.success(t.saveSuccess);
    } catch {
      setScheduleByBeautician(cloneScheduleMap(originalByBeautician));
      toast.error(t.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleSmartPreview = async () => {
    if (!currentStoreId) {
      toast.error(t.storeRequired);
      return;
    }
    if (!beauticians.length) return;
    setSmartLoading(true);
    try {
      const saturdayPeakStaff = Math.max(1, Number(smartConfig.peakMinStaff) || DEFAULT_SMART_CONFIG.peakMinStaff);
      const targetWeekOffset = getSmartWeekOffset(smartConfig.period, weekOffset);
      const targetWeekStart = getWeekStart(targetWeekOffset);
      if (targetWeekOffset !== weekOffset) {
        setWeekOffset(targetWeekOffset);
      }
      const result = await oneClickSmartSchedule({
        weekStart: targetWeekStart,
        mode: smartConfig.mode,
        objective: smartConfig.objective,
        keepConfirmedReservations: smartConfig.keepConfirmedReservations,
        allowOverrideBusy: smartConfig.allowOverrideBusy,
        allowOverrideLeave: smartConfig.allowOverrideLeave,
        generateAlternatives: true,
        optimizeScope: 'week',
        respectPublishedLocks: true,
        peakMinStaff: [
          { weekday: 6, startTime: '14:00', endTime: '17:00', minStaff: saturdayPeakStaff },
          { weekday: 7, startTime: '14:00', endTime: '17:00', minStaff: saturdayPeakStaff },
        ],
      });
      applySmartResult(result, targetWeekStart);
      setLastPublishedRunId(null);
      toast.success(t.previewSuccess);
    } catch (error) {
      console.error(error);
      toast.error(t.previewFailed);
    } finally {
      setSmartLoading(false);
    }
  };

  const handleSelectAlternative = (alternative: SmartSchedulingAlternative) => {
    if (!smartResult) return;
    applySmartResult(smartResult, smartResult.weekStart, alternative);
  };

  const handleDemand = async () => {
    if (!currentStoreId) {
      toast.error(t.storeRequired);
      return;
    }
    setDemandLoading(true);
    try {
      const [demandResponse, gapResponse] = await Promise.allSettled([
        getSchedulingDemand({ weekStart }),
        getGapOpportunities({ weekStart }),
      ]);
      if (demandResponse.status === 'fulfilled') {
        setDemandResult(demandResponse.value);
      } else {
        throw demandResponse.reason;
      }
      if (gapResponse.status === 'fulfilled') {
        setGapResult(gapResponse.value);
      } else {
        console.warn('空档机会加载失败，已降级为仅显示需求热力图', gapResponse.reason);
        setGapResult(null);
      }
    } catch (error) {
      console.error(error);
      toast.error(t.demandFailed);
    } finally {
      setDemandLoading(false);
    }
  };

  const refreshGapState = async () => {
    const gaps = await getGapOpportunities({ weekStart });
    setGapResult(gaps);
    if (selectedGap) {
      setSelectedGap(gaps.opportunities.find((item) => item.id === selectedGap.id) ?? null);
    }
    setSelectedGapCustomer((current) => {
      if (!current) return current;
      const opportunity = gaps.opportunities.find((item) => item.id === current.opportunity.id);
      const candidate = opportunity?.candidates.find((item) => item.id === current.candidate.id);
      return opportunity && candidate
        ? { key: `${opportunity.id}:${candidate.id}`, opportunity, candidate, appointmentTime: formatGapAppointmentTime(opportunity) }
        : null;
    });
  };

  const handleCreateGapFollowUpTask = async (candidate: GapCandidate, assigneeBeauticianId?: number | null): Promise<boolean> => {
    const opportunityId = candidate.opportunityId || selectedGap?.id;
    if (!opportunityId) return false;
    const loadingKey = `task:${candidate.id}`;
    setGapActionLoading(loadingKey);
    try {
      await createGapFollowUpTasks(opportunityId, {
        candidateIds: [candidate.id],
        assigneeRole: assigneeBeauticianId ? 'consultant' : 'manager',
        assigneeBeauticianId: assigneeBeauticianId ?? undefined,
      });
      await refreshGapState();
      toast.success(t.followUpTaskCreated);
      return true;
    } catch (error) {
      console.error(error);
      toast.error(t.followUpTaskFailed);
      return false;
    } finally {
      setGapActionLoading(null);
    }
  };

  const handleCreateConfirmationDraft = async (candidate: GapCandidate) => {
    const opportunityId = candidate.opportunityId || selectedGap?.id;
    if (!opportunityId) return;
    const loadingKey = `draft:${candidate.id}`;
    setGapActionLoading(loadingKey);
    try {
      const draft = await createGapConfirmationDraft(opportunityId, { candidateId: candidate.id, channel: 'sms' });
      setConfirmationDraft(draft);
      await refreshGapState();
      toast.success(t.confirmationDraftCreated);
    } catch (error) {
      console.error(error);
      toast.error(t.confirmationDraftFailed);
    } finally {
      setGapActionLoading(null);
    }
  };

  const handleCreateBenefitDraft = async (candidate: GapCandidate) => {
    const opportunityId = candidate.opportunityId || selectedGap?.id;
    if (!opportunityId) return;
    const loadingKey = `benefit:${candidate.id}`;
    setGapActionLoading(loadingKey);
    try {
      const draft = await createGapBenefitDraft(opportunityId, { candidateId: candidate.id, channel: 'sms' });
      setBenefitDraft(draft);
      toast.success(t.benefitDraftCreated);
    } catch (error) {
      console.error(error);
      toast.error(t.benefitDraftFailed);
    } finally {
      setGapActionLoading(null);
    }
  };

  const handleConfirmFollowUp = async () => {
    if (!followUpRecommendation) return;
    const success = await handleCreateGapFollowUpTask(followUpRecommendation.candidate, followUpBeauticianId);
    if (success) setFollowUpRecommendation(null);
  };

  useEffect(() => {
    if (scheduleView === 'demand' && !demandResult && !demandLoading) {
      void handleDemand();
    }
  }, [demandLoading, demandResult, scheduleView]);

  useEffect(() => {
    setFollowUpBeauticianId(getDefaultFollowUpBeauticianId(followUpRecommendation, beauticians));
  }, [beauticians, followUpRecommendation]);

  const handleSmartPublish = async () => {
    if (!currentStoreId) {
      toast.error(t.storeRequired);
      return;
    }
    if (!beauticians.length) return;
    if (!window.confirm(t.publishConfirm)) return;
    setSmartPublishing(true);
    try {
      const publishWeekStart = smartResult?.weekStart ?? weekStart;
      const publishSchedules = Object.keys(smartScheduleByBeautician).length ? smartScheduleByBeautician : scheduleByBeautician;
      const result = await publishSmartSchedule({
        runId: smartResult?.runId,
        weekStart: publishWeekStart,
        selectedAlternativeId: selectedAlternativeId ?? undefined,
        schedules: scheduleMapToSmartSchedules(publishSchedules, publishWeekStart),
      });
      setSmartResult(result);
      setLastPublishedRunId(result.runId ?? smartResult?.runId ?? null);
      setOriginalByBeautician(cloneScheduleMap(publishSchedules));
      toast.success(t.publishSuccess);
      await loadSchedule();
    } catch (error) {
      console.error(error);
      toast.error(t.publishFailed);
    } finally {
      setSmartPublishing(false);
    }
  };

  const handleRollback = async (versionId: number) => {
    if (!currentStoreId) {
      toast.error(t.storeRequired);
      return;
    }
    if (!window.confirm(t.rollbackConfirm)) return;
    setRollingBackVersionId(versionId);
    try {
      const result = await rollbackSmartSchedule({ weekStart, targetVersionId: versionId });
      setSmartResult(result);
      setLastPublishedRunId(result.runId ?? null);
      toast.success(t.rollbackSuccess);
      await loadSchedule();
    } catch (error) {
      console.error(error);
      toast.error(t.rollbackFailed);
    } finally {
      setRollingBackVersionId(null);
    }
  };

  const renderSlotButton = (beauticianId: number, dayIndex: number, slot: DisplaySlot, compact = false) => {
    const day = days[dayIndex];
    const daySlots = activeScheduleByBeautician[beauticianId]?.[dayIndex] ?? [];
    const sourceSlots = slot.sourceTimes
      .map((time) => daySlots.find((item) => item.time === time))
      .filter((item): item is ScheduleSlot => Boolean(item));
    const status = getDisplaySlotStatus(daySlots, day, slot);
    const reservationInfos = status === 'booked' ? getDisplaySlotReservations(sourceSlots) : [];
    const reservationHoverText = buildReservationHoverText(reservationInfos);
    const marker = slotMarkers.get(getSlotMarkerKey(beauticianId, day.fullDate, slot));
    const disabled = saving || scheduleView === 'smart' || status === 'expired' || status === 'booked';
    const menuOpen =
      editingSlot?.beauticianId === beauticianId &&
      editingSlot.dayIndex === dayIndex &&
      editingSlot.slotLabel === slot.label;

    return (
      <div
        key={`${beauticianId}-${dayIndex}-${slot.label}`}
        className="group relative"
        title={status === 'booked' ? reservationHoverText : undefined}
      >
        <button
          type="button"
          disabled={disabled}
          onClick={() => openSlotMenu(beauticianId, dayIndex, slot)}
          className={`relative w-full rounded-md border px-2 py-2 text-center text-sm font-medium transition ${getStatusClass(status)} ${disabled ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'} ${compact ? 'min-h-9' : 'min-h-10'} ${marker?.hardConflict ? 'ring-2 ring-red-400' : marker?.warning ? 'ring-2 ring-amber-300' : marker?.recommended || marker?.reservation ? 'ring-1 ring-blue-300' : ''}`}
        >
          {getStatusLabel(status, slot)}
          {(marker?.hardConflict || marker?.warning) && (
            <span
              className={`absolute -right-1 -top-1 rounded px-1 text-[10px] leading-4 text-white ${
                marker.hardConflict ? 'bg-red-500' : 'bg-amber-500'
              }`}
              title={marker.hardConflict ? t.hardConflict : t.warning}
            >
              {t.conflictMark}
            </span>
          )}
          {(marker?.recommended || marker?.reservation) && (
            <span
              className={`absolute bottom-0.5 left-1 rounded px-1 text-[10px] leading-4 text-white ${
                marker.reservation ? 'bg-blue-600' : 'bg-indigo-500'
              }`}
              title={marker.reservation ? t.booked : t.smartSchedule}
            >
              {marker.reservation ? t.reservationMark : t.recommendedMark}
            </span>
          )}
        </button>
        {status === 'booked' && reservationInfos.length > 0 && (
          <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 hidden w-72 -translate-x-1/2 rounded-md border border-blue-100 bg-white p-3 text-left text-xs text-gray-700 shadow-lg group-hover:block group-focus-within:block">
            <div className="mb-2 font-semibold text-gray-900">预约信息</div>
            <div className="space-y-2">
              {reservationInfos.map((reservation) => (
                <div key={reservation.id} className="space-y-1 border-b border-gray-100 pb-2 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-blue-700">
                      {reservation.startTime ?? '-'}-{reservation.endTime ?? '-'}
                    </span>
                    <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-600">
                      {getReservationStatusLabel(reservation.status)}
                    </span>
                  </div>
                  <div className="text-gray-900">{reservation.customerName || `客户 #${reservation.customerId ?? '-'}`}</div>
                  {reservation.customerPhone && <div className="text-gray-500">{reservation.customerPhone}</div>}
                  <div className="text-gray-600">{reservation.projectName || '项目待确认'}</div>
                  {reservation.remark && <div className="text-gray-500">备注：{reservation.remark}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
        {menuOpen && (
          <div className="absolute left-1/2 top-full z-20 mt-1 w-28 -translate-x-1/2 rounded-md border border-gray-200 bg-white p-1 shadow-lg">
            {([
              ['free', t.free],
              ['leave', t.leave],
            ] as const).map(([nextStatus, label]) => (
              <button
                key={nextStatus}
                type="button"
                onClick={() => void updateDisplaySlotStatus(beauticianId, dayIndex, slot, nextStatus)}
                className={`block w-full rounded px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                  nextStatus === status ? 'font-medium text-blue-600' : 'text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <Button variant="outline" className="h-9 gap-2 px-3 text-gray-600" onClick={() => setWeekOffset((value) => value - 1)}>
            <ChevronLeft className="h-4 w-4" /> {t.previousWeek}
          </Button>
          <span className="font-medium text-gray-800">
            {weekOffset === 0 ? t.currentWeek : weekOffset > 0 ? `${weekOffset}${t.weeksAfter}` : `${Math.abs(weekOffset)}${t.weeksBefore}`} ({formatWeekRange(weekStart)})
          </span>
          <Button variant="outline" className="h-9 gap-2 px-3 text-gray-600" onClick={() => setWeekOffset((value) => value + 1)}>
            {t.nextWeek} <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex rounded-md border border-gray-200 bg-white p-1">
          {([
            ['raw', t.rawScheduleView],
            ['demand', t.demandScheduleView],
            ['smart', t.smartScheduleView],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setScheduleView(key)}
              className={`rounded px-3 py-1.5 text-sm ${
                scheduleView === key ? 'bg-blue-600 text-white' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {scheduleView === 'smart' && smartResult && (
            <Button
              onClick={() => void handleSmartPublish()}
              disabled={smartPublishing || smartResult.summary.hardConflictCount > 0}
              className="h-9 gap-2 bg-emerald-600 px-4 text-white hover:bg-emerald-700 disabled:bg-gray-300"
            >
              {smartPublishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {t.publishSmartSchedule}
            </Button>
          )}
          {(scheduleView === 'raw' || (scheduleView === 'smart' && smartResult)) && (
            <div className="flex rounded-md border border-gray-200 bg-white p-1">
              <button
                type="button"
                onClick={() => setViewMode('day')}
                className={`rounded px-3 py-1.5 text-sm ${viewMode === 'day' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:text-gray-900'}`}
              >
                {t.byDay}
              </button>
              <button
                type="button"
                onClick={() => setViewMode('week')}
                className={`rounded px-3 py-1.5 text-sm ${viewMode === 'week' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:text-gray-900'}`}
              >
                {t.byWeek}
              </button>
            </div>
          )}
          {scheduleView === 'raw' && (
            <Button
              onClick={() => void handleSave()}
              disabled={saving || loading}
              className="h-9 gap-2 bg-[#1890ff] px-4 text-white hover:bg-[#1890ff]/90"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? t.saving : t.saveSchedule}
            </Button>
          )}
        </div>
      </div>

      {scheduleView === 'smart' && (
        <div className="rounded-lg border border-blue-100 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-blue-900">
            <Sparkles className="h-4 w-4" />
            {t.smartConfig}
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            <label className="space-y-1 text-sm text-gray-700">
              <span className="font-medium">{t.period}</span>
              <select
                value={smartConfig.period}
                onChange={(event) => setSmartConfig((current) => ({ ...current, period: event.target.value as SmartConfig['period'] }))}
                className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
              >
                <option value="current_view">{t.currentViewWeek}</option>
                <option value="this_week">{t.thisWeek}</option>
                <option value="next_week">{t.nextCalendarWeek}</option>
              </select>
            </label>
            <label className="space-y-1 text-sm text-gray-700">
              <span className="font-medium">{t.mode}</span>
              <select
                value={smartConfig.mode}
                onChange={(event) => setSmartConfig((current) => ({ ...current, mode: event.target.value as SmartConfig['mode'] }))}
                className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
              >
                <option value="balanced">{t.balancedMode}</option>
                <option value="reservation_first">{t.reservationFirst}</option>
                <option value="peak_first">{t.peakFirst}</option>
                <option value="cost_first">{t.costFirst}</option>
                <option value="fairness_first">{t.fairnessFirst}</option>
              </select>
            </label>
            <label className="space-y-1 text-sm text-gray-700">
              <span className="font-medium">{t.objective}</span>
              <select
                value={smartConfig.objective}
                onChange={(event) => setSmartConfig((current) => ({ ...current, objective: event.target.value as SmartConfig['objective'] }))}
                className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
              >
                <option value="cover_reservations">{t.coverReservations}</option>
                <option value="cover_peak">{t.coverPeak}</option>
                <option value="fairness">{t.fairness}</option>
                <option value="reduce_staff">{t.reduceStaff}</option>
              </select>
            </label>
            <label className="space-y-1 text-sm text-gray-700">
              <span className="font-medium">{t.peakMinStaff}</span>
              <input
                type="number"
                min={1}
                max={12}
                value={smartConfig.peakMinStaff}
                onChange={(event) => setSmartConfig((current) => ({ ...current, peakMinStaff: Number(event.target.value) }))}
                className="h-10 w-full rounded-md border border-gray-200 px-3 text-sm"
              />
            </label>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {([
              ['keepConfirmedReservations', t.keepConfirmedReservations],
              ['allowOverrideBusy', t.allowOverrideBusy],
              ['allowOverrideLeave', t.allowOverrideLeave],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={Boolean(smartConfig[key])}
                  onChange={(event) => setSmartConfig((current) => ({ ...current, [key]: event.target.checked }))}
                  className="h-4 w-4"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          {smartLoading && (
            <div className="mt-4 grid gap-2 md:grid-cols-5">
              {SMART_GENERATION_STEPS.map((step) => (
                <div key={step} className="flex items-center gap-2 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {step}
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 flex justify-end">
            <Button
              onClick={() => void handleSmartPreview()}
              disabled={smartLoading || loading || saving}
              className="h-9 gap-2 bg-blue-600 px-4 text-white hover:bg-blue-700"
            >
              {smartLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {t.generatePreview}
            </Button>
          </div>
        </div>
      )}

      {scheduleView === 'smart' && smartResult && (
        <div className="grid gap-3 lg:grid-cols-2">
          {scheduleView === 'smart' && smartResult && (
            <div className="rounded-lg border border-blue-100 bg-blue-50/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-blue-900">
                    <Sparkles className="h-4 w-4" />
                    {t.smartPreview}
                    <span className={`rounded px-2 py-0.5 text-xs ${lastPublishedRunId ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-blue-700'}`}>
                      {lastPublishedRunId ? t.publishedStatus : t.previewStatus}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-sm text-blue-800">
                    <span>{t.score}: {smartResult.score}</span>
                    <span>{t.reservationCoverage}: {Math.round(smartResult.summary.reservationCoverageRate * 100)}%</span>
                    <span>{t.peakCoverage}: {Math.round(smartResult.summary.peakCoverageRate * 100)}%</span>
                    <span>{t.skillMatch}: {Math.round((smartResult.summary.skillMatchRate ?? 1) * 100)}%</span>
                    <span>{t.fairnessScore}: {Math.round((smartResult.summary.fairnessScore ?? 1) * 100)}%</span>
                    <span>{t.estimatedLaborCost}: ¥{smartResult.summary.estimatedLaborCost ?? 0}</span>
                    {smartResult.solverStatus && <span>{t.solverStatus}: {smartResult.solverStatus}</span>}
                    <span>{t.hardConflicts}: {smartResult.summary.hardConflictCount}</span>
                    <span>{t.warnings}: {smartResult.summary.softWarningCount}</span>
                  </div>
                </div>
                {smartResult.summary.hardConflictCount > 0 && (
                  <div className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-white px-3 py-2 text-sm text-red-600">
                    <AlertTriangle className="h-4 w-4" />
                    {t.cannotPublish}
                  </div>
                )}
              </div>
              {(smartResult.alternatives?.length ?? 0) > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-blue-900">{t.alternatives}</span>
                  {smartResult.alternatives?.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectAlternative(item)}
                      className={`rounded-md border px-3 py-1.5 text-sm ${
                        selectedAlternativeId === item.id
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-blue-200 bg-white text-blue-700 hover:bg-blue-50'
                      }`}
                    >
                      {item.label} · {item.score}
                    </button>
                  ))}
                </div>
              )}
              {smartResult.explanations.length > 0 && (
                <div className="mt-3 space-y-1 text-sm text-blue-900">
                  {smartResult.explanations.slice(0, 3).map((item) => (
                    <div key={item}>{item}</div>
                  ))}
                </div>
              )}
              {(smartResult.conflicts?.length ?? 0) > 0 && (
                <div className="mt-3 space-y-1 text-sm text-gray-700">
                  {smartResult.conflicts?.slice(0, 3).map((item, index) => (
                    <div key={`${item.type}-${index}`}>
                      [{item.severity === 'hard' ? t.hardConflict : t.warning}] {item.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {scheduleView === 'smart' && scheduleVersions.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold text-gray-800">
              {currentVersion ? `${t.publishedVersion} #${currentVersion.id}` : t.noPublishedVersion}
            </div>
            <div className="flex flex-wrap gap-2">
              {scheduleVersions.slice(0, 4).map((version) => (
                <Button
                  key={version.id}
                  variant="outline"
                  onClick={() => void handleRollback(version.id)}
                  disabled={rollingBackVersionId === version.id || version.id === currentVersion?.id}
                  className="h-8 gap-2 px-3 text-gray-700"
                >
                  {rollingBackVersionId === version.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  #{version.id} {version.status === 'published' ? t.publishedStatus : t.rollbackSchedule}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex h-96 items-center justify-center rounded-xl border border-gray-200 bg-white">
          <Loader2 className="h-8 w-8 animate-spin text-[#1890ff]" />
          <span className="ml-2 text-gray-500">{t.loadingSchedule}</span>
        </div>
      ) : scheduleView === 'demand' ? (
        demandLoading && !demandResult ? (
          <div className="flex h-96 items-center justify-center rounded-xl border border-gray-200 bg-white">
            <Loader2 className="h-8 w-8 animate-spin text-[#1890ff]" />
            <span className="ml-2 text-gray-500">{t.loadingSchedule}</span>
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="grid min-w-[980px]" style={{ gridTemplateColumns: '120px repeat(7, minmax(120px, 1fr))' }}>
                <div className="border-b border-r border-gray-200 bg-gray-50/70 px-3 py-4 text-center text-sm font-medium text-gray-700">
                  {t.demandSummary}
                </div>
                {days.map((day) => (
                  <div key={day.fullDate} className="border-b border-r border-gray-200 bg-gray-50/70 py-4 text-center last:border-r-0">
                    <div className="font-medium text-gray-800">{day.name}</div>
                    <div className="mt-1 text-xs text-gray-500">{day.date}</div>
                  </div>
                ))}

                {DEMAND_PERIODS.map((period) => (
                  <div key={period.key} className="contents">
                    <div className="border-b border-r border-gray-200 bg-white px-3 py-5 text-center text-sm font-medium text-gray-700">
                      <div className="font-bold text-gray-900">{period.label}</div>
                      <div className="mt-1 text-xs text-gray-500">{period.timeRange}</div>
                    </div>
                    {days.map((day) => {
                      const demandSlot = aggregateDemandPeriod(day.fullDate, period, demandSlotByKey);
                      const demandLoad = getDemandLoad(demandSlot);
                      const demandMetrics = getDemandServiceMetrics(demandSlot);
                      const isPastSlot = isPastDemandPeriod(day.fullDate, period);
                      return (
                        <div key={`${day.fullDate}-${period.key}-demand`} className="border-b border-r border-gray-100 bg-[#fafafa] px-4 py-3 last:border-r-0">
                          <div
                            title={
                              isPastSlot
                                ? `${day.fullDate} ${period.label} ${period.timeRange} ${t.expired}`
                                : demandSlot
                                ? `${day.fullDate} ${period.label} ${period.timeRange} ${t.expectedTraffic}: ${demandMetrics?.expectedServiceDemand}, ${t.suggestedStaff}: ${demandMetrics?.requiredServiceCapacity}, ${t.scheduledStaff}: ${demandMetrics?.scheduledServiceCapacity}`
                                : `${day.fullDate} ${period.label} ${period.timeRange}`
                            }
                            className={`flex min-h-[118px] w-full flex-col justify-center rounded-md border px-2 py-2 text-center text-xs font-medium ${isPastSlot ? 'border-gray-200 bg-gray-50 text-gray-400' : getDemandCellClass(demandSlot)}`}
                          >
                            {isPastSlot ? (
                              <span className="text-sm">{t.expired}</span>
                            ) : (
                              <>
                                <span className="text-sm font-semibold">{getDemandLevelLabel(demandSlot)}</span>
                                <span className="mt-1">{t.expectedTraffic}: {demandMetrics?.expectedServiceDemand ?? '-'}</span>
                                <span>{t.suggestedStaff}: {demandMetrics?.requiredServiceCapacity ?? '-'}</span>
                                <span>{t.scheduledStaff}: {demandMetrics?.scheduledServiceCapacity ?? '-'}</span>
                                {demandLoad?.loadLevel === 'high' && (
                                  <span className="mt-1 rounded bg-white/70 px-1 py-0.5 text-[11px]">
                                    {t.staffGap}: {Math.abs(demandLoad.staffDelta)} 次
                                  </span>
                                )}
                                <span className="mt-1 text-[11px]">{t.recommendedAction}: {getDemandActionLabel(demandSlot)}</span>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            <aside className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <ClipboardList className="h-4 w-4 text-[#1890ff]" />
                    {t.weeklyGapRecommendations}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">{t.weeklyGapRecommendationSubtitle}</div>
                </div>
                <span className="rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                  {weeklyGapRecommendations.length}
                </span>
              </div>

              <div className="max-h-[620px] space-y-3 overflow-y-auto pr-1">
                {weeklyGapRecommendations.map((item) => (
                  <div key={item.key} className="rounded-lg border border-gray-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-gray-900">{item.candidate.customerName || `客户 #${item.candidate.customerId}`}</div>
                        <div className="mt-1 text-xs text-gray-500">{maskPhone(item.candidate.customerPhone)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-[#1890ff]">{formatPercent(item.candidate.expectedFillRate)}</div>
                        <div className="text-[11px] text-gray-500">{t.expectedFillRate}</div>
                      </div>
                    </div>
                    <div className="mt-2 space-y-1 text-xs text-gray-600">
                      <div>{t.recommendedProject}: <span className="text-gray-900">{item.candidate.projectName || t.pendingProject}</span></div>
                      <div>{t.suggestedAppointmentTime}: <span className="text-gray-900">{item.appointmentTime}</span></div>
                      <div>{t.expectedRevenue}: <span className="text-gray-900">¥{Math.round(item.candidate.estimatedRevenue)}</span></div>
                      <div>{t.recommendedFollowUpAssignee}: <span className="text-gray-900">{getRecommendedFollowUpBeauticianName(item, beauticians)}</span></div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {getVisibleCandidateReasons(item.candidate.reasons, 4).map((reason) => (
                        <span key={reason} className="rounded bg-blue-50 px-2 py-1 text-[11px] text-blue-700">{reason}</span>
                      ))}
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <Button type="button" variant="outline" className="h-8 px-2 text-xs" onClick={() => setSelectedGapCustomer(item)}>
                        {t.customerDetails}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-8 gap-1 px-2 text-xs text-emerald-700"
                        disabled={gapActionLoading !== null}
                        onClick={() => void handleCreateBenefitDraft(item.candidate)}
                      >
                        {gapActionLoading === `benefit:${item.candidate.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Gift className="h-3.5 w-3.5" />}
                        {t.pushBenefit}
                      </Button>
                      <Button
                        type="button"
                        className="h-8 bg-[#1890ff] px-2 text-xs text-white hover:bg-[#1890ff]/90"
                        disabled={gapActionLoading !== null || item.candidate.status === 'task_created'}
                        onClick={() => setFollowUpRecommendation(item)}
                      >
                        {item.candidate.status === 'task_created' ? t.followUpTaskCreated : t.sendFollowUp}
                      </Button>
                    </div>
                  </div>
                ))}

                {!weeklyGapRecommendations.length && (
                  <div className="rounded-lg border border-dashed border-gray-300 p-5 text-center text-sm text-gray-500">
                    {t.noWeeklyGapRecommendations}
                  </div>
                )}
              </div>
            </aside>
          </div>
        )
      ) : scheduleView === 'smart' && !smartResult ? null : viewMode === 'week' ? (
        <>
          <div className="flex overflow-x-auto border-b border-gray-200">
            {beauticians.map((beautician) => (
              <button
                key={beautician.id}
                type="button"
                onClick={() => setActiveBeauticianId(beautician.id)}
                className={`relative min-w-20 px-6 py-3 text-sm font-medium transition-colors ${
                  activeBeauticianId === beautician.id ? 'text-[#1890ff]' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {beautician.name}
                {activeBeauticianId === beautician.id && <span className="absolute bottom-0 left-0 h-0.5 w-full bg-[#1890ff]" />}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="grid min-w-[980px]" style={{ gridTemplateColumns: '120px repeat(7, minmax(120px, 1fr))' }}>
              <div className="border-b border-r border-gray-200 bg-gray-50/70 px-3 py-4 text-center text-sm font-medium text-gray-500">
                {activeBeautician?.name ?? ''}
              </div>
              {days.map((day) => (
                <div key={day.fullDate} className="border-b border-r border-gray-200 bg-gray-50/70 py-4 text-center last:border-r-0">
                  <div className="font-medium text-gray-800">{day.name}</div>
                  <div className="mt-1 text-xs text-gray-500">{day.date}</div>
                </div>
              ))}

              <div className="border-b border-r border-gray-200 bg-orange-50/60 px-3 py-3 text-center text-sm font-bold text-orange-800">
                {t.morning}
              </div>
              {days.map((day) => (
                <div key={`${day.fullDate}-morning`} className="border-b border-r border-gray-100 bg-[#fafafa] last:border-r-0" />
              ))}

              {DISPLAY_SLOTS.filter((slot) => slot.periodLabel === 'morning').map((slot) => (
                <div key={slot.label} className="contents">
                  <div className="border-b border-r border-gray-200 bg-white px-3 py-3 text-center text-sm font-medium text-gray-600">
                    {slot.label}
                  </div>
                  {days.map((day, dayIndex) => (
                    <div key={`${day.fullDate}-${slot.label}`} className="border-b border-r border-gray-100 bg-[#fafafa] px-4 py-2 last:border-r-0">
                      {activeBeauticianId ? renderSlotButton(activeBeauticianId, dayIndex, slot, true) : null}
                    </div>
                  ))}
                </div>
              ))}

              <div className="border-b border-r border-gray-200 bg-green-50/60 px-3 py-3 text-center text-sm font-bold text-green-800">
                {t.afternoon}
              </div>
              {days.map((day) => (
                <div key={`${day.fullDate}-afternoon`} className="border-b border-r border-gray-100 bg-[#fafafa] last:border-r-0" />
              ))}

              {DISPLAY_SLOTS.filter((slot) => slot.periodLabel === 'afternoon').map((slot) => (
                <div key={slot.label} className="contents">
                  <div className="border-b border-r border-gray-200 bg-white px-3 py-3 text-center text-sm font-medium text-gray-600">
                    {slot.label}
                  </div>
                  {days.map((day, dayIndex) => (
                    <div key={`${day.fullDate}-${slot.label}`} className="border-b border-r border-gray-100 bg-[#fafafa] px-4 py-2 last:border-r-0">
                      {activeBeauticianId ? renderSlotButton(activeBeauticianId, dayIndex, slot, true) : null}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="flex overflow-x-auto border-b border-gray-200">
            {days.map((day, index) => (
              <button
                key={day.fullDate}
                type="button"
                onClick={() => setActiveDayIndex(index)}
                className={`relative min-w-24 px-6 py-3 text-sm font-medium transition-colors ${
                  activeDayIndex === index ? 'text-[#1890ff]' : 'text-gray-700 hover:text-gray-900'
                }`}
              >
                {day.name}
                {activeDayIndex === index && <span className="absolute bottom-0 left-0 h-0.5 w-full bg-[#1890ff]" />}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
            <div
              className="grid min-w-[980px]"
              style={{ gridTemplateColumns: `150px repeat(${Math.max(beauticians.length, 1)}, minmax(160px, 1fr))` }}
            >
              <div className="border-b border-r border-gray-200 bg-gray-50 px-4 py-4 text-center font-medium text-gray-700">
                {activeDay?.fullDate}
              </div>
              {beauticians.map((beautician) => (
                <div key={beautician.id} className="border-b border-r border-gray-200 bg-gray-50 px-4 py-4 text-center font-semibold text-gray-700">
                  {beautician.name}
                </div>
              ))}
              {DISPLAY_SLOTS.map((slot) => (
                <div key={slot.label} className="contents">
                  <div className="border-b border-r border-gray-200 px-4 py-4 text-center text-sm font-medium text-gray-600">
                    {slot.label}
                  </div>
                  {beauticians.map((beautician) => (
                    <div key={`${beautician.id}-${slot.label}`} className="border-b border-r border-gray-100 bg-[#fafafa] px-4 py-3">
                      {renderSlotButton(beautician.id, activeDayIndex, slot, true)}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {scheduleView === 'demand' && (
        <div className="rounded-lg bg-gray-50 px-5 py-4">
          <div className="mb-3 flex flex-wrap items-center gap-3 text-sm font-medium text-gray-700">
            <span>{t.demandLegend}</span>
            {demandResult && (
              <>
                <span className="text-gray-500">|</span>
                <span>{t.highLoadSlots}: {demandResult.summary.highLoadSlots ?? demandResult.summary.underStaffedSlots}</span>
                <span>{t.lowLoadSlots}: {demandResult.summary.lowLoadSlots ?? demandResult.slots.filter((slot) => getDemandLoad(slot)?.loadLevel === 'low').length}</span>
                {gapResult && (
                  <>
                    <span>{t.gapOpportunities}: {gapResult.summary.openOpportunityCount}</span>
                    <span>{t.recommendedCustomers}: {gapResult.summary.candidateCount}</span>
                    <span>{t.expectedRevenue}: ¥{Math.round(gapResult.summary.expectedRevenue)}</span>
                  </>
                )}
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-5 text-sm text-gray-600">
            <LegendItem className="border-emerald-300 bg-emerald-50" label={`${t.demandLow} (${t.demandLowRange})`} />
            <LegendItem className="border-amber-300 bg-amber-50" label={`${t.demandMedium} (${t.demandMediumRange})`} />
            <LegendItem className="border-rose-300 bg-rose-50" label={`${t.demandHigh} (${t.demandHighRange})`} />
            <span>{t.demandStaffHint}</span>
          </div>
        </div>
      )}

      {scheduleView !== 'demand' && (scheduleView !== 'smart' || smartResult) && (
        <div className="rounded-lg bg-gray-50 px-5 py-4">
          <div className="mb-3 text-sm font-medium text-gray-700">
            {t.statusDescription}: {viewMode === 'week' && activeBeautician ? `${t.viewing} ${activeBeautician.name}${t.weeklySchedule}` : `${t.viewing} ${activeDay?.name || ''}${t.allStaffSchedule}`}
          </div>
          <div className="flex flex-wrap items-center gap-5 text-sm text-gray-600">
            <LegendItem className="border-green-400 bg-green-50" label={t.free} />
            <LegendItem className="border-blue-300 bg-blue-50" label={t.booked} />
            <LegendItem className="border-gray-300 bg-gray-100" label={t.expired} />
            <LegendItem className="border-red-300 bg-red-50" label={t.leave} />
            {scheduleView === 'smart' && (
              <>
                <LegendBadge className="bg-indigo-500 text-white" label={`${t.recommendedMark} ${t.smartSchedule}`} />
                <LegendBadge className="bg-blue-600 text-white" label={`${t.reservationMark} ${t.booked}`} />
                <LegendBadge className="bg-red-500 text-white" label={`${t.conflictMark} ${t.hardConflict}/${t.warning}`} />
              </>
            )}
          </div>
        </div>
      )}

      {selectedGapCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setSelectedGapCustomer(null)}>
          <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-gray-900">{t.customerDetails}</div>
                <div className="mt-1 text-sm text-gray-500">
                  {selectedGapCustomer.candidate.customerName || `客户 #${selectedGapCustomer.candidate.customerId}`} · {maskPhone(selectedGapCustomer.candidate.customerPhone)}
                </div>
              </div>
              <button
                type="button"
                className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                onClick={() => setSelectedGapCustomer(null)}
                aria-label="关闭"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-3 text-sm text-gray-700">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                  <div className="text-gray-500">{t.expectedFillRate}</div>
                  <div className="mt-1 font-semibold text-gray-900">{formatPercent(selectedGapCustomer.candidate.expectedFillRate)}</div>
                </div>
                <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                  <div className="text-gray-500">{t.expectedRevenue}</div>
                  <div className="mt-1 font-semibold text-gray-900">¥{Math.round(selectedGapCustomer.candidate.estimatedRevenue)}</div>
                </div>
              </div>
              <div>
                <div className="font-medium text-gray-900">{t.recommendedProject}</div>
                <div className="mt-1">{selectedGapCustomer.candidate.projectName || t.pendingProject}</div>
              </div>
              <div>
                <div className="font-medium text-gray-900">{t.suggestedAppointmentTime}</div>
                <div className="mt-1">{selectedGapCustomer.appointmentTime}</div>
              </div>
              <div>
                <div className="mb-2 font-medium text-gray-900">{t.candidateReasons}</div>
                <div className="flex flex-wrap gap-2">
                  {getVisibleCandidateReasons(selectedGapCustomer.candidate.reasons, 8).map((reason) => (
                    <span key={reason} className="rounded bg-blue-50 px-2 py-1 text-blue-700">{reason}</span>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 font-medium text-gray-900">{t.riskTips}</div>
                <div className="flex flex-wrap gap-2">
                  {(selectedGapCustomer.candidate.risks?.length ? selectedGapCustomer.candidate.risks : ['需店长确认客户意愿']).map((risk) => (
                    <span key={risk} className="rounded bg-amber-50 px-2 py-1 text-amber-700">{risk}</span>
                  ))}
                </div>
              </div>
              {selectedGapCustomer.candidate.messageDraft && (
                <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                  {selectedGapCustomer.candidate.messageDraft}
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setSelectedGapCustomer(null)}>关闭</Button>
              <Button
                type="button"
                variant="outline"
                className="gap-2 text-emerald-700"
                disabled={gapActionLoading !== null}
                onClick={() => void handleCreateBenefitDraft(selectedGapCustomer.candidate)}
              >
                {gapActionLoading === `benefit:${selectedGapCustomer.candidate.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
                {t.pushBenefit}
              </Button>
              <Button
                type="button"
                className="bg-[#1890ff] text-white hover:bg-[#1890ff]/90"
                disabled={selectedGapCustomer.candidate.status === 'task_created'}
                onClick={() => {
                  setFollowUpRecommendation(selectedGapCustomer);
                  setSelectedGapCustomer(null);
                }}
              >
                {selectedGapCustomer.candidate.status === 'task_created' ? t.followUpTaskCreated : t.sendFollowUp}
              </Button>
            </div>
          </div>
        </div>
      )}

      {followUpRecommendation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setFollowUpRecommendation(null)}>
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-gray-900">{t.followUpConfirmTitle}</div>
                <div className="mt-1 text-sm text-gray-500">{t.followUpConfirmDescription}</div>
              </div>
              <button
                type="button"
                className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                onClick={() => setFollowUpRecommendation(null)}
                aria-label="关闭"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-2 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
              <div><span className="text-gray-500">客户：</span>{followUpRecommendation.candidate.customerName || `客户 #${followUpRecommendation.candidate.customerId}`}</div>
              <div><span className="text-gray-500">{t.recommendedProject}：</span>{followUpRecommendation.candidate.projectName || t.pendingProject}</div>
              <div><span className="text-gray-500">{t.suggestedAppointmentTime}：</span>{followUpRecommendation.appointmentTime}</div>
              <div><span className="text-gray-500">{t.expectedFillRate}：</span>{formatPercent(followUpRecommendation.candidate.expectedFillRate)}</div>
            </div>

            <div className="mt-4">
              <div className="mb-2 text-sm font-medium text-gray-900">{t.followUpAssignee}</div>
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-gray-200 bg-white p-2">
                {beauticians.filter((item) => item.status !== '离职').map((beautician) => {
                  const isPreferred = Number(followUpRecommendation.candidate.preferredBeauticianId) === beautician.id;
                  return (
                    <label
                      key={beautician.id}
                      className={`flex cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm ${
                        followUpBeauticianId === beautician.id ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-gray-100 bg-gray-50 text-gray-700'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="gap-follow-up-beautician"
                          checked={followUpBeauticianId === beautician.id}
                          onChange={() => setFollowUpBeauticianId(beautician.id)}
                          className="h-4 w-4"
                        />
                        <span>{beautician.name}</span>
                      </span>
                      {isPreferred && <span className="rounded bg-blue-100 px-2 py-0.5 text-[11px] text-blue-700">{t.preferredBeautician}</span>}
                    </label>
                  );
                })}
                {!beauticians.filter((item) => item.status !== '离职').length && (
                  <div className="px-3 py-2 text-sm text-gray-500">{t.noFollowUpAssignee}</div>
                )}
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setFollowUpRecommendation(null)}>取消</Button>
              <Button
                type="button"
                className="gap-2 bg-[#1890ff] text-white hover:bg-[#1890ff]/90"
                disabled={gapActionLoading !== null}
                onClick={() => void handleConfirmFollowUp()}
              >
                {gapActionLoading === `task:${followUpRecommendation.candidate.id}` && <Loader2 className="h-4 w-4 animate-spin" />}
                {t.sendFollowUp}
              </Button>
            </div>
          </div>
        </div>
      )}

      {benefitDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setBenefitDraft(null)}>
          <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                  <Gift className="h-5 w-5 text-emerald-600" />
                  {t.benefitDraftTitle}
                </div>
                <div className="mt-1 text-sm text-gray-500">{t.draftNotSent}</div>
              </div>
              <button
                type="button"
                className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                onClick={() => setBenefitDraft(null)}
                aria-label="关闭"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-sm text-gray-700">
              <div className="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2">
                <div className="font-semibold text-emerald-800">{benefitDraft.benefitTitle}</div>
                <div className="mt-1 text-emerald-700">{benefitDraft.benefitText}</div>
              </div>
              <div>
                <div className="mb-1 font-medium text-gray-900">{t.benefitCopy}</div>
                <div className="rounded-md border border-gray-200 bg-gray-50 p-3 leading-6">{benefitDraft.copy}</div>
              </div>
              <div>
                <div className="mb-1 font-medium text-gray-900">{t.benefitLink}</div>
                <div className="break-all rounded-md border border-gray-200 bg-gray-50 p-3 text-blue-700">{benefitDraft.link}</div>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <Button type="button" variant="outline" onClick={() => setBenefitDraft(null)}>关闭</Button>
            </div>
          </div>
        </div>
      )}

      {selectedGap && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={() => setSelectedGap(null)}>
          <aside
            className="h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                  <ClipboardList className="h-5 w-5 text-[#1890ff]" />
                  {t.gapOpportunities}
                </div>
                <div className="mt-1 text-sm text-gray-500">
                  {selectedGap.date} {selectedGap.startTime}-{selectedGap.endTime}
                </div>
              </div>
              <button
                type="button"
                className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                onClick={() => setSelectedGap(null)}
                aria-label="关闭"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                <div className="text-gray-500">{t.gapOpportunities}</div>
                <div className="mt-1 font-semibold text-gray-900">{selectedGap.availableCapacity}</div>
              </div>
              <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                <div className="text-gray-500">{t.recommendedCustomers}</div>
                <div className="mt-1 font-semibold text-gray-900">{selectedGap.candidateCount}</div>
              </div>
              <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                <div className="text-gray-500">{t.expectedFillRate}</div>
                <div className="mt-1 font-semibold text-gray-900">{formatPercent(selectedGap.expectedFillRate)}</div>
              </div>
              <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                <div className="text-gray-500">{t.expectedRevenue}</div>
                <div className="mt-1 font-semibold text-gray-900">¥{Math.round(selectedGap.estimatedRevenue)}</div>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {selectedGap.candidates.slice(0, 3).map((candidate) => (
                <div key={candidate.id} className="rounded-lg border border-gray-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-gray-900">{candidate.customerName || `客户 #${candidate.customerId}`}</div>
                      <div className="mt-1 text-sm text-gray-500">
                        {maskPhone(candidate.customerPhone)} · {candidate.projectName || '推荐项目待确认'}
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="font-semibold text-[#1890ff]">{Math.round(candidate.score)}</div>
                      <div className="text-gray-500">{t.expectedFillRate} {formatPercent(candidate.expectedFillRate)}</div>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 text-sm text-gray-700">
                    <div>
                      <div className="mb-1 font-medium text-gray-900">{t.candidateReasons}</div>
                      <div className="flex flex-wrap gap-2">
                        {getVisibleCandidateReasons(candidate.reasons, 8).map((reason) => (
                          <span key={reason} className="rounded bg-blue-50 px-2 py-1 text-blue-700">{reason}</span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 font-medium text-gray-900">{t.riskTips}</div>
                      <div className="flex flex-wrap gap-2">
                        {(candidate.risks?.length ? candidate.risks : ['需店长确认客户意愿']).map((risk) => (
                          <span key={risk} className="rounded bg-amber-50 px-2 py-1 text-amber-700">{risk}</span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {candidate.messageDraft && (
                    <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                      {candidate.messageDraft}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8 gap-2"
                      disabled={gapActionLoading !== null || candidate.status === 'task_created'}
                      onClick={() => {
                        setFollowUpRecommendation({
                          key: `${selectedGap.id}:${candidate.id}`,
                          opportunity: selectedGap,
                          candidate,
                          appointmentTime: formatGapAppointmentTime(selectedGap),
                        });
                      }}
                    >
                      <ClipboardList className="h-4 w-4" />
                      {candidate.status === 'task_created' ? t.followUpTaskCreated : t.createFollowUpTask}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8 gap-2"
                      disabled={gapActionLoading !== null}
                      onClick={() => void handleCreateConfirmationDraft(candidate)}
                    >
                      {gapActionLoading === `draft:${candidate.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
                      {t.confirmationDraft}
                    </Button>
                  </div>
                </div>
              ))}

              {selectedGap.candidates.length === 0 && (
                <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
                  {t.noGapOpportunity}
                </div>
              )}
            </div>

            {confirmationDraft && (
              <div className="mt-5 rounded-lg border border-blue-200 bg-blue-50 p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="font-semibold text-blue-900">{t.confirmationDraft}</div>
                  <span className="rounded bg-white px-2 py-1 text-xs font-medium text-blue-700">{t.draftNotSent}</span>
                </div>
                <div className="whitespace-pre-wrap text-sm text-blue-900">{confirmationDraft.message}</div>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function LegendItem({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-4 w-4 rounded border ${className}`} />
      {label}
    </span>
  );
}

function LegendBadge({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`rounded px-1 text-[10px] leading-4 ${className}`}>{label.slice(0, 1)}</span>
      {label}
    </span>
  );
}
