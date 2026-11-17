export const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export function money(n, symbol = 'Rs.') {
  const v = Number(n) || 0;
  const s = Math.abs(v).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (v < 0 ? '-' : '') + (symbol ? symbol + ' ' : '') + s;
}

export const num = (n) => (Number(n) || 0).toLocaleString('en-LK', { maximumFractionDigits: 3 });

export function qtyStr(q) {
  const v = Number(q) || 0;
  return Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

export const pad = (n, w = 2) => String(n).padStart(w, '0');

export function dayKey(d = new Date()) {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

export function fmtDate(d) {
  const x = new Date(d);
  return `${pad(x.getDate())}/${pad(x.getMonth() + 1)}/${x.getFullYear()}`;
}

export function fmtTime(d) {
  const x = new Date(d);
  let h = x.getHours();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${pad(h)}:${pad(x.getMinutes())} ${ap}`;
}

export const fmtDateTime = (d) => `${fmtDate(d)} ${fmtTime(d)}`;

export function startOfDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}
export function endOfDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}
export function addDays(key, n) {
  const t = new Date(startOfDay(key));
  t.setDate(t.getDate() + n);
  return dayKey(t);
}

export async function hashPin(pin) {
  const data = new TextEncoder().encode('wcpos::' + String(pin));
  if (window.crypto && window.crypto.subtle) {
    const buf = await window.crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback for non-secure contexts (plain http on a local network).
  let h = 5381;
  for (const b of data) h = ((h << 5) + h + b) >>> 0;
  return 'f' + h.toString(16);
}

export function toCSV(rows, columns) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const head = columns.map((c) => esc(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => esc(typeof c.value === 'function' ? c.value(r) : r[c.value])).join(','));
  return [head, ...body].join('\r\n');
}

export function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else q = false;
      } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export function download(filename, content, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([type.startsWith('text/csv') ? '\ufeff' + content : content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

export const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// EAN-13 check digit so generated in-house barcodes scan cleanly.
export function ean13(base12) {
  const d = base12.split('').map(Number);
  const sum = d.reduce((s, v, i) => s + v * (i % 2 ? 3 : 1), 0);
  return base12 + ((10 - (sum % 10)) % 10);
}

export const isWeighed = (unit) => ['kg', 'g', 'l', 'ml', 'm'].includes(unit);
