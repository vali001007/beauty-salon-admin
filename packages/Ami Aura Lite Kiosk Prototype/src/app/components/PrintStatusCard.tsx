import React, { useState } from "react";
import { Printer, AlertCircle, RefreshCw, CheckCircle, Loader, RotateCcw, X } from "lucide-react";
import { mockData } from "../types";

const PENDING_RECEIPTS = [
  { id: "r1", receiptNo: "RC20240101", customer: "张三", items: [{ name: "面部护理", qty: 1, price: 280 }], amount: 280, time: "10:32", payMethod: "微信" },
  { id: "r2", receiptNo: "RC20240102", customer: "李四", items: [{ name: "全身SPA", qty: 1, price: 480 }, { name: "美甲", qty: 1, price: 120 }], amount: 600, time: "11:05", payMethod: "支付宝" },
  { id: "r3", receiptNo: "RC20240103", customer: "王五", items: [{ name: "头皮护理", qty: 2, price: 180 }], amount: 360, time: "14:18", payMethod: "现金" },
  { id: "r4", receiptNo: "RC20240104", customer: "赵六", items: [{ name: "睫毛嫁接", qty: 1, price: 350 }], amount: 350, time: "15:40", payMethod: "刷卡" },
];

type Receipt = typeof PENDING_RECEIPTS[0];
type PrintStatus = "idle" | "printing" | "success" | "error";

