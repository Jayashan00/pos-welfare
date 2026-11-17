import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as db from './db';
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS, sampleMembers, sampleProducts } from './seed';
import { dayKey, ean13, hashPin, pad, round2, uid } from './utils';

const Ctx = createContext(null);
export const useStore = () => useContext(Ctx);

export const ROLES = {
  admin: { label: 'Administrator', pages: ['dashboard', 'pos', 'products', 'inventory', 'members', 'sales', 'reports', 'users', 'settings'] },
  manager: { label: 'Manager', pages: ['dashboard', 'pos', 'products', 'inventory', 'members', 'sales', 'reports'] },
  operator: { label: 'Till operator', pages: ['pos', 'sales', 'members'] },
};
export const can = (user, page) => !!user && ROLES[user.role]?.pages.includes(page);
export const canManage = (user) => user && (user.role === 'admin' || user.role === 'manager');

const EMPTY = { products: [], categories: [], members: [], users: [], sales: [], stockMoves: [], held: [], payments: [] };
const SESSION_KEY = 'wcpos-session';

export function calcTotals(cart, discount, taxRate) {
  const subtotal = round2(cart.reduce((a, it) => a + round2(it.price * it.qty), 0));
  let disc = 0;
  if (discount && Number(discount.value) > 0) {
    disc = discount.type === 'pct' ? round2((subtotal * Math.min(100, Number(discount.value))) / 100) : round2(Number(discount.value));
  }
  disc = Math.min(disc, subtotal);
  const taxable = round2(subtotal - disc);
  const tax = Number(taxRate) > 0 ? round2((taxable * Number(taxRate)) / 100) : 0;
  const total = round2(taxable + tax);
  return { subtotal, discount: disc, tax, total };
}

