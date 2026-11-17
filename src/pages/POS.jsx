import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { calcTotals, canManage, useStore } from '../lib/store';
import { isWeighed, money, qtyStr, round2, fmtDateTime, fmtTime } from '../lib/utils';
import { printReceipt } from '../lib/print';
import { beep } from '../lib/sound';
import { Modal, NumPad, applyPadKey, useConfirm, useToast, useScanner, Empty } from '../components/ui';
import { IconBarcode, IconCard, IconCash, IconMinus, IconPause, IconPlus, IconPrinter, IconQr, IconRecall, IconSearch, IconSplit, IconTag, IconTrash, IconUser, IconWallet, IconX } from '../components/Icons';

const keyOf = (p, price) => p.id + '@' + price;

export default function POS() {
  const store = useStore();
  const { products, categories, members, settings, user, held } = store;
  const toast = useToast();
  const confirm = useConfirm();
  const cur = settings.currency;

  const [cart, setCart] = useState([]);
  const [member, setMember] = useState(null);
  const [discount, setDiscount] = useState(null);
  const [query, setQuery] = useState('');
  const [sugIdx, setSugIdx] = useState(0);
  const [cat, setCat] = useState('quick');
  const [flash, setFlash] = useState('');
  const [modal, setModal] = useState(null); // {type, ...}
  const searchRef = useRef(null);
  const listRef = useRef(null);

  const active = useMemo(() => products.filter((p) => p.active), [products]);
  const byCode = useMemo(() => new Map(active.filter((p) => p.barcode).map((p) => [p.barcode, p])), [active]);
  const totals = calcTotals(cart, discount, settings.taxRate);
  const itemCount = cart.reduce((a, it) => a + Number(it.qty), 0);
  const allowDiscount = canManage(user) || settings.operatorDiscount;
  const allowPrice = canManage(user) || settings.operatorPriceChange;

  const focusSearch = useCallback(() => {
    if (!document.querySelector('.modal-back')) searchRef.current?.focus();
    setTimeout(() => { if (!document.querySelector('.modal-back')) searchRef.current?.focus(); }, 30);
  }, []);

  const inCart = (pid) => cart.filter((c) => c.productId === pid).reduce((a, c) => a + Number(c.qty), 0);

  const addProduct = (p, qty = 1, opts = {}) => {
    if (!p) return;
    if (isWeighed(p.unit) && !opts.fromQty) {
      setModal({ type: 'qty', product: p, mode: 'add' });
      return;
    }
    if (p.trackStock && !settings.allowNegativeStock && inCart(p.id) + qty > p.stock) {
      if (settings.beepOnScan) beep(false);
      toast(p.stock <= 0 ? `"${p.name}" is out of stock.` : `Only ${qtyStr(p.stock)} of "${p.name}" in stock.`, 'error');
      return;
    }
    const k = keyOf(p, p.price);
    setCart((c) => {
      const i = c.findIndex((x) => x.key === k);
      if (i >= 0 && !isWeighed(p.unit)) {
        const n = [...c];
        n[i] = { ...n[i], qty: round2(n[i].qty + qty) };
        return [n[i], ...n.filter((_, j) => j !== i)];
      }
      return [{ key: k + (isWeighed(p.unit) ? '#' + Date.now() : ''), productId: p.id, name: p.name, barcode: p.barcode, price: p.price, qty, unit: p.unit }, ...c];
    });
    setFlash(k);
    setTimeout(() => setFlash(''), 600);
    if (settings.beepOnScan) beep(true);
    listRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCode = (raw) => {
    let code = String(raw).trim();
    if (!code) return false;
    let qty = 1;
    const m = code.match(/^(\d+(?:\.\d+)?)\s*[*xX]\s*(.+)$/);
    if (m) { qty = Number(m[1]); code = m[2].trim(); }
    const p = byCode.get(code);
    if (p) {
      addProduct(p, qty, { fromQty: m && isWeighed(p.unit) });
      return true;
    }
    const mem = members.find((x) => x.active && x.serviceNo.toLowerCase() === code.toLowerCase());
    if (mem) {
      pickMember(mem);
      if (settings.beepOnScan) beep(true);
      return true;
    }
    return false;
  };

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^\d+(\.\d+)?\s*[*x]\s*/, '');
    if (!q) return [];
    return active
      .filter((p) => p.name.toLowerCase().includes(q) || (p.barcode && p.barcode.startsWith(q)))
      .slice(0, 8);
  }, [query, active]);

  const onSearchKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSugIdx((i) => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSugIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Escape') { setQuery(''); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const q = query.trim();
      if (!q) return;
      if (handleCode(q)) { setQuery(''); return; }
      if (suggestions.length) {
        const qm = q.match(/^(\d+(?:\.\d+)?)\s*[*xX]/);
        addProduct(suggestions[Math.min(sugIdx, suggestions.length - 1)], qm ? Number(qm[1]) : 1);
        setQuery('');
        return;
      }
      if (settings.beepOnScan) beep(false);
      toast(`No product with barcode or name "${q}".`, 'error');
      setQuery('');
    }
  };

  useEffect(() => setSugIdx(0), [query]);

  const setLineQty = (key, qty) => {
    const line = cart.find((c) => c.key === key);
    const p = products.find((x) => x.id === line?.productId);
    if (qty <= 0) return setCart((c) => c.filter((x) => x.key !== key));
    if (p && p.trackStock && !settings.allowNegativeStock) {
      const others = inCart(p.id) - line.qty;
      if (others + qty > p.stock) {
        toast(`Only ${qtyStr(p.stock)} of "${p.name}" in stock.`, 'error');
        return;
      }
    }
    setCart((c) => c.map((x) => (x.key === key ? { ...x, qty: round2(qty) } : x)));
  };

  const pickMember = (m) => {
    setMember(m);
    if (m && m.discountPct > 0 && !discount) setDiscount({ type: 'pct', value: m.discountPct, auto: true });
    if (!m && discount?.auto) setDiscount(null);
  };

  const clearBill = async (ask = true) => {
    if (ask && cart.length && !(await confirm({ title: 'Clear this bill?', message: `${cart.length} item lines will be removed.`, confirmText: 'Clear bill', danger: true }))) return focusSearch();
    setCart([]);
    setMember(null);
    setDiscount(null);
    setQuery('');
    focusSearch();
  };

  const hold = async () => {
    if (!cart.length) return toast('Nothing to hold. Scan items first.', 'error');
    const label = await confirm({ title: 'Hold this bill', message: 'The bill is saved so you can serve the next person. Recall it later with F6.', input: 'Name or note (optional)', placeholder: 'e.g. Cpl. Perera, getting wallet', confirmText: 'Hold bill' });
    if (label === false) return focusSearch();
    await store.holdBill({ cart, member, discount, label });
    toast('Bill held');
    clearBill(false);
  };

  const recall = async (h) => {
    if (cart.length && !(await confirm({ title: 'Replace the current bill?', message: 'The items on screen will be removed and the held bill opened.', confirmText: 'Open held bill' }))) return;
    setCart(h.cart);
    setMember(h.member ? members.find((m) => m.id === h.member.id) || h.member : null);
    setDiscount(h.discount);
    await store.removeHeld(h.id);
    setModal(null);
    focusSearch();
  };

  const openPay = () => {
    if (!cart.length) return toast('The bill is empty. Scan an item first.', 'error');
    if (settings.requireMemberForSale && !member) {
      toast('Select the member before payment.', 'error');
      return setModal({ type: 'member' });
    }
    setModal({ type: 'pay' });
  };

  const finish = async ({ payments, tendered }) => {
    try {
      const sale = await store.completeSale({ cart, member, discount, payments, tendered });
      setCart([]);
      setMember(null);
      setDiscount(null);
      setModal({ type: 'done', sale });
      if (settings.autoPrint) printReceipt(sale, settings);
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if (document.querySelector('.modal-back')) return;
      const map = { F2: () => focusSearch(), F4: hold, F6: () => setModal({ type: 'held' }), F7: () => setModal({ type: 'member' }), F8: () => clearBill(), F9: openPay };
      if (map[e.key]) { e.preventDefault(); map[e.key](); }
      else if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); openPay(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // backup: catch scans even if the scan box lost focus
  // (always attached; it ignores keys while a window is open, so no scan falls in a gap)
  useScanner((code) => { if (!handleCode(code)) { if (settings.beepOnScan) beep(false); toast(`No product with barcode "${code}".`, 'error'); } });

  // keep the scan box ready for the next scan
  useEffect(() => { if (!modal) focusSearch(); }, [modal, focusSearch]);

  const tiles = useMemo(() => {
    const list = cat === 'quick' ? active.filter((p) => p.quick) : cat === 'all' ? active : active.filter((p) => p.categoryId === cat);
    return list;
  }, [cat, active]);

  const catColor = (id) => categories.find((c) => c.id === id)?.color || '#5B6B4A';
  const memberLive = member ? members.find((m) => m.id === member.id) || member : null;

  return (
    <div className="pos">
      <section className="pos-left">
        <div className="scanbar">
          <IconBarcode size={26} className="scanbar-icon" />
          <input
            ref={searchRef}
            className="scan-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKey}
            placeholder="Scan a barcode or type a product name"
            aria-label="Scan or search products"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd>F2</kbd>
          {suggestions.length > 0 && (
            <ul className="suggest" role="listbox">
              {suggestions.map((p, i) => (
                <li key={p.id} role="option" aria-selected={i === sugIdx} className={i === sugIdx ? 'on' : ''} onMouseDown={(e) => { e.preventDefault(); addProduct(p); setQuery(''); }} onMouseEnter={() => setSugIdx(i)}>
                  <span className="sg-name">{p.name}<small>{p.barcode}</small></span>
                  <span className={`sg-stock ${p.trackStock && p.stock <= 0 ? 'out' : ''}`}>{p.trackStock ? `${qtyStr(p.stock)} ${p.unit}` : 'Service'}</span>
                  <b>{money(p.price, '')}</b>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="cat-strip" role="tablist" aria-label="Product groups">
          <button className={`cat-chip ${cat === 'quick' ? 'on' : ''}`} onClick={() => setCat('quick')}>Quick items</button>
          {categories.map((c) => (
            <button key={c.id} className={`cat-chip ${cat === c.id ? 'on' : ''}`} onClick={() => setCat(c.id)} style={{ '--chip': c.color }}>
              <i style={{ background: c.color }} />{c.name}
            </button>
          ))}
          <button className={`cat-chip ${cat === 'all' ? 'on' : ''}`} onClick={() => setCat('all')}>All</button>
        </div>

        <div className="tiles">
          {tiles.length === 0 && <Empty title="No products here">Mark products as quick items in Products to show them on this screen.</Empty>}
          {tiles.map((p) => {
            const out = p.trackStock && p.stock <= 0 && !settings.allowNegativeStock;
            return (
              <button key={p.id} className={`tile ${out ? 'out' : ''}`} onClick={() => addProduct(p)} disabled={out} style={{ '--cat': catColor(p.categoryId) }}>
                <span className="tile-name">{p.name}</span>
                <span className="tile-foot">
                  <b>{money(p.price, '')}{isWeighed(p.unit) ? <small>/{p.unit}</small> : null}</b>
                  {p.trackStock && <small className={p.stock <= (p.reorderLevel || 0) ? 'low' : ''}>{out ? 'Out of stock' : `${qtyStr(p.stock)} left`}</small>}
                </span>
              </button>
            );
          })}
        </div>
        <div className="hotkeys" aria-label="Keyboard shortcuts">
          <span><kbd>F2</kbd> Scan box</span><span><kbd>F4</kbd> Hold</span><span><kbd>F6</kbd> Recall</span><span><kbd>F7</kbd> Member</span><span><kbd>F8</kbd> Clear</span><span><kbd>F9</kbd> Pay</span><span><kbd>3*</kbd> before a code sells 3</span>
        </div>
      </section>

      <section className="bill" aria-label="Current bill">
        <div className="bill-member">
          {memberLive ? (
            <div className="member-on">
              <div>
                <b>{memberLive.rank} {memberLive.name}</b>
                <small>{memberLive.serviceNo} · {memberLive.type}{memberLive.creditLimit > 0 ? ` · Credit left ${money(memberLive.creditLimit - memberLive.balance, cur)}` : ''}</small>
              </div>
              <button className="icon-btn" onClick={() => pickMember(null)} aria-label="Remove member"><IconX size={18} /></button>
            </div>
          ) : (
            <button className="member-add" onClick={() => setModal({ type: 'member' })}>
              <IconUser size={18} /> Add member <span className="muted">(optional, needed for credit)</span> <kbd>F7</kbd>
            </button>
          )}
        </div>

        <div className="bill-lines" ref={listRef}>
          {cart.length === 0 ? (
            <div className="bill-empty">
              <IconBarcode size={44} />
              <p>Scan an item to start the bill</p>
              {held.length > 0 && <button className="btn" onClick={() => setModal({ type: 'held' })}>{held.length} held bill{held.length > 1 ? 's' : ''} waiting</button>}
            </div>
          ) : (
            cart.map((it) => (
              <div key={it.key} className={`line ${flash && it.key.startsWith(flash) ? 'flash' : ''}`}>
                <div className="line-info">
                  <span className="line-name">{it.name}</span>
                  <button className="line-price" disabled={!allowPrice} onClick={() => setModal({ type: 'price', line: it })} title={allowPrice ? 'Change price for this bill' : ''}>
                    {money(it.price, '')}{it.unit !== 'pcs' ? ` / ${it.unit}` : ''}
                  </button>
                </div>
                <div className="line-qty">
                  <button className="qbtn" onClick={() => setLineQty(it.key, round2(it.qty - (isWeighed(it.unit) ? 0.25 : 1)))} aria-label="Less"><IconMinus size={16} /></button>
                  <button className="qval" onClick={() => setModal({ type: 'qty', line: it, mode: 'edit' })} aria-label="Change quantity">{qtyStr(it.qty)}</button>
                  <button className="qbtn" onClick={() => setLineQty(it.key, round2(it.qty + (isWeighed(it.unit) ? 0.25 : 1)))} aria-label="More"><IconPlus size={16} /></button>
                </div>
                <div className="line-total">{money(round2(it.price * it.qty), '')}</div>
                <button className="icon-btn line-del" onClick={() => setCart((c) => c.filter((x) => x.key !== it.key))} aria-label={`Remove ${it.name}`}><IconTrash size={17} /></button>
              </div>
            ))
          )}
        </div>

        <div className="bill-sum">
          <div className="sum-row"><span>Items</span><span>{cart.length} lines{cart.every((c) => c.unit === 'pcs') ? ` · ${qtyStr(itemCount)} qty` : ''}</span></div>
          <div className="sum-row"><span>Sub total</span><span>{money(totals.subtotal, cur)}</span></div>
          {totals.discount > 0 && <div className="sum-row disc"><span>Discount{discount?.type === 'pct' ? ` ${discount.value}%` : ''}</span><span>-{money(totals.discount, cur)}</span></div>}
          {totals.tax > 0 && <div className="sum-row"><span>Tax {settings.taxRate}%</span><span>{money(totals.tax, cur)}</span></div>}
          <div className="sum-total"><span>Total</span><strong>{money(totals.total, cur)}</strong></div>
        </div>

        <div className="bill-actions">
          <button className="btn act" onClick={hold}><IconPause size={18} />Hold<kbd>F4</kbd></button>
          <button className="btn act" onClick={() => setModal({ type: 'held' })}><IconRecall size={18} />Recall{held.length > 0 && <span className="count">{held.length}</span>}<kbd>F6</kbd></button>
          <button className="btn act" onClick={() => setModal({ type: 'discount' })} disabled={!allowDiscount || !cart.length} title={allowDiscount ? '' : 'Ask a manager to give a discount'}><IconTag size={18} />Discount</button>
          <button className="btn act danger-text" onClick={() => clearBill()} disabled={!cart.length}><IconTrash size={18} />Clear<kbd>F8</kbd></button>
        </div>
        <button className="pay-btn" onClick={openPay} disabled={!cart.length}>
          <span>Pay</span>
          <strong>{money(totals.total, cur)}</strong>
          <kbd>F9</kbd>
        </button>
      </section>

      {modal?.type === 'qty' && (
        <QtyModal
          product={modal.product || products.find((p) => p.id === modal.line.productId) || modal.line}
          initial={modal.line?.qty}
          cur={cur}
          onClose={() => setModal(null)}
          onSave={(q) => {
            if (modal.mode === 'edit') setLineQty(modal.line.key, q);
            else addProduct(modal.product, q, { fromQty: true });
            setModal(null);
          }}
        />
      )}
      {modal?.type === 'price' && (
        <PriceModal line={modal.line} cur={cur} onClose={() => setModal(null)} onSave={(price) => { setCart((c) => c.map((x) => (x.key === modal.line.key ? { ...x, price: round2(price) } : x))); setModal(null); }} />
      )}
      {modal?.type === 'discount' && (
        <DiscountModal discount={discount} subtotal={totals.subtotal} cur={cur} onClose={() => setModal(null)} onSave={(d) => { setDiscount(d); setModal(null); }} />
      )}
      {modal?.type === 'member' && <MemberModal onClose={() => setModal(null)} onPick={(m) => { pickMember(m); setModal(null); }} />}
      {modal?.type === 'held' && (
        <Modal title="Held bills" onClose={() => setModal(null)} width={620}>
          {held.length === 0 ? (
            <Empty title="No held bills">Use Hold (F4) to park a bill and serve the next person.</Empty>
          ) : (
            <div className="held-list">
              {held.map((h) => {
                const t = calcTotals(h.cart, h.discount, settings.taxRate);
                return (
                  <div key={h.id} className="held-row">
                    <div>
                      <b>{h.label || h.member?.name || 'Held bill'}</b>
                      <small>{fmtTime(h.ts)} · {h.cart.length} lines · by {h.userName}</small>
                    </div>
                    <strong>{money(t.total, cur)}</strong>
                    <button className="btn btn-primary" onClick={() => recall(h)}>Open</button>
                    <button className="icon-btn" aria-label="Delete held bill" onClick={async () => { if (await confirm({ title: 'Delete this held bill?', confirmText: 'Delete', danger: true })) store.removeHeld(h.id); }}><IconTrash size={18} /></button>
                  </div>
                );
              })}
            </div>
          )}
        </Modal>
      )}
      {modal?.type === 'pay' && <PayModal totals={totals} member={memberLive} cur={cur} onClose={() => setModal(null)} onPay={finish} />}
      {modal?.type === 'done' && (
        <DoneModal
          sale={modal.sale}
          onClose={(scanned) => {
            setModal(null);
            searchRef.current?.focus();
            if (scanned && !handleCode(scanned)) toast(`No product with barcode "${scanned}".`, 'error');
          }}
        />
      )}
    </div>
  );
}

// ---------------- modals ----------------

function QtyModal({ product, initial, cur, onClose, onSave }) {
  const weighed = isWeighed(product.unit);
  const [mode, setMode] = useState('qty');
  const [val, setVal] = useState(initial != null ? String(initial) : '');
  const inRef = useRef(null);
  const pick = (m) => { setMode(m); setVal(''); inRef.current?.focus(); };
  const q = mode === 'qty' ? Number(val) : product.price > 0 ? round2(Number(val) / product.price * 1000) / 1000 : 0;
  const ok = q > 0 && (weighed || Number.isInteger(q));
  const submit = (e) => { e?.preventDefault(); if (ok) onSave(round2(q * 1000) / 1000); };
  return (
    <Modal title={product.name} onClose={onClose} width={400}>
      <form onSubmit={submit} className="stack">
        {weighed && (
          <div className="seg">
            <button type="button" className={mode === 'qty' ? 'on' : ''} onClick={() => pick('qty')}>By {product.unit}</button>
            <button type="button" className={mode === 'amt' ? 'on' : ''} onClick={() => pick('amt')}>By amount</button>
          </div>
        )}
        <label className="field">
          <span>{mode === 'qty' ? `Quantity (${product.unit})` : `Amount (${cur})`}</span>
          <input ref={inRef} className="big-input" inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value.replace(/[^\d.]/g, ''))} data-autofocus />
        </label>
        <NumPad onKey={(k) => setVal((v) => applyPadKey(v, k))} />
        <div className="calc-line">{qtyStr(q || 0)} {product.unit} × {money(product.price, '')} = <b>{money(round2((q || 0) * product.price), cur)}</b></div>
        {!weighed && val && !Number.isInteger(Number(val)) && <div className="form-error">This item is sold in whole units.</div>}
        <button className="btn btn-primary btn-lg" disabled={!ok}>Add to bill</button>
      </form>
    </Modal>
  );
}

function PriceModal({ line, cur, onClose, onSave }) {
  const [val, setVal] = useState(String(line.price));
  const submit = (e) => { e.preventDefault(); if (Number(val) >= 0 && val !== '') onSave(Number(val)); };
  return (
    <Modal title={`Price for ${line.name}`} onClose={onClose} width={380}>
      <form onSubmit={submit} className="stack">
        <p className="muted">Changes the price on this bill only. To change it for good, edit the product.</p>
        <label className="field"><span>Unit price ({cur})</span><input className="big-input" inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value.replace(/[^\d.]/g, ''))} data-autofocus /></label>
        <NumPad onKey={(k) => setVal((v) => applyPadKey(v, k))} />
        <button className="btn btn-primary btn-lg">Use this price</button>
      </form>
    </Modal>
  );
}

function DiscountModal({ discount, subtotal, cur, onClose, onSave }) {
  const [type, setType] = useState(discount?.type || 'amt');
  const [val, setVal] = useState(discount ? String(discount.value) : '');
  const inRef = useRef(null);
  const pick = (t) => { setType(t); inRef.current?.focus(); };
  const amount = type === 'pct' ? round2(subtotal * Math.min(100, Number(val) || 0) / 100) : Math.min(Number(val) || 0, subtotal);
  const invalid = type === 'pct' ? Number(val) > 100 : Number(val) > subtotal;
  return (
    <Modal title="Bill discount" onClose={onClose} width={400}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); if (!invalid) onSave(Number(val) > 0 ? { type, value: Number(val) } : null); }}>
        <div className="seg">
          <button type="button" className={type === 'amt' ? 'on' : ''} onClick={() => pick('amt')}>Amount ({cur})</button>
          <button type="button" className={type === 'pct' ? 'on' : ''} onClick={() => pick('pct')}>Percent (%)</button>
        </div>
        <label className="field"><span>{type === 'pct' ? 'Discount %' : `Discount ${cur}`}</span><input ref={inRef} className="big-input" inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value.replace(/[^\d.]/g, ''))} data-autofocus /></label>
        <NumPad onKey={(k) => setVal((v) => applyPadKey(v, k))} />
        <div className="calc-line">Discount <b>{money(amount, cur)}</b> on {money(subtotal, cur)}</div>
        {invalid && <div className="form-error">The discount is more than the bill.</div>}
        <div className="row-btns">
          {discount && <button type="button" className="btn" onClick={() => onSave(null)}>Remove discount</button>}
          <button className="btn btn-primary btn-lg grow" disabled={invalid}>Apply discount</button>
        </div>
      </form>
    </Modal>
  );
}

