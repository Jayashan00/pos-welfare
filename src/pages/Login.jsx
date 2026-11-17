import { useEffect, useRef, useState } from 'react';
import { ROLES, useStore } from '../lib/store';
import { IconLock, IconShield, IconUser } from '../components/Icons';

// The PIN is never typed into a browser password field, so Chrome cannot
// save it or silently pre-fill it. Digits come from the on-screen pad or
// the keyboard (top row and number pad).
function digitFrom(e) {
  if (/^\d$/.test(e.key)) return e.key;
  const m = /^Numpad(\d)$/.exec(e.code || '');
  return m ? m[1] : null;
}

export function PinDots({ length, error }) {
  const slots = Math.max(4, length);
  return (
    <div className={`pin-dots ${error ? 'shake' : ''}`} role="status" aria-label={`${length} digits entered`}>
      {Array.from({ length: slots }, (_, i) => <span key={i} className={i < length ? 'on' : ''} />)}
    </div>
  );
}

export function PinPad({ onDigit, onBack, onClear }) {
  return (
    <div className="pin-pad">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => (
        <button type="button" key={k} className="np-key" onClick={() => onDigit(k)} tabIndex={-1}>{k}</button>
      ))}
      <button type="button" className="np-key np-text" onClick={onClear} tabIndex={-1}>Clear</button>
      <button type="button" className="np-key" onClick={() => onDigit('0')} tabIndex={-1}>0</button>
      <button type="button" className="np-key np-text" onClick={onBack} tabIndex={-1} aria-label="Delete last digit">⌫</button>
    </div>
  );
}

