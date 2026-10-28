// Shared UI primitives implementing the light-green design system.
import React, { createContext, useCallback, useContext, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2, X } from 'lucide-react';
import { formatDate } from '../../main/utils/time';
import type { DateRange } from '../../shared/types';

export function Button(props: {
  children: React.ReactNode;
  onClick?: () => void | Promise<void>;
  variant?: 'primary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
}) {
  const { variant = 'outline', size = 'md', className = '' } = props;
  const base = 'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const sizes = size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm';
  const variants: Record<string, string> = {
    primary: 'bg-deep text-white hover:bg-primary',
    outline: 'bg-white border border-border text-ink hover:border-primary',
    ghost: 'text-muted hover:text-ink hover:bg-pale',
    danger: 'bg-danger text-white hover:opacity-90',
  };
  return (
    <button
      type={props.type ?? 'button'}
      disabled={props.disabled}
      onClick={() => void props.onClick?.()}
      className={`${base} ${sizes} ${variants[variant]} ${className}`}
    >
      {props.children}
    </button>
  );
}

export function Card(props: {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`bg-white border border-border rounded-xl shadow-sm ${props.className ?? ''}`}>
      {(props.title || props.actions) && (
        <header className="flex items-start justify-between gap-3 px-4 pt-4 pb-2">
          <div>
            {props.title && <h2 className="text-[15px] font-semibold text-ink">{props.title}</h2>}
            {props.subtitle && <p className="text-xs text-muted mt-0.5">{props.subtitle}</p>}
          </div>
          {props.actions && <div className="flex items-center gap-2 shrink-0">{props.actions}</div>}
        </header>
      )}
      <div className="px-4 pb-4 pt-1">{props.children}</div>
    </section>
  );
}

export function StatCard(props: { label: string; value: string; sub?: string; icon?: React.ReactNode }) {
  return (
    <div className="bg-white border border-border rounded-xl shadow-sm px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted font-medium uppercase tracking-wide">{props.label}</span>
        {props.icon && <span className="text-primary">{props.icon}</span>}
      </div>
      <div className="text-xl font-semibold text-ink mt-1">{props.value}</div>
      {props.sub && <div className="text-xs text-muted mt-0.5">{props.sub}</div>}
    </div>
  );
}

export function Field(props: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-muted mb-1">{props.label}</span>
      {props.children}
      {props.hint && <span className="block text-xs text-muted mt-1">{props.hint}</span>}
    </label>
  );
}

export function EmptyState(props: { title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="text-center py-10 px-4">
      <div className="mx-auto w-10 h-10 rounded-full bg-pale flex items-center justify-center text-primary mb-3">
        <Info size={20} />
      </div>
      <h3 className="font-semibold text-ink">{props.title}</h3>
      <p className="text-sm text-muted mt-1 max-w-md mx-auto">{props.text}</p>
      {props.action && <div className="mt-4">{props.action}</div>}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-10 text-muted">
      <Loader2 className="animate-spin mr-2" size={20} /> Loading…
    </div>
  );
}

export function ErrorBox(props: { message: string }) {
  return (
    <div className="flex items-start gap-2 bg-white border border-danger/40 text-danger rounded-xl px-4 py-3 text-sm">
      <AlertTriangle size={18} className="shrink-0 mt-0.5" />
      <span>{props.message}</span>
    </div>
  );
}

