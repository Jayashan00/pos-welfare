import { t } from '../lib/i18n';
import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { dayKey, download, fmtDateTime } from '../lib/utils';
import { labelsHTML, printHTML, printLabels, receiptHTML, testPrintHTML } from '../lib/print';
import { useConfirm, useToast } from '../components/ui';
import { IconDownload, IconPrinter, IconUpload } from '../components/Icons';
import { LABEL_SIZES, labelDims } from '../lib/print';
import { RecoveryCodeModal } from '../App';

const SAMPLE_SALE = {
  billNo: 'WC000123', ts: Date.now(), userName: 'Cpl. Silva', status: 'completed',
  member: { name: 'D. S. Perera', rank: 'Cpl.', serviceNo: 'S-20945' },
  items: [
    { name: 'Full cream milk powder 400 g', qty: 2, price: 1180, lineTotal: 2360, unit: 'pcs' },
    { name: 'Samba rice', qty: 2.5, price: 260, lineTotal: 650, unit: 'kg' },
    { name: 'Boot polish black', qty: 1, price: 275, lineTotal: 275, unit: 'pcs' },
    { name: 'Mineral water 1.5 L', qty: 3, price: 130, lineTotal: 390, unit: 'pcs' },
  ],
  subtotal: 3675, discount: 0, tax: 0, total: 3675,
  payments: [{ method: 'cash', amount: 3675 }], tendered: 5000, change: 1325,
};

function resizeLogo(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const max = 360;
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('That file is not an image.'));
    img.src = URL.createObjectURL(file);
  });
}

