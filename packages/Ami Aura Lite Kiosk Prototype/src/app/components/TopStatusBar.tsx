import React from "react";
import { Check, ChevronDown, Fingerprint, Lock, Printer, ScanLine, Wifi } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { AURA_ROLE_LABELS } from "../../../../../src/config/aura";
import type { Store } from "../../../../../src/types";
import type { Role } from "../types";

function DeviceBadge({
  icon: Icon,
  status,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  status: "success" | "warning" | "error";
  label: string;
}) {
  const colors = {
    success: "text-emerald-500",
    warning: "text-amber-500",
    error: "text-rose-500",
  };

  return (
    <div className="flex items-center gap-1.5 text-xs text-[#6F6678]">
      <Icon className={`w-4 h-4 ${colors[status]}`} />
      <span className="hidden sm:inline">{label}</span>
    </div>
  );
}

function StoreSwitcher({
  currentStoreId,
  storeName,
  availableStores,
  disabled,
  onChange,
}: {
  currentStoreId: number | null;
  storeName: string;
  availableStores: Store[];
  disabled?: boolean;
  onChange: (storeId: number) => void;
}) {
  if (availableStores.length <= 1) {
    return <div className="truncate text-base font-semibold text-[#1F1B2D]">{storeName}</div>;
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild disabled={disabled}>
        <button className="inline-flex max-w-[280px] items-center gap-1 rounded-lg px-2 py-1 text-base font-semibold text-[#1F1B2D] transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-60">
          <span className="truncate">{storeName}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-[#6F6678]" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-50 max-h-[320px] min-w-[240px] overflow-y-auto rounded-xl border border-black/5 bg-white p-1 shadow-lg"
          align="start"
        >
          {availableStores.map((store) => (
            <DropdownMenu.Item
              key={store.id}
              onClick={() => onChange(store.id)}
              className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm text-[#1F1B2D] outline-none hover:bg-[#F7F5F2] data-[highlighted]:bg-[#F7F5F2]"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{store.name}</span>
                {store.address ? <span className="block truncate text-xs text-[#6F6678]">{store.address}</span> : null}
              </span>
              {currentStoreId === store.id ? <Check className="h-4 w-4 shrink-0 text-[#C9956C]" /> : null}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function RoleSwitcher({
  currentRole,
  availableRoles,
  onChange,
}: {
  currentRole: Role;
  availableRoles: Role[];
  onChange: (role: Role) => void;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-[#1F1B2D] hover:bg-black/5 transition-colors">
          {AURA_ROLE_LABELS[currentRole]}
          <ChevronDown className="w-4 h-4 text-[#6F6678]" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-50 min-w-[128px] rounded-xl border border-black/5 bg-white p-1 shadow-lg"
          align="start"
        >
          {availableRoles.map((role) => (
            <DropdownMenu.Item
              key={role}
              onClick={() => onChange(role)}
              className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm text-[#1F1B2D] outline-none hover:bg-[#F7F5F2] data-[highlighted]:bg-[#F7F5F2]"
            >
              {AURA_ROLE_LABELS[role]}
              {currentRole === role ? <Check className="w-4 h-4 text-[#C9956C]" /> : null}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function TopStatusBar({
  storeName,
  currentStoreId,
  availableStores,
  employeeName,
  currentRole,
  availableRoles,
  switchingStore,
  onStoreChange,
  onRoleChange,
  onLock,
  onFingerprint,
}: {
  storeName: string;
  currentStoreId: number | null;
  availableStores: Store[];
  employeeName: string;
  currentRole: Role;
  availableRoles: Role[];
  switchingStore?: boolean;
  onStoreChange: (storeId: number) => void;
  onRoleChange: (role: Role) => void;
  onLock: () => void;
  onFingerprint: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-black/5 bg-white px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0">
          <StoreSwitcher
            currentStoreId={currentStoreId}
            storeName={storeName}
            availableStores={availableStores}
            disabled={switchingStore}
            onChange={onStoreChange}
          />
          <div className="truncate text-xs text-[#6F6678]">{employeeName}</div>
        </div>
        <div className="h-4 w-px bg-black/10" />
        <RoleSwitcher currentRole={currentRole} availableRoles={availableRoles} onChange={onRoleChange} />
      </div>

      <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-[#C9956C] to-[#2D1B69] text-white">
          A
        </div>
        <div className="hidden text-lg font-bold tracking-tight text-[#1F1B2D] sm:block">Ami Aura Lite</div>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden items-center gap-3 sm:flex">
          <DeviceBadge icon={Wifi} status="success" label="网络正常" />
          <DeviceBadge icon={Printer} status="warning" label="打印机" />
          <DeviceBadge icon={ScanLine} status="success" label="扫码器" />
        </div>
        <div className="h-4 w-px bg-black/10" />
        <button
          type="button"
          onClick={onFingerprint}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#6F6678] transition-colors hover:bg-black/5"
          title="指纹"
        >
          <Fingerprint className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={onLock}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#6F6678] transition-colors hover:bg-black/5"
          title="锁屏"
        >
          <Lock className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