export function MemberModal({ onClose, onPick }) {
  const { members, settings, saveMember, user } = useStore();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ serviceNo: '', rank: '', name: '', type: settings.memberTypes[2] || '', unit: '', creditLimit: 0 });
  const list = members.filter((m) => m.active && (!q || `${m.serviceNo} ${m.name} ${m.rank} ${m.unit}`.toLowerCase().includes(q.toLowerCase()))).slice(0, 40);
  const onKey = (e) => {
    if (e.key === 'Enter' && list.length) {
      e.preventDefault();
      const exact = list.find((m) => m.serviceNo.toLowerCase() === q.trim().toLowerCase());
      onPick(exact || list[0]);
    }
  };
  const add = async (e) => {
    e.preventDefault();
    try {
      const m = await saveMember(form);
      toast('Member added');
      onPick(m);
    } catch (ex) { toast(ex.message, 'error'); }
  };
  return (
    <Modal title={adding ? 'New member' : 'Select member'} onClose={onClose} width={620}>
      {!adding ? (
        <div className="stack">
          <input className="big-input" placeholder="Service number, name or rank (or scan the ID card)" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} data-autofocus />
          <div className="member-list">
            {list.length === 0 && <Empty title="No member found">Check the service number, or add a new member.</Empty>}
            {list.map((m) => (
              <button key={m.id} className="member-row" onClick={() => onPick(m)}>
                <span><b>{m.rank} {m.name}</b><small>{m.serviceNo} · {m.type}{m.unit ? ' · ' + m.unit : ''}</small></span>
                <span className="member-bal">{m.balance > 0 ? <>Owes <b>{money(m.balance, settings.currency)}</b></> : <small>No balance</small>}</span>
              </button>
            ))}
          </div>
          {canManage(user) && <button className="btn" onClick={() => setAdding(true)}><IconPlus size={16} /> Add a new member</button>}
        </div>
      ) : (
        <form className="grid2" onSubmit={add}>
          <label className="field"><span>Service number</span><input value={form.serviceNo} onChange={(e) => setForm({ ...form, serviceNo: e.target.value })} data-autofocus required /></label>
          <label className="field"><span>Rank</span><input value={form.rank} onChange={(e) => setForm({ ...form, rank: e.target.value })} placeholder="e.g. Cpl." /></label>
          <label className="field wide"><span>Name</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label className="field"><span>Type</span><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{settings.memberTypes.map((t) => <option key={t}>{t}</option>)}</select></label>
          <label className="field"><span>Credit limit ({settings.currency})</span><input inputMode="decimal" value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: e.target.value.replace(/[^\d.]/g, '') })} /></label>
          <div className="row-btns wide"><button type="button" className="btn" onClick={() => setAdding(false)}>Back</button><button className="btn btn-primary grow">Save and use</button></div>
        </form>
      )}
    </Modal>
  );
}

