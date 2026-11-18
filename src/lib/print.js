import JsBarcode from 'jsbarcode';
import { escapeHtml as e, money, fmtDate, fmtTime, fmtDateTime, qtyStr } from './utils';
import { t } from './i18n';
import si400 from '@fontsource/noto-sans-sinhala/files/noto-sans-sinhala-sinhala-400-normal.woff2?url';
import si600 from '@fontsource/noto-sans-sinhala/files/noto-sans-sinhala-sinhala-600-normal.woff2?url';
import si700 from '@fontsource/noto-sans-sinhala/files/noto-sans-sinhala-sinhala-700-normal.woff2?url';

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

// ---------- Sinhala font for every printout ----------
// The font travels with the program, so Sinhala prints the same on every
// computer and printer driver, even without internet.
const abs = (u) => new URL(u, window.location.href).href;
export const SINHALA_FONT_CSS = () => `
@font-face{font-family:'WC Sinhala';src:url(${abs(si400)}) format('woff2');font-weight:100 500;font-display:block}
@font-face{font-family:'WC Sinhala';src:url(${abs(si600)}) format('woff2');font-weight:600;font-display:block}
@font-face{font-family:'WC Sinhala';src:url(${abs(si700)}) format('woff2');font-weight:700 900;font-display:block}`;
const FONT_STACK = "Arial,'WC Sinhala','Iskoola Pota','Nirmala UI','Noto Sans Sinhala',sans-serif";
const HAS_SINHALA = /[\u0D80-\u0DFF]/;

// ---------- print engine ----------
// Prints HTML through a hidden frame so only the slip prints, never the app.
// It waits for the Sinhala font and any logo, measures the slip so thermal
// printers cut straight after the last line, and prints exactly once.
export function printHTML(html, { widthMm = 80, heightMm = null, marginMm = 0 } = {}) {
  window.__lastPrint = { html, widthMm, heightMm, at: Date.now() }; // lets support check the last print job
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = `position:fixed;right:0;bottom:0;width:${widthMm}mm;height:10px;border:0;opacity:0;pointer-events:none;`;
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    doc.open();
    doc.write(html);
    doc.close();

    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      setTimeout(() => { frame.remove(); resolve(); }, 1000);
    };

    let started = false;
    const go = () => {
      if (started) return; // never print twice
      started = true;
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

    const waitImages = new Promise((res) => {
      const pending = [...doc.images].filter((i) => !i.complete);
      if (!pending.length) return res();
      let n = pending.length;
      pending.forEach((i) => { i.onload = i.onerror = () => { if (--n === 0) res(); }; });
    });
    const waitFonts = HAS_SINHALA.test(html) && doc.fonts
      ? Promise.all([doc.fonts.load("400 14px 'WC Sinhala'", 'අ'), doc.fonts.load("700 14px 'WC Sinhala'", 'අ')]).then(() => doc.fonts.ready)
      : Promise.resolve();
    const safety = new Promise((res) => setTimeout(res, 3500));
    Promise.race([Promise.all([waitImages, waitFonts]), safety]).then(() => setTimeout(go, 60), () => setTimeout(go, 60));
  });
}

// ---------- receipt wording in both languages ----------
const W = {
  bill: ['බිල්පත', 'Bill'], by: ['සේවය', 'By'], member: ['සාමාජික', 'Member'], service: ['සේවා අංකය', 'Service no'],
  subtotal: ['උප එකතුව', 'Sub total'], discount: ['වට්ටම', 'Discount'], tax: ['බද්ද', 'Tax'], total: ['මුළු මුදල', 'TOTAL'],
  given: ['ලබා දුන් මුදල', 'Cash given'], change: ['ඉතිරි මුදල', 'Change'], balance: ['ණය ශේෂය', 'Credit balance'],
  items: ['භාණ්ඩ', 'Items'], qty: ['ප්‍රමාණය', 'Qty'], copy: ['පිටපත', 'COPY'], void: ['අවලංගුයි', 'VOID'],
  ret: ['ආපසු ලැබීම', 'RETURN'], refund: ['ආපසු ගෙවීම', 'Refund'], original: ['මුල් බිල්පත', 'Original bill'], tel: ['දු.ක.', 'Tel'],
};
const PAY = { cash: ['මුදල්', 'Cash'], card: ['කාඩ්පත', 'Card'], qr: ['QR / ඔන්ලයින්', 'QR / Online'], credit: ['සාමාජික ණය', 'Member credit'], salary: ['වැටුපෙන් අඩු කිරීම', 'Salary deduction'] };
const PAY_EN = { cash: 'Cash', card: 'Card', qr: 'QR / Online', credit: 'Member credit', salary: 'Salary deduction' };

