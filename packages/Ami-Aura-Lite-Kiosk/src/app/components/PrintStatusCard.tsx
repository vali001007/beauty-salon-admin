import React, { useState } from "react";
import { AlertCircle, CheckCircle, Loader, Printer, RefreshCw, X } from "lucide-react";
import { formatBusinessDate, formatBusinessDateTime } from "../utils/businessTime";

export interface PrintReceiptItem {
  name: string;
  qty: number;
  price: number;
}

export interface PrintReceipt {
  id: string;
  receiptNo: string;
  customer: string;
  items: PrintReceiptItem[];
  amount: number;
  time: string;
  payMethod: string;
  storeName?: string;
  cashierName?: string;
}

type PrintStatus = "preview" | "printing" | "success" | "error";

function ReceiptPreviewOverlay({
  receipt,
  onRetry,
  onClose,
}: {
  receipt: PrintReceipt;
  onRetry?: (id: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const [printStatus, setPrintStatus] = useState<PrintStatus>("preview");
  const [error, setError] = useState<string | null>(null);

  const handlePrint = async () => {
    if (!onRetry) return;
    setPrintStatus("printing");
    setError(null);
    try {
      await onRetry(receipt.id);
      setPrintStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "打印任务重试失败");
      setPrintStatus("error");
    }
  };

  const today = new Date();
  const dateStr = formatBusinessDate(today);
  const timeStr = formatBusinessDateTime(today, { seconds: true }).slice(11);

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
          <div className="flex flex-col gap-0.5 rounded-xl border border-black/8 bg-[#FAFAF8] p-5" style={{ fontFamily: "'Courier New', monospace" }}>
            <div className="mb-3 text-center">
              <p className="text-base font-bold text-[#1F1B2D]">{receipt.storeName || "当前门店"}</p>
              <p className="mt-0.5 text-xs text-[#6F6678]">消费小票</p>
            </div>
            <div className="my-2 border-t border-dashed border-black/20" />
            {[
              ["单号", receipt.receiptNo],
              ["日期", dateStr],
              ["时间", timeStr],
              ["客户", receipt.customer],
              ["收银员", receipt.cashierName || "当前操作员"],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between text-xs text-[#6F6678]">
                <span>{label}</span>
                <span>{value}</span>
              </div>
            ))}
            <div className="my-2 border-t border-dashed border-black/20" />
            <div className="mb-1 flex justify-between text-xs text-[#6F6678]">
              <span className="flex-1">项目</span>
              <span className="w-8 text-center">数量</span>
              <span className="w-20 text-right">金额</span>
            </div>
            {receipt.items.map((item, index) => (
              <div key={`${item.name}-${index}`} className="flex justify-between text-xs text-[#1F1B2D]">
                <span className="flex-1 truncate">{item.name}</span>
                <span className="w-8 text-center">x{item.qty}</span>
                <span className="w-20 text-right">¥{(item.price * item.qty).toFixed(2)}</span>
              </div>
            ))}
            <div className="my-2 border-t border-dashed border-black/20" />
            <div className="mt-1 flex justify-between text-sm font-bold text-[#1F1B2D]">
              <span>实付</span>
              <span>¥{receipt.amount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs text-[#6F6678]">
              <span>支付方式</span>
              <span>{receipt.payMethod}</span>
            </div>
          </div>
        </div>

        <div className="border-t border-black/8 px-5 pb-5 pt-3">
          {printStatus === "preview" ? (
            <button
              type="button"
              onClick={handlePrint}
              disabled={!onRetry}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2D1B69] py-3 text-sm font-medium text-white transition-colors hover:bg-[#3d2a8a] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Printer className="h-4 w-4" />
              发送打印
            </button>
          ) : null}
          {printStatus === "printing" ? (
            <div className="flex flex-col items-center gap-2 py-1">
              <div className="flex items-center gap-2 text-[#2D1B69]">
                <Loader className="h-4 w-4 animate-spin" />
                <span className="text-sm font-medium">正在提交打印任务</span>
              </div>
            </div>
          ) : null}
          {printStatus === "success" ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-5 w-5" />
                <span className="text-sm font-medium">打印任务已提交</span>
              </div>
              <button type="button" onClick={onClose} className="rounded-lg bg-black/5 px-4 py-2 text-sm text-[#1F1B2D] hover:bg-black/10">
                关闭
              </button>
            </div>
          ) : null}
          {printStatus === "error" ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-red-500">
                <AlertCircle className="h-5 w-5" />
                <span className="text-sm font-medium">{error || "打印失败，请检查打印机连接"}</span>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setPrintStatus("preview")} className="flex-1 rounded-xl border border-black/15 py-2.5 text-sm text-[#1F1B2D] hover:bg-black/5">
                  重试
                </button>
                <button type="button" onClick={onClose} className="flex-1 rounded-xl bg-black/5 py-2.5 text-sm text-[#1F1B2D] hover:bg-black/10">
                  关闭
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ReceiptRow({ receipt, onRetry }: { receipt: PrintReceipt; onRetry?: (id: string) => Promise<void> | void }) {
  const [showPreview, setShowPreview] = useState(false);
  const itemSummary = receipt.items.map((item) => `${item.name} x${item.qty}`).join("、");

  return (
    <>
      {showPreview ? <ReceiptPreviewOverlay receipt={receipt} onRetry={onRetry} onClose={() => setShowPreview(false)} /> : null}
      <div className="flex items-center justify-between border-b border-black/5 px-4 py-3.5 last:border-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[#1F1B2D]">{receipt.customer}</span>
            <span className="rounded bg-black/5 px-1.5 py-0.5 text-xs text-[#6F6678]">{receipt.payMethod}</span>
            <span className="text-xs text-[#B0A8BB]">{receipt.time}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="max-w-[220px] truncate text-xs text-[#6F6678]">{itemSummary || "无明细"}</span>
            <span className="shrink-0 text-xs font-medium text-[#1F1B2D]">¥{receipt.amount.toFixed(2)}</span>
          </div>
          <span className="text-[11px] text-[#B0A8BB]">{receipt.receiptNo}</span>
        </div>
        <button
          type="button"
          onClick={() => setShowPreview(true)}
          className="ml-4 flex shrink-0 items-center gap-1.5 rounded-lg border border-[#C9956C]/40 px-3 py-1.5 text-xs font-medium text-[#C9956C] transition-colors hover:bg-[#C9956C]/5"
        >
          <Printer className="h-3.5 w-3.5" />
          补打
        </button>
      </div>
    </>
  );
}

export function PrintStatusCard({
  receipts = [],
  connected = false,
  onReconnect,
  onTestPrint,
  onRetry,
}: {
  receipts?: PrintReceipt[];
  connected?: boolean;
  onReconnect?: () => void | Promise<void>;
  onTestPrint?: () => void | Promise<void>;
  onRetry?: (id: string) => Promise<void> | void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-[#1F1B2D]">打印机状态</h2>
        <div
          className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium ${
            connected ? "border-green-100 bg-green-50 text-green-600" : "border-amber-100 bg-amber-50 text-amber-600"
          }`}
        >
          <AlertCircle className="h-3 w-3" />
          {connected ? "已连接" : "未连接"}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-black/10 bg-white">
        <div className="flex items-center justify-between border-b border-black/8 bg-[#F7F5F2] px-4 py-3">
          <div className="text-sm">
            <span className="text-[#6F6678]">待补打记录</span>
            <span className="ml-2 font-bold text-[#1F1B2D]">{receipts.length} 笔</span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onReconnect} disabled={!onReconnect} className="flex items-center gap-1.5 rounded-lg bg-[#1F1B2D] px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">
              <RefreshCw className="h-3.5 w-3.5" />
              重新连接
            </button>
            <button type="button" onClick={onTestPrint} disabled={!onTestPrint} className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-[#1F1B2D] disabled:cursor-not-allowed disabled:opacity-50">
              测试打印
            </button>
          </div>
        </div>
        {receipts.length ? (
          receipts.map((receipt) => <ReceiptRow key={receipt.id} receipt={receipt} onRetry={onRetry} />)
        ) : (
          <div className="py-8 text-center text-sm text-[#9B92A3]">暂无真实待补打记录</div>
        )}
      </div>
    </div>
  );
}

export function PlaceholderFlowCard({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-8">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#F7F5F2]">
        <span className="text-2xl">...</span>
      </div>
      <h3 className="text-xl font-semibold text-[#1F1B2D]">{title}</h3>
      <p className="max-w-xs text-center text-sm text-[#6F6678]">
        该入口需要接入真实终端接口后开放。
      </p>
    </div>
  );
}
