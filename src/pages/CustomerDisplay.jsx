import { useEffect, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { money, qtyStr } from '../lib/utils';

// A second screen that faces the buyer. It always shows both Sinhala and
// English, so every buyer can follow the bill as it is scanned. It shows
// only the bill being served now: nothing else from the system.
const CH = 'wcpos-customer-display';

export function openCustomerDisplay() {
  window.open(`${location.origin}${location.pathname}#display`, 'wcpos-display', 'popup=yes,width=1100,height=720');
}

export function useDisplayFeed() {
  const ch = useRef(null);
  const last = useRef('');
  const state = useRef({ type: 'idle' });
  const doneUntil = useRef(0);
  useEffect(() => {
    if (!('BroadcastChannel' in window)) return undefined;
    const c = new BroadcastChannel(CH);
    ch.current = c;
    c.onmessage = (ev) => { if (ev.data?.type === 'hello') c.postMessage(state.current); };
    return () => c.close();
  }, []);
  const send = (msg) => {
    state.current = msg;
    const j = JSON.stringify(msg);
    if (j === last.current) return;
    last.current = j;
    ch.current?.postMessage(msg);
  };
  return {
    bill: ({ cart, member, totals, cur }) => {
      if (!cart.length) {
        if (Date.now() < doneUntil.current) return;
        return send({ type: 'idle' });
      }
      doneUntil.current = 0;
      send({
        type: 'bill', cur,
        items: cart.map((it) => ({ name: it.name, nameSi: it.nameSi || '', qty: it.qty, unit: it.unit, price: it.price, lineTotal: Math.round(it.price * it.qty * 100) / 100 })),
        member: member ? `${member.rank || ''} ${member.name}`.trim() : '',
        subtotal: totals.subtotal, discount: totals.discount, tax: totals.tax, total: totals.total,
      });
    },
    done: (sale) => {
      doneUntil.current = Date.now() + 20000;
      send({ type: 'done', total: sale.total, tendered: sale.tendered, change: sale.change, credit: sale.payments?.some((p) => p.method === 'credit') });
    },
  };
}

export default function CustomerDisplay() {
  const { settings } = useStore();
  const [msg, setMsg] = useState({ type: 'idle' });
  const timer = useRef(null);
  const cur = settings.currency || 'Rs.';

  useEffect(() => {
    document.title = 'Customer display';
    if (!('BroadcastChannel' in window)) return undefined;
    const c = new BroadcastChannel(CH);
    c.onmessage = (ev) => {
      const m = ev.data;
      if (!m || m.type === 'hello') return;
      setMsg(m);
      clearTimeout(timer.current);
      if (m.type === 'done') timer.current = setTimeout(() => setMsg({ type: 'idle' }), 20000);
    };
    c.postMessage({ type: 'hello' });
    return () => { clearTimeout(timer.current); c.close(); };
  }, []);

  const full = () => { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {}); };

  return (
    <div className="cd" onDoubleClick={full}>
      <header className="cd-head">
        <img src={settings.logo || '/icon.svg'} alt="" />
        <div>
          {settings.canteenNameSi && <b className="cd-si">{settings.canteenNameSi}</b>}
          <span>{settings.canteenName}</span>
        </div>
      </header>

      {msg.type === 'bill' && (
        <main className="cd-bill">
          <section className="cd-items" aria-live="polite">
            {msg.items.map((it, i) => (
              <div key={i} className={`cd-line ${i === 0 ? 'new' : ''}`}>
                <div className="cd-name">
                  {it.nameSi ? <><b>{it.nameSi}</b><small>{it.name}</small></> : <b>{it.name}</b>}
                </div>
                <div className="cd-qty">{qtyStr(it.qty)}{it.unit !== 'pcs' ? ' ' + it.unit : ''} × {money(it.price, '')}</div>
                <div className="cd-amt">{money(it.lineTotal, '')}</div>
              </div>
            ))}
          </section>
          <aside className="cd-total">
            {msg.member && <div className="cd-member">{msg.member}</div>}
            <dl>
              <div><dt>උප එකතුව <small>Sub total</small></dt><dd>{money(msg.subtotal, '')}</dd></div>
              {msg.discount > 0 && <div><dt>වට්ටම <small>Discount</small></dt><dd>-{money(msg.discount, '')}</dd></div>}
              {msg.tax > 0 && <div><dt>බද්ද <small>Tax</small></dt><dd>{money(msg.tax, '')}</dd></div>}
            </dl>
            <div className="cd-grand">
              <span>මුළු මුදල <small>Total</small></span>
              <strong>{money(msg.total, cur)}</strong>
            </div>
            <div className="cd-count">භාණ්ඩ / Items: {msg.items.length}</div>
          </aside>
        </main>
      )}

      {msg.type === 'done' && (
        <main className="cd-center">
          <h1>ස්තූතියි <small>Thank you</small></h1>
          <p className="cd-paid">ගෙවූ මුදල / Paid: <b>{money(msg.tendered > 0 ? msg.tendered : msg.total, cur)}</b></p>
          {msg.change > 0 && (
            <div className="cd-change"><span>ඔබේ ඉතිරි මුදල <small>Your change</small></span><strong>{money(msg.change, cur)}</strong></div>
          )}
          {msg.credit && <p className="cd-paid">සාමාජික ණය ගිණුමට එකතු කරන ලදී / Added to your credit account</p>}
        </main>
      )}

      {msg.type === 'idle' && (
        <main className="cd-center">
          <h1>සාදරයෙන් පිළිගනිමු <small>Welcome</small></h1>
          <p className="cd-paid">{settings.unitNameSi || ''}{settings.unitNameSi && settings.unitName ? ' · ' : ''}{settings.unitName || ''}</p>
        </main>
      )}
      <footer className="cd-foot">Double-click for full screen</footer>
    </div>
  );
}
