import JsBarcode from 'jsbarcode';
import { escapeHtml as e, money, fmtDate, fmtTime, fmtDateTime, qtyStr } from './utils';

// ---------- barcode helpers ----------
export function barcodeSVG(value, opts = {}) {
  if (!value) return '';
  try {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const v = String(value).trim();
    let format = opts.format || 'CODE128';
    if (!opts.format && /^\d{13}$/.test(v)) format = 'EAN13';
    if (!opts.format && /^\d{8}$/.test(v)) format = 'EAN8';
    try {
      JsBarcode(svg, v, { format, width: 2, height: 50, displayValue: true, fontSize: 16, margin: 0, textMargin: 2, background: 'transparent', ...opts, format });
    } catch {
      JsBarcode(svg, v, { width: 2, height: 50, displayValue: true, fontSize: 16, margin: 0, textMargin: 2, background: 'transparent', ...opts, format: 'CODE128' });
    }
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    return svg.outerHTML;
  } catch {
    return '';
  }
}

// ---------- print engine ----------
// Prints HTML through a hidden frame so only the receipt is printed,
// never the app screen. The page height is measured so thermal
// printers cut right after the last line instead of feeding blank paper.
export function printHTML(html, { widthMm = 80, heightMm = null, marginMm = 0 } = {}) {
  window.__lastPrint = { html, widthMm, heightMm, at: Date.now() }; // lets staff/support check the last print job
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = `position:fixed;right:0;bottom:0;width:${widthMm}mm;height:10px;border:0;opacity:0;pointer-events:none;`;
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    doc.open();
    doc.write(html);
    doc.close();

    const done = () => {
      setTimeout(() => { frame.remove(); resolve(); }, 1000);
    };

    const go = () => {
      try {
        let h = heightMm;
        if (!h) {
          const px = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight);
          h = Math.ceil((px * 25.4) / 96) + 6;
        }
        const st = doc.createElement('style');
        st.textContent = `@page { size: ${widthMm}mm ${h}mm; margin: ${marginMm}mm; }`;
        doc.head.appendChild(st);
        // Never move keyboard focus: the operator may already be scanning the next item.
        const active = document.activeElement;
        frame.contentWindow.onafterprint = done;
        // Automated test browsers have no printer; everything else prints normally.
        if (!navigator.webdriver) frame.contentWindow.print();
        if (active && active.isConnected && document.activeElement !== active && active.focus) active.focus();
        done();
      } catch (err) {
        console.error('Print failed', err);
        done();
      }
    };

    const imgs = [...doc.images];
    const pending = imgs.filter((i) => !i.complete);
    if (!pending.length) setTimeout(go, 60);
    else {
      let n = pending.length;
      pending.forEach((i) => { i.onload = i.onerror = () => { if (--n === 0) setTimeout(go, 60); }; });
      setTimeout(go, 2500);
    }
  });
}

const thermalCSS = (paper, fontScale = 1) => {
  const w = paper === 58 ? 48 : 72;
  const base = (paper === 58 ? 11 : 12.5) * fontScale;
  return `
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{background:#fff;color:#000}
  body{width:${w}mm;margin:0 auto;padding:2mm 0 3mm;font-family:Arial,"Helvetica Neue",Helvetica,sans-serif;font-size:${base}px;line-height:1.3;font-weight:500;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .c{text-align:center}.r{text-align:right}.b{font-weight:700}
  .name{font-size:${base * 1.45}px;font-weight:800;line-height:1.15;letter-spacing:.2px}
  .sub{font-size:${base * 0.92}px}
  .logo{display:block;margin:0 auto 1.5mm;max-width:${w * 0.5}mm;max-height:20mm;filter:grayscale(1) contrast(1.4)}
  .rule{border-top:1px dashed #000;margin:1.6mm 0}
  .rule2{border-top:2px solid #000;margin:1.6mm 0}
  table{width:100%;border-collapse:collapse}
  td{vertical-align:top;padding:.25mm 0}
  .meta td{font-size:${base * 0.95}px}
  .items .nm td{padding-top:1mm;font-weight:700}
  .items .ln td{font-size:${base * 0.95}px}
  .tot td{padding:.4mm 0}
  .grand td{font-size:${base * 1.55}px;font-weight:800;padding:1mm 0}
  .tag{display:inline-block;border:1.5px solid #000;padding:.3mm 2mm;font-weight:800;margin:1mm 0;font-size:${base * 1.05}px}
  .bc{margin:2mm auto 0;width:${w * 0.8}mm}
  .bc svg{width:100%;height:13mm}
  .foot{font-size:${base * 0.95}px;margin-top:1.5mm;white-space:pre-line}
  .void{font-size:${base * 1.6}px;font-weight:900;border:2px solid #000;padding:1mm;margin:1mm 0}
  `;
};

