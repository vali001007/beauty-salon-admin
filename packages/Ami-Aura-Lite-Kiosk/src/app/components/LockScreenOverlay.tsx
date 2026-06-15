import React, { useState } from "react";
import { Fingerprint, Lock } from "lucide-react";

export function LockScreenOverlay({
  storeName,
  onUnlock,
  onSwitchAccount,
}: {
  storeName: string;
  onUnlock: () => void;
  onSwitchAccount?: () => void;
}) {
  const [pin, setPin] = useState("");

  const handleDigit = (digit: string) => {
    if (pin.length >= 4) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === 4) {
      setTimeout(() => {
        onUnlock();
        setPin("");
      }, 250);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#F7F5F2]/95 p-6 backdrop-blur-md">
      <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-full border border-black/5 bg-white shadow-xl">
        <Lock className="h-8 w-8 text-[#2D1B69]" />
      </div>
      <h1 className="mb-2 text-3xl font-bold text-[#1F1B2D]">{storeName}</h1>
      <p className="mb-10 text-lg text-[#6F6678]">工作台已锁定</p>

      <div className="mb-12 flex items-center gap-4">
        {[1, 2, 3, 4].map((index) => (
          <div
            key={index}
            className={`h-4 w-4 rounded-full border-2 transition-all ${index <= pin.length ? "border-[#C9956C] bg-[#C9956C]" : "border-[#6F6678]/30"}`}
          />
        ))}
      </div>

      <div className="mb-10 grid max-w-xs grid-cols-3 gap-5">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, "clear", 0, "fingerprint"].map((key) => (
          <button
            key={String(key)}
            type="button"
            onClick={() => {
              if (key === "clear") {
                setPin("");
                return;
              }
              if (key === "fingerprint") {
                onUnlock();
                return;
              }
              handleDigit(String(key));
            }}
            className={`flex h-20 items-center justify-center rounded-full text-2xl font-semibold transition-all active:scale-95 ${
              typeof key === "number"
                ? "bg-white text-[#1F1B2D] shadow-sm hover:bg-black/[0.03]"
                : key === "clear"
                  ? "text-[#6F6678] text-sm hover:bg-black/[0.03]"
                  : "text-[#C9956C] hover:bg-black/[0.03]"
            }`}
          >
            {key === "clear" ? "清除" : key === "fingerprint" ? <Fingerprint className="h-8 w-8" /> : key}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onSwitchAccount}
        className="mt-auto pb-8 text-sm text-[#6F6678] transition-colors hover:text-[#1F1B2D]"
      >
        切换账号登录
      </button>
    </div>
  );
}