// On screen, payment names follow the interface language.
export const payLabel = (m) => t(PAY_EN[m] || m);

const word = (pair, mode) => (mode === 'si' ? pair[0] : mode === 'en' ? pair[1] : `${pair[0]} / ${pair[1]}`);
const pick = (si, en, mode) => (mode === 'si' ? si || en : mode === 'en' ? en : null);

const thermalCSS = (paper, fontScale = 1) => {
  const w = paper === 58 ? 48 : 72;
  const base = (paper === 58 ? 11 : 12.5) * fontScale;
  return `${SINHALA_FONT_CSS()}
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{background:#fff;color:#000}
  body{width:${w}mm;margin:0 auto;padding:2mm 0 3mm;font-family:${FONT_STACK};font-size:${base}px;line-height:1.35;font-weight:500;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .c{text-align:center}.r{text-align:right;white-space:nowrap}.b{font-weight:700}
  .name{font-size:${base * 1.4}px;font-weight:800;line-height:1.25}
  .name2{font-size:${base * 1.15}px;font-weight:700;line-height:1.25;margin-top:.5mm}
  .sub{font-size:${base * 0.92}px}
  .logo{display:block;margin:0 auto 1.5mm;max-width:${w * 0.5}mm;max-height:20mm;filter:grayscale(1) contrast(1.4)}
  .rule{border-top:1px dashed #000;margin:1.6mm 0}
  .rule2{border-top:2px solid #000;margin:1.6mm 0}
  table{width:100%;border-collapse:collapse}
  td{vertical-align:top;padding:.25mm 0}
  .meta td{font-size:${base * 0.95}px}
  .items .nm td{padding-top:1.1mm;font-weight:700;line-height:1.3}
  .items .en td{font-size:${base * 0.88}px;font-weight:500;padding-top:0}
  .items .ln td{font-size:${base * 0.95}px}
  .tot td{padding:.4mm 0}
  .grand td{font-size:${base * 1.5}px;font-weight:800;padding:1mm 0;vertical-align:bottom}
  .grand small{display:block;font-size:${base * 0.8}px;font-weight:700}
  .tag{display:inline-block;border:1.5px solid #000;padding:.3mm 2mm;font-weight:800;margin:1mm 0;font-size:${base * 1.05}px}
  .bc{margin:2mm auto 0;width:${w * 0.8}mm}
  .bc svg{width:100%;height:13mm}
  .foot{font-size:${base * 0.95}px;margin-top:1.5mm;white-space:pre-line}
  .void{font-size:${base * 1.5}px;font-weight:900;border:2px solid #000;padding:1mm;margin:1mm 0}
  `;
};

function headerHTML(s, mode) {
  const lines = [];
  if (s.logo && s.showLogoOnReceipt) lines.push(`<img class="logo" src="${s.logo}" alt="">`);
  if (mode === 'both') {
    if (s.canteenNameSi) lines.push(`<div class="c name">${e(s.canteenNameSi)}</div>`);
    lines.push(`<div class="c ${s.canteenNameSi ? 'name2' : 'name'}">${e(s.canteenName)}</div>`);
    if (s.unitNameSi) lines.push(`<div class="c b">${e(s.unitNameSi)}</div>`);
    if (s.unitName) lines.push(`<div class="c ${s.unitNameSi ? 'sub' : 'b'}">${e(s.unitName)}</div>`);
  } else {
    lines.push(`<div class="c name">${e(pick(s.canteenNameSi, s.canteenName, mode))}</div>`);
    const u = pick(s.unitNameSi, s.unitName, mode);
    if (u) lines.push(`<div class="c b">${e(u)}</div>`);
  }
  if (s.address) lines.push(`<div class="c sub">${e(s.address)}</div>`);
  if (s.phone) lines.push(`<div class="c sub">${e(word(W.tel, mode === 'both' ? 'en' : mode))}: ${e(s.phone)}</div>`);
  return lines.join('');
}

