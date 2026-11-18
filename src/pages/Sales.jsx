import { t, nameOf } from '../lib/i18n';
import { useMemo, useState } from 'react';
import { canManage, useStore } from '../lib/store';
import { addDays, dayKey, download, endOfDay, fmtDateTime, money, qtyStr, startOfDay, toCSV } from '../lib/utils';
import { payLabel, printReceipt } from '../lib/print';
import { Badge, Empty, Modal, useConfirm, useToast } from '../components/ui';
import { IconDownload, IconPrinter, IconRecall, IconSearch, IconVoid } from '../components/Icons';

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

  const done = list.filter((s) => s.status === 'completed' && s.type !== 'return');
  const total = list.filter((s) => s.status === 'completed').reduce((a, s) => a + s.total, 0);

  const exportCSV = () => download(`bills-${from}-to-${to}.csv`, toCSV(list, [
    { label: 'Bill no', value: 'billNo' }, { label: t("Date"), value: (s) => fmtDateTime(s.ts) }, { label: t("Operator"), value: 'userName' },
    { label: t("Member"), value: (s) => (s.member ? `${s.member.serviceNo} ${s.member.name}` : '') }, { label: t("Items"), value: (s) => s.items.length },
    { label: t("Sub total"), value: 'subtotal' }, { label: t("Discount"), value: 'discount' }, { label: t("Tax"), value: 'tax' }, { label: t("Total"), value: 'total' },
    { label: t("Paid by"), value: (s) => s.payments.map((p) => `${payLabel(p.method)} ${p.amount}`).join(' + ') }, { label: t("Status"), value: 'status' }, { label: 'Void reason', value: 'voidReason' },
  ]));

  const preset = (n) => { setFrom(addDays(dayKey(), -n)); setTo(dayKey()); };

  return (
    <div className="page">
      <div className="toolbar">
        <div className="search"><IconSearch size={18} /><input placeholder={t("Bill no., member, item or scan the bill barcode")} value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></div>
        {manage && <>
          <label className="inline">{t("From")} <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="inline">{t("To")} <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <div className="seg small"><button className={from === dayKey() && to === dayKey() ? 'on' : ''} onClick={() => preset(0)}>{t("Today")}</button><button onClick={() => preset(6)}>{t("7 days")}</button><button onClick={() => preset(29)}>{t("30 days")}</button></div>
          <select value={who} onChange={(e) => setWho(e.target.value)} aria-label={t("Operator")}><option value="">{t("All operators")}</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        </>}
        <select value={pay} onChange={(e) => setPay(e.target.value)} aria-label={t("Payment")}><option value="">{t("All payments")}</option>{['cash', 'card', 'qr', 'credit'].map((m) => <option key={m} value={m}>{payLabel(m)}</option>)}</select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t("Status")}><option value="">{t("All bills")}</option><option value="completed">{t("Completed")}</option><option value="void">{t("Void")}</option></select>
        <div className="toolbar-spacer" />
        <button className="btn" onClick={exportCSV}><IconDownload size={17} />{t("Export")}</button>
      </div>
      {!manage && <p className="muted small">{t("Showing your bills from today.")}</p>}
      <div className="table-wrap">
        <table className="tbl click">
          <thead><tr><th>{t("Bill")}</th><th>{t("Date")}</th><th>{t("Operator")}</th><th>{t("Member")}</th><th className="n">{t("Items")}</th><th>{t("Paid by")}</th><th className="n">{t("Total")}</th></tr></thead>
          <tbody>
            {list.slice(0, limit).map((s) => (
              <tr key={s.id} onClick={() => setOpen(s.id)} className={s.status === 'void' ? 'dim' : ''} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(s.id)}>
                <td className="mono b">{s.billNo} {s.status === 'void' && <Badge tone="bad">{t("Void")}</Badge>}{s.type === 'return' && <Badge tone="warn">{t('Return')}</Badge>}</td>
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
        {list.length === 0 && <Empty title={t("No bills found")}>{t("Change the dates or the search.")}</Empty>}
        {list.length > limit && <div className="more"><button className="btn" onClick={() => setLimit((l) => l + 500)}>{t("Show more")}</button></div>}
      </div>
      <p className="muted small foot-note">{done.length} completed bills · {money(total, cur)}{list.length !== done.length ? ` · ${list.length - done.length} void` : ''}</p>
      {open && <BillModal id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

export function BillModal({ id, onClose }) {
  const { sales, settings, user, voidSale } = useStore();
  const [returning, setReturning] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();
  const s = sales.find((x) => x.id === id);
  if (!s) return null;
  const cur = settings.currency;
  const doVoid = async () => {
    const reason = await confirm({ title: t('Void bill {no}?', { no: s.billNo }), message: t("Items go back into stock and any member credit is reversed. This cannot be undone."), input: t("Reason"), required: true, confirmText: t("Void bill"), danger: true });
    if (!reason) return;
    try { await voidSale(s.id, reason); toast(t("Bill voided")); } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <Modal title={t('Bill {no}', { no: s.billNo })} onClose={onClose} width={640} footer={
      <>
        {canManage(user) && s.status !== 'void' && s.type !== 'return' && !s.returnCount && <button className="btn btn-danger" onClick={doVoid}><IconVoid size={17} />{t("Void bill")}</button>}
        {canManage(user) && s.status !== 'void' && s.type !== 'return' && <button className="btn" onClick={() => setReturning(true)}><IconRecall size={17} />{t('Return items')}</button>}
        <div className="toolbar-spacer" />
        <button className="btn" onClick={onClose}>{t("Close")}</button>
        <button className="btn btn-primary" onClick={() => printReceipt(s, settings, { copy: true })}><IconPrinter size={17} />{t("Reprint")}</button>
      </>
    }>
      <div className="bill-view">
        {s.type === 'return' && <div className="banner info">{t('Return of bill {no}', { no: s.origBillNo })} · {t('Reason')}: {s.reason}</div>}
        {s.returnCount > 0 && <div className="banner info">{t('Returned items')}: {sales.filter((x) => x.origId === s.id).map((x) => x.billNo).join(', ')}</div>}
        {s.status === 'void' && <div className="banner bad">{t('Voided by {name} on {date}. Reason: {reason}', { name: s.voidBy, date: fmtDateTime(s.voidTs), reason: s.voidReason })}</div>}
        <div className="stmt-head">
          <div><small>{t("Date")}</small><b>{fmtDateTime(s.ts)}</b></div>
          <div><small>{t("Operator")}</small><b>{s.userName}</b></div>
          <div><small>{t("Member")}</small><b>{s.member ? `${s.member.rank || ''} ${s.member.name}` : '—'}</b></div>
        </div>
        <table className="tbl compact">
          <thead><tr><th>{t('Item')}</th><th className="n">{t("Qty")}</th><th className="n">{t("Price")}</th><th className="n">{t("Amount")}</th></tr></thead>
          <tbody>{s.items.map((it, i) => <tr key={i}><td>{nameOf(it)}{it.nameSi && <span className="si-sub">{nameOf(it) === it.name ? it.nameSi : it.name}</span>}<small className="mono">{it.barcode}</small></td><td className="n">{qtyStr(it.qty)} {it.unit !== 'pcs' ? it.unit : ''}</td><td className="n">{money(it.price, '')}</td><td className="n">{money(it.lineTotal, '')}</td></tr>)}</tbody>
          <tfoot>
            <tr><td colSpan={3}>{t("Sub total")}</td><td className="n">{money(s.subtotal, '')}</td></tr>
            {s.discount > 0 && <tr><td colSpan={3}>{t('Discount')} {s.discountLabel}</td><td className="n">-{money(s.discount, '')}</td></tr>}
            {s.tax > 0 && <tr><td colSpan={3}>{t('Tax')} {s.taxRate}%</td><td className="n">{money(s.tax, '')}</td></tr>}
            <tr className="grand"><td colSpan={3}>{t("Total")}</td><td className="n">{money(s.total, cur)}</td></tr>
            {s.payments.map((p, i) => <tr key={i}><td colSpan={3}>{payLabel(p.method)}</td><td className="n">{money(p.amount, '')}</td></tr>)}
            {s.change > 0 && <tr><td colSpan={3}>{t("Cash given / change")}</td><td className="n">{money(s.tendered, '')} / {money(s.change, '')}</td></tr>}
          </tfoot>
        </table>
      </div>
      {returning && <ReturnModal sale={s} onClose={() => setReturning(false)} />}
    </Modal>
  );
}

function ReturnModal({ sale, onClose }) {
  const { settings, returnItems } = useStore();
  const toast = useToast();
  const [qty, setQty] = useState({});
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState('cash');
  const [busy, setBusy] = useState(false);
  const cur = settings.currency;
  const lines = sale.items.map((it, index) => ({ it, index, left: Math.round((it.qty - (sale.returned?.[index] || 0)) * 1000) / 1000 }));
  const gross = lines.reduce((a, l) => a + (Number(qty[l.index]) || 0) * l.it.price, 0);
  const disc = sale.subtotal > 0 ? (gross * sale.discount) / sale.subtotal : 0;
  const tax = sale.taxRate > 0 ? ((gross - disc) * sale.taxRate) / 100 : 0;
  const refund = Math.round((gross - disc + tax) * 100) / 100;
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const rec = await returnItems({ saleId: sale.id, lines: lines.map((l) => ({ index: l.index, qty: Number(qty[l.index]) || 0 })), reason, method });
      toast(t('Return saved. Refund {amount}.', { amount: money(-rec.total, cur) }));
      if (settings.autoPrint) printReceipt(rec, settings);
      onClose();
    } catch (ex) { toast(ex.message, 'error'); }
    setBusy(false);
  };
  return (
    <Modal title={t('Return items from bill {no}', { no: sale.billNo })} onClose={onClose} width={680}>
      <form className="stack" onSubmit={submit}>
        <p className="muted">{t('Choose how many of each item the customer is returning. Items go back into stock.')}</p>
        <table className="tbl compact">
          <thead><tr><th>{t('Item')}</th><th className="n">{t('Sold')}</th><th className="n">{t('Already returned')}</th><th className="n">{t('Return now')}</th></tr></thead>
          <tbody>{lines.map((l) => (
            <tr key={l.index}>
              <td>{nameOf(l.it)}<small>{money(l.it.price, '')}</small></td>
              <td className="n">{qtyStr(l.it.qty)}</td>
              <td className="n">{qtyStr(sale.returned?.[l.index] || 0)}</td>
              <td className="n"><input className="cell-input" type="number" min="0" max={l.left} step={l.it.unit === 'pcs' ? 1 : 0.001} disabled={l.left <= 0} value={qty[l.index] ?? ''} onChange={(e) => setQty({ ...qty, [l.index]: e.target.value })} aria-label={t('Return now')} /></td>
            </tr>
          ))}</tbody>
        </table>
        <div className="grid2">
          <label className="field"><span>{t('Reason')}</span><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('e.g. Damaged pack')} required /></label>
          <label className="field"><span>{t('Refund by')}</span>
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="cash">{payLabel('cash')}</option><option value="card">{payLabel('card')}</option><option value="qr">{payLabel('qr')}</option>
              {sale.member && <option value="credit">{t('Reduce member credit')}</option>}
            </select>
          </label>
        </div>
        <div className="calc-line"><b>{t('Refund {amount}', { amount: money(refund, cur) })}</b></div>
        <div className="row-btns end"><button type="button" className="btn" onClick={onClose}>{t('Cancel')}</button><button className="btn btn-primary btn-lg" disabled={busy || refund <= 0}>{t('Return items')}</button></div>
      </form>
    </Modal>
  );
}
