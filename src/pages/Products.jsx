import { useMemo, useRef, useState } from 'react';
import { canManage, useStore } from '../lib/store';
import { download, isWeighed, money, parseCSV, qtyStr, toCSV, round2, dayKey } from '../lib/utils';
import { barcodeSVG, printLabels } from '../lib/print';
import { Badge, Empty, Modal, useConfirm, useToast } from '../components/ui';
import { IconDownload, IconEdit, IconPlus, IconPrinter, IconSearch, IconTag, IconTrash, IconUpload } from '../components/Icons';

const UNITS = ['pcs', 'pkt', 'box', 'btl', 'kg', 'g', 'l', 'ml', 'm'];
export const LABEL_SIZES = [
  { id: '50x25', label: '50 × 25 mm' },
  { id: '38x25', label: '38 × 25 mm' },
  { id: '40x30', label: '40 × 30 mm' },
  { id: '60x40', label: '60 × 40 mm' },
];

export default function Products({ go }) {
  const { products, categories, settings, user, saveProduct, deleteProduct } = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [status, setStatus] = useState('active');
  const [sel, setSel] = useState(new Set());
  const [modal, setModal] = useState(null);
  const [limit, setLimit] = useState(150);
  const manage = canManage(user);
  const cur = settings.currency;

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return products.filter((p) => {
      if (status === 'active' && !p.active) return false;
      if (status === 'hidden' && p.active) return false;
      if (status === 'low' && !(p.active && p.trackStock && p.stock > 0 && p.stock <= p.reorderLevel)) return false;
      if (status === 'out' && !(p.active && p.trackStock && p.stock <= 0)) return false;
      if (cat && p.categoryId !== cat) return false;
      if (s && !(p.name.toLowerCase().includes(s) || (p.barcode || '').includes(s))) return false;
      return true;
    });
  }, [products, q, cat, status]);

  const catName = (id) => categories.find((c) => c.id === id)?.name || '—';
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allOn = list.length > 0 && list.slice(0, limit).every((p) => sel.has(p.id));

  const del = async (p) => {
    if (!(await confirm({ title: `Delete "${p.name}"?`, message: 'If this product has been sold before it will be hidden instead, so old bills stay correct.', confirmText: 'Delete', danger: true }))) return;
    const r = await deleteProduct(p.id);
    toast(r === 'hidden' ? 'Product hidden (it has past sales)' : 'Product deleted');
  };

  const exportCSV = () => {
    download(`products-${dayKey()}.csv`, toCSV(products, [
      { label: 'barcode', value: 'barcode' }, { label: 'name', value: 'name' }, { label: 'category', value: (p) => catName(p.categoryId) },
      { label: 'unit', value: 'unit' }, { label: 'cost', value: 'cost' }, { label: 'price', value: 'price' }, { label: 'stock', value: 'stock' },
      { label: 'reorder', value: 'reorderLevel' }, { label: 'active', value: (p) => (p.active ? 'yes' : 'no') },
    ]));
  };

  return (
    <div className="page">
      <div className="toolbar">
        <div className="search"><IconSearch size={18} /><input placeholder="Search name or scan barcode" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="active">On sale</option>
          <option value="low">Running low</option>
          <option value="out">Out of stock</option>
          <option value="hidden">Hidden</option>
          <option value="all">Everything</option>
        </select>
        <div className="toolbar-spacer" />
        <button className="btn" disabled={!sel.size} onClick={() => setModal({ type: 'labels' })}><IconTag size={17} />Print labels{sel.size ? ` (${sel.size})` : ''}</button>
        {manage && <button className="btn" onClick={() => setModal({ type: 'cats' })}>Categories</button>}
        {manage && <button className="btn" onClick={() => setModal({ type: 'import' })}><IconUpload size={17} />Import</button>}
        <button className="btn" onClick={exportCSV}><IconDownload size={17} />Export</button>
        {manage && <button className="btn btn-primary" onClick={() => setModal({ type: 'edit', product: null })}><IconPlus size={17} />Add product</button>}
      </div>

      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th className="chk"><input type="checkbox" aria-label="Select all" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(list.slice(0, limit).map((p) => p.id)))} /></th>
              <th>Product</th><th>Category</th><th className="n">Cost</th><th className="n">Price</th><th className="n">Margin</th><th className="n">Stock</th><th>Quick</th><th></th>
            </tr>
          </thead>
          <tbody>
            {list.slice(0, limit).map((p) => {
              const margin = p.price > 0 ? Math.round(((p.price - p.cost) / p.price) * 100) : 0;
              return (
                <tr key={p.id} className={!p.active ? 'dim' : ''}>
                  <td className="chk"><input type="checkbox" aria-label={`Select ${p.name}`} checked={sel.has(p.id)} onChange={() => toggle(p.id)} /></td>
                  <td><b>{p.name}</b><small className="mono">{p.barcode || 'No barcode'}</small></td>
                  <td>{catName(p.categoryId)}</td>
                  <td className="n">{money(p.cost, '')}</td>
                  <td className="n b">{money(p.price, '')}{p.unit !== 'pcs' && <small>/{p.unit}</small>}</td>
                  <td className="n">{margin}%</td>
                  <td className="n">{!p.trackStock ? <Badge>Not tracked</Badge> : p.stock <= 0 ? <Badge tone="bad">{qtyStr(p.stock)}</Badge> : p.stock <= p.reorderLevel ? <Badge tone="warn">{qtyStr(p.stock)}</Badge> : qtyStr(p.stock)}</td>
                  <td>
                    <input type="checkbox" aria-label="Show on the till as a quick item" checked={!!p.quick} disabled={!manage} onChange={() => saveProduct({ ...p, quick: !p.quick })} />
                  </td>
                  <td className="actions">
                    <button className="icon-btn" title="Print labels" onClick={() => setModal({ type: 'labels', only: p })}><IconPrinter size={17} /></button>
                    {manage && <button className="icon-btn" title="Edit" onClick={() => setModal({ type: 'edit', product: p })}><IconEdit size={17} /></button>}
                    {manage && <button className="icon-btn" title="Delete" onClick={() => del(p)}><IconTrash size={17} /></button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {list.length === 0 && <Empty title="No products match" action={manage && <button className="btn btn-primary" onClick={() => setModal({ type: 'edit', product: null })}>Add a product</button>}>Change the search or filters.</Empty>}
        {list.length > limit && <div className="more"><button className="btn" onClick={() => setLimit((l) => l + 300)}>Show more ({list.length - limit} left)</button></div>}
      </div>
      <p className="muted small foot-note">{list.length} products shown · Stock value at cost {money(products.filter((p) => p.active && p.trackStock && p.stock > 0).reduce((a, p) => a + p.cost * p.stock, 0), cur)}</p>

      {modal?.type === 'edit' && <ProductForm product={modal.product} onClose={() => setModal(null)} go={go} />}
      {modal?.type === 'labels' && <LabelsModal items={modal.only ? [modal.only] : products.filter((p) => sel.has(p.id))} onClose={() => setModal(null)} />}
      {modal?.type === 'cats' && <CategoriesModal onClose={() => setModal(null)} />}
      {modal?.type === 'import' && <ImportModal onClose={() => setModal(null)} />}
    </div>
  );
}

function ProductForm({ product, onClose, go }) {
  const { categories, settings, saveProduct, nextItemBarcode } = useStore();
  const toast = useToast();
  const isNew = !product;
  const [f, setF] = useState(() => product ? { ...product } : { name: '', barcode: '', categoryId: categories[0]?.id || '', unit: 'pcs', cost: '', price: '', stock: '', reorderLevel: settings.lowStockDefault, trackStock: true, quick: false, active: true });
  const [err, setErr] = useState('');
  const priceRef = useRef(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const numSet = (k) => (e) => setF({ ...f, [k]: e.target.value.replace(/[^\d.-]/g, '') });

  const submit = async (e) => {
    e.preventDefault();
    if (f.price === '' || Number(f.price) < 0) return setErr('Enter a selling price.');
    try {
      await saveProduct({ ...f, price: Number(f.price), cost: Number(f.cost) || 0, stock: Number(f.stock) || 0, reorderLevel: Number(f.reorderLevel) || 0 });
      toast(isNew ? 'Product added' : 'Product saved');
      onClose();
    } catch (ex) { setErr(ex.message); }
  };
  const margin = Number(f.price) > 0 ? Math.round(((Number(f.price) - Number(f.cost || 0)) / Number(f.price)) * 100) : null;

  return (
    <Modal title={isNew ? 'Add product' : 'Edit product'} onClose={onClose} width={680}>
      <form className="grid2" onSubmit={submit}>
        <label className="field wide"><span>Product name</span><input value={f.name} onChange={set('name')} required data-autofocus placeholder="e.g. Milk powder 400 g" /></label>
        <label className="field">
          <span>Barcode</span>
          <div className="input-row">
            <input
              className="mono"
              value={f.barcode}
              onChange={set('barcode')}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); priceRef.current?.focus(); } }}
              placeholder="Scan the item here"
            />
            <button type="button" className="btn" onClick={async () => setF({ ...f, barcode: await nextItemBarcode() })} title="Create an in-house barcode for items without one">Create</button>
          </div>
          <small>Scan the pack, or press Create for loose items and print a label.</small>
        </label>
        <label className="field"><span>Category</span><select value={f.categoryId} onChange={set('categoryId')}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="field"><span>Cost price ({settings.currency})</span><input inputMode="decimal" value={f.cost} onChange={numSet('cost')} /></label>
        <label className="field"><span>Selling price ({settings.currency})</span><input ref={priceRef} inputMode="decimal" value={f.price} onChange={numSet('price')} required />{margin !== null && <small>Margin {margin}%{margin < 0 ? ' (selling below cost)' : ''}</small>}</label>
        <label className="field"><span>Sold by</span><select value={f.unit} onChange={set('unit')}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select>{isWeighed(f.unit) && <small>The till will ask for the weight or amount.</small>}</label>
        {isNew ? (
          <label className="field"><span>Opening stock</span><input inputMode="decimal" value={f.stock} onChange={numSet('stock')} disabled={!f.trackStock} /></label>
        ) : (
          <div className="field"><span>Stock now</span><div className="readonly">{qtyStr(f.stock)} {f.unit} <button type="button" className="link" onClick={() => { onClose(); go('inventory'); }}>Adjust in Stock control</button></div></div>
        )}
        <label className="field"><span>Warn when stock falls to</span><input inputMode="decimal" value={f.reorderLevel} onChange={numSet('reorderLevel')} disabled={!f.trackStock} /></label>
        <div className="checks wide">
          <label className="check"><input type="checkbox" checked={f.trackStock} onChange={set('trackStock')} /> Track stock for this item</label>
          <label className="check"><input type="checkbox" checked={f.quick} onChange={set('quick')} /> Show as a quick item on the till</label>
          <label className="check"><input type="checkbox" checked={f.active} onChange={set('active')} /> On sale</label>
        </div>
        {f.barcode && <div className="bc-preview wide" dangerouslySetInnerHTML={{ __html: barcodeSVG(f.barcode, { height: 46 }) }} />}
        {err && <div className="form-error wide">{err}</div>}
        <div className="row-btns wide"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary grow">{isNew ? 'Add product' : 'Save changes'}</button></div>
      </form>
    </Modal>
  );
}

