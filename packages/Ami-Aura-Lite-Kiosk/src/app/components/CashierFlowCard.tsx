import React, { useEffect, useMemo, useState } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import type { CashierConfirmInput, CashierCustomer, CashierFlowData, CashierOrderItemInput } from "../types";
import type { TerminalCashierShift } from "@/types/terminal";
import { cn } from "./ui/utils";
import { CustomerSelectList } from "./CustomerSelectList";

type CatalogItem = CashierFlowData["catalog"][number];
type CartItem = {
  rowId: string;
  catalogId: string;
  itemType?: CashierOrderItemInput["itemType"];
  itemId?: number;
  name: string;
  category: string;
  quantity: number;
  unitPrice: number;
};

type CompletedCartItem = CartItem & CashierOrderItemInput;

function safeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function createCartRow(): CartItem {
  return {
    rowId: `cashier-row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    catalogId: "",
    name: "",
    category: "",
    quantity: 1,
    unitPrice: 0,
  };
}

function isCompleteCartItem(item: CartItem): item is CompletedCartItem {
  return Boolean(item.catalogId && item.itemType && typeof item.itemId === "number" && item.name);
}

const MEMBER_CARD_PAYMENT_METHOD = "会员余额";
const ITEM_TYPE_LABEL: Record<CashierOrderItemInput["itemType"], string> = {
  project: "项目",
  product: "商品",
};

const PAYMENT_METHODS: Array<{
  value: CashierConfirmInput["paymentMethod"];
  label: string;
  requiresMemberCard?: boolean;
}> = [
  { value: "微信", label: "微信" },
  { value: "支付宝", label: "支付宝" },
  { value: "银行卡", label: "银行卡" },
  { value: "现金", label: "现金" },
  { value: MEMBER_CARD_PAYMENT_METHOD, label: "会员卡划扣", requiresMemberCard: true },
];

export function CashierFlowCard({
  data,
  onConfirm,
  loadShiftStatus,
}: {
  data: CashierFlowData;
  onConfirm: (input: CashierConfirmInput) => Promise<void>;
  loadShiftStatus?: () => Promise<TerminalCashierShift | null>;
}) {
  const [step, setStep] = useState(1);
  const [selectedCustomer, setSelectedCustomer] = useState<CashierCustomer | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discountAmount, setDiscountAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<CashierConfirmInput["paymentMethod"]>("微信");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shift, setShift] = useState<TerminalCashierShift | null>(null);
  const [shiftLoading, setShiftLoading] = useState(Boolean(loadShiftStatus));
  const customers = safeArray(data.customers);
  const catalog = useMemo(
    () =>
      [...safeArray(data.catalog)].sort((left, right) => {
        if (left.itemType === right.itemType) return left.name.localeCompare(right.name, "zh-CN");
        return left.itemType === "project" ? -1 : 1;
      }),
    [data.catalog],
  );
  const projectCatalog = catalog.filter((item) => item.itemType === "project");
  const productCatalog = catalog.filter((item) => item.itemType === "product");
  const completedCart = cart.filter(isCompleteCartItem);
  const hasIncompleteRows = cart.some((item) => !isCompleteCartItem(item));

  const subtotal = completedCart.reduce((total, item) => total + item.quantity * item.unitPrice, 0);
  const discount = Math.min(subtotal, Math.max(0, Number(discountAmount) || 0));
  const receivable = Math.max(0, subtotal - discount);
  const canUseMemberCardDeduct = Boolean(selectedCustomer?.memberCardDeductEnabled);
  const memberCardDeductLabel = selectedCustomer?.memberCardDeductLabel ?? "该客户暂无可划扣会员卡";
  const requireOpenShift = Boolean(loadShiftStatus);
  const isShiftOpen = !requireOpenShift || shift?.status === "open";
  const shiftHint = shiftLoading ? "正在确认当前收银班次..." : "当前未开班，请先在前台工作台开班后再收银。";
  const canGoPayment = Boolean(selectedCustomer && completedCart.length > 0 && !hasIncompleteRows && isShiftOpen);

  const refreshShift = async () => {
    if (!loadShiftStatus) return;
    setShiftLoading(true);
    try {
      setShift(await loadShiftStatus());
    } catch {
      setShift(null);
    } finally {
      setShiftLoading(false);
    }
  };

  useEffect(() => {
    void refreshShift();
  }, [loadShiftStatus]);

  useEffect(() => {
    if (paymentMethod === MEMBER_CARD_PAYMENT_METHOD && !canUseMemberCardDeduct) {
      setPaymentMethod("微信");
    }
  }, [canUseMemberCardDeduct, paymentMethod]);

  const addItem = () => {
    if (!catalog.length) return;
    setCart((prev) => [...prev, createCartRow()]);
  };

  const selectCatalogItem = (rowId: string, catalogId: string) => {
    const selectedItem = catalog.find((item) => item.id === catalogId);
    setCart((prev) =>
      prev.map((cartItem) => {
        if (cartItem.rowId !== rowId) return cartItem;
        if (!selectedItem) {
          return {
            ...cartItem,
            catalogId: "",
            itemType: undefined,
            itemId: undefined,
            name: "",
            category: "",
            unitPrice: 0,
          };
        }
        return {
          ...cartItem,
          catalogId: selectedItem.id,
          itemType: selectedItem.itemType,
          itemId: selectedItem.itemId,
          name: selectedItem.name,
          category: selectedItem.category,
          unitPrice: selectedItem.price,
        };
      }),
    );
  };

  const changeQuantity = (id: string, delta: number) => {
    setCart((prev) =>
      prev.map((item) => (item.rowId === id ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item)),
    );
  };

  const renderCatalogOptions = (items: CatalogItem[]) =>
    items.map((item) => (
      <option key={item.id} value={item.id}>
        {item.name} · ￥{item.price.toLocaleString()}
      </option>
    ));

  const submit = async () => {
    if (!selectedCustomer || completedCart.length === 0) return;
    if (!isShiftOpen) {
      setError(shiftHint);
      return;
    }
    if (hasIncompleteRows) {
      setError("请先选择所有明细行的项目或商品，或删除空白行");
      return;
    }
    if (paymentMethod === MEMBER_CARD_PAYMENT_METHOD && !canUseMemberCardDeduct) {
      setError("该客户暂无可划扣会员卡，请更换支付方式");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onConfirm({
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        customerPhone: selectedCustomer.phone,
        items: completedCart.map(({ itemType, itemId, name, quantity, unitPrice }) => ({
          itemType,
          itemId,
          name,
          quantity,
          unitPrice,
        })),
        discountAmount: discount,
        paymentMethod,
      });
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "收银提交失败");
    } finally {
      setLoading(false);
    }
  };

  if (step === 3) {
    return null;
  }

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-2xl font-semibold text-[#1F1B2D]">{step === 1 ? data.title : "确认收款"}</div>
          <div className="mt-1 text-sm text-[#6F6678]">{data.subtitle} · {data.source}</div>
          <div className="mt-1 text-xs text-[#9B92A3]">生成时间 {data.generatedAt}</div>
        </div>
        <div className="flex items-center gap-1.5">
          {[1, 2].map((item) => (
            <span
              key={item}
              className={cn(
                "h-2 rounded-full transition-all",
                item === step ? "w-5 bg-[#C9956C]" : item < step ? "w-2 bg-[#C9956C]/50" : "w-2 bg-black/10",
              )}
            />
          ))}
        </div>
      </div>

      {!isShiftOpen ? (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between">
          <span>{shiftHint}</span>
          {loadShiftStatus ? (
            <button type="button" onClick={refreshShift} className="font-medium text-amber-900 underline underline-offset-2">
              重新检测
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div> : null}

      {step === 1 ? (
        <div className="flex flex-col gap-5">
          <div>
            <CustomerSelectList
              customers={customers}
              selectedCustomerId={selectedCustomer?.id}
              onSelect={setSelectedCustomer}
            />
          </div>

          <div>
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-medium text-[#6F6678]">第二步：添加收费明细</div>
                <div className="mt-1 text-xs text-[#9B92A3]">点击添加后在明细表新增一行，先选项目，也可继续选择商品。</div>
              </div>
              <button
                type="button"
                onClick={addItem}
                disabled={!catalog.length}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#2D1B69] px-4 text-sm font-semibold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus className="h-4 w-4" />
                添加
              </button>
            </div>
          </div>

          {cart.length ? (
            <div className="overflow-hidden rounded-2xl border border-black/5 bg-[#F7F5F2]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left">
                  <thead className="bg-white/70 text-xs font-medium text-[#6F6678]">
                    <tr>
                      <th className="px-4 py-3">项目/商品</th>
                      <th className="w-28 px-4 py-3">类型</th>
                      <th className="w-32 px-4 py-3">数量</th>
                      <th className="w-28 px-4 py-3 text-right">单价</th>
                      <th className="w-28 px-4 py-3 text-right">金额</th>
                      <th className="w-16 px-4 py-3 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5 bg-[#F7F5F2]">
                    {cart.map((item) => (
                      <tr key={item.rowId}>
                        <td className="px-4 py-3">
                          <select
                            value={item.catalogId}
                            onChange={(event) => selectCatalogItem(item.rowId, event.target.value)}
                            className="h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm text-[#1F1B2D] outline-none focus:border-[#C9956C] focus:ring-2 focus:ring-[#C9956C]/20"
                          >
                            <option value="">请选择项目或商品</option>
                            {projectCatalog.length ? <optgroup label="项目">{renderCatalogOptions(projectCatalog)}</optgroup> : null}
                            {productCatalog.length ? <optgroup label="商品">{renderCatalogOptions(productCatalog)}</optgroup> : null}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          {item.itemType ? (
                            <div className="flex flex-col gap-1">
                              <span className="w-fit rounded-full bg-white px-2 py-0.5 text-xs font-medium text-[#2D1B69]">
                                {ITEM_TYPE_LABEL[item.itemType]}
                              </span>
                              {item.category ? <span className="truncate text-xs text-[#6F6678]">{item.category}</span> : null}
                            </div>
                          ) : (
                            <span className="text-xs text-[#9B92A3]">待选择</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => changeQuantity(item.rowId, -1)}
                              className="flex h-8 w-8 items-center justify-center rounded-full border border-black/10 bg-white disabled:opacity-40"
                              disabled={item.quantity <= 1}
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
                            <button
                              type="button"
                              onClick={() => changeQuantity(item.rowId, 1)}
                              className="flex h-8 w-8 items-center justify-center rounded-full border border-black/10 bg-white"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-[#1F1B2D]">￥{item.unitPrice.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-[#1F1B2D]">
                          ￥{(item.quantity * item.unitPrice).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setCart((prev) => prev.filter((cartItem) => cartItem.rowId !== item.rowId))}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-rose-500 transition hover:bg-rose-50"
                            title="删除明细"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {hasIncompleteRows ? (
                <div className="border-t border-black/5 px-4 py-2 text-xs text-amber-700">
                  存在未选择项目/商品的明细行，请补充或删除后再收款。
                </div>
              ) : null}
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-[#6F6678]">小计</span>
                <span className="text-lg font-semibold text-[#1F1B2D]">￥{subtotal.toLocaleString()}</span>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-black/10 bg-[#F7F5F2] px-4 py-8 text-center text-sm text-[#6F6678]">
              暂无收费明细，点击“添加”新增一行。
            </div>
          )}

          <button
            type="button"
            onClick={() => setStep(2)}
            disabled={!canGoPayment}
            className="h-13 rounded-2xl bg-[#C9956C] text-base font-semibold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            去收款 {subtotal > 0 ? `￥${subtotal.toLocaleString()}` : ""}
          </button>
        </div>
      ) : null}

      {step === 2 && selectedCustomer ? (
        <div className="flex flex-col gap-5">
          <div className="rounded-2xl bg-[#2D1B69] p-5 text-white">
            <div className="flex items-center justify-between text-sm text-white/70">
              <span>{selectedCustomer.name} · {selectedCustomer.phone}</span>
              <span>{completedCart.length} 个项目/商品</span>
            </div>
            <div className="mt-5 flex items-end gap-2">
              <span className="pb-2 text-sm text-white/70">应收</span>
              <span className="text-4xl font-bold">￥{receivable.toLocaleString()}</span>
            </div>
            {discount > 0 ? <div className="mt-2 text-sm text-white/60">已优惠 ￥{discount.toLocaleString()}</div> : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-[#6F6678]">优惠金额（选填）</span>
              <input
                type="number"
                min={0}
                value={discountAmount}
                onChange={(event) => setDiscountAmount(event.target.value)}
                placeholder="输入优惠金额"
                className="h-12 rounded-xl border border-black/10 bg-white px-4 text-sm text-[#1F1B2D] outline-none focus:border-[#C9956C] focus:ring-2 focus:ring-[#C9956C]/20"
              />
            </label>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-[#6F6678]">支付方式</span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {PAYMENT_METHODS.map((method) => {
                  const disabled = method.requiresMemberCard && !canUseMemberCardDeduct;
                  return (
                    <button
                      key={method.value}
                      type="button"
                      onClick={() => {
                        if (!disabled) setPaymentMethod(method.value);
                      }}
                      disabled={disabled}
                      title={method.requiresMemberCard ? memberCardDeductLabel : method.label}
                      className={cn(
                        "min-h-12 rounded-xl border px-2 py-2 text-sm font-medium leading-tight transition",
                        paymentMethod === method.value ? "border-[#2D1B69] bg-[#2D1B69] text-white" : "border-black/10 bg-white text-[#1F1B2D]",
                        disabled && "cursor-not-allowed border-black/5 bg-black/[0.03] text-[#9B92A3]",
                      )}
                    >
                      <span>{method.label}</span>
                      {method.requiresMemberCard ? (
                        <span className="mt-0.5 block text-[10px] font-normal opacity-70">{canUseMemberCardDeduct ? memberCardDeductLabel : "无卡置灰"}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => setStep(1)} className="h-12 rounded-xl border border-black/10 bg-white text-sm font-medium text-[#1F1B2D]">
              返回开单
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={loading || !isShiftOpen}
              className="h-12 rounded-xl bg-[#1F1B2D] text-sm font-semibold text-white transition active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
            >
              {loading ? "正在收款..." : `确认收款 ￥${receivable.toLocaleString()}`}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
