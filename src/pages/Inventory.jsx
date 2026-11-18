import { t } from '../lib/i18n';
import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { addDays, dayKey, download, endOfDay, fmtDateTime, isWeighed, money, qtyStr, round2, startOfDay, toCSV } from '../lib/utils';
import { printA4 } from '../lib/print';
import { beep } from '../lib/sound';
import { Badge, Empty, Tabs, useConfirm, useToast } from '../components/ui';
import { IconBarcode, IconDownload, IconPrinter, IconTrash } from '../components/Icons';

export function ProductPicker({ onPick, placeholder = 'Scan a barcode or type a product name', autoFocus }) {
  const { products } = useStore();
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const toast = useToast();
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return products.filter((p) => p.name.toLowerCase().includes(s) || (p.barcode || '').startsWith(s)).slice(0, 8);
  }, [q, products]);
  const pick = (p) => { onPick(p); setQ(''); setIdx(0); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const exact = products.find((p) => p.barcode && p.barcode === q.trim());
      if (exact) { beep(true); return pick(exact); }
      if (list.length) return pick(list[Math.min(idx, list.length - 1)]);
      if (q.trim()) { beep(false); toast(t('No product with barcode or name "{q}". Add it in Products first.', { q: q.trim() }), 'error'); setQ(''); }
    }
  };
  return (
    <div className="scanbar small">
      <IconBarcode size={22} className="scanbar-icon" />
      <input className="scan-input" value={q} onChange={(e) => { setQ(e.target.value); setIdx(0); }} onKeyDown={onKey} placeholder={placeholder} autoFocus={autoFocus} autoComplete="off" />
      {list.length > 0 && (
        <ul className="suggest">
          {list.map((p, i) => (
            <li key={p.id} className={i === idx ? 'on' : ''} onMouseDown={(e) => { e.preventDefault(); pick(p); }} onMouseEnter={() => setIdx(i)}>
              <span className="sg-name">{p.name}<small>{p.barcode}</small></span>
              <span className="sg-stock">{p.trackStock ? `${qtyStr(p.stock)} ${p.unit}` : t("Not tracked")}</span>
              <b>{money(p.price, '')}</b>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Inventory() {
  const { products } = useStore();
  const [tab, setTab] = useState('receive');
  const lowCount = products.filter((p) => p.active && p.trackStock && p.stock <= p.reorderLevel).length;
  return (
    <div className="page">
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'receive', label: t("Receive goods") },
        { id: 'adjust', label: t("Adjust stock") },
        { id: 'reorder', label: t("Reorder list"), count: lowCount || null },
        { id: 'history', label: t("Stock history") },
      ]} />
      {tab === 'receive' && <Receive />}
      {tab === 'adjust' && <Adjust />}
      {tab === 'reorder' && <Reorder />}
      {tab === 'history' && <History />}
    </div>
  );
}

function Receive() {
  const { receiveStock, settings, user } = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const [lines, setLines] = useState([]);
  const [supplier, setSupplier] = useState('');
  const [ref, setRef] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const add = (p) => {
    if (!p.trackStock) return toast(`"${p.name}" does not track stock.`, 'error');
    setLines((ls) => {
      const i = ls.findIndex((l) => l.productId === p.id);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, qty: String(round2(Number(l.qty || 0) + 1)) } : l));
      return [{ productId: p.id, name: p.name, unit: p.unit, qty: '1', cost: String(p.cost || ''), price: '', oldPrice: p.price, stock: p.stock }, ...ls];
    });
  };
  const upd = (i, k, v) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v.replace(/[^\d.]/g, '') } : l)));
  const total = lines.reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.cost) || 0), 0);

  const save = async () => {
    setBusy(true);
    try {
      const grn = await receiveStock({ lines, supplier, ref, note });
      toast(t('Stock received ({ref})', { ref: grn }));
      const printLines = lines;
      setLines([]); setSupplier(''); setRef(''); setNote('');
      if (await confirm({ title: t("Stock saved"), message: t('Received stock is saved as {ref}. Print a goods received note for the file?', { ref: grn }), confirmText: t("Print note") })) {
        printA4({
          title: t("Goods received note"), subtitle: `${grn} · ${fmtDateTime(Date.now())}`, settings,
          sections: [
            { title: 'Details', kv: [['Supplier', supplier || '—'], ['Reference', grn], ['Received by', user.name], ['Note', note || '—']] },
            { title: t("Items"), columns: [{ label: t("Product") }, { label: t("Qty"), num: true }, { label: t("Unit cost"), num: true }, { label: t("Value"), num: true }],
              rows: printLines.map((l) => [l.name, `${qtyStr(Number(l.qty))} ${l.unit}`, money(l.cost, ''), money((Number(l.qty) || 0) * (Number(l.cost) || 0), '')]),
              foot: ['Total', '', '', money(total, settings.currency)] },
          ],
        });
      }
    } catch (e) { toast(e.message, 'error'); }
    setBusy(false);
  };

  return (
    <div className="panel">
      <div className="grid3">
        <label className="field"><span>{t("Supplier")}</span><input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder={t("e.g. CSD warehouse")} /></label>
        <label className="field"><span>{t("Invoice or delivery no.")}</span><input value={ref} onChange={(e) => setRef(e.target.value)} placeholder={t("Leave empty to number it automatically")} /></label>
        <label className="field"><span>{t("Note")}</span><input value={note} onChange={(e) => setNote(e.target.value)} /></label>
      </div>
      <ProductPicker onPick={add} placeholder={t("Scan each item as you unpack it, or type the name")} autoFocus />
      {lines.length === 0 ? (
        <Empty title={t("No items yet")}>{t("Scan an item to add it. Scanning the same item again adds one more.")}</Empty>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>{t("Product")}</th><th className="n">{t("In stock")}</th><th className="n">{t("Qty received")}</th><th className="n">{t("Unit cost")}</th><th className="n">{t("New selling price")}</th><th className="n">{t("Value")}</th><th></th></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.productId}>
                  <td><b>{l.name}</b></td>
                  <td className="n">{qtyStr(l.stock)} {l.unit}</td>
                  <td className="n"><input className="cell-input" inputMode="decimal" value={l.qty} onChange={(e) => upd(i, 'qty', e.target.value)} /></td>
                  <td className="n"><input className="cell-input" inputMode="decimal" value={l.cost} onChange={(e) => upd(i, 'cost', e.target.value)} /></td>
                  <td className="n"><input className="cell-input" inputMode="decimal" value={l.price} placeholder={money(l.oldPrice, '')} onChange={(e) => upd(i, 'price', e.target.value)} /></td>
                  <td className="n">{money((Number(l.qty) || 0) * (Number(l.cost) || 0), '')}</td>
                  <td><button className="icon-btn" aria-label={t("Remove line")} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}><IconTrash size={17} /></button></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={5}>{t("Total value")}</td><td className="n b">{money(total, settings.currency)}</td><td></td></tr></tfoot>
          </table>
        </div>
      )}
      <div className="row-btns end">
        {lines.length > 0 && <button className="btn" onClick={() => setLines([])}>{t("Clear")}</button>}
        <button className="btn btn-primary btn-lg" disabled={!lines.length || busy} onClick={save}>{t("Save received stock")}</button>
      </div>
    </div>
  );
}

