import { useMemo, useState } from 'react';
import { canManage, useStore } from '../lib/store';
import { addDays, dayKey, download, endOfDay, fmtDateTime, money, qtyStr, startOfDay, toCSV } from '../lib/utils';
import { payLabel, printReceipt } from '../lib/print';
import { Badge, Empty, Modal, useConfirm, useToast } from '../components/ui';
import { IconDownload, IconPrinter, IconSearch, IconVoid } from '../components/Icons';

export default function Sales() {
  const { sales, settings, user, users } = useStore();
  const manage = canManage(user);
  const [from, setFrom] = useState(dayKey());
  const [to, setTo] = useState(dayKey());
  const [q, setQ] = useState('');
  const [pay, setPay] = useState('');
  const [status, setStatus] = useState('');
  const [who, setWho] = useState('');
  const [open, setOpen] = useState(null);
  const [limit, setLimit] = useState(200);
  const cur = settings.currency;

  const list = useMemo(() => {
    const a = startOfDay(manage ? from : dayKey()), b = endOfDay(manage ? to : dayKey());
    const s = q.trim().toLowerCase();
    return sales.filter((x) =>
      x.ts >= a && x.ts <= b &&
      (manage || x.userId === user.id) &&
      (!who || x.userId === who) &&
      (!pay || x.payments.some((p) => p.method === pay)) &&
      (!status || x.status === status) &&
      (!s || x.billNo.toLowerCase().includes(s) || x.member?.name.toLowerCase().includes(s) || x.member?.serviceNo.toLowerCase().includes(s) || x.items.some((i) => i.name.toLowerCase().includes(s) || i.barcode === s))
    );
  }, [sales, from, to, q, pay, status, who, manage, user.id]);

  const done = list.filter((s) => s.status === 'completed');
  const total = done.reduce((a, s) => a + s.total, 0);

  const exportCSV = () => download(`bills-${from}-to-${to}.csv`, toCSV(list, [
    { label: 'Bill no', value: 'billNo' }, { label: 'Date', value: (s) => fmtDateTime(s.ts) }, { label: 'Operator', value: 'userName' },
    { label: 'Member', value: (s) => (s.member ? `${s.member.serviceNo} ${s.member.name}` : '') }, { label: 'Items', value: (s) => s.items.length },
    { label: 'Sub total', value: 'subtotal' }, { label: 'Discount', value: 'discount' }, { label: 'Tax', value: 'tax' }, { label: 'Total', value: 'total' },
    { label: 'Paid by', value: (s) => s.payments.map((p) => `${payLabel(p.method)} ${p.amount}`).join(' + ') }, { label: 'Status', value: 'status' }, { label: 'Void reason', value: 'voidReason' },
  ]));

  const preset = (n) => { setFrom(addDays(dayKey(), -n)); setTo(dayKey()); };

  return (
    <div className="page">
      <div className="toolbar">
        <div className="search"><IconSearch size={18} /><input placeholder="Bill no., member, item or scan the bill barcode" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></div>
        {manage && <>
          <label className="inline">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="inline">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <div className="seg small"><button className={from === dayKey() && to === dayKey() ? 'on' : ''} onClick={() => preset(0)}>Today</button><button onClick={() => preset(6)}>7 days</button><button onClick={() => preset(29)}>30 days</button></div>
          <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Operator"><option value="">All operators</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        </>}
        <select value={pay} onChange={(e) => setPay(e.target.value)} aria-label="Payment"><option value="">All payments</option>{['cash', 'card', 'qr', 'credit'].map((m) => <option key={m} value={m}>{payLabel(m)}</option>)}</select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All bills</option><option value="completed">Completed</option><option value="void">Void</option></select>
        <div className="toolbar-spacer" />
        <button className="btn" onClick={exportCSV}><IconDownload size={17} />Export</button>
      </div>
      {!manage && <p className="muted small">Showing your bills from today.</p>}
      <div className="table-wrap">
        <table className="tbl click">
          <thead><tr><th>Bill</th><th>Date</th><th>Operator</th><th>Member</th><th className="n">Items</th><th>Paid by</th><th className="n">Total</th></tr></thead>
          <tbody>
            {list.slice(0, limit).map((s) => (
              <tr key={s.id} onClick={() => setOpen(s.id)} className={s.status === 'void' ? 'dim' : ''} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(s.id)}>
                <td className="mono b">{s.billNo} {s.status === 'void' && <Badge tone="bad">Void</Badge>}</td>
                <td>{fmtDateTime(s.ts)}</td>
                <td>{s.userName}</td>
                <td>{s.member ? `${s.member.rank || ''} ${s.member.name}` : <span className="muted">—</span>}</td>
                <td className="n">{s.items.length}</td>
                <td>{s.payments.map((p) => payLabel(p.method)).join(' + ')}</td>
                <td className="n b">{money(s.total, '')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <Empty title="No bills found">Change the dates or the search.</Empty>}
        {list.length > limit && <div className="more"><button className="btn" onClick={() => setLimit((l) => l + 500)}>Show more</button></div>}
      </div>
      <p className="muted small foot-note">{done.length} completed bills · {money(total, cur)}{list.length !== done.length ? ` · ${list.length - done.length} void` : ''}</p>
      {open && <BillModal id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

export function BillModal({ id, onClose }) {
  const { sales, settings, user, voidSale } = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const s = sales.find((x) => x.id === id);
  if (!s) return null;
  const cur = settings.currency;
  const doVoid = async () => {
    const reason = await confirm({ title: `Void bill ${s.billNo}?`, message: 'Items go back into stock and any member credit is reversed. This cannot be undone.', input: 'Reason', required: true, confirmText: 'Void bill', danger: true });
    if (!reason) return;
    try { await voidSale(s.id, reason); toast('Bill voided'); } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <Modal title={`Bill ${s.billNo}`} onClose={onClose} width={640} footer={
      <>
        {canManage(user) && s.status !== 'void' && <button className="btn btn-danger" onClick={doVoid}><IconVoid size={17} />Void bill</button>}
        <div className="toolbar-spacer" />
        <button className="btn" onClick={onClose}>Close</button>
        <button className="btn btn-primary" onClick={() => printReceipt(s, settings, { copy: true })}><IconPrinter size={17} />Reprint</button>
      </>
    }>
      <div className="bill-view">
        {s.status === 'void' && <div className="banner bad">Voided by {s.voidBy} on {fmtDateTime(s.voidTs)}. Reason: {s.voidReason}</div>}
        <div className="stmt-head">
          <div><small>Date</small><b>{fmtDateTime(s.ts)}</b></div>
          <div><small>Operator</small><b>{s.userName}</b></div>
          <div><small>Member</small><b>{s.member ? `${s.member.rank || ''} ${s.member.name}` : '—'}</b></div>
        </div>
        <table className="tbl compact">
          <thead><tr><th>Item</th><th className="n">Qty</th><th className="n">Price</th><th className="n">Amount</th></tr></thead>
          <tbody>{s.items.map((it, i) => <tr key={i}><td>{it.name}<small className="mono">{it.barcode}</small></td><td className="n">{qtyStr(it.qty)} {it.unit !== 'pcs' ? it.unit : ''}</td><td className="n">{money(it.price, '')}</td><td className="n">{money(it.lineTotal, '')}</td></tr>)}</tbody>
          <tfoot>
            <tr><td colSpan={3}>Sub total</td><td className="n">{money(s.subtotal, '')}</td></tr>
            {s.discount > 0 && <tr><td colSpan={3}>Discount {s.discountLabel}</td><td className="n">-{money(s.discount, '')}</td></tr>}
            {s.tax > 0 && <tr><td colSpan={3}>Tax {s.taxRate}%</td><td className="n">{money(s.tax, '')}</td></tr>}
            <tr className="grand"><td colSpan={3}>Total</td><td className="n">{money(s.total, cur)}</td></tr>
            {s.payments.map((p, i) => <tr key={i}><td colSpan={3}>{payLabel(p.method)}</td><td className="n">{money(p.amount, '')}</td></tr>)}
            {s.change > 0 && <tr><td colSpan={3}>Cash given / change</td><td className="n">{money(s.tendered, '')} / {money(s.change, '')}</td></tr>}
          </tfoot>
        </table>
      </div>
    </Modal>
  );
}
