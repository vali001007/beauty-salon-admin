import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, ChevronLeft, ChevronRight, Loader2, Save, SearchCheck, Sparkles, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { getBeauticians } from '@/api/beautician';
import {
  evaluateSmartSchedule,
  getSchedulingDemand,
  getWeeklySchedules,
  previewSmartSchedule,
  publishSmartSchedule,
  saveSchedule,
  type SchedulingDemandResult,
  type SmartScheduleItem,
  type SmartSchedulingOptions,
  type SmartSchedulingResult,
} from '@/api/scheduling';
import type { Beautician, ScheduleSlot } from '@/types';
import { useStoreStore } from '@/stores/storeStore';
import { Button } from '../components/UI';

type ViewMode = 'week' | 'day';
type SlotStatus = 'normal' | 'booked' | 'expired' | 'leave' | 'busy';
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
  coverReservations: '\u8986\u76d6\u9884\u7ea6',
  coverPeak: '\u8986\u76d6\u9ad8\u5cf0',
  fairness: '\u5de5\u65f6\u516c\u5e73',
  reduceStaff: '\u51cf\u5c11\u4eba\u529b',
  keepConfirmedReservations: '\u4fdd\u7559\u5df2\u786e\u8ba4\u9884\u7ea6\u7f8e\u5bb9\u5e08',
  allowOverrideBusy: '\u5141\u8bb8\u8986\u76d6\u5fd9\u788c\u65f6\u6bb5',
  allowOverrideLeave: '\u5141\u8bb8\u8986\u76d6\u8bf7\u5047\u65f6\u6bb5',
  publishConfirm: '\u53d1\u5e03\u524d\u4f1a\u518d\u6b21\u6821\u9a8c\u786c\u51b2\u7a81\uff0c\u5e76\u8986\u76d6\u672c\u5468\u5bf9\u5e94\u7f8e\u5bb9\u5e08\u73ed\u8868\u3002\u786e\u8ba4\u53d1\u5e03\uff1f',
  publishSmartSchedule: '\u53d1\u5e03\u667a\u80fd\u6392\u73ed',
  checkConflicts: '\u68c0\u67e5\u51b2\u7a81',
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
  loadingSchedule: '\u52a0\u8f7d\u6392\u73ed\u6570\u636e...',
  morning: '\u4e0a\u5348',
  afternoon: '\u4e0b\u5348',
  statusDescription: '\u72b6\u6001\u8bf4\u660e',
  viewing: '\u5f53\u524d\u67e5\u770b',
  weeklySchedule: '\u7684\u5468\u6392\u73ed',
  allStaffSchedule: '\u7684\u5168\u5458\u6392\u73ed',
  normal: '\u6b63\u5e38',
  booked: '\u5df2\u9884\u7ea6',
  expired: '\u5df2\u8fc7\u671f',
  leave: '\u8bf7\u5047',
  busy: '\u5fd9\u788c',
  loadBeauticiansFailed: '\u52a0\u8f7d\u7f8e\u5bb9\u5e08\u5931\u8d25',
  loadScheduleFailed: '\u52a0\u8f7d\u6392\u73ed\u6570\u636e\u5931\u8d25',
  saveSuccess: '\u6392\u73ed\u4fdd\u5b58\u6210\u529f',
  saveFailed: '\u6392\u73ed\u4fdd\u5b58\u5931\u8d25\uff0c\u5df2\u56de\u6eda\u4fee\u6539',
  previewSuccess: '\u667a\u80fd\u6392\u73ed\u9884\u89c8\u5df2\u751f\u6210',
  previewFailed: '\u667a\u80fd\u6392\u73ed\u751f\u6210\u5931\u8d25',
  publishSuccess: '\u667a\u80fd\u6392\u73ed\u5df2\u53d1\u5e03',
  publishFailed: '\u5b58\u5728\u6392\u73ed\u51b2\u7a81\uff0c\u53d1\u5e03\u5931\u8d25',
  evaluateSuccess: '\u51b2\u7a81\u68c0\u67e5\u5df2\u5b8c\u6210',
  evaluateFailed: '\u51b2\u7a81\u68c0\u67e5\u5931\u8d25',
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