export function Badge(props: { children: React.ReactNode; tone?: 'green' | 'amber' | 'red' | 'gray' }) {
  const tones: Record<string, string> = {
    green: 'bg-light text-deep',
    amber: 'bg-[#FBF3E2] text-warning',
    red: 'bg-[#FBEAEA] text-danger',
    gray: 'bg-pale text-muted',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${tones[props.tone ?? 'gray']}`}>
      {props.children}
    </span>
  );
}

export function ProgressBar(props: { pct: number; color?: string }) {
  const pct = Math.max(0, Math.min(100, props.pct));
  return (
    <div className="h-2 rounded-full bg-pale overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: props.color ?? '#286844' }} />
    </div>
  );
}

export function Dialog(props: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  if (!props.open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={props.onClose} />
      <div className={`relative bg-white rounded-2xl shadow-xl border border-border w-full ${props.wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[85vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="text-base font-semibold">{props.title}</h2>
          <button onClick={props.onClose} className="text-muted hover:text-ink" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 pb-5">{props.children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog(props: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  text: string;
  confirmLabel?: string;
  danger?: boolean;
}) {
  return (
    <Dialog open={props.open} onClose={props.onClose} title={props.title}>
      <p className="text-sm text-muted">{props.text}</p>
      <div className="flex justify-end gap-2 mt-5">
        <Button onClick={props.onClose}>Cancel</Button>
        <Button
          variant={props.danger ? 'danger' : 'primary'}
          onClick={async () => {
            await props.onConfirm();
            props.onClose();
          }}
        >
          {props.confirmLabel ?? 'Confirm'}
        </Button>
      </div>
    </Dialog>
  );
}

// ---- Toasts ---------------------------------------------------------------
interface Toast {
  id: number;
  kind: 'success' | 'error';
  message: string;
}
const ToastCtx = createContext<(kind: 'success' | 'error', message: string) => void>(() => undefined);

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider(props: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: 'success' | 'error', message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {props.children}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className="flex items-center gap-2 bg-white border border-border shadow-lg rounded-xl px-4 py-2.5 text-sm">
            {t.kind === 'success' ? <CheckCircle2 size={18} className="text-success" /> : <AlertTriangle size={18} className="text-danger" />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---- Date range picker ------------------------------------------------------
export function RangePicker(props: {
  range: DateRange;
  preset: string;
  onPreset: (preset: 'today' | 'week' | 'month' | '30d') => void;
  onCustom: (range: DateRange) => void;
}) {
  const [showCustom, setShowCustom] = useState(false);
  const presets: { key: 'today' | 'week' | 'month' | '30d'; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'This week' },
    { key: 'month', label: 'This month' },
    { key: '30d', label: 'Last 30 days' },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.map((p) => (
        <Button
          key={p.key}
          size="sm"
          variant={props.preset === p.key ? 'primary' : 'outline'}
          onClick={() => {
            setShowCustom(false);
            props.onPreset(p.key);
          }}
        >
          {p.label}
        </Button>
      ))}
      <Button size="sm" variant={showCustom ? 'primary' : 'outline'} onClick={() => setShowCustom((v) => !v)}>
        Custom
      </Button>
      <span className="text-xs text-muted">
        {formatDate(props.range.startMs)} – {formatDate(props.range.endMs - 1)}
      </span>
      {showCustom && (
        <span className="flex items-center gap-2 text-xs">
          <input
            type="date"
            className="!w-auto"
            onChange={(e) => {
              if (!e.target.value) return;
              const start = new Date(`${e.target.value}T00:00:00`);
              props.onCustom({ startMs: start.getTime(), endMs: props.range.endMs });
            }}
          />
          <span>to</span>
          <input
            type="date"
            className="!w-auto"
            onChange={(e) => {
              if (!e.target.value) return;
              const end = new Date(`${e.target.value}T00:00:00`);
              props.onCustom({ startMs: props.range.startMs, endMs: end.getTime() + 24 * 60 * 60 * 1000 });
            }}
          />
        </span>
      )}
    </div>
  );
}

export function PageHeader(props: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
      <div>
        <h1 className="text-xl font-semibold text-ink">{props.title}</h1>
        {props.subtitle && <p className="text-sm text-muted mt-0.5">{props.subtitle}</p>}
      </div>
      {props.actions && <div className="flex items-center gap-2 flex-wrap">{props.actions}</div>}
    </div>
  );
}
