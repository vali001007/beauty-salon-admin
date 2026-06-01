import React, { useState } from "react";
import { Plus, Minus, Trash2, Check, Printer } from "lucide-react";
import { PaymentStep } from "./PaymentStep";
import { mockData } from "../types";
import { SearchableSelect } from "./SearchableSelect";

const CARD_CATALOG = [
  { name: "面部护理次卡", price: 2800, sessions: 10 },
  { name: "全身SPA次卡", price: 3500, sessions: 5 },
  { name: "头皮护理次卡", price: 1800, sessions: 8 },
  { name: "美甲护理次卡", price: 1200, sessions: 6 },
  { name: "睫毛嫁接次卡", price: 2200, sessions: 4 },
];

const STORES = ["国颜智美·南山店", "国颜智美·福田店", "国颜智美·罗湖店"];
const CUSTOMERS = ["张三", "李四", "王五", "赵六", "陈七"];
const PROJECTS = ["面部护理", "全身SPA", "头皮护理", "美甲", "睫毛嫁接", "纹绣"];

interface ProjectItem {
  id: string;
  name: string;
  total: number;
  used: number;
}

export interface NewCardResult {
  customer: string;
  cardName: string;
  actualPrice: number;
  payMethod: string;
  startDate: string;
  endDate: string;
}

const labelClass = "text-sm text-[#6F6678] mb-1.5 block";
const inputClass = "w-full px-3 py-2.5 border border-black/15 rounded-lg text-sm text-[#1F1B2D] bg-white outline-none focus:border-[#2D1B69] transition-colors placeholder:text-[#B0A8BB]";

