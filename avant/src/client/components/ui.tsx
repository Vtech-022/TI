// Componentes visuais reutilizáveis.
import { AlertTriangle, Ban, Check, CheckCircle2, Clock, Info, Lock, X } from 'lucide-react';
import { ReactNode, useEffect, useRef } from 'react';
import { CERTAINTY_LABEL, PRIORITY_LABEL, STATUS_LABEL } from '../lib/types';
import type { Certainty, Priority, TaskStatus } from '../lib/types';
import { useStore } from '../lib/store';

export function PriorityBadge({ p, manual }: { p: Priority; manual?: boolean }) {
  return (
    <span className={`badge p-${p}`} title={manual ? 'Prioridade ajustada manualmente' : 'Prioridade calculada'}>
      {p === 'critica' && <AlertTriangle aria-hidden />}
      {PRIORITY_LABEL[p]}
      {manual ? ' ·M' : ''}
    </span>
  );
}

export function StatusBadge({ s }: { s: TaskStatus }) {
  return (
    <span className={`badge s-${s}`}>
      {s === 'concluida' && <CheckCircle2 aria-hidden />}
      {s === 'cancelada' && <Ban aria-hidden />}
      {STATUS_LABEL[s]}
    </span>
  );
}

export function Cert({ c, label }: { c?: Certainty; label?: string }) {
  const value = c ?? 'explicita';
  return (
    <span className={`cert c-${value}`} title={`Grau de certeza: ${CERTAINTY_LABEL[value]}`}>
      {label ?? CERTAINTY_LABEL[value]}
    </span>
  );
}

export function BlockedBadge() {
  return (
    <span className="badge blocked">
      <Lock aria-hidden /> Bloqueada
    </span>
  );
}

export function DueBadge({ days, date }: { days: number | null; date: string | null }) {
  if (days == null || !date) return null;
  if (days < 0) return <span className="badge overdue">{-days}d de atraso</span>;
  if (days === 0) return <span className="badge p-critica">Hoje</span>;
  if (days === 1) return <span className="badge p-alta">Amanhã</span>;
  return null;
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon ?? <Info aria-hidden />}
      <strong>{title}</strong>
      {children && <div className="small">{children}</div>}
    </div>
  );
}

export function Panel({ title, icon, count, actions, children, flush, accent, id }: { title: ReactNode; icon?: ReactNode; count?: number | string; actions?: ReactNode; children: ReactNode; flush?: boolean; accent?: boolean; id?: string }) {
  return (
    <section className={`panel${accent ? ' accent' : ''}`} aria-labelledby={id}>
      <div className="panel-head">
        <h2 id={id}>
          {icon}
          {title}
        </h2>
        {count !== undefined && <span className="count">{count}</span>}
        <span className="spacer" />
        {actions}
      </div>
      <div className={`panel-body${flush ? ' flush' : ''}`}>{children}</div>
    </section>
  );
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Carregando">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ width: `${70 + ((i * 17) % 25)}%` }} />
      ))}
    </div>
  );
}

export function ErrorBox({ error }: { error: { message: string } | null }) {
  if (!error) return null;
  return (
    <div className="error-box" role="alert">
      {error.message}
    </div>
  );
}

function useFocusTrap(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>('[data-autofocus]') ?? el?.querySelector<HTMLElement>('input, textarea, select, button');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab' && el) {
        const items = [...el.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null);
        if (!items.length) return;
        const [a, b] = [items[0], items[items.length - 1]];
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          b.focus();
        } else if (!e.shiftKey && document.activeElement === b) {
          e.preventDefault();
          a.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
    };
  }, [open, onClose]);
  return ref;
}

export function Modal({ open, title, onClose, children, footer, className, label }: { open: boolean; title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; className?: string; label?: string }) {
  const ref = useFocusTrap(open, onClose);
  if (!open) return null;
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className={`modal ${className ?? ''}`} role="dialog" aria-modal="true" aria-label={label ?? (typeof title === 'string' ? title : undefined)} ref={ref}>
        <div className="modal-head">
          <h2>{title}</h2>
          <span style={{ flex: 1 }} />
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            <X />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </>
  );
}

export function Drawer({ open, onClose, header, children, footer, label }: { open: boolean; onClose: () => void; header: ReactNode; children: ReactNode; footer?: ReactNode; label: string }) {
  const ref = useFocusTrap(open, onClose);
  if (!open) return null;
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={label} ref={ref}>
        <div className="drawer-head">{header}</div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </aside>
    </>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
  children
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button className="btn" onClick={onCancel}>
            Cancelar
          </button>
          <button className={`btn ${danger ? 'danger' : 'primary'}`} onClick={onConfirm} data-autofocus>
            {confirmLabel}
          </button>
        </>
      }
    >
      <div style={{ color: 'var(--text-2)' }}>{message}</div>
      {children}
    </Modal>
  );
}

export function Toasts() {
  const { toasts, dismissToast } = useStore();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind === 'error' ? 'error' : ''}`}>
          {t.kind === 'error' ? <AlertTriangle aria-hidden /> : <Check aria-hidden />}
          <span>{t.text}</span>
          {t.action ? (
            <button
              onClick={() => {
                t.action!.run();
                dismissToast(t.id);
              }}
            >
              {t.action.label}
            </button>
          ) : (
            <button onClick={() => dismissToast(t.id)} aria-label="Fechar notificação">
              <X size={14} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function ProgressBar({ value, label }: { value: number | null; label?: string }) {
  return (
    <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value ?? 0} aria-label={label ?? 'Progresso'}>
      <span style={{ width: `${value ?? 0}%` }} />
    </div>
  );
}

export function Field({ label, children, full, hint }: { label: string; children: ReactNode; full?: boolean; hint?: ReactNode }) {
  return (
    <label className={`field${full ? ' full' : ''}`}>
      <span>{label}</span>
      {children}
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
}

export function ClockIcon() {
  return <Clock aria-hidden />;
}
