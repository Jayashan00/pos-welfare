import { t, nameOf } from '../lib/i18n';
import { useMemo, useState } from 'react';
import { canManage, useStore } from '../lib/store';
import { addDays, dayKey, download, endOfDay, fmtDate, fmtDateTime, money, qtyStr, round2, startOfDay, toCSV } from '../lib/utils';
import { dayEndHTML, payLabel, printA4, printHTML } from '../lib/print';
import { Empty, Tabs } from '../components/ui';
import { IconDownload, IconPrinter, IconReceipt } from '../components/Icons';

export function buildReport({ sales, payments, categories, from, to }) {
  const a = startOfDay(from), b = endOfDay(to);
  const inRange = sales.filter((s) => s.ts >= a && s.ts <= b);
  const done = inRange.filter((s) => s.status === 'completed');
  const voids = inRange.filter((s) => s.status === 'void');
  const sum = (arr, f) => round2(arr.reduce((x, y) => x + f(y), 0));
  const catObj = (id) => categories.find((c) => c.id === id);
  const catName = (id) => catObj(id)?.name || 'Other';

  const catSi = new Map();
  const pay = new Map(), cat = new Map(), prod = new Map(), usr = new Map(), day = new Map(), hour = new Map();
  let cost = 0, qty = 0;
  done.forEach((s) => {
    s.payments.forEach((p) => pay.set(p.method, (pay.get(p.method) || 0) + p.amount));
    const u = usr.get(s.userName) || { name: s.userName, count: 0, amount: 0 };
    if (s.type !== 'return') u.count++;
    u.amount += s.total; usr.set(s.userName, u);
    day.set(s.day, (day.get(s.day) || 0) + s.total);
    const h = new Date(s.ts).getHours();
    hour.set(h, (hour.get(h) || 0) + s.total);
    s.items.forEach((it) => {
      cost += it.cost * it.qty; qty += it.qty;
      const cn = catName(it.categoryId);
      cat.set(cn, (cat.get(cn) || 0) + it.lineTotal);
      catSi.set(cn, catObj(it.categoryId)?.nameSi || '');
      const p = prod.get(it.productId) || { name: it.name, nameSi: it.nameSi || '', barcode: it.barcode, qty: 0, amount: 0, cost: 0, unit: it.unit };
      p.qty += it.qty; p.amount += it.lineTotal; p.cost += it.cost * it.qty;
      prod.set(it.productId, p);
    });
  });
  const settle = payments.filter((p) => p.ts >= a && p.ts <= b);
  const gross = sum(done, (s) => s.subtotal);
  const discount = sum(done, (s) => s.discount);
  const tax = sum(done, (s) => s.tax);
  const net = sum(done, (s) => s.total);
  cost = round2(cost);
  return {
    from, to, single: from === to, count: done.filter((s) => s.type !== 'return').length,
    returnCount: done.filter((s) => s.type === 'return').length, returnAmount: sum(done.filter((s) => s.type === 'return'), (s) => s.total), qty: round2(qty), gross, discount, tax, net, cost,
    profit: round2(net - tax - cost),
    avg: done.filter((s) => s.type !== 'return').length ? round2(sum(done.filter((s) => s.type !== 'return'), (s) => s.total) / done.filter((s) => s.type !== 'return').length) : 0,
    byPay: [...pay.entries()].map(([method, amount]) => ({ method, amount: round2(amount) })).sort((x, y) => y.amount - x.amount),
    byCat: [...cat.entries()].map(([name, amount]) => ({ name, nameSi: catSi.get(name) || '', amount: round2(amount) })).sort((x, y) => y.amount - x.amount),
    byProd: [...prod.values()].map((p) => ({ ...p, amount: round2(p.amount), cost: round2(p.cost), profit: round2(p.amount - p.cost) })).sort((x, y) => y.amount - x.amount),
    byUser: [...usr.values()].map((u) => ({ ...u, amount: round2(u.amount) })).sort((x, y) => y.amount - x.amount),
    byDay: [...day.entries()].sort().map(([k, v]) => ({ day: k, amount: round2(v) })),
    byHour: [...hour.entries()].sort((x, y) => x[0] - y[0]).map(([h, v]) => ({ h, amount: round2(v) })),
    voidCount: voids.length, voidAmount: sum(voids, (s) => s.total),
    settlements: sum(settle, (p) => p.amount),
    settleCash: sum(settle.filter((p) => p.method === 'cash'), (p) => p.amount),
    cashExpected: round2((pay.get('cash') || 0) + sum(settle.filter((p) => p.method === 'cash'), (p) => p.amount)),
  };
}

