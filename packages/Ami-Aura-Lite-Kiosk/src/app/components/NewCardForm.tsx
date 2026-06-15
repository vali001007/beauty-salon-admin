import React, { useMemo, useState } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { PaymentStep } from "./PaymentStep";
import { SearchableSelect } from "./SearchableSelect";

export interface CardCatalogOption {
  id: string;
  name: string;
  price: number;
  sessions: number;
  projects?: string[];
}

export interface NewCardCustomerOption {
  id: string;
  label: string;
}

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

export interface NewCardSubmitPayload extends NewCardResult {
  customerId: string;
  cardId: string;
  projectItems: ProjectItem[];
  giftItems: ProjectItem[];
  note: string;
}

const labelClass = "mb-1.5 block text-sm text-[#6F6678]";
const inputClass =
  "w-full rounded-lg border border-black/15 bg-white px-3 py-2.5 text-sm text-[#1F1B2D] outline-none transition-colors placeholder:text-[#B0A8BB] focus:border-[#2D1B69]";

function SelectField({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
}) {
  return (
    <div className="relative w-full">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={!options.length}
        className={`${inputClass} w-full cursor-pointer appearance-none pr-8 disabled:cursor-not-allowed disabled:bg-black/[0.03] disabled:text-[#9B92A3] ${
          value === "" ? "text-[#B0A8BB]" : "text-[#1F1B2D]"
        }`}
      >
        <option value="" disabled>
          {options.length ? placeholder : "暂无可选数据"}
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#6F6678]">⌄</span>
    </div>
  );
}

