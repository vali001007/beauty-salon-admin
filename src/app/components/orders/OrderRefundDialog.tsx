import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { getProductOrderRefundPreview, refundProductOrder } from '@/api/order';
import type { OrderRefundMode, OrderRefundPreview } from '@/types/order';
import { Button } from '../UI';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';

type Props = {
  orderId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void | Promise<void>;
};

function money(value: number) {
  return `¥${Number(value || 0).toFixed(2)}`;
}

function requestId() {
  return globalThis.crypto?.randomUUID?.() ?? `refund-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function OrderRefundDialog({ orderId, open, onOpenChange, onSuccess }: Props) {
  const [preview, setPreview] = useState<OrderRefundPreview | null>(null);
  const [mode, setMode] = useState<OrderRefundMode>('refund_only');
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [reason, setReason] = useState('客户申请退款');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !orderId) return;
    setPreview(null);
    setSelected({});
    setQuantities({});
    setMode('refund_only');
    getProductOrderRefundPreview(orderId)
      .then(setPreview)
      .catch((error) => toast.error(error instanceof Error ? error.message : '退款预览加载失败'));
  }, [open, orderId]);

  const refundItems = useMemo(() => {
    if (!preview) return [];
    return preview.items
      .filter((item) => selected[item.orderItemId])
      .map((item) => {
        const quantity = Number(quantities[item.orderItemId] ?? item.remainingRefundableQuantity);
        const unitNet = item.soldQuantity > 0 ? item.netAmount / item.soldQuantity : 0;
        return { orderItemId: item.orderItemId, quantity, refundAmount: Math.round(unitNet * quantity * 100) / 100 };
      });
  }, [preview, quantities, selected]);
  const amount = refundItems.reduce((sum, item) => sum + item.refundAmount, 0);

  const submit = async () => {
    if (!orderId || !preview || !refundItems.length) return toast.error('请选择退款明细');
    if (mode === 'return_and_refund' && !preview.allowedModes.includes('return_and_refund')) {
      return toast.error('该订单缺少完整库存追溯，只能选择仅退款不退货');
    }
    setLoading(true);
    try {
      await refundProductOrder(orderId, { requestId: requestId(), refundMode: mode, reason: reason.trim() || '客户申请退款', items: refundItems });
      toast.success(amount < preview.remainingRefundableAmount ? '部分退款成功' : '退款成功');
      await onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '退款失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" aria-describedby="order-refund-description">
        <DialogHeader>
          <DialogTitle>订单退款</DialogTitle>
          <DialogDescription id="order-refund-description">
            按订单明细选择退款数量；退款退货会恢复商品库存或冲销项目原耗材。
          </DialogDescription>
        </DialogHeader>
        {!preview ? <div className="py-8 text-center text-sm text-muted-foreground">正在加载退款预览...</div> : (
          <div className="space-y-5">
            <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-3">
              <div><div className="text-xs text-muted-foreground">订单实收</div><div className="font-semibold">{money(preview.netAmount)}</div></div>
              <div><div className="text-xs text-muted-foreground">已退款</div><div className="font-semibold">{money(preview.refundedAmount)}</div></div>
              <div><div className="text-xs text-muted-foreground">剩余可退</div><div className="font-semibold text-red-600">{money(preview.remainingRefundableAmount)}</div></div>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">退款方式</legend>
              <label className="flex gap-2 rounded-lg border p-3">
                <input aria-label="仅退款不退货" type="radio" checked={mode === 'refund_only'} onChange={() => setMode('refund_only')} />
                <span><span className="block font-medium">仅退款不退货</span><span className="text-xs text-muted-foreground">只退资金，不恢复库存或耗材。</span></span>
              </label>
              <label className="flex gap-2 rounded-lg border p-3">
                <input aria-label="退款退货" type="radio" checked={mode === 'return_and_refund'} disabled={!preview.allowedModes.includes('return_and_refund')} onChange={() => setMode('return_and_refund')} />
                <span><span className="block font-medium">退款退货</span><span className="text-xs text-muted-foreground">商品恢复原库存；项目冲销退款数量对应的原耗材。</span></span>
              </label>
            </fieldset>

            <div className="space-y-3">
              <div className="text-sm font-medium">退款明细</div>
              {preview.items.map((item) => (
                <div key={item.orderItemId} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_140px]">
                  <label className="flex items-start gap-2">
                    <input aria-label={`选择${item.name}`} type="checkbox" checked={Boolean(selected[item.orderItemId])} onChange={(event) => setSelected((state) => ({ ...state, [item.orderItemId]: event.target.checked }))} />
                    <span><span className="block font-medium">{item.name}</span><span className="text-xs text-muted-foreground">可退 {item.remainingRefundableQuantity}，可退金额 {money(item.remainingRefundableAmount)}</span></span>
                  </label>
                  <label className="text-xs text-muted-foreground">退款数量
                    <input aria-label={`${item.name}退款数量`} className="mt-1 h-9 w-full rounded border px-2 text-foreground" type="number" min={0.01} max={item.remainingRefundableQuantity} step={0.01} value={quantities[item.orderItemId] ?? item.remainingRefundableQuantity} onChange={(event) => setQuantities((state) => ({ ...state, [item.orderItemId]: Number(event.target.value) }))} />
                  </label>
                </div>
              ))}
            </div>

            <label className="block text-sm font-medium">退款原因
              <textarea className="mt-1 min-h-20 w-full rounded-md border bg-background p-2 font-normal" value={reason} onChange={(event) => setReason(event.target.value)} />
            </label>
            <div className="rounded-lg bg-muted/40 p-3 text-sm">本次退款：<strong>{money(amount)}</strong></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
              <Button onClick={submit} disabled={loading || !refundItems.length}>{loading ? '退款处理中' : '确认退款'}</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