export function StoreProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(EMPTY);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [user, setUser] = useState(null);
  const dataRef = useRef(data);
  const settingsRef = useRef(settings);
  dataRef.current = data;
  settingsRef.current = settings;

  const load = useCallback(async () => {
    const out = {};
    for (const s of Object.keys(EMPTY)) out[s] = await db.getAll(s);
    const st = await db.getAll('settings');
    let set = st.find((x) => x.id === 'main');

    // First run: create the admin login, categories and sample stock.
    if (!set) {
      set = { ...DEFAULT_SETTINGS };
      const admin = { id: 'u-admin', name: 'Administrator', username: 'admin', role: 'admin', active: true, pinHash: await hashPin('1234'), mustChangePin: true, createdAt: Date.now() };
      const prods = sampleProducts();
      const mems = sampleMembers();
      await db.put('settings', set);
      await db.put('users', admin);
      await db.putMany('categories', DEFAULT_CATEGORIES);
      await db.putMany('products', prods);
      await db.putMany('members', mems);
      out.users = [admin];
      out.categories = DEFAULT_CATEGORIES;
      out.products = prods;
      out.members = mems;
    } else {
      set = { ...DEFAULT_SETTINGS, ...set };
    }
    out.sales.sort((a, b) => b.ts - a.ts);
    out.stockMoves.sort((a, b) => b.ts - a.ts);
    out.payments.sort((a, b) => b.ts - a.ts);
    out.products.sort((a, b) => a.name.localeCompare(b.name));
    out.members.sort((a, b) => a.name.localeCompare(b.name));
    setData(out);
    setSettings(set);
    const sid = sessionStorage.getItem(SESSION_KEY);
    const su = sid && out.users.find((u) => u.id === sid && u.active);
    setUser(su || null);
    setReady(true);
  }, []);

  useEffect(() => {
    load().catch((e) => {
      console.error(e);
      setError('This browser blocked local storage. Open the POS in Google Chrome (not in private / incognito mode) and try again.');
    });
  }, [load]);

  // ---------- helpers ----------
  const patch = (key, fn) => setData((d) => ({ ...d, [key]: fn(d[key]) }));
  const upsert = (arr, item, sortBy) => {
    const i = arr.findIndex((x) => x.id === item.id);
    const next = i >= 0 ? arr.map((x) => (x.id === item.id ? item : x)) : [item, ...arr];
    if (sortBy === 'name') next.sort((a, b) => a.name.localeCompare(b.name));
    return next;
  };

  // ---------- auth ----------
  const login = async (username, pin) => {
    const u = dataRef.current.users.find((x) => x.username.toLowerCase() === String(username).trim().toLowerCase());
    if (!u || !u.active) throw new Error('No active user with that username.');
    const h = await hashPin(pin);
    if (h !== u.pinHash) throw new Error('Wrong PIN. Try again.');
    sessionStorage.setItem(SESSION_KEY, u.id);
    setUser(u);
    return u;
  };
  const logout = () => {
    sessionStorage.removeItem(SESSION_KEY);
    setUser(null);
  };

  // ---------- settings ----------
  const saveSettings = async (changes) => {
    const next = { ...settingsRef.current, ...changes };
    await db.put('settings', next);
    setSettings(next);
    return next;
  };

  // ---------- categories ----------
  const saveCategory = async (c) => {
    const item = { ...c, id: c.id || uid('cat-') };
    await db.put('categories', item);
    patch('categories', (a) => upsert(a, item));
    return item;
  };
  const deleteCategory = async (id) => {
    if (dataRef.current.products.some((p) => p.categoryId === id)) throw new Error('Move the products in this category first.');
    await db.remove('categories', id);
    patch('categories', (a) => a.filter((x) => x.id !== id));
  };

  // ---------- products ----------
  const nextItemBarcode = async () => {
    let n = settingsRef.current.nextItemCode || 1;
    const codes = new Set(dataRef.current.products.map((p) => p.barcode));
    let code;
    do {
      code = ean13('21' + String(n).padStart(10, '0'));
      n++;
    } while (codes.has(code));
    await saveSettings({ nextItemCode: n });
    return code;
  };

  const saveProduct = async (p) => {
    const barcode = String(p.barcode || '').trim();
    if (!p.name?.trim()) throw new Error('Enter a product name.');
    if (barcode) {
      const dup = dataRef.current.products.find((x) => x.barcode === barcode && x.id !== p.id);
      if (dup) throw new Error(`Barcode ${barcode} is already used by "${dup.name}".`);
    }
    const isNew = !p.id;
    const item = {
      reorderLevel: settingsRef.current.lowStockDefault,
      trackStock: true,
      active: true,
      ...p,
      id: p.id || uid('p-'),
      name: p.name.trim(),
      barcode,
      price: round2(p.price),
      cost: round2(p.cost || 0),
      stock: Number(p.stock) || 0,
      updatedAt: Date.now(),
      createdAt: p.createdAt || Date.now(),
    };
    const ops = [{ store: 'products', type: 'put', value: item }];
    let move = null;
    if (isNew && item.trackStock && item.stock !== 0) {
      move = { id: uid('sm-'), ts: Date.now(), productId: item.id, productName: item.name, type: 'in', qty: item.stock, cost: item.cost, ref: 'Opening stock', note: '', userName: user?.name || '' };
      ops.push({ store: 'stockMoves', type: 'put', value: move });
    }
    await db.writeAtomic(ops);
    setData((d) => ({ ...d, products: upsert(d.products, item, 'name'), stockMoves: move ? [move, ...d.stockMoves] : d.stockMoves }));
    return item;
  };

  const importProducts = async (rows) => {
    const existing = dataRef.current.products;
    const byCode = new Map(existing.filter((p) => p.barcode).map((p) => [p.barcode, p]));
    const cats = [...dataRef.current.categories];
    const newCats = [];
    const catId = (name) => {
      if (!name) return cats[0]?.id || '';
      let c = cats.find((x) => x.name.toLowerCase() === name.toLowerCase());
      if (!c) {
        c = { id: uid('cat-'), name, color: '#5B6B4A' };
        cats.push(c);
        newCats.push(c);
      }
      return c.id;
    };
    const out = [];
    let added = 0, updated = 0;
    for (const r of rows) {
      if (!r.name) continue;
      const prev = r.barcode && byCode.get(r.barcode);
      const item = {
        ...(prev || { id: uid('p-'), createdAt: Date.now(), active: true, trackStock: true }),
        name: r.name,
        barcode: r.barcode || prev?.barcode || '',
        categoryId: catId(r.category),
        unit: r.unit || prev?.unit || 'pcs',
        cost: round2(r.cost ?? prev?.cost ?? 0),
        price: round2(r.price ?? prev?.price ?? 0),
        stock: r.stock != null && r.stock !== '' ? Number(r.stock) : prev?.stock || 0,
        reorderLevel: r.reorder != null && r.reorder !== '' ? Number(r.reorder) : prev?.reorderLevel ?? settingsRef.current.lowStockDefault,
        updatedAt: Date.now(),
      };
      prev ? updated++ : added++;
      out.push(item);
    }
    await db.putMany('categories', newCats);
    await db.putMany('products', out);
    setData((d) => {
      let products = d.products;
      out.forEach((p) => (products = upsert(products, p)));
      products = [...products].sort((a, b) => a.name.localeCompare(b.name));
      return { ...d, products, categories: [...d.categories, ...newCats] };
    });
    return { added, updated };
  };

  const deleteProduct = async (id) => {
    const used = dataRef.current.sales.some((s) => s.items.some((i) => i.productId === id));
    if (used) {
      // Keep sold products for the sales history; hide them instead.
      const p = dataRef.current.products.find((x) => x.id === id);
      const item = { ...p, active: false };
      await db.put('products', item);
      patch('products', (a) => upsert(a, item));
      return 'hidden';
    }
    await db.remove('products', id);
    patch('products', (a) => a.filter((x) => x.id !== id));
    return 'deleted';
  };

  // ---------- stock ----------
  const receiveStock = async ({ lines, supplier, ref, note }) => {
    const prods = dataRef.current.products;
    const ops = [];
    const moves = [];
    const updated = [];
    const grn = ref || 'GRN-' + dayKey().replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 5).toUpperCase();
    for (const l of lines) {
      const p = prods.find((x) => x.id === l.productId);
      if (!p || !(Number(l.qty) > 0)) continue;
      const np = { ...p, stock: round2(p.stock + Number(l.qty)), cost: l.cost !== '' && l.cost != null ? round2(l.cost) : p.cost, updatedAt: Date.now() };
      if (l.price !== '' && l.price != null && Number(l.price) > 0) np.price = round2(l.price);
      const m = { id: uid('sm-'), ts: Date.now(), productId: p.id, productName: p.name, type: 'in', qty: Number(l.qty), cost: np.cost, ref: grn, supplier: supplier || '', note: note || '', userName: user?.name || '' };
      ops.push({ store: 'products', type: 'put', value: np }, { store: 'stockMoves', type: 'put', value: m });
      moves.push(m);
      updated.push(np);
    }
    if (!ops.length) throw new Error('Add at least one item with a quantity.');
    await db.writeAtomic(ops);
    setData((d) => {
      let products = d.products;
      updated.forEach((p) => (products = upsert(products, p)));
      return { ...d, products, stockMoves: [...moves.reverse(), ...d.stockMoves] };
    });
    return grn;
  };

  const adjustStock = async ({ productId, mode, qty, reason, note }) => {
    const p = dataRef.current.products.find((x) => x.id === productId);
    if (!p) throw new Error('Product not found.');
    const q = Number(qty);
    if (Number.isNaN(q)) throw new Error('Enter a quantity.');
    const newStock = mode === 'set' ? q : round2(p.stock + (mode === 'remove' ? -Math.abs(q) : Math.abs(q)));
    const delta = round2(newStock - p.stock);
    if (delta === 0) throw new Error('Stock is already at that level.');
    const np = { ...p, stock: newStock, updatedAt: Date.now() };
    const m = { id: uid('sm-'), ts: Date.now(), productId: p.id, productName: p.name, type: 'adjust', qty: delta, cost: p.cost, ref: reason, note: note || '', userName: user?.name || '' };
    await db.writeAtomic([{ store: 'products', type: 'put', value: np }, { store: 'stockMoves', type: 'put', value: m }]);
    setData((d) => ({ ...d, products: upsert(d.products, np), stockMoves: [m, ...d.stockMoves] }));
  };

  // ---------- members ----------
  const saveMember = async (m) => {
    if (!m.name?.trim()) throw new Error('Enter the member name.');
    if (!m.serviceNo?.trim()) throw new Error('Enter the service number.');
    const dup = dataRef.current.members.find((x) => x.serviceNo.toLowerCase() === m.serviceNo.trim().toLowerCase() && x.id !== m.id);
    if (dup) throw new Error(`Service number ${m.serviceNo} is already registered to ${dup.name}.`);
    const item = { balance: 0, active: true, discountPct: 0, ...m, id: m.id || uid('m-'), serviceNo: m.serviceNo.trim(), name: m.name.trim(), creditLimit: Number(m.creditLimit) || 0, discountPct: Number(m.discountPct) || 0, createdAt: m.createdAt || Date.now() };
    await db.put('members', item);
    patch('members', (a) => upsert(a, item, 'name'));
    return item;
  };
  const deleteMember = async (id) => {
    const m = dataRef.current.members.find((x) => x.id === id);
    if (m.balance > 0) throw new Error('This member still owes money. Settle the balance first.');
    if (dataRef.current.sales.some((s) => s.member?.id === id)) {
      const item = { ...m, active: false };
      await db.put('members', item);
      patch('members', (a) => upsert(a, item));
      return 'hidden';
    }
    await db.remove('members', id);
    patch('members', (a) => a.filter((x) => x.id !== id));
    return 'deleted';
  };
  const settleMember = async ({ memberId, amount, method, note }) => {
    const m = dataRef.current.members.find((x) => x.id === memberId);
    const a = round2(amount);
    if (!(a > 0)) throw new Error('Enter an amount above zero.');
    if (a > round2(m.balance)) throw new Error('Amount is more than the balance owed.');
    const nm = { ...m, balance: round2(m.balance - a) };
    const pay = { id: uid('pay-'), ts: Date.now(), day: dayKey(), memberId, memberName: m.name, serviceNo: m.serviceNo, amount: a, method, note: note || '', userName: user?.name || '', balanceAfter: nm.balance };
    await db.writeAtomic([{ store: 'members', type: 'put', value: nm }, { store: 'payments', type: 'put', value: pay }]);
    setData((d) => ({ ...d, members: upsert(d.members, nm), payments: [pay, ...d.payments] }));
    return pay;
  };

  // ---------- users ----------
  const saveUser = async (u, pin) => {
    if (!u.name?.trim() || !u.username?.trim()) throw new Error('Enter a name and username.');
    const dup = dataRef.current.users.find((x) => x.username.toLowerCase() === u.username.trim().toLowerCase() && x.id !== u.id);
    if (dup) throw new Error('That username is taken.');
    if (!u.id && !pin) throw new Error('Set a PIN for the new user.');
    if (pin && !/^\d{4,8}$/.test(pin)) throw new Error('PIN must be 4 to 8 digits.');
    const admins = dataRef.current.users.filter((x) => x.role === 'admin' && x.active && x.id !== u.id);
    if (u.id && (!u.active || u.role !== 'admin') && admins.length === 0 && dataRef.current.users.find((x) => x.id === u.id)?.role === 'admin')
      throw new Error('Keep at least one active administrator.');
    const item = { active: true, ...u, id: u.id || uid('u-'), username: u.username.trim(), name: u.name.trim(), createdAt: u.createdAt || Date.now() };
    if (pin) {
      item.pinHash = await hashPin(pin);
      item.mustChangePin = false;
    }
    await db.put('users', item);
    patch('users', (a) => upsert(a, item));
    if (user?.id === item.id) setUser(item);
    return item;
  };
  const deleteUser = async (id) => {
    if (id === user?.id) throw new Error('You cannot delete yourself.');
    const u = dataRef.current.users.find((x) => x.id === id);
    if (u.role === 'admin' && dataRef.current.users.filter((x) => x.role === 'admin' && x.active).length <= 1) throw new Error('Keep at least one active administrator.');
    await db.remove('users', id);
    patch('users', (a) => a.filter((x) => x.id !== id));
  };

  // ---------- sales ----------
  const completeSale = async ({ cart, member, discount, payments, tendered, note }) => {
    const set = settingsRef.current;
    const d = dataRef.current;
    if (!cart.length) throw new Error('The bill is empty.');
    const prodMap = new Map(d.products.map((p) => [p.id, p]));

    // stock check
    if (!set.allowNegativeStock) {
      const need = new Map();
      cart.forEach((it) => need.set(it.productId, (need.get(it.productId) || 0) + Number(it.qty)));
      for (const [pid, q] of need) {
        const p = prodMap.get(pid);
        if (p && p.trackStock && p.stock < q) throw new Error(`Only ${p.stock} of "${p.name}" in stock.`);
      }
    }

    const t = calcTotals(cart, discount, set.taxRate);
    const paid = round2(payments.reduce((a, p) => a + Number(p.amount), 0));
    if (Math.abs(paid - t.total) > 0.009) throw new Error('Payment does not match the bill total.');

    const creditAmt = round2(payments.filter((p) => p.method === 'credit').reduce((a, p) => a + p.amount, 0));
    let mem = member ? d.members.find((x) => x.id === member.id) : null;
    if (creditAmt > 0) {
      if (!mem) throw new Error('Select a member for a credit sale.');
      if (!(mem.creditLimit > 0)) throw new Error(`${mem.name} has no credit limit set.`);
      if (round2(mem.balance + creditAmt) > mem.creditLimit) throw new Error(`Credit limit reached. Available credit: ${set.currency} ${round2(mem.creditLimit - mem.balance).toFixed(2)}`);
    }

    const now = Date.now();
    const billNo = (set.billPrefix || '') + pad(set.nextBillNo || 1, 6);
    const items = cart.map((it) => {
      const p = prodMap.get(it.productId);
      return { productId: it.productId, name: it.name, barcode: it.barcode, categoryId: p?.categoryId || '', unit: it.unit, qty: Number(it.qty), price: round2(it.price), cost: round2(p?.cost || 0), lineTotal: round2(it.price * it.qty) };
    });
    const cashPaid = payments.filter((p) => p.method === 'cash').reduce((a, p) => a + p.amount, 0);
    const sale = {
      id: uid('s-'),
      billNo,
      ts: now,
      day: dayKey(now),
      userId: user.id,
      userName: user.name,
      member: mem ? { id: mem.id, name: mem.name, rank: mem.rank, serviceNo: mem.serviceNo, type: mem.type } : null,
      items,
      ...t,
      taxRate: set.taxRate,
      discountLabel: discount && Number(discount.value) > 0 ? (discount.type === 'pct' ? `${discount.value}%` : '') : '',
      payments: payments.map((p) => ({ method: p.method, amount: round2(p.amount) })),
      tendered: cashPaid > 0 ? round2(Math.max(Number(tendered) || 0, cashPaid)) : 0,
      change: cashPaid > 0 ? round2(Math.max(0, (Number(tendered) || 0) - cashPaid)) : 0,
      note: note || '',
      status: 'completed',
    };
    if (mem && creditAmt > 0) sale.memberBalanceAfter = round2(mem.balance + creditAmt);

    const ops = [{ store: 'sales', type: 'put', value: sale }];
    const moves = [];
    const updatedProducts = new Map();
    items.forEach((it) => {
      const p = updatedProducts.get(it.productId) || prodMap.get(it.productId);
      if (!p || !p.trackStock) return;
      const np = { ...p, stock: round2(p.stock - it.qty) };
      updatedProducts.set(p.id, np);
      moves.push({ id: uid('sm-'), ts: now, productId: p.id, productName: p.name, type: 'sale', qty: -it.qty, cost: p.cost, ref: billNo, note: '', userName: user.name });
    });
    updatedProducts.forEach((p) => ops.push({ store: 'products', type: 'put', value: p }));
    moves.forEach((m) => ops.push({ store: 'stockMoves', type: 'put', value: m }));
    let nm = null;
    if (mem && creditAmt > 0) {
      nm = { ...mem, balance: round2(mem.balance + creditAmt) };
      ops.push({ store: 'members', type: 'put', value: nm });
    }
    const nextSet = { ...set, nextBillNo: (set.nextBillNo || 1) + 1 };
    ops.push({ store: 'settings', type: 'put', value: nextSet });

    await db.writeAtomic(ops);
    settingsRef.current = nextSet;
    setSettings(nextSet);
    setData((dd) => {
      let products = dd.products;
      updatedProducts.forEach((p) => (products = upsert(products, p)));
      return { ...dd, sales: [sale, ...dd.sales], products, stockMoves: [...moves, ...dd.stockMoves], members: nm ? upsert(dd.members, nm) : dd.members };
    });
    return sale;
  };

  const voidSale = async (saleId, reason) => {
    const d = dataRef.current;
    const s = d.sales.find((x) => x.id === saleId);
    if (!s || s.status === 'void') throw new Error('This bill is already void.');
    if (!reason?.trim()) throw new Error('Enter a reason for voiding.');
    const now = Date.now();
    const ns = { ...s, status: 'void', voidTs: now, voidBy: user.name, voidReason: reason.trim() };
    const ops = [{ store: 'sales', type: 'put', value: ns }];
    const moves = [];
    const upd = new Map();
    s.items.forEach((it) => {
      const p = upd.get(it.productId) || d.products.find((x) => x.id === it.productId);
      if (!p || !p.trackStock) return;
      const np = { ...p, stock: round2(p.stock + it.qty) };
      upd.set(p.id, np);
      moves.push({ id: uid('sm-'), ts: now, productId: p.id, productName: p.name, type: 'void', qty: it.qty, cost: p.cost, ref: s.billNo, note: reason, userName: user.name });
    });
    upd.forEach((p) => ops.push({ store: 'products', type: 'put', value: p }));
    moves.forEach((m) => ops.push({ store: 'stockMoves', type: 'put', value: m }));
    const credit = (s.payments || []).filter((p) => p.method === 'credit').reduce((a, p) => a + p.amount, 0);
    let nm = null;
    if (credit > 0 && s.member) {
      const m = d.members.find((x) => x.id === s.member.id);
      if (m) {
        nm = { ...m, balance: round2(Math.max(0, m.balance - credit)) };
        ops.push({ store: 'members', type: 'put', value: nm });
      }
    }
    await db.writeAtomic(ops);
    setData((dd) => {
      let products = dd.products;
      upd.forEach((p) => (products = upsert(products, p)));
      return { ...dd, sales: dd.sales.map((x) => (x.id === ns.id ? ns : x)), products, stockMoves: [...moves, ...dd.stockMoves], members: nm ? upsert(dd.members, nm) : dd.members };
    });
    return ns;
  };

  // ---------- held bills ----------
  const holdBill = async ({ cart, member, discount, label }) => {
    const h = { id: uid('h-'), ts: Date.now(), cart, member, discount, label: label || '', userName: user.name };
    await db.put('held', h);
    patch('held', (a) => [h, ...a]);
    return h;
  };
  const removeHeld = async (id) => {
    await db.remove('held', id);
    patch('held', (a) => a.filter((x) => x.id !== id));
  };

  // ---------- backup ----------
  const exportBackup = async () => {
    const out = { app: 'welfare-canteen-pos', version: 1, exportedAt: new Date().toISOString(), data: {} };
    for (const s of db.STORES) out.data[s] = await db.getAll(s);
    await saveSettings({ lastBackup: Date.now() });
    out.data.settings = [{ ...settingsRef.current, lastBackup: Date.now() }];
    return JSON.stringify(out);
  };
  const importBackup = async (json) => {
    let parsed;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new Error('This file is not a valid backup.');
    }
    if (parsed.app !== 'welfare-canteen-pos' || !parsed.data) throw new Error('This file is not a Welfare Canteen POS backup.');
    if (!parsed.data.users?.some((u) => u.role === 'admin')) throw new Error('The backup has no administrator account, so it was not restored.');
    for (const s of db.STORES) {
      await db.clearStore(s);
      if (Array.isArray(parsed.data[s])) await db.putMany(s, parsed.data[s]);
    }
    sessionStorage.removeItem(SESSION_KEY);
    setReady(false);
    await load();
  };
  const goLive = async () => {
    const d = dataRef.current;
    for (const s of ['sales', 'stockMoves', 'held', 'payments']) await db.clearStore(s);
    const sp = d.products.filter((p) => p.sample);
    const smm = d.members.filter((m) => m.sample);
    await db.writeAtomic([...sp.map((p) => ({ store: 'products', type: 'delete', id: p.id })), ...smm.map((m) => ({ store: 'members', type: 'delete', id: m.id }))]);
    // Remaining real members start with a clean balance because their history was cleared.
    const keepMembers = d.members.filter((m) => !m.sample).map((m) => ({ ...m, balance: 0 }));
    await db.putMany('members', keepMembers);
    await saveSettings({ nextBillNo: 1, sampleData: false });
    setData((dd) => ({ ...dd, sales: [], stockMoves: [], held: [], payments: [], products: dd.products.filter((p) => !p.sample), members: keepMembers }));
  };
  const factoryReset = async () => {
    for (const s of db.STORES) await db.clearStore(s);
    sessionStorage.removeItem(SESSION_KEY);
    setReady(false);
    await load();
  };

  const value = useMemo(
    () => ({
      ready, error, settings, user, ...data,
      login, logout, saveSettings,
      saveCategory, deleteCategory,
      saveProduct, deleteProduct, importProducts, nextItemBarcode,
      receiveStock, adjustStock,
      saveMember, deleteMember, settleMember,
      saveUser, deleteUser,
      completeSale, voidSale, holdBill, removeHeld,
      exportBackup, importBackup, goLive, factoryReset,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, error, settings, user, data]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