function itemNameHTML(it, mode) {
  if (mode === 'en' || !it.nameSi) return `<tr class="nm"><td colspan="2">${e(it.name)}</td></tr>`;
  if (mode === 'si') return `<tr class="nm"><td colspan="2">${e(it.nameSi)}</td></tr>`;
  return `<tr class="nm"><td colspan="2">${e(it.nameSi)}</td></tr><tr class="en"><td colspan="2">${e(it.name)}</td></tr>`;
}

function footerHTML(s, mode) {
  const parts = [];
  if (mode !== 'en' && s.receiptFooterSi) parts.push(e(s.receiptFooterSi));
  if (mode !== 'si' && s.receiptFooter) parts.push(e(s.receiptFooter));
  if (mode === 'si' && !s.receiptFooterSi && s.receiptFooter) parts.push(e(s.receiptFooter));
  return parts.length ? `<div class="c foot">${parts.join('\n\n')}</div>` : '';
}

export function receiptHTML(sale, settings, { copy = false } = {}) {
  const s = settings;
  const mode = s.receiptLanguage || 'both';
  const cur = s.currency || 'Rs.';
  const m = (v) => money(v, '');
  const isReturn = sale.type === 'return';
  const items = sale.items
    .map((it) => `${itemNameHTML(it, mode)}
      <tr class="ln"><td>&nbsp;&nbsp;${qtyStr(it.qty)}${it.unit && it.unit !== 'pcs' ? ' ' + e(it.unit) : ''} x ${m(it.price)}</td><td class="r">${m(it.lineTotal)}</td></tr>`)
    .join('');
  const pays = (sale.payments || [])
    .map((p) => `<tr><td>${e(word(isReturn ? [W.refund[0] + ' (' + (PAY[p.method] || [p.method])[0] + ')', W.refund[1] + ' (' + (PAY[p.method] || [, p.method])[1] + ')'] : PAY[p.method] || [p.method, p.method], mode))}</td><td class="r">${m(p.amount)}</td></tr>`)
    .join('');
  const allPcs = sale.items.every((it) => !it.unit || it.unit === 'pcs');
  const totalQty = sale.items.reduce((a, it) => a + Number(it.qty), 0);
  const totalLabel = mode === 'both' ? `${W.total[0]}<small>${W.total[1]} ${e(cur)}</small>` : `${e(word(W.total, mode))} ${e(cur)}`;

  return `<!doctype html><html lang="si"><head><meta charset="utf-8"><title>${e(sale.billNo)}</title><style>${thermalCSS(s.paperWidth, s.receiptFontScale || 1)}</style></head><body>
  ${headerHTML(s, mode)}
  ${copy ? `<div class="c"><span class="tag">${e(word(W.copy, mode))}</span></div>` : ''}
  ${isReturn ? `<div class="c void">${e(word(W.ret, mode))}</div>` : ''}
  ${sale.status === 'void' ? `<div class="c void">${e(word(W.void, mode))}</div>` : ''}
  <div class="rule2"></div>
  <table class="meta">
    <tr><td>${e(word(W.bill, mode))}: <b>${e(sale.billNo)}</b></td><td class="r">${fmtDate(sale.ts)}</td></tr>
    <tr><td>${e(word(W.by, mode))}: ${e(sale.userName)}</td><td class="r">${fmtTime(sale.ts)}</td></tr>
    ${isReturn ? `<tr><td colspan="2">${e(word(W.original, mode))}: ${e(sale.origBillNo)}</td></tr>` : ''}
    ${sale.member ? `<tr><td colspan="2">${e(word(W.member, mode))}: ${e(sale.member.rank ? sale.member.rank + ' ' : '')}${e(sale.member.name)}</td></tr><tr><td colspan="2">${e(word(W.service, mode))}: ${e(sale.member.serviceNo)}</td></tr>` : ''}
  </table>
  <div class="rule"></div>
  <table class="items">${items}</table>
  <div class="rule"></div>
  <table class="tot">
    <tr><td>${e(word(W.subtotal, mode))}</td><td class="r">${m(sale.subtotal)}</td></tr>
    ${Math.abs(sale.discount) > 0 ? `<tr><td>${e(word(W.discount, mode))}${sale.discountLabel ? ' (' + e(sale.discountLabel) + ')' : ''}</td><td class="r">-${m(Math.abs(sale.discount))}</td></tr>` : ''}
    ${Math.abs(sale.tax) > 0 ? `<tr><td>${e(word(W.tax, mode))} (${e(sale.taxRate)}%)</td><td class="r">${m(sale.tax)}</td></tr>` : ''}
  </table>
  <div class="rule2"></div>
  <table><tr class="grand"><td>${totalLabel}</td><td class="r">${m(sale.total)}</td></tr></table>
  <div class="rule2"></div>
  <table class="tot">
    ${pays}
    ${sale.tendered > 0 ? `<tr><td>${e(word(W.given, mode))}</td><td class="r">${m(sale.tendered)}</td></tr>` : ''}
    ${sale.change > 0 ? `<tr class="b"><td>${e(word(W.change, mode))}</td><td class="r">${m(sale.change)}</td></tr>` : ''}
    ${sale.member && sale.memberBalanceAfter != null ? `<tr><td>${e(word(W.balance, mode))}</td><td class="r">${m(sale.memberBalanceAfter)}</td></tr>` : ''}
  </table>
  <div class="rule"></div>
  <div class="c sub">${e(word(W.items, mode))}: ${sale.items.length}${allPcs ? ` &nbsp;|&nbsp; ${e(word(W.qty, mode))}: ${qtyStr(Math.abs(totalQty))}` : ''}</div>
  ${s.showBarcodeOnReceipt ? `<div class="bc">${barcodeSVG(sale.billNo, { height: 40, fontSize: 14, width: 1.6 })}</div>` : ''}
  ${footerHTML(s, mode)}
  </body></html>`;
}

