import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  TriangleAlert,
  X,
  XCircle,
} from 'lucide-react';

export function cx(...values) {
  return values.filter(Boolean).join(' ');
}

export function Button({
  children,
  variant = 'secondary',
  size = 'md',
  className = '',
  loading = false,
  disabled = false,
  type = 'button',
  as: Component = 'button',
  ...props
}) {
  const variants = {
    primary: 'btn-primary',
    secondary: '',
    ghost: 'btn-ghost',
    soft: 'btn-soft',
    danger: 'btn-danger',
  };
  const sizes = { sm: 'btn-sm', md: '', lg: 'btn-lg' };
  return (
    <Component
      type={Component === 'button' ? type : undefined}
      className={cx('btn', variants[variant], sizes[size], className)}
      disabled={Component === 'button' ? disabled || loading : undefined}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 size={14} className="spin" aria-hidden="true" /> : null}
      {children}
    </Component>
  );
}

export function IconButton({ label, children, className = '', tone, ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx('icon-btn', tone === 'danger' && 'icon-btn-danger', className)}
      {...props}
    >
      {children}
    </button>
  );
}

export function Panel({ as: Component = 'section', className = '', children, ...props }) {
  return (
    <Component className={cx('panel', className)} {...props}>
      {children}
    </Component>
  );
}

export function PageHeader({ eyebrow, title, description, actions, children }) {
  return (
    <header className="page-header">
      <div className="grow">
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        <h1>{title}</h1>
        {description ? <p className="lede">{description}</p> : null}
        {children}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function SectionHeading({ eyebrow, title, description, actions, id }) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow ? <div className="eyebrow" style={{ marginBottom: 5 }}>{eyebrow}</div> : null}
        <h2 id={id}>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

const BADGE_TONES = {
  neutral: 'badge-neutral',
  cyan: 'badge-cyan',
  green: 'badge-green',
  amber: 'badge-amber',
  red: 'badge-red',
  violet: 'badge-violet',
};

export function Badge({ tone = 'neutral', dot = false, live = false, children, className = '' }) {
  return (
    <span className={cx('badge', BADGE_TONES[tone] || BADGE_TONES.neutral, dot && 'badge-dot', live && 'live-badge', className)}>
      {children}
    </span>
  );
}

export function StatusBadge({ status, meta }) {
  const entry = meta?.[status] || { label: status, tone: 'neutral' };
  return (
    <Badge tone={entry.tone} dot live={status === 'live'}>
      {entry.label}
    </Badge>
  );
}

export function Field({ label, hint, error, required = false, children, htmlFor }) {
  return (
    <div className="input-label">
      {label ? (
        <label className="label" htmlFor={htmlFor}>
          {label}
          {required ? <span style={{ color: 'var(--danger)', marginLeft: 3 }}>*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? <div className="input-error">{error}</div> : hint ? <div className="input-hint">{hint}</div> : null}
    </div>
  );
}

export function TextInput({ className = '', ...props }) {
  return <input className={cx('input', className)} {...props} />;
}

export function Textarea({ className = '', ...props }) {
  return <textarea className={cx('textarea', className)} {...props} />;
}

export function Select({ className = '', children, ...props }) {
  return (
    <select className={cx('select', className)} {...props}>
      {children}
    </select>
  );
}

export function Switch({ checked, onChange, label, description, disabled = false }) {
  const id = useId();
  return (
    <label className="switch" htmlFor={id} style={{ opacity: disabled ? 0.55 : 1 }}>
      <input
        id={id}
        type="checkbox"
        checked={Boolean(checked)}
        onChange={(event) => onChange?.(event.target.checked)}
        disabled={disabled}
      />
      <span className="switch-track" aria-hidden="true" />
      <span>
        <span className="label" style={{ color: 'var(--fg)' }}>{label}</span>
        {description ? <span className="input-hint" style={{ display: 'block', marginTop: 1 }}>{description}</span> : null}
      </span>
    </label>
  );
}

export function Spinner({ label = 'Loading' }) {
  return (
    <span className="flex items-center gap-2 text-faint" role="status">
      <span className="spinner" aria-hidden="true" />
      <span className="eyebrow">{label}</span>
    </span>
  );
}

export function LoadingBlock({ rows = 3 }) {
  return (
    <div className="panel" style={{ padding: 18 }} aria-busy="true" aria-label="Loading content">
      <div className="skeleton" style={{ width: '22%', height: 10, marginBottom: 16 }} />
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="skeleton" style={{ width: `${92 - index * 11}%`, height: 13, marginBottom: 11 }} />
      ))}
    </div>
  );
}

