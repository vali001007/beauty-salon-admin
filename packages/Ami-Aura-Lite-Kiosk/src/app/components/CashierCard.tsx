import React, { useState } from "react";
import { Plus, Minus, Trash2, Check, Printer, X, CheckCircle, AlertCircle, Loader } from "lucide-react";
import { mockData } from "../types";
import { SearchableSelect } from "./SearchableSelect";
import { PaymentStep } from "./PaymentStep";

const CUSTOMERS = ["张三 138****5678", "李四 139****1234", "王五 137****5566", "赵六 136****7788", "陈七 135****9900"];
const SERVICES = [
  { id: "s1", name: "面部护理", price: 280 },
  { id: "s2", name: "全身SPA", price: 480 },
  { id: "s3", name: "头皮护理", price: 180 },
  { id: "s4", name: "美甲", price: 120 },
  { id: "s5", name: "睫毛嫁接", price: 350 },
  { id: "s6", name: "纹绣", price: 680 },
  { id: "s7", name: "精油推拿", price: 380 },
  { id: "s8", name: "肩颈护理", price: 160 },
];
const PAY_METHODS = [
  { key: "wechat", label: "微信" },
  { key: "alipay", label: "支付宝" },
  { key: "card", label: "刷卡" },
  { key: "cash", label: "现金" },
  { key: "balance", label: "会员余额" },
];

interface CartItem {
  id: string;
  name: string;
  price: number;
  qty: number;
}

type Step = "order" | "pay" | "done";
type PrintStatus = "idle" | "preview" | "printing" | "success" | "error";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold text-[#6F6678] uppercase tracking-wide mb-2">{children}</p>;
}