const REASONS = ['Stock count correction', 'Damaged', 'Expired', 'Lost or missing', 'Returned to supplier', 'Used in the unit', 'Other'];

function Adjust() {
  const { adjustStock, products } = useStore();
  const toast = useToast();
  const [pid, setPid] = useState(null);
  const [mode, setMode] = useState('remove');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState(REASONS[1]);
  const [note, setNote] = useState('');
  const p = products.find((x) => x.id === pid);
  const after = p ? (mode === 'set' ? Number(qty) : round2(p.stock + (mode === 'remove' ? -1 : 1) * Math.abs(Number(qty) || 0))) : 0;
  const save = async (e) => {
    e.preventDefault();
    try {
      await adjustStock({ productId: pid, mode, qty, reason, note });
      toast(t("Stock updated"));
      setQty(''); setNote(''); setPid(null);
    } catch (ex) { toast(ex.message, 'error'); }
  };
  return (
    <div className="panel narrow">
      <ProductPicker onPick={(x) => setPid(x.id)} autoFocus />
      {!p ? <Empty title={t("Choose a product")}>{t("Scan or search for the product you want to correct.")}</Empty> : (
        <form className="stack" onSubmit={save}>
          <div className="adj-head"><b>{p.name}</b><span><b>{t('In stock now: {qty}', { qty: qtyStr(p.stock) + ' ' + p.unit })}</b></span></div>
          <div className="seg">
            <button type="button" className={mode === 'remove' ? 'on' : ''} onClick={() => setMode('remove')}>{t("Remove")}</button>
            <button type="button" className={mode === 'add' ? 'on' : ''} onClick={() => setMode('add')}>{t("Add")}</button>
            <button type="button" className={mode === 'set' ? 'on' : ''} onClick={() => { setMode('set'); setReason(REASONS[0]); }}>{t("Set counted amount")}</button>
          </div>
          <div className="grid2">
            <label className="field"><span>{mode === 'set' ? t('Counted on the shelf ({unit})', { unit: p.unit }) : t('Quantity ({unit})', { unit: p.unit })}</span><input className="big-input" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d.]/g, ''))} required /></label>
            <label className="field"><span>{t("Reason")}</span><select value={reason} onChange={(e) => setReason(e.target.value)}>{REASONS.map((r) => <option key={r} value={r}>{t(r)}</option>)}</select></label>
            <label className="field wide"><span>{t("Note")}</span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Optional details")} /></label>
          </div>
          {qty !== '' && <div className="calc-line"><b>{t('Stock after saving: {qty}', { qty: qtyStr(after) + ' ' + p.unit })}</b> ({after - p.stock >= 0 ? '+' : ''}{qtyStr(round2(after - p.stock))})</div>}
          {!isWeighed(p.unit) && qty && !Number.isInteger(Number(qty)) && <div className="form-error">{t("Use whole numbers for this item.")}</div>}
          <button className="btn btn-primary btn-lg" disabled={qty === '' || (!isWeighed(p.unit) && !Number.isInteger(Number(qty)))}>{t("Save adjustment")}</button>
        </form>
      )}
    </div>
  );
}

