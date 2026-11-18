import { t, nameOf } from '../lib/i18n';
import { useMemo, useRef, useState } from 'react';
import { canManage, useStore } from '../lib/store';
import { download, isWeighed, money, parseCSV, qtyStr, toCSV, round2, dayKey } from '../lib/utils';
import { barcodeSVG, printLabels, LABEL_SIZES, labelDims } from '../lib/print';
import { Badge, Empty, Modal, useConfirm, useToast } from '../components/ui';
import { IconDownload, IconEdit, IconPlus, IconPrinter, IconSearch, IconTag, IconTrash, IconUpload } from '../components/Icons';

const UNITS = ['pcs', 'pkt', 'box', 'btl', 'kg', 'g', 'l', 'ml', 'm'];
export { LABEL_SIZES } from '../lib/print';

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
      if (s && !(p.name.toLowerCase().includes(s) || (p.nameSi || '').includes(q.trim()) || (p.barcode || '').includes(s))) return false;
      return true;
    });
  }, [products, q, cat, status]);

  const catName = (id) => nameOf(categories.find((c) => c.id === id)) || '—';
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allOn = list.length > 0 && list.slice(0, limit).every((p) => sel.has(p.id));

  const del = async (p) => {
    if (!(await confirm({ title: t('Delete "{name}"?', { name: p.name }), message: t("If this product has been sold before it will be hidden instead, so old bills stay correct."), confirmText: t("Delete"), danger: true }))) return;
    const r = await deleteProduct(p.id);
    toast(r === 'hidden' ? t("Product hidden (it has past sales)") : 'Product deleted');
  };

  const exportCSV = () => {
    download(`products-${dayKey()}.csv`, toCSV(products, [
      { label: 'barcode', value: 'barcode' }, { label: 'name', value: 'name' }, { label: 'name_si', value: (p) => p.nameSi || '' }, { label: 'category', value: (p) => catName(p.categoryId) },
      { label: 'unit', value: 'unit' }, { label: 'cost', value: 'cost' }, { label: 'price', value: 'price' }, { label: 'stock', value: 'stock' },
      { label: 'reorder', value: 'reorderLevel' }, { label: 'active', value: (p) => (p.active ? 'yes' : 'no') },
    ]));
  };

  return (
    <div className="page">
      <div className="toolbar">
        <div className="search"><IconSearch size={18} /><input placeholder={t("Search name or scan barcode")} value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label={t("Category")}>
          <option value="">{t("All categories")}</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{nameOf(c)}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t("Status")}>
          <option value="active">{t("On sale")}</option>
          <option value="low">{t("Running low")}</option>
          <option value="out">{t("Out of stock")}</option>
          <option value="hidden">{t("Hidden")}</option>
          <option value="all">{t("Everything")}</option>
        </select>
        <div className="toolbar-spacer" />
        <button className="btn" disabled={!sel.size} onClick={() => setModal({ type: 'labels' })}><IconTag size={17} />{t('Print labels')}{sel.size ? ` (${sel.size})` : ''}</button>
        {manage && <button className="btn" onClick={() => setModal({ type: 'cats' })}>{t("Categories")}</button>}
        {manage && <button className="btn" onClick={() => setModal({ type: 'import' })}><IconUpload size={17} />{t("Import")}</button>}
        <button className="btn" onClick={exportCSV}><IconDownload size={17} />{t("Export")}</button>
        {manage && <button className="btn btn-primary" onClick={() => setModal({ type: 'edit', product: null })}><IconPlus size={17} />{t("Add product")}</button>}
      </div>

      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th className="chk"><input type="checkbox" aria-label={t("Select all")} checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(list.slice(0, limit).map((p) => p.id)))} /></th>
              <th>{t("Product")}</th><th>{t("Category")}</th><th className="n">{t("Cost")}</th><th className="n">{t("Price")}</th><th className="n">{t("Margin")}</th><th className="n">{t("Stock")}</th><th>{t("Quick")}</th><th></th>
            </tr>
          </thead>
          <tbody>
            {list.slice(0, limit).map((p) => {
              const margin = p.price > 0 ? Math.round(((p.price - p.cost) / p.price) * 100) : 0;
              return (
                <tr key={p.id} className={!p.active ? 'dim' : ''}>
                  <td className="chk"><input type="checkbox" aria-label={p.name} checked={sel.has(p.id)} onChange={() => toggle(p.id)} /></td>
                  <td><b>{p.name}</b>{p.nameSi && <span className="si-sub">{p.nameSi}</span>}<small className="mono">{p.barcode || t('No barcode')}</small></td>
                  <td>{catName(p.categoryId)}</td>
                  <td className="n">{money(p.cost, '')}</td>
                  <td className="n b">{money(p.price, '')}{p.unit !== 'pcs' && <small>/{p.unit}</small>}</td>
                  <td className="n">{margin}%</td>
                  <td className="n">{!p.trackStock ? <Badge>{t("Not tracked")}</Badge> : p.stock <= 0 ? <Badge tone="bad">{qtyStr(p.stock)}</Badge> : p.stock <= p.reorderLevel ? <Badge tone="warn">{qtyStr(p.stock)}</Badge> : qtyStr(p.stock)}</td>
                  <td>
                    <input type="checkbox" aria-label={t("Show on the till as a quick item")} checked={!!p.quick} disabled={!manage} onChange={() => saveProduct({ ...p, quick: !p.quick })} />
                  </td>
                  <td className="actions">
                    <button className="icon-btn" title={t("Print labels")} onClick={() => setModal({ type: 'labels', only: p })}><IconPrinter size={17} /></button>
                    {manage && <button className="icon-btn" title={t("Edit")} onClick={() => setModal({ type: 'edit', product: p })}><IconEdit size={17} /></button>}
                    {manage && <button className="icon-btn" title={t("Delete")} onClick={() => del(p)}><IconTrash size={17} /></button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {list.length === 0 && <Empty title={t("No products match")} action={manage && <button className="btn btn-primary" onClick={() => setModal({ type: 'edit', product: null })}>{t("Add a product")}</button>}>{t("Change the search or filters.")}</Empty>}
        {list.length > limit && <div className="more"><button className="btn" onClick={() => setLimit((l) => l + 300)}>{t('Show more')} ({list.length - limit})</button></div>}
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
  const [f, setF] = useState(() => product ? { nameSi: '', ...product } : { name: '', nameSi: '', barcode: '', categoryId: categories[0]?.id || '', unit: 'pcs', cost: '', price: '', stock: '', reorderLevel: settings.lowStockDefault, trackStock: true, quick: false, active: true });
  const [err, setErr] = useState('');
  const priceRef = useRef(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const numSet = (k) => (e) => setF({ ...f, [k]: e.target.value.replace(/[^\d.-]/g, '') });

  const submit = async (e) => {
    e.preventDefault();
    if (f.price === '' || Number(f.price) < 0) return setErr(t("Enter a selling price."));
    try {
      await saveProduct({ ...f, nameSi: (f.nameSi || '').trim(), price: Number(f.price), cost: Number(f.cost) || 0, stock: Number(f.stock) || 0, reorderLevel: Number(f.reorderLevel) || 0 });
      toast(isNew ? t("Product added") : 'Product saved');
      onClose();
    } catch (ex) { setErr(ex.message); }
  };
  const margin = Number(f.price) > 0 ? Math.round(((Number(f.price) - Number(f.cost || 0)) / Number(f.price)) * 100) : null;

  return (
    <Modal title={isNew ? t("Add product") : t("Edit product")} onClose={onClose} width={680}>
      <form className="grid2" onSubmit={submit}>
        <label className="field"><span>{t('Product name (English)')}</span><input value={f.name} onChange={set('name')} required data-autofocus placeholder="e.g. Milk powder 400 g" /></label>
        <label className="field"><span>{t('Product name in Sinhala (optional)')}</span><input value={f.nameSi || ''} onChange={set('nameSi')} lang="si" placeholder="උදා: කිරිපිටි 400 g" /><small>{t('Printed on receipts and labels and shown on the customer display.')}</small></label>
        <label className="field">
          <span>{t("Barcode")}</span>
          <div className="input-row">
            <input
              className="mono"
              data-ascii
              value={f.barcode}
              onChange={set('barcode')}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); priceRef.current?.focus(); } }}
              placeholder={t("Scan the item here")}
            />
            <button type="button" className="btn" onClick={async () => setF({ ...f, barcode: await nextItemBarcode() })} title={t("Create an in-house barcode for items without one")}>{t("Create")}</button>
          </div>
          <small>{t("Scan the pack, or press Create for loose items and print a label.")}</small>
        </label>
        <label className="field"><span>{t("Category")}</span><select value={f.categoryId} onChange={set('categoryId')}>{categories.map((c) => <option key={c.id} value={c.id}>{nameOf(c)}</option>)}</select></label>
        <label className="field"><span>{t('Cost price ({cur})', { cur: settings.currency })}</span><input inputMode="decimal" value={f.cost} onChange={numSet('cost')} /></label>
        <label className="field"><span>{t('Selling price ({cur})', { cur: settings.currency })}</span><input ref={priceRef} inputMode="decimal" value={f.price} onChange={numSet('price')} required />{margin !== null && <small>Margin {margin}%{margin < 0 ? t(" (selling below cost)") : ''}</small>}</label>
        <label className="field"><span>{t("Sold by")}</span><select value={f.unit} onChange={set('unit')}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select>{isWeighed(f.unit) && <small>{t("The till will ask for the weight or amount.")}</small>}</label>
        {isNew ? (
          <label className="field"><span>{t("Opening stock")}</span><input inputMode="decimal" value={f.stock} onChange={numSet('stock')} disabled={!f.trackStock} /></label>
        ) : (
          <div className="field"><span>{t("Stock now")}</span><div className="readonly">{qtyStr(f.stock)} {f.unit} <button type="button" className="link" onClick={() => { onClose(); go('inventory'); }}>{t("Adjust in Stock control")}</button></div></div>
        )}
        <label className="field"><span>{t("Warn when stock falls to")}</span><input inputMode="decimal" value={f.reorderLevel} onChange={numSet('reorderLevel')} disabled={!f.trackStock} /></label>
        <div className="checks wide">
          <label className="check"><input type="checkbox" checked={f.trackStock} onChange={set('trackStock')} /> {t("Track stock for this item")}</label>
          <label className="check"><input type="checkbox" checked={f.quick} onChange={set('quick')} /> {t("Show as a quick item on the till")}</label>
          <label className="check"><input type="checkbox" checked={f.active} onChange={set('active')} /> {t("On sale")}</label>
        </div>
        {f.barcode && <div className="bc-preview wide" dangerouslySetInnerHTML={{ __html: barcodeSVG(f.barcode, { height: 46 }) }} />}
        {err && <div className="form-error wide">{err}</div>}
        <div className="row-btns wide"><button type="button" className="btn" onClick={onClose}>{t("Cancel")}</button><button className="btn btn-primary grow">{isNew ? t("Add product") : t("Save changes")}</button></div>
      </form>
    </Modal>
  );
}

export function LabelsModal({ items, onClose }) {
  const { settings, saveSettings } = useStore();
  const toast = useToast();
  const [size, setSize] = useState(settings.labelSize || '50x25');
  const [skip, setSkip] = useState(0);
  const [copies, setCopies] = useState(() => Object.fromEntries(items.map((p) => [p.id, p.trackStock && p.stock > 0 && p.stock <= 50 ? Math.ceil(p.stock) : 1])));
  const missing = items.filter((p) => !p.barcode);
  const total = items.filter((p) => p.barcode).reduce((a, p) => a + (Number(copies[p.id]) || 0), 0);
  const print = async () => {
    const list = items.filter((p) => p.barcode && Number(copies[p.id]) > 0).map((p) => ({ product: p, copies: Math.min(500, Number(copies[p.id])) }));
    if (!list.length) return toast(t("Nothing to print."), 'error');
    if (size !== settings.labelSize) saveSettings({ labelSize: size });
    await printLabels(list, settings, size, { skip: labelDims(size).sheet ? Number(skip) || 0 : 0 });
  };
  return (
    <Modal title={t("Print barcode labels")} onClose={onClose} width={620} footer={<><button className="btn" onClick={onClose}>{t("Close")}</button><button className="btn btn-primary" onClick={print} disabled={!total}><IconPrinter size={17} />{t('Print {n} labels', { n: total })}</button></>}>
      <div className="stack">
        <label className="field"><span>{t("Label size (match the roll in the label printer)")}</span>
          <select value={size} onChange={(e) => setSize(e.target.value)}>
            <optgroup label={t('Label printer rolls')}>{LABEL_SIZES.filter((x) => x.group === 'roll').map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</optgroup>
            <optgroup label={t('A4 sticker sheets (any office printer)')}>{LABEL_SIZES.filter((x) => x.group === 'sheet').map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</optgroup>
          </select>
        </label>
        {labelDims(size).sheet && (
          <label className="field"><span>{t('Labels to skip on the sheet')}</span><input type="number" min="0" max={labelDims(size).sheet.cols * labelDims(size).sheet.rows - 1} value={skip} onChange={(e) => setSkip(e.target.value)} data-skip /><small>{t('Skip the first {n} labels on a part-used sheet', { n: Number(skip) || 0 })}</small></label>
        )}
        {missing.length > 0 && <div className="banner warn small">{missing.length} product{missing.length > 1 ? 's have' : ' has'} no barcode and will be skipped. Edit the product and press Create to give it one.</div>}
        <div className="label-list">
          {items.filter((p) => p.barcode).map((p) => (
            <div key={p.id} className="label-row">
              <span><b>{p.name}</b><small>{p.barcode} · {money(p.price, settings.currency)}</small></span>
              <label className="copies">{t("Copies")} <input type="number" min="0" max="500" value={copies[p.id]} onChange={(e) => setCopies({ ...copies, [p.id]: e.target.value })} /></label>
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
  const [nameSi, setNameSi] = useState('');
  const [color, setColor] = useState('#5B7A3A');
  const add = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (categories.some((c) => c.name.toLowerCase() === name.trim().toLowerCase())) return toast(t("That category already exists."), 'error');
    await saveCategory({ name: name.trim(), nameSi: nameSi.trim(), color });
    setName('');
    setNameSi('');
    toast(t("Category added"));
  };
  return (
    <Modal title={t("Categories")} onClose={onClose} width={520}>
      <div className="stack">
        {categories.map((c) => (
          <div key={c.id} className="cat-row">
            <input type="color" value={c.color} onChange={(e) => saveCategory({ ...c, color: e.target.value })} aria-label={t("Colour")} />
            <input defaultValue={c.name} onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && saveCategory({ ...c, name: e.target.value.trim() })} aria-label={t("Category name")} />
            <input defaultValue={c.nameSi || ''} lang="si" placeholder={t('Sinhala name')} onBlur={(e) => e.target.value.trim() !== (c.nameSi || '') && saveCategory({ ...c, nameSi: e.target.value.trim() })} aria-label={t('Sinhala name')} />
            <small className="muted">{products.filter((p) => p.categoryId === c.id).length} items</small>
            <button className="icon-btn" aria-label={t("Delete category")} onClick={async () => { try { await deleteCategory(c.id); toast(t("Category deleted")); } catch (ex) { toast(ex.message, 'error'); } }}><IconTrash size={17} /></button>
          </div>
        ))}
        <form className="cat-row add" onSubmit={add}>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label={t("Colour")} />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("New category name")} />
          <input value={nameSi} onChange={(e) => setNameSi(e.target.value)} placeholder={t('Sinhala name')} lang="si" />
          <button className="btn btn-primary">{t("Add")}</button>
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
  const template = () => download('product-import-template.csv', 'barcode,name,name_si,category,unit,cost,price,stock,reorder\r\n4792024012345,Milk powder 400 g,කිරිපිටි 400 g,Groceries,pcs,1050,1180,40,10\r\n,Samba rice,සම්බා සහල්,Groceries,kg,230,260,150,20\r\n');
  const onFile = async (e) => {
    setErr('');
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const data = parseCSV(text.replace(/^\ufeff/, ''));
    if (data.length < 2) return setErr(t("The file has no product rows."));
    const head = data[0].map((h) => h.trim().toLowerCase());
    if (!head.includes('name') || !head.includes('price')) return setErr(t('The first row must include at least the columns "name" and "price". Download the template to see the layout.'));
    const idx = (k) => head.indexOf(k);
    const get = (r, k) => (idx(k) >= 0 ? (r[idx(k)] || '').trim() : '');
    setRows(data.slice(1).map((r) => ({
      barcode: get(r, 'barcode'), name: get(r, 'name'), nameSi: get(r, 'name_si'), category: get(r, 'category'), unit: get(r, 'unit') || undefined,
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
    <Modal title={t("Import products from a spreadsheet")} onClose={onClose} width={560} footer={<><button className="btn" onClick={onClose}>{t("Cancel")}</button><button className="btn btn-primary" disabled={!rows?.length} onClick={run}>Import {rows?.length || ''} products</button></>}>
      <div className="stack">
        <p>{t('Save your product list from Excel as CSV UTF-8, then choose the file. Products with a barcode that already exists are updated, the rest are added. Add a name_si column for Sinhala names.')}</p>
        <button className="btn" onClick={template}><IconDownload size={17} />{t("Download the template")}</button>
        <input type="file" accept=".csv,text/csv" onChange={onFile} />
        {err && <div className="form-error">{err}</div>}
        {rows && <p className="muted">{rows.length} product rows found and ready to import.</p>}
      </div>
    </Modal>
  );
}
