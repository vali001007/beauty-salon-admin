import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { getBeauticians } from '@/api/beautician';
import { getWeeklySchedules, saveSchedule } from '@/api/scheduling';
import type { Beautician, ScheduleSlot } from '@/types';
import { Button } from '../components/UI';

type ViewMode = 'week' | 'day';
type SlotStatus = 'normal' | 'booked' | 'expired' | 'leave' | 'busy';

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
  sourceTimes: string[];
};

type EditingSlot = {
  beauticianId: number;
  dayIndex: number;
  slotLabel: string;
} | null;

const DISPLAY_SLOTS: DisplaySlot[] = [
  { label: '09:00-10:00', start: '09:00', end: '10:00', period: '上午', sourceTimes: ['09:00', '09:30'] },
  { label: '10:00-11:00', start: '10:00', end: '11:00', period: '上午', sourceTimes: ['10:00', '10:30'] },
  { label: '11:00-12:00', start: '11:00', end: '12:00', period: '上午', sourceTimes: ['11:00', '11:30'] },
  { label: '14:00-15:00', start: '14:00', end: '15:00', period: '下午', sourceTimes: ['14:00', '14:30'] },
  { label: '15:00-16:00', start: '15:00', end: '16:00', period: '下午', sourceTimes: ['15:00', '15:30'] },
  { label: '16:00-17:00', start: '16:00', end: '17:00', period: '下午', sourceTimes: ['16:00', '16:30'] },
  { label: '17:00-18:00', start: '17:00', end: '18:00', period: '下午', sourceTimes: ['17:00', '17:30'] },
  { label: '18:00-19:00', start: '18:00', end: '19:00', period: '下午', sourceTimes: ['18:00', '18:30'] },
  { label: '19:00-20:00', start: '19:00', end: '20:00', period: '下午', sourceTimes: ['19:00', '19:30'] },
];

function getWeekStart(offset: number): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1) + offset * 7;
  const monday = new Date(now);
  monday.setDate(diff);
  return monday.toISOString().split('T')[0];
}

