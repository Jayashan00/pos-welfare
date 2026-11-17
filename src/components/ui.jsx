import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { IconX, IconCheck, IconAlert } from './Icons';

// ---------- toasts ----------
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [list, setList] = useState([]);
  const push = useCallback((msg, type = 'ok') => {
    const id = Math.random();
    setList((l) => [...l, { id, msg, type }]);
    setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), type === 'error' ? 5000 : 2800);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {list.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            {t.type === 'error' ? <IconAlert size={18} /> : <IconCheck size={18} />}
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------- modal ----------
export function Modal({ title, onClose, children, footer, width = 560, className = '' }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || !closeRef.current) return;
      // Only the top-most dialog reacts to Escape.
      const all = document.querySelectorAll('.modal');
      if (all[all.length - 1] !== ref.current) return;
      e.stopPropagation();
      closeRef.current();
    };
    window.addEventListener('keydown', onKey, true);
    const first = ref.current?.querySelector('[data-autofocus], input:not([type=hidden]):not([disabled]), select, textarea, button.btn-primary');
    first?.focus();
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${className}`} style={{ maxWidth: width }} ref={ref} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          {onClose && (
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              <IconX />
            </button>
          )}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ---------- confirm ----------
const ConfirmCtx = createContext(null);
export const useConfirm = () => useContext(ConfirmCtx);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const confirm = useCallback(
    (opts) =>
      new Promise((resolve) => {
        setState({ ...opts, resolve });
      }),
    []
  );
  const close = (v) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state && <ConfirmDialog state={state} close={close} />}
    </ConfirmCtx.Provider>
  );
}

function ConfirmDialog({ state, close }) {
  const [text, setText] = useState('');
  const ok = (!state.typeToConfirm || text.trim().toUpperCase() === state.typeToConfirm) && !(state.input && state.required && !text.trim());
  const needInput = state.input || state.typeToConfirm;
  const submit = (e) => {
    e?.preventDefault();
    if (ok) close(state.input ? text : true);
  };
  return (
    <Modal
      title={state.title || 'Are you sure?'}
      onClose={() => close(false)}
      width={460}
      footer={
        <>
          <button className="btn" onClick={() => close(false)}>Cancel</button>
          <button className={`btn ${state.danger ? 'btn-danger' : 'btn-primary'}`} disabled={!ok} onClick={submit} data-autofocus={!needInput || undefined}>
            {state.confirmText || 'Confirm'}
          </button>
        </>
      }
    >
      <form onSubmit={submit}>
        {state.message && <p className="confirm-msg">{state.message}</p>}
        {state.input && (
          <label className="field">
            <span>{state.input}</span>
            <input data-autofocus value={text} onChange={(e) => setText(e.target.value)} placeholder={state.placeholder || ''} />
          </label>
        )}
        {state.typeToConfirm && (
          <label className="field">
            <span>Type {state.typeToConfirm} to confirm</span>
            <input data-autofocus value={text} onChange={(e) => setText(e.target.value)} />
          </label>
        )}
      </form>
    </Modal>
  );
}

// ---------- field ----------
export function Field({ label, hint, children, wide }) {
  return (
    <label className={`field ${wide ? 'wide' : ''}`}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function Empty({ title, children, action }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

// ---------- on-screen number pad (touch screens) ----------
export function NumPad({ onKey }) {
  const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', '⌫'];
  return (
    <div className="numpad">
      {keys.map((k) => (
        <button key={k} type="button" className="np-key" onClick={() => onKey(k)} tabIndex={-1}>
          {k}
        </button>
      ))}
    </div>
  );
}
export const applyPadKey = (value, k) => {
  const v = String(value ?? '');
  if (k === '⌫') return v.slice(0, -1);
  if (k === '.' && v.includes('.')) return v;
  return v === '0' && k !== '.' ? k : v + k;
};

// ---------- barcode scanner ----------
// USB scanners act like a very fast keyboard that ends with Enter.
// This catches scans when no text box has focus, so both scanners
// work anywhere on the screen.
export function useScanner(onScan, enabled = true) {
  const buf = useRef('');
  const last = useRef(0);
  const cb = useRef(onScan);
  cb.current = onScan;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e) => {
      const t = e.target;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if (typing) return;
      if (document.querySelector('.modal-back')) { buf.current = ''; return; }
      const now = performance.now();
      if (now - last.current > 80) buf.current = '';
      last.current = now;
      if (e.key === 'Enter') {
        if (buf.current.length >= 3) {
          e.preventDefault();
          cb.current(buf.current);
        }
        buf.current = '';
        return;
      }
      if (e.key.length === 1) buf.current += e.key;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}

export function Badge({ tone = 'neutral', children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} className={`tab ${value === t.id ? 'on' : ''}`} onClick={() => onChange(t.id)}>
          {t.label}
          {t.count != null && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