export function printReceipt(sale, settings, opts) {
  return printHTML(receiptHTML(sale, settings, opts), { widthMm: settings.paperWidth || 80 });
}

// ---------- day-end summary on the receipt printer ----------
const D = {
  bills: ['බිල්පත්', 'Bills'], items: ['විකුණූ භාණ්ඩ', 'Items sold'], gross: ['දළ විකුණුම්', 'Gross sales'], disc: ['වට්ටම්', 'Discounts'],
  tax: ['බද්ද', 'Tax'], returns: ['ආපසු භාරදීම්', 'Returns'], net: ['ශුද්ධ විකුණුම්', 'NET SALES'], byPay: ['ගෙවීම් අනුව', 'By payment'],
  byCat: ['කාණ්ඩ අනුව', 'By category'], byUser: ['ක්‍රියාකරු අනුව', 'By operator'], voids: ['අවලංගු බිල්පත්', 'Voided bills'],
  settle: ['ණය ආපසු ගෙවීම්', 'Credit settlements'], cost: ['භාණ්ඩ පිරිවැය', 'Cost of goods'], profit: ['දළ ලාභය', 'Gross profit'],
  cash: ['අතැති විය යුතු මුදල්', 'Cash expected in hand'], counted: ['ගණන් කළේ', 'Counted by'], checked: ['පරීක්ෂා කළේ', 'Checked by'],
  printed: ['මුද්‍රණය', 'Printed'], dayEnd: ['දින අවසාන වාර්තාව', 'DAY END REPORT'], summary: ['විකුණුම් සාරාංශය', 'SALES SUMMARY'],
};
export function dayEndHTML(r, settings) {
  const s = settings;
  const mode = s.receiptLanguage || 'both';
  const L = (k) => e(word(D[k], mode));
  const m = (v) => money(v, '');
  const rows = (arr) => arr.map(([k, v]) => `<tr><td>${k}</td><td class="r">${v}</td></tr>`).join('');
  const catName = (c) => e(mode === 'en' ? c.name : mode === 'si' ? c.nameSi || c.name : c.nameSi ? `${c.nameSi} / ${c.name}` : c.name);
  return `<!doctype html><html lang="si"><head><meta charset="utf-8"><style>${thermalCSS(s.paperWidth)}</style></head><body>
  ${headerHTML({ ...s, logo: '', phone: '', address: '' }, mode)}
  <div class="c"><span class="tag">${L(r.single ? 'dayEnd' : 'summary')}</span></div>
  <div class="c sub">${e(r.rangeLabel)}</div>
  <div class="c sub">${L('printed')}: ${fmtDateTime(Date.now())} · ${e(r.printedBy)}</div>
  <div class="rule2"></div>
  <table class="tot">${rows([
    [L('bills'), r.count],
    [L('items'), qtyStr(r.qty)],
    [L('gross'), m(r.gross)],
    [L('disc'), '-' + m(Math.abs(r.discount))],
    [L('tax'), m(r.tax)],
    ...(r.returnCount ? [[L('returns'), `${r.returnCount} / -${m(Math.abs(r.returnAmount))}`]] : []),
  ])}</table>
  <div class="rule2"></div>
  <table><tr class="grand"><td>${L('net')}</td><td class="r">${m(r.net)}</td></tr></table>
  <div class="rule"></div>
  <div class="b">${L('byPay')}</div>
  <table class="tot">${rows(r.byPay.map((p) => [e(word(PAY[p.method] || [p.method, p.method], mode)), m(p.amount)]))}</table>
  <div class="rule"></div>
  <div class="b">${L('byCat')}</div>
  <table class="tot">${rows(r.byCat.map((c) => [catName(c), m(c.amount)]))}</table>
  ${r.byUser.length ? `<div class="rule"></div><div class="b">${L('byUser')}</div><table class="tot">${rows(r.byUser.map((u) => [e(u.name) + ' (' + u.count + ')', m(u.amount)]))}</table>` : ''}
  <div class="rule"></div>
  <table class="tot">${rows([
    [L('voids'), r.voidCount + ' / ' + m(r.voidAmount)],
    [L('settle'), m(r.settlements)],
    [L('cost'), m(r.cost)],
    [L('profit'), m(r.profit)],
  ])}</table>
  <div class="rule2"></div>
  <table class="tot"><tr class="b"><td>${L('cash')}</td><td class="r">${m(r.cashExpected)}</td></tr></table>
  <br><br>
  <div>${L('counted')}: ..............................</div><br>
  <div>${L('checked')}: ..............................</div>
  </body></html>`;
}