export function LabelsModal({ items, onClose }) {
  const { settings, saveSettings } = useStore();
  const toast = useToast();
  const [size, setSize] = useState(settings.labelSize || '50x25');
  const [copies, setCopies] = useState(() => Object.fromEntries(items.map((p) => [p.id, p.trackStock && p.stock > 0 && p.stock <= 50 ? Math.ceil(p.stock) : 1])));
  const missing = items.filter((p) => !p.barcode);
  const total = items.filter((p) => p.barcode).reduce((a, p) => a + (Number(copies[p.id]) || 0), 0);
  const print = async () => {
    const list = items.filter((p) => p.barcode && Number(copies[p.id]) > 0).map((p) => ({ product: p, copies: Math.min(500, Number(copies[p.id])) }));
    if (!list.length) return toast('Nothing to print.', 'error');
    if (size !== settings.labelSize) saveSettings({ labelSize: size });
    await printLabels(list, settings, size);
  };
  return (
    <Modal title="Print barcode labels" onClose={onClose} width={620} footer={<><button className="btn" onClick={onClose}>Close</button><button className="btn btn-primary" onClick={print} disabled={!total}><IconPrinter size={17} />Print {total} label{total === 1 ? '' : 's'}</button></>}>
      <div className="stack">
        <label className="field"><span>Label size (match the roll in the label printer)</span>
          <select value={size} onChange={(e) => setSize(e.target.value)}>{LABEL_SIZES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        </label>
        {missing.length > 0 && <div className="banner warn small">{missing.length} product{missing.length > 1 ? 's have' : ' has'} no barcode and will be skipped. Edit the product and press Create to give it one.</div>}
        <div className="label-list">
          {items.filter((p) => p.barcode).map((p) => (
            <div key={p.id} className="label-row">
              <span><b>{p.name}</b><small>{p.barcode} · {money(p.price, settings.currency)}</small></span>
              <label className="copies">Copies <input type="number" min="0" max="500" value={copies[p.id]} onChange={(e) => setCopies({ ...copies, [p.id]: e.target.value })} /></label>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function CategoriesModal({ onClose }) {
  const { categories, products, saveCategory, deleteCategory } = useStore();
  const toast = useToast();
  const [name, setName] = useState('');
  const [color, setColor] = useState('#5B7A3A');
  const add = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (categories.some((c) => c.name.toLowerCase() === name.trim().toLowerCase())) return toast('That category already exists.', 'error');
    await saveCategory({ name: name.trim(), color });
    setName('');
    toast('Category added');
  };
  return (
    <Modal title="Categories" onClose={onClose} width={520}>
      <div className="stack">
        {categories.map((c) => (
          <div key={c.id} className="cat-row">
            <input type="color" value={c.color} onChange={(e) => saveCategory({ ...c, color: e.target.value })} aria-label="Colour" />
            <input defaultValue={c.name} onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && saveCategory({ ...c, name: e.target.value.trim() })} aria-label="Category name" />
            <small className="muted">{products.filter((p) => p.categoryId === c.id).length} items</small>
            <button className="icon-btn" aria-label="Delete category" onClick={async () => { try { await deleteCategory(c.id); toast('Category deleted'); } catch (ex) { toast(ex.message, 'error'); } }}><IconTrash size={17} /></button>
          </div>
        ))}
        <form className="cat-row add" onSubmit={add}>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Colour" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category name" />
          <button className="btn btn-primary">Add</button>
        </form>
      </div>
    </Modal>
  );
}

function ImportModal({ onClose }) {
  const { importProducts } = useStore();
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const template = () => download('product-import-template.csv', 'barcode,name,category,unit,cost,price,stock,reorder\r\n4792024012345,Milk powder 400 g,Groceries,pcs,1050,1180,40,10\r\n,Samba rice,Groceries,kg,230,260,150,20\r\n');
  const onFile = async (e) => {
    setErr('');
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const data = parseCSV(text.replace(/^\ufeff/, ''));
    if (data.length < 2) return setErr('The file has no product rows.');
    const head = data[0].map((h) => h.trim().toLowerCase());
    if (!head.includes('name') || !head.includes('price')) return setErr('The first row must include at least the columns "name" and "price". Download the template to see the layout.');
    const idx = (k) => head.indexOf(k);
    const get = (r, k) => (idx(k) >= 0 ? (r[idx(k)] || '').trim() : '');
    setRows(data.slice(1).map((r) => ({
      barcode: get(r, 'barcode'), name: get(r, 'name'), category: get(r, 'category'), unit: get(r, 'unit') || undefined,
      cost: get(r, 'cost') === '' ? undefined : round2(get(r, 'cost')), price: get(r, 'price') === '' ? undefined : round2(get(r, 'price')),
      stock: get(r, 'stock'), reorder: get(r, 'reorder'),
    })).filter((r) => r.name));
  };
  const run = async () => {
    const r = await importProducts(rows);
    toast(`${r.added} added, ${r.updated} updated`);
    onClose();
  };
  return (
    <Modal title="Import products from a spreadsheet" onClose={onClose} width={560} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!rows?.length} onClick={run}>Import {rows?.length || ''} products</button></>}>
      <div className="stack">
        <p>Save your product list from Excel as <b>CSV</b>, then choose the file. Products with a barcode that already exists are updated, the rest are added.</p>
        <button className="btn" onClick={template}><IconDownload size={17} />Download the template</button>
        <input type="file" accept=".csv,text/csv" onChange={onFile} />
        {err && <div className="form-error">{err}</div>}
        {rows && <p className="muted">{rows.length} product rows found and ready to import.</p>}
      </div>
    </Modal>
  );
}
