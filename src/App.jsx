import { useEffect, useState } from 'react';
import { can, ROLES, useStore } from './lib/store';
import { fmtDate } from './lib/utils';
import { Modal, useToast } from './components/ui';
import { IconChart, IconDashboard, IconLock, IconReceipt, IconSettings, IconShield, IconStock, IconBox, IconTill, IconUsers, IconWifiOff } from './components/Icons';
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
  { id: 'dashboard', label: 'Dashboard', icon: IconDashboard, page: Dashboard },
  { id: 'pos', label: 'Sell', icon: IconTill, page: POS },
  { id: 'products', label: 'Products', icon: IconBox, page: Products },
  { id: 'inventory', label: 'Stock', icon: IconStock, page: Inventory },
  { id: 'members', label: 'Members', icon: IconUsers, page: Members },
  { id: 'sales', label: 'Bills', icon: IconReceipt, page: Sales },
  { id: 'reports', label: 'Reports', icon: IconChart, page: Reports },
  { id: 'users', label: 'Users', icon: IconShield, page: Users },
  { id: 'settings', label: 'Settings', icon: IconSettings, page: Settings },
];
const TITLES = { dashboard: 'Dashboard', pos: 'Sell', products: 'Products', inventory: 'Stock control', members: 'Members & credit', sales: 'Bills', reports: 'Reports', users: 'Users', settings: 'Settings' };

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="clock">
      {fmtDate(now)} <b>{now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</b>
    </span>
  );
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

function ChangePin() {
  const { user, saveUser } = useStore();
  const toast = useToast();
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (!/^\d{4,8}$/.test(a)) return setErr('Use 4 to 8 digits.');
    if (a === '1234') return setErr('Choose a PIN other than 1234.');
    if (a !== b) return setErr('The two PINs do not match.');
    await saveUser(user, a);
    toast('PIN changed');
  };
  return (
    <Modal title="Set your own PIN" width={420}>
      <form onSubmit={submit} className="stack">
        <p className="muted">You are using the default PIN. Set a private PIN before you start. Keep it secret.</p>
        <label className="field"><span>New PIN</span><input type="password" inputMode="numeric" value={a} onChange={(e) => setA(e.target.value.replace(/\D/g, ''))} maxLength={8} data-autofocus /></label>
        <label className="field"><span>Repeat new PIN</span><input type="password" inputMode="numeric" value={b} onChange={(e) => setB(e.target.value.replace(/\D/g, ''))} maxLength={8} /></label>
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

  useEffect(() => {
    const on = () => setPage(location.hash.slice(1));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  if (error) return <div className="splash"><div className="splash-card"><h1>Cannot open the POS</h1><p>{error}</p></div></div>;
  if (!ready) return <div className="splash"><div className="loader" /></div>;
  if (!user) return <Login />;

  const allowed = NAV.filter((n) => can(user, n.id));
  const current = allowed.find((n) => n.id === page) || allowed.find((n) => n.id === (user.role === 'operator' ? 'pos' : 'dashboard')) || allowed[0];
  const go = (id) => { location.hash = id; setPage(id); };
  const Page = current.page;

  return (
    <div className="shell">
      <nav className="rail" aria-label="Main">
        <div className="rail-logo" title={settings.canteenName}>
          {settings.logo ? <img src={settings.logo} alt="" /> : <img src="/icon.svg" alt="" />}
        </div>
        {allowed.map((n) => (
          <button key={n.id} className={`rail-item ${current.id === n.id ? 'on' : ''}`} onClick={() => go(n.id)} aria-current={current.id === n.id ? 'page' : undefined}>
            <n.icon size={22} />
            <span>{n.label}</span>
          </button>
        ))}
        <div className="rail-spacer" />
        <button className="rail-item" onClick={logout} title="Lock and sign out">
          <IconLock size={22} />
          <span>Lock</span>
        </button>
      </nav>
      <div className="main">
        <header className="topbar">
          <div className="topbar-title">
            <h1>{TITLES[current.id]}</h1>
            <span className="topbar-place">{settings.canteenName}{settings.unitName ? ', ' + settings.unitName : ''}</span>
          </div>
          <div className="topbar-right">
            {!online && <span className="offline"><IconWifiOff size={16} /> Offline. Sales still save on this computer.</span>}
            <Clock />
            <span className="who"><b>{user.name}</b><small>{ROLES[user.role]?.label}</small></span>
          </div>
        </header>
        <main className={`content content-${current.id}`}>
          <Page go={go} />
        </main>
      </div>
      {user.mustChangePin && <ChangePin />}
    </div>
  );
}