// ---------- A4 report (headings follow the screen language) ----------
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
          : `<tr><td colspan="${sec.columns.length}" class="empty">—</td></tr>`
      }</tbody>${sec.foot ? `<tfoot><tr>${sec.foot.map((f, i) => `<td class="${sec.columns[i]?.num ? 'n' : ''}">${e(f)}</td>`).join('')}</tr></tfoot>` : ''}</table>`;
    })
    .join('');
  const names = [s.canteenNameSi, s.canteenName].filter(Boolean);
  return `<!doctype html><html lang="si"><head><meta charset="utf-8"><title>${e(title)}</title><style>${SINHALA_FONT_CSS()}
  *{box-sizing:border-box}body{font-family:${FONT_STACK};color:#000;margin:0;padding:0;font-size:11px;line-height:1.4}
  header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #000;padding-bottom:6px;margin-bottom:10px;gap:16px}
  header .n{font-size:17px;font-weight:800}header .u{font-size:12px}
  h1{font-size:16px;margin:0}h2{font-size:13px;margin:14px 0 4px}
  table{width:100%;border-collapse:collapse;page-break-inside:auto}tr{page-break-inside:avoid}
  th,td{border:1px solid #999;padding:3px 5px;text-align:left}thead th{background:#e6e6e6}
  .n{text-align:right;font-variant-numeric:tabular-nums}tfoot td{font-weight:700;background:#f2f2f2}
  .kv th{width:40%;background:#f2f2f2}.empty{text-align:center;color:#555}
  footer{margin-top:16px;font-size:10px;color:#333;display:flex;justify-content:space-between}
  </style></head><body>
  <header><div>${names.map((n) => `<div class="n">${e(n)}</div>`).join('')}<div class="u">${e([s.unitName, s.address].filter(Boolean).join(', '))}</div></div>
  <div style="text-align:right"><h1>${e(title)}</h1><div>${e(subtitle || '')}</div></div></header>
  ${body}
  <footer><span>${e(t('Printed'))}: ${fmtDateTime(Date.now())}</span><span>${e(t('Signature'))}: ............................</span></footer>
  </body></html>`;
}

export function printA4(opts) {
  return printHTML(a4ReportHTML(opts), { widthMm: 210, heightMm: 297, marginMm: 12 });
}

// ---------- barcode labels: label-printer rolls and A4 sticker sheets ----------
export const LABEL_SIZES = [
  { id: '50x25', label: '50 × 25 mm', group: 'roll' },
  { id: '38x25', label: '38 × 25 mm', group: 'roll' },
  { id: '40x30', label: '40 × 30 mm', group: 'roll' },
  { id: '60x40', label: '60 × 40 mm', group: 'roll' },
  { id: 'a4-65', label: 'A4 · 65 per sheet (38.1 × 21.2 mm)', group: 'sheet', cols: 5, rows: 13, w: 38.1, h: 21.2, top: 10.7, left: 4.65, gapX: 2.5, gapY: 0 },
  { id: 'a4-40', label: 'A4 · 40 per sheet (52.5 × 29.7 mm)', group: 'sheet', cols: 4, rows: 10, w: 52.5, h: 29.7, top: 0, left: 0, gapX: 0, gapY: 0 },
  { id: 'a4-24', label: 'A4 · 24 per sheet (70 × 37 mm)', group: 'sheet', cols: 3, rows: 8, w: 70, h: 37, top: 0.5, left: 0, gapX: 0, gapY: 0 },
];
export function labelDims(id) {
  const sz = LABEL_SIZES.find((x) => x.id === id) || LABEL_SIZES[0];
  if (sz.group === 'sheet') return { w: sz.w, h: sz.h, sheet: sz };
  const [w, h] = sz.id.split('x').map(Number);
  return { w, h, sheet: null };
}

function oneLabel(p, settings, w, h) {
  const cur = settings.currency || 'Rs.';
  const mode = settings.receiptLanguage || 'both';
  const small = h <= 25;
  const showSi = mode !== 'en' && p.nameSi;
  const showEn = mode !== 'si' || !p.nameSi;
  const shop = settings.labelShowShopName ? (mode === 'si' ? settings.canteenNameSi || settings.labelShopName : settings.labelShopName || settings.canteenName) : '';
  return `<div class="lb" style="width:${w}mm;height:${h}mm">
    ${shop ? `<div class="shop">${e(shop)}</div>` : ''}
    ${showSi ? `<div class="pn si">${e(p.nameSi)}</div>` : ''}
    ${showEn ? `<div class="pn ${showSi ? 'en2' : ''}">${e(p.name)}</div>` : ''}
    <div class="pr">${e(cur)} ${money(p.price, '')}</div>
    <div class="bc">${barcodeSVG(p.barcode, { height: 40, fontSize: 14, width: 1.6 })}</div>
  </div>`.replace('class="lb"', `class="lb${small ? ' small' : ''}"`);
}

const LABEL_CSS = () => `${SINHALA_FONT_CSS()}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:${FONT_STACK};color:#000;background:#fff}
  .lb{padding:.8mm 1.5mm;display:flex;flex-direction:column;align-items:center;justify-content:space-between;overflow:hidden}
  .shop{font-size:7px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;line-height:1.2}
  .pn{font-size:9px;font-weight:700;text-align:center;line-height:1.2;max-height:2.45em;overflow:hidden;width:100%}
  .pn.en2{font-size:7.5px;font-weight:500;max-height:1.25em}
  .pr{font-size:12px;font-weight:900;line-height:1.15}
  .bc{width:100%;flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding-top:.3mm}
  .bc svg{width:100%;height:100%;max-height:16mm}
  .small .shop{font-size:6px}.small .pn{font-size:7.5px}.small .pn.en2{font-size:6.5px}.small .pr{font-size:10px}.small .bc svg{max-height:11mm}
  `;

export function labelsHTML(list, settings, size, { skip = 0, single = false } = {}) {
  const { w, h, sheet } = labelDims(size);
  const products = list.flatMap(({ product, copies }) => Array.from({ length: copies }, () => product));
  if (!sheet || single) {
    return `<!doctype html><html lang="si"><head><meta charset="utf-8"><style>${LABEL_CSS()}
      .lb{page-break-after:always;break-after:page}.lb:last-child{page-break-after:auto;break-after:auto}</style></head><body>${products.map((p) => oneLabel(p, settings, w, h)).join('')}</body></html>`;
  }
  // A4 sticker sheet: fixed grid that matches the printed sticker layout.
  const per = sheet.cols * sheet.rows;
  const cells = [...Array(Math.max(0, Math.min(skip, per - 1))).fill(null), ...products];
  const pages = [];
  for (let i = 0; i < cells.length; i += per) pages.push(cells.slice(i, i + per));
  const grid = (cs) => `<div class="sheet" style="padding:${sheet.top}mm 0 0 ${sheet.left}mm;grid-template-columns:repeat(${sheet.cols}, ${sheet.w}mm);grid-auto-rows:${sheet.h}mm;column-gap:${sheet.gapX}mm;row-gap:${sheet.gapY}mm">${cs.map((p) => (p ? oneLabel(p, settings, w, h) : '<div></div>')).join('')}</div>`;
  return `<!doctype html><html lang="si"><head><meta charset="utf-8"><style>${LABEL_CSS()}
    .sheet{display:grid;width:210mm;height:297mm;overflow:hidden;page-break-after:always;break-after:page}
    .sheet:last-child{page-break-after:auto;break-after:auto}</style></head><body>${pages.map(grid).join('')}</body></html>`;
}

export function printLabels(list, settings, size, opts) {
  const { w, h, sheet } = labelDims(size);
  if (sheet) return printHTML(labelsHTML(list, settings, size, opts), { widthMm: 210, heightMm: 297 });
  return printHTML(labelsHTML(list, settings, size, opts), { widthMm: w, heightMm: h });
}

export function testPrintHTML(settings) {
  const s = settings;
  const mode = s.receiptLanguage || 'both';
  return `<!doctype html><html lang="si"><head><meta charset="utf-8"><style>${thermalCSS(s.paperWidth, s.receiptFontScale || 1)}</style></head><body>
  ${headerHTML(s, mode)}
  <div class="c b">Printer test / මුද්‍රණ පරීක්ෂණය</div>
  <div class="rule2"></div>
  <div>If this page is sharp, centred and cut cleanly below the barcode, the printer is set up correctly.</div>
  <div style="margin-top:1mm">මෙම පිටුව පැහැදිලිව, මැදට වී, බාර්කෝඩයට පහළින් නිවැරදිව කැපී ඇත්නම් මුද්‍රකය නිවැරදිව සකසා ඇත.</div>
  <div class="rule"></div>
  <table class="items"><tr class="nm"><td colspan="2">පිටි කිරි 400 g</td></tr><tr class="en"><td colspan="2">Full cream milk powder 400 g</td></tr>
  <tr class="ln"><td>&nbsp;&nbsp;2 x 1,180.00</td><td class="r">2,360.00</td></tr></table>
  <div class="rule"></div>
  <table class="tot"><tr><td>Paper width</td><td class="r">${s.paperWidth} mm</td></tr><tr><td>${fmtDateTime(Date.now())}</td><td></td></tr></table>
  <div class="rule2"></div>
  <table><tr class="grand"><td>${mode === 'both' ? 'මුළු මුදල<small>TOTAL</small>' : e(word(W.total, mode))}</td><td class="r">2,360.00</td></tr></table>
  <div class="bc">${barcodeSVG('TEST-12345', { height: 40, fontSize: 14, width: 1.6 })}</div>
  </body></html>`;
}