// ── Receipt preview + print status overlay ───────────────
function ReceiptOverlay({
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
  const [printStatus, setPrintStatus] = useState<PrintStatus>("preview");

  const handlePrint = () => {
    setPrintStatus("printing");
    // simulate: sending → printing (1.2s) → success or error
    setTimeout(() => {
      // 90% success rate simulation
      setPrintStatus(Math.random() > 0.1 ? "success" : "error");
    }, 1800);
  };

  const payLabel = PAY_METHODS.find((method) => method.key === payMethod)?.label ?? payMethod;
  const dateStr = paidAt.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
  const timeStr = paidAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-[400px] max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/8">
          <p className="font-semibold text-[#1F1B2D]">小票预览</p>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-black/5 text-[#6F6678] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Receipt paper */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Simulated thermal receipt */}
          <div className="bg-[#FAFAF8] border border-black/8 rounded-xl p-5 font-mono text-sm flex flex-col gap-0.5" style={{ fontFamily: "'Courier New', monospace" }}>
            {/* Store header */}
            <div className="text-center mb-3">
              <p className="font-bold text-base text-[#1F1B2D]">{mockData.storeName}</p>
              <p className="text-xs text-[#6F6678] mt-0.5">消费小票</p>
            </div>

            <div className="border-t border-dashed border-black/20 my-2" />

            {/* Meta */}
            <div className="flex justify-between text-xs text-[#6F6678]">
              <span>单号</span>
              <span>{receiptNo}</span>
            </div>
            <div className="flex justify-between text-xs text-[#6F6678]">
              <span>日期</span>
              <span>{dateStr}</span>
            </div>
            <div className="flex justify-between text-xs text-[#6F6678]">
              <span>时间</span>
              <span>{timeStr}</span>
            </div>
            <div className="flex justify-between text-xs text-[#6F6678]">
              <span>客户</span>
              <span>{customer.split(" ")[0]}</span>
            </div>
            <div className="flex justify-between text-xs text-[#6F6678]">
              <span>收银员</span>
              <span>{mockData.employeeName}</span>
            </div>

            <div className="border-t border-dashed border-black/20 my-2" />

            {/* Items */}
            <div className="flex justify-between text-xs text-[#6F6678] mb-1">
              <span className="flex-1">项目</span>
              <span className="w-8 text-center">数量</span>
              <span className="w-16 text-right">金额</span>
            </div>
            {cart.map((item) => (
              <div key={item.id} className="flex justify-between text-xs text-[#1F1B2D]">
                <span className="flex-1 truncate">{item.name}</span>
                <span className="w-8 text-center">x{item.qty}</span>
                <span className="w-16 text-right">¥{(item.price * item.qty).toFixed(2)}</span>
              </div>
            ))}

            <div className="border-t border-dashed border-black/20 my-2" />

            {/* Totals */}
            <div className="flex justify-between text-xs text-[#6F6678]">
              <span>小计</span>
              <span>¥{subtotal.toFixed(2)}</span>
            </div>
            {discountAmt > 0 && (
              <div className="flex justify-between text-xs text-[#6F6678]">
                <span>优惠</span>
                <span>-¥{discountAmt.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-bold text-[#1F1B2D] mt-1">
              <span>实付</span>
              <span>¥{total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs text-[#6F6678]">
              <span>支付方式</span>
              <span>{payLabel}</span>
            </div>

            <div className="border-t border-dashed border-black/20 my-2" />

            {/* Footer */}
            <div className="text-center text-xs text-[#B0A8BB] leading-relaxed">
              <p>感谢您的惠顾</p>
              <p>欢迎下次光临</p>
            </div>
          </div>
        </div>

        {/* Print action area */}
        <div className="px-5 pb-5 pt-3 border-t border-black/8">
          {printStatus === "preview" && (
            <button
              onClick={handlePrint}
              className="w-full py-3 bg-[#2D1B69] text-white rounded-xl text-sm font-medium hover:bg-[#3d2a8a] transition-colors active:scale-95 flex items-center justify-center gap-2"
            >
              <Printer className="w-4 h-4" />
              发送打印
            </button>
          )}

          {printStatus === "printing" && (
            <div className="flex flex-col items-center gap-2 py-1">
              <div className="flex items-center gap-2 text-[#2D1B69]">
                <Loader className="w-4 h-4 animate-spin" />
                <span className="text-sm font-medium">打印中，请稍候…</span>
              </div>
              <div className="w-full bg-black/8 rounded-full h-1.5 overflow-hidden">
                <div className="h-full bg-[#2D1B69] rounded-full animate-[progress_1.8s_ease-in-out_forwards]" style={{ animation: "width 1.8s ease-in-out forwards", width: "100%" }} />
              </div>
            </div>
          )}

          {printStatus === "success" && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="w-5 h-5" />
                <span className="text-sm font-medium">打印成功</span>
              </div>
              <button onClick={onClose} className="px-4 py-2 bg-black/5 rounded-lg text-sm text-[#1F1B2D] hover:bg-black/10 transition-colors active:scale-95">
                关闭
              </button>
            </div>
          )}

          {printStatus === "error" && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-red-500">
                <AlertCircle className="w-5 h-5" />
                <span className="text-sm font-medium">打印失败，请检查打印机连接</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPrintStatus("preview")}
                  className="flex-1 py-2.5 border border-black/15 rounded-xl text-sm text-[#1F1B2D] hover:bg-black/5 transition-colors active:scale-95"
                >
                  重试
                </button>
                <button onClick={onClose} className="flex-1 py-2.5 bg-black/5 rounded-xl text-sm text-[#1F1B2D] hover:bg-black/10 transition-colors active:scale-95">
                  跳过
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function CashierCard() {
  const [step, setStep] = useState<Step>("order");
  const [customer, setCustomer] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState("");
  const [payMethod, setPayMethod] = useState("wechat");
  const [payMethodLabel, setPayMethodLabel] = useState("微信支付");
  const [showReceipt, setShowReceipt] = useState(false);
  const [paidAt] = useState(new Date());
  const [receiptNo] = useState(() => "RC" + Date.now().toString().slice(-8));

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const discountAmt = Math.min(subtotal, Math.max(0, Number(discount) || 0));
  const total = subtotal - discountAmt;

  const addItem = (svc: typeof SERVICES[0]) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === svc.id);
      if (existing) return prev.map((i) => i.id === svc.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { ...svc, qty: 1 }];
    });
  };

  const updatePrice = (id: string, value: string) => {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) return;
    setCart((prev) => prev.map((i) => i.id === id ? { ...i, price: num } : i));
  };

  const changeQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev.flatMap((i) => {
        if (i.id !== id) return [i];
        const next = i.qty + delta;
        return next <= 0 ? [] : [{ ...i, qty: next }];
      })
    );
  };

  // ── Step 1: 开单 ─────────────────────────────────────────
  if (step === "order") {
    return (
      <div className="flex flex-col gap-5">
        <h3 className="text-lg font-semibold text-[#1F1B2D]">收银开单</h3>

        {/* 客户 */}
        <div>
          <SectionTitle>客户</SectionTitle>
          <SearchableSelect
            value={customer}
            onChange={setCustomer}
            options={CUSTOMERS}
            placeholder="请选择客户"
            className="flex-none"
          />
        </div>

        {/* 项目快选 */}
        <div>
          <SectionTitle>添加项目</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {SERVICES.map((svc) => {
              const inCart = cart.find((i) => i.id === svc.id);
              return (
                <button
                  key={svc.id}
                  onClick={() => addItem(svc)}
                  className={`px-3 py-2 rounded-lg text-sm border transition-colors active:scale-95 flex items-center gap-1.5 ${
                    inCart
                      ? "bg-[#2D1B69] border-[#2D1B69] text-white"
                      : "bg-white border-black/15 text-[#1F1B2D] hover:border-[#2D1B69]/40"
                  }`}
                >
                  {inCart && <span className="text-xs bg-white/25 rounded px-1">{inCart.qty}</span>}
                  {svc.name}
                  <span className="text-xs opacity-70">¥{svc.price}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 已选项目 */}
        {cart.length > 0 && (
          <div>
            <SectionTitle>已选项目</SectionTitle>
            <div className="border border-black/8 rounded-xl overflow-hidden">
              {cart.map((item, idx) => (
                <div
                  key={item.id}
                  className={`flex items-center justify-between px-4 py-3 ${idx < cart.length - 1 ? "border-b border-black/5" : ""}`}
                >
                  <span className="text-sm text-[#1F1B2D] flex-1">{item.name}</span>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => changeQty(item.id, -1)} className="w-7 h-7 rounded-full border border-black/15 flex items-center justify-center hover:bg-black/5 active:scale-95">
                        <Minus className="w-3 h-3 text-[#6F6678]" />
                      </button>
                      <span className="text-sm w-5 text-center text-[#1F1B2D]">{item.qty}</span>
                      <button onClick={() => changeQty(item.id, 1)} className="w-7 h-7 rounded-full border border-black/15 flex items-center justify-center hover:bg-black/5 active:scale-95">
                        <Plus className="w-3 h-3 text-[#6F6678]" />
                      </button>
                    </div>
                    <div className="flex items-center w-24 justify-end">
                      <span className="text-sm text-[#6F6678] mr-0.5">¥</span>
                      <input
                        type="number"
                        value={item.price}
                        onChange={(e) => updatePrice(item.id, e.target.value)}
                        className="w-16 text-right text-sm font-medium text-[#1F1B2D] bg-transparent border-b border-dashed border-black/20 outline-none focus:border-[#2D1B69] py-0.5"
                        min={0}
                        step={10}
                      />
                    </div>
                    <button onClick={() => setCart((p) => p.filter((i) => i.id !== item.id))} className="text-red-300 hover:text-red-400 ml-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between px-4 py-3 bg-[#F7F5F2] border-t border-black/8">
                <span className="text-sm text-[#6F6678]">小计</span>
                <span className="text-base font-semibold text-[#1F1B2D]">¥{subtotal.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}

        <button
          onClick={() => setStep("pay")}
          disabled={!customer || cart.length === 0}
          className="w-full py-3 bg-[#C9956C] text-white rounded-xl font-medium text-base hover:bg-[#b0825c] transition-colors active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          去收款 {cart.length > 0 && `· ¥${subtotal.toFixed(2)}`}
        </button>
      </div>
    );
  }

  // ── Step 2: 收款 ─────────────────────────────────────────
  if (step === "pay") {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <button onClick={() => setStep("order")} className="text-[#6F6678] hover:text-[#1F1B2D] text-sm transition-colors">← 返回</button>
          <h3 className="text-lg font-semibold text-[#1F1B2D]">确认收款</h3>
        </div>

        {/* 金额汇总 */}
        <div className="bg-[#2D1B69] rounded-2xl p-5 text-white flex flex-col gap-3">
          <div className="flex justify-between text-sm text-white/70">
            <span>{customer}</span>
            <span>{cart.length} 个项目</span>
          </div>
          <div className="flex items-end gap-2">
            <span className="text-sm text-white/70">应收</span>
            <span className="text-4xl font-bold tracking-tight">¥{total.toFixed(2)}</span>
          </div>
          {discountAmt > 0 && (
            <div className="text-sm text-white/60">已优惠 ¥{discountAmt.toFixed(2)}</div>
          )}
        </div>

        {/* 优惠金额 */}
        <div className="w-1/2 pr-2.5">
          <SectionTitle>优惠金额（选填）</SectionTitle>
          <input
            type="number"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            placeholder="输入优惠金额"
            className="w-full px-3 py-2.5 border border-black/15 rounded-lg text-sm text-[#1F1B2D] bg-white outline-none focus:border-[#2D1B69] placeholder:text-[#B0A8BB]"
          />
        </div>

        <PaymentStep
          amount={total}
          methods={PAY_METHODS}
          confirmLabel={`确认收款 ¥${total.toFixed(2)}`}
          onConfirm={(key, label) => { setPayMethod(key); setPayMethodLabel(label); setStep("done"); }}
          onCancel={() => setStep("order")}
        />
      </div>
    );
  }

  // ── Step 3: 完成 ─────────────────────────────────────────
  return (
    <>
      {showReceipt && (
        <ReceiptOverlay
          customer={customer}
          cart={cart}
          total={total}
          subtotal={subtotal}
          discountAmt={discountAmt}
          payMethod={payMethod}
          receiptNo={receiptNo}
          paidAt={paidAt}
          onClose={() => setShowReceipt(false)}
        />
      )}

      <div className="flex items-center gap-4 py-1">
        <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
          <Check className="w-5 h-5 text-green-600" />
        </div>
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <p className="text-base font-semibold text-[#1F1B2D]">收款成功</p>
          <p className="text-sm text-[#6F6678]">
            {customer} · {payMethodLabel} · 实收
            <span className="text-[#2D1B69] font-medium"> ¥{total.toFixed(2)}</span>
            {discountAmt > 0 && (
              <span className="text-[#C9956C]"> · 优惠 ¥{discountAmt.toFixed(2)}</span>
            )}
          </p>
        </div>
        <button
          onClick={() => setShowReceipt(true)}
          className="flex items-center gap-1.5 px-4 py-2 border border-black/15 text-[#1F1B2D] rounded-lg text-sm font-medium hover:bg-black/5 transition-colors active:scale-95 shrink-0"
        >
          <Printer className="w-3.5 h-3.5" />
          打印小票
        </button>
      </div>
    </>
  );
}