export default function Login() {
  const { users, login, settings } = useStore();
  const active = users.filter((u) => u.active);
  const [username, setUsername] = useState(() => {
    let last = '';
    try { last = localStorage.getItem('wcpos-lastuser') || ''; } catch { /* ignore */ }
    if (active.some((u) => u.username === last)) return last;
    return active.length === 1 ? active[0].username : '';
  });
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const pinRef = useRef(pin);
  pinRef.current = pin;
  const firstRun = users.length === 1 && users[0].mustChangePin;
  const selected = active.find((u) => u.username === username);

  const submit = async () => {
    const p = pinRef.current;
    if (!username) return setErr('Select your name first.');
    if (p.length < 4) return setErr('Enter your PIN (at least 4 digits).');
    setBusy(true);
    try {
      await login(username, p);
    } catch (ex) {
      setErr(ex.message === 'Wrong PIN. Try again.' ? 'Incorrect PIN. Check the name selected above and try again.' : ex.message);
      setPin('');
      setBusy(false);
    }
  };

  const add = (d) => { setErr(''); setPin((p) => (p.length < 8 ? p + d : p)); };
  const back = () => { setErr(''); setPin((p) => p.slice(0, -1)); };
  const clear = () => { setErr(''); setPin(''); };

  useEffect(() => {
    if (forgot) return undefined;
    const onKey = (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      const d = digitFrom(e);
      if (d) { e.preventDefault(); add(d); }
      else if (e.key === 'Backspace') { e.preventDefault(); back(); }
      else if (e.key === 'Escape' || e.key === 'Delete') { e.preventDefault(); clear(); }
      else if (e.key === 'Enter' || e.key === 'NumpadEnter') { e.preventDefault(); submit(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="login">
      <div className="login-card">
        <header className="login-head">
          <div className="login-crest">{settings.logo ? <img src={settings.logo} alt="" /> : <img src="/icon.svg" alt="" />}</div>
          <div>
            <h1>{settings.canteenName}</h1>
            {settings.unitName && <p>{settings.unitName}</p>}
          </div>
        </header>

        {forgot ? (
          <ForgotPin onDone={(uname) => { setForgot(false); if (uname) setUsername(uname); setPin(''); setErr(''); }} />
        ) : (
          <div className="login-body">
            <h2>Sign in to the point of sale</h2>
            {active.length > 1 ? (
              <div className="user-pick" role="radiogroup" aria-label="Select your name">
                {active.map((u) => (
                  <button type="button" key={u.id} role="radio" aria-checked={username === u.username} className={`user-chip ${username === u.username ? 'on' : ''}`} onClick={() => { setUsername(u.username); clear(); }}>
                    <IconUser size={18} />
                    <span><b>{u.name}</b><small>{ROLES[u.role]?.label}</small></span>
                  </button>
                ))}
              </div>
            ) : selected ? (
              <div className="user-single"><IconUser size={18} /><span><b>{selected.name}</b><small>{ROLES[selected.role]?.label}</small></span></div>
            ) : null}

            <div className="pin-block">
              <span className="pin-label">PIN</span>
              <PinDots length={pin.length} error={!!err} />
            </div>
            <PinPad onDigit={add} onBack={back} onClear={clear} />
            {err && <div className="form-error" role="alert">{err}</div>}
            <button type="button" className="btn btn-primary btn-xl" disabled={busy} onClick={submit}>
              <IconLock size={18} /> Sign in
            </button>
            <div className="login-links">
              <button type="button" className="link" onClick={() => setForgot(true)}>Forgot PIN?</button>
            </div>
            {firstRun && <p className="login-hint">New installation: sign in as <b>Administrator</b> with PIN <b>1234</b>. You will then set your own PIN.</p>}
          </div>
        )}
        <footer className="login-foot">
          <IconShield size={16} />
          <span>Authorised users only. Every sale is recorded against the user who signs in.</span>
        </footer>
      </div>
    </div>
  );
}

function ForgotPin({ onDone }) {
  const { users, settings, resetPinWithCode } = useStore();
  const admins = users.filter((u) => u.role === 'admin');
  const [code, setCode] = useState('');
  const [uid, setUid] = useState(admins[0]?.id || '');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  if (!settings.recoveryHash) {
    return (
      <div className="login-body">
        <h2>Forgot PIN</h2>
        <p>No recovery code has been set up on this computer yet.</p>
        <ul className="plain-list">
          <li>Ask another administrator to sign in and reset your PIN in <b>Users</b>.</li>
          <li>For a new installation with no real data, you can start again: in Chrome press <b>F12</b>, open <b>Application</b>, choose <b>Storage</b>, then <b>Clear site data</b>, and reload the page. This erases everything on this computer.</li>
        </ul>
        <button type="button" className="btn btn-lg" onClick={() => onDone()}>Back to sign in</button>
      </div>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (a !== b) return setErr('The two PINs do not match.');
    try {
      const u = await resetPinWithCode({ code, userId: uid, pin: a });
      setOk(`PIN reset for ${u.name}. Sign in with the new PIN.`);
      setTimeout(() => onDone(u.username), 1600);
    } catch (ex) { setErr(ex.message); }
  };

  return (
    <form className="login-body" onSubmit={submit} autoComplete="off">
      <h2>Reset a forgotten PIN</h2>
      <p className="muted">Use the recovery code that was printed when the system was set up.</p>
      <label className="field"><span>Recovery code</span><input className="mono-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="XXXX-XXXX-XXXX" autoComplete="off" spellCheck={false} required autoFocus /></label>
      <label className="field"><span>Administrator account</span><select value={uid} onChange={(e) => setUid(e.target.value)}>{admins.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.username})</option>)}</select></label>
      <div className="grid2">
        <label className="field"><span>New PIN</span><input className="masked" inputMode="numeric" autoComplete="off" value={a} onChange={(e) => setA(e.target.value.replace(/\D/g, '').slice(0, 8))} required /></label>
        <label className="field"><span>Repeat new PIN</span><input className="masked" inputMode="numeric" autoComplete="off" value={b} onChange={(e) => setB(e.target.value.replace(/\D/g, '').slice(0, 8))} required /></label>
      </div>
      {err && <div className="form-error" role="alert">{err}</div>}
      {ok && <div className="form-ok" role="status">{ok}</div>}
      <div className="row-btns">
        <button type="button" className="btn btn-lg" onClick={() => onDone()}>Cancel</button>
        <button className="btn btn-primary btn-lg grow">Reset PIN</button>
      </div>
    </form>
  );
}