const PAY_LABEL = { cash: 'Cash', card: 'Card', qr: 'QR / Online', credit: 'Member credit', salary: 'Salary deduction' };
export const payLabel = (m) => PAY_LABEL[m] || m;

export function receiptHTML(sale, settings, { copy = false } = {}) {
  const s = settings;
  const cur = s.currency || 'Rs.';
  const m = (v) => money(v, '');
  const items = sale.items
    .map(
      (it) => `
      <tr class="nm"><td colspan="2">${e(it.name)}</td></tr>
      <tr class="ln"><td>&nbsp;&nbsp;${qtyStr(it.qty)}${it.unit && it.unit !== 'pcs' ? ' ' + e(it.unit) : ''} x ${m(it.price)}</td><td class="r">${m(it.lineTotal)}</td></tr>`
    )
    .join('');
  const pays = (sale.payments || [])
    .map((p) => `<tr><td>${e(payLabel(p.method))}</td><td class="r">${m(p.amount)}</td></tr>`)
    .join('');
  const totalQty = sale.items.reduce((a, it) => a + Number(it.qty), 0);

  return `<!doctype html><html><head><meta charset="utf-8"><title>${e(sale.billNo)}</title><style>${thermalCSS(s.paperWidth, s.receiptFontScale || 1)}</style></head><body>
  ${s.logo && s.showLogoOnReceipt ? `<img class="logo" src="${s.logo}" alt="">` : ''}
  <div class="c name">${e(s.canteenName)}</div>
  ${s.unitName ? `<div class="c b">${e(s.unitName)}</div>` : ''}
  ${s.address ? `<div class="c sub">${e(s.address)}</div>` : ''}
  ${s.phone ? `<div class="c sub">Tel: ${e(s.phone)}</div>` : ''}
  ${copy ? '<div class="c"><span class="tag">COPY</span></div>' : ''}
  ${sale.status === 'void' ? '<div class="c void">VOID</div>' : ''}
  <div class="rule2"></div>
  <table class="meta">
    <tr><td>Bill: <b>${e(sale.billNo)}</b></td><td class="r">${fmtDate(sale.ts)}</td></tr>
    <tr><td>By: ${e(sale.userName)}</td><td class="r">${fmtTime(sale.ts)}</td></tr>
    ${sale.member ? `<tr><td colspan="2">Member: ${e(sale.member.rank ? sale.member.rank + ' ' : '')}${e(sale.member.name)}</td></tr><tr><td colspan="2">Service no: ${e(sale.member.serviceNo)}</td></tr>` : ''}
  </table>
  <div class="rule"></div>
  <table class="items">${items}</table>
  <div class="rule"></div>
  <table class="tot">
    <tr><td>Sub total</td><td class="r">${m(sale.subtotal)}</td></tr>
    ${sale.discount > 0 ? `<tr><td>Discount${sale.discountLabel ? ' (' + e(sale.discountLabel) + ')' : ''}</td><td class="r">-${m(sale.discount)}</td></tr>` : ''}
    ${sale.tax > 0 ? `<tr><td>Tax (${e(sale.taxRate)}%)</td><td class="r">${m(sale.tax)}</td></tr>` : ''}
  </table>
  <div class="rule2"></div>
  <table><tr class="grand"><td>TOTAL ${e(cur)}</td><td class="r">${m(sale.total)}</td></tr></table>
  <div class="rule2"></div>
  <table class="tot">
    ${pays}
    ${sale.tendered > 0 ? `<tr><td>Cash given</td><td class="r">${m(sale.tendered)}</td></tr>` : ''}
    ${sale.change > 0 ? `<tr class="b"><td>Change</td><td class="r">${m(sale.change)}</td></tr>` : ''}
    ${sale.member && sale.payments?.some((p) => p.method === 'credit') ? `<tr><td>Credit balance</td><td class="r">${m(sale.memberBalanceAfter)}</td></tr>` : ''}
  </table>
  <div class="rule"></div>
  <div class="c sub">Items: ${sale.items.length}${sale.items.every((it) => !it.unit || it.unit === 'pcs') ? ` &nbsp;|&nbsp; Qty: ${qtyStr(totalQty)}` : ''}</div>
  ${s.showBarcodeOnReceipt ? `<div class="bc">${barcodeSVG(sale.billNo, { height: 40, fontSize: 14, width: 1.6 })}</div>` : ''}
  ${s.receiptFooter ? `<div class="c foot">${e(s.receiptFooter)}</div>` : ''}
  </body></html>`;
}

