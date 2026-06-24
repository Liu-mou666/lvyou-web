"use client";

interface GenerateConfirmDialogProps {
  open: boolean;
  summary: string;
  warnings: string[];
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function GenerateConfirmDialog({
  open,
  summary,
  warnings,
  loading,
  onConfirm,
  onCancel,
}: GenerateConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <h3 className="text-base font-semibold text-warm-text">确认生成行程？</h3>
        <p className="mt-2 text-sm text-warm-muted">{summary}</p>
        {warnings.length > 0 && (
          <ul className="mt-3 space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {warnings.map((w) => (
              <li key={w}>• {w}</li>
            ))}
          </ul>
        )}
        <div className="mt-5 flex gap-3">
          <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-warm-200 py-3 text-sm font-medium text-warm-text">
            再改改
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className="btn-primary flex-1 !py-3"
          >
            {loading ? "生成中…" : "开始生成"}
          </button>
        </div>
      </div>
    </div>
  );
}
