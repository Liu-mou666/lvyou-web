"use client";

function OptionGrid<T extends string>({
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
  columns?: 2 | 3 | 4;
  disabled?: boolean;
}) {
  const colCls =
    columns === 2
      ? "grid-cols-2"
      : columns === 4
        ? "grid-cols-2 sm:grid-cols-4"
        : "grid-cols-2 sm:grid-cols-3";

  return (
    <div className={`grid gap-2 ${colCls}`}>
      {options.map((opt) => (
        <label
          key={opt.value}
          title={opt.hint}
          className={`pref-option ${disabled ? "opacity-50 pointer-events-none" : ""} ${
            value === opt.value ? "pref-option-active" : ""
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
          <span className="pref-option-label">{opt.label}</span>
          {opt.desc && <span className="pref-option-desc">{opt.desc}</span>}
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
  columns?: 2 | 3 | 4;
  disabled?: boolean;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-sm font-medium text-warm-text">
        {label}
        {hint && <span className="ml-1 text-xs font-normal text-warm-muted">· {hint}</span>}
      </legend>
      <OptionGrid
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
