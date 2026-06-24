"use client";

function ChipGroup<T extends string>({
  name,
  options,
  value,
  onChange,
  disabled = false,
}: {
  name: string;
  options: { value: T; label: string; desc?: string; hint?: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="chip-group sm:hidden">
      {options.map((opt) => (
        <label
          key={opt.value}
          className={`chip-option cursor-pointer rounded-xl border px-3 py-3 text-center transition active:scale-[0.97] ${
            disabled ? "opacity-50 pointer-events-none" : ""
          } ${
            value === opt.value
              ? "border-warm-500 bg-warm-glow font-semibold text-warm-700 ring-1 ring-warm-400/40"
              : "border-warm-200 bg-white text-warm-text"
          }`}
        >
          <input
            type="radio"
            name={name}
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="sr-only"
            disabled={disabled}
          />
          <span className="block text-sm">{opt.label}</span>
          {opt.desc && <span className="mt-0.5 block text-[10px] text-warm-muted">{opt.desc}</span>}
        </label>
      ))}
    </div>
  );
}

function DesktopRadioGroup<T extends string>({
  name,
  options,
  value,
  onChange,
  columns = 3,
  disabled = false,
}: {
  name: string;
  options: { value: T; label: string; desc?: string; hint?: string }[];
  value: T;
  onChange: (v: T) => void;
  columns?: number;
  disabled?: boolean;
}) {
  const gridCls =
    columns === 2 ? "sm:grid-cols-2" : columns === 4 ? "sm:grid-cols-4" : "sm:grid-cols-3";

  return (
    <div className={`hidden sm:grid sm:gap-2 ${gridCls}`}>
      {options.map((opt) => (
        <label
          key={opt.value}
          title={opt.hint}
          className={`cursor-pointer rounded-xl border p-3 transition ${
            disabled ? "opacity-50 pointer-events-none" : ""
          } ${
            value === opt.value ? "border-warm-500 bg-warm-glow ring-1 ring-warm-400/30" : "border-warm-200 bg-white"
          }`}
        >
          <input
            type="radio"
            name={name}
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="sr-only"
            disabled={disabled}
          />
          <span className="block text-sm font-medium text-warm-text">{opt.label}</span>
          {opt.desc && <span className="mt-0.5 block text-xs text-warm-muted">{opt.desc}</span>}
        </label>
      ))}
    </div>
  );
}

export default function PreferenceField<T extends string>({
  label,
  hint,
  name,
  options,
  value,
  onChange,
  columns = 3,
  disabled = false,
}: {
  label: string;
  hint?: string;
  name: string;
  options: { value: T; label: string; desc?: string; hint?: string }[];
  value: T;
  onChange: (v: T) => void;
  columns?: number;
  disabled?: boolean;
}) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium text-warm-muted">
        {label}
        {hint && <span className="ml-1 text-xs font-normal text-warm-muted/80">· {hint}</span>}
      </legend>
      <ChipGroup name={`${name}-m`} options={options} value={value} onChange={onChange} disabled={disabled} />
      <DesktopRadioGroup
        name={name}
        options={options}
        value={value}
        onChange={onChange}
        columns={columns}
        disabled={disabled}
      />
    </fieldset>
  );
}
