import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Save, Loader2 } from 'lucide-react';
import { Button } from '../components/UI';
import { toast } from 'sonner';
import { getSchedule, saveSchedule } from '@/api/scheduling';
import { getBeauticians } from '@/api/beautician';
import type { ScheduleSlot } from '@/types/store';
import type { Beautician } from '@/types';

function getWeekStart(offset: number): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1) + offset * 7;
  const monday = new Date(now);
  monday.setDate(diff);
  return monday.toISOString().split('T')[0];
}

function getWeekDays(weekStart: string): { name: string; date: string }[] {
  const dayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const start = new Date(weekStart);
  return dayNames.map((name, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return { name, date: `${mm}-${dd}` };
  });
}

function formatWeekRange(weekStart: string): string {
  const start = new Date(weekStart);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d: Date) => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `${fmt(start)} ~ ${fmt(end)}`;
}

function deepCloneSlots(slots: ScheduleSlot[][]): ScheduleSlot[][] {
  return slots.map(day => day.map(slot => ({ ...slot })));
}

export function Scheduling() {
  const [beauticians, setBeauticians] = useState<Beautician[]>([]);
  const [activeBeauticianId, setActiveBeauticianId] = useState<number | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [scheduleData, setScheduleData] = useState<ScheduleSlot[][]>([]);
  const [originalData, setOriginalData] = useState<ScheduleSlot[][]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const weekStart = getWeekStart(weekOffset);
  const days = getWeekDays(weekStart);

  // Load beautician list on mount
  useEffect(() => {
    getBeauticians().then((list: Beautician[]) => {
      setBeauticians(list);
      if (list.length > 0) {
        setActiveBeauticianId(list[0].id);
      }
    });
  }, []);

  // Load schedule data when beautician or week changes
  const loadSchedule = useCallback(async () => {
    if (activeBeauticianId === null) return;
    setLoading(true);
    try {
      const data = await getSchedule({ beauticianId: activeBeauticianId, weekStart });
      setScheduleData(data);
      setOriginalData(deepCloneSlots(data));
    } catch {
      toast.error('加载排班数据失败');
    } finally {
      setLoading(false);
    }
  }, [activeBeauticianId, weekStart]);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  // Toggle slot availability
  const handleSlotClick = (dayIndex: number, slotIndex: number) => {
    setScheduleData(prev => {
      const next = deepCloneSlots(prev);
      next[dayIndex][slotIndex].available = !next[dayIndex][slotIndex].available;
      return next;
    });
  };

  // Save schedule
  const handleSave = async () => {
    if (activeBeauticianId === null) return;
    setSaving(true);
    try {
      await saveSchedule({ beauticianId: activeBeauticianId, weekStart, slots: scheduleData });
      setOriginalData(deepCloneSlots(scheduleData));
      toast.success('排班保存成功');
    } catch {
      // Rollback to original state on failure
      setScheduleData(deepCloneSlots(originalData));
      toast.error('排班保存失败，已回滚修改');
    } finally {
      setSaving(false);
    }
  };

  const handleTabChange = (beauticianId: number) => {
    setActiveBeauticianId(beauticianId);
  };

  return (
    <div className="flex flex-col gap-6 h-full">
      {/* Header Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" className="gap-2 h-9 px-3 text-gray-600 border-gray-300" onClick={() => setWeekOffset(prev => prev - 1)}>
            <ChevronLeft className="w-4 h-4" /> 上一周
          </Button>
          <span className="font-medium text-gray-800">
            {weekOffset === 0 ? '本周' : weekOffset > 0 ? `${weekOffset}周后` : `${Math.abs(weekOffset)}周前`} ({formatWeekRange(weekStart)})
          </span>
          <Button variant="outline" className="gap-2 h-9 px-3 text-gray-600 border-gray-300" onClick={() => setWeekOffset(prev => prev + 1)}>
            下一周 <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={handleSave}
            disabled={saving || loading}
            className="gap-2 h-9 px-4 bg-[#1890ff] text-white hover:bg-[#1890ff]/90"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? '保存中...' : '保存排班'}
          </Button>
        </div>
      </div>

      {/* Staff Tabs */}
      <div className="flex border-b border-gray-200">
        {beauticians.map((b) => (
          <button
            key={b.id}
            onClick={() => handleTabChange(b.id)}
            className={`px-6 py-3 text-sm font-medium transition-colors relative ${
              activeBeauticianId === b.id ? 'text-[#1890ff]' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {b.name}
            {activeBeauticianId === b.id && (
              <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#1890ff]" />
            )}
          </button>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-[#1890ff]" />
            <span className="ml-2 text-gray-500">加载排班数据...</span>
          </div>
        ) : (
          <div className="grid grid-cols-7 flex-1">
            {days.map((day, dayIndex) => {
              const daySlots = scheduleData[dayIndex] || [];
              const morningSlots = daySlots.filter(s => s.period === '上午');
              const afternoonSlots = daySlots.filter(s => s.period === '下午');

              return (
                <div key={day.name} className={`flex flex-col ${dayIndex !== 6 ? 'border-r border-gray-200' : ''}`}>
                  {/* Day Header */}
                  <div className="text-center py-4 bg-gray-50/50 border-b border-gray-200">
                    <div className="font-medium text-gray-800 mb-1">{day.name}</div>
                    <div className="text-xs text-gray-500">{day.date}</div>
                  </div>

                  <div className="flex-1 p-3 flex flex-col gap-6 bg-[#fafafa]">
                    {/* Morning */}
                    <div className="flex flex-col gap-3">
                      <div className="text-center text-sm font-bold text-orange-800">上午</div>
                      <div className="flex flex-col gap-2">
                        {morningSlots.map((slot) => {
                          const slotIndex = daySlots.indexOf(slot);
                          return (
                            <div
                              key={slot.time}
                              onClick={() => handleSlotClick(dayIndex, slotIndex)}
                              className={`text-center py-2 text-[13px] border rounded transition-colors cursor-pointer select-none ${
                                slot.available
                                  ? 'border-green-400 text-green-600 bg-white hover:bg-green-50'
                                  : 'border-gray-200 text-gray-400 bg-gray-50/50 hover:bg-gray-100'
                              }`}
                            >
                              {slot.time}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Afternoon */}
                    <div className="flex flex-col gap-3">
                      <div className="text-center text-sm font-bold text-green-800">下午</div>
                      <div className="flex flex-col gap-2">
                        {afternoonSlots.map((slot) => {
                          const slotIndex = daySlots.indexOf(slot);
                          return (
                            <div
                              key={slot.time}
                              onClick={() => handleSlotClick(dayIndex, slotIndex)}
                              className={`text-center py-2 text-[13px] border rounded transition-colors cursor-pointer select-none ${
                                slot.available
                                  ? 'border-green-400 text-green-600 bg-white hover:bg-green-50'
                                  : 'border-gray-200 text-gray-400 bg-gray-50/50 hover:bg-gray-100'
                              }`}
                            >
                              {slot.time}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 mt-2 pb-4 px-2">
        <span className="font-medium text-gray-700 text-sm">状态说明:</span>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border border-green-400 bg-white rounded-sm"></div>
          <span className="text-sm text-gray-600">可预约</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border border-gray-300 bg-gray-100 rounded-sm"></div>
          <span className="text-sm text-gray-600">不可预约</span>
        </div>
      </div>
    </div>
  );
}