function ReceiptPreviewOverlay({
  receipt,
  onClose,
}: {
  receipt: Receipt;
  onClose: () => void;
}) {
  const [printStatus, setPrintStatus] = useState<"preview" | "printing" | "success" | "error">("preview");

  const handlePrint = () => {
    setPrintStatus("printing");
    setTimeout(() => {
      setPrintStatus(Math.random() > 0.1 ? "success" : "error");
    }, 1800);
  };

  const today = new Date();
  const dateStr = today.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\//g, "/");
  const timeStr = today.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-[400px] max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/8">
          <p className="font-semibold text-[#1F1B2D]">小票预览</p>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-black/5 text-[#6F6678] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="bg-[#FAFAF8] border border-black/8 rounded-xl p-5 flex flex-col gap-0.5" style={{ fontFamily: "'Courier New', monospace" }}>
            <div className="text-center mb-3">
              <p className="font-bold text-base text-[#1F1B2D]">{mockData.storeName}</p>
              <p className="text-xs text-[#6F6678] mt-0.5">消费小票</p>
            </div>

            <div className="border-t border-dashed border-black/20 my-2" />

            {[
              ["单号", receipt.receiptNo],
              ["日期", dateStr],
              ["时间", timeStr],
              ["客户", receipt.customer],
              ["收银员", mockData.employeeName],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between text-xs text-[#6F6678]">
                <span>{label}</span><span>{value}</span>
              </div>
            ))}

            <div className="border-t border-dashed border-black/20 my-2" />

            <div className="flex justify-between text-xs text-[#6F6678] mb-1">
              <span className="flex-1">项目</span>
              <span className="w-8 text-center">数量</span>
              <span className="w-20 text-right">金额</span>
            </div>
            {receipt.items.map((item, i) => (
              <div key={i} className="flex justify-between text-xs text-[#1F1B2D]">
                <span className="flex-1">{item.name}</span>
                <span className="w-8 text-center">x{item.qty}</span>
                <span className="w-20 text-right">¥{(item.price * item.qty).toFixed(2)}</span>
              </div>
            ))}

            <div className="border-t border-dashed border-black/20 my-2" />

            <div className="flex justify-between text-xs text-[#6F6678]">
              <span>小计</span><span>¥{receipt.amount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold text-[#1F1B2D] mt-1">
              <span>实付</span><span>¥{receipt.amount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs text-[#6F6678]">
              <span>支付方式</span><span>{receipt.payMethod}</span>
            </div>

            <div className="border-t border-dashed border-black/20 my-2" />
            <div className="text-center text-xs text-[#B0A8BB] leading-relaxed">
              <p>感谢您的惠顾</p>
              <p>欢迎下次光临</p>
            </div>
          </div>
        </div>

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
                <div className="h-full bg-[#2D1B69] rounded-full" style={{ width: "100%", transition: "width 1.8s ease-in-out" }} />
              </div>
            </div>
          )}
          {printStatus === "success" && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="w-5 h-5" />
                <span className="text-sm font-medium">打印成功</span>
              </div>
              <button onClick={onClose} className="px-4 py-2 bg-black/5 rounded-lg text-sm text-[#1F1B2D] hover:bg-black/10 transition-colors active:scale-95">关闭</button>
            </div>
          )}
          {printStatus === "error" && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-red-500">
                <AlertCircle className="w-5 h-5" />
                <span className="text-sm font-medium">打印失败，请检查打印机连接</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setPrintStatus("preview")} className="flex-1 py-2.5 border border-black/15 rounded-xl text-sm text-[#1F1B2D] hover:bg-black/5 transition-colors active:scale-95">重试</button>
                <button onClick={onClose} className="flex-1 py-2.5 bg-black/5 rounded-xl text-sm text-[#1F1B2D] hover:bg-black/10 transition-colors active:scale-95">跳过</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ReceiptRow({ receipt }: { receipt: Receipt }) {
  const [showPreview, setShowPreview] = useState(false);
  const itemSummary = receipt.items.map((i) => `${i.name} x${i.qty}`).join("、");

  return (
    <>
      {showPreview && <ReceiptPreviewOverlay receipt={receipt} onClose={() => setShowPreview(false)} />}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-black/5 last:border-0">
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[#1F1B2D]">{receipt.customer}</span>
            <span className="text-xs text-[#6F6678] bg-black/5 px-1.5 py-0.5 rounded">{receipt.payMethod}</span>
            <span className="text-xs text-[#B0A8BB]">{receipt.time}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#6F6678] truncate max-w-[220px]">{itemSummary}</span>
            <span className="text-xs font-medium text-[#1F1B2D] shrink-0">¥{receipt.amount.toFixed(2)}</span>
          </div>
          <span className="text-[11px] text-[#B0A8BB]">{receipt.receiptNo}</span>
        </div>

        <div className="ml-4 shrink-0">
          <button
            onClick={() => setShowPreview(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-[#C9956C]/40 text-[#C9956C] rounded-lg text-xs font-medium hover:bg-[#C9956C]/5 transition-colors active:scale-95"
          >
            <Printer className="w-3.5 h-3.5" />
            补打
          </button>
        </div>
      </div>
    </>
  );
}

export function PrintStatusCard() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-semibold text-[#1F1B2D]">打印机状态</h2>
        <div className="px-3 py-1 bg-amber-50 text-amber-600 rounded-full text-xs font-medium border border-amber-100 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          未连接
        </div>
      </div>

      

      <div className="bg-white border border-black/10 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-black/8 bg-[#F7F5F2]">
          <div className="text-sm">
            <span className="text-[#6F6678]">待补打记录</span>
            <span className="font-bold text-[#1F1B2D] ml-2">{PENDING_RECEIPTS.length} 笔</span>
          </div>
          <div className="flex items-center gap-2">
            <button className="py-1.5 px-3 bg-[#1F1B2D] text-white rounded-lg text-xs font-medium flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" />
              重新连接
            </button>
            <button className="py-1.5 px-3 bg-white border border-black/10 text-[#1F1B2D] rounded-lg text-xs font-medium flex items-center gap-1.5">
              测试打印
            </button>
          </div>
        </div>
        {PENDING_RECEIPTS.map((r) => (
          <ReceiptRow key={r.id} receipt={r} />
        ))}
      </div>

    </div>
  );
}

export function PlaceholderFlowCard({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-4">
      <div className="w-16 h-16 rounded-full bg-[#F7F5F2] flex items-center justify-center mb-2">
        <span className="text-2xl">🚀</span>
      </div>
      <h3 className="text-xl font-semibold text-[#1F1B2D]">{title}</h3>
      <p className="text-[#6F6678] text-sm text-center max-w-xs">
        {title}功能正在开发中，即将在此版本开放。我们致力于为您提供更完整的门店运营体验。
      </p>
      <div className="mt-4 px-4 py-2 bg-[#C9956C]/10 text-[#C9956C] rounded-full text-sm font-medium">
        即将开放
      </div>
    </div>
  );
}