export default function Settings() {
  const store = useStore();
  const { settings, saveSettings, products } = store;
  const toast = useToast();
  const confirm = useConfirm();
  const [f, setF] = useState(() => ({ ...settings, memberTypesText: settings.memberTypes.join(', ') }));
  const [newCode, setNewCode] = useState(null);
  const dirty = useMemo(() => Object.keys(f).some((k) => !['memberTypesText', 'nextBillNo', 'lastBackup', 'nextItemCode', 'sampleData', 'memberTypes', 'recoveryHash', 'recoveryCreatedAt', 'labelSkip'].includes(k) && String(f[k] ?? '') !== String(settings[k] ?? '')) || f.memberTypesText !== settings.memberTypes.join(', '), [f, settings]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const save = async () => {
    if (!f.canteenName.trim()) return toast(t("Enter the canteen name."), 'error');
    const types = f.memberTypesText.split(',').map((s) => s.trim()).filter(Boolean);
    const { memberTypesText, nextBillNo, lastBackup, ...rest } = f;
    const next = await saveSettings({ ...rest, nextItemCode: settings.nextItemCode, sampleData: settings.sampleData, recoveryHash: settings.recoveryHash, recoveryCreatedAt: settings.recoveryCreatedAt, taxRate: Number(f.taxRate) || 0, lowStockDefault: Number(f.lowStockDefault) || 0, paperWidth: Number(f.paperWidth), receiptFontScale: Number(f.receiptFontScale), memberTypes: types.length ? types : settings.memberTypes });
    setF({ ...next, memberTypesText: next.memberTypes.join(', ') });
    store.logAudit('Settings changed');
    toast(t("Settings saved"));
  };

  const preview = useMemo(() => receiptHTML({ ...SAMPLE_SALE, billNo: (f.billPrefix || '') + '000123' }, { ...f, paperWidth: Number(f.paperWidth), receiptFontScale: Number(f.receiptFontScale) }), [f]);
  const sampleProduct = products.find((p) => p.barcode) || { name: 'Sample product 400 g', price: 1180, barcode: '2000000000015' };

  const backup = async () => {
    const json = await store.exportBackup();
    download(`canteen-pos-backup-${dayKey()}.json`, json, 'application/json');
    toast(t("Backup downloaded. Copy it to a USB drive."));
  };
  const restore = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!(await confirm({ title: t("Restore this backup?"), message: t('Everything on this computer will be replaced with the data in "{file}". You will be signed out.', { file: file.name }), confirmText: t("Restore backup"), danger: true }))) return;
    try { await store.importBackup(await file.text()); } catch (ex) { toast(ex.message, 'error'); }
  };
  const goLive = async () => {
    if (!(await confirm({ title: t("Start live trading?"), message: 'This removes the sample products and sample members, deletes all practice bills, stock history and held bills, and restarts bill numbers at 1. Your settings, users, categories and the products you added yourself are kept.', typeToConfirm: 'LIVE', confirmText: t("Start live trading"), danger: true }))) return;
    await store.goLive();
    setF((x) => ({ ...x, sampleData: false }));
    toast(t("Ready for live trading"));
  };
  const reset = async () => {
    if (!(await confirm({ title: t("Erase everything?"), message: 'All products, members, bills, users and settings on this computer will be deleted and the POS will start as new. Make a backup first.', typeToConfirm: 'ERASE', confirmText: t("Erase everything"), danger: true }))) return;
    await store.factoryReset();
  };

  return (
    <div className="page settings">
      <div className="settings-grid">
        <section className="panel">
          <h2>{t("Canteen details")}</h2>
          <div className="grid2">
            <label className="field wide"><span>{t("Canteen name")}</span><input value={f.canteenName} onChange={set('canteenName')} /></label>
            <label className="field wide"><span>{t('Canteen name in Sinhala')}</span><input value={f.canteenNameSi || ''} onChange={set('canteenNameSi')} lang="si" /></label>
            <label className="field wide"><span>{t("Unit or regiment")}</span><input value={f.unitName} onChange={set('unitName')} /></label>
            <label className="field wide"><span>{t('Unit or regiment in Sinhala')}</span><input value={f.unitNameSi || ''} onChange={set('unitNameSi')} lang="si" /></label>
            <label className="field"><span>{t("Address")}</span><input value={f.address} onChange={set('address')} /></label>
            <label className="field"><span>{t("Phone")}</span><input value={f.phone} onChange={set('phone')} /></label>
            <div className="field wide">
              <span>{t("Logo or crest")}</span>
              <div className="logo-row">
                {f.logo ? <img src={f.logo} alt="Logo" className="logo-prev" /> : <div className="logo-prev empty">{t("No logo")}</div>}
                <label className="btn"><IconUpload size={17} />{t("Choose image")}<input type="file" accept="image/*" hidden onChange={async (e) => { const file = e.target.files[0]; if (!file) return; try { setF({ ...f, logo: await resizeLogo(file) }); } catch (ex) { toast(ex.message, 'error'); } }} /></label>
                {f.logo && <button className="btn" onClick={() => setF({ ...f, logo: '' })}>{t("Remove")}</button>}
              </div>
              <small>{t("A simple black-and-white crest prints best on receipt paper.")}</small>
            </div>
          </div>
        </section>

        <section className="panel receipt-panel">
          <h2>{t("Receipt printer")}</h2>
          <div className="receipt-cols">
            <div className="stack">
              <label className="field"><span>{t("Paper width")}</span><select value={f.paperWidth} onChange={set('paperWidth')}><option value={80}>{t("80 mm (standard)")}</option><option value={58}>{t("58 mm (small)")}</option></select></label>
              <label className="field"><span>{t("Text size")}</span><select value={f.receiptFontScale} onChange={set('receiptFontScale')}><option value={0.9}>{t("Compact")}</option><option value={1}>{t("Normal")}</option><option value={1.15}>{t("Large")}</option></select></label>
              <label className="field"><span>{t('Receipt language')}</span><select value={f.receiptLanguage || 'both'} onChange={set('receiptLanguage')}><option value="both">{t('Sinhala and English')}</option><option value="si">{t('Sinhala only')}</option><option value="en">{t('English only')}</option></select><small>{t('Products without a Sinhala name print in English.')}</small></label>
              <label className="field"><span>{t("Message at the bottom")}</span><textarea rows={3} value={f.receiptFooter} onChange={set('receiptFooter')} /></label>
              <label className="field"><span>{t('Message at the bottom in Sinhala')}</span><textarea rows={3} value={f.receiptFooterSi || ''} onChange={set('receiptFooterSi')} lang="si" /></label>
              <label className="check"><input type="checkbox" checked={f.autoPrint} onChange={set('autoPrint')} /> {t("Print the receipt automatically after each sale")}</label>
              <label className="check"><input type="checkbox" checked={f.showLogoOnReceipt} onChange={set('showLogoOnReceipt')} /> {t("Print the logo")}</label>
              <label className="check"><input type="checkbox" checked={f.showBarcodeOnReceipt} onChange={set('showBarcodeOnReceipt')} /> {t("Print the bill number as a barcode (scan it in Bills to find the bill)")}</label>
              <button className="btn" onClick={() => printHTML(testPrintHTML({ ...f, paperWidth: Number(f.paperWidth) }), { widthMm: Number(f.paperWidth) })}><IconPrinter size={17} />{t("Print a test receipt")}</button>
            </div>
            <div className="receipt-preview" aria-label={t("Receipt preview")}>
              <iframe title={t("Receipt preview")} srcDoc={preview} style={{ width: `${Number(f.paperWidth) + 6}mm` }} />
            </div>
          </div>
        </section>

        <section className="panel">
          <h2>{t("Barcode label printer")}</h2>
          <div className="grid2">
            <label className="field"><span>{t("Label size")}</span><select value={f.labelSize} onChange={set('labelSize')}>
              <optgroup label={t('Label printer rolls')}>{LABEL_SIZES.filter((x) => x.group === 'roll').map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</optgroup>
              <optgroup label={t('A4 sticker sheets (any office printer)')}>{LABEL_SIZES.filter((x) => x.group === 'sheet').map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</optgroup>
            </select></label>
            <label className="field"><span>{t("Name on labels")}</span><input value={f.labelShopName} onChange={set('labelShopName')} disabled={!f.labelShowShopName} /></label>
            <label className="check wide"><input type="checkbox" checked={f.labelShowShopName} onChange={set('labelShowShopName')} /> {t("Print the canteen name on each label")}</label>
            <div className="label-preview wide">
              <iframe title={t("Label preview")} style={{ width: `${labelDims(f.labelSize).w + 4}mm`, height: `${labelDims(f.labelSize).h + 4}mm` }} srcDoc={labelsHTML([{ product: sampleProduct, copies: 1 }], f, f.labelSize, { single: true })} />
            </div>
            <button className="btn wide" onClick={() => printLabels([{ product: sampleProduct, copies: 1 }], f, f.labelSize)}><IconPrinter size={17} />{t("Print a test label")}</button>
          </div>
        </section>

        <section className="panel">
          <h2>{t("Selling rules")}</h2>
          <div className="grid2">
            <label className="field"><span>{t("Currency symbol")}</span><input value={f.currency} onChange={set('currency')} /></label>
            <label className="field"><span>{t("Tax added to bills (%)")}</span><input inputMode="decimal" value={f.taxRate} onChange={(e) => setF({ ...f, taxRate: e.target.value.replace(/[^\d.]/g, '') })} /><small>{t("Leave 0 if prices already include tax.")}</small></label>
            <label className="field"><span>{t("Bill number prefix")}</span><input value={f.billPrefix} onChange={(e) => setF({ ...f, billPrefix: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '') })} /><small>{t('Next bill: {no}', { no: (f.billPrefix || '') + String(settings.nextBillNo).padStart(6, '0') })}</small></label>
            <label className="field"><span>{t("Default low-stock warning")}</span><input inputMode="decimal" value={f.lowStockDefault} onChange={(e) => setF({ ...f, lowStockDefault: e.target.value.replace(/[^\d.]/g, '') })} /></label>
            <label className="field wide"><span>{t("Member types (separate with commas)")}</span><input value={f.memberTypesText} onChange={set('memberTypesText')} /></label>
            <div className="checks wide">
              <label className="check"><input type="checkbox" checked={f.allowNegativeStock} onChange={set('allowNegativeStock')} /> {t("Allow selling items the system shows as out of stock")}</label>
              <label className="check"><input type="checkbox" checked={f.requireMemberForSale} onChange={set('requireMemberForSale')} /> {t("Every sale must have a member")}</label>
              <label className="check"><input type="checkbox" checked={f.operatorDiscount} onChange={set('operatorDiscount')} /> {t("Till operators can give discounts")}</label>
              <label className="check"><input type="checkbox" checked={f.operatorPriceChange} onChange={set('operatorPriceChange')} /> {t("Till operators can change prices on a bill")}</label>
              <label className="check"><input type="checkbox" checked={f.beepOnScan} onChange={set('beepOnScan')} /> {t("Beep when an item is scanned")}</label>
            </div>
          </div>
        </section>

        <section className="panel">
          <h2>{t("Backup and data")}</h2>
          <p className="muted">{t('All data is saved in this browser on this computer. Download a backup at the end of every day and keep it on a USB drive.')} <b>{t('Last backup: {when}', { when: settings.lastBackup ? fmtDateTime(settings.lastBackup) : t('never') })}</b></p>
          <div className="row-btns">
            <button className="btn btn-primary" onClick={backup}><IconDownload size={17} />{t("Download backup")}</button>
            <label className="btn"><IconUpload size={17} />{t("Restore from backup")}<input type="file" accept=".json,application/json" hidden onChange={restore} /></label>
          </div>
          <div className="danger-zone">
            {settings.sampleData && (
              <div><b>{t("Start live trading")}</b><p className="muted small">{t("Removes the sample products, members and practice bills.")}</p><button className="btn btn-danger" onClick={goLive}>{t("Start live trading")}</button></div>
            )}
            <div><b>{t("Erase everything")}</b><p className="muted small">{t("Returns the POS to a brand new state.")}</p><button className="btn btn-danger" onClick={reset}>{t("Erase everything")}</button></div>
          </div>
        </section>

        <section className="panel">
          <h2>{t("Security")}</h2>
          <p className="muted">{t('The recovery code resets a forgotten administrator PIN from the sign-in screen without losing data.')} {settings.recoveryHash ? <b>{t('Current code issued {date}.', { date: fmtDateTime(settings.recoveryCreatedAt) })}</b> : <b>{t('No recovery code has been issued yet.')}</b>}</p>
          <div className="row-btns" style={{ marginTop: 12 }}>
            <button className="btn btn-primary" onClick={async () => {
              if (settings.recoveryHash && !(await confirm({ title: t("Issue a new recovery code?"), message: t("The old code will stop working. Destroy the old printed copy."), confirmText: t("Issue new code") }))) return;
              setNewCode(await store.createRecoveryCode());
            }}>{settings.recoveryHash ? t("Issue a new recovery code") : t("Create a recovery code")}</button>
          </div>
        </section>

        <section className="panel guide">
          <h2>{t('Hardware setup')}</h2>
          <dl>
            <dt>{t('Barcode scanners')}</dt><dd>{t('Plug both USB scanners in. They work straight away on every screen, with no setup. Set them to send Enter after each scan (the factory setting on most scanners).')} {t('Scanning works even when Windows is set to a Sinhala keyboard.')}</dd>
            <dt>{t('Receipt printer')}</dt><dd>{t('Install the printer driver, set the paper size to 80 mm (or 58 mm) and make it the default printer in Windows. Then press Print a test receipt above.')}</dd>
            <dt>{t('Print without the pop-up')}</dt><dd>{t('Add --kiosk-printing to the Chrome desktop shortcut so receipts print instantly to the default printer.')}</dd>
            <dt>{t('Label printer')}</dt><dd>{t('Install its driver and set the label size in the driver to match the roll and the size chosen above.')} {t('No label printer? Choose an A4 sticker sheet size and print on any office printer.')}</dd>
            <dt>{t('Customer display')}</dt><dd>{t('Connect a second monitor facing the counter. On the Sell screen press Customer display, drag the window to that monitor and double-click it for full screen.')}</dd>
            <dt>{t('Power cuts')}</dt><dd>{t('Every bill is saved the moment it is completed. Keep the computer, printer and router on the UPS.')}</dd>
          </dl>
        </section>
      </div>

      {newCode && <RecoveryCodeModal code={newCode} onClose={() => setNewCode(null)} />}
      {dirty && (
        <div className="savebar">
          <span>{t("You have unsaved changes.")}</span>
          <button className="btn" onClick={() => setF({ ...settings, memberTypesText: settings.memberTypes.join(', ') })}>{t("Undo")}</button>
          <button className="btn btn-primary" onClick={save}>{t("Save settings")}</button>
        </div>
      )}
    </div>
  );
}
