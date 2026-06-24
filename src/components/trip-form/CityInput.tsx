"use client";

import { useCitySuggest } from "@/hooks/useCitySuggest";
import { useEffect, useRef, useState } from "react";

interface CityInputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  inputClassName: string;
}

export default function CityInput({
  label,
  value,
  onChange,
  placeholder,
  error,
  inputClassName,
}: CityInputProps) {
  const { tips, loading } = useCitySuggest(value);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div className="relative min-w-0" ref={wrapRef}>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-warm-muted">{label}</span>
        <input
          required
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          className={inputClassName}
          placeholder={placeholder}
          autoComplete="off"
        />
      </label>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {open && tips.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full rounded-xl border border-warm-200 bg-white py-1 shadow-lg">
          {tips.map((t) => (
            <li key={`${t.name}-${t.district}`}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-warm-100"
                onClick={() => {
                  onChange(t.name);
                  setOpen(false);
                }}
              >
                <span className="font-medium text-warm-text">{t.name}</span>
                {t.district && <span className="ml-2 text-xs text-warm-muted">{t.district}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {loading && open && value.trim().length >= 2 && tips.length === 0 && (
        <p className="mt-1 text-xs text-warm-muted">联想中…</p>
      )}
    </div>
  );
}
