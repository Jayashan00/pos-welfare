import { useEffect, useState } from 'react';
import { can, ROLES, useStore } from './lib/store';
import { fmtDate, fmtDateTime, escapeHtml } from './lib/utils';
import { printHTML } from './lib/print';
import { Modal, useToast } from './components/ui';
import { IconChart, IconDashboard, IconLock, IconReceipt, IconSettings, IconShield, IconStock, IconBox, IconTill, IconUsers, IconWifiOff, IconPrinter, IconMenu } from './components/Icons';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import POS from './pages/POS';
import Products from './pages/Products';
import Inventory from './pages/Inventory';
import Members from './pages/Members';
import Sales from './pages/Sales';
import Reports from './pages/Reports';
import Users from './pages/Users';
import Settings from './pages/Settings';

const NAV = [
  { group: 'Counter', items: [
    { id: 'pos', label: 'Sell', icon: IconTill, page: POS, desc: '' },
    { id: 'sales', label: 'Bills', icon: IconReceipt, page: Sales, desc: 'Find, reprint or void a bill.' },
    { id: 'dashboard', label: 'Dashboard', icon: IconDashboard, page: Dashboard, desc: 'Today’s trading at a glance.' },
  ] },
  { group: 'Stock', items: [
    { id: 'products', label: 'Products', icon: IconBox, page: Products, desc: 'Items for sale, prices, barcodes and shelf labels.' },
    { id: 'inventory', label: 'Stock control', icon: IconStock, page: Inventory, desc: 'Receive deliveries, correct stock levels and see every movement.' },
  ] },
  { group: 'Accounts', items: [
    { id: 'members', label: 'Members & credit', icon: IconUsers, page: Members, desc: 'Service personnel, credit limits and repayments.' },
    { id: 'reports', label: 'Reports', icon: IconChart, page: Reports, desc: 'Sales, day-end and stock value reports.' },
  ] },
  { group: 'Administration', items: [
    { id: 'users', label: 'Users', icon: IconShield, page: Users, desc: 'Who can sign in and what each person can do.' },
    { id: 'settings', label: 'Settings', icon: IconSettings, page: Settings, desc: 'Canteen details, printers, selling rules and backups.' },
  ] },
];
const ALL = NAV.flatMap((g) => g.items);

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);
  return <span className="clock"><span>{fmtDate(now)}</span><b>{now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</b></span>;
}

function useOnline() {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => {
    const a = () => setOn(true), b = () => setOn(false);
    window.addEventListener('online', a);
    window.addEventListener('offline', b);
    return () => { window.removeEventListener('online', a); window.removeEventListener('offline', b); };
  }, []);
  return on;
}

export function RecoveryCodeModal({ code, onClose }) {
  const { settings } = useStore();
  const [ack, setAck] = useState(false);
  const print = () => printHTML(`<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:Arial,sans-serif;width:72mm;margin:0 auto;padding:3mm 0;text-align:center;color:#000}
    h1{font-size:15px;margin:0 0 2mm}p{font-size:11px;margin:1mm 0}.c{font-family:'Courier New',monospace;font-size:20px;font-weight:700;border:2px solid #000;padding:3mm 0;margin:3mm 0;letter-spacing:1px}
  </style></head><body><h1>${escapeHtml(settings.canteenName)}</h1><p><b>POS administrator recovery code</b></p><div class="c">${code}</div>
  <p>Use this only to reset a forgotten administrator PIN (Sign in &rarr; Forgot PIN).</p><p>Keep it sealed in the office safe. Do not keep it at the till.</p><p>Issued ${fmtDateTime(Date.now())}</p></body></html>`, { widthMm: settings.paperWidth || 80 });
  return (
    <Modal title="Your recovery code" width={520} footer={<><button className="btn" onClick={print}><IconPrinter size={17} />Print code</button><button className="btn btn-primary" disabled={!ack} onClick={onClose}>Continue</button></>}>
      <div className="stack">
        <p>If an administrator ever forgets their PIN, this code resets it without losing any data. It is shown only once.</p>
        <div className="recovery-code" aria-label="Recovery code">{code}</div>
        <p className="muted">Print it or write it down and keep it in the office safe, away from the till.</p>
        <label className="check"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I have printed or written down this code</label>
      </div>
    </Modal>
  );
}