export function printReceipt(sale, settings, opts) {
  return printHTML(receiptHTML(sale, settings, opts), { widthMm: settings.paperWidth || 80 });
}

// ---------- day-end summary on the receipt printer ----------
export function dayEndHTML(r, settings) {
  const s = settings;
  const m = (v) => money(v, '');
  const rows = (arr) => arr.map(([k, v]) => `<tr><td>${e(k)}</td><td class="r">${v}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>${thermalCSS(s.paperWidth)}</style></head><body>
  <div class="c name">${e(s.canteenName)}</div>
  ${s.unitName ? `<div class="c b">${e(s.unitName)}</div>` : ''}
  <div class="c"><span class="tag">${e(r.title)}</span></div>
  <div class="c sub">${e(r.rangeLabel)}</div>
  <div class="c sub">Printed ${fmtDateTime(Date.now())} by ${e(r.printedBy)}</div>
  <div class="rule2"></div>
  <table class="tot">${rows([
    ['Bills', r.count],
    ['Items sold', qtyStr(r.qty)],
    ['Gross sales', m(r.gross)],
    ['Discounts', '-' + m(r.discount)],
    ['Tax', m(r.tax)],
  ])}</table>
  <div class="rule2"></div>
  <table><tr class="grand"><td>NET SALES</td><td class="r">${m(r.net)}</td></tr></table>
  <div class="rule"></div>
  <div class="b">By payment</div>
  <table class="tot">${rows(r.byPay.map((p) => [payLabel(p.method), m(p.amount)]))}</table>
  <div class="rule"></div>
  <div class="b">By category</div>
  <table class="tot">${rows(r.byCat.map((c) => [c.name, m(c.amount)]))}</table>
  ${r.byUser.length ? `<div class="rule"></div><div class="b">By operator</div><table class="tot">${rows(r.byUser.map((u) => [u.name + ' (' + u.count + ')', m(u.amount)]))}</table>` : ''}
  <div class="rule"></div>
  <table class="tot">${rows([
    ['Voided bills', r.voidCount + ' / ' + m(r.voidAmount)],
    ['Credit settlements', m(r.settlements)],
    ['Cost of goods', m(r.cost)],
    ['Gross profit', m(r.profit)],
  ])}</table>
  <div class="rule2"></div>
  <table class="tot"><tr class="b"><td>Cash expected in hand</td><td class="r">${m(r.cashExpected)}</td></tr></table>
  <br><br>
  <div>Counted by: ......................................</div><br>
  <div>Checked by: ......................................</div>
  </body></html>`;
}

// ---------- A4 report ----------
export function a4ReportHTML({ title, subtitle, settings, sections }) {
  const s = settings;
  const body = sections
    .map((sec) => {
      if (sec.kv) {
        return `<h2>${e(sec.title)}</h2><table class="kv">${sec.kv.map(([k, v]) => `<tr><th>${e(k)}</th><td>${e(v)}</td></tr>`).join('')}</table>`;
      }
      return `<h2>${e(sec.title)}</h2><table><thead><tr>${sec.columns.map((c) => `<th class="${c.num ? 'n' : ''}">${e(c.label)}</th>`).join('')}</tr></thead><tbody>${
        sec.rows.length
          ? sec.rows.map((r) => `<tr>${sec.columns.map((c, i) => `<td class="${c.num ? 'n' : ''}">${e(r[i])}</td>`).join('')}</tr>`).join('')
          : `<tr><td colspan="${sec.columns.length}" class="empty">No records</td></tr>`
      }</tbody>${sec.foot ? `<tfoot><tr>${sec.foot.map((f, i) => `<td class="${sec.columns[i]?.num ? 'n' : ''}">${e(f)}</td>`).join('')}</tr></tfoot>` : ''}</table>`;
    })
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${e(title)}</title><style>
  *{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#000;margin:0;padding:0;font-size:11px}
  header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #000;padding-bottom:6px;margin-bottom:10px}
  header .n{font-size:18px;font-weight:800}header .u{font-size:12px}
  h1{font-size:16px;margin:0}h2{font-size:13px;margin:14px 0 4px}
  table{width:100%;border-collapse:collapse;page-break-inside:auto}tr{page-break-inside:avoid}
  th,td{border:1px solid #999;padding:3px 5px;text-align:left}thead th{background:#e6e6e6}
  .n{text-align:right;font-variant-numeric:tabular-nums}tfoot td{font-weight:700;background:#f2f2f2}
  .kv th{width:40%;background:#f2f2f2}.empty{text-align:center;color:#555}
  footer{margin-top:16px;font-size:10px;color:#333;display:flex;justify-content:space-between}
  </style></head><body>
  <header><div><div class="n">${e(s.canteenName)}</div><div class="u">${e([s.unitName, s.address].filter(Boolean).join(', '))}</div></div>
  <div style="text-align:right"><h1>${e(title)}</h1><div>${e(subtitle || '')}</div></div></header>
  ${body}
  <footer><span>Printed ${fmtDateTime(Date.now())}</span><span>Signature: ............................</span></footer>
  </body></html>`;
}

export function printA4(opts) {
  return printHTML(a4ReportHTML(opts), { widthMm: 210, heightMm: 297, marginMm: 12 });
}

// ---------- shelf / product barcode labels ----------
export function labelsHTML(list, settings, size) {
  const [w, h] = size.split('x').map(Number);
  const cur = settings.currency || 'Rs.';
  const small = h <= 25;
  const labels = list
    .flatMap(({ product, copies }) => Array.from({ length: copies }, () => product))
    .map(
      (p) => `<div class="lb">
        ${settings.labelShowShopName ? `<div class="shop">${e(settings.labelShopName || settings.canteenName)}</div>` : ''}
        <div class="pn">${e(p.name)}</div>
        <div class="pr">${e(cur)} ${money(p.price, '')}</div>
        <div class="bc">${barcodeSVG(p.barcode, { height: 40, fontSize: 14, width: 1.6 })}</div>
      </div>`
    )
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;color:#000;background:#fff}
  .lb{width:${w}mm;height:${h}mm;padding:1mm 1.5mm;display:flex;flex-direction:column;align-items:center;justify-content:space-between;overflow:hidden;page-break-after:always;break-after:page}
  .lb:last-child{page-break-after:auto;break-after:auto}
  .shop{font-size:${small ? 6 : 7.5}px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
  .pn{font-size:${small ? 7.5 : 9.5}px;font-weight:700;text-align:center;line-height:1.1;max-height:2.2em;overflow:hidden;width:100%}
  .pr{font-size:${small ? 10 : 13}px;font-weight:900}
  .bc{width:100%;flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding-top:.5mm}
  .bc svg{width:100%;height:100%;max-height:${small ? 13 : 18}mm}
  </style></head><body>${labels}</body></html>`;
}

export function printLabels(list, settings, size) {
  const [w, h] = size.split('x').map(Number);
  return printHTML(labelsHTML(list, settings, size), { widthMm: w, heightMm: h });
}

export function testPrintHTML(settings) {
  const s = settings;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${thermalCSS(s.paperWidth, s.receiptFontScale || 1)}</style></head><body>
  ${s.logo && s.showLogoOnReceipt ? `<img class="logo" src="${s.logo}" alt="">` : ''}
  <div class="c name">${e(s.canteenName)}</div>
  <div class="c b">Printer test</div>
  <div class="rule2"></div>
  <div>If this page is sharp, centred and cut cleanly below the barcode, the printer is set up correctly.</div>
  <div class="rule"></div>
  <table class="tot"><tr><td>Paper width</td><td class="r">${s.paperWidth} mm</td></tr><tr><td>Printed</td><td class="r">${fmtDateTime(Date.now())}</td></tr></table>
  <div class="rule"></div>
  <table><tr class="grand"><td>TOTAL</td><td class="r">1,234.50</td></tr></table>
  <div class="bc">${barcodeSVG('TEST-12345', { height: 40, fontSize: 14, width: 1.6 })}</div>
  </body></html>`;
}
