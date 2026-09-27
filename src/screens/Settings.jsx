import React, { useState } from 'react';
import {
  addUserError, buildNewUserRecord, editUserError, buildEditedUserRecord, replaceUser,
  canDeleteUser, userAuditDetail, withAdded, withUpdated, withoutId, withPrimaryDoctor,
  primaryDoctor, passwordFormError, buildDatabaseSummaryRows, STATIC_INFO_ROWS,
  LAST_ADMIN_DELETE_ALERT
} from '../modules/settings/model.js';

const L = () => globalThis.IAppLegacy;

export default function Settings({
  patients, appointments, prescriptions, exams, visits, doctors, setDoctors, prices, setPrices,
  clinic, setClinic, onReset, users, setUsers, session, onLogout
}) {
  const {
    C, Btn, Modal, Confirm, Field, inp, logAudit, getSB, localISO,
    DoctorForm, PriceForm, UserForm, DataTools, getUsers, newId, emailKey,
    ROLE_LABEL, MIN_PW_LEN, GUARD_KEY, saveAutoBackup
  } = L();

  const [confirm, setConfirm] = useState(false);
  const [modal, setModal] = useState(null);
  const [delDoc, setDelDoc] = useState(null);
  const [priceModal, setPriceModal] = useState(null);
  const [editClinic, setEditClinic] = useState(false);
  const [clinicForm, setClinicForm] = useState({ ...clinic });
  const [userModal, setUserModal] = useState(null);
  const [delUser, setDelUser] = useState(null);
  const [userErr, setUserErr] = useState('');
  const [pwModal, setPwModal] = useState(false);
  const [pwForm, setPwForm] = useState({ old: '', new1: '', new2: '' });
  const [pwMsg, setPwMsg] = useState(null);

  const primary = primaryDoctor(doctors);
  const isAdmin = session && session.role === 'admin';
  const summaryRows = buildDatabaseSummaryRows({ patients, appointments, visits, prescriptions, exams });

  const addDoc = f => setDoctors(withAdded(doctors, f, Date.now()));
  const editDoc = f => setDoctors(withUpdated(doctors, f));
  const delDocFn = id => setDoctors(withoutId(doctors, id));
  const setPrimary = id => setDoctors(withPrimaryDoctor(doctors, id));
  const addPrice = f => setPrices(withAdded(prices, f, Date.now()));
  const editPrice = f => setPrices(withUpdated(prices, f));
  const delPrice = id => setPrices(withoutId(prices, id));

  // NOTE: users are read through the legacy getUsers() (local store), not the
  // `users` prop, exactly as the legacy screen does.
  const addUser = async f => {
    const cur = getUsers();
    const mail = emailKey(f.email);
    const err = addUserError(cur, mail, emailKey);
    if (err) {
      setUserErr(err);
      return;
    }
    const rec = buildNewUserRecord(f, mail, newId());
    setUsers([...getUsers(), rec]);
    setUserErr('');
    setUserModal(null);
    logAudit('إضافة مستخدم', userAuditDetail(mail, rec.role, ROLE_LABEL));
  };
  const editUser = async f => {
    const cur = getUsers();
    const mail = emailKey(f.email);
    const err = editUserError(cur, f, mail, emailKey);
    if (err) {
      setUserErr(err);
      return;
    }
    const prev = cur.find(u => u.id === f.id);
    const rec = buildEditedUserRecord(prev, f, mail);
    setUsers(replaceUser(getUsers(), f.id, rec));
    setUserErr('');
    setUserModal(null);
    logAudit('تعديل مستخدم', userAuditDetail(mail, rec.role, ROLE_LABEL));
  };
  const delUserFn = id => {
    logAudit('حذف مستخدم', String(id));
    const cur = getUsers();
    const decision = canDeleteUser(cur, id, session.id);
    if (decision.action === 'ignore') return;
    if (decision.action === 'blocked') {
      alert(LAST_ADMIN_DELETE_ALERT);
      return;
    }
    setUsers(decision.next);
  };

  const handleChangePassword = async () => {
    const formErr = passwordFormError(pwForm, MIN_PW_LEN);
    if (formErr) {
      setPwMsg({ err: formErr });
      return;
    }
    const email = session.email || '';
    const sb = getSB();
    if (!sb || !email) {
      setPwMsg({ err: '❌ تعذر الاتصال بالخادم' });
      return;
    }
    const chk = await sb.auth.signInWithPassword({ email, password: pwForm.old });
    if (chk.error) {
      setPwMsg({ err: '❌ كلمة المرور الحالية غير صحيحة' });
      return;
    }
    const upd = await sb.auth.updateUser({ password: pwForm.new1 });
    if (upd.error) {
      setPwMsg({ err: '❌ ' + (upd.error.message || 'تعذر تغيير كلمة المرور') });
      return;
    }
    setPwMsg({ ok: '✅ تم تغيير كلمة المرور بنجاح' });
    logAudit('تغيير كلمة المرور الشخصية', '');
    setPwForm({ old: '', new1: '', new2: '' });
    setTimeout(() => {
      setPwModal(false);
      setPwMsg(null);
    }, 1500);
  };

  const handleExportBackup = () => {
    try {
      const data = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf('iapp_') === 0 && !['iapp_session', 'iapp_unified_session', GUARD_KEY].includes(k)) {
          try {
            data[k] = JSON.parse(localStorage.getItem(k));
          } catch {
            data[k] = localStorage.getItem(k);
          }
        }
      }
      data._exportedAt = new Date().toISOString();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'iapp-backup-' + localISO() + '.json';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    } catch (e) {
      alert('فشل التصدير: ' + e.message);
    }
  };

  const handleLogoFile = e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 500 / Math.max(img.width, img.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * k);
      cv.height = Math.round(img.height * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      setClinicForm(f => ({ ...f, logo: cv.toDataURL('image/png') }));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      alert('تعذر قراءة الصورة');
    };
    img.src = url;
    e.target.value = '';
  };

  const closePw = () => {
    setPwModal(false);
    setPwForm({ old: '', new1: '', new2: '' });
    setPwMsg(null);
  };

  const pwInput = { ...inp(), direction: 'ltr', textAlign: 'center' };
  const rowCard = { display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 8, cursor: 'pointer' };
  const rowIcon = bg => ({ width: 34, height: 34, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 });

  return (
    <div style={{ padding: '16px 16px 90px' }}>
      <div style={{ color: C.text, fontWeight: 700, fontSize: 16, marginBottom: 16 }}>الإعدادات</div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>🏥 بيانات العيادة</div>
          <div
            onClick={() => { setClinicForm({ ...clinic }); setEditClinic(true); }}
            style={{ color: C.accent, fontSize: 11, cursor: 'pointer', background: C.accent + '22', borderRadius: 8, padding: '4px 10px' }}
          >✏ تعديل</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: C.muted, fontSize: 12 }}>📍 العنوان</span>
            <span style={{ color: C.text, fontSize: 12, fontWeight: 600 }}>{clinic.address || 'لم يُضف بعد'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: C.muted, fontSize: 12 }}>📞 رقم التواصل</span>
            <span style={{ color: C.text, fontSize: 12, fontWeight: 600 }}>{clinic.phone || 'لم يُضف بعد'}</span>
          </div>
        </div>
      </div>

      <div style={{ background: `linear-gradient(135deg,${C.accent}22,${C.teal}11)`, border: `1px solid ${C.accent}33`, borderRadius: 16, padding: '16px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 54, height: 54, borderRadius: '50%', background: `linear-gradient(135deg,${C.accent},${C.teal})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, color: C.bg }}>
          {primary.initial || 'د'}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ color: C.text, fontWeight: 700, fontSize: 15 }}>{primary.name || 'د. عبدالستار صقر'}</div>
          <div style={{ color: C.muted, fontSize: 11 }}>{primary.title || 'طبيب عيون · رئيس القسم'}</div>
        </div>
        <div
          onClick={() => setModal({ edit: primary })}
          style={{ color: C.accent, fontSize: 11, cursor: 'pointer', background: C.accent + '22', borderRadius: 8, padding: '5px 10px' }}
        >✏ تعديل</div>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>👨‍⚕️ فريق الأطباء ({doctors.length})</div>
          <Btn small onClick={() => setModal('add')}>+ إضافة طبيب</Btn>
        </div>
        {doctors.map(d => (
          <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: `1px solid ${C.border}33` }}>
            <div style={{ width: 38, height: 38, borderRadius: '50%', background: d.isPrimary ? `linear-gradient(135deg,${C.accent},${C.teal})` : C.border, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, color: d.isPrimary ? C.bg : C.muted }}>
              {d.initial || 'د'}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{d.name}</div>
              <div style={{ color: C.muted, fontSize: 11 }}>{d.title}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {d.isPrimary ? (
                <span style={{ background: C.gold + '22', color: C.gold, borderRadius: 8, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>رئيسي</span>
              ) : (
                <div onClick={() => setPrimary(d.id)} style={{ background: C.muted + '22', borderRadius: 8, padding: '3px 8px', color: C.muted, fontSize: 10, cursor: 'pointer' }}>تعيين رئيسي</div>
              )}
              <div onClick={() => setModal({ edit: d })} style={{ background: C.accent + '22', borderRadius: 8, padding: '5px 8px', color: C.accent, fontSize: 11, cursor: 'pointer' }}>✏</div>
              {!d.isPrimary && isAdmin && (
                <div onClick={() => setDelDoc(d.id)} style={{ background: C.danger + '22', borderRadius: 8, padding: '5px 8px', color: C.danger, fontSize: 11, cursor: 'pointer' }}>🗑</div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>💰 أسعار الخدمات</div>
          <Btn small color={C.gold} onClick={() => setPriceModal('add')}>+ إضافة خدمة</Btn>
        </div>
        {prices.map(p => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: `1px solid ${C.border}22` }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: C.gold + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
              {p.icon || '💊'}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>{p.name}</div>
            </div>
            <div style={{ color: C.gold, fontWeight: 800, fontSize: 14, marginLeft: 8 }}>{Number(p.price).toLocaleString()} ج.م</div>
            <div onClick={() => setPriceModal({ edit: p })} style={{ background: C.accent + '22', borderRadius: 8, padding: '5px 8px', color: C.accent, fontSize: 11, cursor: 'pointer' }}>✏</div>
            <div onClick={() => setPriceModal({ del: p.id })} style={{ background: C.danger + '22', borderRadius: 8, padding: '5px 8px', color: C.danger, fontSize: 11, cursor: 'pointer' }}>🗑</div>
          </div>
        ))}
        {prices.length === 0 && (
          <div style={{ color: C.muted, fontSize: 12, textAlign: 'center', padding: 16 }}>لا توجد أسعار مضافة</div>
        )}
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginBottom: 16 }}>
        <div style={{ color: C.muted, fontSize: 11, fontWeight: 700, marginBottom: 12 }}>ملخص قاعدة البيانات</div>
        {summaryRows.map(([lbl, val]) => (
          <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: C.muted, fontSize: 13 }}>{lbl}</span>
            <span style={{ color: C.accent, fontWeight: 700, fontSize: 13 }}>{val}</span>
          </div>
        ))}
      </div>

      {STATIC_INFO_ROWS.map(([icon, lbl, sub], i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 8 }}>
          <div style={rowIcon(C.border)}>{icon}</div>
          <div>
            <div style={{ color: C.text, fontSize: 13 }}>{lbl}</div>
            <div style={{ color: C.muted, fontSize: 11 }}>{sub}</div>
          </div>
        </div>
      ))}

      {isAdmin && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ color: C.text, fontWeight: 700, fontSize: 13 }}>🔐 حسابات المستخدمين ({users.length})</div>
            <Btn small color={C.purple} onClick={() => { setUserErr(''); setUserModal('add'); }}>+ إضافة مستخدم</Btn>
          </div>
          {users.map(u => (
            <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: `1px solid ${C.border}33` }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: u.role === 'admin' ? `linear-gradient(135deg,${C.purple},${C.accent})` : C.border, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, color: u.role === 'admin' ? C.bg : C.muted }}>
                {(u.name || u.username || '?')[0]}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>
                  {u.name}{' '}{u.id === session.id && <span style={{ color: C.muted, fontSize: 10 }}>(أنت)</span>}
                </div>
                <div style={{ color: C.muted, fontSize: 11, direction: 'ltr', display: 'inline-block' }}>
                  {u.email || u.username}{' · '}{ROLE_LABEL[u.role] || u.role}
                </div>
              </div>
              <div
                onClick={() => { setUserErr(''); setUserModal({ edit: u }); }}
                style={{ background: C.accent + '22', borderRadius: 8, padding: '5px 8px', color: C.accent, fontSize: 11, cursor: 'pointer' }}
              >✏</div>
              {u.id !== session.id && (
                <div onClick={() => setDelUser(u.id)} style={{ background: C.danger + '22', borderRadius: 8, padding: '5px 8px', color: C.danger, fontSize: 11, cursor: 'pointer' }}>🗑</div>
              )}
            </div>
          ))}
        </div>
      )}

      <div onClick={() => setPwModal(true)} style={rowCard}>
        <div style={rowIcon(C.purple + '33')}>🔒</div>
        <div style={{ flex: 1 }}>
          <div style={{ color: C.text, fontSize: 13 }}>تغيير كلمة المرور</div>
          <div style={{ color: C.muted, fontSize: 11 }}>لحسابك الحالي: {session && session.username}</div>
        </div>
        <div style={{ color: C.purple, fontSize: 12 }}>←</div>
      </div>

      <div onClick={handleExportBackup} style={rowCard}>
        <div style={rowIcon(C.teal + '33')}>💾</div>
        <div style={{ flex: 1 }}>
          <div style={{ color: C.text, fontSize: 13 }}>تصدير نسخة احتياطية</div>
          <div style={{ color: C.muted, fontSize: 11 }}>حفظ كل بيانات العيادة كملف JSON</div>
        </div>
        <div style={{ color: C.teal, fontSize: 12 }}>⬇</div>
      </div>

      <DataTools isAdmin={isAdmin} />

      {onLogout && (
        <div onClick={onLogout} style={rowCard}>
          <div style={rowIcon(C.danger + '33')}>⏻</div>
          <div style={{ flex: 1 }}>
            <div style={{ color: C.text, fontSize: 13 }}>تسجيل الخروج</div>
          </div>
        </div>
      )}

      {isAdmin && (
        <div
          onClick={() => setConfirm(true)}
          style={{ background: C.danger + '11', border: `1px solid ${C.danger}33`, borderRadius: 14, padding: '13px 14px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', marginTop: 12 }}
        >
          <span style={{ fontSize: 18 }}>🔄</span>
          <span style={{ color: C.danger, fontWeight: 600, fontSize: 13 }}>إعادة تعيين البيانات الأولية</span>
        </div>
      )}

      {editClinic && (
        <Modal title="تعديل بيانات العيادة" onClose={() => setEditClinic(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field label="عنوان العيادة">
              <input
                style={inp()}
                value={clinicForm.address || ''}
                onChange={e => setClinicForm(f => ({ ...f, address: e.target.value }))}
                placeholder="مثال: القاهرة - مصر الجديدة - شارع..."
              />
            </Field>
            <Field label="رقم التواصل / الهاتف">
              <input
                style={inp()}
                value={clinicForm.phone || ''}
                onChange={e => setClinicForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="مثال: 01234567890"
              />
            </Field>
            <Field label="شعار العيادة (يظهر في الروشتة والعلامة المائية)">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {clinicForm.logo && (
                  <img src={clinicForm.logo} alt="" style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', background: '#fff' }} />
                )}
                <label style={{ flex: 1, textAlign: 'center', background: C.accent + '22', color: C.accent, border: `1px dashed ${C.accent}66`, borderRadius: 10, padding: '10px 8px', fontSize: 12, cursor: 'pointer' }}>
                  {clinicForm.logo ? 'تغيير الشعار' : 'رفع صورة الشعار'}
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoFile} />
                </label>
                {clinicForm.logo && (
                  <span onClick={() => setClinicForm(f => ({ ...f, logo: '' }))} style={{ color: C.danger, fontSize: 11, cursor: 'pointer' }}>حذف</span>
                )}
              </div>
            </Field>
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <Btn outline full onClick={() => setEditClinic(false)}>إلغاء</Btn>
              <Btn full onClick={() => { setClinic({ ...clinic, ...clinicForm }); setEditClinic(false); }}>✓ حفظ</Btn>
            </div>
          </div>
        </Modal>
      )}

      {modal === 'add' && (
        <Modal title="إضافة طبيب جديد" onClose={() => setModal(null)}>
          <DoctorForm onSave={f => { addDoc(f); setModal(null); }} onClose={() => setModal(null)} />
        </Modal>
      )}
      {modal && modal.edit && (
        <Modal title="تعديل بيانات الطبيب" onClose={() => setModal(null)}>
          <DoctorForm initial={modal.edit} onSave={f => { editDoc(f); setModal(null); }} onClose={() => setModal(null)} />
        </Modal>
      )}
      {delDoc && (
        <Confirm msg="حذف هذا الطبيب من القائمة؟" onOk={() => { delDocFn(delDoc); setDelDoc(null); }} onNo={() => setDelDoc(null)} />
      )}

      {priceModal === 'add' && (
        <Modal title="إضافة خدمة جديدة" onClose={() => setPriceModal(null)}>
          <PriceForm onSave={f => { addPrice(f); setPriceModal(null); }} onClose={() => setPriceModal(null)} />
        </Modal>
      )}
      {priceModal && priceModal.edit && (
        <Modal title="تعديل سعر الخدمة" onClose={() => setPriceModal(null)}>
          <PriceForm initial={priceModal.edit} onSave={f => { editPrice(f); setPriceModal(null); }} onClose={() => setPriceModal(null)} />
        </Modal>
      )}
      {priceModal && priceModal.del && (
        <Confirm msg="حذف هذه الخدمة من قائمة الأسعار؟" onOk={() => { delPrice(priceModal.del); setPriceModal(null); }} onNo={() => setPriceModal(null)} />
      )}

      {userModal === 'add' && (
        <Modal title="إضافة مستخدم جديد" onClose={() => setUserModal(null)}>
          <UserForm error={userErr} onSave={addUser} onClose={() => setUserModal(null)} />
        </Modal>
      )}
      {userModal && userModal.edit && (
        <Modal title="تعديل بيانات المستخدم" onClose={() => setUserModal(null)}>
          <UserForm initial={userModal.edit} error={userErr} onSave={editUser} onClose={() => setUserModal(null)} />
        </Modal>
      )}
      {delUser && (
        <Confirm
          msg="حذف هذا المستخدم؟ لن يستطيع تسجيل الدخول بعد الحذف."
          onOk={() => { delUserFn(delUser); setDelUser(null); }}
          onNo={() => setDelUser(null)}
        />
      )}

      {pwModal && (
        <Modal title="🔒 تغيير كلمة المرور" onClose={closePw}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field label="كلمة المرور الحالية">
              <input style={pwInput} type="password" value={pwForm.old} onChange={e => setPwForm(f => ({ ...f, old: e.target.value }))} />
            </Field>
            <Field label="كلمة المرور الجديدة">
              <input style={pwInput} type="password" value={pwForm.new1} onChange={e => setPwForm(f => ({ ...f, new1: e.target.value }))} />
            </Field>
            <Field label="تأكيد كلمة المرور الجديدة">
              <input style={pwInput} type="password" value={pwForm.new2} onChange={e => setPwForm(f => ({ ...f, new2: e.target.value }))} />
            </Field>
            {pwMsg && (
              <div style={{ background: pwMsg.err ? C.danger + '22' : C.success + '22', border: `1px solid ${pwMsg.err ? C.danger : C.success}44`, borderRadius: 10, padding: '10px 14px', color: pwMsg.err ? C.danger : C.success, fontSize: 13, textAlign: 'center' }}>
                {pwMsg.err || pwMsg.ok}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <Btn outline full onClick={closePw}>إلغاء</Btn>
              <Btn full color={C.purple} onClick={handleChangePassword}>✓ تغيير كلمة المرور</Btn>
            </div>
          </div>
        </Modal>
      )}

      {confirm && (
        <Confirm
          msg="سيتم حذف جميع البيانات. هل أنت متأكد؟"
          onOk={async () => {
            await saveAutoBackup('قبل حذف كل البيانات');
            await logAudit('حذف كل البيانات', '');
            onReset();
            setConfirm(false);
          }}
          onNo={() => setConfirm(false)}
        />
      )}
    </div>
  );
}
