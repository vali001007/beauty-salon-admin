import React, { useMemo, useState } from "react";
import { AlertCircle, CheckCircle, Minus, Plus, Printer, Trash2, X } from "lucide-react";
import { PaymentStep } from "./PaymentStep";
import { SearchableSelect } from "./SearchableSelect";
import { formatBusinessDate, formatBusinessDateTime } from "../utils/businessTime";

export interface CashierCustomerOption {
  id: string;
  label: string;
}

export interface CashierServiceOption {
  id: string;
  name: string;
  price: number;
}

export interface CashierSubmitPayload {
  customerId: string;
  items: Array<{ id: string; name: string; price: number; qty: number }>;
  discount: number;
  payMethod: string;
}

interface CartItem {
  id: string;
  name: string;
  price: number;
  qty: number;
}

type Step = "order" | "pay" | "done";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#6F6678]">{children}</p>;
}

function ReceiptOverlay({
  storeName,
  cashierName,
  customer,
  cart,
  total,
  subtotal,
  discountAmt,
  payMethod,
  receiptNo,
  paidAt,
  onClose,
}: {
  storeName?: string;
  cashierName?: string;
  customer: string;
  cart: CartItem[];
  total: number;
  subtotal: number;
  discountAmt: number;
  payMethod: string;
  receiptNo: string;
  paidAt: Date;
  onClose: () => void;
}) {
  const dateStr = formatBusinessDate(paidAt);
  const timeStr = formatBusinessDateTime(paidAt, { seconds: true }).slice(11);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-[400px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-black/8 px-5 py-4">
          <p className="font-semibold text-[#1F1B2D]">小票预览</p>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-[#6F6678] hover:bg-black/5">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-0.5 rounded-xl border border-black/8 bg-[#FAFAF8] p-5 text-sm" style={{ fontFamily: "'Courier New', monospace" }}>
            <div className="mb-3 text-center">
              <p className="text-base font-bold text-[#1F1B2D]">{storeName || "当前门店"}</p>
              <p className="mt-0.5 text-xs text-[#6F6678]">消费小票</p>
            </div>
            <div className="my-2 border-t border-dashed border-black/20" />
            {[
              ["单号", receiptNo],
              ["日期", dateStr],
              ["时间", timeStr],
              ["客户", customer],
              ["收银员", cashierName || "当前操作员"],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between text-xs text-[#6F6678]">
                <span>{label}</span>
                <span>{value}</span>
              </div>
            ))}
            <div className="my-2 border-t border-dashed border-black/20" />
            {cart.map((item) => (
              <div key={item.id} className="flex justify-between text-xs text-[#1F1B2D]">
                <span className="flex-1 truncate">{item.name}</span>
                <span className="w-8 text-center">x{item.qty}</span>
                <span className="w-16 text-right">¥{(item.price * item.qty).toFixed(2)}</span>
              </div>
            ))}
            <div className="my-2 border-t border-dashed border-black/20" />
            <div className="flex justify-between text-xs text-[#6F6678]">
              <span>小计</span>
              <span>¥{subtotal.toFixed(2)}</span>
            </div>
            {discountAmt > 0 ? (
              <div className="flex justify-between text-xs text-[#6F6678]">
                <span>优惠</span>
                <span>-¥{discountAmt.toFixed(2)}</span>
              </div>
            ) : null}
            <div className="mt-1 flex justify-between text-sm font-bold text-[#1F1B2D]">
              <span>实付</span>
              <span>¥{total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs text-[#6F6678]">
              <span>支付方式</span>
              <span>{payMethod}</span>
            </div>
          </div>
        </div>
        <div className="border-t border-black/8 px-5 pb-5 pt-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[#2D1B69]">
              <Printer className="h-5 w-5" />
              <span className="text-sm font-medium">请通过真实打印任务发送小票</span>
            </div>
            <button type="button" onClick={onClose} className="rounded-lg bg-black/5 px-4 py-2 text-sm text-[#1F1B2D] hover:bg-black/10">
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CashierCard({
  customers = [],
  services = [],
  storeName,
  cashierName,
  onSubmit,
}: {
  customers?: CashierCustomerOption[];
  services?: CashierServiceOption[];
  storeName?: string;
  cashierName?: string;
  onSubmit?: (payload: CashierSubmitPayload) => void | Promise<void>;
}) {
  const [step, setStep] = useState<Step>("order");
  const [customerLabel, setCustomerLabel] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState("");
  const [payMethodLabel, setPayMethodLabel] = useState("");
  const [showReceipt, setShowReceipt] = useState(false);
  const [paidAt] = useState(new Date());
  const [receiptNo] = useState(() => `RC${Date.now().toString().slice(-8)}`);
  const customerOptions = customers.map((customer) => customer.label);
  const selectedCustomer = customers.find((customer) => customer.label === customerLabel);
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const discountAmt = Math.min(subtotal, Math.max(0, Number(discount) || 0));
  const total = subtotal - discountAmt;
  const canSubmit = Boolean(selectedCustomer && cart.length && total >= 0 && onSubmit);

  const serviceById = useMemo(() => new Map(services.map((service) => [service.id, service])), [services]);

  const addItem = (service: CashierServiceOption) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === service.id);
      if (existing) return prev.map((item) => (item.id === service.id ? { ...item, qty: item.qty + 1 } : item));
      return [...prev, { ...service, qty: 1 }];
    });
  };

  const changeQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev.flatMap((item) => {
        if (item.id !== id) return [item];
        const next = item.qty + delta;
        return next <= 0 ? [] : [{ ...item, qty: next }];
      }),
    );
  };

  const updatePrice = (id: string, value: string) => {
    const next = Number(value);
    if (Number.isNaN(next) || next < 0) return;
    setCart((prev) => prev.map((item) => (item.id === id ? { ...item, price: next } : item)));
  };

  const handleConfirm = async (_key: string, label: string) => {
    if (!selectedCustomer || !onSubmit) return;
    await onSubmit({
      customerId: selectedCustomer.id,
      items: cart,
      discount: discountAmt,
      payMethod: label,
    });
    setPayMethodLabel(label);
    setStep("done");
  };

  if (step === "order") {
    return (
      <div className="flex flex-col gap-5">
        <h3 className="text-lg font-semibold text-[#1F1B2D]">收银开单</h3>

        {!customers.length || !services.length ? (
          <div className="flex items-center gap-2 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            <AlertCircle className="h-4 w-4" />
            暂无真实客户或项目目录，请接入收银上下文后使用。
          </div>
        ) : null}

        <div>
          <SectionTitle>客户</SectionTitle>
          <SearchableSelect value={customerLabel} onChange={setCustomerLabel} options={customerOptions} placeholder="请选择客户" />
        </div>

        <div>
          <SectionTitle>项目/商品</SectionTitle>
          <div className="grid max-h-48 grid-cols-4 gap-2 overflow-y-auto rounded-xl border border-black/8 bg-[#F7F5F2] p-3">
            {services.length ? (
              services.map((service) => (
                <button
                  key={service.id}
                  type="button"
                  onClick={() => addItem(service)}
                  className="rounded-lg bg-white px-3 py-2 text-left text-sm transition-colors hover:bg-[#2D1B69]/5"
                >
                  <div className="truncate font-medium text-[#1F1B2D]">{service.name}</div>
                  <div className="mt-0.5 text-xs text-[#C9956C]">¥{service.price.toFixed(2)}</div>
                </button>
              ))
            ) : (
              <div className="col-span-4 py-6 text-center text-sm text-[#9B92A3]">暂无项目目录</div>
            )}
          </div>
        </div>

        <div>
          <SectionTitle>已选明细</SectionTitle>
          <div className="overflow-hidden rounded-xl border border-black/8">
            {cart.length === 0 ? (
              <div className="py-8 text-center text-sm text-[#B0A8BB]">请添加项目或商品</div>
            ) : (
              cart.map((item) => (
                <div key={item.id} className="flex items-center gap-3 border-b border-black/5 px-4 py-3 last:border-0">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-[#1F1B2D]">{item.name}</div>
                  </div>
                  <input
                    type="number"
                    value={item.price}
                    onChange={(e) => updatePrice(item.id, e.target.value)}
                    className="w-24 rounded-lg border border-black/10 px-2 py-1.5 text-right text-sm"
                  />
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => changeQty(item.id, -1)} className="flex h-7 w-7 items-center justify-center rounded bg-black/5">
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-8 text-center text-sm">{item.qty}</span>
                    <button type="button" onClick={() => changeQty(item.id, 1)} className="flex h-7 w-7 items-center justify-center rounded bg-black/5">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <button type="button" onClick={() => setCart((prev) => prev.filter((row) => row.id !== item.id))} className="text-red-400">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex items-end justify-between border-t border-black/8 pt-4">
          <div className="w-48">
            <label className="mb-1.5 block text-sm text-[#6F6678]">优惠金额</label>
            <input value={discount} onChange={(e) => setDiscount(e.target.value)} type="number" className="w-full rounded-lg border border-black/15 px-3 py-2.5 text-sm" />
          </div>
          <div className="text-right">
            <div className="text-sm text-[#6F6678]">应收</div>
            <div className="text-3xl font-bold text-[#1F1B2D]">¥{total.toFixed(2)}</div>
          </div>
          <button
            type="button"
            onClick={() => setStep("pay")}
            disabled={!canSubmit}
            className="rounded-xl bg-[#2D1B69] px-8 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            去收款
          </button>
        </div>
      </div>
    );
  }

  if (step === "pay") {
    return (
      <div className="flex flex-col gap-5">
        <h3 className="text-lg font-semibold text-[#1F1B2D]">确认收款</h3>
        <PaymentStep amount={total} disabled={!canSubmit} onConfirm={handleConfirm} onCancel={() => setStep("order")} />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      {showReceipt ? (
        <ReceiptOverlay
          storeName={storeName}
          cashierName={cashierName}
          customer={customerLabel}
          cart={cart}
          total={total}
          subtotal={subtotal}
          discountAmt={discountAmt}
          payMethod={payMethodLabel}
          receiptNo={receiptNo}
          paidAt={paidAt}
          onClose={() => setShowReceipt(false)}
        />
      ) : null}
      <CheckCircle className="h-12 w-12 text-green-600" />
      <div>
        <h3 className="text-xl font-semibold text-[#1F1B2D]">收款完成</h3>
        <p className="mt-1 text-sm text-[#6F6678]">订单已提交到真实收银回调。</p>
      </div>
      <button type="button" onClick={() => setShowReceipt(true)} className="flex items-center gap-2 rounded-xl border border-black/10 px-5 py-2.5 text-sm text-[#1F1B2D]">
        <Printer className="h-4 w-4" />
        查看小票
      </button>
    </div>
  );
}