function ChangePin({ onSaved }) {
  const { user, saveUser, settings, createRecoveryCode } = useStore();
  const toast = useToast();
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (!/^\d{4,8}$/.test(a)) return setErr('Use 4 to 8 digits.');
    if (a === '1234') return setErr('Choose a PIN other than 1234.');
    if (a !== b) return setErr('The two PINs do not match.');
    let code = null;
    if (user.role === 'admin' && !settings.recoveryHash) code = await createRecoveryCode();
    await saveUser(user, a);
    toast('PIN saved');
    onSaved(code);
  };
  return (
    <Modal title="Set your own PIN" width={440}>
      <form onSubmit={submit} className="stack" autoComplete="off">
        <p>You are using the starting PIN. Choose a private PIN of 4 to 8 digits before you continue. Do not share it.</p>
        <label className="field"><span>New PIN</span><input className="masked big-input" inputMode="numeric" autoComplete="off" value={a} onChange={(e) => setA(e.target.value.replace(/\D/g, '').slice(0, 8))} data-autofocus /></label>
        <label className="field"><span>Repeat new PIN</span><input className="masked big-input" inputMode="numeric" autoComplete="off" value={b} onChange={(e) => setB(e.target.value.replace(/\D/g, '').slice(0, 8))} /></label>
        {err && <div className="form-error">{err}</div>}
        <button className="btn btn-primary btn-lg">Save PIN</button>
      </form>
    </Modal>
  );
}

export default function App() {
  const { ready, error, user, logout, settings } = useStore();
  const online = useOnline();
  const [page, setPage] = useState(() => location.hash.slice(1) || '');
  const [recovery, setRecovery] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const on = () => setPage(location.hash.slice(1));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  if (error) return <div className="splash"><div className="splash-card"><h1>The system cannot start</h1><p>{error}</p></div></div>;
  if (!ready) return <div className="splash"><div className="loader" /></div>;
  if (!user) return <Login />;

  const allowedIds = ALL.filter((n) => can(user, n.id)).map((n) => n.id);
  const current = ALL.find((n) => n.id === page && allowedIds.includes(n.id)) || ALL.find((n) => n.id === (user.role === 'operator' ? 'pos' : 'dashboard'));
  const go = (id) => { location.hash = id; setPage(id); setMenuOpen(false); };
  const Page = current.page;
  const isPos = current.id === 'pos';

  return (
    <div className={`shell ${isPos ? 'shell-pos' : ''}`}>
      <header className="appbar">
        <button className="icon-btn appbar-menu" onClick={() => setMenuOpen((v) => !v)} aria-label="Menu"><IconMenu /></button>
        <div className="appbar-brand">
          <img src={settings.logo || '/icon.svg'} alt="" />
          <div>
            <b>{settings.canteenName}</b>
            <small>{settings.unitName ? `${settings.unitName} · ` : ''}Point of Sale System</small>
          </div>
        </div>
        <div className="appbar-right">
          {!online && <span className="offline"><IconWifiOff size={15} /> Offline: sales are still saved</span>}
          <Clock />
          <div className="appbar-user">
            <span><b>{user.name}</b><small>{ROLES[user.role]?.label}</small></span>
            <button className="btn btn-on-dark" onClick={logout}><IconLock size={16} />Lock</button>
          </div>
        </div>
      </header>
      <div className="body">
        <nav className={`sidenav ${menuOpen ? 'open' : ''}`} aria-label="Main">
          {NAV.map((g) => {
            const items = g.items.filter((n) => allowedIds.includes(n.id));
            if (!items.length) return null;
            return (
              <div key={g.group} className="nav-group">
                <span className="nav-group-label">{g.group}</span>
                {items.map((n) => (
                  <button key={n.id} className={`nav-item ${current.id === n.id ? 'on' : ''}`} onClick={() => go(n.id)} aria-current={current.id === n.id ? 'page' : undefined} title={n.label}>
                    <n.icon size={19} />
                    <span>{n.label}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </nav>
        {menuOpen && <div className="nav-scrim" onClick={() => setMenuOpen(false)} />}
        <main className={`content content-${current.id}`}>
          {!isPos && (
            <div className="page-head">
              <h1>{current.label}</h1>
              {current.desc && <p>{current.desc}</p>}
            </div>
          )}
          <Page go={go} />
        </main>
      </div>
      {user.mustChangePin && <ChangePin onSaved={(code) => code && setRecovery(code)} />}
      {recovery && <RecoveryCodeModal code={recovery} onClose={() => setRecovery(null)} />}
    </div>
  );
}
