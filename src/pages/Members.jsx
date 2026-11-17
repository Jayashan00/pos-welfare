import { useMemo, useState } from 'react';
import { canManage, useStore } from '../lib/store';
import { dayKey, download, fmtDateTime, money, toCSV, fmtDate } from '../lib/utils';
import { payLabel, printA4 } from '../lib/print';
import { Badge, Empty, Modal, NumPad, applyPadKey, useConfirm, useToast } from '../components/ui';
import { IconDownload, IconEdit, IconEye, IconPlus, IconPrinter, IconSearch, IconTrash, IconWallet } from '../components/Icons';

export default function Members() {
  const { members, settings, user, deleteMember } = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [owing, setOwing] = useState(false);
  const [modal, setModal] = useState(null);
  const manage = canManage(user);
  const cur = settings.currency;

  const list = useMemo(() => members.filter((m) => m.active && (!type || m.type === type) && (!owing || m.balance > 0) && (!q || `${m.serviceNo} ${m.name} ${m.rank} ${m.unit}`.toLowerCase().includes(q.toLowerCase()))), [members, q, type, owing]);
  const owed = list.reduce((a, m) => a + (m.balance || 0), 0);

  const printBalances = () => {
    const rows = members.filter((m) => m.balance > 0).sort((a, b) => a.serviceNo.localeCompare(b.serviceNo));
    printA4({
      title: 'Member credit balances', subtitle: `As at ${fmtDateTime(Date.now())}`, settings,
      sections: [{ title: 'Amounts to recover', columns: [{ label: 'Service no.' }, { label: 'Rank' }, { label: 'Name' }, { label: 'Unit / Coy' }, { label: 'Balance owed', num: true }],
        rows: rows.map((m) => [m.serviceNo, m.rank, m.name, m.unit, money(m.balance, '')]), foot: ['Total', '', `${rows.length} members`, '', money(rows.reduce((a, m) => a + m.balance, 0), cur)] }],
    });
  };
  const exportCSV = () => download(`members-${dayKey()}.csv`, toCSV(members.filter((m) => m.active), [
    { label: 'Service no', value: 'serviceNo' }, { label: 'Rank', value: 'rank' }, { label: 'Name', value: 'name' }, { label: 'Type', value: 'type' }, { label: 'Unit', value: 'unit' }, { label: 'Phone', value: 'phone' }, { label: 'Credit limit', value: 'creditLimit' }, { label: 'Balance owed', value: 'balance' },
  ]));

  const del = async (m) => {
    if (!(await confirm({ title: `Remove ${m.name}?`, message: 'Members with past bills are hidden instead of deleted.', confirmText: 'Remove', danger: true }))) return;
    try { const r = await deleteMember(m.id); toast(r === 'hidden' ? 'Member hidden' : 'Member deleted'); } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="page">
      <div className="toolbar">
        <div className="search"><IconSearch size={18} /><input placeholder="Service no., name, rank or unit" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Member type"><option value="">All types</option>{settings.memberTypes.map((t) => <option key={t}>{t}</option>)}</select>
        <label className="check"><input type="checkbox" checked={owing} onChange={(e) => setOwing(e.target.checked)} /> Owing money only</label>
        <div className="toolbar-spacer" />
        {manage && <button className="btn" onClick={printBalances}><IconPrinter size={17} />Print balances</button>}
        <button className="btn" onClick={exportCSV}><IconDownload size={17} />Export</button>
        {manage && <button className="btn btn-primary" onClick={() => setModal({ type: 'edit' })}><IconPlus size={17} />Add member</button>}
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Service no.</th><th>Name</th><th>Type</th><th>Unit</th><th className="n">Credit limit</th><th className="n">Owes</th><th></th></tr></thead>
          <tbody>
            {list.map((m) => (
              <tr key={m.id}>
                <td className="mono b">{m.serviceNo}</td>
                <td><b>{m.rank} {m.name}</b>{m.discountPct > 0 && <small>{m.discountPct}% member discount</small>}</td>
                <td>{m.type}</td>
                <td>{m.unit}</td>
                <td className="n">{m.creditLimit > 0 ? money(m.creditLimit, '') : <span className="muted">No credit</span>}</td>
                <td className="n">{m.balance > 0 ? <Badge tone={m.balance >= m.creditLimit * 0.9 ? 'bad' : 'warn'}>{money(m.balance, '')}</Badge> : '—'}</td>
                <td className="actions">
                  <button className="icon-btn" title="Statement" onClick={() => setModal({ type: 'statement', member: m })}><IconEye size={17} /></button>
                  {manage && m.balance > 0 && <button className="icon-btn" title="Record a payment" onClick={() => setModal({ type: 'settle', member: m })}><IconWallet size={17} /></button>}
                  {manage && <button className="icon-btn" title="Edit" onClick={() => setModal({ type: 'edit', member: m })}><IconEdit size={17} /></button>}
                  {manage && <button className="icon-btn" title="Remove" onClick={() => del(m)}><IconTrash size={17} /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <Empty title="No members found">{manage ? 'Add service personnel so they can buy on credit and get member discounts.' : 'Ask a manager to add members.'}</Empty>}
      </div>
      <p className="muted small foot-note">{list.length} members · Total owed {money(owed, cur)}</p>

      {modal?.type === 'edit' && <MemberForm member={modal.member} onClose={() => setModal(null)} />}
      {modal?.type === 'settle' && <SettleModal member={modal.member} onClose={() => setModal(null)} />}
      {modal?.type === 'statement' && <Statement member={modal.member} onClose={() => setModal(null)} />}
    </div>
  );
}

function MemberForm({ member, onClose }) {
  const { settings, saveMember } = useStore();
  const toast = useToast();
  const [f, setF] = useState(() => member ? { ...member } : { serviceNo: '', rank: '', name: '', type: settings.memberTypes[0], unit: '', phone: '', creditLimit: '', discountPct: '' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    try { await saveMember(f); toast(member ? 'Member saved' : 'Member added'); onClose(); } catch (ex) { setErr(ex.message); }
  };
  return (
    <Modal title={member ? 'Edit member' : 'Add member'} onClose={onClose} width={620}>
      <form className="grid2" onSubmit={submit}>
        <label className="field"><span>Service number</span><input value={f.serviceNo} onChange={set('serviceNo')} required data-autofocus onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} /><small>Scan the ID card if it has a barcode.</small></label>
        <label className="field"><span>Rank</span><input value={f.rank} onChange={set('rank')} placeholder="e.g. Sgt." /></label>
        <label className="field wide"><span>Full name</span><input value={f.name} onChange={set('name')} required /></label>
        <label className="field"><span>Type</span><select value={f.type} onChange={set('type')}>{settings.memberTypes.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label className="field"><span>Unit / company</span><input value={f.unit} onChange={set('unit')} /></label>
        <label className="field"><span>Phone</span><input value={f.phone} onChange={set('phone')} inputMode="tel" /></label>
        <label className="field"><span>Credit limit ({settings.currency})</span><input inputMode="decimal" value={f.creditLimit} onChange={(e) => setF({ ...f, creditLimit: e.target.value.replace(/[^\d.]/g, '') })} /><small>Leave 0 for cash-only members.</small></label>
        <label className="field"><span>Member discount (%)</span><input inputMode="decimal" value={f.discountPct} onChange={(e) => setF({ ...f, discountPct: e.target.value.replace(/[^\d.]/g, '') })} /><small>Applied automatically on the till.</small></label>
        {member && <div className="field"><span>Balance owed</span><div className="readonly">{money(member.balance, settings.currency)}</div></div>}
        {err && <div className="form-error wide">{err}</div>}
        <div className="row-btns wide"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary grow">{member ? 'Save changes' : 'Add member'}</button></div>
      </form>
    </Modal>
  );
}

function SettleModal({ member, onClose }) {
  const { settleMember, settings, members } = useStore();
  const toast = useToast();
  const m = members.find((x) => x.id === member.id) || member;
  const [amt, setAmt] = useState(String(m.balance));
  const [method, setMethod] = useState('salary');
  const [note, setNote] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try { await settleMember({ memberId: m.id, amount: Number(amt), method, note }); toast('Payment recorded'); onClose(); } catch (ex) { toast(ex.message, 'error'); }
  };
  return (
    <Modal title={`Payment from ${m.rank} ${m.name}`} onClose={onClose} width={420}>
      <form className="stack" onSubmit={submit}>
        <div className="calc-line">Owes <b>{money(m.balance, settings.currency)}</b></div>
        <label className="field"><span>Amount paid ({settings.currency})</span><input className="big-input" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^\d.]/g, ''))} data-autofocus /></label>
        <NumPad onKey={(k) => setAmt((v) => applyPadKey(v, k))} />
        <label className="field"><span>Paid by</span>
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="salary">Salary deduction</option><option value="cash">Cash</option><option value="card">Card</option><option value="qr">QR / Online</option>
          </select>
        </label>
        <label className="field"><span>Note</span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. November pay" /></label>
        <button className="btn btn-primary btn-lg">Record payment</button>
      </form>
    </Modal>
  );
}

