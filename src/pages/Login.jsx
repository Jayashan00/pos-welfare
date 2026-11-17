import { useEffect, useState } from 'react';
import { ROLES, useStore } from '../lib/store';
import { IconUser } from '../components/Icons';

export default function Login() {
  const { users, login, settings } = useStore();
  const active = users.filter((u) => u.active);
  const [username, setUsername] = useState(active.length === 1 ? active[0].username : '');
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const firstRun = users.some((u) => u.username === 'admin' && u.mustChangePin);

  const submit = async (e) => {
    e?.preventDefault();
    if (!username) return setErr('Choose your name first.');
    if (!pin) return setErr('Enter your PIN.');
    setBusy(true);
    try {
      await login(username, pin);
    } catch (ex) {
      setErr(ex.message);
      setPin('');
    }
    setBusy(false);
  };

  const press = (k) => {
    setErr('');
    if (k === 'clear') setPin('');
    else if (k === 'back') setPin((p) => p.slice(0, -1));
    else setPin((p) => (p.length < 8 ? p + k : p));
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('back');
      else if (e.key === 'Enter') submit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="login">
      <section className="login-brand">
        <div className="login-emblem">{settings.logo ? <img src={settings.logo} alt="" /> : <img src="/icon.svg" alt="" />}</div>
        <h1>{settings.canteenName}</h1>
        {settings.unitName && <p className="login-unit">{settings.unitName}</p>}
        {settings.address && <p className="login-addr">{settings.address}</p>}
      </section>
      <section className="login-panel">
        <form onSubmit={submit} className="login-form">
          <h2>Sign in to the till</h2>
          <div className="user-pick" role="radiogroup" aria-label="Who is signing in">
            {active.map((u) => (
              <button type="button" key={u.id} role="radio" aria-checked={username === u.username} className={`user-chip ${username === u.username ? 'on' : ''}`} onClick={() => { setUsername(u.username); setErr(''); setPin(''); }}>
                <IconUser size={18} />
                <span><b>{u.name}</b><small>{ROLES[u.role]?.label}</small></span>
              </button>
            ))}
          </div>
          <label className="field">
            <span>PIN</span>
            <input className="pin-input" type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 8)); setErr(''); }} placeholder="••••" autoFocus />
          </label>
          <div className="pin-pad">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'].map((k) => (
              <button type="button" key={k} className="np-key" onClick={() => press(k)}>
                {k === 'clear' ? 'Clear' : k === 'back' ? '⌫' : k}
              </button>
            ))}
          </div>
          {err && <div className="form-error" role="alert">{err}</div>}
          <button className="btn btn-primary btn-xl" disabled={busy}>Sign in</button>
          {firstRun && <p className="login-hint">First time? Sign in as <b>Administrator</b> with PIN <b>1234</b>. You will be asked to set a new PIN.</p>}
        </form>
      </section>
    </div>
  );
}
