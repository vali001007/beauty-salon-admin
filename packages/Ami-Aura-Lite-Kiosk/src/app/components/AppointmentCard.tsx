import React, { useState } from "react";
import { CalendarCheck, Check, Clock, Scissors, X } from "lucide-react";
import { SearchableSelect } from "./SearchableSelect";

export interface LegacyAppointmentViewItem {
  id: string;
  customerName: string;
  project: string;
  time: string;
  beautician: string;
  status: "pending" | "confirmed" | "arrived" | "cancelled" | string;
}

const emptyForm = {
  store: "",
  project: "",
  customer: "",
  beautician: "",
  phone: "",
  note: "",
  date: "",
  timeSlot: "",
};

function AddAppointmentForm({
  customers,
  stores,
  projects,
  beauticians,
  timeSlots,
  onSubmit,
  onClose,
}: {
  customers: string[];
  stores: string[];
  projects: string[];
  beauticians: string[];
  timeSlots: string[];
  onSubmit: (data: typeof emptyForm) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState(emptyForm);
  const set = (field: keyof typeof emptyForm, value: string) => setForm((prev) => ({ ...prev, [field]: value }));
  const isValid = ["store", "project", "customer", "beautician", "phone", "date", "timeSlot"].every(
    (field) => form[field as keyof typeof emptyForm].trim() !== "",
  );
  const inputClass =
    "flex-1 rounded-lg border border-black/15 bg-white px-3 py-2.5 text-sm text-[#1F1B2D] outline-none transition-colors placeholder:text-[#B0A8BB] focus:border-[#2D1B69]";

  const SelectField = ({
    value,
    onChange,
    options,
    placeholder,
  }: {
    value: string;
    onChange: (v: string) => void;
    options: string[];
    placeholder: string;
  }) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={!options.length}
      className={`${inputClass} w-full cursor-pointer appearance-none disabled:cursor-not-allowed disabled:bg-black/[0.03] disabled:text-[#9B92A3]`}
    >
      <option value="" disabled>
        {options.length ? placeholder : "暂无可选数据"}
      </option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-[#1F1B2D]">添加项目预约</h3>
        <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-[#6F6678] hover:bg-black/5">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-4">
        <SelectField value={form.store} onChange={(value) => set("store", value)} options={stores} placeholder="请选择门店" />
        <SelectField value={form.project} onChange={(value) => set("project", value)} options={projects} placeholder="请选择项目" />
        <SearchableSelect value={form.customer} onChange={(value) => set("customer", value)} options={customers} placeholder="请选择客户" />
        <SelectField value={form.beautician} onChange={(value) => set("beautician", value)} options={beauticians} placeholder="请选择美容师" />
        <input
          type="tel"
          value={form.phone}
          onChange={(e) => set("phone", e.target.value)}
          placeholder="请输入手机号"
          className={inputClass}
          maxLength={11}
        />
        <SelectField value={form.timeSlot} onChange={(value) => set("timeSlot", value)} options={timeSlots} placeholder="请选择时间段" />
        <input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} className={inputClass} />
        <textarea
          value={form.note}
          onChange={(e) => set("note", e.target.value.slice(0, 500))}
          placeholder="请输入备注"
          rows={2}
          className={`${inputClass} resize-none`}
        />
      </div>

      <div className="flex justify-end gap-3 border-t border-black/8 pt-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-black/15 px-8 py-2.5 text-sm font-medium text-[#1F1B2D] hover:bg-black/5">
          取消
        </button>
        <button
          type="button"
          onClick={() => isValid && onSubmit(form)}
          disabled={!isValid}
          className="rounded-lg bg-[#4A90E2] px-8 py-2.5 text-sm font-medium text-white hover:bg-[#3a7fd2] disabled:cursor-not-allowed disabled:opacity-40"
        >
          确定
        </button>
      </div>
    </div>
  );
}

export function AppointmentCard({
  appointments = [],
  customers = [],
  stores = [],
  projects = [],
  beauticians = [],
  timeSlots = [],
  onCheckIn,
  onConfirm,
  onCancel,
  onCreate,
}: {
  appointments?: LegacyAppointmentViewItem[];
  customers?: string[];
  stores?: string[];
  projects?: string[];
  beauticians?: string[];
  timeSlots?: string[];
  onCheckIn?: (id: string) => void;
  onConfirm?: (id: string) => void;
  onCancel?: (id: string) => void;
  onCreate?: (data: typeof emptyForm) => void;
}) {
  const [editingTimeId, setEditingTimeId] = useState<string | null>(null);
  const [editTimeValue, setEditTimeValue] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-[#1F1B2D]">今日预约</h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-[#6F6678]">共 {appointments.length} 条记录</span>
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            disabled={!onCreate}
            className="flex items-center gap-1.5 rounded-lg bg-[#2D1B69] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#3d2a8a] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="text-base leading-none">+</span>
            添加预约
          </button>
        </div>
      </div>

      {showAddForm && (
        <div className="rounded-xl border border-black/8 bg-white p-6 shadow-sm">
          <AddAppointmentForm
            customers={customers}
            stores={stores}
            projects={projects}
            beauticians={beauticians}
            timeSlots={timeSlots}
            onSubmit={(form) => {
              onCreate?.(form);
              setShowAddForm(false);
            }}
            onClose={() => setShowAddForm(false)}
          />
        </div>
      )}

      <div className="flex flex-col gap-3">
        {appointments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-black/10 bg-white p-8 text-center text-sm text-[#6F6678]">
            暂无预约数据，请接入真实预约接口后展示。
          </div>
        ) : (
          appointments.map((app) => (
            <div key={app.id} className="flex items-center justify-between rounded-xl border border-black/5 bg-[#F7F5F2] p-4">
              <div className="flex items-center gap-5">
                <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-lg border border-black/5 bg-white shadow-sm">
                  <span className="text-lg font-bold text-[#2D1B69]">{app.time}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold text-[#1F1B2D]">{app.customerName}</span>
                    <div className="flex items-center gap-1 rounded bg-black/5 px-2 py-0.5 text-xs text-[#6F6678]">
                      <Scissors className="h-3 w-3" />
                      {app.beautician}
                    </div>
                  </div>
                  <div className="text-sm font-medium text-[#6F6678]">{app.project}</div>
                </div>
              </div>

              <div>
                {app.status === "pending" || app.status === "confirmed" ? (
                  editingTimeId === app.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={editTimeValue}
                        onChange={(e) => setEditTimeValue(e.target.value)}
                        className="rounded-lg border border-[#2D1B69]/30 bg-white px-3 py-2 text-sm text-[#2D1B69] outline-none focus:border-[#2D1B69]"
                      />
                      <button type="button" onClick={() => setEditingTimeId(null)} className="rounded-lg border border-black/10 px-3 py-2 text-sm text-[#6F6678] hover:bg-black/5">
                        返回
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTimeId(app.id);
                          setEditTimeValue(app.time);
                        }}
                        className="flex items-center gap-1.5 rounded-lg border border-[#2D1B69]/25 px-3 py-2 text-sm font-medium text-[#2D1B69] hover:bg-[#2D1B69]/5"
                      >
                        <Clock className="h-3.5 w-3.5" />
                        修改
                      </button>
                      <button
                        type="button"
                        onClick={() => onConfirm?.(app.id)}
                        disabled={!onConfirm}
                        className="flex items-center gap-1.5 rounded-lg border border-[#2D1B69]/25 px-3 py-2 text-sm font-medium text-[#2D1B69] hover:bg-[#2D1B69]/5 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <CalendarCheck className="h-3.5 w-3.5" />
                        {app.status === "pending" ? "确认" : "已确认"}
                      </button>
                      <button
                        type="button"
                        onClick={() => onCancel?.(app.id)}
                        disabled={!onCancel}
                        className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-400 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <X className="h-3.5 w-3.5" />
                        取消
                      </button>
                      <button
                        type="button"
                        onClick={() => onCheckIn?.(app.id)}
                        disabled={!onCheckIn}
                        className="rounded-lg bg-[#C9956C] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#b0825c] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        到店
                      </button>
                    </div>
                  )
                ) : app.status === "arrived" ? (
                  <div className="flex cursor-default items-center gap-1 rounded-lg border border-green-100 bg-green-50 px-6 py-2.5 text-sm font-medium text-green-600">
                    <Check className="h-4 w-4" />
                    已到店
                  </div>
                ) : (
                  <div className="flex cursor-default items-center gap-1.5 rounded-lg border border-red-100 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-400">
                    <X className="h-4 w-4" />
                    已取消
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function CheckInSuccessCard() {
  return (
    <div className="flex items-center gap-4 py-2">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-100">
        <Check className="h-6 w-6 text-green-600" />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-[#1F1B2D]">到店确认成功</h3>
        <p className="text-sm text-[#6F6678]">请继续通过真实预约和服务任务链路推进服务。</p>
      </div>
    </div>
  );
}