const DEFAULT_SMART_CONFIG: SmartConfig = {
  period: 'current_view',
  mode: 'copy_last_week_optimize',
  objective: 'cover_reservations',
  keepConfirmedReservations: true,
  allowOverrideBusy: false,
  allowOverrideLeave: false,
  peakMinStaff: 3,
};

function getWeekStart(offset: number): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1) + offset * 7;
  const monday = new Date(now);
  monday.setDate(diff);
  return monday.toISOString().split('T')[0];
}

function getSmartWeekOffset(period: SmartConfig['period'], currentOffset: number): number {
  if (period === 'this_week') return 0;
  if (period === 'next_week') return 1;
  return currentOffset;
}

function addDays(dateText: string, days: number): string {
  const date = new Date(dateText);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
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
      available: false,
      status: 'busy',
    })),
  );
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
      return {
        ...slot,
        available: !['busy', 'leave'].includes(String(item.status)),
        status: item.status === 'available' ? 'normal' : item.status,
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
        const blockedStatus = sourceSlots.find((item) => ['leave', 'busy'].includes(String(item?.status)))?.status;
        const allAvailable = sourceSlots.every((item) => item?.available);
        if (!blockedStatus && !allAvailable) return [];
        return [{
          beauticianId: Number(beauticianId),
          date,
          startTime: slot.start,
          endTime: toEndTime(slot.start),
          status: blockedStatus ?? 'available',
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
  if (sourceSlots.some((item) => item?.status === 'booked')) return 'booked';
  if (sourceSlots.some((item) => item?.status === 'leave')) return 'leave';
  if (sourceSlots.some((item) => item?.status === 'busy')) return 'busy';
  return sourceSlots.every((item) => item?.available) ? 'normal' : 'busy';
}

function setDisplaySlotStatus(
  daySlots: ScheduleSlot[],
  slot: DisplaySlot,
  status: Extract<SlotStatus, 'normal' | 'busy' | 'leave'>,
): ScheduleSlot[] {
  return daySlots.map((item) =>
    slot.sourceTimes.includes(item.time)
      ? { ...item, available: status === 'normal', status }
      : item,
  );
}

function getStatusClass(status: SlotStatus) {
  const styles: Record<SlotStatus, string> = {
    normal: 'border-green-400 bg-blue-50 text-green-600 hover:bg-green-50',
    booked: 'border-blue-300 bg-blue-50 text-blue-600',
    expired: 'border-gray-300 bg-gray-50 text-gray-400',
    leave: 'border-red-300 bg-red-50 text-red-600',
    busy: 'border-orange-300 bg-orange-50 text-orange-600 hover:bg-orange-100',
  };
  return styles[status];
}

function getStatusLabel(status: SlotStatus, slot: DisplaySlot) {
  const labels: Record<SlotStatus, string> = {
    normal: slot.label,
    booked: t.booked,
    expired: slot.label,
    leave: t.leave,
    busy: t.busy,
  };
  return labels[status];
}

export function Scheduling() {
  const { currentStoreId, stores, setCurrentStore, loadStores } = useStoreStore();
  const [beauticians, setBeauticians] = useState<Beautician[]>([]);
  const [activeBeauticianId, setActiveBeauticianId] = useState<number | null>(null);
  const [activeDayIndex, setActiveDayIndex] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [weekOffset, setWeekOffset] = useState(0);
  const [scheduleByBeautician, setScheduleByBeautician] = useState<ScheduleMap>({});
  const [originalByBeautician, setOriginalByBeautician] = useState<ScheduleMap>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [smartLoading, setSmartLoading] = useState(false);
  const [smartPublishing, setSmartPublishing] = useState(false);
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [demandLoading, setDemandLoading] = useState(false);
  const [smartResult, setSmartResult] = useState<SmartSchedulingResult | null>(null);
  const [demandResult, setDemandResult] = useState<SchedulingDemandResult | null>(null);
  const [editingSlot, setEditingSlot] = useState<EditingSlot>(null);
  const [smartConfigOpen, setSmartConfigOpen] = useState(false);
  const [smartConfig, setSmartConfig] = useState<SmartConfig>(DEFAULT_SMART_CONFIG);
  const [lastPublishedRunId, setLastPublishedRunId] = useState<string | null>(null);

  const weekStart = getWeekStart(weekOffset);
  const days = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const slotMarkers = useMemo(() => buildSlotMarkers(smartResult, DISPLAY_SLOTS), [smartResult]);
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
      setSmartResult(null);
      setDemandResult(null);
    } catch {
      toast.error(t.loadScheduleFailed);
    } finally {
      setLoading(false);
    }
  }, [beauticians, currentStoreId, weekStart]);

  useEffect(() => {
    void loadSchedule();
  }, [loadSchedule]);

  const evaluateScheduleMap = useCallback(
    async (data: ScheduleMap, options?: { silent?: boolean }) => {
      if (!beauticians.length) return null;
      if (!currentStoreId) {
        if (!options?.silent) toast.error(t.storeRequired);
        return null;
      }
      if (!options?.silent) setCheckingConflicts(true);
      try {
        const result = await evaluateSmartSchedule({
          weekStart,
          schedules: scheduleMapToSmartSchedules(data, weekStart),
        });
        setSmartResult(result);
        if (!options?.silent) toast.success(t.evaluateSuccess);
        return result;
      } catch (error) {
        console.error(error);
        if (!options?.silent) toast.error(t.evaluateFailed);
        return null;
      } finally {
        if (!options?.silent) setCheckingConflicts(false);
      }
    },
    [beauticians.length, currentStoreId, weekStart],
  );

  const openSlotMenu = (beauticianId: number, dayIndex: number, slot: DisplaySlot) => {
    const day = days[dayIndex];
    const currentSlots = scheduleByBeautician[beauticianId]?.[dayIndex] ?? [];
    const currentStatus = getDisplaySlotStatus(currentSlots, day, slot);
    if (currentStatus === 'expired' || currentStatus === 'booked') return;
    setEditingSlot((current) =>
      current?.beauticianId === beauticianId && current.dayIndex === dayIndex && current.slotLabel === slot.label
        ? null
        : { beauticianId, dayIndex, slotLabel: slot.label },
    );
  };

  const updateDisplaySlotStatus = (
    beauticianId: number,
    dayIndex: number,
    slot: DisplaySlot,
    status: Extract<SlotStatus, 'normal' | 'busy' | 'leave'>,
  ) => {
    let nextSchedule: ScheduleMap | null = null;
    setScheduleByBeautician((current) => {
      const next = cloneScheduleMap(current);
      if (!next[beauticianId]) next[beauticianId] = createEmptyWeekSlots();
      const target = next[beauticianId][dayIndex] ?? createEmptyWeekSlots()[dayIndex];
      next[beauticianId][dayIndex] = setDisplaySlotStatus(target, slot, status);
      nextSchedule = next;
      return next;
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
    if (nextSchedule && smartResult) {
      void evaluateScheduleMap(nextSchedule, { silent: true });
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
      const result = await previewSmartSchedule({
        weekStart: targetWeekStart,
        mode: smartConfig.mode,
        objective: smartConfig.objective,
        keepConfirmedReservations: smartConfig.keepConfirmedReservations,
        allowOverrideBusy: smartConfig.allowOverrideBusy,
        allowOverrideLeave: smartConfig.allowOverrideLeave,
        peakMinStaff: [
          { weekday: 6, startTime: '14:00', endTime: '17:00', minStaff: saturdayPeakStaff },
          { weekday: 7, startTime: '14:00', endTime: '17:00', minStaff: saturdayPeakStaff },
        ],
      });
      if (targetWeekOffset !== weekOffset) {
        setWeekOffset(targetWeekOffset);
      }
      setSmartResult(result);
      setLastPublishedRunId(null);
      setScheduleByBeautician(smartSchedulesToMap(result.schedules ?? [], beauticians, targetWeekStart));
      setSmartConfigOpen(false);
      toast.success(t.previewSuccess);
    } catch (error) {
      console.error(error);
      toast.error(t.previewFailed);
    } finally {
      setSmartLoading(false);
    }
  };

  const handleEvaluate = async () => {
    await evaluateScheduleMap(scheduleByBeautician);
  };

  const handleDemand = async () => {
    if (!currentStoreId) {
      toast.error(t.storeRequired);
      return;
    }
    setDemandLoading(true);
    try {
      const result = await getSchedulingDemand({ weekStart });
      setDemandResult(result);
    } catch (error) {
      console.error(error);
      toast.error(t.demandFailed);
    } finally {
      setDemandLoading(false);
    }
  };

  const handleSmartPublish = async () => {
    if (!currentStoreId) {
      toast.error(t.storeRequired);
      return;
    }
    if (!beauticians.length) return;
    if (!window.confirm(t.publishConfirm)) return;
    setSmartPublishing(true);
    try {
      const result = await publishSmartSchedule({
        runId: smartResult?.runId,
        weekStart,
        schedules: scheduleMapToSmartSchedules(scheduleByBeautician, weekStart),
      });
      setSmartResult(result);
      setLastPublishedRunId(result.runId ?? smartResult?.runId ?? null);
      setOriginalByBeautician(cloneScheduleMap(scheduleByBeautician));
      toast.success(t.publishSuccess);
      await loadSchedule();
    } catch (error) {
      console.error(error);
      toast.error(t.publishFailed);
    } finally {
      setSmartPublishing(false);
    }
  };

  const renderSlotButton = (beauticianId: number, dayIndex: number, slot: DisplaySlot, compact = false) => {
    const day = days[dayIndex];
    const daySlots = scheduleByBeautician[beauticianId]?.[dayIndex] ?? [];
    const status = getDisplaySlotStatus(daySlots, day, slot);
    const marker = slotMarkers.get(getSlotMarkerKey(beauticianId, day.fullDate, slot));
    const disabled = status === 'expired' || status === 'booked';
    const menuOpen =
      editingSlot?.beauticianId === beauticianId &&
      editingSlot.dayIndex === dayIndex &&
      editingSlot.slotLabel === slot.label;

    return (
      <div key={`${beauticianId}-${dayIndex}-${slot.label}`} className="relative">
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
        {menuOpen && (
          <div className="absolute left-1/2 top-full z-20 mt-1 w-28 -translate-x-1/2 rounded-md border border-gray-200 bg-white p-1 shadow-lg">
            {([
              ['normal', t.normal],
              ['busy', t.busy],
              ['leave', t.leave],
            ] as const).map(([nextStatus, label]) => (
              <button
                key={nextStatus}
                type="button"
                onClick={() => updateDisplaySlotStatus(beauticianId, dayIndex, slot, nextStatus)}
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
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={() => setSmartConfigOpen((value) => !value)}
            disabled={smartLoading || loading || saving}
            className="h-9 gap-2 border-blue-200 px-4 text-blue-700 hover:bg-blue-50"
          >
            {smartLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {t.smartSchedule}
          </Button>
          <Button
            variant="outline"
            onClick={() => void handleEvaluate()}
            disabled={checkingConflicts || loading}
            className="h-9 gap-2 px-4 text-gray-700"
          >
            {checkingConflicts ? <Loader2 className="h-4 w-4 animate-spin" /> : <SearchCheck className="h-4 w-4" />}
            {t.checkConflicts}
          </Button>
          <Button
            variant="outline"
            onClick={() => void handleDemand()}
            disabled={demandLoading || loading}
            className="h-9 gap-2 px-4 text-gray-700"
          >
            {demandLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
            {t.demandHeatmap}
          </Button>
          {smartResult && (
            <Button
              onClick={() => void handleSmartPublish()}
              disabled={smartPublishing || smartResult.summary.hardConflictCount > 0}
              className="h-9 gap-2 bg-emerald-600 px-4 text-white hover:bg-emerald-700 disabled:bg-gray-300"
            >
              {smartPublishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {t.publishSmartSchedule}
            </Button>
          )}
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
          <Button
            onClick={() => void handleSave()}
            disabled={saving || loading}
            className="h-9 gap-2 bg-[#1890ff] px-4 text-white hover:bg-[#1890ff]/90"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? t.saving : t.saveSchedule}
          </Button>
        </div>
      </div>

      {smartConfigOpen && (
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
                <option value="copy_last_week_optimize">{t.copyLastWeekOptimize}</option>
                <option value="blank">{t.blankGenerate}</option>
                <option value="optimize_current">{t.optimizeCurrent}</option>
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

      {(smartResult || demandResult) && (
        <div className="grid gap-3 lg:grid-cols-2">
          {smartResult && (
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
          {demandResult && (
            <div className="rounded-lg border border-amber-100 bg-amber-50/70 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                <BarChart3 className="h-4 w-4" />
                {t.demandSummary}
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-sm text-amber-800">
                <span>{t.highDemandSlots}: {demandResult.summary.highDemandSlots}</span>
                <span>{t.underStaffedSlots}: {demandResult.summary.underStaffedSlots}</span>
              </div>
              <div className="mt-3 grid grid-cols-7 gap-1">
                {demandResult.slots.slice(0, 63).map((slot) => (
                  <div
                    key={`${slot.date}-${slot.startTime}`}
                    title={`${slot.date} ${slot.startTime}-${slot.endTime}: ${slot.scheduledStaff}/${slot.requiredStaff}`}
                    className={`h-6 rounded ${
                      slot.scheduledStaff < slot.requiredStaff
                        ? 'bg-red-400'
                        : slot.level === 'high'
                          ? 'bg-amber-500'
                          : slot.level === 'medium'
                            ? 'bg-amber-300'
                            : 'bg-emerald-200'
                    }`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex h-96 items-center justify-center rounded-xl border border-gray-200 bg-white">
          <Loader2 className="h-8 w-8 animate-spin text-[#1890ff]" />
          <span className="ml-2 text-gray-500">{t.loadingSchedule}</span>
        </div>
      ) : viewMode === 'week' ? (
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

          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="grid grid-cols-7">
              {days.map((day, dayIndex) => (
                <div key={day.fullDate} className={`min-w-0 ${dayIndex !== 6 ? 'border-r border-gray-200' : ''}`}>
                  <div className="border-b border-gray-200 bg-gray-50/70 py-4 text-center">
                    <div className="font-medium text-gray-800">{day.name}</div>
                    <div className="mt-1 text-xs text-gray-500">{day.date}</div>
                  </div>
                  <div className="bg-[#fafafa] p-4">
                    <div className="mb-4 text-center text-sm font-bold text-orange-800">{t.morning}</div>
                    <div className="space-y-2">
                      {DISPLAY_SLOTS.filter((slot) => slot.periodLabel === 'morning').map((slot) =>
                        activeBeauticianId ? renderSlotButton(activeBeauticianId, dayIndex, slot) : null,
                      )}
                    </div>
                    <div className="mb-4 mt-7 text-center text-sm font-bold text-green-800">{t.afternoon}</div>
                    <div className="space-y-2">
                      {DISPLAY_SLOTS.filter((slot) => slot.periodLabel === 'afternoon').map((slot) =>
                        activeBeauticianId ? renderSlotButton(activeBeauticianId, dayIndex, slot) : null,
                      )}
                    </div>
                  </div>
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

      <div className="rounded-lg bg-gray-50 px-5 py-4">
        <div className="mb-3 text-sm font-medium text-gray-700">
          {t.statusDescription}: {viewMode === 'week' && activeBeautician ? `${t.viewing} ${activeBeautician.name}${t.weeklySchedule}` : `${t.viewing} ${activeDay?.name || ''}${t.allStaffSchedule}`}
        </div>
        <div className="flex flex-wrap items-center gap-5 text-sm text-gray-600">
          <LegendItem className="border-green-400 bg-blue-50" label={t.normal} />
          <LegendItem className="border-blue-300 bg-blue-50" label={t.booked} />
          <LegendItem className="border-gray-300 bg-gray-100" label={t.expired} />
          <LegendItem className="border-red-300 bg-red-50" label={t.leave} />
          <LegendItem className="border-orange-300 bg-orange-50" label={t.busy} />
          <LegendBadge className="bg-indigo-500 text-white" label={`${t.recommendedMark} ${t.smartSchedule}`} />
          <LegendBadge className="bg-blue-600 text-white" label={`${t.reservationMark} ${t.booked}`} />
          <LegendBadge className="bg-red-500 text-white" label={`${t.conflictMark} ${t.hardConflict}/${t.warning}`} />
        </div>
      </div>
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
