import { useMemo } from 'react';
import { useStore } from '../lib/store';
import { addDays, dayKey, money, qtyStr, fmtTime, startOfDay } from '../lib/utils';
import { payLabel } from '../lib/print';
import { Badge, Empty } from '../components/ui';
import { IconAlert, IconTill } from '../components/Icons';

export default function Dashboard({ go }) {
  const { sales, products, settings, members, held, user } = useStore();
  const cur = settings.currency;
  const today = dayKey();

  const d = useMemo(() => {
    const done = sales.filter((s) => s.status === 'completed');
    const t = done.filter((s) => s.day === today);
    const y = done.filter((s) => s.day === addDays(today, -1));
    const sum = (arr) => arr.reduce((a, s) => a + s.total, 0);
    const days = Array.from({ length: 7 }, (_, i) => {
      const k = addDays(today, i - 6);
      return { k, v: sum(done.filter((s) => s.day === k)) };
    });
    const items = new Map();
    t.forEach((s) => s.items.forEach((it) => {
      const r = items.get(it.productId) || { name: it.name, qty: 0, amount: 0 };
      r.qty += it.qty; r.amount += it.lineTotal;
      items.set(it.productId, r);
    }));
    const pays = new Map();
    t.forEach((s) => s.payments.forEach((p) => pays.set(p.method, (pays.get(p.method) || 0) + p.amount)));
    const cost = t.reduce((a, s) => a + s.items.reduce((b, it) => b + it.cost * it.qty, 0), 0);
    return {
      total: sum(t), count: t.length, yTotal: sum(y),
      qty: t.reduce((a, s) => a + s.items.reduce((b, it) => b + it.qty, 0), 0),
      profit: sum(t) - cost,
      days,
      top: [...items.values()].sort((a, b) => b.amount - a.amount).slice(0, 6),
      pays: [...pays.entries()].sort((a, b) => b[1] - a[1]),
      recent: t.slice(0, 6),
    };
  }, [sales, today]);

  const low = products.filter((p) => p.active && p.trackStock && p.stock <= (p.reorderLevel || 0)).sort((a, b) => a.stock - b.stock);
  const owed = members.reduce((a, m) => a + (m.balance || 0), 0);
  const max = Math.max(...d.days.map((x) => x.v), 1);
  const daysSinceBackup = settings.lastBackup ? Math.floor((Date.now() - settings.lastBackup) / 86400000) : null;
  const diff = d.yTotal ? Math.round(((d.total - d.yTotal) / d.yTotal) * 100) : null;

  return (
    <div className="dash">
      {(daysSinceBackup === null || daysSinceBackup >= 3) && sales.length > 0 && (
        <div className="banner warn">
          <IconAlert size={18} />
          <span>{daysSinceBackup === null ? 'No backup has been made yet.' : `Last backup was ${daysSinceBackup} days ago.`} All sales are kept on this computer only, so save a backup to a USB drive regularly.</span>
          <button className="btn" onClick={() => go('settings')}>Make a backup</button>
        </div>
      )}
      {user.role === 'admin' && !settings.recoveryHash && (
        <div className="banner warn">
          <IconAlert size={18} />
          <span>No PIN recovery code has been issued. Without one, a forgotten administrator PIN cannot be reset.</span>
          <button className="btn" onClick={() => go('settings')}>Create recovery code</button>
        </div>
      )}
      {settings.sampleData && (
        <div className="banner info">
          <span>The products and members on screen are samples so you can practise. When you are ready, go to Settings and choose <b>Start live trading</b> to remove them.</span>
        </div>
      )}

      <section className="dash-hero">
        <div className="hero-main">
          <span className="hero-label">Sales today</span>
          <strong className="hero-num">{money(d.total, cur)}</strong>
          <span className="hero-sub">
            {diff === null ? 'No sales yesterday to compare' : `${diff >= 0 ? '+' : ''}${diff}% against yesterday (${money(d.yTotal, cur)})`}
          </span>
        </div>
        <dl className="hero-stats">
          <div><dt>Bills</dt><dd>{d.count}</dd></div>
          <div><dt>Average bill</dt><dd>{money(d.count ? d.total / d.count : 0, '')}</dd></div>
          <div><dt>Items sold</dt><dd>{qtyStr(Math.round(d.qty * 100) / 100)}</dd></div>
          <div><dt>Gross profit</dt><dd>{money(d.profit, '')}</dd></div>
          <div><dt>Member credit owed</dt><dd>{money(owed, '')}</dd></div>
          <div><dt>Held bills</dt><dd>{held.length}</dd></div>
        </dl>
        <button className="btn btn-primary btn-xl hero-cta" onClick={() => go('pos')}><IconTill size={22} /> Open the till</button>
      </section>

      <div className="dash-grid">
        <section className="panel">
          <header className="panel-head"><h2>Last 7 days</h2></header>
          <div className="bars" role="img" aria-label="Sales for the last 7 days">
            {d.days.map((x) => (
              <div key={x.k} className={`bar ${x.k === today ? 'today' : ''}`}>
                <span className="bar-val">{x.v ? money(x.v, '').replace(/\.00$/, '') : ''}</span>
                <span className="bar-fill" style={{ height: `${Math.max((x.v / max) * 100, x.v ? 3 : 0)}%` }} />
                <span className="bar-day">{new Date(startOfDay(x.k)).toLocaleDateString('en-GB', { weekday: 'short' })}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <header className="panel-head"><h2>Best sellers today</h2></header>
          {d.top.length === 0 ? <Empty title="No sales yet today" /> : (
            <table className="tbl compact">
              <tbody>{d.top.map((r) => <tr key={r.name}><td>{r.name}</td><td className="n">{qtyStr(Math.round(r.qty * 1000) / 1000)}</td><td className="n b">{money(r.amount, '')}</td></tr>)}</tbody>
            </table>
          )}
        </section>

        <section className="panel">
          <header className="panel-head"><h2>Running low</h2>{low.length > 0 && <button className="link" onClick={() => go('inventory')}>Receive stock</button>}</header>
          {low.length === 0 ? <Empty title="Stock levels are fine" /> : (
            <table className="tbl compact">
              <tbody>{low.slice(0, 8).map((p) => <tr key={p.id}><td>{p.name}</td><td className="n"><Badge tone={p.stock <= 0 ? 'bad' : 'warn'}>{p.stock <= 0 ? 'Out' : `${qtyStr(p.stock)} ${p.unit}`}</Badge></td></tr>)}</tbody>
            </table>
          )}
          {low.length > 8 && <p className="muted small">and {low.length - 8} more</p>}
        </section>

        <section className="panel">
          <header className="panel-head"><h2>Payments today</h2></header>
          {d.pays.length === 0 ? <Empty title="No payments yet" /> : (
            <table className="tbl compact"><tbody>{d.pays.map(([m, v]) => <tr key={m}><td>{payLabel(m)}</td><td className="n b">{money(v, cur)}</td></tr>)}</tbody></table>
          )}
          <h3 className="sub-h">Latest bills</h3>
          {d.recent.length === 0 ? <p className="muted small">None yet</p> : (
            <table className="tbl compact"><tbody>{d.recent.map((s) => <tr key={s.id}><td>{s.billNo}</td><td>{fmtTime(s.ts)}</td><td className="n">{money(s.total, '')}</td></tr>)}</tbody></table>
          )}
        </section>
      </div>
    </div>
  );
}