export function ErrorState({ title = 'This view could not load', error, onRetry }) {
  return (
    <div className="panel empty-state" role="alert">
      <div className="empty-icon" style={{ color: 'var(--danger)' }}>
        <AlertTriangle size={19} />
      </div>
      <h3>{title}</h3>
      <p>{error?.message || String(error || 'The local database did not return a response.')}</p>
      {onRetry ? (
        <Button size="sm" onClick={onRetry} style={{ marginTop: 15 }}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }) {
  return (
    <div className="empty-state">
      {icon ? <div className="empty-icon">{icon}</div> : null}
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action ? <div style={{ marginTop: 16 }}>{action}</div> : null}
    </div>
  );
}

export function Kbd({ children }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function TabNav({ tabs, value, onChange, ariaLabel = 'Sections' }) {
  return (
    <div className="tabs" role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={value === tab.value}
          className={cx('tab', value === tab.value && 'active')}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
          {typeof tab.count === 'number' ? <span className="count">{tab.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function ProgressBar({ value = 0, tone = 'accent', height = 4, label }) {
  const percentage = Math.min(100, Math.max(0, Number(value) || 0));
  const colors = {
    accent: 'var(--accent)',
    danger: 'var(--danger)',
    warning: 'var(--warning)',
    positive: 'var(--positive)',
  };
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percentage}
      aria-label={label || 'Progress'}
      style={{ height, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}
    >
      <div
        style={{
          width: `${percentage}%`,
          height: '100%',
          background: colors[tone] || colors.accent,
          borderRadius: 999,
          transition: 'width 240ms ease',
        }}
      />
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  eyebrow,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
  preventClose = false,
}) {
  const panelRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const handleKey = (event) => {
      if (event.key === 'Escape' && !preventClose) {
        event.stopPropagation();
        onClose?.();
      }
    };
    document.addEventListener('keydown', handleKey);
    const timer = setTimeout(() => {
      const focusable = panelRef.current?.querySelector(
        'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      focusable?.focus();
    }, 40);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', handleKey);
      if (previous && typeof previous.focus === 'function') previous.focus();
    };
  }, [open, onClose, preventClose]);

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="modal-root">
          <motion.div
            className="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={() => {
              if (closeOnBackdrop && !preventClose) onClose?.();
            }}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={cx('modal-panel', size !== 'md' && `modal-${size}`)}
            initial={{ opacity: 0, y: 8, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.99 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <div className="modal-header">
              <div>
                {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
                <h2 id={titleId}>{title}</h2>
                {description ? <p>{description}</p> : null}
              </div>
              <IconButton label="Close" onClick={onClose} disabled={preventClose}>
                <X size={16} />
              </IconButton>
            </div>
            <div className="modal-body">{children}</div>
            {footer ? <div className="modal-footer">{footer}</div> : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

const TOAST_ICONS = {
  success: CheckCircle2,
  error: XCircle,
  warning: TriangleAlert,
  info: Info,
};

export function ToastViewport({ toasts, onDismiss }) {
  return createPortal(
    <div className="toast-viewport" aria-live="polite" aria-atomic="false">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const Icon = TOAST_ICONS[toast.tone] || Info;
          return (
            <motion.div
              key={toast.id}
              className={cx('toast', `toast-${toast.tone || 'info'}`)}
              role={toast.tone === 'error' ? 'alert' : 'status'}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 18, scale: 0.98 }}
              transition={{ duration: 0.18 }}
            >
              <Icon size={16} className="toast-icon" aria-hidden="true" />
              <div className="grow">
                {toast.title ? <div className="toast-title">{toast.title}</div> : null}
                {toast.message ? <div className="toast-message">{toast.message}</div> : null}
              </div>
              <IconButton label="Dismiss notification" onClick={() => onDismiss(toast.id)} style={{ marginTop: -4, marginRight: -5 }}>
                <X size={13} />
              </IconButton>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>,
    document.body,
  );
}

export function ConfirmSurface({ message, detail, confirmLabel = 'Confirm', tone = 'danger', onConfirm, onCancel }) {
  return (
    <div>
      <div className="flex gap-3" style={{ alignItems: 'flex-start' }}>
        <div
          style={{
            flex: 'none',
            width: 34,
            height: 34,
            borderRadius: 8,
            display: 'grid',
            placeItems: 'center',
            border: `1px solid ${tone === 'danger' ? 'rgba(251,113,133,.3)' : 'var(--line-strong)'}`,
            background: tone === 'danger' ? 'rgba(251,113,133,.07)' : 'rgba(255,255,255,.03)',
            color: tone === 'danger' ? 'var(--danger)' : 'var(--fg-muted)',
          }}
        >
          <AlertTriangle size={17} />
        </div>
        <div>
          <p style={{ fontSize: 13, lineHeight: '20px' }}>{message}</p>
          {detail ? <p className="text-faint" style={{ marginTop: 7, fontSize: 12, lineHeight: '18px' }}>{detail}</p> : null}
        </div>
      </div>
      <div className="flex justify-between gap-2" style={{ marginTop: 22 }}>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </div>
  );
}