function Reorder() {
  const { products, categories, settings } = useStore();
  const list = products.filter((p) => p.active && p.trackStock && p.stock <= p.reorderLevel).sort((a, b) => a.stock - b.stock);
  const cat = (id) => categories.find((c) => c.id === id)?.name || '';
  const suggest = (p) => Math.max(Math.ceil(p.reorderLevel * 2 - p.stock), 1);
  const print = () => printA4({
    title: t("Reorder list"), subtitle: fmtDateTime(Date.now()), settings,
    sections: [{ title: `${list.length} items at or below their warning level`, columns: [{ label: t("Product") }, { label: t("Barcode") }, { label: t("Category") }, { label: t("In stock"), num: true }, { label: t("Warn at"), num: true }, { label: t("Suggested order"), num: true }, { label: 'Ordered' }],
      rows: list.map((p) => [p.name, p.barcode, cat(p.categoryId), qtyStr(p.stock), qtyStr(p.reorderLevel), `${suggest(p)} ${p.unit}`, '']) }],
  });
  return (
    <div className="panel">
      <div className="row-btns end">
        <button className="btn" onClick={() => download(`reorder-${dayKey()}.csv`, toCSV(list, [{ label: t("Product"), value: 'name' }, { label: t("Barcode"), value: 'barcode' }, { label: t("Stock"), value: 'stock' }, { label: t("Warn at"), value: 'reorderLevel' }, { label: t("Suggested order"), value: suggest }]))}><IconDownload size={17} />{t("Export")}</button>
        <button className="btn btn-primary" onClick={print} disabled={!list.length}><IconPrinter size={17} />{t("Print reorder list")}</button>
      </div>
      {list.length === 0 ? <Empty title={t("Nothing needs reordering")}>{t("Every product is above its warning level.")}</Empty> : (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>{t("Product")}</th><th>{t("Category")}</th><th className="n">{t("In stock")}</th><th className="n">{t("Warn at")}</th><th className="n">{t("Suggested order")}</th></tr></thead>
            <tbody>{list.map((p) => <tr key={p.id}><td><b>{p.name}</b><small className="mono">{p.barcode}</small></td><td>{cat(p.categoryId)}</td><td className="n"><Badge tone={p.stock <= 0 ? 'bad' : 'warn'}>{qtyStr(p.stock)} {p.unit}</Badge></td><td className="n">{qtyStr(p.reorderLevel)}</td><td className="n b">{suggest(p)} {p.unit}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const TYPE = { sale: ['Sale', 'neutral'], void: ['Void return', 'warn'], in: ['Received', 'ok'], adjust: ['Adjustment', 'bad'], return: ['Customer return', 'ok'] };

function History() {
  const { stockMoves } = useStore();
  const [from, setFrom] = useState(addDays(dayKey(), -6));
  const [to, setTo] = useState(dayKey());
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(200);
  const list = useMemo(() => {
    const a = startOfDay(from), b = endOfDay(to), s = q.toLowerCase();
    return stockMoves.filter((m) => m.ts >= a && m.ts <= b && (!type || m.type === type) && (!s || m.productName.toLowerCase().includes(s) || (m.ref || '').toLowerCase().includes(s)));
  }, [stockMoves, from, to, type, q]);
  const exportCSV = () => download(`stock-history-${from}-to-${to}.csv`, toCSV(list, [
    { label: t("Date"), value: (m) => fmtDateTime(m.ts) }, { label: t("Product"), value: 'productName' }, { label: t("Type"), value: (m) => t(TYPE[m.type]?.[0]) }, { label: t("Qty"), value: 'qty' }, { label: t("Reference"), value: 'ref' }, { label: t("Supplier"), value: 'supplier' }, { label: t("Note"), value: 'note' }, { label: t("By"), value: 'userName' },
  ]));
  return (
    <div className="panel">
      <div className="toolbar">
        <label className="inline">{t("From")} <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="inline">{t("To")} <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label={t("Type")}><option value="">{t("All movements")}</option>{Object.entries(TYPE).map(([k, v]) => <option key={k} value={k}>{t(v[0])}</option>)}</select>
        <input placeholder={t("Product or reference")} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="toolbar-spacer" />
        <button className="btn" onClick={exportCSV}><IconDownload size={17} />{t("Export")}</button>
      </div>
      {list.length === 0 ? <Empty title={t("No stock movements in this period")} /> : (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>{t("Date")}</th><th>{t("Product")}</th><th>{t("Type")}</th><th className="n">{t("Qty")}</th><th>{t("Reference")}</th><th>{t("By")}</th></tr></thead>
            <tbody>{list.slice(0, limit).map((m) => (
              <tr key={m.id}><td>{fmtDateTime(m.ts)}</td><td>{m.productName}</td><td><Badge tone={TYPE[m.type]?.[1]}>{t(TYPE[m.type]?.[0])}</Badge></td><td className={`n b ${m.qty < 0 ? 'neg' : 'plus'}`}>{m.qty > 0 ? '+' : ''}{qtyStr(m.qty)}</td><td>{t(m.ref)}{m.supplier ? ` · ${m.supplier}` : ''}{m.note ? <small>{m.note}</small> : null}</td><td>{m.userName}</td></tr>
            ))}</tbody>
          </table>
          {list.length > limit && <div className="more"><button className="btn" onClick={() => setLimit((l) => l + 500)}>{t("Show more")}</button></div>}
        </div>
      )}
    </div>
  );
}
