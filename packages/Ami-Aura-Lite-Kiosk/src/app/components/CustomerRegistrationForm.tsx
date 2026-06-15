import React, { useState } from "react";
import { Check } from "lucide-react";

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

export type CustomerRegistrationSubmitData = FormData;

const CUSTOMER_LEVELS = ["无", "普通会员", "银卡会员", "金卡会员", "钻石会员"];
const CUSTOMER_SOURCES = ["请选择客户来源", "朋友推荐", "社交媒体", "线上广告", "门店活动", "自然到访", "其他"];

const inputClass =
  "w-full rounded-lg border border-black/15 bg-white px-3 py-2.5 text-sm text-[#1F1B2D] outline-none transition-colors placeholder:text-[#B0A8BB] focus:border-[#2D1B69]";

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="mb-1.5 block text-sm text-[#6F6678]">
      {required && <span className="mr-0.5 text-red-500">*</span>}
      {children}
    </label>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inputClass} />;
}

function RadioGroup({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-5 py-2.5">
      {options.map((opt) => (
        <label key={opt} className="flex cursor-pointer items-center gap-2 text-sm text-[#1F1B2D]">
          <button
            type="button"
            onClick={() => onChange(opt)}
            className={`flex h-4 w-4 items-center justify-center rounded-full border-2 transition-colors ${
              value === opt ? "border-[#4A90E2]" : "border-black/20"
            }`}
          >
            {value === opt && <span className="h-2 w-2 rounded-full bg-[#4A90E2]" />}
          </button>
          {opt}
        </label>
      ))}
    </div>
  );
}

function SelectInput({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`${inputClass} w-full cursor-pointer appearance-none pr-8 disabled:cursor-not-allowed disabled:bg-black/[0.03] disabled:text-[#9B92A3]`}
      >
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#6F6678]">⌄</span>
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return <input type="number" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inputClass} />;
}

export function CustomerRegistrationForm({
  storeName = "",
  onComplete,
  onSubmit,
}: {
  storeName?: string;
  onComplete?: (name: string) => void;
  onSubmit?: (data: CustomerRegistrationSubmitData) => void | Promise<void>;
}) {
  const [form, setForm] = useState<FormData>({
    name: "",
    store: storeName,
    email: "",
    phone: "",
    landline: "",
    wechat: "",
    gender: "女",
    marital: "未知",
    birthdate: "",
    age: "",
    height: "",
    weight: "",
    occupation: "",
    company: "",
    address: "",
    allergy: "无",
    surgery: "无",
    skin: "",
    totalSpend: "0",
    level: "无",
    source: "请选择客户来源",
    lastVisit: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const set = (key: keyof FormData) => (value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    if (!form.name.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit?.(form);
      onComplete?.(form.name);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <h3 className="text-lg font-semibold text-[#1F1B2D]">新增客户</h3>

      <div className="grid grid-cols-4 gap-x-5 gap-y-4">
        <div className="col-span-2">
          <Label required>客户名称</Label>
          <TextInput value={form.name} onChange={set("name")} placeholder="请输入客户名称" />
        </div>
        <div className="col-span-2">
          <Label>所属门店</Label>
          <SelectInput value={form.store} onChange={set("store")} options={storeName ? [storeName] : ["当前终端门店"]} disabled />
        </div>

        <div>
          <Label>手机号码</Label>
          <TextInput value={form.phone} onChange={set("phone")} placeholder="请输入手机号" type="tel" />
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

        <div>
          <Label required>性别</Label>
          <RadioGroup options={["男", "女"]} value={form.gender} onChange={set("gender")} />
        </div>
        <div>
          <Label>婚姻状态</Label>
          <RadioGroup options={["未知", "已婚", "未婚"]} value={form.marital} onChange={set("marital")} />
        </div>
        <div>
          <Label>出生日期</Label>
          <TextInput value={form.birthdate} onChange={set("birthdate")} type="date" />
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

        <div>
          <Label>过敏史</Label>
          <RadioGroup options={["无", "有"]} value={form.allergy} onChange={set("allergy")} />
        </div>
        <div>
          <Label>手术或微创史</Label>
          <RadioGroup options={["无", "有"]} value={form.surgery} onChange={set("surgery")} />
        </div>
        <div>
          <Label>会员等级</Label>
          <SelectInput value={form.level} onChange={set("level")} options={CUSTOMER_LEVELS} />
        </div>
        <div>
          <Label>客户来源</Label>
          <SelectInput value={form.source} onChange={set("source")} options={CUSTOMER_SOURCES} />
        </div>

        <div className="col-span-2">
          <Label>皮肤情况</Label>
          <TextInput value={form.skin} onChange={set("skin")} placeholder="请输入皮肤情况" />
        </div>
        <div>
          <Label>累计消费</Label>
          <NumberInput value={form.totalSpend} onChange={set("totalSpend")} />
        </div>
        <div>
          <Label>最近到店</Label>
          <TextInput value={form.lastVisit} onChange={set("lastVisit")} type="date" />
        </div>

        <div className="col-span-4">
          <Label>备注</Label>
          <textarea value={form.notes} onChange={(e) => set("notes")(e.target.value)} rows={3} className={`${inputClass} resize-none`} />
        </div>
      </div>

      <div className="flex justify-end border-t border-black/8 pt-4">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!form.name.trim() || submitting}
          className="flex items-center gap-2 rounded-xl bg-[#2D1B69] px-8 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#3d2a8a] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Check className="h-4 w-4" />
          {submitting ? "提交中" : "确认登记"}
        </button>
      </div>
    </div>
  );
}