function addDays(dateText: string, days: number): string {
  const date = new Date(dateText);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function getWeekDays(weekStart: string): DayInfo[] {
  const dayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
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

function cloneScheduleMap(data: Record<number, ScheduleSlot[][]>): Record<number, ScheduleSlot[][]> {
  return Object.fromEntries(Object.entries(data).map(([id, slots]) => [Number(id), deepCloneSlots(slots)]));
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

function setDisplaySlotStatus(daySlots: ScheduleSlot[], slot: DisplaySlot, status: Extract<SlotStatus, 'normal' | 'busy' | 'leave'>): ScheduleSlot[] {
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
    booked: '已预约',
    expired: slot.label,
    leave: '请假',
    busy: '忙碌',
  };
  return labels[status];
}

export function Scheduling() {
  const [beauticians, setBeauticians] = useState<Beautician[]>([]);
  const [activeBeauticianId, setActiveBeauticianId] = useState<number | null>(null);
  const [activeDayIndex, setActiveDayIndex] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [weekOffset, setWeekOffset] = useState(0);
  const [scheduleByBeautician, setScheduleByBeautician] = useState<Record<number, ScheduleSlot[][]>>({});
  const [originalByBeautician, setOriginalByBeautician] = useState<Record<number, ScheduleSlot[][]>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingSlot, setEditingSlot] = useState<EditingSlot>(null);

  const weekStart = getWeekStart(weekOffset);
  const days = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const activeBeautician = beauticians.find((item) => item.id === activeBeauticianId);
  const activeDay = days[activeDayIndex] ?? days[0];

  useEffect(() => {
    const loadBeauticians = async () => {
      try {
        const list = await getBeauticians();
        setBeauticians(list);
        setActiveBeauticianId((current) => current ?? list[0]?.id ?? null);
      } catch {
        toast.error('加载美容师失败');
      }
    };
    void loadBeauticians();
  }, []);

  const loadSchedule = useCallback(async () => {
    if (!beauticians.length) return;
    setLoading(true);
    try {
      const next = await getWeeklySchedules({
        beauticianIds: beauticians.map((beautician) => beautician.id),
        weekStart,
      });
      setScheduleByBeautician(next);
      setOriginalByBeautician(cloneScheduleMap(next));
    } catch {
      toast.error('加载排班数据失败');
    } finally {
      setLoading(false);
    }
  }, [beauticians, weekStart]);

  useEffect(() => {
    void loadSchedule();
  }, [loadSchedule]);

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
    setScheduleByBeautician((current) => {
      const next = cloneScheduleMap(current);
      const target = next[beauticianId]?.[dayIndex] ?? [];
      if (!next[beauticianId]) next[beauticianId] = [];
      next[beauticianId][dayIndex] = setDisplaySlotStatus(target, slot, status);
      return next;
    });
    setEditingSlot(null);
  };

  const handleSave = async () => {
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
      toast.success('排班保存成功');
    } catch {
      setScheduleByBeautician(cloneScheduleMap(originalByBeautician));
      toast.error('排班保存失败，已回滚修改');
    } finally {
      setSaving(false);
    }
  };

  const renderSlotButton = (beauticianId: number, dayIndex: number, slot: DisplaySlot, compact = false) => {
    const day = days[dayIndex];
    const daySlots = scheduleByBeautician[beauticianId]?.[dayIndex] ?? [];
    const status = getDisplaySlotStatus(daySlots, day, slot);
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
          className={`w-full rounded-md border px-2 py-2 text-center text-sm font-medium transition ${getStatusClass(status)} ${disabled ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'} ${compact ? 'min-h-9' : 'min-h-10'}`}
        >
          {getStatusLabel(status, slot)}
        </button>
        {menuOpen && (
          <div className="absolute left-1/2 top-full z-20 mt-1 w-28 -translate-x-1/2 rounded-md border border-gray-200 bg-white p-1 shadow-lg">
            {([
              ['normal', '正常'],
              ['busy', '忙碌'],
              ['leave', '请假'],
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" className="h-9 gap-2 px-3 text-gray-600" onClick={() => setWeekOffset((value) => value - 1)}>
            <ChevronLeft className="h-4 w-4" /> 上一周
          </Button>
          <span className="font-medium text-gray-800">
            {weekOffset === 0 ? '本周' : weekOffset > 0 ? `${weekOffset}周后` : `${Math.abs(weekOffset)}周前`} ({formatWeekRange(weekStart)})
          </span>
          <Button variant="outline" className="h-9 gap-2 px-3 text-gray-600" onClick={() => setWeekOffset((value) => value + 1)}>
            下一周 <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-md border border-gray-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setViewMode('day')}
              className={`rounded px-3 py-1.5 text-sm ${viewMode === 'day' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:text-gray-900'}`}
            >
              按天
            </button>
            <button
              type="button"
              onClick={() => setViewMode('week')}
              className={`rounded px-3 py-1.5 text-sm ${viewMode === 'week' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:text-gray-900'}`}
            >
              按周
            </button>
          </div>
          <Button
            onClick={() => void handleSave()}
            disabled={saving || loading}
            className="h-9 gap-2 bg-[#1890ff] px-4 text-white hover:bg-[#1890ff]/90"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? '保存中...' : '保存排班'}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex h-96 items-center justify-center rounded-xl border border-gray-200 bg-white">
          <Loader2 className="h-8 w-8 animate-spin text-[#1890ff]" />
          <span className="ml-2 text-gray-500">加载排班数据...</span>
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
                    <div className="mb-4 text-center text-sm font-bold text-orange-800">上午</div>
                    <div className="space-y-2">
                      {DISPLAY_SLOTS.filter((slot) => slot.period === '上午').map((slot) =>
                        activeBeauticianId ? renderSlotButton(activeBeauticianId, dayIndex, slot) : null,
                      )}
                    </div>
                    <div className="mb-4 mt-7 text-center text-sm font-bold text-green-800">下午</div>
                    <div className="space-y-2">
                      {DISPLAY_SLOTS.filter((slot) => slot.period === '下午').map((slot) =>
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
          状态说明：{viewMode === 'week' && activeBeautician ? `当前查看 ${activeBeautician.name} 的周排班` : `当前查看 ${activeDay?.name || ''} 的全员排班`}
        </div>
        <div className="flex flex-wrap items-center gap-5 text-sm text-gray-600">
          <LegendItem className="border-green-400 bg-blue-50" label="正常" />
          <LegendItem className="border-blue-300 bg-blue-50" label="已预约" />
          <LegendItem className="border-gray-300 bg-gray-100" label="已过期" />
          <LegendItem className="border-red-300 bg-red-50" label="请假" />
          <LegendItem className="border-orange-300 bg-orange-50" label="忙碌" />
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
