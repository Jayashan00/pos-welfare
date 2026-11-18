import { t } from '../lib/i18n';
import { useEffect, useRef, useState } from 'react';
import { ROLES, useStore } from '../lib/store';
import { IconLock, IconShield, IconUser } from '../components/Icons';
import { LangSwitch } from '../App';

// The PIN is never typed into a browser password field, so Chrome cannot
// save it or silently pre-fill it. Digits come from the on-screen pad or
// the keyboard (top row and number pad).
function digitFrom(e) {
  if (/^\d$/.test(e.key)) return e.key;
  const m = /^(?:Numpad|Digit)(\d)$/.exec(e.code || '');
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
      <button type="button" className="np-key np-text" onClick={onClear} tabIndex={-1}>{t("Clear")}</button>
      <button type="button" className="np-key" onClick={() => onDigit('0')} tabIndex={-1}>0</button>
      <button type="button" className="np-key np-text" onClick={onBack} tabIndex={-1} aria-label={t("Delete last digit")}>⌫</button>
    </div>
  );
}

export default function Login() {
  const { users, login, settings, lang } = useStore();
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
    if (!username) return setErr(t("Select your name first."));
    if (p.length < 4) return setErr(t("Enter your PIN (at least 4 digits)."));
    setBusy(true);
    try {
      await login(username, p);
    } catch (ex) {
      setErr(ex.message === 'Wrong PIN. Try again.' ? t("Incorrect PIN. Check the name selected above and try again.") : ex.message);
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
      const tg = e.target;
      if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT')) return;
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
            <h1>{lang === 'si' && settings.canteenNameSi ? settings.canteenNameSi : settings.canteenName}</h1>
            {settings.unitName && <p>{settings.unitName}</p>}
          </div>
        </header>
        <div className="login-lang"><LangSwitch /></div>

        {forgot ? (
          <ForgotPin onDone={(uname) => { setForgot(false); if (uname) setUsername(uname); setPin(''); setErr(''); }} />
        ) : (
          <div className="login-body">
            <h2>{t("Sign in to the point of sale")}</h2>
            {active.length > 1 ? (
              <div className="user-pick" role="radiogroup" aria-label={t("Select your name")}>
                {active.map((u) => (
                  <button type="button" key={u.id} role="radio" aria-checked={username === u.username} className={`user-chip ${username === u.username ? 'on' : ''}`} onClick={() => { setUsername(u.username); clear(); }}>
                    <IconUser size={18} />
                    <span><b>{u.name}</b><small>{t(ROLES[u.role]?.label)}</small></span>
                  </button>
                ))}
              </div>
            ) : selected ? (
              <div className="user-single"><IconUser size={18} /><span><b>{selected.name}</b><small>{t(ROLES[selected.role]?.label)}</small></span></div>
            ) : null}

            <div className="pin-block">
              <span className="pin-label">{t("PIN")}</span>
              <PinDots length={pin.length} error={!!err} />
            </div>
            <PinPad onDigit={add} onBack={back} onClear={clear} />
            {err && <div className="form-error" role="alert">{err}</div>}
            <button type="button" className="btn btn-primary btn-xl" disabled={busy} onClick={submit}>
              <IconLock size={18} /> {t("Sign in")}
            </button>
            <div className="login-links">
              <button type="button" className="link" onClick={() => setForgot(true)}>{t("Forgot PIN?")}</button>
            </div>
            {firstRun && <p className="login-hint">{t('New installation: sign in as {who} with PIN {pin}. You will then set your own PIN.', { who: t('Administrator'), pin: '1234' })}</p>}
          </div>
        )}
        <footer className="login-foot">
          <IconShield size={16} />
          <span>{t("Authorised users only. Every sale is recorded against the user who signs in.")}</span>
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
        <h2>{t("Forgot PIN")}</h2>
        <p>{t("No recovery code has been set up on this computer yet.")}</p>
        <ul className="plain-list">
          <li>{t('Ask another administrator to sign in and reset your PIN in Users.')}</li>
          <li>{t('For a new installation with no real data, you can start again: in Chrome press F12, open Application, choose Storage, then Clear site data, and reload the page. This erases everything on this computer.')}</li>
        </ul>
        <button type="button" className="btn btn-lg" onClick={() => onDone()}>{t("Back to sign in")}</button>
      </div>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (a !== b) return setErr(t("The two PINs do not match."));
    try {
      const u = await resetPinWithCode({ code, userId: uid, pin: a });
      setOk(t('PIN reset for {name}. Sign in with the new PIN.', { name: u.name }));
      setTimeout(() => onDone(u.username), 1600);
    } catch (ex) { setErr(ex.message); }
  };

  return (
    <form className="login-body" onSubmit={submit} autoComplete="off">
      <h2>{t("Reset a forgotten PIN")}</h2>
      <p className="muted">{t("Use the recovery code that was printed when the system was set up.")}</p>
      <label className="field"><span>{t("Recovery code")}</span><input className="mono-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="XXXX-XXXX-XXXX" autoComplete="off" spellCheck={false} required autoFocus /></label>
      <label className="field"><span>{t("Administrator account")}</span><select value={uid} onChange={(e) => setUid(e.target.value)}>{admins.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.username})</option>)}</select></label>
      <div className="grid2">
        <label className="field"><span>{t("New PIN")}</span><input className="masked" inputMode="numeric" autoComplete="off" value={a} onChange={(e) => setA(e.target.value.replace(/\D/g, '').slice(0, 8))} required /></label>
        <label className="field"><span>{t("Repeat new PIN")}</span><input className="masked" inputMode="numeric" autoComplete="off" value={b} onChange={(e) => setB(e.target.value.replace(/\D/g, '').slice(0, 8))} required /></label>
      </div>
      {err && <div className="form-error" role="alert">{err}</div>}
      {ok && <div className="form-ok" role="status">{ok}</div>}
      <div className="row-btns">
        <button type="button" className="btn btn-lg" onClick={() => onDone()}>{t("Cancel")}</button>
        <button className="btn btn-primary btn-lg grow">{t("Reset PIN")}</button>
      </div>
    </form>
  );
}
