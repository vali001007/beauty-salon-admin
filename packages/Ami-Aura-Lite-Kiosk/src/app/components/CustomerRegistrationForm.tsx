import React, { useState } from "react";
import { Check } from "lucide-react";
import { mockData } from "../types";

type FormData = {
  name: string;
  store: string;
  email: string;
  phone: string;
  landline: string;
  wechat: string;
  gender: "男" | "女" | "";
  marital: "未知" | "已婚" | "未婚";
  birthdate: string;
  age: string;
  height: string;
  weight: string;
  occupation: string;
  company: string;
  address: string;
  allergy: "无" | "有";
  surgery: "无" | "有";
  skin: string;
  totalSpend: string;
  level: string;
  source: string;
  lastVisit: string;
  notes: string;
};

const CUSTOMER_LEVELS = ["无", "普通会员", "银卡会员", "金卡会员", "钻石会员"];
const CUSTOMER_SOURCES = ["请选择客户来源", "朋友推荐", "社交媒体", "线上广告", "门店活动", "自然到访", "其他"];

const inputClass = "w-full px-3 py-2.5 border border-black/15 rounded-lg text-sm text-[#1F1B2D] bg-white outline-none focus:border-[#2D1B69] transition-colors placeholder:text-[#B0A8BB]";

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="text-sm text-[#6F6678] mb-1.5 block">
      {required && <span className="text-red-500 mr-0.5">*</span>}
      {children}
    </label>
  );
}

function TextInput({ value, onChange, placeholder, type = "text" }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={inputClass}
    />
  );
}