function Statement({ member, onClose }) {
  const { sales, payments, settings, members } = useStore();
  const m = members.find((x) => x.id === member.id) || member;
  const rows = useMemo(() => {
    const r = [];
    sales.filter((s) => s.member?.id === m.id).forEach((s) => {
      const credit = s.payments.filter((p) => p.method === 'credit').reduce((a, p) => a + p.amount, 0);
      r.push({ ts: s.ts, text: `Bill ${s.billNo}${s.status === 'void' ? ' (void)' : ''}`, total: s.total, credit: s.status === 'void' ? 0 : credit, paid: 0, how: s.payments.map((p) => payLabel(p.method)).join(' + ') });
    });
    payments.filter((p) => p.memberId === m.id).forEach((p) => r.push({ ts: p.ts, text: `Payment${p.note ? ' · ' + p.note : ''}`, total: 0, credit: 0, paid: p.amount, how: p.method === 'salary' ? 'Salary deduction' : payLabel(p.method) }));
    return r.sort((a, b) => b.ts - a.ts);
  }, [sales, payments, m.id]);
  const cur = settings.currency;
  const print = () => printA4({
    title: 'Member statement', subtitle: `${m.rank} ${m.name} · ${m.serviceNo}`, settings,
    sections: [
      { title: 'Member', kv: [['Service no.', m.serviceNo], ['Name', `${m.rank} ${m.name}`], ['Unit', m.unit || '—'], ['Credit limit', money(m.creditLimit, cur)], ['Balance owed', money(m.balance, cur)]] },
      { title: 'History', columns: [{ label: 'Date' }, { label: 'Detail' }, { label: 'Paid by' }, { label: 'Bill total', num: true }, { label: 'On credit', num: true }, { label: 'Paid back', num: true }],
        rows: rows.map((r) => [fmtDateTime(r.ts), r.text, r.how, r.total ? money(r.total, '') : '', r.credit ? money(r.credit, '') : '', r.paid ? money(r.paid, '') : '']) },
    ],
  });
  return (
    <Modal title={`${m.rank} ${m.name}`} onClose={onClose} width={760} footer={<><button className="btn" onClick={onClose}>Close</button><button className="btn btn-primary" onClick={print}><IconPrinter size={17} />Print statement</button></>}>
      <div className="stmt-head">
        <div><small>Service no.</small><b>{m.serviceNo}</b></div>
        <div><small>Credit limit</small><b>{money(m.creditLimit, cur)}</b></div>
        <div><small>Owes</small><b>{money(m.balance, cur)}</b></div>
        <div><small>Member since</small><b>{fmtDate(m.createdAt)}</b></div>
      </div>
      {rows.length === 0 ? <Empty title="No purchases yet" /> : (
        <div className="table-wrap tall">
          <table className="tbl compact">
            <thead><tr><th>Date</th><th>Detail</th><th>Paid by</th><th className="n">Bill</th><th className="n">On credit</th><th className="n">Paid back</th></tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i}><td>{fmtDateTime(r.ts)}</td><td>{r.text}</td><td>{r.how}</td><td className="n">{r.total ? money(r.total, '') : ''}</td><td className="n">{r.credit ? money(r.credit, '') : ''}</td><td className="n plus">{r.paid ? money(r.paid, '') : ''}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
