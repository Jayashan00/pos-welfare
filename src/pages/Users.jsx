import { useState } from 'react';
import { ROLES, useStore } from '../lib/store';
import { fmtDate } from '../lib/utils';
import { Badge, Modal, useConfirm, useToast } from '../components/ui';
import { IconEdit, IconPlus, IconTrash } from '../components/Icons';

export default function Users() {
  const { users, user, deleteUser, sales } = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const [edit, setEdit] = useState(undefined);
  const del = async (u) => {
    if (!(await confirm({ title: `Delete ${u.name}?`, message: 'Their past bills stay in the records. You can also just switch the account off instead.', confirmText: 'Delete user', danger: true }))) return;
    try { await deleteUser(u.id); toast('User deleted'); } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <div className="page">
      <div className="toolbar"><p className="muted">Each person who uses the till should have their own login, so every bill shows who served.</p><div className="toolbar-spacer" /><button className="btn btn-primary" onClick={() => setEdit(null)}><IconPlus size={17} />Add user</button></div>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th className="n">Bills served</th><th>Added</th><th></th></tr></thead>
          <tbody>{users.map((u) => (
            <tr key={u.id} className={!u.active ? 'dim' : ''}>
              <td><b>{u.name}</b>{u.id === user.id && <small>You</small>}</td>
              <td className="mono">{u.username}</td>
              <td>{ROLES[u.role]?.label}</td>
              <td>{u.active ? <Badge tone="ok">Active</Badge> : <Badge>Switched off</Badge>}</td>
              <td className="n">{sales.filter((s) => s.userId === u.id).length}</td>
              <td>{fmtDate(u.createdAt)}</td>
              <td className="actions">
                <button className="icon-btn" title="Edit" onClick={() => setEdit(u)}><IconEdit size={17} /></button>
                {u.id !== user.id && <button className="icon-btn" title="Delete" onClick={() => del(u)}><IconTrash size={17} /></button>}
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <section className="panel roles">
        <h2>What each role can do</h2>
        <dl>
          <dt>Till operator</dt><dd>Sells, holds and recalls bills, looks up members, reprints their own bills from today.</dd>
          <dt>Manager</dt><dd>Everything an operator does, plus products, stock, members and credit, voiding bills, discounts and reports.</dd>
          <dt>Administrator</dt><dd>Everything, plus users, settings, backups and starting live trading.</dd>
        </dl>
      </section>
      {edit !== undefined && <UserForm u={edit} onClose={() => setEdit(undefined)} />}
    </div>
  );
}

function UserForm({ u, onClose }) {
  const { saveUser } = useStore();
  const toast = useToast();
  const [f, setF] = useState(() => u ? { ...u } : { name: '', username: '', role: 'operator', active: true });
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try { await saveUser(f, pin || undefined); toast(u ? 'User saved' : 'User added'); onClose(); } catch (ex) { setErr(ex.message); }
  };
  return (
    <Modal title={u ? `Edit ${u.name}` : 'Add user'} onClose={onClose} width={520}>
      <form className="grid2" onSubmit={submit}>
        <label className="field wide"><span>Full name (printed on bills)</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required data-autofocus /></label>
        <label className="field"><span>Username</span><input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value.replace(/\s/g, '') })} required /></label>
        <label className="field"><span>Role</span><select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
        <label className="field"><span>{u ? 'New PIN (leave empty to keep)' : 'PIN (4 to 8 digits)'}</span><input className="masked" data-lpignore="true" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} autoComplete="off" /></label>
        <label className="check" style={{ alignSelf: 'end' }}><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Can sign in</label>
        {err && <div className="form-error wide">{err}</div>}
        <div className="row-btns wide"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary grow">{u ? 'Save changes' : 'Add user'}</button></div>
      </form>
    </Modal>
  );
}
