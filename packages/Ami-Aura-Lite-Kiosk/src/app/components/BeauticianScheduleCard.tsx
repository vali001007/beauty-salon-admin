import React from 'react';
import { CalendarCheck, Clock3 } from 'lucide-react';
import type { BeauticianScheduleFlowData, ServiceRecordTaskOption } from '../types';

function safeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

const STATUS_LABEL: Record<ServiceRecordTaskOption['status'], string> = {
  pending: '待记录',
  in_progress: '待记录',
  completed: '已记录',
  cancelled: '已取消',
  no_show: '未到店',
};

export function BeauticianScheduleCard({ data }: { data: BeauticianScheduleFlowData }) {
  const tasks = safeArray(data.tasks);
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-2xl font-semibold text-[#1F1B2D]">
            <CalendarCheck className="h-5 w-5 text-[#2D1B69]" />
            {data.title}
          </div>
          <div className="mt-1 text-sm text-[#6F6678]">
            {data.subtitle} · {data.beauticianName}
          </div>
          <div className="mt-1 text-xs text-[#9B92A3]">
            生成时间 {new Date(data.generatedAt).toLocaleString('zh-CN')}
          </div>
        </div>
        <span className="rounded-full bg-[#2D1B69]/8 px-3 py-1 text-xs font-medium text-[#2D1B69]">
          {tasks.length} 个服务记录
        </span>
      </div>
      <div className="rounded-xl bg-[#F7F5F2] px-4 py-3 text-sm text-[#6F6678]">{data.summary}</div>
      <div className="grid gap-3">
        {tasks.length ? (
          tasks.map((task) => (
            <div
              key={task.id}
              className="grid gap-3 rounded-2xl border border-black/5 bg-white p-4 sm:grid-cols-[120px_1fr_90px] sm:items-center"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-[#1F1B2D]">
                <Clock3 className="h-4 w-4 text-[#C9956C]" />
                {task.appointmentTime
                  ? new Date(task.appointmentTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
                  : '待定'}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-[#1F1B2D]">
                  {task.customerName} · {task.projectName}
                </div>
                <div className="mt-1 text-xs text-[#6F6678]">
                  {task.customerPhone || '未留手机号'} · {task.taskNo}
                </div>
              </div>
              <div className="rounded-full bg-[#F7F5F2] px-3 py-1 text-center text-xs font-medium text-[#6F6678]">
                {STATUS_LABEL[task.status] ?? task.status}
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            今日暂无本人待记录服务。
          </div>
        )}
      </div>
    </div>
  );
}
