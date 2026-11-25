"use client";

import { Check, ChevronDown } from "lucide-react";

type Option<T extends string> = { value: T; label: string };

export default function MultiStatusSelect<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T[];
  options: Option<T>[];
  onChange: (value: T[]) => void;
  ariaLabel: string;
}) {
  const label = value.length === 0 ? "Tất cả trạng thái" : `${value.length} trạng thái đã chọn`;

  function toggle(item: T) {
    onChange(value.includes(item) ? value.filter((current) => current !== item) : [...value, item]);
  }

  return (
    <details className="group relative min-w-0">
      <summary aria-label={ariaLabel} className="flex h-11 w-full cursor-pointer list-none items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition-colors hover:bg-slate-50 focus-visible:border-[#FF5E14] focus-visible:ring-2 focus-visible:ring-[#FF5E14]/20 [&::-webkit-details-marker]:hidden">
        <span className="truncate">{label}</span>
        <ChevronDown size={16} className="ml-2 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
        <div className="flex items-center justify-between px-2 py-1.5"><p className="text-xs font-medium text-slate-500">Chọn trạng thái</p>{value.length > 0 && <button type="button" className="text-xs font-medium text-[#FF5E14] hover:text-[#E65310]" onClick={() => onChange([])}>Bỏ chọn</button>}</div>
        <div className="max-h-64 overflow-y-auto py-1">{options.map((option) => <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-700 hover:bg-slate-50"><span className={`flex size-4 shrink-0 items-center justify-center rounded border ${value.includes(option.value) ? "border-[#FF5E14] bg-[#FF5E14] text-white" : "border-slate-300 bg-white"}`}>{value.includes(option.value) && <Check size={12} strokeWidth={3} />}</span><input type="checkbox" className="sr-only" checked={value.includes(option.value)} onChange={() => toggle(option.value)} />{option.label}</label>)}</div>
      </div>
    </details>
  );
}
