"use client";

import { useState, type ReactNode } from "react";

interface FormSectionProps {
  id: string;
  title: string;
  subtitle?: string;
  icon?: string;
  defaultOpen?: boolean;
  collapsible?: boolean;
  children: ReactNode;
}

export default function FormSection({
  id,
  title,
  subtitle,
  icon,
  defaultOpen = true,
  collapsible = false,
  children,
}: FormSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (!collapsible) {
    return (
      <section id={id} className="form-section">
        <header className="form-section-head">
          {icon && <span className="form-section-icon">{icon}</span>}
          <div>
            <h3 className="form-section-title">{title}</h3>
            {subtitle && <p className="form-section-sub">{subtitle}</p>}
          </div>
        </header>
        <div className="form-section-body">{children}</div>
      </section>
    );
  }

  return (
    <section id={id} className="form-section form-section-collapsible">
      <button
        type="button"
        className="form-section-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="form-section-icon">{icon ?? "▸"}</span>
        <span className="min-w-0 flex-1 text-left">
          <span className="form-section-title">{title}</span>
          {subtitle && <span className="form-section-sub block">{subtitle}</span>}
        </span>
        <span className="text-warm-muted text-sm">{open ? "收起" : "展开"}</span>
      </button>
      {open && <div className="form-section-body">{children}</div>}
    </section>
  );
}
