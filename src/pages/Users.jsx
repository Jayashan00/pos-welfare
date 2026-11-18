import { t } from '../lib/i18n';
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
    if (!(await confirm({ title: t('Delete {name}?', { name: u.name }), message: t("Their past bills stay in the records. You can also just switch the account off instead."), confirmText: t("Delete user"), danger: true }))) return;
    try { await deleteUser(u.id); toast(t("User deleted")); } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <div className="page">
      <div className="toolbar"><p className="muted">{t("Each person who uses the till should have their own login, so every bill shows who served.")}</p><div className="toolbar-spacer" /><button className="btn btn-primary" onClick={() => setEdit(null)}><IconPlus size={17} />{t("Add user")}</button></div>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>{t("Name")}</th><th>{t("Username")}</th><th>{t("Role")}</th><th>{t("Status")}</th><th className="n">{t("Bills served")}</th><th>{t("Added")}</th><th></th></tr></thead>
          <tbody>{users.map((u) => (
            <tr key={u.id} className={!u.active ? 'dim' : ''}>
              <td><b>{u.name}</b>{u.id === user.id && <small>{t("You")}</small>}</td>
              <td className="mono">{u.username}</td>
              <td>{t(ROLES[u.role]?.label)}</td>
              <td>{u.active ? <Badge tone="ok">{t("Active")}</Badge> : <Badge>{t("Switched off")}</Badge>}</td>
              <td className="n">{sales.filter((s) => s.userId === u.id).length}</td>
              <td>{fmtDate(u.createdAt)}</td>
              <td className="actions">
                <button className="icon-btn" title={t("Edit")} onClick={() => setEdit(u)}><IconEdit size={17} /></button>
                {u.id !== user.id && <button className="icon-btn" title={t("Delete")} onClick={() => del(u)}><IconTrash size={17} /></button>}
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <section className="panel roles">
        <h2>{t("What each role can do")}</h2>
        <dl>
          <dt>{t("Till operator")}</dt><dd>{t("Sells, holds and recalls bills, looks up members, reprints their own bills from today.")}</dd>
          <dt>{t("Manager")}</dt><dd>{t("Everything an operator does, plus products, stock, members and credit, voiding bills, discounts and reports.")}</dd>
          <dt>{t("Administrator")}</dt><dd>{t("Everything, plus users, settings, backups and starting live trading.")}</dd>
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
    try { await saveUser(f, pin || undefined); toast(u ? t("User saved") : 'User added'); onClose(); } catch (ex) { setErr(ex.message); }
  };
  return (
    <Modal title={u ? t('Edit {name}', { name: u.name }) : t('Add user')} onClose={onClose} width={520}>
      <form className="grid2" onSubmit={submit}>
        <label className="field wide"><span>{t("Full name (printed on bills)")}</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required data-autofocus /></label>
        <label className="field"><span>{t("Username")}</span><input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value.replace(/\s/g, '') })} required /></label>
        <label className="field"><span>{t("Role")}</span><select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{t(v.label)}</option>)}</select></label>
        <label className="field"><span>{u ? t("New PIN (leave empty to keep)") : t("PIN (4 to 8 digits)")}</span><input className="masked" data-lpignore="true" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} autoComplete="off" /></label>
        <label className="check" style={{ alignSelf: 'end' }}><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> {t("Can sign in")}</label>
        {err && <div className="form-error wide">{err}</div>}
        <div className="row-btns wide"><button type="button" className="btn" onClick={onClose}>{t("Cancel")}</button><button className="btn btn-primary grow">{u ? t("Save changes") : t("Add user")}</button></div>
      </form>
    </Modal>
  );
}