function ProjectTable({ items, onRemove }: { items: ProjectItem[]; onRemove: (id: string) => void }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-black/8">
          {["项目", "总次数", "已用次数", "剩余次数", "操作"].map((head) => (
            <th key={head} className="px-3 py-2.5 text-left font-medium text-[#6F6678]">
              {head}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {items.length === 0 ? (
          <tr>
            <td colSpan={5} className="py-6 text-center text-sm text-[#B0A8BB]">
              暂无数据
            </td>
          </tr>
        ) : (
          items.map((item) => (
            <tr key={item.id} className="border-b border-black/5">
              <td className="px-3 py-2.5 text-[#1F1B2D]">{item.name}</td>
              <td className="px-3 py-2.5 text-[#1F1B2D]">{item.total}</td>
              <td className="px-3 py-2.5 text-[#1F1B2D]">{item.used}</td>
              <td className="px-3 py-2.5 text-[#1F1B2D]">{item.total - item.used}</td>
              <td className="px-3 py-2.5">
                <button type="button" onClick={() => onRemove(item.id)} className="text-red-400 transition-colors hover:text-red-500">
                  <Trash2 className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

export function NewCardForm({
  customers = [],
  cards = [],
  projects = [],
  storeName,
  onComplete,
  onSubmit,
}: {
  customers?: NewCardCustomerOption[];
  cards?: CardCatalogOption[];
  projects?: string[];
  storeName?: string;
  onComplete: (result: NewCardResult) => void;
  onSubmit?: (payload: NewCardSubmitPayload) => void | Promise<void>;
}) {
  const [cardId, setCardId] = useState("");
  const [actualPrice, setActualPrice] = useState(0);
  const [customerLabel, setCustomerLabel] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [note, setNote] = useState("");
  const [projectItems, setProjectItems] = useState<ProjectItem[]>([]);
  const [giftItems, setGiftItems] = useState<ProjectItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const selectedCard = cards.find((card) => card.id === cardId);
  const selectedCustomer = customers.find((customer) => customer.label === customerLabel);
  const cardOptions = useMemo(() => cards.map((card) => ({ value: card.id, label: card.name })), [cards]);
  const customerOptions = useMemo(() => customers.map((customer) => customer.label), [customers]);
  const originalPrice = selectedCard?.price ?? 0;
  const isValid = Boolean(selectedCard && selectedCustomer && startDate && endDate && onSubmit);

  const handleCardChange = (nextCardId: string) => {
    setCardId(nextCardId);
    const card = cards.find((item) => item.id === nextCardId);
    setActualPrice(card?.price ?? 0);
    setProjectItems(
      (card?.projects ?? []).map((name, index) => ({
        id: `${nextCardId}-project-${index}`,
        name,
        total: card?.sessions ?? 0,
        used: 0,
      })),
    );
  };

  const addProject = (setter: React.Dispatch<React.SetStateAction<ProjectItem[]>>) => {
    const name = projects[0];
    if (!name) return;
    setter((prev) => [...prev, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name, total: 1, used: 0 }]);
  };

  const handleSubmit = async (payMethodLabel: string) => {
    if (!isValid || !selectedCard || !selectedCustomer || submitting) return;
    const result: NewCardResult = {
      customer: selectedCustomer.label,
      cardName: selectedCard.name,
      actualPrice,
      payMethod: payMethodLabel,
      startDate,
      endDate,
    };
    setSubmitting(true);
    try {
      await onSubmit?.({
        ...result,
        customerId: selectedCustomer.id,
        cardId: selectedCard.id,
        projectItems,
        giftItems,
        note,
      });
      onComplete(result);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <h3 className="text-lg font-semibold text-[#1F1B2D]">新增次卡订单</h3>

      {!customers.length || !cards.length ? (
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          暂无真实客户或卡项目录，请接入办卡上下文后使用。
        </div>
      ) : null}

      <div className="grid grid-cols-4 gap-x-5 gap-y-4">
        <div className="col-span-2">
          <label className={labelClass}>
            <span className="text-red-500">*</span> 次卡
          </label>
          <SelectField value={cardId} onChange={handleCardChange} options={cardOptions} placeholder="请选择卡片" />
        </div>
        <div>
          <label className={labelClass}>次卡原价</label>
          <div className="rounded-lg border border-black/10 bg-[#F7F5F2] px-3 py-2.5 text-sm text-[#6F6678]">
            {originalPrice > 0 ? `¥ ${originalPrice.toFixed(2)}` : "0 元"}
          </div>
        </div>
        <div>
          <label className={labelClass}>实际售价</label>
          <div className="flex items-center overflow-hidden rounded-lg border border-black/15 bg-white">
            <button type="button" onClick={() => setActualPrice((price) => Math.max(0, +(price - 100).toFixed(2)))} className="flex h-10 w-9 shrink-0 items-center justify-center text-[#6F6678] hover:bg-[#F7F5F2]">
              <Minus className="h-3.5 w-3.5" />
            </button>
            <input type="number" value={actualPrice} onChange={(e) => setActualPrice(Math.max(0, Number(e.target.value)))} className="min-w-0 flex-1 border-none bg-transparent text-center text-sm text-[#1F1B2D] outline-none" />
            <button type="button" onClick={() => setActualPrice((price) => +(price + 100).toFixed(2))} className="flex h-10 w-9 shrink-0 items-center justify-center text-[#6F6678] hover:bg-[#F7F5F2]">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div>
          <label className={labelClass}>
            <span className="text-red-500">*</span> 用户名称
          </label>
          <SearchableSelect value={customerLabel} onChange={setCustomerLabel} options={customerOptions} placeholder="请选择客户" />
        </div>
        <div>
          <label className={labelClass}>所属门店</label>
          <div className="rounded-lg border border-black/10 bg-[#F7F5F2] px-3 py-2.5 text-sm text-[#6F6678]">
            {storeName || "当前终端门店"}
          </div>
        </div>
        <div>
          <label className={labelClass}>
            <span className="text-red-500">*</span> 启动时间
          </label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>
            <span className="text-red-500">*</span> 过期时间
          </label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
        </div>

        <div className="col-span-4">
          <label className={labelClass}>备注</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="请输入备注" rows={2} className={`${inputClass} resize-none`} />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-black/8">
        <div className="flex items-center justify-between border-b border-black/8 bg-[#F7F5F2] px-4 py-3">
          <span className="text-sm font-medium text-[#1F1B2D]">卡内项目</span>
          <button type="button" onClick={() => addProject(setProjectItems)} disabled={!projects.length} className="text-sm text-[#2D1B69] disabled:cursor-not-allowed disabled:opacity-50">
            添加项目
          </button>
        </div>
        <ProjectTable items={projectItems} onRemove={(id) => setProjectItems((prev) => prev.filter((item) => item.id !== id))} />
      </div>

      <div className="overflow-hidden rounded-xl border border-black/8">
        <div className="flex items-center justify-between border-b border-black/8 bg-[#F7F5F2] px-4 py-3">
          <span className="text-sm font-medium text-[#1F1B2D]">赠送项目</span>
          <button type="button" onClick={() => addProject(setGiftItems)} disabled={!projects.length} className="text-sm text-[#2D1B69] disabled:cursor-not-allowed disabled:opacity-50">
            添加赠送
          </button>
        </div>
        <ProjectTable items={giftItems} onRemove={(id) => setGiftItems((prev) => prev.filter((item) => item.id !== id))} />
      </div>

      <PaymentStep
        amount={actualPrice}
        disabled={!isValid || submitting}
        confirmLabel={submitting ? "提交中" : `确认办卡 ¥${actualPrice.toFixed(2)}`}
        onConfirm={(_key, label) => handleSubmit(label)}
      />
    </div>
  );
}