function SelectField({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
}) {
  return (
    <div className="relative w-full">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} w-full pr-8 appearance-none cursor-pointer ${value === "" ? "text-[#B0A8BB]" : "text-[#1F1B2D]"}`}
      >
        <option value="" disabled>{placeholder}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#6F6678] text-xs">∨</span>
    </div>
  );
}

function ProjectTable({
  items,
  onRemove,
}: {
  items: ProjectItem[];
  onRemove: (id: string) => void;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-black/8">
          {["项目", "总次数", "已用次数", "剩余次数", "操作"].map((h) => (
            <th key={h} className="py-2.5 px-3 text-left text-[#6F6678] font-medium">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {items.length === 0 ? (
          <tr>
            <td colSpan={5} className="py-6 text-center text-[#B0A8BB] text-sm">暂无数据</td>
          </tr>
        ) : (
          items.map((item) => (
            <tr key={item.id} className="border-b border-black/5">
              <td className="py-2.5 px-3 text-[#1F1B2D]">{item.name}</td>
              <td className="py-2.5 px-3 text-[#1F1B2D]">{item.total}</td>
              <td className="py-2.5 px-3 text-[#1F1B2D]">{item.used}</td>
              <td className="py-2.5 px-3 text-[#1F1B2D]">{item.total - item.used}</td>
              <td className="py-2.5 px-3">
                <button onClick={() => onRemove(item.id)} className="text-red-400 hover:text-red-500 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

export function NewCardForm({ onComplete }: { onComplete: (result: NewCardResult) => void }) {
  const [cardName, setCardName] = useState("");
  const [actualPrice, setActualPrice] = useState(0);
  const [customer, setCustomer] = useState("");
  const [store, setStore] = useState(mockData.storeName);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [note, setNote] = useState("");
  const [projectItems, setProjectItems] = useState<ProjectItem[]>([]);
  const [giftItems, setGiftItems] = useState<ProjectItem[]>([]);

  const selectedCard = CARD_CATALOG.find((c) => c.name === cardName);
  const originalPrice = selectedCard?.price ?? 0;

  const handleCardChange = (name: string) => {
    setCardName(name);
    const card = CARD_CATALOG.find((c) => c.name === name);
    if (card) setActualPrice(card.price);
  };

  const addProject = (setter: React.Dispatch<React.SetStateAction<ProjectItem[]>>) => {
    const name = PROJECTS[Math.floor(Math.random() * PROJECTS.length)];
    setter((prev) => [...prev, { id: String(Date.now()), name, total: 10, used: 0 }]);
  };

  const isValid = cardName && customer && store && startDate && endDate;

  const handleSubmit = (payMethodLabel: string) => {
    if (!isValid) return;
    onComplete({ customer, cardName, actualPrice, payMethod: payMethodLabel, startDate, endDate });
  };

  return (
    <div className="flex flex-col gap-5">
      <h3 className="text-lg font-semibold text-[#1F1B2D]">新增次卡订单</h3>

      <div className="grid grid-cols-4 gap-x-5 gap-y-4">
        {/* 次卡、原价、实际售价 */}
        <div className="col-span-2">
          <label className={labelClass}><span className="text-red-500">*</span> 次卡</label>
          <SelectField value={cardName} onChange={handleCardChange} options={CARD_CATALOG.map((c) => c.name)} placeholder="请选择卡片" />
        </div>
        <div>
          <label className={labelClass}>次卡原价</label>
          <div className="px-3 py-2.5 bg-[#F7F5F2] border border-black/10 rounded-lg text-sm text-[#6F6678]">
            {originalPrice > 0 ? `¥ ${originalPrice.toFixed(2)}` : "0 元"}
          </div>
        </div>
        <div>
          <label className={labelClass}>实际售价</label>
          <div className="flex items-center border border-black/15 rounded-lg overflow-hidden bg-white">
            <button onClick={() => setActualPrice((p) => Math.max(0, +(p - 100).toFixed(2)))} className="w-9 h-10 flex items-center justify-center text-[#6F6678] hover:bg-[#F7F5F2] transition-colors shrink-0">
              <Minus className="w-3.5 h-3.5" />
            </button>
            <input type="number" value={actualPrice} onChange={(e) => setActualPrice(Math.max(0, Number(e.target.value)))} className="flex-1 text-center text-sm text-[#1F1B2D] outline-none border-none bg-transparent min-w-0" />
            <button onClick={() => setActualPrice((p) => +(p + 100).toFixed(2))} className="w-9 h-10 flex items-center justify-center text-[#6F6678] hover:bg-[#F7F5F2] transition-colors shrink-0">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 客户、门店、时间 */}
        <div>
          <label className={labelClass}><span className="text-red-500">*</span> 用户名称</label>
          <SearchableSelect value={customer} onChange={setCustomer} options={CUSTOMERS} placeholder="请选择客户" />
        </div>
        <div>
          <label className={labelClass}><span className="text-red-500">*</span> 所属门店</label>
          <SelectField value={store} onChange={setStore} options={STORES} placeholder="请选择门店" />
        </div>
        <div>
          <label className={labelClass}><span className="text-red-500">*</span> 启动时间</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}><span className="text-red-500">*</span> 过期时间</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
        </div>

        <div className="col-span-4">
          <label className={labelClass}>备注</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="请输入备注" rows={2} className={`${inputClass} resize-none`} />
        </div>
      </div>

      <div className="border border-black/8 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-[#F7F5F2] border-b border-black/8">
          <p className="text-sm font-semibold text-[#1F1B2D]">项目明细</p>
        </div>
        <div className="p-1">
          <ProjectTable items={projectItems} onRemove={(id) => setProjectItems((p) => p.filter((i) => i.id !== id))} />
        </div>
      </div>

      <div className="border border-black/8 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-[#F7F5F2] border-b border-black/8 flex items-center justify-between">
          <p className="text-sm font-semibold text-[#1F1B2D]">赠送项目</p>
          <div className="flex items-center gap-2">
            <button onClick={() => addProject(setGiftItems)} className="px-3 py-1.5 bg-[#52C41A] text-white rounded-lg text-xs font-medium hover:bg-[#45a716] transition-colors active:scale-95">自定义项目</button>
            <button onClick={() => addProject(setGiftItems)} className="px-3 py-1.5 bg-[#4A90E2] text-white rounded-lg text-xs font-medium hover:bg-[#3a7fd2] transition-colors active:scale-95">添加项目</button>
          </div>
        </div>
        <div className="p-1">
          <ProjectTable items={giftItems} onRemove={(id) => setGiftItems((p) => p.filter((i) => i.id !== id))} />
        </div>
      </div>

      <PaymentStep
        amount={actualPrice}
        disabled={!isValid}
        confirmLabel={`确认办卡 ¥${actualPrice > 0 ? actualPrice.toFixed(2) : "0.00"}`}
        onConfirm={(_key, label) => handleSubmit(label)}
      />
    </div>
  );
}

export function NewCardSuccessCard({ result }: { result: NewCardResult }) {
  return (
    <div className="flex items-center gap-4 py-1">
      <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
        <Check className="w-5 h-5 text-green-600" />
      </div>
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <p className="text-base font-semibold text-[#1F1B2D]">办卡成功</p>
        <p className="text-sm text-[#6F6678]">
          <span className="text-[#2D1B69] font-medium">{result.customer}</span>
          {" · "}{result.cardName}
          {" · "}实付 <span className="text-[#2D1B69] font-medium">¥{result.actualPrice.toFixed(2)}</span>
          {" · "}{result.payMethod}
        </p>
      </div>
      <button className="flex items-center gap-1.5 px-4 py-2 border border-black/15 text-[#1F1B2D] rounded-lg text-sm font-medium hover:bg-black/5 transition-colors active:scale-95 shrink-0">
        <Printer className="w-3.5 h-3.5" />
        打印小票
      </button>
    </div>
  );
}