const METHODS = [
  { id: 'cash', label: 'Cash', icon: IconCash },
  { id: 'card', label: 'Card', icon: IconCard },
  { id: 'qr', label: 'QR / Online', icon: IconQr },
  { id: 'credit', label: 'Member credit', icon: IconWallet },
  { id: 'split', label: 'Split', icon: IconSplit },
];

function PayModal({ totals, member, cur, onClose, onPay }) {
  const [method, setMethod] = useState('cash');
  const [given, setGiven] = useState('');
  const [split, setSplit] = useState({ cash: '', card: '', qr: '', credit: '' });
  const [splitField, setSplitField] = useState('cash');
  const [busy, setBusy] = useState(false);
  const rightRef = useRef(null);
  useEffect(() => {
    const el = rightRef.current?.querySelector('input') || rightRef.current?.querySelector('button.btn-primary');
    el?.focus();
  }, [method]);
  const total = totals.total;
  const avail = member && member.creditLimit > 0 ? round2(member.creditLimit - member.balance) : 0;

  const givenN = given === '' ? total : Number(given);
  const change = round2(givenN - total);
  const splitSum = round2(Object.values(split).reduce((a, v) => a + (Number(v) || 0), 0));
  const remain = round2(total - splitSum);

  let error = '';
  if (method === 'cash' && givenN < total) error = 'Cash given is less than the total.';
  if (method === 'credit') {
    if (!member) error = 'Add a member to the bill to use credit.';
    else if (!(member.creditLimit > 0)) error = 'This member has no credit limit.';
    else if (total > avail) error = `Not enough credit. Available: ${money(avail, cur)}`;
  }
  if (method === 'split') {
    if (Math.abs(remain) > 0.009) error = remain > 0 ? `${money(remain, cur)} still to pay.` : `Over by ${money(-remain, cur)}.`;
    else if (Number(split.credit) > 0 && (!member || Number(split.credit) > avail)) error = member ? `Not enough credit. Available: ${money(avail, cur)}` : 'Add a member to the bill to use credit.';
  }

  const quick = useMemo(() => {
    const set = new Set([total]);
    [100, 500, 1000, 5000].forEach((n) => { const v = Math.ceil(total / n) * n; if (v >= total) set.add(v); });
    return [...set].sort((a, b) => a - b).slice(0, 5);
  }, [total]);

  const submit = async (e) => {
    e?.preventDefault();
    if (error || busy) return;
    setBusy(true);
    let payments, tendered = 0;
    if (method === 'split') {
      payments = Object.entries(split).filter(([, v]) => Number(v) > 0).map(([m, v]) => ({ method: m, amount: round2(v) }));
      tendered = Number(split.cash) || 0;
    } else {
      payments = [{ method, amount: total }];
      if (method === 'cash') tendered = givenN;
    }
    await onPay({ payments, tendered });
    setBusy(false);
  };

  const pad = (k) => {
    if (method === 'cash') setGiven((v) => applyPadKey(v, k));
    else if (method === 'split') setSplit((s) => ({ ...s, [splitField]: applyPadKey(s[splitField], k) }));
  };

  return (
    <Modal title="Take payment" onClose={onClose} width={760} className="pay-modal">
      <form onSubmit={submit} className="pay">
        <div className="pay-left">
          <div className="pay-due"><span>Amount due</span><strong>{money(total, cur)}</strong></div>
          <div className="pay-methods" role="radiogroup" aria-label="Payment method">
            {METHODS.map((m) => (
              <button type="button" key={m.id} role="radio" aria-checked={method === m.id} className={`pm ${method === m.id ? 'on' : ''}`} onClick={() => setMethod(m.id)}>
                <m.icon size={22} />{m.label}
              </button>
            ))}
          </div>
          {member && (
            <div className="pay-member">
              <b>{member.rank} {member.name}</b> · {member.serviceNo}
              {member.creditLimit > 0 ? <span>Credit available {money(avail, cur)}</span> : <span>No credit limit</span>}
            </div>
          )}
        </div>
        <div className="pay-right" ref={rightRef}>
          {method === 'cash' && (
            <>
              <label className="field"><span>Cash given ({cur})</span><input className="big-input" inputMode="decimal" placeholder={money(total, '')} value={given} onChange={(e) => setGiven(e.target.value.replace(/[^\d.]/g, ''))} data-autofocus /></label>
              <div className="quick-cash">{quick.map((v) => <button type="button" key={v} className="btn" onClick={() => setGiven(String(v))}>{v === total ? 'Exact' : money(v, '')}</button>)}</div>
              <NumPad onKey={pad} />
              <div className={`change ${change < 0 ? 'neg' : ''}`}><span>Change</span><strong>{money(Math.max(change, 0), cur)}</strong></div>
            </>
          )}
          {(method === 'card' || method === 'qr') && (
            <div className="pay-note">
              <p>Charge <b>{money(total, cur)}</b> on the {method === 'card' ? 'card machine' : 'QR / online payment'}, then confirm here when it is approved.</p>
            </div>
          )}
          {method === 'credit' && (
            <div className="pay-note">
              {member ? <p><b>{money(total, cur)}</b> will be added to {member.name}'s account. Balance after this bill: <b>{money(round2(member.balance + total), cur)}</b>.</p> : <p>Close this window and add the member with F7 first.</p>}
            </div>
          )}
          {method === 'split' && (
            <>
              {['cash', 'card', 'qr', 'credit'].map((k) => (
                <label key={k} className={`field split-field ${splitField === k ? 'on' : ''}`}>
                  <span>{METHODS.find((m) => m.id === k).label}</span>
                  <input inputMode="decimal" value={split[k]} onFocus={() => setSplitField(k)} onChange={(e) => setSplit({ ...split, [k]: e.target.value.replace(/[^\d.]/g, '') })} data-autofocus={k === 'cash' || undefined} />
                </label>
              ))}
              <button type="button" className="btn" onClick={() => setSplit((s) => ({ ...s, [splitField]: String(round2((Number(s[splitField]) || 0) + remain)) }))} disabled={remain <= 0}>Put the remaining {money(Math.max(remain, 0), '')} here</button>
              <NumPad onKey={pad} />
            </>
          )}
          {error && <div className="form-error">{error}</div>}
          <button className="btn btn-primary btn-xl" disabled={!!error || busy}>{busy ? 'Saving…' : `Complete sale (Enter)`}</button>
        </div>
      </form>
    </Modal>
  );
}

function DoneModal({ sale, onClose }) {
  const { settings } = useStore();
  const cur = settings.currency;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    // Enter starts the next bill. A scan here goes straight onto the next bill.
    let buf = '', last = 0;
    const onKey = (e) => {
      const now = performance.now();
      if (now - last > 80) buf = '';
      last = now;
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current(buf.length >= 3 ? buf : undefined);
        buf = '';
      } else if (e.key.length === 1) buf += e.key;
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  return (
    <Modal title="Sale complete" onClose={() => onClose()} width={480} className="done-modal">
      <div className="done">
        {sale.change > 0 ? (
          <div className="done-change"><span>Give change</span><strong>{money(sale.change, cur)}</strong></div>
        ) : (
          <div className="done-change paid"><span>Paid</span><strong>{money(sale.total, cur)}</strong></div>
        )}
        <p className="muted">Bill {sale.billNo} · {fmtDateTime(sale.ts)}{settings.autoPrint ? ' · Receipt sent to printer' : ''}</p>
        <div className="row-btns">
          <button className="btn btn-lg" onClick={() => printReceipt(sale, settings, { copy: settings.autoPrint })}><IconPrinter size={18} />{settings.autoPrint ? 'Print again' : 'Print receipt'}</button>
          <button className="btn btn-primary btn-lg grow" onClick={() => onClose()} data-autofocus>New bill (Enter)</button>
        </div>
      </div>
    </Modal>
  );
}
