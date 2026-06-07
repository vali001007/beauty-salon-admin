import React, { useState } from "react";
import { mockData } from "../types";
import { Clock, Check, Scissors, X, CalendarCheck } from "lucide-react";
import { SearchableSelect } from "./SearchableSelect";

const STORES = ["国颜智美·南山店", "国颜智美·福田店", "国颜智美·罗湖店"];
const PROJECTS = ["面部护理", "全身SPA", "头皮护理", "美甲", "睫毛嫁接", "纹绣"];
const BEAUTICIANS = ["李芳", "王磊", "陈晓", "赵敏", "刘洋"];
const TIME_SLOTS = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00"];

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
  onSubmit,
  onClose,
}: {
  onSubmit: (data: typeof emptyForm) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState(emptyForm);

  const set = (field: keyof typeof emptyForm, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const requiredFields: (keyof typeof emptyForm)[] = ["store", "project", "customer", "beautician", "phone", "date", "timeSlot"];
  const isValid = requiredFields.every((f) => form[f].trim() !== "");

  const labelClass = "text-sm font-medium text-[#1F1B2D] shrink-0 w-20 text-right";
  const inputClass = "flex-1 px-3 py-2.5 border border-black/15 rounded-lg text-sm text-[#1F1B2D] bg-white outline-none focus:border-[#2D1B69] transition-colors placeholder:text-[#B0A8BB]";
  const selectClass = `${inputClass} appearance-none cursor-pointer`;

  const SelectField = ({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: string[]; placeholder: string }) => (
    <div className="relative flex-1">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${selectClass} w-full pr-8 ${value === "" ? "text-[#B0A8BB]" : "text-[#1F1B2D]"}`}
      >
        <option value="" disabled>{placeholder}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#6F6678] text-xs">∨</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-[#1F1B2D]">添加项目预约</h3>
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-black/5 text-[#6F6678] transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-4">
        {/* Row 1 */}
        <div className="flex items-center gap-3">
          <span className={labelClass}><span className="text-red-500">*</span> 门店</span>
          <SelectField value={form.store} onChange={(v) => set("store", v)} options={STORES} placeholder="请选择门店" />
        </div>
        <div className="flex items-center gap-3">
          <span className={labelClass}><span className="text-red-500">*</span> 项目</span>
          <SelectField value={form.project} onChange={(v) => set("project", v)} options={PROJECTS} placeholder="请选择项目" />
        </div>

        {/* Row 2 */}
        <div className="flex items-center gap-3">
          <span className={labelClass}><span className="text-red-500">*</span> 申请用户</span>
          <SearchableSelect value={form.customer} onChange={(v) => set("customer", v)} options={mockData.appointments.map(a => a.customerName)} placeholder="请选择客户" />
        </div>
        <div className="flex items-center gap-3">
          <span className={labelClass}><span className="text-red-500">*</span> 预约美容师</span>
          <SelectField value={form.beautician} onChange={(v) => set("beautician", v)} options={BEAUTICIANS} placeholder="请选择预约美容师" />
        </div>

        {/* Row 3 */}
        <div className="flex items-center gap-3">
          <span className={labelClass}><span className="text-red-500">*</span> 联系手机号</span>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="请输入联系手机号"
            className={inputClass}
            maxLength={11}
          />
        </div>
        <div className="flex items-start gap-3">
          <span className={`${labelClass} mt-2.5`}>备注</span>
          <div className="relative flex-1">
            <textarea
              value={form.note}
              onChange={(e) => set("note", e.target.value.slice(0, 500))}
              placeholder="请输入备注信息"
              rows={2}
              className={`${inputClass} resize-none w-full`}
            />
            <span className="absolute bottom-2 right-2 text-xs text-[#B0A8BB]">{form.note.length} / 500</span>
          </div>
        </div>

        {/* Row 4 */}
        <div className="flex items-center gap-3">
          <span className={labelClass}><span className="text-red-500">*</span> 预约日期</span>
          <input
            type="date"
            value={form.date}
            onChange={(e) => set("date", e.target.value)}
            className={`${inputClass} flex-1`}
          />
        </div>
        <div className="flex items-center gap-3">
          <span className={labelClass}><span className="text-red-500">*</span> 预约时间段</span>
          <SelectField value={form.timeSlot} onChange={(v) => set("timeSlot", v)} options={TIME_SLOTS} placeholder="请选择时间段" />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t border-black/8">
        <button
          onClick={onClose}
          className="px-8 py-2.5 border border-black/15 text-[#1F1B2D] rounded-lg text-sm font-medium hover:bg-black/5 transition-colors active:scale-95"
        >
          取 消
        </button>
        <button
          onClick={() => isValid && onSubmit(form)}
          className={`px-8 py-2.5 rounded-lg text-sm font-medium transition-colors active:scale-95 text-white ${isValid ? "bg-[#4A90E2] hover:bg-[#3a7fd2]" : "bg-[#4A90E2]/40 cursor-not-allowed"}`}
        >
          确 定
        </button>
      </div>
    </div>
  );
}

export function AppointmentCard({
  onCheckIn,
}: {
  onCheckIn: (id: string) => void;
}) {
  const [appointments, setAppointments] = useState(mockData.appointments);
  const [editingTimeId, setEditingTimeId] = useState<string | null>(null);
  const [editTimeValue, setEditTimeValue] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  const handleCheckIn = (id: string) => {
    setAppointments((prev) =>
      prev.map((app) => (app.id === id ? { ...app, status: "arrived" } : app))
    );
    setEditingTimeId(null);
    onCheckIn(id);
  };

  const handleConfirm = (id: string) => {
    setAppointments((prev) =>
      prev.map((app) => (app.id === id ? { ...app, status: "confirmed" } : app))
    );
  };

  const handleCancel = (id: string) => {
    setAppointments((prev) =>
      prev.map((app) => (app.id === id ? { ...app, status: "cancelled" } : app))
    );
    setEditingTimeId(null);
  };

  const handleStartEditTime = (id: string, currentTime: string) => {
    setEditingTimeId(id);
    setEditTimeValue(currentTime);
  };

  const handleSaveTime = (id: string) => {
    if (!editTimeValue) return;
    setAppointments((prev) =>
      prev.map((app) => (app.id === id ? { ...app, time: editTimeValue } : app))
    );
    setEditingTimeId(null);
  };

  const handleAddAppointment = (form: typeof emptyForm) => {
    const newApp = {
      id: String(Date.now()),
      customerName: form.customer,
      project: form.project,
      time: form.timeSlot,
      beautician: form.beautician,
      status: "pending",
    };
    setAppointments((prev) => [...prev, newApp]);
    setShowAddForm(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-semibold text-[#1F1B2D]">今日预约</h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-[#6F6678]">共 {appointments.length} 条记录</span>
          <button
            onClick={() => setShowAddForm(true)}
            className="px-4 py-2 bg-[#2D1B69] text-white rounded-lg text-sm font-medium hover:bg-[#3d2a8a] transition-colors active:scale-95 flex items-center gap-1.5"
          >
            <span className="text-base leading-none">+</span>
            添加预约
          </button>
        </div>
      </div>

      {showAddForm && (
        <div className="bg-white rounded-xl border border-black/8 shadow-sm p-6">
          <AddAppointmentForm onSubmit={handleAddAppointment} onClose={() => setShowAddForm(false)} />
        </div>
      )}

      <div className="flex flex-col gap-3">
        {appointments.map((app) => (
          <div
            key={app.id}
            className="flex items-center justify-between p-4 bg-[#F7F5F2] rounded-xl border border-black/5"
          >
            <div className="flex items-center gap-5">
              <div className="flex flex-col items-center justify-center bg-white w-14 h-14 rounded-lg shadow-sm border border-black/5 shrink-0">
                <span className="text-lg font-bold text-[#2D1B69]">{app.time}</span>
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold text-[#1F1B2D]">
                    {app.customerName}
                  </span>
                  <div className="flex items-center gap-1 text-xs text-[#6F6678] bg-black/5 px-2 py-0.5 rounded">
                    <Scissors className="w-3 h-3" />
                    {app.beautician}
                  </div>
                </div>
                <div className="text-sm text-[#6F6678] font-medium">
                  {app.project}
                </div>
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
                      className="px-3 py-2 border border-[#2D1B69]/30 rounded-lg text-sm text-[#2D1B69] bg-white outline-none focus:border-[#2D1B69]"
                      autoFocus
                    />
                    <button
                      onClick={() => handleSaveTime(app.id)}
                      className="px-4 py-2 bg-[#2D1B69] text-white rounded-lg text-sm font-medium hover:bg-[#3d2a8a] transition-colors active:scale-95"
                    >
                      保存
                    </button>
                    <button
                      onClick={() => setEditingTimeId(null)}
                      className="px-3 py-2 text-[#6F6678] rounded-lg text-sm border border-black/10 hover:bg-black/5 transition-colors active:scale-95"
                    >
                      返回
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleStartEditTime(app.id, app.time)}
                      className="px-3 py-2 text-[#2D1B69] rounded-lg text-sm font-medium border border-[#2D1B69]/25 hover:bg-[#2D1B69]/5 transition-colors active:scale-95 flex items-center gap-1.5"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      修改
                    </button>

                    {app.status === "pending" ? (
                      <button
                        onClick={() => handleConfirm(app.id)}
                        className="px-3 py-2 text-[#2D1B69] rounded-lg text-sm font-medium border border-[#2D1B69]/25 hover:bg-[#2D1B69]/5 transition-colors active:scale-95 flex items-center gap-1.5"
                      >
                        <CalendarCheck className="w-3.5 h-3.5" />
                        确认
                      </button>
                    ) : (
                      <div className="px-3 py-2 bg-[#2D1B69]/8 text-[#2D1B69] rounded-lg text-sm font-medium flex items-center gap-1.5 cursor-default">
                        <CalendarCheck className="w-3.5 h-3.5" />
                        已确认
                      </div>
                    )}

                    <button
                      onClick={() => handleCancel(app.id)}
                      className="px-3 py-2 text-red-400 rounded-lg text-sm font-medium border border-red-200 hover:bg-red-50 transition-colors active:scale-95 flex items-center gap-1.5"
                    >
                      <X className="w-3.5 h-3.5" />
                      取消
                    </button>

                    <button
                      onClick={() => handleCheckIn(app.id)}
                      className="px-6 py-2.5 bg-[#C9956C] text-white rounded-lg font-medium text-sm hover:bg-[#b0825c] transition-colors active:scale-95"
                    >
                      到店
                    </button>
                  </div>
                )
              ) : app.status === "arrived" ? (
                <div className="px-6 py-2.5 bg-green-50 text-green-600 rounded-lg font-medium text-sm border border-green-100 flex items-center gap-1 cursor-default">
                  <Check className="w-4 h-4" />
                  已到店
                </div>
              ) : (
                <div className="px-4 py-2.5 bg-red-50 text-red-400 rounded-lg font-medium text-sm border border-red-100 flex items-center gap-1.5 cursor-default">
                  <X className="w-4 h-4" />
                  已取消
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CheckInSuccessCard() {
  return (
    <div className="flex items-center gap-4 py-2">
      <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center shrink-0">
        <Check className="w-6 h-6 text-green-600" />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-[#1F1B2D]">到店确认成功</h3>
        <p className="text-[#6F6678] text-sm">已通知美容师李芳准备服务</p>
      </div>
    </div>
  );
}