function RadioGroup({ name, options, value, onChange }: {
  name: string; options: string[]; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-5 py-2.5">
      {options.map((opt) => (
        <label key={opt} className="flex items-center gap-2 cursor-pointer text-sm text-[#1F1B2D]">
          <div
            onClick={() => onChange(opt)}
            className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors cursor-pointer ${
              value === opt ? "border-[#4A90E2]" : "border-black/20"
            }`}
          >
            {value === opt && <div className="w-2 h-2 rounded-full bg-[#4A90E2]" />}
          </div>
          {opt}
        </label>
      ))}
    </div>
  );
}

function SelectInput({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} w-full pr-8 appearance-none cursor-pointer`}
      >
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#6F6678] text-xs">∨</span>
    </div>
  );
}

function NumberInput({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={inputClass}
    />
  );
}

export function CustomerRegistrationForm({ onComplete }: { onComplete?: (name: string) => void }) {
  const [form, setForm] = useState<FormData>({
    name: "", store: mockData.storeName, email: "", phone: "",
    landline: "", wechat: "", gender: "女", marital: "未知",
    birthdate: "", age: "", height: "", weight: "",
    occupation: "", company: "", address: "", allergy: "无",
    surgery: "无", skin: "", totalSpend: "0",
    level: "无", source: "请选择客户来源", lastVisit: "", notes: "",
  });

  const set = (key: keyof FormData) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = () => {
    if (!form.name.trim()) return;
    onComplete?.(form.name);
  };

  return (
    <div className="flex flex-col gap-5">
      <h3 className="text-lg font-semibold text-[#1F1B2D]">新增客户</h3>

      <div className="grid grid-cols-4 gap-x-5 gap-y-4">
        {/* 基本信息 */}
        <div className="col-span-2">
          <Label required>客户名称</Label>
          <TextInput value={form.name} onChange={set("name")} placeholder="请输入客户名称" />
        </div>
        <div className="col-span-2">
          <Label>所属门店</Label>
          <SelectInput value={form.store} onChange={set("store")} options={[mockData.storeName, "线上测试门店"]} />
        </div>

        {/* 联系方式 */}
        <div>
          <Label>手机号码</Label>
          <TextInput value={form.phone} onChange={set("phone")} placeholder="请输入手机号码" type="tel" />
        </div>
        <div>
          <Label>微信号</Label>
          <TextInput value={form.wechat} onChange={set("wechat")} placeholder="请输入微信号" />
        </div>
        <div>
          <Label>座机号</Label>
          <TextInput value={form.landline} onChange={set("landline")} placeholder="请输入座机号" />
        </div>
        <div>
          <Label>邮箱</Label>
          <TextInput value={form.email} onChange={set("email")} placeholder="请输入邮箱" type="email" />
        </div>

        {/* 个人信息 */}
        <div>
          <Label required>性别</Label>
          <RadioGroup name="gender" options={["男", "女"]} value={form.gender} onChange={set("gender")} />
        </div>
        <div>
          <Label>婚姻状态</Label>
          <RadioGroup name="marital" options={["未知", "已婚", "未婚"]} value={form.marital} onChange={set("marital")} />
        </div>
        <div>
          <Label>出生日期</Label>
          <TextInput value={form.birthdate} onChange={set("birthdate")} placeholder="请选择" type="date" />
        </div>
        <div>
          <Label>年龄</Label>
          <NumberInput value={form.age} onChange={set("age")} placeholder="请输入年龄" />
        </div>

        <div>
          <Label>身高(cm)</Label>
          <NumberInput value={form.height} onChange={set("height")} placeholder="请输入身高" />
        </div>
        <div>
          <Label>体重(kg)</Label>
          <NumberInput value={form.weight} onChange={set("weight")} placeholder="请输入体重" />
        </div>
        <div>
          <Label>职业</Label>
          <TextInput value={form.occupation} onChange={set("occupation")} placeholder="请输入职业" />
        </div>
        <div>
          <Label>工作单位</Label>
          <TextInput value={form.company} onChange={set("company")} placeholder="请输入工作单位" />
        </div>

        <div className="col-span-4">
          <Label>家庭地址</Label>
          <TextInput value={form.address} onChange={set("address")} placeholder="请输入家庭地址" />
        </div>

        {/* 健康信息 */}
        <div>
          <Label>过敏史</Label>
          <RadioGroup name="allergy" options={["无", "有"]} value={form.allergy} onChange={set("allergy")} />
        </div>
        <div className="col-span-3">
          <Label>有无整形或微创治疗</Label>
          <RadioGroup name="surgery" options={["无", "有"]} value={form.surgery} onChange={set("surgery")} />
        </div>

        <div className="col-span-4">
          <Label>皮肤状况</Label>
          <textarea
            value={form.skin}
            onChange={(e) => set("skin")(e.target.value)}
            placeholder="请输入皮肤状况"
            rows={2}
            className={`${inputClass} resize-none w-full`}
          />
        </div>

        {/* 客户档案 */}
        <div>
          <Label>总消费金额</Label>
          <NumberInput value={form.totalSpend} onChange={set("totalSpend")} placeholder="0" />
        </div>
        <div>
          <Label>客户等级</Label>
          <SelectInput value={form.level} onChange={set("level")} options={CUSTOMER_LEVELS} />
        </div>
        <div>
          <Label>客户来源</Label>
          <SelectInput value={form.source} onChange={set("source")} options={CUSTOMER_SOURCES} />
        </div>
        <div>
          <Label>最后到店时间</Label>
          <TextInput value={form.lastVisit} onChange={set("lastVisit")} placeholder="请选择" type="datetime-local" />
        </div>

        <div className="col-span-4">
          <Label>备注</Label>
          <textarea
            value={form.notes}
            onChange={(e) => set("notes")(e.target.value)}
            placeholder="请输入备注"
            rows={2}
            className={`${inputClass} resize-none w-full`}
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          onClick={() => onComplete?.("")}
          className="px-5 py-2.5 border border-black/15 rounded-xl text-sm text-[#6F6678] hover:bg-black/5 transition-colors active:scale-95"
        >
          取消
        </button>
        <button
          onClick={handleSubmit}
          disabled={!form.name.trim()}
          className="px-5 py-2.5 bg-[#2D1B69] text-white rounded-xl text-sm font-medium hover:bg-[#3d2a8a] transition-colors active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          创建
        </button>
      </div>
    </div>
  );
}

export function CustomerRegistrationSuccessCard({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-4 py-1">
      <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
        <Check className="w-5 h-5 text-green-600" />
      </div>
      <div className="flex flex-col gap-0.5">
        <p className="text-base font-semibold text-[#1F1B2D]">客户登记成功</p>
        <p className="text-sm text-[#6F6678]">
          已为 <span className="text-[#2D1B69] font-medium">{name}</span> 创建客户档案
        </p>
      </div>
    </div>
  );
}