export default function Reports() {
  const { user } = useStore();
  const [tab, setTab] = useState('sales');
  return (
    <div className="page">
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'sales', label: t("Sales report") }, { id: 'stock', label: t("Stock value") }, ...(canManage(user) ? [{ id: 'audit', label: t('Audit log') }] : [])]} />
      {tab === 'sales' ? <SalesReport /> : tab === 'stock' ? <StockValue /> : <AuditLog />}
    </div>
  );
}

function SalesReport() {
  const { sales, payments, categories, settings, user } = useStore();
  const today = dayKey();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const cur = settings.currency;
  const r = useMemo(() => buildReport({ sales, payments, categories, from, to }), [sales, payments, categories, from, to]);
  const rangeLabel = from === to ? fmtDate(startOfDay(from)) : `${fmtDate(startOfDay(from))} to ${fmtDate(startOfDay(to))}`;

  const presets = [
    ['Today', today, today],
    ['Yesterday', addDays(today, -1), addDays(today, -1)],
    ['Last 7 days', addDays(today, -6), today],
    ['This month', today.slice(0, 8) + '01', today],
    ['Last month', (() => { const d = new Date(startOfDay(today)); d.setDate(0); return dayKey(new Date(d.getFullYear(), d.getMonth(), 1)); })(), (() => { const d = new Date(startOfDay(today)); d.setDate(0); return dayKey(d); })()],
  ];

  const printDayEnd = () => printHTML(dayEndHTML({ ...r, rangeLabel, printedBy: user.name }, settings), { widthMm: settings.paperWidth });

  const printFull = () => printA4({
    title: t("Sales report"), subtitle: rangeLabel, settings,
    sections: [
      { title: 'Summary', kv: [['Bills', String(r.count)], ['Items sold', qtyStr(r.qty)], ['Gross sales', money(r.gross, cur)], ['Discounts', money(r.discount, cur)], ['Tax', money(r.tax, cur)], ['Net sales', money(r.net, cur)], ['Cost of goods', money(r.cost, cur)], ['Gross profit', money(r.profit, cur)], ['Voided bills', `${r.voidCount} (${money(r.voidAmount, cur)})`], ['Member credit paid back', money(r.settlements, cur)], ['Cash expected in hand', money(r.cashExpected, cur)]] },
      { title: t("By payment"), columns: [{ label: 'Method' }, { label: t("Amount"), num: true }], rows: r.byPay.map((p) => [payLabel(p.method), money(p.amount, '')]) },
      { title: 'By category (before bill discounts)', columns: [{ label: t("Category") }, { label: t("Sales"), num: true }], rows: r.byCat.map((c) => [c.name, money(c.amount, '')]) },
      { title: t("By operator"), columns: [{ label: t("Operator") }, { label: t("Bills"), num: true }, { label: t("Sales"), num: true }], rows: r.byUser.map((u) => [u.name, u.count, money(u.amount, '')]) },
      ...(from !== to ? [{ title: 'By day', columns: [{ label: t("Date") }, { label: t("Sales"), num: true }], rows: r.byDay.map((d) => [fmtDate(startOfDay(d.day)), money(d.amount, '')]) }] : []),
      { title: t("Products sold"), columns: [{ label: t("Product") }, { label: t("Qty"), num: true }, { label: t("Sales"), num: true }, { label: t("Cost"), num: true }, { label: t("Profit"), num: true }],
        rows: r.byProd.map((p) => [p.name, qtyStr(round2(p.qty)), money(p.amount, ''), money(p.cost, ''), money(p.profit, '')]),
        foot: ['Total', qtyStr(r.qty), money(r.byProd.reduce((a, p) => a + p.amount, 0), ''), money(r.cost, ''), money(r.byProd.reduce((a, p) => a + p.profit, 0), '')] },
    ],
  });

  const exportCSV = () => download(`products-sold-${from}-to-${to}.csv`, toCSV(r.byProd, [
    { label: t("Product"), value: 'name' }, { label: t("Barcode"), value: 'barcode' }, { label: t("Qty"), value: (p) => round2(p.qty) }, { label: t("Sales"), value: 'amount' }, { label: t("Cost"), value: 'cost' }, { label: t("Profit"), value: 'profit' },
  ]));

  const maxH = Math.max(...r.byHour.map((h) => h.amount), 1);

  return (
    <>
      <div className="toolbar">
        <div className="seg small">{presets.map(([l, f, t]) => <button key={l} className={from === f && to === t ? 'on' : ''} onClick={() => { setFrom(f); setTo(t); }}>{l}</button>)}</div>
        <label className="inline">{t("From")} <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="inline">{t("To")} <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <div className="toolbar-spacer" />
        <button className="btn" onClick={exportCSV}><IconDownload size={17} />{t("Export")}</button>
        <button className="btn" onClick={printFull}><IconPrinter size={17} />{t("Print full report (A4)")}</button>
        <button className="btn btn-primary" onClick={printDayEnd}><IconReceipt size={17} />{from === to ? 'Print day end' : 'Print summary'} slip</button>
      </div>

      <section className="report-sum">
        <div className="rs-main"><span>{t('Net sales · {range}', { range: rangeLabel })}</span><strong>{money(r.net, cur)}</strong></div>
        <dl>
          <div><dt>{t("Bills")}</dt><dd>{r.count}</dd></div>
          <div><dt>{t("Average bill")}</dt><dd>{money(r.avg, '')}</dd></div>
          <div><dt>{t("Discounts")}</dt><dd>{money(r.discount, '')}</dd></div>
          <div><dt>{t("Gross profit")}</dt><dd>{money(r.profit, '')}</dd></div>
          <div><dt>{t("Cash expected")}</dt><dd>{money(r.cashExpected, '')}</dd></div>
          <div><dt>{t("Voided")}</dt><dd>{r.voidCount}</dd></div>
        </dl>
      </section>

      {r.count === 0 ? <Empty title={t("No sales in this period")}>{t("Pick another date range.")}</Empty> : (
        <div className="report-grid">
          <section className="panel">
            <header className="panel-head"><h2>{t("By payment")}</h2></header>
            <table className="tbl compact"><tbody>{r.byPay.map((p) => <tr key={p.method}><td>{payLabel(p.method)}</td><td className="n b">{money(p.amount, '')}</td><td className="n muted">{Math.round((p.amount / r.net) * 100)}%</td></tr>)}
              {r.settlements > 0 && <tr><td>{t("Member credit paid back")}</td><td className="n b">{money(r.settlements, '')}</td><td></td></tr>}</tbody></table>
          </section>
          <section className="panel">
            <header className="panel-head"><h2>{t("By category")}</h2></header>
            <div className="hbars">{r.byCat.map((c) => <div key={c.name} className="hbar"><span>{nameOf(c)}</span><i style={{ width: `${(c.amount / (r.byCat[0]?.amount || 1)) * 100}%` }} /><b>{money(c.amount, '')}</b></div>)}</div>
          </section>
          <section className="panel">
            <header className="panel-head"><h2>{t("Busy hours")}</h2></header>
            <div className="bars hours">{r.byHour.map((h) => <div key={h.h} className="bar"><span className="bar-fill" style={{ height: `${(h.amount / maxH) * 100}%` }} title={money(h.amount, cur)} /><span className="bar-day">{String(h.h).padStart(2, '0')}</span></div>)}</div>
          </section>
          <section className="panel">
            <header className="panel-head"><h2>{t("By operator")}</h2></header>
            <table className="tbl compact"><tbody>{r.byUser.map((u) => <tr key={u.name}><td>{u.name}</td><td className="n">{u.count} bills</td><td className="n b">{money(u.amount, '')}</td></tr>)}</tbody></table>
          </section>
          <section className="panel span2">
            <header className="panel-head"><h2>{t("Products sold")}</h2><span className="muted small">{r.byProd.length} products</span></header>
            <div className="table-wrap tall">
              <table className="tbl compact">
                <thead><tr><th>{t("Product")}</th><th className="n">{t("Qty")}</th><th className="n">{t("Sales")}</th><th className="n">{t("Cost")}</th><th className="n">{t("Profit")}</th></tr></thead>
                <tbody>{r.byProd.map((p) => <tr key={p.name + p.barcode}><td>{nameOf(p)}</td><td className="n">{qtyStr(round2(p.qty))}</td><td className="n b">{money(p.amount, '')}</td><td className="n">{money(p.cost, '')}</td><td className={`n ${p.profit < 0 ? 'neg' : ''}`}>{money(p.profit, '')}</td></tr>)}</tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function StockValue() {
  const { products, categories, settings } = useStore();
  const cur = settings.currency;
  const rows = categories.map((c) => {
    const ps = products.filter((p) => p.active && p.trackStock && p.categoryId === c.id && p.stock > 0);
    return { name: c.name, items: ps.length, qty: ps.reduce((a, p) => a + p.stock, 0), cost: round2(ps.reduce((a, p) => a + p.cost * p.stock, 0)), retail: round2(ps.reduce((a, p) => a + p.price * p.stock, 0)) };
  }).filter((r) => r.items);
  const tc = rows.reduce((a, r) => a + r.cost, 0), tr = rows.reduce((a, r) => a + r.retail, 0);
  const print = () => printA4({
    title: 'Stock valuation', subtitle: `As at ${fmtDate(Date.now())}`, settings,
    sections: [
      { title: t("By category"), columns: [{ label: t("Category") }, { label: t("Products"), num: true }, { label: t("Value at cost"), num: true }, { label: t("Value at selling price"), num: true }], rows: rows.map((r) => [r.name, r.items, money(r.cost, ''), money(r.retail, '')]), foot: ['Total', rows.reduce((a, r) => a + r.items, 0), money(tc, cur), money(tr, cur)] },
      { title: 'Stock sheet', columns: [{ label: t("Product") }, { label: t("Barcode") }, { label: 'System qty', num: true }, { label: 'Counted qty' }, { label: t("Cost"), num: true }, { label: t("Value"), num: true }],
        rows: products.filter((p) => p.active && p.trackStock).map((p) => [p.name, p.barcode, `${qtyStr(p.stock)} ${p.unit}`, '', money(p.cost, ''), money(p.cost * Math.max(p.stock, 0), '')]) },
    ],
  });
  return (
    <div className="panel">
      <div className="row-btns end"><button className="btn btn-primary" onClick={print}><IconPrinter size={17} />{t("Print valuation and count sheet")}</button></div>
      <table className="tbl">
        <thead><tr><th>{t("Category")}</th><th className="n">{t("Products")}</th><th className="n">{t("Value at cost")}</th><th className="n">{t("Value at selling price")}</th><th className="n">{t("Expected profit")}</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.name}><td>{r.name}</td><td className="n">{r.items}</td><td className="n">{money(r.cost, '')}</td><td className="n">{money(r.retail, '')}</td><td className="n">{money(r.retail - r.cost, '')}</td></tr>)}</tbody>
        <tfoot><tr><td>{t("Total")}</td><td className="n">{rows.reduce((a, r) => a + r.items, 0)}</td><td className="n b">{money(tc, cur)}</td><td className="n b">{money(tr, cur)}</td><td className="n b">{money(tr - tc, cur)}</td></tr></tfoot>
      </table>
    </div>
  );
}


const AUDIT_ACTIONS = ['Signed in', 'Failed sign-in', 'Signed out', 'Discount given', 'Price changed on bill', 'Bill voided', 'Items returned', 'Product added', 'Price changed', 'Product hidden', 'Product deleted', 'Stock received', 'Stock adjusted', 'Credit payment recorded', 'User added', 'User changed', 'User deleted', 'Settings changed', 'Backup downloaded', 'Recovery code issued', 'PIN reset with recovery code', 'Started live trading'];

function AuditLog() {
  const { audit, settings } = useStore();
  const today = dayKey();
  const [from, setFrom] = useState(addDays(today, -6));
  const [to, setTo] = useState(today);
  const [action, setAction] = useState('');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(300);
  const list = useMemo(() => {
    const a = startOfDay(from), b = endOfDay(to), s = q.trim().toLowerCase();
    return audit.filter((x) => x.ts >= a && x.ts <= b && (!action || x.action === action) && (!s || `${x.userName} ${x.detail} ${x.action} ${t(x.action)}`.toLowerCase().includes(s)));
  }, [audit, from, to, action, q]);
  const print = () => printA4({
    title: t('Audit log'), subtitle: `${fmtDate(startOfDay(from))} – ${fmtDate(startOfDay(to))}`, settings,
    sections: [{ title: `${list.length}`, columns: [{ label: t('Time') }, { label: t('User') }, { label: t('Action') }, { label: t('Detail') }], rows: list.map((x) => [fmtDateTime(x.ts), x.userName, t(x.action), x.detail]) }],
  });
  return (
    <div className="panel">
      <p className="muted" style={{ marginBottom: 14 }}>{t('Every sign-in, void, return, price change, discount, stock correction and setting change is recorded here and cannot be edited.')}</p>
      <div className="toolbar">
        <label className="inline">{t('From')} <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="inline">{t('To')} <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <select value={action} onChange={(e) => setAction(e.target.value)} aria-label={t('Action')}><option value="">{t('All actions')}</option>{AUDIT_ACTIONS.map((a) => <option key={a} value={a}>{t(a)}</option>)}</select>
        <input placeholder={t('Search the log')} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="toolbar-spacer" />
        <button className="btn" onClick={() => download(`audit-${from}-to-${to}.csv`, toCSV(list, [{ label: 'Time', value: (x) => fmtDateTime(x.ts) }, { label: 'User', value: 'userName' }, { label: 'Action', value: 'action' }, { label: 'Detail', value: 'detail' }]))}><IconDownload size={17} />{t('Export')}</button>
        <button className="btn btn-primary" onClick={print} disabled={!list.length}><IconPrinter size={17} />{t('Print audit log')}</button>
      </div>
      {list.length === 0 ? <Empty title={t('No recorded actions in this period')} /> : (
        <div className="table-wrap tall">
          <table className="tbl compact">
            <thead><tr><th>{t('Time')}</th><th>{t('User')}</th><th>{t('Action')}</th><th>{t('Detail')}</th></tr></thead>
            <tbody>{list.slice(0, limit).map((x) => <tr key={x.id}><td>{fmtDateTime(x.ts)}</td><td>{x.userName}</td><td><b>{t(x.action)}</b></td><td>{x.detail}</td></tr>)}</tbody>
          </table>
          {list.length > limit && <div className="more"><button className="btn" onClick={() => setLimit((l) => l + 500)}>{t('Show more')}</button></div>}
        </div>
      )}
    </div>
  );
}
