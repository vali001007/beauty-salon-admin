import React, { useState, useRef, useEffect } from "react";
import { Search, ChevronDown } from "lucide-react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
}

export function SearchableSelect({ value, onChange, options, placeholder = "请选择", className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = options.filter((o) => o.includes(search));

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleOpen = () => {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleSelect = (option: string) => {
    onChange(option);
    setOpen(false);
    setSearch("");
  };

  return (
    <div ref={containerRef} className={`relative flex-1 ${className}`}>
      <button
        type="button"
        onClick={handleOpen}
        className={`w-full px-3 py-2.5 border border-black/15 rounded-lg text-sm bg-white outline-none focus:border-[#2D1B69] flex items-center justify-between gap-2 hover:border-[#2D1B69]/40 transition-colors ${value ? "text-[#1F1B2D]" : "text-[#B0A8BB]"}`}
      >
        <span className="truncate">{value || placeholder}</span>
        <ChevronDown className={`w-4 h-4 text-[#6F6678] shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-black/15 rounded-lg shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-black/10">
            <Search className="w-3.5 h-3.5 text-[#6F6678] shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索姓名"
              className="flex-1 text-sm text-[#1F1B2D] outline-none placeholder:text-[#B0A8BB] bg-transparent"
            />
          </div>
          <ul className="max-h-44 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-3 py-2.5 text-sm text-[#B0A8BB] text-center">无匹配结果</li>
            ) : (
              filtered.map((o) => (
                <li
                  key={o}
                  onClick={() => handleSelect(o)}
                  className={`px-3 py-2.5 text-sm cursor-pointer transition-colors flex items-center justify-between ${
                    o === value
                      ? "bg-[#2D1B69]/8 text-[#2D1B69] font-medium"
                      : "text-[#1F1B2D] hover:bg-black/5"
                  }`}
                >
                  <span>{o}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
