
const {
  useState,
  useEffect,
  useCallback,
  useRef
} = React;
function localISO(d) {
  d = d || new Date();
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}
function escHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}
function escDeep(v, depth) {
  depth = depth || 0;
  if (typeof v === "string") return escHTML(v);
  if (v === null || typeof v !== "object" || depth > 8) return v;
  if (Array.isArray(v)) return v.map(x => escDeep(x, depth + 1));
  const o = {};
  for (const k in v) {
    if (Object.prototype.hasOwnProperty.call(v, k)) o[k] = escDeep(v[k], depth + 1);
  }
  return o;
}
const safeTemplate = fn => (...args) => fn(...args.map(a => escDeep(a)));
function normArabic(s) {
  return String(s || "").trim().replace(/[ً-ْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/\s+/g, " ").toLowerCase();
}
const normPhone = s => String(s || "").replace(/\D/g, "").replace(/^(20|0020)/, "0");
const PW_ITER = 30000;
const DEFAULT_ADMIN_PW = "admin123";
const MIN_PW_LEN = 6;
const _SHA_K = (() => {
  const k = [];
  let n = 2;
  while (k.length < 64) {
    let p = true;
    for (let i = 2; i * i <= n; i++) if (n % i === 0) {
      p = false;
      break;
    }
    if (p) k.push(Math.cbrt(n) % 1 * 4294967296 >>> 0);
    n++;
  }
  return k;
})();
const _SHA_H0 = (() => {
  const h = [];
  let n = 2;
  while (h.length < 8) {
    let p = true;
    for (let i = 2; i * i <= n; i++) if (n % i === 0) {
      p = false;
      break;
    }
    if (p) h.push(Math.sqrt(n) % 1 * 4294967296 >>> 0);
    n++;
  }
  return h;
})();
function _sha256(bytes) {
  const l = bytes.length,
    bitLen = l * 8;
  const total = l + 9 + 63 >> 6 << 6;
  const m = new Uint8Array(total);
  m.set(bytes);
  m[l] = 0x80;
  const dv = new DataView(m.buffer);
  dv.setUint32(total - 8, Math.floor(bitLen / 4294967296));
  dv.setUint32(total - 4, bitLen >>> 0);
  const H = _SHA_H0.slice();
  const W = new Uint32Array(64);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = W[i - 15],
        b = W[i - 2];
      const s0 = (a >>> 7 | a << 25) ^ (a >>> 18 | a << 14) ^ a >>> 3;
      const s1 = (b >>> 17 | b << 15) ^ (b >>> 19 | b << 13) ^ b >>> 10;
      W[i] = W[i - 16] + s0 + W[i - 7] + s1 >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = (e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^ (e >>> 25 | e << 7);
      const ch = e & f ^ ~e & g;
      const t1 = h + S1 + ch + _SHA_K[i] + W[i] >>> 0;
      const S0 = (a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^ (a >>> 22 | a << 10);
      const mj = a & b ^ a & c ^ b & c;
      const t2 = S0 + mj >>> 0;
      h = g;
      g = f;
      f = e;
      e = d + t1 >>> 0;
      d = c;
      c = b;
      b = a;
      a = t1 + t2 >>> 0;
    }
    H[0] = H[0] + a >>> 0;
    H[1] = H[1] + b >>> 0;
    H[2] = H[2] + c >>> 0;
    H[3] = H[3] + d >>> 0;
    H[4] = H[4] + e >>> 0;
    H[5] = H[5] + f >>> 0;
    H[6] = H[6] + g >>> 0;
    H[7] = H[7] + h >>> 0;
  }
  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  H.forEach((x, i) => ov.setUint32(i * 4, x));
  return out;
}
function _hmacFactory(key) {
  if (key.length > 64) key = _sha256(key);
  const k = new Uint8Array(64);
  k.set(key);
  const ipad = k.map(x => x ^ 0x36),
    opad = k.map(x => x ^ 0x5c);
  return msg => {
    const inner = new Uint8Array(64 + msg.length);
    inner.set(ipad);
    inner.set(msg, 64);
    const ih = _sha256(inner);
    const outer = new Uint8Array(96);
    outer.set(opad);
    outer.set(ih, 64);
    return _sha256(outer);
  };
}
function _pbkdf2JS(pwBytes, salt, iter) {
  const hmac = _hmacFactory(pwBytes);
  const s1 = new Uint8Array(salt.length + 4);
  s1.set(salt);
  s1[salt.length + 3] = 1;
  let u = hmac(s1);
  const t = u.slice();
  for (let i = 1; i < iter; i++) {
    u = hmac(u);
    for (let j = 0; j < 32; j++) t[j] ^= u[j];
  }
  return t;
}
const _b64 = u8 => btoa(String.fromCharCode(...u8));
const _unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function _pbkdf2(pw, salt, iter) {
  const pwBytes = new TextEncoder().encode(pw);
  try {
    const subtle = window.crypto && window.crypto.subtle;
    if (subtle) {
      const key = await subtle.importKey("raw", pwBytes, "PBKDF2", false, ["deriveBits"]);
      const bits = await subtle.deriveBits({
        name: "PBKDF2",
        hash: "SHA-256",
        salt,
        iterations: iter
      }, key, 256);
      return new Uint8Array(bits);
    }
  } catch (e) {
    console.warn("WebCrypto PBKDF2 unavailable, using JS fallback");
  }
  await new Promise(r => setTimeout(r, 0));
  return _pbkdf2JS(pwBytes, salt, iter);
}
async function hashPassword(pw) {
  const salt = new Uint8Array(16);
  window.crypto.getRandomValues(salt);
  const hash = await _pbkdf2(pw, salt, PW_ITER);
  return {
    algo: "pbkdf2-sha256",
    iter: PW_ITER,
    salt: _b64(salt),
    hash: _b64(hash)
  };
}
async function verifyPassword(user, pw) {
  if (!user || typeof pw !== "string") return false;
  if (user.pw && user.pw.hash) {
    const calc = await _pbkdf2(pw, _unb64(user.pw.salt), user.pw.iter || PW_ITER);
    const ref = _unb64(user.pw.hash);
    if (ref.length !== calc.length) return false;
    let diff = 0;
    for (let i = 0; i < ref.length; i++) diff |= ref[i] ^ calc[i];
    return diff === 0;
  }
  return typeof user.password === "string" && user.password === pw;
}
const publicUser = u => u ? {
  id: u.id,
  username: u.username,
  email: u.email || "",
  name: u.name,
  role: u.role,
  mustChange: !!u.mustChange
} : null;
const ROLE_LABEL = {
  admin: "مدير",
  doctor: "طبيب",
  secretary: "سكرتارية",
  employee: "موظف"
};
async function migrateUsers() {
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem("iapp_users") || "null");
  } catch {}
  const list = Array.isArray(stored) && stored.length ? stored : DEFAULT_USERS.map(u => ({
    ...u
  }));
  if (!list.some(u => typeof u.password === "string")) return;
  const next = [];
  for (const u of list) {
    if (typeof u.password === "string") {
      const {
        password,
        ...rest
      } = u;
      next.push({
        ...rest,
        pw: u.pw || (await hashPassword(password)),
        mustChange: !!u.mustChange || password === DEFAULT_ADMIN_PW || password.length < MIN_PW_LEN
      });
    } else next.push(u);
  }
  saveUsers(next);
}
const GUARD_KEY = "iapp_login_guard";
function _guards() {
  try {
    const g = JSON.parse(localStorage.getItem(GUARD_KEY));
    return g && typeof g === "object" && !("fails" in g) ? g : {};
  } catch {
    return {};
  }
}
function _gkey(k) {
  return String(k || "_").trim().toLowerCase();
}
function lockRemaining(k) {
  const g = _guards()[_gkey(k)];
  return g ? Math.max(0, Math.ceil((g.until - Date.now()) / 1000)) : 0;
}
function registerLoginFail(k) {
  const all = _guards(),
    key = _gkey(k),
    g = all[key] || {
      fails: 0,
      until: 0
    };
  g.fails++;
  if (g.fails >= 6) g.until = Date.now() + Math.min(300, 30 * Math.pow(2, g.fails - 6)) * 1000;
  all[key] = g;
  try {
    localStorage.setItem(GUARD_KEY, JSON.stringify(all));
  } catch {}
  return lockRemaining(k);
}
function clearLoginFails(k) {
  const all = _guards();
  delete all[_gkey(k)];
  try {
    localStorage.setItem(GUARD_KEY, JSON.stringify(all));
  } catch {}
}
const fmtWait = s => s >= 60 ? Math.ceil(s / 60) + " دقيقة" : s + " ثانية";
const emailKey = e => String(e || "").trim().toLowerCase();
async function resolveProfile(email) {
  await Promise.race([pullUsers().catch(() => false), new Promise(r => setTimeout(() => r(false), 5000))]);
  const key = emailKey(email);
  if (key === emailKey(KIOSK_EMAIL)) return {
    error: "❌ حساب الشاشة لا يُستخدم للدخول إلى البرنامج"
  };
  const users = getUsers().filter(u => u && (u.email || u.username));
  let u = users.find(x => emailKey(x.email) === key) || users.find(x => emailKey(x.username) === key);
  if (u) return {
    user: {
      ...publicUser(u),
      email: u.email || email
    }
  };
  const preset = DEFAULT_ROLES[key];
  const noAccounts = !users.some(x => x.email);
  if (preset) {
    const rec = {
      id: newId(),
      email: key,
      username: key,
      name: preset.name || key.split("@")[0],
      role: preset.role
    };
    saveUsers([...getUsers().filter(x => emailKey(x.email) !== key), rec]);
    return {
      user: {
        ...publicUser(rec),
        email: key
      }
    };
  }
  if (ADMIN_EMAILS.map(emailKey).includes(key) || noAccounts) {
    const rec = {
      id: newId(),
      email: key,
      username: key,
      name: key.split("@")[0],
      role: "admin"
    };
    saveUsers([...getUsers().filter(x => emailKey(x.email) !== key), rec]);
    return {
      user: {
        ...publicUser(rec),
        email: key
      }
    };
  }
  return {
    error: "❌ هذا الحساب غير مضاف إلى صلاحيات البرنامج — اطلب من المدير إضافة بريدك من الإعدادات"
  };
}
async function authenticateStaff(email, password) {
  const key = emailKey(email);
  const wait = lockRemaining(key);
  if (wait) return {
    error: "⏳ محاولات خاطئة كثيرة لهذا الحساب — حاول مرة أخرى بعد " + fmtWait(wait)
  };
  const sb = getSB();
  if (!sb) return {
    error: "❌ تعذر الاتصال بقاعدة البيانات — تأكد من الإنترنت"
  };
  if (!key.includes("@")) return {
    error: "❌ اكتب البريد الإلكتروني كاملاً (مثال: admin@sakr.clinic)"
  };
  let res;
  try {
    res = await sb.auth.signInWithPassword({
      email: key,
      password
    });
  } catch (e) {
    return {
      error: "❌ تعذر الاتصال بالخادم — حاول مرة أخرى"
    };
  }
  if (res.error) {
    const m = String(res.error.message || "");
    const w = registerLoginFail(key);
    if (w) return {
      error: "⏳ تم إيقاف الدخول لهذا الحساب مؤقتاً — حاول بعد " + fmtWait(w)
    };
    if (/Email not confirmed/i.test(m)) return {
      error: "❌ البريد غير مُفعّل — أكّده من رسالة Supabase أو أوقف تأكيد البريد من إعدادات Supabase"
    };
    if (/Invalid login/i.test(m)) return {
      error: "❌ البريد الإلكتروني أو كلمة المرور غير صحيحة"
    };
    return {
      error: "❌ " + m
    };
  }
  clearLoginFails(key);
  const prof = await resolveProfile(key);
  if (prof.error) {
    await sbSignOut();
    return prof;
  }
  return prof;
}
async function _sbMutateOnline(key, mutator, verify) {
  if (key === APT_KEY) return await aptMutate(mutator, verify);
  if (ROW_TABLES[key]) return await rowMutate(key, mutator, verify);
  for (let attempt = 0; attempt < 4; attempt++) {
    const cur = await sbGet(key);
    if (cur === undefined) return {
      ok: false,
      error: "offline"
    };
    const base = Array.isArray(cur) ? cur : [];
    const next = mutator(base);
    if (next && !Array.isArray(next) && next.abort) return {
      ok: false,
      error: next.abort,
      data: base
    };
    if (!(await sbSet(key, next))) return {
      ok: false,
      error: "offline"
    };
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {}
    if (!verify) return {
      ok: true,
      data: next
    };
    const check = await sbGet(key);
    if (Array.isArray(check) && verify(check)) {
      try {
        localStorage.setItem(key, JSON.stringify(check));
      } catch {}
      return {
        ok: true,
        data: check
      };
    }
    await new Promise(r => setTimeout(r, 200 + Math.random() * 500));
  }
  return {
    ok: false,
    error: "conflict"
  };
}
const AUDIT_KEY = "iapp_audit",
  TRASH_KEY = "iapp_trash",
  BACKUP_KEY = "iapp_backups";
const AUDIT_MAX = 1500,
  TRASH_MAX = 400,
  TRASH_DAYS = 30,
  BACKUP_KEEP = 5;
const BACKUP_KEYS = ["iapp_patients", "iapp_visits", "iapp_exams", "iapp_prescriptions", "iapp_appointments", "iapp_prices", "iapp_doctors", "iapp_clinic", "iapp_expenses", "iapp_recurring_expenses", "iapp_custom_tests", "iapp_imaging_orders"];
let CURRENT_USER = null;
const actorName = () => CURRENT_USER ? CURRENT_USER.name || CURRENT_USER.username || "—" : "—";
async function logAudit(action, details) {
  try {
    const entry = {
      id: newId(),
      ts: Date.now(),
      by: actorName(),
      role: CURRENT_USER ? CURRENT_USER.role : "",
      action,
      details: String(details || "").slice(0, 200)
    };
    await sbMutate(AUDIT_KEY, list => [entry, ...list].slice(0, AUDIT_MAX));
  } catch (e) {
    console.warn("audit failed", e);
  }
}
function slimForTrash(rec) {
  try {
    if (JSON.stringify(rec).length < 200000) return rec;
    const {
      image,
      img,
      data,
      thumb,
      ...rest
    } = rec;
    return {
      ...rest,
      _imageDropped: true
    };
  } catch {
    return rec;
  }
}
async function trashPut(storeKey, items, label) {
  const arr = (Array.isArray(items) ? items : [items]).filter(Boolean);
  if (!arr.length) return false;
  const cutoff = Date.now() - TRASH_DAYS * 24 * 3600 * 1000;
  const stamped = arr.map(r => ({
    id: newId(),
    storeKey,
    label: label || "",
    deletedAt: Date.now(),
    by: actorName(),
    record: slimForTrash(r)
  }));
  const res = await sbMutate(TRASH_KEY, list => [...stamped, ...list.filter(t => t.deletedAt > cutoff)].slice(0, TRASH_MAX));
  return res.ok;
}
async function trashRestore(entry) {
  if (!entry || !entry.storeKey || !entry.record) return false;
  const rec = entry.record;
  const put = await sbMutate(entry.storeKey, list => list.some(x => x.id === rec.id) ? list.map(x => x.id === rec.id ? rec : x) : [...list, rec], list => list.some(x => x.id === rec.id));
  if (!put.ok) return false;
  try {
    localStorage.setItem(entry.storeKey, JSON.stringify(put.data));
  } catch {}
  await sbMutate(TRASH_KEY, list => list.filter(t => t.id !== entry.id));
  await logAudit("استعادة من سلة المحذوفات", entry.label || entry.storeKey);
  return true;
}
async function trashDrop(entryId) {
  await sbMutate(TRASH_KEY, list => list.filter(t => t.id !== entryId));
}
async function buildSnapshot() {
  const data = {};
  for (const k of BACKUP_KEYS) {
    const v = await sbGet(k);
    if (v !== undefined && v !== null) data[k] = v;else {
      try {
        const l = localStorage.getItem(k);
        if (l) data[k] = JSON.parse(l);
      } catch {}
    }
  }
  return data;
}
async function saveAutoBackup(reason) {
  const data = await buildSnapshot();
  const size = JSON.stringify(data).length;
  if (size > 4000000) {
    console.warn("backup too large, skipped");
    return false;
  }
  const snap = {
    id: newId(),
    at: Date.now(),
    by: actorName(),
    reason: reason || "تلقائي",
    size,
    data
  };
  const res = await sbMutate(BACKUP_KEY, list => [snap, ...list].slice(0, BACKUP_KEEP));
  return res.ok;
}
async function maybeDailyBackup() {
  try {
    const list = await sbGet(BACKUP_KEY);
    if (list === undefined) return;
    const arr = Array.isArray(list) ? list : [];
    if (arr.some(b => localISO(new Date(b.at)) === localISO())) return;
    await saveAutoBackup("نسخة يومية تلقائية");
  } catch (e) {
    console.warn("daily backup failed", e);
  }
}
async function restoreSnapshot(data, label) {
  const keys = Object.keys(data || {}).filter(k => k.indexOf("iapp_") === 0 && !["iapp_session", "iapp_unified_session", GUARD_KEY, BACKUP_KEY, TRASH_KEY, AUDIT_KEY].includes(k));
  if (!keys.length) return {
    ok: false,
    error: "الملف لا يحتوي على بيانات I App"
  };
  await saveAutoBackup("قبل الاستعادة");
  let done = 0;
  for (const k of keys) {
    const v = data[k];
    if (v === undefined) continue;
    const ok = await sbSet(k, v);
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
    if (ok) done++;
  }
  await logAudit("استعادة نسخة احتياطية", (label || "") + " · " + done + " مجموعة بيانات");
  return {
    ok: true,
    count: done
  };
}
const isActiveApt = a => !!a && !a.cancelled && a.status !== "cancelled" && a.waitStatus !== "cancelled";
const SLOT_CAPACITY = 1;
const newId = () => Date.now() + Math.floor(Math.random() * 997);
const THEMES = {
  dark: {
    bg: "#0A0F1E",
    bg2: "#0a1220",
    surface: "#111827",
    surface2: "#0D1929",
    card: "#141E30",
    border: "#1E2D45",
    accent: "#00C2FF",
    teal: "#00E5CC",
    gold: "#FFB830",
    text: "#E8F4FF",
    muted: "#6B8CAE",
    danger: "#FF4D6D",
    success: "#00E5B0",
    purple: "#A78BFA"
  },
  light: {
    bg: "#F2F6FB",
    bg2: "#FFFFFF",
    surface: "#FFFFFF",
    surface2: "#EAF1F9",
    card: "#FFFFFF",
    border: "#D3DEEB",
    accent: "#0077B6",
    teal: "#008F86",
    gold: "#B86E00",
    text: "#0F1B2D",
    muted: "#566B84",
    danger: "#D6304F",
    success: "#0A8F65",
    purple: "#6D4FD1"
  }
};
const C = {
  ...THEMES.dark
};
let _theme = "dark";
try {
  if (localStorage.getItem("iapp_theme") === "light") _theme = "light";
} catch {}
const themeSubs = new Set();
function applyTheme(t) {
  _theme = t;
  Object.assign(C, THEMES[t]);
  try {
    localStorage.setItem("iapp_theme", t);
  } catch {}
  try {
    document.documentElement.setAttribute("data-theme", t);
    document.documentElement.style.background = C.bg;
    document.body.style.background = C.bg;
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute("content", C.bg);
  } catch {}
}
function setTheme(t) {
  applyTheme(t);
  themeSubs.forEach(f => f(t));
}
function useTheme() {
  const [t, setT] = useState(_theme);
  useEffect(() => {
    themeSubs.add(setT);
    setT(_theme);
    return () => {
      themeSubs.delete(setT);
    };
  }, []);
  return t;
}
applyTheme(_theme);
function ThemeToggle() {
  const t = useTheme();
  return React.createElement("div", {
    onClick: () => setTheme(t === "dark" ? "light" : "dark"),
    title: t === "dark" ? "الوضع النهاري" : "الوضع الليلي",
    style: {
      width: 34,
      height: 34,
      borderRadius: 10,
      background: C.card,
      border: `1px solid ${C.border}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      fontSize: 15,
      flexShrink: 0
    }
  }, t === "dark" ? "☀️" : "🌙");
}
function ThemeRoot() {
  useTheme();
  return React.createElement(UnifiedErrorBoundary, null, React.createElement(UnifiedRouter, null));
}
const SC = {
  get "مكتمل"() {
    return C.success;
  },
  get "متابعة"() {
    return C.gold;
  },
  get "طارئ"() {
    return C.danger;
  }
};
const CLINICS = [{
  v: "دمنهور",
  l: "عيادة دمنهور"
}, {
  v: "الرحمانية",
  l: "عيادة الرحمانية"
}, {
  v: "مركز دمنهور للعيون",
  l: "مركز دمنهور للعيون"
}];
const clinicLabel = v => (CLINICS.find(c => c.v === v) || {}).l || v || "—";
const SEED = {
  patients: [{
    id: 1,
    patientCode: "P-0001",
    name: "أحمد محمد العمري",
    age: 45,
    phone: "0501234567",
    lastVisit: "2026-04-08",
    condition: "قصر نظر",
    status: "مكتمل",
    gender: "ذكر",
    bloodType: "A+",
    address: "القاهرة",
    history: "ضغط دم مرتفع",
    allergies: "لا يوجد",
    occupation: "مهندس",
    emergencyContact: "زوجته - 0501234568"
  }, {
    id: 2,
    patientCode: "P-0002",
    name: "فاطمة علي الزهراني",
    age: 32,
    phone: "0559876543",
    lastVisit: "2026-04-09",
    condition: "ماء زرق",
    status: "متابعة",
    gender: "أنثى",
    bloodType: "O+",
    address: "الجيزة",
    history: "لا يوجد",
    allergies: "بنسلين",
    occupation: "معلمة",
    emergencyContact: "زوجها - 0559876544"
  }, {
    id: 3,
    patientCode: "P-0003",
    name: "خالد سعد القحطاني",
    age: 58,
    phone: "0534567890",
    lastVisit: "2026-04-10",
    condition: "ماء أبيض",
    status: "طارئ",
    gender: "ذكر",
    bloodType: "B+",
    address: "الإسكندرية",
    history: "سكري",
    allergies: "لا يوجد",
    occupation: "متقاعد",
    emergencyContact: "ابنه - 0534567891"
  }, {
    id: 4,
    patientCode: "P-0004",
    name: "نورة عبدالله الشمري",
    age: 27,
    phone: "0521112233",
    lastVisit: "2026-04-07",
    condition: "بُعد نظر",
    status: "مكتمل",
    gender: "أنثى",
    bloodType: "AB+",
    address: "المنصورة",
    history: "لا يوجد",
    allergies: "لا يوجد",
    occupation: "طالبة",
    emergencyContact: "والدها - 0521112234"
  }, {
    id: 5,
    patientCode: "P-0005",
    name: "عمر إبراهيم الدوسري",
    age: 61,
    phone: "0567894321",
    lastVisit: "2026-04-05",
    condition: "شبكية العين",
    status: "متابعة",
    gender: "ذكر",
    bloodType: "O-",
    address: "أسيوط",
    history: "سكري - ضغط",
    allergies: "سلفا",
    occupation: "تاجر",
    emergencyContact: "زوجته - 0567894322"
  }],
  appointments: [{
    id: 1,
    patient: "أحمد محمد",
    time: "09:00",
    type: "فحص روتيني",
    doctor: "د. سلمى",
    clinic: "دمنهور"
  }, {
    id: 2,
    patient: "ريم خالد",
    time: "09:30",
    type: "متابعة ماء أبيض",
    doctor: "د. عبدالستار",
    clinic: "الرحمانية"
  }, {
    id: 3,
    patient: "بدر عبدالرحمن",
    time: "10:00",
    type: "قياس النظر",
    doctor: "د. سلمى",
    clinic: "دمنهور"
  }, {
    id: 4,
    patient: "سارة أحمد",
    time: "10:30",
    type: "فحص شبكية",
    doctor: "د. ليلى",
    clinic: "مركز دمنهور للعيون"
  }, {
    id: 5,
    patient: "ماجد الحربي",
    time: "11:00",
    type: "عملية ليزك",
    doctor: "د. عبدالستار",
    clinic: "الرحمانية"
  }],
  prescriptions: [{
    id: 1,
    patientId: 1,
    patient: "أحمد محمد العمري",
    date: "2026-04-08",
    eye: "كلتا العينين",
    sphR: "-2.00",
    cylR: "-0.50",
    axisR: "180",
    sphL: "-1.75",
    cylL: "-0.25",
    axisL: "175",
    add: "+1.00",
    medicines: "قطرة Timolol 0.5% مرتين يومياً",
    notes: "مراجعة بعد شهر"
  }],
  exams: [{
    id: 1,
    patientId: 1,
    date: "2026-04-08",
    doctor: "د. عبدالستار",
    chiefComplaint: "ضعف الرؤية عن بُعد",
    visualAcuityR: "6/12",
    visualAcuityL: "6/9",
    iopR: "14",
    iopL: "15",
    anteriorSegment: "القرنية سليمة - العدسة شفافة",
    posteriorSegment: "القرص البصري طبيعي - الشبكية سليمة",
    colorVision: "طبيعي",
    contrast: "طبيعي",
    coverTest: "طبيعي",
    diagnosis: "قصر نظر بسيط في كلتا العينين",
    treatmentPlan: "نظارة طبية\nمراجعة بعد 6 أشهر",
    followUp: "2026-10-08",
    notes: "تقليل وقت الشاشات"
  }],
  visits: [{
    id: 1,
    patientId: 1,
    date: "2026-04-08",
    type: "فحص روتيني",
    doctor: "د. عبدالستار",
    complaint: "ضعف الرؤية",
    result: "قصر نظر بسيط",
    cost: "350",
    paid: true,
    nextVisit: "2026-10-08",
    notes: ""
  }],
  doctors: [{
    id: 1,
    name: "د. عبدالستار صقر",
    short: "د. عبدالستار",
    title: "استشاري طب وجراحة العيون والليزر",
    initial: "ع",
    isPrimary: true
  }],
  prices: [{
    id: 1,
    name: "كشف روتيني",
    price: "200",
    icon: "👁"
  }, {
    id: 2,
    name: "استشارة",
    price: "100",
    icon: "💬"
  }, {
    id: 3,
    name: "فحص شبكية",
    price: "500",
    icon: "🔍"
  }, {
    id: 4,
    name: "قياس نظر",
    price: "200",
    icon: "👓"
  }, {
    id: 5,
    name: "فحص ضغط العين",
    price: "150",
    icon: "🔵"
  }, {
    id: 6,
    name: "عملية ليزك",
    price: "8000",
    icon: "⚡"
  }, {
    id: 7,
    name: "عملية ماء أبيض",
    price: "6000",
    icon: "🏥"
  }, {
    id: 8,
    name: "حقن داخل العين",
    price: "2500",
    icon: "💉"
  }],
  customTests: [],
  clinic: {
    address: "دمنهور - برج المنتزه بجوار حديقة الجمهورية | الرحمانية - ش أحمد محمود بجوار فرع we",
    phone: "دمنهور: 0453333313 | الرحمانية: 01111480137"
  },
  expenses: [{
    id: 1,
    date: localISO(),
    category: "مستلزمات طبية",
    amount: "500",
    notes: "قطرات ومستلزمات فحص",
    clinic: "",
    recurringId: null
  }],
  recurringExpenses: []
};
const EXP_CATS = [["رواتب", "👤"], ["إيجار", "🏢"], ["مستلزمات طبية", "💊"], ["فواتير وخدمات", "🧾"], ["صيانة", "🔧"], ["تسويق", "📣"], ["أخرى", "📦"]];
const CLINIC_FILTERS = [{
  v: "",
  l: "كل العيادات"
}, ...CLINICS];
const SB_URL = "https://mofdveiwlaymlabvsypu.supabase.co";
const SB_KEY = "sb_publishable_tVZ1mUOyb3vOjRV1jBpq6g_P2u-xIqF";
let _sb = null;
function getSB() {
  if (_sb) return _sb;
  if (window.__IAppSupabaseClient) {
    _sb = window.__IAppSupabaseClient;
  } else if (window.supabase) {
    _sb = window.supabase.createClient(SB_URL, SB_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: "iapp_sb_auth"
      }
    });
  }
  return _sb;
}
// Phase 48-52: all Supabase RPC calls go through the shared service layer
// (timeout, in-flight dedupe for writes). Falls back to the raw client if the
// Vite bridge is not present. Always resolves to { data, error }.
function iappRpc(sb, name, args) {
  const safe = window.IAppModules && window.IAppModules.rpc && window.IAppModules.rpc.safe;
  return safe ? safe(sb, name, args) : sb.rpc(name, args);
}
const LS = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
      return true;
    } catch {
      return false;
    }
  },
  del(k) {
    try {
      localStorage.removeItem(k);
    } catch {}
  }
};
const DIRTY_PREFIX = "iapp_dirty_";
const BASE_PREFIX = "iapp_base_";
const NOCACHE_KEYS = ["iapp_audit", "iapp_trash", "iapp_backups"];
const SYNC_KEY_LABELS = {
  patients: "المرضى",
  visits: "الزيارات",
  exams: "الفحوصات",
  prescriptions: "الوصفات الطبية",
  appointments: "المواعيد",
  expenses: "المصروفات",
  recurring_expenses: "المصروفات المتكررة",
  imaging: "الفحوصات والصور",
  imaging_studies: "دراسات الصور",
  audit: "سجل المراجعة",
  backups: "النسخ الاحتياطية",
  trash: "المحذوفات"
};
function syncKeyLabel(key) {
  return SYNC_KEY_LABELS[key] || key;
}
const offlineNow = () => typeof navigator !== "undefined" && navigator.onLine === false;
const SyncStore = {
  st: {
    online: !offlineNow(),
    reachable: null,
    pending: 0,
    pendingKeys: [],
    syncing: false,
    errors: {},
    lastSyncAt: null
  },
  subs: new Set(),
  set(p) {
    this.st = {
      ...this.st,
      ...p
    };
    this.subs.forEach(f => f(this.st));
  }
};
function useSyncStatus() {
  const [s, setS] = useState(SyncStore.st);
  useEffect(() => {
    SyncStore.subs.add(setS);
    setS(SyncStore.st);
    return () => {
      SyncStore.subs.delete(setS);
    };
  }, []);
  const offline = s.online === false || s.reachable === false;
  const failedCount = Object.keys(s.errors || {}).length;
  let label, color;
  if (offline) {
    label = s.pending > 0 ? `بدون اتصال · ${s.pending} عناصر معلّقة` : "بدون اتصال";
    color = C.danger;
  } else if (s.syncing) {
    label = "جاري المزامنة...";
    color = C.gold;
  } else if (s.pending > 0) {
    label = `في انتظار المزامنة · ${s.pending} عناصر بيانات`;
    color = C.gold;
  } else {
    label = "متصل ومحدّث";
    color = C.success;
  }
  return {
    ...s,
    offline,
    failedCount,
    label,
    color,
    busy: offline || s.syncing || s.pending > 0
  };
}
const dbBus = {};
function busOn(key, fn) {
  (dbBus[key] = dbBus[key] || new Set()).add(fn);
  return () => {
    dbBus[key].delete(fn);
  };
}
function busEmit(key, val) {
  if (dbBus[key]) dbBus[key].forEach(fn => fn(val));
}
const isDirty = key => LS.get(DIRTY_PREFIX + key) !== null;
function dirtyKeys() {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(DIRTY_PREFIX)) out.push(k.slice(DIRTY_PREFIX.length));
    }
  } catch {}
  return out;
}
function refreshPending() {
  const keys = dirtyKeys();
  SyncStore.set({
    pending: keys.length,
    pendingKeys: keys
  });
}
async function tq(q, fin, ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms || 12000);
  try {
    let b = q.abortSignal(c.signal).retry(false);
    if (fin) b = fin(b);
    const r = await b;
    if (r && r.error) {
      SyncStore.set({
        reachable: r.error.code ? true : false
      });
    } else SyncStore.set({
      reachable: true
    });
    return r;
  } finally {
    clearTimeout(t);
  }
}
function mergeData(base, local, remote) {
  const okList = a => Array.isArray(a) && a.every(x => x && typeof x === "object" && x.id !== undefined && x.id !== null);
  if (!okList(local) || !okList(remote) || base != null && !okList(base)) return local;
  const mp = a => new Map((a || []).map(x => [String(x.id), x]));
  const B = mp(base),
    L = mp(local),
    R = mp(remote);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const out = [];
  for (const [id, l] of L) {
    const b = B.get(id),
      r = R.get(id);
    if (!b) out.push(l);else if (!same(l, b)) out.push(l);else if (r) out.push(r);
  }
  for (const [id, r] of R) {
    if (L.has(id)) continue;
    const b = B.get(id);
    if (!b) out.push(r);else if (!same(r, b)) out.push(r);
  }
  return out;
}
const flushing = {};
async function flushKey(key) {
  if (flushing[key]) {
    flushing[key].again = true;
    return flushing[key].p;
  }
  const job = {
    again: false
  };
  job.p = (async () => {
    let ok = false;
    do {
      job.again = false;
      const stamp = LS.get(DIRTY_PREFIX + key);
      if (!stamp) {
        ok = true;
        break;
      }
      let local;
      try {
        local = JSON.parse(LS.get(key));
      } catch (e) {
        SyncStore.set({ errors: { ...SyncStore.st.errors, [key]: "بيانات محلية غير صالحة" } });
        break;
      }
      const remote = await _sbGetRaw(key);
      if (remote === undefined) {
        ok = false;
        SyncStore.set({ errors: { ...SyncStore.st.errors, [key]: "تعذر قراءة البيانات من الخادم" } });
        break;
      }
      let base = null;
      try {
        const b = LS.get(BASE_PREFIX + key);
        base = b ? JSON.parse(b) : null;
      } catch {}
      const merged = remote === null ? local : mergeData(base, local, remote);
      const saved = await _sbSetRaw(key, merged);
      if (!saved) {
        ok = false;
        SyncStore.set({ errors: { ...SyncStore.st.errors, [key]: "تعذر حفظ البيانات على الخادم" } });
        break;
      }
      const mergedStr = JSON.stringify(merged);
      if (LS.get(DIRTY_PREFIX + key) === stamp) {
        LS.del(DIRTY_PREFIX + key);
        LS.del(BASE_PREFIX + key);
        if (NOCACHE_KEYS.includes(key)) LS.del(key);else LS.set(key, mergedStr);
        if (mergedStr !== JSON.stringify(local)) busEmit(key, merged);
        const nextErrors = { ...SyncStore.st.errors };
        delete nextErrors[key];
        SyncStore.set({ errors: nextErrors, lastSyncAt: Date.now() });
        ok = true;
      } else {
        LS.set(BASE_PREFIX + key, mergedStr);
        job.again = true;
      }
    } while (job.again);
    return ok;
  })();
  flushing[key] = job;
  try {
    return await job.p;
  } finally {
    if (flushing[key] === job) delete flushing[key];
  }
}
let _flushAllBusy = false;
async function flushAll() {
  if (_flushAllBusy) return;
  const keys = dirtyKeys();
  if (!keys.length) {
    SyncStore.set({
      pending: 0,
      pendingKeys: [],
      syncing: false
    });
    return;
  }
  _flushAllBusy = true;
  SyncStore.set({
    syncing: true,
    pending: keys.length
  });
  try {
    for (const k of keys) {
      await flushKey(k);
    }
  } finally {
    _flushAllBusy = false;
    const remaining = dirtyKeys();
    SyncStore.set({
      syncing: false,
      pending: remaining.length,
      pendingKeys: remaining
    });
  }
}
function queueLocal(key, val) {
  if (!isDirty(key)) {
    const prev = LS.get(key);
    if (prev !== null) LS.set(BASE_PREFIX + key, prev);else LS.del(BASE_PREFIX + key);
  }
  if (!LS.set(key, JSON.stringify(val))) return false;
  LS.set(DIRTY_PREFIX + key, Date.now() + "-" + Math.random());
  refreshPending();
  return true;
}
async function queueSave(key, val) {
  if (!queueLocal(key, val)) return await _sbSetRaw(key, val);
  const ok = await flushKey(key);
  refreshPending();
  return ok;
}
if (typeof window !== "undefined" && !window.__iappSyncInit) {
  window.__iappSyncInit = true;
  window.addEventListener("online", () => {
    SyncStore.set({
      online: true,
      reachable: null
    });
    flushAll();
  });
  window.addEventListener("offline", () => {
    SyncStore.set({
      online: false
    });
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && dirtyKeys().length) flushAll();
  });
  setInterval(() => {
    if (dirtyKeys().length) flushAll();else if (SyncStore.st.reachable === false && !offlineNow()) _sbGetRaw("iapp_ping");
  }, 20000);
  refreshPending();
}
const ADMIN_EMAILS = ["admin@sakr.clinic"];
const DEFAULT_ROLES = {
  "admin@sakr.clinic": {
    role: "admin",
    name: "د. عبدالستار صقر"
  },
  "user1@sakr.clinic": {
    role: "secretary",
    name: "سكرتارية 1"
  },
  "user2@sakr.clinic": {
    role: "secretary",
    name: "سكرتارية 2"
  },
  "user3@sakr.clinic": {
    role: "secretary",
    name: "سكرتارية 3"
  }
};
const BOOKING_TABLE = "iapp_booking_requests";
const SLOTS_VIEW = "iapp_slots_taken";
const KIOSK_EMAIL = "";
const KIOSK_PASSWORD = "";
const PATIENT_FILE_LOGIN = false;
async function sbSession() {
  let failed = offlineNow();
  if (!failed) {
    try {
      const sb = getSB();
      if (!sb) return null;
      const r = await Promise.race([sb.auth.getSession(), new Promise(res => setTimeout(() => res({
        timeout: true
      }), 6000))]);
      if (r.timeout) failed = true;else {
        if (r.data && r.data.session) return r.data.session;
        failed = !!r.error;
      }
    } catch (e) {
      failed = true;
    }
  }
  try {
    if (failed || SyncStore.st.reachable === false) {
      const raw = localStorage.getItem("iapp_sb_auth");
      if (raw) {
        const p = JSON.parse(raw);
        const s = p && (p.currentSession || p);
        if (s && s.user && s.refresh_token) return s;
      }
    }
  } catch (e) {}
  return null;
}
async function sbSignOut() {
  const sb = getSB();
  if (offlineNow()) {
    try {
      localStorage.removeItem("iapp_sb_auth");
    } catch (e) {}
    try {
      if (sb) sb.auth.signOut({
        scope: "local"
      }).catch(() => {});
    } catch (e) {}
    return;
  }
  try {
    if (sb) await Promise.race([sb.auth.signOut(), new Promise(r => setTimeout(r, 4000))]);
  } catch (e) {}
  try {
    localStorage.removeItem("iapp_sb_auth");
  } catch (e) {}
}
let _kioskTried = false;
async function ensureKiosk() {
  if (!KIOSK_EMAIL || !KIOSK_PASSWORD) return false;
  if (await sbSession()) return true;
  if (_kioskTried) return false;
  _kioskTried = true;
  try {
    const {
      error
    } = await getSB().auth.signInWithPassword({
      email: KIOSK_EMAIL,
      password: KIOSK_PASSWORD
    });
    return !error;
  } catch (e) {
    return false;
  }
}
const APT_KEY = "iapp_appointments";
const APT_TABLE = "iapp_appointments";
const APT_HISTORY_DAYS = 365;
const aptFromRowLegacy = r => ({
  id: Number(r.id),
  patientId: r.patient_id == null ? null : Number(r.patient_id),
  patient: r.patient || "",
  phone: r.phone || "",
  date: r.date || "",
  time: r.time || "",
  type: r.type || "",
  doctor: r.doctor || "",
  clinic: r.clinic || "",
  notes: r.notes || "",
  confirmed: !!r.confirmed,
  fromPatient: !!r.from_patient,
  cancelled: !!r.cancelled,
  waitStatus: r.wait_status || undefined,
  arrivedAt: r.arrived_at == null ? undefined : Number(r.arrived_at),
  calledAt: r.called_at == null ? undefined : Number(r.called_at),
  inAt: r.in_at == null ? undefined : Number(r.in_at),
  doneAt: r.done_at == null ? undefined : Number(r.done_at),
  noShowAt: r.no_show_at == null ? undefined : Number(r.no_show_at),
  queueNumber: r.queue_number == null ? undefined : Number(r.queue_number),
  cost: r.cost == null ? undefined : r.cost,
  paid: !!r.paid,
  reminded: r.reminded || undefined
});
const num = v => v === undefined || v === null || v === "" ? null : Number(v);
const aptToRowLegacy = a => ({
  id: Number(a.id),
  patient_id: a.patientId == null ? null : Number(a.patientId),
  patient: a.patient || "",
  phone: a.phone || "",
  date: a.date || null,
  time: a.time || "",
  type: a.type || null,
  doctor: a.doctor || null,
  clinic: a.clinic || null,
  notes: a.notes || null,
  confirmed: !!a.confirmed,
  from_patient: !!a.fromPatient,
  cancelled: !!a.cancelled,
  wait_status: a.waitStatus || null,
  arrived_at: num(a.arrivedAt),
  called_at: num(a.calledAt),
  in_at: num(a.inAt),
  done_at: num(a.doneAt),
  no_show_at: num(a.noShowAt),
  queue_number: num(a.queueNumber),
  cost: a.cost === undefined || a.cost === "" ? null : String(a.cost),
  paid: !!a.paid,
  reminded: a.reminded || null,
  updated_at: new Date().toISOString()
});
// Phase 77-80: request payload builders live in src/modules/* (unit-tested).
// The inline branches are a fallback used only if the Vite bridge is missing.
function rxCoreParams(rx, visitId, today) {
  const m = window.IAppModules && window.IAppModules.prescriptions;
  if (m && m.paramsFromLegacy) return m.paramsFromLegacy(rx, { visitId, today });
  return {
    p_patient_id: Number(rx.patientId), p_prescription_date: rx.date || today, p_visit_id: visitId, p_eye: rx.eye || "OU",
    p_sph_od: rx.sphR || null, p_cyl_od: rx.cylR || null, p_axis_od: rx.axisR || null,
    p_sph_os: rx.sphL || null, p_cyl_os: rx.cylL || null, p_axis_os: rx.axisL || null,
    p_add_power: rx.add || null,
    p_medicines: Array.isArray(rx.medicines) ? rx.medicines : (rx.medicines ? [{ name: rx.medicines }] : []),
    p_notes: rx.notes || null, p_legacy_id: String(rx.id), p_prescription_type: "mixed"
  };
}
function imagingRequestOrderParams(o) {
  const m = window.IAppModules && window.IAppModules.investigations;
  if (m && m.imagingRequestParams) return m.imagingRequestParams(o);
  const eyes = [...new Set(o.tests.map(t => t.eye).filter(Boolean))];
  return {
    p_patient_id: Number(o.patientId), p_visit_id: o.visitId == null ? null : o.visitId, p_investigation_type: "imaging",
    p_test_name: o.tests.map(t => t.name || t.name_ar || t.id).join(" + "), p_eye: eyes.length === 1 ? eyes[0] : "OU",
    p_priority: "routine", p_requested_by: o.doctorName || "", p_doctor_name: o.doctorName || "",
    p_clinical_note: o.requestNotes || "", p_tests: o.tests, p_source_exam_legacy_id: String(o.sourceLegacyId)
  };
}
function imagingSingleOrderParams(o) {
  const m = window.IAppModules && window.IAppModules.investigations;
  if (m && m.singleImagingOrderParams) return m.singleImagingOrderParams(o);
  return {
    p_patient_id: Number(o.patientId), p_visit_id: null, p_investigation_type: "imaging", p_test_name: o.typeName,
    p_eye: o.eye || null, p_priority: "routine", p_requested_by: o.doctorName || "", p_doctor_name: o.doctorName || "",
    p_clinical_note: String(o.notes || "").trim() || null, p_tests: [{ id: o.type, name: o.typeName, eye: o.eye }],
    p_source_exam_legacy_id: String(o.sourceLegacyId)
  };
}
function imagingStudyRpcParams(o) {
  const m = window.IAppModules && window.IAppModules.imaging;
  if (m && m.studyParams) return m.studyParams(o);
  const files = o.uploaded || [];
  return {
    p_investigation_order_id: Number(o.orderId), p_study_type: o.typeName,
    p_cloudinary_public_id: files[0]?.public_id || null, p_cloudinary_url: files[0]?.src || null,
    p_report: String(o.report || "").trim() || null, p_eye: o.eye || null, p_modality: o.modality || null,
    p_metadata: o.metadata || {}, p_files: files, p_notes: String(o.notes || "").trim() || null
  };
}
const _aptMod = () => window.IAppModules && window.IAppModules.appointments;
// Phase 76: mapping/diff live in src/modules/appointments (unit-tested).
// The *Legacy copies stay only as a fallback until the final cleanup.
const aptFromRow = r => _aptMod() ? _aptMod().fromRow(r) : aptFromRowLegacy(r);
const aptToRow = a => _aptMod() ? _aptMod().toRow(a) : aptToRowLegacy(a);
async function aptList() {
  try {
    const sb = getSB();
    if (!sb) return undefined;
    const from = new Date();
    from.setDate(from.getDate() - APT_HISTORY_DAYS);
    if (offlineNow()) return undefined;
    const {
      data,
      error
    } = await tq(sb.from(APT_TABLE).select("*").gte("date", localISO(from)).order("date", {
      ascending: true
    }));
    if (error) {
      console.warn("aptList", error.message);
      return undefined;
    }
    const list = (data || []).map(aptFromRow);
    if (!isDirty(APT_KEY)) LS.set(APT_KEY, JSON.stringify(list));
    return list;
  } catch (e) {
    console.warn("aptList", e);
    return undefined;
  }
}
async function aptUpsert(a) {
  const sb = getSB();
  if (!sb) return false;
  const {
    error
  } = await tq(sb.from(APT_TABLE).upsert(aptToRow(a), {
    onConflict: "id"
  }));
  if (error) console.warn("aptUpsert", error.message);
  return !error;
}
async function aptDelete(id) {
  const sb = getSB();
  if (!sb) return false;
  const {
    error
  } = await tq(sb.from(APT_TABLE).delete().eq("id", Number(id)));
  if (error) console.warn("aptDelete", error.message);
  return !error;
}
async function aptMutate(mutator, verify) {
  const base = await aptList();
  if (base === undefined) return {
    ok: false,
    error: "offline"
  };
  const next = mutator(base);
  if (next && !Array.isArray(next) && next.abort) return {
    ok: false,
    error: next.abort,
    data: base
  };
  let changed, removed;
  if (_aptMod()) {
    ({ changed, removed } = _aptMod().diff(base, next));
  } else {
    const prevById = new Map(base.map(a => [String(a.id), a]));
    const nextById = new Map(next.map(a => [String(a.id), a]));
    changed = next.filter(a => {
      const p = prevById.get(String(a.id));
      return !p || JSON.stringify(p) !== JSON.stringify(a);
    });
    removed = base.filter(a => !nextById.has(String(a.id)));
  }
  let ok = true;
  for (const a of changed) {
    if (!(await aptUpsert(a))) ok = false;
  }
  for (const a of removed) {
    if (!(await aptDelete(a.id))) ok = false;
  }
  if (!ok) return {
    ok: false,
    error: "offline",
    data: base
  };
  try {
    localStorage.setItem(APT_KEY, JSON.stringify(next));
  } catch {}
  if (verify) {
    const check = await aptList();
    if (Array.isArray(check) && verify(check)) return {
      ok: true,
      data: check
    };
    return {
      ok: false,
      error: "conflict",
      data: check || next
    };
  }
  return {
    ok: true,
    data: next
  };
}
async function aptSetAll(list) {
  const res = await aptMutate(() => list);
  return res.ok;
}
const ROW_TABLES = {
  iapp_visits: {
    table: "iapp_visits",
    fromRow: r => ({
      id: String(r.id),
      patientId: r.patient_id == null ? null : Number(r.patient_id),
      patient: r.patient || "",
      date: r.date || "",
      type: r.type || "",
      doctor: r.doctor || "",
      clinic: r.clinic || "",
      complaint: r.complaint || "",
      result: r.result || "",
      cost: r.cost == null ? "" : String(r.cost),
      paid: !!r.paid,
      nextVisit: r.next_visit || "",
      notes: r.notes || "",
      rated: !!r.rated
    }),
    toRow: v => ({
      id: String(v.id),
      patient_id: v.patientId == null ? null : Number(v.patientId),
      patient: v.patient || "",
      date: v.date || null,
      type: v.type || null,
      doctor: v.doctor || null,
      clinic: v.clinic || null,
      complaint: v.complaint || null,
      result: v.result || null,
      cost: v.cost === undefined || v.cost === "" ? null : String(v.cost),
      paid: !!v.paid,
      next_visit: v.nextVisit || null,
      notes: v.notes || null,
      rated: !!v.rated,
      updated_at: new Date().toISOString()
    }),
    order: "date"
  },
  iapp_expenses: {
    table: "iapp_expenses",
    fromRow: r => ({
      id: String(r.id),
      date: r.date || "",
      category: r.category || "",
      amount: r.amount == null ? "" : String(r.amount),
      notes: r.notes || "",
      clinic: r.clinic || "",
      recurringId: r.recurring_id || undefined
    }),
    toRow: e => ({
      id: String(e.id),
      date: e.date || null,
      category: e.category || null,
      amount: e.amount === undefined || e.amount === "" ? null : String(e.amount),
      notes: e.notes || null,
      clinic: e.clinic || null,
      recurring_id: e.recurringId == null ? null : String(e.recurringId),
      updated_at: new Date().toISOString()
    }),
    order: "date"
  },
  iapp_recurring_expenses: {
    table: "iapp_recurring_expenses",
    fromRow: r => ({
      id: String(r.id),
      category: r.category || "",
      amount: r.amount == null ? "" : String(r.amount),
      notes: r.notes || "",
      clinic: r.clinic || ""
    }),
    toRow: r => ({
      id: String(r.id),
      category: r.category || null,
      amount: r.amount === undefined || r.amount === "" ? null : String(r.amount),
      notes: r.notes || null,
      clinic: r.clinic || null,
      updated_at: new Date().toISOString()
    }),
    order: "id"
  }
};
async function rowList(key) {
  const cfg = ROW_TABLES[key];
  if (!cfg) return undefined;
  try {
    const sb = getSB();
    if (!sb) return undefined;
    if (offlineNow()) return undefined;
    const {
      data,
      error
    } = await tq(sb.from(cfg.table).select("*").order(cfg.order, {
      ascending: true
    }));
    if (error) {
      console.warn("rowList " + key, error.message);
      return undefined;
    }
    const list = (data || []).map(cfg.fromRow);
    if (!isDirty(key)) LS.set(key, JSON.stringify(list));
    return list;
  } catch (e) {
    console.warn("rowList " + key, e);
    return undefined;
  }
}
async function rowUpsert(key, rec) {
  const cfg = ROW_TABLES[key];
  const sb = getSB();
  if (!cfg || !sb) return false;
  const {
    error
  } = await tq(sb.from(cfg.table).upsert(cfg.toRow(rec), {
    onConflict: "id"
  }));
  if (error) console.warn("rowUpsert " + key, error.message);
  return !error;
}
async function rowDelete(key, id) {
  const cfg = ROW_TABLES[key];
  const sb = getSB();
  if (!cfg || !sb) return false;
  const {
    error
  } = await tq(sb.from(cfg.table).delete().eq("id", String(id)));
  if (error) console.warn("rowDelete " + key, error.message);
  return !error;
}
async function rowMutate(key, mutator, verify) {
  const base = await rowList(key);
  if (base === undefined) return {
    ok: false,
    error: "offline"
  };
  const next = mutator(base);
  if (next && !Array.isArray(next) && next.abort) return {
    ok: false,
    error: next.abort,
    data: base
  };
  const prevById = new Map(base.map(r => [String(r.id), r]));
  const nextById = new Map(next.map(r => [String(r.id), r]));
  const changed = next.filter(r => {
    const p = prevById.get(String(r.id));
    return !p || JSON.stringify(p) !== JSON.stringify(r);
  });
  const removed = base.filter(r => !nextById.has(String(r.id)));
  let ok = true;
  for (const r of changed) {
    if (!(await rowUpsert(key, r))) ok = false;
  }
  for (const r of removed) {
    if (!(await rowDelete(key, r.id))) ok = false;
  }
  if (!ok) return {
    ok: false,
    error: "offline",
    data: base
  };
  try {
    localStorage.setItem(key, JSON.stringify(next));
  } catch {}
  if (verify) {
    const check = await rowList(key);
    if (Array.isArray(check) && verify(check)) return {
      ok: true,
      data: check
    };
    return {
      ok: false,
      error: "conflict",
      data: check || next
    };
  }
  return {
    ok: true,
    data: next
  };
}
async function _sbGetStore(key) {
  try {
    const sb = getSB();
    if (!sb) return undefined;
    const {
      data,
      error
    } = await tq(sb.from("iapp_store").select("value").eq("key", key), b => b.maybeSingle(), 10000);
    if (error) {
      console.warn("sbGet error:", error.message);
      return undefined;
    }
    if (!data) return null;
    const val = data.value;
    if (val === null || val === undefined) return null;
    if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") return val;
    if (Array.isArray(val) || typeof val === "object") {
      try {
        return JSON.parse(JSON.stringify(val));
      } catch {
        return val;
      }
    }
    return val;
  } catch (e) {
    console.warn("sbGet exception:", e.message || e);
    SyncStore.set({
      reachable: false
    });
    return undefined;
  }
}
async function _sbSetStore(key, value) {
  try {
    const sb = getSB();
    if (!sb) return false;
    const {
      error
    } = await tq(sb.from("iapp_store").upsert({
      key,
      value
    }, {
      onConflict: "key"
    }), null, 15000);
    if (error) {
      console.warn("sbSet error:", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("sbSet exception:", e);
    SyncStore.set({
      reachable: false
    });
    return false;
  }
}
async function _sbGetRaw(key) {
  if (offlineNow()) {
    SyncStore.set({
      reachable: false
    });
    return undefined;
  }
  if (key === APT_KEY) return await aptList();
  if (ROW_TABLES[key]) return await rowList(key);
  return await _sbGetStore(key);
}
async function _sbSetRaw(key, value) {
  if (offlineNow()) {
    SyncStore.set({
      reachable: false
    });
    return false;
  }
  if (key === APT_KEY) return await aptSetAll(Array.isArray(value) ? value : []);
  if (ROW_TABLES[key]) return (await rowMutate(key, () => Array.isArray(value) ? value : [])).ok;
  return await _sbSetStore(key, value);
}
async function sbGet(key) {
  if (isDirty(key)) {
    if (!flushing[key]) flushKey(key).then(refreshPending);
    const l = LS.get(key);
    if (l !== null) {
      try {
        return JSON.parse(l);
      } catch {}
    }
  }
  const v = await _sbGetRaw(key);
  if (v !== undefined && v !== null && !isDirty(key) && !NOCACHE_KEYS.includes(key) && BACKUP_KEYS.includes(key)) LS.set(key, JSON.stringify(v));
  return v;
}
async function sbSet(key, value) {
  if (isDirty(key)) await flushKey(key);
  return await _sbSetRaw(key, value);
}
function sbMutateLocal(key, mutator) {
  if (key === BACKUP_KEY) return {
    ok: false,
    error: "offline"
  };
  let cur = [];
  try {
    const l = LS.get(key);
    if (l !== null) {
      const p = JSON.parse(l);
      if (Array.isArray(p)) cur = p;
    }
  } catch {}
  const next = mutator(cur);
  if (next && !Array.isArray(next) && next.abort) return {
    ok: false,
    error: next.abort,
    data: cur
  };
  if (!queueLocal(key, next)) return {
    ok: false,
    error: "offline",
    data: cur
  };
  busEmit(key, next);
  flushKey(key).then(refreshPending);
  return {
    ok: true,
    data: next,
    queued: true
  };
}
async function sbMutate(key, mutator, verify) {
  if (isDirty(key)) {
    const ok = await flushKey(key);
    if (!ok) return sbMutateLocal(key, mutator);
  }
  const res = await _sbMutateOnline(key, mutator, verify);
  if (res.ok || res.error !== "offline") return res;
  return sbMutateLocal(key, mutator);
}
// Phase 33 fix (H3): iapp_create_clinical_visit is called from several places without
// knowing for certain whether the deployed function accepts p_legacy_id (the review
// could not confirm the live signature). Rather than guessing — which could either
// silently fail forever if the param is required and missing, or break every call if
// added and the function doesn't have it — try the fuller call first and gracefully
// retry without p_legacy_id only if PostgREST reports it doesn't recognize the
// function/parameter shape. This is safe under either real signature.
async function createClinicalVisitCore(sb, params, legacyId) {
  const withLegacy = { ...params, p_legacy_id: legacyId };
  const first = await iappRpc(sb, "iapp_create_clinical_visit", withLegacy);
  if (!first.error) return first;
  const msg = String(first.error?.message || first.error?.hint || "");
  const looksLikeUnknownParam = first.error?.code === "PGRST202" || /p_legacy_id|could not find|does not exist|no function matches/i.test(msg);
  if (!looksLikeUnknownParam) return first;
  console.warn("[iapp_create_clinical_visit] retrying without p_legacy_id (function may not accept it yet):", msg);
  return await iappRpc(sb, "iapp_create_clinical_visit", params);
}
function useDB(key, seed) {
  const [data, setData] = useState(() => {
    try {
      const local = LS.get(key);
      if (local) return JSON.parse(local);
    } catch {}
    return seed;
  });
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
    const off = busOn(key, setData);
    (async () => {
      if (isDirty(key)) {
        await flushKey(key);
        refreshPending();
        return;
      }
      const remote = await _sbGetRaw(key);
      if (remote === undefined) {
        console.log(`[${key}] offline — using localStorage`);
      } else if (remote === null) {
        let toUpload = seed;
        try {
          const l = LS.get(key);
          if (l) toUpload = JSON.parse(l);
        } catch {}
        await _sbSetRaw(key, toUpload);
        console.log(`[${key}] first sync ✓`);
      } else if (!isDirty(key)) {
        setData(remote);
        LS.set(key, JSON.stringify(remote));
        console.log(`[${key}] loaded from Supabase ✓`);
      }
    })();
    return off;
  }, [key]);
  useEffect(() => {
    const sb = getSB();
    if (!sb) return undefined;
    let channel;
    if (ROW_TABLES[key]) {
      try {
        channel = sb.channel("rows_" + key).on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: ROW_TABLES[key].table
        }, async () => {
          if (isDirty(key)) return;
          const list = await rowList(key);
          if (Array.isArray(list) && !isDirty(key)) setData(list);
        }).subscribe();
      } catch (e) {
        console.warn(key + " realtime unavailable", e && e.message);
      }
      return () => {
        if (channel) {
          try {
            sb.removeChannel(channel);
          } catch {}
        }
      };
    }
    if (key === APT_KEY) {
      try {
        channel = sb.channel("iapp_appointments_rows").on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: APT_TABLE
        }, async () => {
          if (isDirty(key)) return;
          const list = await aptList();
          if (Array.isArray(list) && !isDirty(key)) setData(list);
        }).subscribe();
      } catch (e) {
        console.warn("appointments realtime unavailable", e && e.message);
      }
      return () => {
        if (channel) {
          try {
            sb.removeChannel(channel);
          } catch {}
        }
      };
    }
    try {
      channel = sb.channel(`iapp_store_${key}`).on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'iapp_store',
        filter: `key=eq.${key}`
      }, payload => {
        if (isDirty(key)) return;
        const next = payload?.new?.value;
        if (next !== undefined && next !== null) {
          setData(next);
          LS.set(key, JSON.stringify(next));
        }
      }).subscribe();
    } catch (e) {
      console.warn(`[${key}] realtime unavailable`, e?.message || e);
    }
    return () => {
      if (channel) {
        try {
          sb.removeChannel(channel);
        } catch {}
      }
    };
  }, [key]);
  const persist = useCallback(async val => {
    setData(val);
    return await queueSave(key, val);
  }, [key]);
  const refresh = useCallback(async () => {
    const remote = await sbGet(key);
    if (remote !== undefined && remote !== null) {
      setData(prev => JSON.stringify(prev) === JSON.stringify(remote) ? prev : remote);
      if (!isDirty(key)) LS.set(key, JSON.stringify(remote));
      return remote;
    }
    return undefined;
  }, [key]);
  return [data, persist, ready, refresh];
}
function genCode(patients) {
  const nums = patients.map(p => parseInt((p.patientCode || "P-0000").replace("P-", "")) || 0);
  const next = Math.max(0, ...nums) + 1;
  return "P-" + String(next).padStart(4, "0");
}
const inp = (ex = {}) => ({
  width: "100%",
  background: C.bg,
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  padding: "10px 12px",
  color: C.text,
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
  direction: "rtl",
  fontFamily: "inherit",
  ...ex
});
const Field = ({
  label,
  children
}) => React.createElement("div", null, React.createElement("label", {
  style: {
    color: C.muted,
    fontSize: 11,
    display: "block",
    marginBottom: 5
  }
}, label), children);
function Btn({
  children,
  onClick,
  danger,
  full,
  small,
  outline,
  color
}) {
  const bg = color || C.accent;
  return React.createElement("button", {
    onClick: onClick,
    style: {
      background: outline ? "transparent" : danger ? `linear-gradient(135deg,${C.danger},#aa0020)` : `linear-gradient(135deg,${bg},${C.teal})`,
      border: outline ? `1px solid ${C.border}` : "none",
      borderRadius: 10,
      padding: small ? "6px 14px" : "11px 18px",
      color: outline ? C.muted : C.bg,
      fontWeight: 700,
      fontSize: small ? 11 : 13,
      cursor: "pointer",
      width: full ? "100%" : "auto",
      whiteSpace: "nowrap",
      fontFamily: "inherit"
    }
  }, children);
}
function Modal({
  title,
  onClose,
  children
}) {
  return React.createElement("div", {
    style: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.8)",
      zIndex: 400,
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "center"
    },
    onClick: onClose
  }, React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      background: C.surface,
      borderRadius: "20px 20px 0 0",
      padding: "20px 16px 44px",
      width: "100%",
      maxWidth: 480,
      maxHeight: "92vh",
      overflowY: "auto",
      border: `1px solid ${C.border}`
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 18
    }
  }, React.createElement("span", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 15
    }
  }, title), React.createElement("span", {
    onClick: onClose,
    style: {
      color: C.muted,
      fontSize: 28,
      cursor: "pointer",
      lineHeight: 1
    }
  }, "×")), children));
}
function Confirm({
  msg,
  onOk,
  onNo
}) {
  return React.createElement(Modal, {
    title: "تأكيد",
    onClose: onNo
  }, React.createElement("p", {
    style: {
      color: C.muted,
      fontSize: 13,
      marginBottom: 20
    }
  }, msg), React.createElement("div", {
    style: {
      display: "flex",
      gap: 10
    }
  }, React.createElement(Btn, {
    outline: true,
    full: true,
    onClick: onNo
  }, "إلغاء"), React.createElement(Btn, {
    danger: true,
    full: true,
    onClick: onOk
  }, "تأكيد")));
}
function SecHead({
  icon,
  label,
  color
}) {
  return React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginBottom: 10
    }
  }, React.createElement("span", {
    style: {
      fontSize: 14
    }
  }, icon), React.createElement("span", {
    style: {
      color: color || C.accent,
      fontWeight: 700,
      fontSize: 13
    }
  }, label));
}
function Tag({
  label,
  color
}) {
  return React.createElement("span", {
    style: {
      background: color + "22",
      color,
      borderRadius: 8,
      padding: "3px 10px",
      fontSize: 11,
      fontWeight: 600
    }
  }, label);
}
function Toast({
  msg,
  onDone
}) {
  const warn = typeof msg === "string" && msg.startsWith("⚠");
  useEffect(() => {
    const t = setTimeout(onDone, warn ? 4000 : 2200);
    return () => clearTimeout(t);
  }, [msg]);
  return React.createElement("div", {
    style: {
      position: "fixed",
      bottom: 80,
      left: "50%",
      transform: "translateX(-50%)",
      background: warn ? C.gold : C.success,
      color: C.bg,
      borderRadius: 14,
      padding: "10px 22px",
      fontWeight: 700,
      fontSize: 13,
      zIndex: 999,
      whiteSpace: "nowrap",
      boxShadow: `0 4px 20px ${warn ? C.gold : C.success}66`,
      animation: "toastIn 0.3s ease"
    }
  }, warn ? msg : "✓ " + msg);
}
const DEFAULT_USERS = [];
function getUsers() {
  try {
    const u = localStorage.getItem("iapp_users");
    if (u) {
      const list = JSON.parse(u);
      if (Array.isArray(list) && list.length) return list;
    }
  } catch {}
  return [];
}
let _usersSynced = false;
const isRealUser = u => !!u && (!!u.email || !!u.username);
function saveUsers(list, opts) {
  try {
    localStorage.setItem("iapp_users", JSON.stringify(list));
  } catch {}
  if (!(opts && opts.localOnly)) pushUsers(list);
}
async function pushUsers(list) {
  if (!_usersSynced) return false;
  const clean = (list || []).filter(isRealUser).map(({
    password,
    pw,
    ...u
  }) => u);
  if (!clean.length) return false;
  return sbSet("iapp_users", clean);
}
async function pullUsers() {
  const remote = await sbGet("iapp_users");
  if (remote === undefined) return false;
  if (Array.isArray(remote) && remote.some(isRealUser)) {
    try {
      localStorage.setItem("iapp_users", JSON.stringify(remote));
    } catch {}
    _usersSynced = true;
    return true;
  }
  _usersSynced = true;
  let local = null;
  try {
    local = JSON.parse(localStorage.getItem("iapp_users") || "null");
  } catch {}
  if (Array.isArray(local) && local.some(u => u && u.email)) await pushUsers(local);
  return true;
}
function LoginScreen({
  onLogin
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = e => {
    if (e && e.preventDefault) e.preventDefault();
    if (!username.trim() || !password) {
      setError("❌ من فضلك أدخل البريد الإلكتروني وكلمة المرور");
      return;
    }
    if (loading) return;
    setLoading(true);
    authenticateStaff(username, password).then(r => {
      setLoading(false);
      if (r.user) {
        setError("");
        onLogin(r.user, remember);
      } else setError(r.error);
    });
  };
  return React.createElement("div", {
    style: {
      minHeight: "100vh",
      background: C.bg,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      direction: "rtl",
      fontFamily: "'Segoe UI','Tahoma',Arial,sans-serif",
      padding: "24px 20px"
    }
  }, React.createElement("div", {
    style: {
      width: 76,
      height: 76,
      borderRadius: 20,
      background: `linear-gradient(135deg,${C.accent},${C.teal})`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 34,
      marginBottom: 18,
      boxShadow: `0 0 24px ${C.accent}55`
    }
  }, "👁"), React.createElement("div", {
    style: {
      color: C.accent,
      fontWeight: 800,
      fontSize: 22,
      marginBottom: 4
    }
  }, "I App"), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 12,
      marginBottom: 32,
      textAlign: "center"
    }
  }, "عيادة د. عبدالستار صقر — تسجيل الدخول"), React.createElement("form", {
    onSubmit: submit,
    style: {
      width: "100%",
      maxWidth: 300,
      display: "flex",
      flexDirection: "column",
      gap: 14
    }
  }, React.createElement(Field, {
    label: "البريد الإلكتروني"
  }, React.createElement("input", {
    autoFocus: true,
    type: "email",
    style: {
      ...inp(),
      direction: "ltr",
      textAlign: "left"
    },
    value: username,
    onChange: e => {
      setUsername(e.target.value);
      setError("");
    },
    placeholder: "admin@sakr.clinic"
  })), React.createElement(Field, {
    label: "كلمة المرور"
  }, React.createElement("div", {
    style: {
      position: "relative"
    }
  }, React.createElement("input", {
    style: {
      ...inp(),
      paddingLeft: 38
    },
    type: showPass ? "text" : "password",
    value: password,
    onChange: e => {
      setPassword(e.target.value);
      setError("");
    },
    placeholder: "••••••••"
  }), React.createElement("span", {
    onClick: () => setShowPass(s => !s),
    style: {
      position: "absolute",
      left: 12,
      top: "50%",
      transform: "translateY(-50%)",
      cursor: "pointer",
      color: C.muted,
      fontSize: 14
    }
  }, showPass ? "🙈" : "👁"))), React.createElement("div", {
    onClick: () => setRemember(r => !r),
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      cursor: "pointer"
    }
  }, React.createElement("div", {
    style: {
      width: 18,
      height: 18,
      borderRadius: 5,
      background: remember ? C.accent : C.bg,
      border: `2px solid ${remember ? C.accent : C.border}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 11,
      color: C.bg,
      fontWeight: 700
    }
  }, remember ? "✓" : ""), React.createElement("span", {
    style: {
      color: C.muted,
      fontSize: 12
    }
  }, "تذكرني على هذا الجهاز")), error && React.createElement("div", {
    style: {
      background: C.danger + "22",
      border: `1px solid ${C.danger}44`,
      borderRadius: 10,
      padding: "9px 12px",
      color: C.danger,
      fontSize: 12,
      textAlign: "center"
    }
  }, error), React.createElement("button", {
    type: "submit",
    onClick: submit,
    style: {
      background: `linear-gradient(135deg,${C.accent},${C.teal})`,
      border: "none",
      borderRadius: 10,
      padding: "12px 18px",
      color: C.bg,
      fontWeight: 700,
      fontSize: 14,
      cursor: "pointer",
      marginTop: 6,
      opacity: loading ? 0.7 : 1
    }
  }, loading ? "جاري الدخول..." : "تسجيل الدخول")));
}
const getDailyReportHTML = safeTemplate(_getDailyReportHTMLRaw);
function _getDailyReportHTMLRaw(date, patients, visits, appointments, primary, clinic) {
  const docName = primary && primary.name || "د. عبدالستار صقر";
  const cl = clinic || {};
  const address = cl.address || "";
  const phone = cl.phone || "";
  const dayVisits = visits.filter(v => v.date === date);
  const dayApts = appointments;
  const totalRev = dayVisits.reduce((s, v) => s + (v.paid ? Number(v.cost || 0) : 0), 0);
  const unpaid = dayVisits.filter(v => !v.paid).length;
  const dateAr = new Date(date).toLocaleDateString("ar-EG", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  return `<!DOCTYPE html><html dir="rtl" lang="ar">
<head><meta charset="UTF-8"><title>تقرير يومي</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;color:#111;direction:rtl;font-size:12px;}
  .page{width:210mm;margin:0 auto;padding:12mm;}
  .header{border-bottom:3px solid #00C2FF;padding-bottom:10px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;}
  .clinic{font-size:18px;font-weight:800;color:#00C2FF;}
  .date{font-size:12px;color:#555;margin-top:3px;}
  .stats{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;margin-bottom:16px;}
  .stat{background:#f0f9ff;border:1px solid #cce;border-radius:8px;padding:10px;text-align:center;}
  .stat-val{font-size:22px;font-weight:800;color:#00C2FF;}
  .stat-lbl{font-size:10px;color:#555;margin-top:2px;}
  table{width:100%;border-collapse:collapse;margin-bottom:14px;}
  th{background:#00C2FF;color:#fff;padding:7px 10px;font-size:11px;text-align:right;}
  td{border:1px solid #ddd;padding:7px 10px;font-size:11px;}
  tr:nth-child(even) td{background:#f8f8f8;}
  .paid{color:#00aa66;font-weight:700;}
  .unpaid{color:#cc3300;font-weight:700;}
  .footer{margin-top:14px;border-top:2px solid #00C2FF;padding-top:10px;font-size:10px;color:#555;display:flex;justify-content:space-between;}
  h3{font-size:13px;color:#00C2FF;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #e0f4ff;}
  @media print{.page{padding:8mm;position:relative;overflow:hidden;}}
</style></head>
<body>
<div class="page"><div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:80px;font-weight:900;color:#00C2FF;opacity:0.05;pointer-events:none;z-index:0;letter-spacing:8px;font-family:Georgia,serif;white-space:nowrap;">I App</div>
  <div class="header">
    <div><div class="clinic">👁 عيادة ${docName}</div><div class="date">${dateAr}</div></div>
    <div style="text-align:left;font-size:11px;color:#555;">تقرير يومي</div>
  </div>
  <div class="stats">
    <div class="stat"><div class="stat-val">${dayVisits.length}</div><div class="stat-lbl">إجمالي الزيارات</div></div>
    <div class="stat"><div class="stat-val" style="color:#00aa66;">${totalRev.toLocaleString()}</div><div class="stat-lbl">الإيرادات (ج.م)</div></div>
    <div class="stat"><div class="stat-val" style="color:#cc3300;">${unpaid}</div><div class="stat-lbl">غير مدفوع</div></div>
    <div class="stat"><div class="stat-val">${dayApts.length}</div><div class="stat-lbl">المواعيد</div></div>
  </div>
  ${dayVisits.length > 0 ? `<h3>سجل الزيارات</h3>
  <table><tr><th>#</th><th>المريض</th><th>النوع</th><th>الطبيب</th><th>التكلفة</th><th>الدفع</th></tr>
  ${dayVisits.map((v, i) => {
    const p = patients.find(p => p.id === v.patientId);
    return `<tr><td>${i + 1}</td><td>${p && p.name || "-"}</td><td>${v.type}</td><td>${v.doctor}</td><td>${Number(v.cost || 0).toLocaleString()} ج.م</td><td class="${v.paid ? "paid" : "unpaid"}">${v.paid ? "✓ مدفوع" : "✗ لم يُدفع"}</td></tr>`;
  }).join("")}</table>` : "<p style='color:#aaa;font-size:11px;margin-bottom:14px;'>لا توجد زيارات مسجلة لهذا اليوم</p>"}
  <div class="footer">
    <div>${address ? `📍 ${address}` : ""}<br>${phone ? `📞 ${phone}` : ""}</div>
    <div>I App · إجمالي الإيرادات: ${totalRev.toLocaleString()} ج.م</div>
  </div>
</div></body></html>`;
}
const getPatientFileHTML = safeTemplate(_getPatientFileHTMLRaw);
function _getPatientFileHTMLRaw(patient, visits, exams, prescriptions, primary, clinic) {
  const p = patient || {};
  const docName = primary && primary.name || "د. عبدالستار صقر";
  const cl = clinic || {};
  const address = cl.address || "";
  const phone = cl.phone || "";
  const pVisits = visits.filter(v => v.patientId === p.id).sort((a, b) => b.date.localeCompare(a.date));
  const totalPaid = pVisits.reduce((s, v) => s + (v.paid ? Number(v.cost || 0) : 0), 0);
  const lastExam = exams.filter(e => e.patientId === p.id).sort((a, b) => b.date.localeCompare(a.date))[0];
  const date = new Date().toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  return `<!DOCTYPE html><html dir="rtl" lang="ar">
<head><meta charset="UTF-8"><title>ملف المريض</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;color:#111;direction:rtl;font-size:12px;}
  .page{width:210mm;margin:0 auto;padding:12mm;}
  .header{border-bottom:3px solid #00C2FF;padding-bottom:10px;margin-bottom:14px;display:flex;justify-content:space-between;}
  .clinic{font-size:16px;font-weight:800;color:#00C2FF;}
  .patient-card{background:#f0f9ff;border:2px solid #00C2FF;border-radius:10px;padding:14px;margin-bottom:14px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;}
  .info{font-size:10px;color:#888;text-align:center;border:1px solid #d0eaff;border-radius:6px;padding:8px 4px;background:#fff;}
  .info span{display:block;margin-bottom:4px;}
  .info b{display:block;color:#111;font-size:13px;font-weight:700;}
  h3{font-size:13px;color:#00C2FF;margin-bottom:8px;margin-top:14px;padding-bottom:4px;border-bottom:1px solid #e0f4ff;}
  table{width:100%;border-collapse:collapse;margin-bottom:10px;}
  th{background:#00C2FF;color:#fff;padding:6px 8px;font-size:10px;text-align:right;}
  td{border:1px solid #ddd;padding:6px 8px;font-size:10px;}
  tr:nth-child(even) td{background:#f8f8f8;}
  .badge{display:inline-block;padding:2px 8px;border-radius:6px;font-size:10px;font-weight:700;}
  .footer{margin-top:14px;border-top:1px solid #ddd;padding-top:8px;font-size:9px;color:#888;display:flex;justify-content:space-between;}
  @media print{.page{padding:8mm;position:relative;overflow:hidden;}}
</style></head>
<body>
<div class="page"><div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:80px;font-weight:900;color:#00C2FF;opacity:0.05;pointer-events:none;z-index:0;letter-spacing:8px;font-family:Georgia,serif;white-space:nowrap;">I App</div>
  <div class="header">
    <div><div class="clinic">👁 عيادة ${docName}</div><div style="font-size:10px;color:#555;margin-top:2px;">ملف المريض · ${date}</div></div>
    <div style="font-size:11px;color:#00C2FF;font-weight:700;">${p.patientCode || ""}</div>
  </div>
  <div class="patient-card">
    <div class="info"><span>الاسم</span><b>${p.name}</b></div>
    <div class="info"><span>العمر</span><b>${p.age} سنة</b></div>
    <div class="info"><span>الجنس</span><b>${p.gender}</b></div>
    <div class="info"><span>الهاتف</span><b>${p.phone || "—"}</b></div>
    <div class="info"><span>فصيلة الدم</span><b>${p.bloodType || "—"}</b></div>
    <div class="info"><span>التشخيص</span><b>${p.condition || "—"}</b></div>
    <div class="info"><span>التاريخ المرضي</span><b>${p.history || "—"}</b></div>
    <div class="info"><span>الحساسية</span><b>${p.allergies || "—"}</b></div>
    <div class="info"><span>إجمالي المدفوع</span><b>${totalPaid.toLocaleString()} ج.م</b></div>
  </div>
  ${lastExam ? `<h3>آخر فحص سريري (${lastExam.date})</h3>
  <table><tr><th>حدة الإبصار</th><th>ضغط العين</th><th>التشخيص</th></tr>
  <tr><td>يمنى: ${lastExam.visualAcuityR || "—"} · يسرى: ${lastExam.visualAcuityL || "—"}</td><td>يمنى: ${lastExam.iopR || "—"} · يسرى: ${lastExam.iopL || "—"}</td><td>${lastExam.diagnosis || "—"}</td></tr></table>` : ""}
  ${pVisits.length > 0 ? `<h3>سجل الزيارات (${pVisits.length})</h3>
  <table><tr><th>التاريخ</th><th>النوع</th><th>الطبيب</th><th>النتيجة</th><th>التكلفة</th><th>الدفع</th></tr>
  ${pVisits.map(v => `<tr><td>${v.date}</td><td>${v.type}</td><td>${v.doctor}</td><td>${v.result || "—"}</td><td>${Number(v.cost || 0).toLocaleString()} ج.م</td><td>${v.paid ? "✓" : "✗"}</td></tr>`).join("")}</table>` : ""}
  <div class="footer">
    <div>${address ? `📍 ${address}` : ""} ${phone ? `· 📞 ${phone}` : ""}</div>
    <div>I App · تقرير بتاريخ ${date}</div>
  </div>
</div></body></html>`;
}
const WA_COUNTRY = "20";
function waNumber(phone) {
  let d = normPhone(phone);
  if (!d) return "";
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  if (!d.startsWith(WA_COUNTRY)) d = WA_COUNTRY + d;
  return d;
}
function waOpen(phone, text) {
  const n = waNumber(phone);
  if (!n) {
    alert("لا يوجد رقم هاتف صحيح لهذا المريض");
    return false;
  }
  window.open("https://wa.me/" + n + "?text=" + encodeURIComponent(text), "_blank");
  return true;
}
const firstName = n => String(n || "").trim().split(/\s+/)[0] || "";
const CLINIC_BRAND = "عيادة د. عبدالستار صقر";
function waReminderText(a) {
  return "أهلاً " + firstName(a.patient) + " 🌿\n" + "تذكير بموعدك في " + CLINIC_BRAND + "\n" + "📅 " + (a.date || "") + "   ⏰ " + (a.time || "") + "\n" + "📍 " + clinicLabel(a.clinic) + "\n\n" + "برجاء الرد بالتأكيد، أو التواصل معنا لتعديل الموعد.";
}
function waFollowUpText(name, when, reason) {
  return "أهلاً " + firstName(name) + " 🌿\n" + (reason || "موعد المتابعة الخاص بك") + " كان محدداً بتاريخ " + (when || "") + "\n" + "برجاء التواصل معنا لتحديد موعد جديد في " + CLINIC_BRAND + ".";
}
const RX_TPL_KEY = "iapp_rx_templates";
function loadRxTemplates() {
  try {
    const l = localStorage.getItem(RX_TPL_KEY);
    if (l) return JSON.parse(l) || [];
  } catch {}
  return [];
}
async function refreshRxTemplates() {
  const r = await sbGet(RX_TPL_KEY);
  if (Array.isArray(r)) {
    try {
      localStorage.setItem(RX_TPL_KEY, JSON.stringify(r));
    } catch {}
    return r;
  }
  return loadRxTemplates();
}
async function addRxTemplate(t) {
  const rec = {
    id: newId(),
    name: t.name,
    medicines: t.medicines || "",
    notes: t.notes || "",
    by: actorName()
  };
  const res = await sbMutate(RX_TPL_KEY, list => [...list.filter(x => x.name !== rec.name), rec]);
  if (res.ok) {
    try {
      localStorage.setItem(RX_TPL_KEY, JSON.stringify(res.data));
    } catch {}
    logAudit("حفظ قالب روشتة", rec.name);
  }
  return res.ok ? res.data : null;
}
async function deleteRxTemplate(id) {
  const res = await sbMutate(RX_TPL_KEY, list => list.filter(x => x.id !== id));
  if (res.ok) {
    try {
      localStorage.setItem(RX_TPL_KEY, JSON.stringify(res.data));
    } catch {}
  }
  return res.ok ? res.data : null;
}
const INJ_KEY = "iapp_injections";
const INJ_DRUGS = ["Avastin", "Lucentis", "Eylea", "Ozurdex", "Triamcinolone", "Vabysmo"];
async function saveInjection(rec) {
  const res = await sbMutate(INJ_KEY, list => list.some(x => x.id === rec.id) ? list.map(x => x.id === rec.id ? rec : x) : [...list, rec], list => list.some(x => x.id === rec.id));
  if (res.ok) logAudit("تسجيل حقنة", (rec.patient || "") + " · " + (rec.drug || "") + " · " + (rec.eye || ""));
  return res.ok ? res.data : null;
}
async function deleteInjection(id, rec) {
  await trashPut(INJ_KEY, rec, "حقنة: " + (rec && rec.patient || ""));
  const res = await sbMutate(INJ_KEY, list => list.filter(x => x.id !== id));
  if (res.ok) logAudit("حذف حقنة", rec && rec.patient || id);
  return res.ok ? res.data : null;
}
function dueInjections(list, days) {
  const limit = new Date();
  limit.setDate(limit.getDate() + (days == null ? 7 : days));
  const latest = {};
  (list || []).forEach(x => {
    const k = String(x.patientId || x.patient) + "|" + (x.eye || "");
    if (!latest[k] || String(x.date || "") > String(latest[k].date || "")) latest[k] = x;
  });
  return Object.values(latest).filter(x => x.nextDate && new Date(x.nextDate) <= limit).sort((a, b) => String(a.nextDate).localeCompare(String(b.nextDate)));
}
function overdueFollowUps(visits, patients) {
  const today = localISO();
  const lastVisit = {};
  (visits || []).forEach(v => {
    const k = String(v.patientId);
    if (!lastVisit[k] || String(v.date || "") > String(lastVisit[k])) lastVisit[k] = String(v.date || "");
  });
  const seen = {};
  return (visits || []).filter(v => {
    if (!v.nextVisit || String(v.nextVisit) >= today) return false;
    const k = String(v.patientId);
    if (String(lastVisit[k] || "") > String(v.nextVisit)) return false;
    if (seen[k]) return false;
    seen[k] = true;
    return true;
  }).map(v => {
    const p = (patients || []).find(p => p.id === v.patientId) || {};
    const late = Math.floor((new Date(today) - new Date(v.nextVisit)) / 86400000);
    return {
      ...v,
      patientName: p.name || v.patient || "—",
      patientPhone: p.phone || "",
      late
    };
  }).sort((a, b) => b.late - a.late);
}
function FollowUpCentre({
  visits,
  patients,
  onClose,
  onPatientClick
}) {
  const [injections, setInjections] = useState([]);
  const [tab, setTab] = useState("late");
  useEffect(() => {
    (async () => {
      const r = await sbGet(INJ_KEY);
      if (Array.isArray(r)) setInjections(r);
    })();
  }, []);
  const late = overdueFollowUps(visits, patients);
  const due = dueInjections(injections, 7);
  const rows = tab === "late" ? late : due;
  const tabBtn = (id, label, n) => React.createElement("div", {
    onClick: () => setTab(id),
    style: {
      flex: 1,
      textAlign: "center",
      padding: "8px 6px",
      borderRadius: 10,
      cursor: "pointer",
      fontSize: 12,
      fontWeight: 700,
      background: tab === id ? C.accent + "22" : C.bg,
      color: tab === id ? C.accent : C.muted,
      border: "1px solid " + (tab === id ? C.accent + "66" : C.border)
    }
  }, label, " (", n, ")");
  return React.createElement("div", {
    style: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.85)",
      zIndex: 500,
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "center",
      paddingTop: 50
    },
    onClick: onClose
  }, React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      background: C.surface,
      borderRadius: 20,
      padding: 18,
      width: "92%",
      maxWidth: 440,
      maxHeight: "84vh",
      overflowY: "auto",
      border: `2px solid ${C.gold}`
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12
    }
  }, React.createElement("div", {
    style: {
      color: C.gold,
      fontWeight: 800,
      fontSize: 15
    }
  }, "🔔 المتابعات"), React.createElement("span", {
    onClick: onClose,
    style: {
      color: C.muted,
      fontSize: 24,
      cursor: "pointer"
    }
  }, "×")), React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginBottom: 12
    }
  }, tabBtn("late", "متأخرة", late.length), tabBtn("inj", "حقن مستحقة", due.length)), rows.length === 0 && React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 13,
      textAlign: "center",
      padding: "26px 0"
    }
  }, "لا يوجد شيء هنا 👌"), tab === "late" && late.map(v => React.createElement("div", {
    key: v.id,
    style: {
      background: C.card,
      border: `1px solid ${v.late > 60 ? C.danger : C.gold}55`,
      borderRadius: 12,
      padding: "11px 13px",
      marginBottom: 8
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      gap: 8
    }
  }, React.createElement("span", {
    onClick: () => {
      if (onPatientClick) {
        onPatientClick(v.patientId);
        onClose();
      }
    },
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 13,
      cursor: "pointer",
      textDecoration: "underline"
    }
  }, v.patientName), React.createElement("span", {
    style: {
      color: v.late > 60 ? C.danger : C.gold,
      fontSize: 11,
      fontWeight: 700
    }
  }, "متأخر ", v.late, " يوم")), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11,
      marginTop: 3
    }
  }, "📅 كان مفروض: ", v.nextVisit, " · آخر زيارة ", v.date), React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginTop: 8
    }
  }, React.createElement("button", {
    onClick: () => waOpen(v.patientPhone, waFollowUpText(v.patientName, v.nextVisit, "موعد المتابعة")),
    style: {
      flex: 1,
      background: "#25D36622",
      border: "1px solid #25D36655",
      borderRadius: 9,
      padding: "7px 10px",
      color: "#25D366",
      fontSize: 11,
      fontWeight: 800,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, "💬 تذكير واتساب"), v.patientPhone && React.createElement("a", {
    href: "tel:" + v.patientPhone,
    style: {
      background: C.accent + "22",
      border: "1px solid " + C.accent + "44",
      borderRadius: 9,
      padding: "7px 12px",
      color: C.accent,
      fontSize: 11,
      fontWeight: 700,
      textDecoration: "none"
    }
  }, "📞 اتصال")))), tab === "inj" && due.map(x => {
    const p = (patients || []).find(p => p.id === x.patientId) || {};
    const days = Math.round((new Date(x.nextDate) - new Date(localISO())) / 86400000);
    return React.createElement("div", {
      key: x.id,
      style: {
        background: C.card,
        border: `1px solid ${days < 0 ? C.danger : C.teal}55`,
        borderRadius: 12,
        padding: "11px 13px",
        marginBottom: 8
      }
    }, React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        gap: 8
      }
    }, React.createElement("span", {
      style: {
        color: C.text,
        fontWeight: 700,
        fontSize: 13
      }
    }, x.patient || p.name || "—"), React.createElement("span", {
      style: {
        color: days < 0 ? C.danger : C.teal,
        fontSize: 11,
        fontWeight: 700
      }
    }, days < 0 ? "متأخرة " + -days + " يوم" : days === 0 ? "اليوم" : "بعد " + days + " يوم")), React.createElement("div", {
      style: {
        color: C.muted,
        fontSize: 11,
        marginTop: 3
      }
    }, "💉 ", x.drug, " · ", x.eye, " · الجرعة رقم ", x.doseNo || "—", " · آخر حقنة ", x.date), React.createElement("div", {
      style: {
        display: "flex",
        gap: 8,
        marginTop: 8
      }
    }, React.createElement("button", {
      onClick: () => waOpen(x.phone || p.phone, waFollowUpText(x.patient || p.name, x.nextDate, "موعد الحقنة داخل العين")),
      style: {
        flex: 1,
        background: "#25D36622",
        border: "1px solid #25D36655",
        borderRadius: 9,
        padding: "7px 10px",
        color: "#25D366",
        fontSize: 11,
        fontWeight: 800,
        cursor: "pointer",
        fontFamily: "inherit"
      }
    }, "💬 تذكير واتساب")));
  })));
}
function InjectionsSection({
  patient
}) {
  const [list, setList] = useState([]);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const r = await sbGet(INJ_KEY);
    if (Array.isArray(r)) setList(r.filter(x => x.patientId === patient.id));
  };
  useEffect(() => {
    load();
  }, [patient.id]);
  const blank = () => {
    const mine = list.filter(x => x.eye === "العين اليمنى");
    return {
      id: newId(),
      patientId: patient.id,
      patient: patient.name,
      phone: patient.phone || "",
      date: localISO(),
      eye: "العين اليمنى",
      drug: INJ_DRUGS[0],
      doseNo: mine.length + 1,
      nextDate: "",
      notes: ""
    };
  };
  const save = async () => {
    if (!form.drug || !form.date) {
      alert("اكتب الدواء والتاريخ");
      return;
    }
    setBusy(true);
    const next = await saveInjection(form);
    setBusy(false);
    if (next) {
      setList(next.filter(x => x.patientId === patient.id));
      setForm(null);
    } else alert("❌ تعذر الحفظ — تحقق من الاتصال");
  };
  const del = async x => {
    if (!window.confirm("نقل هذه الحقنة إلى سلة المحذوفات؟")) return;
    const next = await deleteInjection(x.id, x);
    if (next) setList(next.filter(y => y.patientId === patient.id));
  };
  const sorted = [...list].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return React.createElement("div", {
    style: {
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 14,
      padding: 14,
      marginBottom: 14
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 13
    }
  }, "💉 الحقن داخل العين (", list.length, ")"), React.createElement("span", {
    onClick: () => setForm(form ? null : blank()),
    style: {
      color: C.teal,
      fontSize: 11,
      cursor: "pointer",
      background: C.teal + "22",
      borderRadius: 8,
      padding: "4px 10px"
    }
  }, form ? "إلغاء" : "+ حقنة")), form && React.createElement("div", {
    style: {
      background: C.bg,
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      padding: 12,
      marginBottom: 10,
      display: "flex",
      flexDirection: "column",
      gap: 10
    }
  }, React.createElement(Field, {
    label: "التاريخ"
  }, React.createElement("input", {
    type: "date",
    style: inp(),
    value: form.date,
    onChange: e => setForm(f => ({
      ...f,
      date: e.target.value
    }))
  })), React.createElement(Field, {
    label: "العين"
  }, React.createElement("select", {
    style: inp(),
    value: form.eye,
    onChange: e => setForm(f => ({
      ...f,
      eye: e.target.value
    }))
  }, ["العين اليمنى", "العين اليسرى", "كلتا العينين"].map(x => React.createElement("option", {
    key: x
  }, x)))), React.createElement(Field, {
    label: "الدواء"
  }, React.createElement("select", {
    style: inp(),
    value: form.drug,
    onChange: e => setForm(f => ({
      ...f,
      drug: e.target.value
    }))
  }, INJ_DRUGS.map(x => React.createElement("option", {
    key: x
  }, x)))), React.createElement("div", {
    style: {
      display: "flex",
      gap: 10
    }
  }, React.createElement("div", {
    style: {
      flex: 1
    }
  }, React.createElement(Field, {
    label: "رقم الجرعة"
  }, React.createElement("input", {
    type: "number",
    min: "1",
    style: inp(),
    value: form.doseNo,
    onChange: e => setForm(f => ({
      ...f,
      doseNo: e.target.value
    }))
  }))), React.createElement("div", {
    style: {
      flex: 1
    }
  }, React.createElement(Field, {
    label: "الحقنة القادمة"
  }, React.createElement("input", {
    type: "date",
    style: inp(),
    value: form.nextDate,
    onChange: e => setForm(f => ({
      ...f,
      nextDate: e.target.value
    }))
  })))), React.createElement(Field, {
    label: "ملاحظات"
  }, React.createElement("input", {
    style: inp(),
    value: form.notes,
    onChange: e => setForm(f => ({
      ...f,
      notes: e.target.value
    })),
    placeholder: "اختياري"
  })), React.createElement(Btn, {
    full: true,
    color: C.teal,
    onClick: save
  }, busy ? "⏳ جاري الحفظ..." : "✓ حفظ الحقنة")), sorted.length === 0 && !form && React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 12,
      textAlign: "center",
      padding: "10px 0"
    }
  }, "لا توجد حقن مسجلة"), sorted.map(x => React.createElement("div", {
    key: x.id,
    style: {
      background: C.bg,
      border: `1px solid ${C.border}`,
      borderRadius: 10,
      padding: "9px 11px",
      marginBottom: 7
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      gap: 8
    }
  }, React.createElement("span", {
    style: {
      color: C.text,
      fontSize: 12,
      fontWeight: 700
    }
  }, x.drug, " · ", x.eye), React.createElement("span", {
    style: {
      color: C.muted,
      fontSize: 11
    }
  }, x.date)), React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      gap: 8,
      marginTop: 4
    }
  }, React.createElement("span", {
    style: {
      color: C.muted,
      fontSize: 11
    }
  }, "الجرعة رقم ", x.doseNo || "—", x.nextDate ? " · القادمة " + x.nextDate : ""), React.createElement("span", {
    onClick: () => del(x),
    style: {
      color: C.danger,
      fontSize: 11,
      cursor: "pointer"
    }
  }, "حذف")), x.notes && React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 11,
      marginTop: 4
    }
  }, "📝 ", x.notes))));
}
function RemindersModal({
  apts,
  onClose,
  onMark
}) {
  const tomorrow = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return localISO(d);
  })();
  const rows = (apts || []).filter(a => a.date === tomorrow && isActiveApt(a)).sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));
  return React.createElement("div", {
    style: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.85)",
      zIndex: 500,
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "center",
      paddingTop: 50
    },
    onClick: onClose
  }, React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      background: C.surface,
      borderRadius: 20,
      padding: 18,
      width: "92%",
      maxWidth: 440,
      maxHeight: "84vh",
      overflowY: "auto",
      border: `2px solid ${C.teal}`
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12
    }
  }, React.createElement("div", {
    style: {
      color: C.teal,
      fontWeight: 800,
      fontSize: 15
    }
  }, "📲 تذكير مواعيد الغد (", rows.length, ")"), React.createElement("span", {
    onClick: onClose,
    style: {
      color: C.muted,
      fontSize: 24,
      cursor: "pointer"
    }
  }, "×")), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11,
      marginBottom: 12
    }
  }, tomorrow, " — اضغط على كل مريض لفتح واتساب برسالة جاهزة"), rows.length === 0 && React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 13,
      textAlign: "center",
      padding: "26px 0"
    }
  }, "لا توجد مواعيد غداً"), rows.map(a => React.createElement("div", {
    key: a.id,
    style: {
      background: C.card,
      border: `1px solid ${a.reminded ? C.success + "55" : C.border}`,
      borderRadius: 12,
      padding: "10px 12px",
      marginBottom: 8
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      gap: 8
    }
  }, React.createElement("span", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 13
    }
  }, a.patient), React.createElement("span", {
    style: {
      color: C.gold,
      fontSize: 12
    }
  }, a.time)), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11,
      marginTop: 3
    }
  }, "📍 ", clinicLabel(a.clinic), " · ", a.type || "فحص"), React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginTop: 8
    }
  }, React.createElement("button", {
    onClick: () => {
      if (waOpen(a.phone, waReminderText(a)) && onMark) onMark(a);
    },
    style: {
      flex: 1,
      background: "#25D36622",
      border: "1px solid #25D36655",
      borderRadius: 9,
      padding: "7px 10px",
      color: "#25D366",
      fontSize: 11,
      fontWeight: 800,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, a.reminded ? "✓ تم الإرسال — إعادة" : "💬 إرسال التذكير"), a.phone && React.createElement("a", {
    href: "tel:" + a.phone,
    style: {
      background: C.accent + "22",
      border: "1px solid " + C.accent + "44",
      borderRadius: 9,
      padding: "7px 12px",
      color: C.accent,
      fontSize: 11,
      fontWeight: 700,
      textDecoration: "none"
    }
  }, "📞"))))));
}
function FollowUpAlerts({
  visits,
  patients,
  onClose
}) {
  const today = localISO();
  const todayDate = new Date(today);
  const alerts = visits.filter(v => {
    if (!v.nextVisit) return false;
    const diff = Math.ceil((new Date(v.nextVisit) - todayDate) / (1000 * 60 * 60 * 24));
    return diff <= 3 && diff >= 0;
  }).map(v => {
    const p = patients.find(p => p.id === v.patientId);
    const diff = Math.ceil((new Date(v.nextVisit) - todayDate) / (1000 * 60 * 60 * 24));
    return {
      ...v,
      patientName: p && p.name || "—",
      patientPhone: p && p.phone || "",
      diff
    };
  }).sort((a, b) => a.diff - b.diff);
  if (alerts.length === 0) return null;
  return React.createElement("div", {
    style: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.85)",
      zIndex: 500,
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "center",
      paddingTop: 60
    },
    onClick: onClose
  }, React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      background: C.surface,
      borderRadius: 20,
      padding: 20,
      width: "90%",
      maxWidth: 420,
      maxHeight: "80vh",
      overflowY: "auto",
      border: `2px solid ${C.gold}`
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 16
    }
  }, React.createElement("div", {
    style: {
      color: C.gold,
      fontWeight: 800,
      fontSize: 15
    }
  }, "🔔 تنبيهات المتابعة (", alerts.length, ")"), React.createElement("span", {
    onClick: onClose,
    style: {
      color: C.muted,
      fontSize: 24,
      cursor: "pointer"
    }
  }, "×")), alerts.map((a, i) => React.createElement("div", {
    key: i,
    style: {
      background: a.diff === 0 ? C.danger + "22" : a.diff === 1 ? C.gold + "22" : C.card,
      border: `1px solid ${a.diff === 0 ? C.danger : a.diff === 1 ? C.gold : C.border}`,
      borderRadius: 12,
      padding: 12,
      marginBottom: 10
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 6
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 13
    }
  }, a.patientName), React.createElement("span", {
    style: {
      background: a.diff === 0 ? C.danger : a.diff === 1 ? C.gold : C.teal,
      color: C.bg,
      borderRadius: 8,
      padding: "2px 10px",
      fontSize: 10,
      fontWeight: 800
    }
  }, a.diff === 0 ? "اليوم" : a.diff === 1 ? "غداً" : `بعد ${a.diff} أيام`)), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11
    }
  }, "📅 ", a.nextVisit, " · ", a.type), a.patientPhone && React.createElement("div", {
    style: {
      color: C.accent,
      fontSize: 11,
      marginTop: 4
    }
  }, "📞 ", a.patientPhone))), React.createElement("div", {
    onClick: onClose,
    style: {
      background: `linear-gradient(135deg,${C.accent},${C.teal})`,
      borderRadius: 10,
      padding: "10px",
      color: C.bg,
      fontWeight: 700,
      fontSize: 13,
      textAlign: "center",
      cursor: "pointer",
      marginTop: 8
    }
  }, "حسناً")));
}
function GlobalSearch({
  patients,
  prescriptions,
  appointments,
  onNavigate,
  onClose
}) {
  const [q, setQ] = useState("");
  const trimmed = q.trim();
  const pRes = trimmed ? patients.filter(p => (p.name || "").includes(trimmed) || (p.patientCode || "").includes(trimmed) || (p.phone || "").includes(trimmed)).slice(0, 5) : [];
  const rRes = trimmed ? prescriptions.filter(r => (r.patient || "").includes(trimmed)).slice(0, 3) : [];
  const aRes = trimmed ? appointments.filter(a => (a.patient || "").includes(trimmed)).slice(0, 3) : [];
  const hasResults = pRes.length > 0 || rRes.length > 0 || aRes.length > 0;
  return React.createElement("div", {
    style: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.85)",
      zIndex: 500,
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "center",
      paddingTop: 60
    },
    onClick: onClose
  }, React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      background: C.surface,
      borderRadius: 20,
      padding: 20,
      width: "90%",
      maxWidth: 420,
      maxHeight: "85vh",
      overflowY: "auto",
      border: "1px solid " + C.border
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      marginBottom: 14
    }
  }, React.createElement("span", {
    style: {
      color: C.accent,
      fontSize: 18
    }
  }, "🔍"), React.createElement("input", {
    autoFocus: true,
    value: q,
    onChange: e => setQ(e.target.value),
    placeholder: "ابحث في المرضى والوصفات والمواعيد...",
    style: {
      flex: 1,
      background: C.bg,
      border: "1px solid " + C.border,
      borderRadius: 10,
      padding: "10px 12px",
      color: C.text,
      fontSize: 14,
      outline: "none",
      direction: "rtl",
      fontFamily: "inherit"
    }
  }), React.createElement("span", {
    onClick: onClose,
    style: {
      color: C.muted,
      fontSize: 22,
      cursor: "pointer",
      lineHeight: 1
    }
  }, "×")), !trimmed && React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 12,
      textAlign: "center",
      padding: 20
    }
  }, "ابدأ الكتابة للبحث..."), trimmed && !hasResults && React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 12,
      textAlign: "center",
      padding: 20
    }
  }, "لا توجد نتائج لـ \"", trimmed, "\""), pRes.length > 0 && React.createElement(React.Fragment, null, React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10,
      fontWeight: 700,
      marginBottom: 8
    }
  }, "👥 المرضى"), pRes.map(p => React.createElement("div", {
    key: p.id,
    onClick: () => onNavigate("patients", p.id),
    style: {
      background: C.card,
      borderRadius: 10,
      padding: "10px 12px",
      marginBottom: 6,
      cursor: "pointer",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center"
    }
  }, React.createElement("div", null, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 600,
      fontSize: 13
    }
  }, p.name), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10
    }
  }, p.patientCode || "", " · ", p.phone || "")), React.createElement("div", {
    style: {
      color: C.accent,
      fontSize: 14
    }
  }, "←")))), rRes.length > 0 && React.createElement(React.Fragment, null, React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10,
      fontWeight: 700,
      margin: "10px 0 8px"
    }
  }, "🔬 الوصفات"), rRes.map(r => React.createElement("div", {
    key: r.id,
    onClick: () => onNavigate("prescriptions"),
    style: {
      background: C.card,
      borderRadius: 10,
      padding: "10px 12px",
      marginBottom: 6,
      cursor: "pointer"
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 13
    }
  }, r.patient || ""), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10
    }
  }, r.date || "", " · ", r.eye || "")))), aRes.length > 0 && React.createElement(React.Fragment, null, React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10,
      fontWeight: 700,
      margin: "10px 0 8px"
    }
  }, "📋 المواعيد"), aRes.map(a => React.createElement("div", {
    key: a.id,
    onClick: () => onNavigate("appointments"),
    style: {
      background: C.card,
      borderRadius: 10,
      padding: "10px 12px",
      marginBottom: 6,
      cursor: "pointer"
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 13
    }
  }, a.patient || ""), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10
    }
  }, a.time || "", " · ", a.type || ""))))));
}
function TopBar({
  backLabel,
  onBack,
  primary,
  onSearch,
  syncing,
  session,
  onLogout
}) {
  const ini = primary && primary.initial || "ع";
  const st = useSyncStatus();
  const stBusy = st.offline || st.pending > 0 || syncing;
  const stLabel = syncing && !st.offline ? "جاري المزامنة..." : st.label;
  const stColor = syncing && !st.offline ? C.gold : st.color;
  const pendingKeys = st.pending > 0 ? (st.pendingKeys || dirtyKeys()) : [];
  const pendingLabels = pendingKeys.map(syncKeyLabel);
  return React.createElement("div", {
    style: {
      background: `linear-gradient(135deg,${C.surface},${C.surface2})`,
      borderBottom: `1px solid ${C.border}`,
      padding: "0 16px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      height: 64,
      position: "sticky",
      top: 0,
      zIndex: 200
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10
    }
  }, backLabel ? React.createElement("div", {
    onClick: onBack,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 10,
      padding: "6px 12px",
      cursor: "pointer",
      color: C.accent,
      fontSize: 13,
      fontWeight: 700
    }
  }, "← رجوع") : React.createElement("div", {
    style: {
      width: 36,
      height: 36,
      borderRadius: 10,
      background: `linear-gradient(135deg,${C.accent},${C.teal})`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 18,
      boxShadow: `0 0 14px ${C.accent}55`
    }
  }, "👁"), React.createElement("div", null, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 14
    }
  }, backLabel || "I App"), !backLabel && React.createElement("div", {
    onClick: () => {
      if (st.pending > 0) flushAll();
    },
    title: st.pending > 0 ? `المزامنة المعلقة (${st.pending} مفاتيح بيانات): ${pendingLabels.join("، ")}` : st.failedCount > 0 ? `أخطاء المزامنة: ${Object.keys(st.errors).map(syncKeyLabel).join("، ")}` : stLabel,
    style: {
      color: st.offline ? C.danger : C.muted,
      fontSize: 10,
      display: "flex",
      alignItems: "center",
      gap: 4,
      cursor: st.pending > 0 ? "pointer" : "default"
    }
  }, React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: "50%",
      background: stColor,
      display: "inline-block",
      boxShadow: `0 0 6px ${stColor}`
    }
  }), stBusy ? stLabel : session ? `${session.role === "doctor" && primary?.name ? primary.name : session.name} · ${session.role === "admin" ? "مدير" : session.role === "doctor" ? "طبيب" : session.role === "secretary" ? "سكرتارية" : "موظف"}` : "متصل ومحدّث"))), React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      alignItems: "center"
    }
  }, !backLabel && React.createElement(ThemeToggle, null), !backLabel && onSearch && React.createElement("div", {
    onClick: onSearch,
    title: "بحث",
    style: {
      width: 34,
      height: 34,
      borderRadius: 10,
      background: C.card,
      border: `1px solid ${C.border}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      fontSize: 15
    }
  }, "🔍"), !backLabel && session && React.createElement("div", {
    onClick: () => window.dispatchEvent(new CustomEvent("iapp-open-settings")),
    title: "الإعدادات",
    style: {
      width: 34,
      height: 34,
      borderRadius: 10,
      background: C.card,
      border: `1px solid ${C.border}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      fontSize: 16,
      color: C.accent
    }
  }, "⚙️"), !backLabel && onLogout && React.createElement("div", {
    onClick: onLogout,
    title: "تسجيل الخروج",
    style: {
      width: 34,
      height: 34,
      borderRadius: 10,
      background: C.card,
      border: `1px solid ${C.border}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      fontSize: 15,
      color: C.danger
    }
  }, "⏻"), React.createElement("div", {
    style: {
      width: 34,
      height: 34,
      borderRadius: "50%",
      background: `linear-gradient(135deg,${C.accent},${C.teal})`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 13,
      fontWeight: 700,
      color: C.bg
    }
  }, ini)));
}
const XRAY_ICON = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#0a1628"/><!-- Screen --><rect x="28" y="4" width="32" height="24" rx="3" fill="#1a2a40" stroke="#00C2FF" stroke-width="1.2"/><!-- Screen content colormap --><rect x="30" y="6" width="28" height="20" rx="2" fill="#0d1f35"/><ellipse cx="44" cy="13" rx="7" ry="5" fill="#00aaff" opacity="0.5"/><ellipse cx="44" cy="13" rx="4" ry="3" fill="#00ffcc" opacity="0.6"/><ellipse cx="44" cy="13" rx="2" ry="1.5" fill="#ffcc00" opacity="0.8"/><rect x="30" y="19" width="28" height="5" rx="1" fill="#050e1a"/><path d="M30 22 Q36 19 42 21 Q48 23 58 20" fill="none" stroke="#00C2FF" stroke-width="1" opacity="0.8"/><!-- Screen stand --><rect x="42" y="28" width="4" height="5" fill="#1a2a40"/><!-- Machine body --><rect x="4" y="30" width="26" height="28" rx="5" fill="#c8d4e0" stroke="#a0b0c0" stroke-width="1"/><!-- Machine top arch --><rect x="7" y="22" width="20" height="14" rx="4" fill="#b8c8d8" stroke="#90a0b0" stroke-width="1"/><!-- Lens/camera hole --><circle cx="17" cy="27" r="4" fill="#2a3a50"/><circle cx="17" cy="27" r="2.5" fill="#0a1628"/><circle cx="17" cy="27" r="1.2" fill="#00C2FF" opacity="0.8"/><!-- Handle --><rect x="24" y="24" width="5" height="10" rx="2.5" fill="#7a9ab8" stroke="#6080a0" stroke-width="0.8"/><!-- Blue accent strip --><rect x="4" y="38" width="5" height="14" rx="2" fill="#00C2FF" opacity="0.7"/><!-- Base --><rect x="2" y="55" width="30" height="5" rx="3" fill="#a0b0c0" stroke="#809090" stroke-width="0.8"/><!-- Colormap dots on screen --><circle cx="35" cy="10" r="1.5" fill="#ff4444" opacity="0.8"/><circle cx="39" cy="8" r="1.5" fill="#ff8800" opacity="0.8"/><circle cx="50" cy="9" r="1.5" fill="#00cc44" opacity="0.8"/><circle cx="54" cy="11" r="1.5" fill="#0088ff" opacity="0.8"/></svg>')}`;
const NAV = [{
  id: "dashboard",
  label: "الرئيسية",
  icon: "⊞"
}, {
  id: "patients",
  label: "المرضى",
  icon: "👥"
}, {
  id: "waiting",
  label: "الانتظار",
  icon: "⏳"
}, {
  id: "appointments",
  label: "المواعيد",
  icon: "📋"
}, {
  id: "radiology",
  label: "Investigation Orders",
  icon: "xray"
}, {
  id: "imaging",
  label: "مركز الصور",
  icon: "🖼️"
}, {
  id: "accounting",
  label: "المحاسبة",
  icon: "💰",
  adminOnly: true
}];
function BottomNav({
  active,
  setActive,
  role
}) {
  const items = NAV.filter(item => !item.adminOnly || role === "admin");
  return React.createElement("div", {
    style: {
      position: "fixed",
      bottom: 0,
      left: 0,
      right: 0,
      maxWidth: 480,
      margin: "0 auto",
      background: C.surface,
      borderTop: `1px solid ${C.border}`,
      display: "flex",
      justifyContent: "space-around",
      alignItems: "center",
      height: 64,
      zIndex: 200
    }
  }, items.map(item => React.createElement("button", {
    key: item.id,
    onClick: () => setActive(item.id),
    style: {
      background: "none",
      border: "none",
      cursor: "pointer",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 3,
      padding: "4px 10px"
    }
  }, React.createElement("div", {
    style: {
      fontSize: 20,
      filter: active === item.id ? `drop-shadow(0 0 6px ${C.accent})` : "none",
      transform: active === item.id ? "scale(1.2)" : "scale(1)",
      transition: "all 0.2s"
    }
  }, item.icon === "xray" ? React.createElement("img", {
    src: XRAY_ICON,
    style: {
      width: 24,
      height: 24,
      display: "block",
      filter: active === item.id ? `drop-shadow(0 0 6px ${C.accent}) brightness(1.3)` : "brightness(0.75)"
    }
  }) : item.icon), React.createElement("span", {
    style: {
      fontSize: 9,
      fontWeight: 600,
      color: active === item.id ? C.accent : C.muted
    }
  }, item.label))));
}
function Dashboard({
  patients,
  appointments,
  visits,
  primary,
  onDailyReport,
  onPatientClick
}) {
  const sync = useSyncStatus();
  const today = new Date().toLocaleDateString("ar-EG", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  const todayStr = localISO();
  const monthStr = todayStr.slice(0, 7);
  const primaryName = primary && primary.short || "د. عبدالستار";
  const todayRevenue = visits.filter(v => v.date === todayStr).reduce((s, v) => s + (v.paid ? Number(v.cost || 0) : 0), 0);
  const monthRevenue = visits.filter(v => (v.date || "").startsWith(monthStr)).reduce((s, v) => s + (v.paid ? Number(v.cost || 0) : 0), 0);
  const todayVisits = visits.filter(v => v.date === todayStr).length;
  const pendingPayment = visits.filter(v => v.date === todayStr && !v.paid).length;
  const [ratings, setRatings] = React.useState([]);
  const [waitStatus, setWaitStatus] = React.useState({});
  React.useEffect(() => {
    (async () => {
      try {
        const r = await sbGet("iapp_ratings");
        if (r) setRatings(r);
      } catch {}
    })();
  }, []);
  const avgRating = ratings.length ? (ratings.reduce((s, r) => s + (r.rating || 0), 0) / ratings.length).toFixed(1) : null;
  const stats = [{
    label: "إجمالي المرضى",
    value: patients.length,
    icon: "👥",
    color: C.accent
  }, {
    label: "المواعيد اليوم",
    value: appointments.length,
    icon: "📋",
    color: C.teal
  }, {
    label: "إيرادات اليوم",
    value: todayRevenue.toLocaleString(),
    suffix: "ج.م",
    icon: "💰",
    color: C.gold
  }, {
    label: "حالات طارئة",
    value: patients.filter(p => p.status === "طارئ").length,
    icon: "⚠",
    color: C.danger
  }];
  return React.createElement("div", {
    style: {
      padding: "16px 16px 90px"
    }
  }, React.createElement("div", {
    style: {
      marginBottom: 16,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center"
    }
  }, React.createElement("div", null, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 18
    }
  }, "مرحباً، ", primaryName, " 👋"), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 12
    }
  }, today)), React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      alignItems: "center"
    }
  }, React.createElement("div", {
    onClick: onDailyReport,
    style: {
      background: C.gold + "22",
      border: `1px solid ${C.gold}44`,
      borderRadius: 12,
      padding: "6px 10px",
      color: C.gold,
      fontSize: 11,
      fontWeight: 600,
      cursor: "pointer"
    }
  }, "📊 تقرير"), React.createElement("div", {
    style: {
      background: (sync.offline ? C.danger : C.accent) + "22",
      border: `1px solid ${sync.offline ? C.danger : C.accent}44`,
      borderRadius: 12,
      padding: "6px 12px",
      color: sync.offline ? C.danger : C.accent,
      fontSize: 11,
      fontWeight: 600
    }
  }, sync.offline ? "○ بدون إنترنت" : "● مباشر"))), React.createElement("div", {
    style: {
      background: `linear-gradient(135deg,${C.surface2},${C.card})`,
      border: `1px solid ${C.accent}33`,
      borderRadius: 16,
      padding: "14px 16px",
      marginBottom: 16,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between"
    }
  }, React.createElement("div", null, React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11,
      marginBottom: 4
    }
  }, "💹 إيرادات الشهر"), React.createElement("div", {
    style: {
      color: C.success,
      fontWeight: 800,
      fontSize: 22
    }
  }, monthRevenue.toLocaleString(), " ", React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: 400
    }
  }, "ج.م")), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10,
      marginTop: 3
    }
  }, "زيارات اليوم: ", todayVisits, " · غير محصّل: ", pendingPayment)), React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 6,
      alignItems: "flex-end"
    }
  }, avgRating && React.createElement("div", {
    style: {
      background: C.gold + "22",
      border: `1px solid ${C.gold}44`,
      borderRadius: 10,
      padding: "6px 12px",
      textAlign: "center"
    }
  }, React.createElement("div", {
    style: {
      color: C.gold,
      fontWeight: 800,
      fontSize: 16
    }
  }, "⭐ ", avgRating), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 9
    }
  }, ratings.length, " تقييم")), React.createElement("div", {
    style: {
      width: 46,
      height: 46,
      borderRadius: 14,
      background: `linear-gradient(135deg,${C.success}33,${C.teal}22)`,
      border: `1px solid ${C.success}44`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 22
    }
  }, "📈"))), appointments.filter(a => a.waitStatus === "called").length > 0 && React.createElement("div", {
    style: {
      background: `linear-gradient(135deg,${C.gold}22,${C.accent}12)`,
      border: `2px solid ${C.gold}`,
      borderRadius: 14,
      padding: "14px 16px",
      marginBottom: 14,
      display: "flex",
      alignItems: "center",
      gap: 12,
      animation: "pulse 1.2s infinite"
    }
  }, React.createElement("span", {
    style: {
      fontSize: 25
    }
  }, "📣"), React.createElement("div", {
    style: {
      flex: 1
    }
  }, React.createElement("div", {
    style: {
      color: C.gold,
      fontWeight: 900,
      fontSize: 14
    }
  }, "مريض تم استدعاؤه الآن"), React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 800,
      fontSize: 15
    }
  }, appointments.filter(a => a.waitStatus === "called").map(a => a.patient).join("، ")), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10
    }
  }, "تم الاستدعاء من السكرتارية · اضغط بدء الكشف عند دخول المريض"))), appointments.filter(a => a.waitStatus === "waiting").length > 0 && React.createElement("div", {
    style: {
      background: `linear-gradient(135deg,${C.gold}15,${C.accent}10)`,
      border: `1px solid ${C.gold}44`,
      borderRadius: 14,
      padding: "12px 16px",
      marginBottom: 14,
      display: "flex",
      alignItems: "center",
      gap: 12
    }
  }, React.createElement("span", {
    style: {
      fontSize: 20
    }
  }, "⏳"), React.createElement("div", {
    style: {
      flex: 1
    }
  }, React.createElement("div", {
    style: {
      color: C.gold,
      fontWeight: 700,
      fontSize: 13
    }
  }, "في غرفة الانتظار"), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11
    }
  }, appointments.filter(a => a.waitStatus === "waiting").map(a => a.patient).join(" · "))), React.createElement("div", {
    style: {
      background: C.gold,
      color: C.bg,
      borderRadius: "50%",
      width: 28,
      height: 28,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontWeight: 800,
      fontSize: 14
    }
  }, appointments.filter(a => a.waitStatus === "waiting").length)), appointments.filter(a => a.waitStatus === "in").length > 0 && React.createElement("div", {
    style: {
      background: `linear-gradient(135deg,${C.accent}15,${C.teal}10)`,
      border: `1px solid ${C.accent}44`,
      borderRadius: 14,
      padding: "12px 16px",
      marginBottom: 14,
      display: "flex",
      alignItems: "center",
      gap: 12
    }
  }, React.createElement("span", {
    style: {
      fontSize: 20
    }
  }, "🩺"), React.createElement("div", null, React.createElement("div", {
    style: {
      color: C.accent,
      fontWeight: 700,
      fontSize: 13
    }
  }, "في العيادة الآن"), React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 12,
      fontWeight: 600
    }
  }, appointments.filter(a => a.waitStatus === "in").map(a => a.patient).join("، ")))), React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: 10,
      marginBottom: 20
    }
  }, stats.map((s, i) => React.createElement("div", {
    key: i,
    style: {
      background: `linear-gradient(135deg,${C.card},${C.surface2})`,
      border: `1px solid ${C.border}`,
      borderRadius: 16,
      padding: 16,
      flex: "1 1 calc(50% - 6px)",
      minWidth: 130,
      position: "relative",
      overflow: "hidden"
    }
  }, React.createElement("div", {
    style: {
      position: "absolute",
      top: -15,
      right: -15,
      width: 60,
      height: 60,
      borderRadius: "50%",
      background: s.color + "18"
    }
  }), React.createElement("div", {
    style: {
      fontSize: 22,
      marginBottom: 8
    }
  }, s.icon), React.createElement("div", {
    style: {
      color: s.color,
      fontSize: 24,
      fontWeight: 800
    }
  }, s.value, s.suffix && React.createElement("span", {
    style: {
      fontSize: 11,
      marginRight: 3
    }
  }, s.suffix)), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11,
      marginTop: 4
    }
  }, s.label)))), React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 14,
      marginBottom: 10
    }
  }, "آخر المواعيد"), appointments.slice(0, 4).map(a => React.createElement("div", {
    key: a.id,
    style: {
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 14,
      padding: "12px 14px",
      display: "flex",
      alignItems: "center",
      gap: 12,
      marginBottom: 8,
      borderRight: `3px solid ${C.accent}`
    }
  }, React.createElement("div", {
    style: {
      background: C.accent + "22",
      borderRadius: 10,
      padding: "8px 10px",
      textAlign: "center",
      minWidth: 52
    }
  }, React.createElement("div", {
    style: {
      color: C.accent,
      fontSize: 13,
      fontWeight: 800
    }
  }, a.time), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 9
    }
  }, "📍 ", clinicLabel(a.clinic))), React.createElement("div", {
    style: {
      flex: 1
    }
  }, React.createElement("div", {
    onClick: () => {
      const p = patients.find(x => x.name === a.patient || a.patientId && x.id === a.patientId);
      if (onPatientClick) onPatientClick(a.patient, p || null);
    },
    style: {
      color: C.accent,
      fontSize: 13,
      fontWeight: 600,
      cursor: "pointer",
      textDecoration: "underline"
    }
  }, a.patient), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11
    }
  }, a.type, " · ", a.doctor)), a.confirmed && React.createElement("span", {
    style: {
      background: C.success + "22",
      color: C.success,
      borderRadius: 8,
      padding: "2px 8px",
      fontSize: 10,
      fontWeight: 700
    }
  }, "✓"))), appointments.length === 0 && React.createElement("div", {
    style: {
      color: C.muted,
      textAlign: "center",
      padding: 20,
      fontSize: 13
    }
  }, "لا توجد مواعيد"), patients.filter(p => p.status === "طارئ").length > 0 && React.createElement("div", {
    style: {
      background: C.danger + "11",
      border: `1px solid ${C.danger}33`,
      borderRadius: 14,
      padding: 14,
      marginTop: 16
    }
  }, React.createElement("div", {
    style: {
      color: C.danger,
      fontWeight: 700,
      fontSize: 13,
      marginBottom: 8
    }
  }, "⚠ حالات طارئة"), patients.filter(p => p.status === "طارئ").map(p => React.createElement("div", {
    key: p.id,
    style: {
      color: C.text,
      fontSize: 12,
      marginBottom: 4
    }
  }, "• ", p.name || "—", " — ", p.condition || "—"))));
}
function VisitForm({
  initial,
  patientId,
  onSave,
  onClose,
  doctorNames = ["د. عبدالستار", "د. سلمى", "د. ليلى"],
  prices = []
}) {
  const blank = {
    date: localISO(),
    type: "فحص روتيني",
    doctor: "د. عبدالستار",
    clinic: CLINICS[0].v,
    complaint: "",
    result: "",
    cost: "350",
    paid: false,
    nextVisit: "",
    notes: ""
  };
  const [f, setF] = useState(initial ? {
    clinic: CLINICS[0].v,
    ...initial
  } : blank);
  const [customComplaint, setCustomComplaint] = useState("");
  const s = k => e => setF(v => ({
    ...v,
    [k]: e.target.value
  }));
  const TYPES = ["فحص روتيني", "متابعة", "فحص شبكية", "قياس نظر", "استشارة", "عملية", "طوارئ"];
  const COMPLAINTS = ["ضعف النظر", "التهاب العين", "تغيير النظارة", "صعوبة في القراءة", "صداع", "ألم في العين", "عين حمراء", "إفرازات من العين", "رؤية مزدوجة", "وميض أو بقع سوداء", "أخرى..."];
  const handleTypeChange = e => {
    const type = e.target.value;
    const matched = prices.find(p => (p.name || "") === type || type.includes(p.name || "") || (p.name || "").includes(type));
    setF(v => ({
      ...v,
      type,
      cost: matched ? matched.price : v.cost
    }));
  };
  const handleComplaintSelect = e => {
    const val = e.target.value;
    if (val === "أخرى...") {
      setCustomComplaint("");
      setF(v => ({
        ...v,
        complaint: ""
      }));
    } else {
      setF(v => ({
        ...v,
        complaint: val
      }));
      setCustomComplaint("");
    }
  };
  return React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10
    }
  }, React.createElement(Field, {
    label: "تاريخ الزيارة"
  }, React.createElement("input", {
    style: inp(),
    type: "date",
    value: f.date,
    onChange: s("date")
  })), React.createElement(Field, {
    label: "الطبيب"
  }, React.createElement("select", {
    style: inp(),
    value: f.doctor,
    onChange: s("doctor")
  }, doctorNames.map(d => React.createElement("option", {
    key: d
  }, d))))), React.createElement(Field, {
    label: "العيادة"
  }, React.createElement("select", {
    style: inp(),
    value: f.clinic || CLINICS[0].v,
    onChange: s("clinic")
  }, CLINICS.map(c => React.createElement("option", {
    key: c.v,
    value: c.v
  }, c.l)))), React.createElement(Field, {
    label: "نوع الزيارة"
  }, React.createElement("select", {
    style: inp(),
    value: f.type,
    onChange: handleTypeChange
  }, (prices.length > 0 ? prices.map(p => p.name) : TYPES).map(t => React.createElement("option", {
    key: t
  }, t))), prices.length > 0 && prices.find(p => p.name === f.type) && React.createElement("div", {
    style: {
      color: C.gold,
      fontSize: 11,
      marginTop: 4
    }
  }, "💰 السعر المرجعي: ", Number((prices.find(p => p.name === f.type) || {}).price || 0).toLocaleString(), " ج.م")), React.createElement(Field, {
    label: "الشكوى"
  }, React.createElement("select", {
    style: inp(),
    value: COMPLAINTS.includes(f.complaint) ? f.complaint : "أخرى...",
    onChange: handleComplaintSelect
  }, React.createElement("option", {
    value: ""
  }, "— اختر الشكوى —"), COMPLAINTS.map(c => React.createElement("option", {
    key: c
  }, c))), (f.complaint === "أخرى..." || !COMPLAINTS.includes(f.complaint) && f.complaint !== "" || !COMPLAINTS.slice(0, -1).includes(f.complaint)) && React.createElement("input", {
    style: {
      ...inp(),
      marginTop: 6
    },
    value: f.complaint === "أخرى..." ? "" : f.complaint,
    onChange: e => setF(v => ({
      ...v,
      complaint: e.target.value
    })),
    placeholder: "اكتب الشكوى..."
  }), f.complaint && f.complaint !== "— اختر الشكوى —" && COMPLAINTS.slice(0, -1).includes(f.complaint) && React.createElement("div", {
    style: {
      background: C.accent + "22",
      border: `1px solid ${C.accent}33`,
      borderRadius: 8,
      padding: "6px 10px",
      marginTop: 6,
      color: C.accent,
      fontSize: 12
    }
  }, "✓ ", f.complaint)), React.createElement(Field, {
    label: "نتيجة الزيارة / التشخيص"
  }, React.createElement("textarea", {
    style: {
      ...inp(),
      resize: "none"
    },
    rows: 2,
    value: f.result,
    onChange: s("result"),
    placeholder: "نتيجة الكشف..."
  })), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10
    }
  }, React.createElement(Field, {
    label: "التكلفة (ج.م)"
  }, React.createElement("input", {
    style: inp({
      textAlign: "center"
    }),
    type: "number",
    value: f.cost,
    onChange: s("cost"),
    placeholder: "350"
  })), React.createElement(Field, {
    label: "موعد المتابعة"
  }, React.createElement("input", {
    style: inp(),
    type: "date",
    value: f.nextVisit,
    onChange: s("nextVisit")
  }))), React.createElement("div", {
    onClick: () => setF(v => ({
      ...v,
      paid: !v.paid
    })),
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      background: C.card,
      border: `1px solid ${f.paid ? C.success : C.border}`,
      borderRadius: 10,
      padding: "10px 14px",
      cursor: "pointer"
    }
  }, React.createElement("div", {
    style: {
      width: 20,
      height: 20,
      borderRadius: 6,
      background: f.paid ? C.success : C.bg,
      border: `2px solid ${f.paid ? C.success : C.border}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 12,
      color: C.bg,
      fontWeight: 700
    }
  }, f.paid ? "✓" : ""), React.createElement("span", {
    style: {
      color: f.paid ? C.success : C.muted,
      fontSize: 13,
      fontWeight: 600
    }
  }, "تم الدفع")), React.createElement(Field, {
    label: "ملاحظات"
  }, React.createElement("textarea", {
    style: {
      ...inp(),
      resize: "none"
    },
    rows: 2,
    value: f.notes,
    onChange: s("notes"),
    placeholder: "ملاحظات إضافية..."
  })), React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      marginTop: 8
    }
  }, React.createElement(Btn, {
    outline: true,
    full: true,
    onClick: onClose
  }, "إلغاء"), React.createElement(Btn, {
    full: true,
    onClick: () => onSave({
      ...f,
      patientId,
      id: f.id || Date.now(),
      cost: f.cost
    })
  }, "حفظ الزيارة")));
}
function ExamForm({
  initial,
  patientId,
  onSave,
  onClose,
  doctorNames = ["د. عبدالستار", "د. سلمى", "د. ليلى"]
}) {
  const blank = {
    date: localISO(),
    doctor: "د. عبدالستار",
    chiefComplaint: "",
    visualAcuityR: "",
    visualAcuityL: "",
    iopR: "",
    iopL: "",
    colorVision: "طبيعي",
    contrast: "طبيعي",
    coverTest: "طبيعي",
    anteriorSegment: "",
    posteriorSegment: "",
    diagnosis: "",
    treatmentPlan: "",
    followUp: "",
    notes: ""
  };
  const [f, setF] = useState(initial ? {
    ...initial
  } : blank);
  const [step, setStep] = useState(0);
  const s = k => e => setF(v => ({
    ...v,
    [k]: e.target.value
  }));
  const STEPS = ["البيانات", "الفحص السريري", "التشخيص والعلاج"];
  const EXAM_COMPLAINTS = ["ضعف النظر", "التهاب العين", "صداع", "تغيير النظارة", "صعوبة في القراءة", "مياه بيضاء", "شبورة بالعين", "ألم في العين", "عين حمراء", "إفرازات من العين", "رؤية مزدوجة", "وميض أو بقع سوداء", "أخرى..."];
  const VA_OPTIONS = ["1.00", "0.9", "0.8", "0.7", "0.6", "0.5", "0.4", "0.3", "0.2", "0.1", "CF", "HM", "PL", "NPL"];
  const IOP_OPTIONS = Array.from({
    length: 21
  }, (_, i) => String(i + 10));
  return React.createElement("div", null, React.createElement("div", {
    style: {
      display: "flex",
      marginBottom: 18,
      background: C.card,
      borderRadius: 12,
      padding: 4
    }
  }, STEPS.map((st, i) => React.createElement("div", {
    key: i,
    onClick: () => setStep(i),
    style: {
      flex: 1,
      textAlign: "center",
      padding: "8px 2px",
      background: step === i ? `linear-gradient(135deg,${C.accent},${C.teal})` : "transparent",
      borderRadius: 9,
      cursor: "pointer",
      color: step === i ? C.bg : C.muted,
      fontSize: 10,
      fontWeight: 700
    }
  }, st))), step === 0 && React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, React.createElement(Field, {
    label: "تاريخ الفحص"
  }, React.createElement("input", {
    style: inp(),
    type: "date",
    value: f.date,
    onChange: s("date")
  })), React.createElement(Field, {
    label: "الطبيب"
  }, React.createElement("select", {
    style: inp(),
    value: f.doctor,
    onChange: s("doctor")
  }, doctorNames.map(d => React.createElement("option", {
    key: d
  }, d)))), React.createElement(Field, {
    label: "الشكوى الرئيسية"
  }, React.createElement("select", {
    style: inp(),
    value: EXAM_COMPLAINTS.includes(f.chiefComplaint) ? f.chiefComplaint : "أخرى...",
    onChange: e => {
      const v = e.target.value;
      if (v !== "أخرى...") setF(fv => ({
        ...fv,
        chiefComplaint: v
      }));else setF(fv => ({
        ...fv,
        chiefComplaint: ""
      }));
    }
  }, React.createElement("option", {
    value: ""
  }, "— اختر الشكوى —"), EXAM_COMPLAINTS.map(c => React.createElement("option", {
    key: c
  }, c))), (!EXAM_COMPLAINTS.slice(0, -1).includes(f.chiefComplaint) || f.chiefComplaint === "") && React.createElement("input", {
    style: {
      ...inp(),
      marginTop: 6
    },
    value: f.chiefComplaint,
    onChange: s("chiefComplaint"),
    placeholder: "اكتب الشكوى بالتفصيل..."
  }), EXAM_COMPLAINTS.slice(0, -1).includes(f.chiefComplaint) && f.chiefComplaint && React.createElement("div", {
    style: {
      background: C.accent + "22",
      border: `1px solid ${C.accent}33`,
      borderRadius: 8,
      padding: "6px 10px",
      marginTop: 6,
      color: C.accent,
      fontSize: 12
    }
  }, "✓ ", f.chiefComplaint))), step === 1 && React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, React.createElement(SecHead, {
    icon: "👁",
    label: "حدة الإبصار (Visual Acuity)"
  }), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10
    }
  }, React.createElement(Field, {
    label: "اليمنى"
  }, React.createElement("select", {
    style: {
      ...inp(),
      textAlign: "center"
    },
    value: f.visualAcuityR,
    onChange: s("visualAcuityR")
  }, React.createElement("option", {
    value: ""
  }, "— اختر —"), VA_OPTIONS.map(v => React.createElement("option", {
    key: v
  }, v)))), React.createElement(Field, {
    label: "اليسرى"
  }, React.createElement("select", {
    style: {
      ...inp(),
      textAlign: "center"
    },
    value: f.visualAcuityL,
    onChange: s("visualAcuityL")
  }, React.createElement("option", {
    value: ""
  }, "— اختر —"), VA_OPTIONS.map(v => React.createElement("option", {
    key: v
  }, v))))), (f.visualAcuityR || f.visualAcuityL) && React.createElement("div", {
    style: {
      background: C.teal + "11",
      border: `1px solid ${C.teal}33`,
      borderRadius: 10,
      padding: "8px 12px",
      display: "flex",
      justifyContent: "space-around"
    }
  }, f.visualAcuityR && React.createElement("div", {
    style: {
      textAlign: "center"
    }
  }, React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10
    }
  }, "يمنى"), React.createElement("div", {
    style: {
      color: C.teal,
      fontWeight: 800,
      fontSize: 16
    }
  }, f.visualAcuityR)), f.visualAcuityR && f.visualAcuityL && React.createElement("div", {
    style: {
      color: C.border
    }
  }, "|"), f.visualAcuityL && React.createElement("div", {
    style: {
      textAlign: "center"
    }
  }, React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10
    }
  }, "يسرى"), React.createElement("div", {
    style: {
      color: C.teal,
      fontWeight: 800,
      fontSize: 16
    }
  }, f.visualAcuityL))), React.createElement(SecHead, {
    icon: "🔵",
    label: "ضغط العين IOP (mmHg)",
    color: C.teal
  }), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10
    }
  }, React.createElement(Field, {
    label: "اليمنى"
  }, React.createElement("select", {
    style: {
      ...inp(),
      textAlign: "center"
    },
    value: f.iopR,
    onChange: s("iopR")
  }, React.createElement("option", {
    value: ""
  }, "— اختر —"), IOP_OPTIONS.map(v => React.createElement("option", {
    key: v
  }, v)))), React.createElement(Field, {
    label: "اليسرى"
  }, React.createElement("select", {
    style: {
      ...inp(),
      textAlign: "center"
    },
    value: f.iopL,
    onChange: s("iopL")
  }, React.createElement("option", {
    value: ""
  }, "— اختر —"), IOP_OPTIONS.map(v => React.createElement("option", {
    key: v
  }, v))))), (f.iopR || f.iopL) && React.createElement("div", {
    style: {
      background: Number(f.iopR) > 21 || Number(f.iopL) > 21 ? C.danger + "11" : C.success + "11",
      border: `1px solid ${Number(f.iopR) > 21 || Number(f.iopL) > 21 ? C.danger : C.success}33`,
      borderRadius: 10,
      padding: "8px 12px",
      display: "flex",
      justifyContent: "space-around",
      alignItems: "center"
    }
  }, f.iopR && React.createElement("div", {
    style: {
      textAlign: "center"
    }
  }, React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10
    }
  }, "يمنى"), React.createElement("div", {
    style: {
      color: Number(f.iopR) > 21 ? C.danger : C.success,
      fontWeight: 800,
      fontSize: 16
    }
  }, f.iopR, " ", React.createElement("span", {
    style: {
      fontSize: 10
    }
  }, "mmHg"))), f.iopR && f.iopL && React.createElement("div", {
    style: {
      color: C.border
    }
  }, "|"), f.iopL && React.createElement("div", {
    style: {
      textAlign: "center"
    }
  }, React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10
    }
  }, "يسرى"), React.createElement("div", {
    style: {
      color: Number(f.iopL) > 21 ? C.danger : C.success,
      fontWeight: 800,
      fontSize: 16
    }
  }, f.iopL, " ", React.createElement("span", {
    style: {
      fontSize: 10
    }
  }, "mmHg"))), (Number(f.iopR) > 21 || Number(f.iopL) > 21) && React.createElement("div", {
    style: {
      color: C.danger,
      fontSize: 11,
      fontWeight: 700
    }
  }, "⚠ مرتفع")), React.createElement(SecHead, {
    icon: "🔍",
    label: "المصباح الشقي",
    color: C.gold
  }), React.createElement(Field, {
    label: "القطعة الأمامية"
  }, React.createElement("textarea", {
    style: {
      ...inp(),
      resize: "none"
    },
    rows: 2,
    value: f.anteriorSegment,
    onChange: s("anteriorSegment"),
    placeholder: "القرنية، القزحية، العدسة..."
  })), React.createElement(Field, {
    label: "القطعة الخلفية"
  }, React.createElement("textarea", {
    style: {
      ...inp(),
      resize: "none"
    },
    rows: 2,
    value: f.posteriorSegment,
    onChange: s("posteriorSegment"),
    placeholder: "القرص البصري، الشبكية..."
  })), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr",
      gap: 8
    }
  }, [["رؤية الألوان", "colorVision", ["طبيعي", "غير طبيعي"]], ["Cover Test", "coverTest", ["طبيعي", "إيجابي"]], ["Contrast", "contrast", ["طبيعي", "منخفض"]]].map(([lbl, key, opts]) => React.createElement(Field, {
    key: key,
    label: lbl
  }, React.createElement("select", {
    style: inp(),
    value: f[key],
    onChange: s(key)
  }, opts.map(o => React.createElement("option", {
    key: o
  }, o))))))), step === 2 && React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, React.createElement(Field, {
    label: "التشخيص النهائي"
  }, React.createElement("textarea", {
    style: {
      ...inp(),
      resize: "none"
    },
    rows: 3,
    value: f.diagnosis,
    onChange: s("diagnosis"),
    placeholder: "قصر نظر، ماء أبيض..."
  })), React.createElement(Field, {
    label: "خطة العلاج"
  }, React.createElement("textarea", {
    style: {
      ...inp(),
      resize: "none"
    },
    rows: 4,
    value: f.treatmentPlan,
    onChange: s("treatmentPlan"),
    placeholder: "نظارة طبية - قطرات - جراحة..."
  })), React.createElement(Field, {
    label: "موعد المتابعة"
  }, React.createElement("input", {
    style: inp(),
    type: "date",
    value: f.followUp,
    onChange: s("followUp")
  })), React.createElement(Field, {
    label: "ملاحظات"
  }, React.createElement("textarea", {
    style: {
      ...inp(),
      resize: "none"
    },
    rows: 2,
    value: f.notes,
    onChange: s("notes"),
    placeholder: "توصيات للمريض..."
  }))), React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      marginTop: 20
    }
  }, step > 0 && React.createElement(Btn, {
    outline: true,
    onClick: () => setStep(p => p - 1)
  }, "السابق"), step < 2 ? React.createElement(Btn, {
    full: true,
    onClick: () => setStep(p => p + 1)
  }, "التالي →") : React.createElement(React.Fragment, null, React.createElement(Btn, {
    outline: true,
    full: true,
    onClick: onClose
  }, "إلغاء"), React.createElement(Btn, {
    full: true,
    onClick: () => onSave({
      ...f,
      patientId,
      id: f.id || Date.now()
    })
  }, "✓ حفظ الفحص"))));
}
function PatientEditForm({
  patient,
  onSave,
  onClose
}) {
  const [tab, setTab] = useState("basic");
  const [f, setF] = useState({
    ...patient
  });
  const s = k => e => setF(v => ({
    ...v,
    [k]: e.target.value
  }));
  const TABS = [{
    id: "basic",
    label: "البيانات",
    icon: "👤"
  }, {
    id: "medical",
    label: "الطبي",
    icon: "🏥"
  }, {
    id: "contact",
    label: "التواصل",
    icon: "📞"
  }];
  return React.createElement("div", null, React.createElement("div", {
    style: {
      display: "flex",
      marginBottom: 18,
      background: C.card,
      borderRadius: 12,
      padding: 4
    }
  }, TABS.map(t => React.createElement("div", {
    key: t.id,
    onClick: () => setTab(t.id),
    style: {
      flex: 1,
      textAlign: "center",
      padding: "8px 2px",
      background: tab === t.id ? `linear-gradient(135deg,${C.accent},${C.teal})` : "transparent",
      borderRadius: 9,
      cursor: "pointer",
      color: tab === t.id ? C.bg : C.muted,
      fontSize: 10,
      fontWeight: 700
    }
  }, t.icon, " ", t.label))), tab === "basic" && React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, React.createElement(Field, {
    label: "الاسم الكامل"
  }, React.createElement("input", {
    style: inp(),
    value: f.name,
    onChange: s("name"),
    placeholder: "الاسم"
  })), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10
    }
  }, React.createElement(Field, {
    label: "العمر"
  }, React.createElement("input", {
    style: inp(),
    type: "number",
    value: f.age,
    onChange: s("age")
  })), React.createElement(Field, {
    label: "الجنس"
  }, React.createElement("select", {
    style: inp(),
    value: f.gender,
    onChange: s("gender")
  }, ["ذكر", "أنثى"].map(g => React.createElement("option", {
    key: g
  }, g))))), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10
    }
  }, React.createElement(Field, {
    label: "الهاتف"
  }, React.createElement("input", {
    style: inp(),
    value: f.phone,
    onChange: s("phone")
  })), React.createElement(Field, {
    label: "فصيلة الدم"
  }, React.createElement("select", {
    style: inp(),
    value: f.bloodType,
    onChange: s("bloodType")
  }, ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map(b => React.createElement("option", {
    key: b
  }, b))))), React.createElement(Field, {
    label: "العنوان"
  }, React.createElement("input", {
    style: inp(),
    value: f.address,
    onChange: s("address")
  })), React.createElement(Field, {
    label: "المهنة"
  }, React.createElement("input", {
    style: inp(),
    value: f.occupation || "",
    onChange: s("occupation"),
    placeholder: "المهنة"
  })), React.createElement(Field, {
    label: "آخر زيارة"
  }, React.createElement("input", {
    style: inp(),
    type: "date",
    value: f.lastVisit,
    onChange: s("lastVisit")
  })), React.createElement(Field, {
    label: "الحالة"
  }, React.createElement("select", {
    style: inp(),
    value: f.status,
    onChange: s("status")
  }, ["مكتمل", "متابعة", "طارئ"].map(x => React.createElement("option", {
    key: x
  }, x))))), tab === "medical" && React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, React.createElement(Field, {
    label: "التشخيص الرئيسي"
  }, React.createElement("input", {
    style: inp(),
    value: f.condition,
    onChange: s("condition"),
    placeholder: "قصر نظر، ماء أبيض..."
  })), React.createElement(Field, {
    label: "التاريخ المرضي"
  }, React.createElement("textarea", {
    style: {
      ...inp(),
      resize: "none"
    },
    rows: 3,
    value: f.history || "",
    onChange: s("history"),
    placeholder: "أمراض سابقة، عمليات..."
  })), React.createElement(Field, {
    label: "الحساسية للأدوية"
  }, React.createElement("textarea", {
    style: {
      ...inp(),
      resize: "none"
    },
    rows: 2,
    value: f.allergies || "",
    onChange: s("allergies"),
    placeholder: "بنسلين، سلفا..."
  }))), tab === "contact" && React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, React.createElement(Field, {
    label: "رقم الهاتف"
  }, React.createElement("input", {
    style: inp(),
    value: f.phone,
    onChange: s("phone")
  })), React.createElement(Field, {
    label: "جهة الاتصال في الطوارئ"
  }, React.createElement("input", {
    style: inp(),
    value: f.emergencyContact || "",
    onChange: s("emergencyContact"),
    placeholder: "الاسم والعلاقة والرقم"
  })), React.createElement(Field, {
    label: "العنوان الكامل"
  }, React.createElement("textarea", {
    style: {
      ...inp(),
      resize: "none"
    },
    rows: 3,
    value: f.address,
    onChange: s("address"),
    placeholder: "المدينة - الحي - الشارع"
  }))), React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      marginTop: 20
    }
  }, React.createElement(Btn, {
    outline: true,
    full: true,
    onClick: onClose
  }, "إلغاء"), React.createElement(Btn, {
    full: true,
    onClick: () => onSave({
      ...f,
      age: Number(f.age)
    })
  }, "✓ حفظ التعديلات")));
}
function PatientFile({
  patient,
  allExams,
  allRx,
  allVisits,
  onClose,
  onUpdatePatient,
  onSaveExam,
  onDelExam,
  onSaveVisit,
  onDelVisit,
  onSaveRx,
  onSaveRadiologyRequest,
  doctorNames = [],
  primaryDoctor,
  prices = [],
  clinic,
  customTests = []
}) {
  const [tab, setTab] = useState("info");
  const [timelineSearch, setTimelineSearch] = useState("");
  const [timelineFilter, setTimelineFilter] = useState("All");
  const [modal, setModal] = useState(null);
  const [delTarget, setDelTarget] = useState(null);
  // Phase 18: declare Core Patient 360 state before any derived values use it.
  const [coreFile, setCoreFile] = useState(null);
  const [coreLoaded, setCoreLoaded] = useState(false);
  const [coreSource, setCoreSource] = useState("none");
  const [coreRequests, setCoreRequests] = useState([]);
  const [coreImages, setCoreImages] = useState([]);
  // Phase 18 fix: requestSaved must be declared before the Core-sync useEffect below,
  // which lists it in its dependency array. Declaring it later caused
  // "Cannot access 'requestSaved' before initialization".
  const [requestSaved, setRequestSaved] = useState(false);
  const coreExams = (coreFile?.examinations || []).map(e => ({
    id: e.legacy_id && /^\d+$/.test(String(e.legacy_id)) ? Number(e.legacy_id) : e.id,
    patientId: patient.id,
    date: e.examination_date || String(e.created_at || "").slice(0, 10),
    doctor: e.doctor_name || "",
    visualAcuityR: e.visual_acuity_od || "",
    visualAcuityL: e.visual_acuity_os || "",
    iopR: e.iop_od || "",
    iopL: e.iop_os || "",
    anteriorSegment: e.anterior_segment || "",
    posteriorSegment: e.posterior_segment || "",
    colorVision: e.color_vision || "",
    contrast: e.contrast || "",
    coverTest: e.cover_test || "",
    diagnosis: e.diagnosis_summary || "",
    treatmentPlan: e.treatment_plan || "",
    followUp: e.followup_date || "",
    notes: e.notes || "",
    _core: true
  }));
  const coreVisits = (coreFile?.visits || []).map(v => ({
    id: v.id, patientId: patient.id, date: v.visit_date || String(v.created_at || "").slice(0, 10),
    type: v.visit_type || "visit", doctor: v.doctor_name || "", complaint: v.chief_complaint || "",
    result: v.clinical_summary || "", notes: v.notes || "", cost: v.cost || 0, paid: !!v.paid, nextVisit: v.next_visit || "",
    _core: true, _coreId: v.id
  }));
  const coreRx = (coreFile?.prescriptions || []).map(r => ({
    id: r.legacy_id && /^\d+$/.test(String(r.legacy_id)) ? Number(r.legacy_id) : r.id,
    patientId: patient.id, date: r.prescription_date || r.date || "", eye: r.eye || "OU", sphR: r.sph_od || r.sphR || "", sphL: r.sph_os || r.sphL || "",
    cylR: r.cyl_od || r.cylR || "", cylL: r.cyl_os || r.cylL || "", axisR: r.axis_od || r.axisR || "", axisL: r.axis_os || r.axisL || "",
    add: r.add_power || r.add || "", medicines: r.medicines || [], notes: r.notes || "", patient: patient.name, _core: true
  }));
  const mergeCore = (legacy, core, keyFn) => {
    const out = Array.isArray(legacy) ? [...legacy] : [];
    const seen = new Set(out.map(keyFn));
    core.forEach(item => { const k = keyFn(item); if (!seen.has(k)) { out.push(item); seen.add(k); } });
    return out;
  };
  const patientRecords = mergeCore(allExams.filter(e => e.patientId === patient.id), coreExams, e => String(e.id));
  const requests = [...patientRecords.filter(e => e.status === "requested" || e.requestedTests && e.requestedTests.length), ...coreRequests.filter(r => !patientRecords.some(e => e.imagingOrderId && e.imagingOrderId === r.imagingOrderId))];
  const exams = patientRecords.filter(e => !(e.status === "requested" || e.requestedTests && e.requestedTests.length));
  const rxList = mergeCore(allRx.filter(r => r.patientId === patient.id), coreRx, r => String(r.id));
  const visits = mergeCore(allVisits.filter(v => v.patientId === patient.id), coreVisits, v => String(v._coreId || v.id)).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  // Phase 29: the backend contract exposes normalized arrays rather than a
  // separate journey field. Keep the merged arrays as the compatibility layer.
  const coreJourneyCount = (coreFile?.visits?.length || 0) + (coreFile?.examinations?.length || 0) +
    (coreFile?.diagnoses?.length || 0) + (coreFile?.treatments?.length || 0) +
    (coreFile?.prescriptions?.length || 0) + (coreFile?.investigation_orders?.length || 0) +
    (coreFile?.imaging_studies?.length || 0) + (coreFile?.followups?.length || 0);
  const coreJourneyEvents = Array.isArray(coreFile?.journey) ? coreFile.journey.map(e => {
    const typeMap = { visit: "زيارة", examination: "فحص", diagnosis: "تشخيص", treatment: "علاج", prescription: "وصفة", investigation: "طلب أشعة", imaging: "صورة", followup: "متابعة" };
    const iconMap = { visit: "🩺", examination: "🔍", diagnosis: "🧬", treatment: "💊", prescription: "📋", investigation: "🩻", imaging: "🖼️", followup: "📅" };
    const colorMap = { visit: C.teal, examination: C.accent, diagnosis: C.gold, treatment: C.gold, prescription: C.gold, investigation: C.gold, imaging: C.purple, followup: C.teal };
    const t = e?.event_type || "visit";
    return { date: e?.event_date || "", time: e?.event_time || "", type: typeMap[t] || t, title: e?.title || typeMap[t] || "Clinical Event", detail: e?.detail || "", doctor: e?.doctor || "", icon: iconMap[t] || "🩺", color: colorMap[t] || C.teal };
  }) : [];
  const totalSpent = visits.reduce((s, v) => s + (v.paid ? Number(v.cost || 0) : 0), 0);
  const TABS = [{
    id: "info",
    label: "Overview",
    icon: "👤"
  }, {
    id: "timeline",
    label: "Timeline",
    icon: "🕘"
  }, {
    id: "visits",
    label: "Visits",
    icon: "🗓"
  }, {
    id: "exams",
    label: "Examination",
    icon: "🔍"
  }, {
    id: "requests",
    label: "Investigation Orders",
    icon: "🩻"
  }, {
    id: "treatment",
    label: "Treatment",
    icon: "💊"
  }, {
    id: "rx",
    label: "Prescriptions",
    icon: "🔬"
  }, {
    id: "images",
    label: "Medical Images",
    icon: "oct"
  }, {
    id: "compare",
    label: "Comparison",
    icon: "📊"
  }];
  const [curPatient, setCurPatient] = useState(patient);
  // Phase 18: Core Patient 360 state is declared above before derived values.
  useEffect(() => {
    let active = true;
    (async () => {
      const code = patient && patient.patientCode;
      const sb = getSB();
      if (!sb || !code) {
        if (active) {
          setCoreLoaded(false);
          setCoreSource("none");
        }
        return;
      }
      try {
        let data = null, error = null;
        let source = "none";
        // Phase 29: Patient 360 remains the preferred read contract, but each
        // migration fallback gets a bounded wait so a slow/new RPC cannot stall
        // opening the patient file indefinitely.
        const rpcWithTimeout = (name, args, ms = 6000) => Promise.race([
          sb.rpc(name, args),
          new Promise((_, reject) => setTimeout(() => reject(new Error(name + " timeout")), ms))
        ]);
        const svc360 = window.IAppModules && window.IAppModules.patients && window.IAppModules.patients.getPatient360;
        if (svc360) {
          // Phase 53-56: Patient 360 comes from the extracted service.
          data = await svc360(sb, code);
          source = data._source || "360";
        } else {
        try {
          ({ data, error } = await rpcWithTimeout("iapp_get_patient_360_timeline", { p_patient_code: String(code) }));
          if (!error && data?.found) source = "360";
        } catch (e) {
          error = e;
        }
        if (error || !data?.found) {
          try {
            ({ data, error } = await rpcWithTimeout("iapp_get_patient_file_summary", { p_patient_code: String(code) }));
            if (!error && data?.found) source = "summary";
          } catch (e) {
            error = e;
          }
        }
        if (error || !data?.found) {
          try {
            const fallback = await rpcWithTimeout("iapp_get_patient_file_by_code", { p_patient_code: String(code) });
            data = fallback.data;
            error = fallback.error;
            if (!error && data?.found) source = "legacy";
          } catch (e) {
            error = e;
          }
        }
        }
        if (error) throw error;
        if (!active) return;
        const rawFile = data && typeof data === "object" ? data : null;
        const file = rawFile ? { ...rawFile, ...(rawFile.patient || {}) } : null;
        setCoreFile(file);
        setCoreLoaded(!!file);
        setCoreSource(source);
        const orders = Array.isArray(file?.investigation_orders) ? file.investigation_orders : [];
        const imagingOrders = Array.isArray(file?.imaging_orders) ? file.imaging_orders : [];
        const imagingByInvestigation = new Map(imagingOrders.filter(x => x?.investigation_order_id != null).map(x => [String(x.investigation_order_id), x]));
        setCoreRequests(orders.map(o => {
          const io = imagingByInvestigation.get(String(o.id));
          return {
            id: "core-order-" + o.id,
            patientId: patient.id,
            patient: file.full_name || patient.name,
            patientCode: file.patient_code || patient.patientCode || "",
            date: String(o.ordered_at || io?.order_date || "").slice(0, 10) || localDateStr(),
            time: o.ordered_at ? new Date(o.ordered_at).toTimeString().slice(0, 5) : (io?.order_time || ""),
            doctor: o.doctor_name || o.requested_by || io?.doctor_name || "",
            testType: o.investigation_type || "Investigation",
            requestedTests: [{ id: o.id, name: o.test_name || o.investigation_type || "Investigation", name_ar: o.test_name || o.investigation_type || "Investigation", category: "Core", eye: o.eye || "OU" }],
            notes: o.clinical_note || io?.notes || "",
            status: o.status || io?.status || "requested",
            imagingOrderId: io?.id || null,
            visitId: o.visit_id || io?.visit_id || null,
            _core: true
          };
        }));
        const studies = Array.isArray(file?.imaging_studies) ? file.imaging_studies : [];
        const imgs = [];
        studies.forEach(st => {
          const files = Array.isArray(st.files) && st.files.length ? st.files : [{
            id: st.cloudinary_public_id || st.legacy_id || ("core-study-" + st.id),
            public_id: st.cloudinary_public_id || "",
            src: st.cloudinary_url || "",
            name: st.metadata?.name || st.type_name || st.study_type || "Medical image",
            date: st.performed_date || String(st.performed_at || "").slice(0, 10),
            time: st.performed_time || "",
            type: st.type_name || st.modality || st.study_type || "Medical image",
            eye: st.eye || "OU",
            notes: st.notes || st.report || "",
            examId: null
          }];
          files.forEach(f => imgs.push({ ...f, id: f.id || f.public_id || ("core-study-" + st.id), public_id: f.public_id || st.cloudinary_public_id || "", src: f.src || st.cloudinary_url || "", _core: true }));
        });
        setCoreImages(imgs.filter(x => x.src));
      } catch (e) {
        if (active) {
          setCoreLoaded(false);
          setCoreFile(null);
          setCoreRequests([]);
          setCoreImages([]);
        }
        console.warn("Core Patient 360 unavailable; using legacy Patient File:", e?.message || e);
      }
    })();
    return () => { active = false; };
  }, [patient.id, patient.patientCode, requestSaved]);

  const [viewImg, setViewImg] = useState(null);
  const CLD_CLOUD = "daihhusnc";
  const CLD_PRESET = "iapp_clinic";
  const metaKey = "iapp_imgmeta_" + patient.id;
  const [images, setImages] = useState([]);
  const [imgLoading, setImgLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [imgError, setImgError] = useState(null);
  const [aiAnalysis, setAiAnalysis] = useState({});
  const [imageType, setImageType] = useState("OCT");
  const [imageEye, setImageEye] = useState("OU");
  const [imageFilter, setImageFilter] = useState("الكل");
  const [requestTests, setRequestTests] = useState({});
  const [requestNotes, setRequestNotes] = useState("");
  const [requestEye, setRequestEye] = useState("OU");
  const [imagingOrders, setImagingOrders] = useState([]);
  const [imagingStudies, setImagingStudies] = useState([]);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const o = await sbGet("iapp_imaging_orders");
        if (active) setImagingOrders(Array.isArray(o) ? o.filter(x => x.patientId === patient.id) : []);
      } catch {}
      try {
        const st = await sbGet("iapp_imaging_studies");
        if (active) setImagingStudies(Array.isArray(st) ? st.filter(x => x.patientId === patient.id) : []);
      } catch {}
    })();
    return () => {
      active = false;
    };
  }, [patient.id, requestSaved]);
  const analyzeImage = async img => {
    if (!img?.src) return;
    setAiAnalysis(prev => ({
      ...prev,
      [img.id]: {
        loading: false,
        result: null,
        error: "تحليل AI غير مفعّل في نسخة المتصفح الحالية. يجب ربطه عبر Backend / Supabase Edge Function بشكل آمن."
      }
    }));
  };
  const persistMeta = async imgs => {
    const meta = imgs.map(i => ({
      id: i.id,
      public_id: i.public_id,
      name: i.name,
      date: i.date,
      time: i.time || "",
      src: i.src,
      notes: i.notes || "",
      type: i.type || "صورة طبية",
      eye: i.eye || "OU",
      examId: i.examId || null
    }));
    await queueSave(metaKey, meta);
    return meta;
  };
  const mergeImageMeta = async operation => {
    const remote = await sbGet(metaKey);
    const base = Array.isArray(remote) ? remote : images;
    const next = operation(base);
    await persistMeta(next);
    setImages(next);
    return next;
  };
  useEffect(() => {
    let channel;
    const offBus = busOn(metaKey, setImages);
    (async () => {
      setImgLoading(true);
      try {
        const cached = localStorage.getItem(metaKey);
        if (cached) setImages(JSON.parse(cached));
      } catch {}
      try {
        const remote = await sbGet(metaKey);
        if (Array.isArray(remote)) {
          setImages(prev => {
            const base = remote;
            const keys = new Set(base.map(x => String(x.id || x.public_id || x.src || "")));
            return [...base, ...coreImages.filter(x => !keys.has(String(x.id || x.public_id || x.src || "")))];
          });
          if (!isDirty(metaKey)) LS.set(metaKey, JSON.stringify(remote));
        } else if (coreImages.length) {
          setImages(coreImages);
        }
      } catch (e) {
        console.warn("img meta load:", e);
      }
      setImgLoading(false);
    })();
    try {
      const sb = getSB();
      if (sb) channel = sb.channel("iapp_imgmeta_" + patient.id).on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "iapp_store",
        filter: `key=eq.${metaKey}`
      }, payload => {
        const next = payload?.new?.value;
        if (Array.isArray(next) && !isDirty(metaKey)) {
          setImages(next);
          LS.set(metaKey, JSON.stringify(next));
        }
      }).subscribe();
    } catch (e) {
      console.warn("image realtime unavailable", e);
    }
    return () => {
      offBus();
      if (channel) {
        try {
          getSB().removeChannel(channel);
        } catch {}
      }
    };
  }, [patient.id, coreImages]);
  useEffect(() => {
    if (!coreImages.length) return;
    setImages(prev => {
      const keys = new Set((prev || []).map(x => String(x.id || x.public_id || x.src || "")));
      const extra = coreImages.filter(x => !keys.has(String(x.id || x.public_id || x.src || "")));
      return extra.length ? [...(prev || []), ...extra] : prev;
    });
  }, [coreImages]);
  const uploadOneFile = function (file) {
    setUploadProgress({
      name: file.name,
      pct: 10
    });
    var folder = "iapp/patient_" + patient.id;
    var formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLD_PRESET);
    formData.append("folder", folder);
    return fetch("https://api.cloudinary.com/v1_1/" + CLD_CLOUD + "/image/upload", {
      method: "POST",
      body: formData
    }).then(res => {
      setUploadProgress({
        name: file.name,
        pct: 80
      });
      return res.json().then(data => {
        if (!res.ok) {
          setImgError("فشل الرفع: " + (data && data.error && data.error.message || res.status));
          return;
        }
        const newImg = {
          id: data.public_id,
          public_id: data.public_id,
          name: file.name,
          date: localISO(),
          time: new Date().toTimeString().slice(0, 5),
          src: data.secure_url,
          notes: "",
          type: imageType,
          eye: imageEye,
          examId: null
        };
        setUploadProgress({
          name: file.name,
          pct: 100
        });
        return mergeImageMeta(base => [newImg, ...base.filter(x => x.id !== newImg.id)]);
      });
    }).catch(err => setImgError("خطأ في الرفع: " + err.message));
  };
  const handleImgUpload = function (e) {
    var files = Array.from(e.target.files).filter(function (f) {
      return f.type.startsWith("image/");
    });
    e.target.value = "";
    if (!files.length) return;
    setImgError(null);
    var chain = Promise.resolve();
    files.forEach(function (file) {
      chain = chain.then(function () {
        return uploadOneFile(file);
      });
    });
    chain.then(function () {
      setUploadProgress(null);
    });
  };
  const delImage = async id => {
    await mergeImageMeta(base => base.filter(i => i.id !== id));
  };
  const updateImgNotes = async (id, notes) => {
    await mergeImageMeta(base => base.map(i => i.id === id ? {
      ...i,
      notes
    } : i));
  };
  const allRequestTests = [...DEFAULT_TESTS, ...(customTests || []).map(t => ({
    ...t,
    cat: "مخصص"
  }))];
  const toggleRequestTest = id => setRequestTests(v => v[id] ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== id)) : {
    ...v,
    [id]: requestEye
  });
  const cycleRequestEye = id => setRequestTests(v => ({
    ...v,
    [id]: EYE_CYCLE[v[id] || requestEye] || "OU"
  }));
  const savePatientRadiologyRequest = async () => {
    const ids = Object.keys(requestTests);
    if (!ids.length) {
      alert("اختر فحصاً واحداً على الأقل");
      return;
    }
    const tests = ids.map(id => {
      const t = allRequestTests.find(x => x.id === id);
      return t ? {
        id: t.id,
        name: t.name,
        name_ar: t.name_ar,
        category: t.cat,
        eye: requestTests[id] || "OU"
      } : null;
    }).filter(Boolean);
    const nowId = Date.now();
    const rec = {
      id: nowId,
      patientId: curPatient.id,
      patient: curPatient.name,
      date: localDateStr(),
      time: localTimeStr(),
      doctor: primaryDoctor && primaryDoctor.name || "",
      testType: "طلب فحوصات",
      requestedTests: tests,
      notes: requestNotes || "",
      status: "requested",
      imagingOrderId: "ORD-" + nowId
    };
    let coreWorkflow = null;
    let coreError = null;
    let coreVisitId = null;
    try {
      const sb = getSB();
      if (sb && !offlineNow()) {
        const { data: visitId, error: visitError } = await createClinicalVisitCore(sb, {
          p_patient_id: Number(curPatient.id),
          p_appointment_id: null,
          p_doctor_name: primaryDoctor?.name || "",
          p_visit_date: localDateStr(),
          p_visit_type: "investigation",
          p_chief_complaint: "",
          p_clinical_summary: "طلب فحوصات",
          p_notes: requestNotes || "",
          p_status: "completed"
        }, `investigation:${nowId}`);
        if (visitError) throw visitError;
        coreVisitId = visitId || null;
        const eyeValues = [...new Set(tests.map(t => t.eye).filter(Boolean))];
        const coreEye = eyeValues.length === 1 ? eyeValues[0] : "OU";
        const { data, error } = await iappRpc(sb, "iapp_create_investigation_workflow_order", imagingRequestOrderParams({ patientId: curPatient.id, visitId: coreVisitId, tests, requestNotes, doctorName: primaryDoctor?.name, sourceLegacyId: nowId }));
        if (error) throw error;
        coreWorkflow = data;
        rec.coreInvestigationOrderId = data?.investigation_order_id || null;
        rec.coreImagingOrderId = data?.imaging_order_id || null;
        rec.coreVisitId = coreVisitId;
      } else {
        coreError = "offline";
      }
    } catch (e) {
      coreError = e?.message || String(e);
      console.warn("[core investigation sync]", e);
    }
    if (onSaveRadiologyRequest) await onSaveRadiologyRequest(rec);
    const order = {
      id: "ORD-" + nowId,
      patientId: curPatient.id,
      patient: curPatient.name,
      patientCode: curPatient.patientCode || "",
      doctor: primaryDoctor && primaryDoctor.name || "",
      date: localDateStr(),
      time: localTimeStr(),
      tests,
      notes: requestNotes || "",
      status: "requested",
      sourceExamId: nowId,
      createdAt: new Date().toISOString(),
      coreInvestigationOrderId: coreWorkflow?.investigation_order_id || null,
      coreImagingOrderId: coreWorkflow?.imaging_order_id || null,
      coreSyncError: coreError || null
    };
    const remoteOrders = await sbGet("iapp_imaging_orders");
    await sbSet("iapp_imaging_orders", [order, ...(Array.isArray(remoteOrders) ? remoteOrders : [])]);
    setRequestSaved(true);
    setRequestTests({});
    setRequestNotes("");
    setTimeout(() => setRequestSaved(false), 3000);
  };
  const handlePatientSave = updated => {
    onUpdatePatient(updated);
    setCurPatient(updated);
    setModal(null);
  };
  return React.createElement("div", {
    style: {
      position: "fixed",
      inset: 0,
      background: C.bg,
      zIndex: 300,
      overflowY: "auto",
      direction: "rtl",
      fontFamily: "'Segoe UI','Tahoma',Arial,sans-serif",
      maxWidth: 480,
      margin: "0 auto"
    }
  }, React.createElement(TopBar, {
    backLabel: curPatient.name,
    onBack: onClose
  }), React.createElement("div", {
    style: {
      background: `linear-gradient(135deg,${C.accent}22,${C.teal}11)`,
      border: `1px solid ${C.accent}33`,
      margin: "12px 16px",
      borderRadius: 16,
      padding: "14px 16px",
      display: "flex",
      alignItems: "center",
      gap: 14
    }
  }, React.createElement("div", {
    style: {
      width: 56,
      height: 56,
      borderRadius: "50%",
      background: `linear-gradient(135deg,${C.accent},${C.teal})`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: C.bg,
      fontWeight: 800,
      fontSize: 22
    }
  }, (curPatient.name || "?")[0]), React.createElement("div", {
    style: {
      flex: 1
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 16
    }
  }, curPatient.name), React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      marginBottom: 2
    }
  }, React.createElement("span", {
    style: {
      background: C.accent + "33",
      color: C.accent,
      borderRadius: 8,
      padding: "2px 10px",
      fontSize: 12,
      fontWeight: 800,
      letterSpacing: 1
    }
  }, curPatient.patientCode || "—")), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 12
    }
  }, curPatient.age, " سنة · ", curPatient.gender, " · ", curPatient.phone), React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      marginTop: 4,
      alignItems: "center"
    }
  }, React.createElement(Tag, {
    label: curPatient.status,
    color: SC[curPatient.status] || C.muted
  }), React.createElement("span", {
    onClick: () => setModal("editPatient"),
    style: {
      color: C.accent,
      fontSize: 11,
      cursor: "pointer",
      background: C.accent + "22",
      borderRadius: 8,
      padding: "2px 8px"
    }
  }, "✏ تعديل الملف"), React.createElement("span", {
    onClick: () => printDoc(getPatientFileHTML(curPatient, visits, patientRecords, rxList, primaryDoctor, clinic)),
    style: {
      color: C.purple,
      fontSize: 11,
      cursor: "pointer",
      background: C.purple + "22",
      borderRadius: 8,
      padding: "2px 8px"
    }
  }, "🖨️ طباعة")))), React.createElement("div", {
    style: {
      display: "flex",
      margin: "0 16px 14px",
      background: C.card,
      borderRadius: 12,
      padding: 4,
      overflowX: "auto"
    }
  }, TABS.map(t => React.createElement("div", {
    key: t.id,
    onClick: () => setTab(t.id),
    style: {
      flex: "0 0 auto",
      textAlign: "center",
      padding: "8px 10px",
      background: tab === t.id ? `linear-gradient(135deg,${C.accent},${C.teal})` : "transparent",
      borderRadius: 9,
      cursor: "pointer",
      color: tab === t.id ? C.bg : C.muted,
      fontSize: 10,
      fontWeight: 700,
      minWidth: 54
    }
  }, React.createElement("div", {
    style: {
      fontSize: 13,
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      height: 18
    }
  }, t.icon === "oct" ? React.createElement("img", {
    src: XRAY_ICON,
    style: {
      width: 18,
      height: 18,
      display: "block",
      filter: tab === t.id ? "brightness(0) invert(1)" : "brightness(0.8)"
    }
  }) : t.icon), t.label))), React.createElement("div", {
    style: {
      padding: "0 16px 100px"
    }
  }, tab === "info" && React.createElement("div", {
    style: {
      background: `linear-gradient(135deg,${C.teal}12,${C.accent}0d)`,
      border: `1px solid ${C.teal}33`,
      borderRadius: 14,
      padding: 14,
      marginBottom: 12
    }
  }, React.createElement(SecHead, {
    icon: "🩺",
    label: "Clinical Summary",
    color: C.teal
  }), (() => {
    const latest = [...exams].sort((a, b) => (String(b.date || "") + String(b.time || "")).localeCompare(String(a.date || "") + String(a.time || "")))[0];
    const latestVisit = [...visits][0];
    return React.createElement(React.Fragment, null, React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 8,
        marginBottom: 10
      }
    }, React.createElement("div", {
      style: {
        background: C.card,
        borderRadius: 9,
        padding: 9
      }
    }, React.createElement("div", {
      style: {
        color: C.muted,
        fontSize: 10
      }
    }, "آخر زيارة"), React.createElement("div", {
      style: {
        color: C.text,
        fontWeight: 700,
        fontSize: 12
      }
    }, latestVisit?.date || "—")), React.createElement("div", {
      style: {
        background: C.card,
        borderRadius: 9,
        padding: 9
      }
    }, React.createElement("div", {
      style: {
        color: C.muted,
        fontSize: 10
      }
    }, "Latest Examination"), React.createElement("div", {
      style: {
        color: C.text,
        fontWeight: 700,
        fontSize: 12
      }
    }, latest?.date || "—")), React.createElement("div", {
      style: {
        background: C.card,
        borderRadius: 9,
        padding: 9
      }
    }, React.createElement("div", {
      style: {
        color: C.muted,
        fontSize: 10
      }
    }, "VA"), React.createElement("div", {
      style: {
        color: C.teal,
        fontWeight: 800,
        fontSize: 12
      }
    }, "OD ", latest?.visualAcuityR || "—", " · OS ", latest?.visualAcuityL || "—")), React.createElement("div", {
      style: {
        background: C.card,
        borderRadius: 9,
        padding: 9
      }
    }, React.createElement("div", {
      style: {
        color: C.muted,
        fontSize: 10
      }
    }, "IOP"), React.createElement("div", {
      style: {
        color: C.teal,
        fontWeight: 800,
        fontSize: 12
      }
    }, "OD ", latest?.iopR || "—", " · OS ", latest?.iopL || "—"))), React.createElement("div", {
      style: {
        background: C.card,
        borderRadius: 10,
        padding: 10
      }
    }, React.createElement("div", {
      style: {
        color: C.muted,
        fontSize: 10,
        marginBottom: 4
      }
    }, "التشخيص الحالي"), React.createElement("div", {
      style: {
        color: C.gold,
        fontWeight: 800,
        fontSize: 13
      }
    }, latest?.diagnosis || curPatient.condition || "لا يوجد تشخيص مسجل"), (latest?.treatmentPlan || latestVisit?.result) && React.createElement("div", {
      style: {
        marginTop: 8,
        color: C.text,
        fontSize: 11,
        lineHeight: 1.7
      }
    }, latest?.treatmentPlan || latestVisit?.result)), curPatient.allergies && React.createElement("div", {
      style: {
        marginTop: 8,
        background: C.danger + "11",
        border: `1px solid ${C.danger}33`,
        borderRadius: 9,
        padding: 8,
        color: C.danger,
        fontSize: 11,
        fontWeight: 700
      }
    }, "⚠ الحساسية: ", curPatient.allergies));
  })()), tab === "timeline" && React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 10
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 800,
      fontSize: 14
    }
  }, "السجل الطبي الزمني"), coreSource === "360" ? React.createElement("span", { style: { fontSize: 11, opacity: .65, marginInlineStart: 6 } }, "Core 360: " + coreJourneyCount) : coreSource === "summary" ? React.createElement("span", { style: { fontSize: 11, opacity: .65, marginInlineStart: 6 } }, "Core Summary") : null, React.createElement("div", {
    style: {
      display: "flex",
      gap: 7
    }
  }, React.createElement("input", {
    style: {
      ...inp(),
      flex: 1
    },
    value: timelineSearch,
    onChange: e => setTimelineSearch(e.target.value),
    placeholder: "🔎 Search Timeline..."
  }), React.createElement("select", {
    style: {
      ...inp(),
      width: 105
    },
    value: timelineFilter,
    onChange: e => setTimelineFilter(e.target.value)
  }, React.createElement("option", { value: "All" }, "الكل"), React.createElement("option", { value: "زيارة" }, "زيارة"), React.createElement("option", { value: "فحص" }, "فحص"), React.createElement("option", { value: "تشخيص" }, "تشخيص"), React.createElement("option", { value: "علاج" }, "علاج"), React.createElement("option", { value: "طلب أشعة" }, "طلب أشعة"), React.createElement("option", { value: "وصفة" }, "وصفة"), React.createElement("option", { value: "صورة" }, "صورة"), React.createElement("option", { value: "متابعة" }, "متابعة"))), (coreSource === "360" && coreJourneyEvents.length ? coreJourneyEvents : [...visits.map(v => ({
    date: v.date || "",
    time: v.time || "",
    type: "زيارة",
    title: v.type || "زيارة عيادة",
    detail: v.result || v.complaint || v.notes || "",
    doctor: v.doctor || "",
    icon: "🩺",
    color: C.teal
  })), ...requests.map(e => ({
    date: e.date || "",
    time: e.time || "",
    type: "طلب أشعة",
    title: "طلب فحوصات",
    detail: "المطلوب: " + (e.requestedTests || []).map(t => t.name + " (" + (t.eye || "OU") + ")").join("، ") + (e.notes ? " · " + e.notes : ""),
    doctor: e.doctor || "",
    icon: "🩻",
    color: C.gold
  })), ...exams.map(e => ({
    date: e.date || "",
    time: e.time || "",
    type: "فحص",
    title: e.testType || e.type || "فحص عيون",
    detail: e.diagnosis || e.chiefComplaint || e.notes || "",
    doctor: e.doctor || "",
    icon: "🔍",
    color: C.accent
  })), ...rxList.map(r => ({
    date: r.date || "",
    time: r.time || "",
    type: "وصفة",
    title: "وصفة طبية",
    detail: r.notes || r.medications || r.drugs || "",
    doctor: r.doctor || "",
    icon: "💊",
    color: C.gold
  })), ...images.map(img => ({
    date: img.date || "",
    time: img.time || "",
    type: "صورة",
    title: img.type || "صورة طبية",
    detail: `${img.eye && img.eye !== "OU" ? img.eye + " · " : ""}${img.name || ""}${img.notes ? " · " + img.notes : ""}`,
    doctor: "",
    icon: "🖼️",
    color: C.purple
  }))]).filter(e => (timelineFilter === "All" || e.type === timelineFilter) && (!timelineSearch || (String(e.title) + " " + String(e.detail) + " " + String(e.doctor)).toLowerCase().includes(timelineSearch.toLowerCase()))).sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.time).localeCompare(String(a.time))).map((e, i) => React.createElement("div", {
    key: i,
    style: {
      display: "flex",
      gap: 10,
      alignItems: "stretch"
    }
  }, React.createElement("div", {
    style: {
      width: 34,
      minWidth: 34,
      height: 34,
      borderRadius: 10,
      background: e.color + "22",
      border: `1px solid ${e.color}44`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }
  }, e.icon), React.createElement("div", {
    style: {
      flex: 1,
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      padding: "9px 11px"
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      gap: 8
    }
  }, React.createElement("span", {
    style: {
      color: e.color,
      fontWeight: 800,
      fontSize: 12
    }
  }, e.title), React.createElement("span", {
    style: {
      color: C.muted,
      fontSize: 10
    }
  }, e.date)), e.doctor && React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10,
      marginTop: 3
    }
  }, e.type, " · ", e.doctor), e.detail && React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 11,
      lineHeight: 1.7,
      marginTop: 5,
      whiteSpace: "pre-wrap"
    }
  }, String(e.detail).slice(0, 500))))), visits.length + exams.length + rxList.length + images.length === 0 && React.createElement("div", {
    style: {
      color: C.muted,
      textAlign: "center",
      padding: 35
    }
  }, "لا توجد أحداث مسجلة بعد")), tab === "info" && React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, React.createElement("div", {
    style: {
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 14,
      padding: 14
    }
  }, React.createElement(SecHead, {
    icon: "📋",
    label: "البيانات الأساسية"
  }), [["رقم الملف", curPatient.patientCode || "—"], ["الاسم", curPatient.name], ["العمر", curPatient.age + " سنة"], ["الجنس", curPatient.gender], ["فصيلة الدم", curPatient.bloodType || "-"], ["الهاتف", curPatient.phone], ["المهنة", curPatient.occupation || "-"], ["العنوان", curPatient.address]].map(([k, v]) => React.createElement("div", {
    key: k,
    style: {
      display: "flex",
      justifyContent: "space-between",
      paddingBottom: 8,
      marginBottom: 8,
      borderBottom: `1px solid ${C.border}33`
    }
  }, React.createElement("span", {
    style: {
      color: C.muted,
      fontSize: 12
    }
  }, k), React.createElement("span", {
    style: {
      color: C.text,
      fontSize: 12,
      fontWeight: 600,
      textAlign: "left"
    }
  }, v)))), React.createElement("div", {
    style: {
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 14,
      padding: 14
    }
  }, React.createElement(SecHead, {
    icon: "🏥",
    label: "الحالة الطبية",
    color: C.gold
  }), [["التشخيص", curPatient.condition], ["الحالة", curPatient.status], ["التاريخ المرضي", curPatient.history || "-"], ["الحساسية", curPatient.allergies || "-"]].map(([k, v]) => React.createElement("div", {
    key: k,
    style: {
      display: "flex",
      justifyContent: "space-between",
      paddingBottom: 8,
      marginBottom: 8,
      borderBottom: `1px solid ${C.border}33`
    }
  }, React.createElement("span", {
    style: {
      color: C.muted,
      fontSize: 12
    }
  }, k), React.createElement("span", {
    style: {
      color: C.text,
      fontSize: 12,
      fontWeight: 600,
      textAlign: "left"
    }
  }, v)))), exams.length > 0 && (() => {
    const latest = [...exams].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))[0];
    return React.createElement("div", {
      style: {
        background: C.accent + "0d",
        border: `1px solid ${C.accent}33`,
        borderRadius: 12,
        padding: 12
      }
    }, React.createElement(SecHead, {
      icon: "🩺",
      label: "Latest Examination",
      color: C.accent
    }), React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 8
      }
    }, React.createElement("div", {
      style: {
        background: C.card,
        borderRadius: 9,
        padding: 9
      }
    }, React.createElement("div", {
      style: {
        color: C.muted,
        fontSize: 10
      }
    }, "التاريخ"), React.createElement("div", {
      style: {
        color: C.text,
        fontWeight: 700,
        fontSize: 12
      }
    }, latest.date || "—")), React.createElement("div", {
      style: {
        background: C.card,
        borderRadius: 9,
        padding: 9
      }
    }, React.createElement("div", {
      style: {
        color: C.muted,
        fontSize: 10
      }
    }, "التشخيص"), React.createElement("div", {
      style: {
        color: C.gold,
        fontWeight: 700,
        fontSize: 12
      }
    }, latest.diagnosis || "—")), React.createElement("div", {
      style: {
        background: C.card,
        borderRadius: 9,
        padding: 9
      }
    }, React.createElement("div", {
      style: {
        color: C.muted,
        fontSize: 10
      }
    }, "VA"), React.createElement("div", {
      style: {
        color: C.teal,
        fontWeight: 700,
        fontSize: 12
      }
    }, "OD: ", latest.visualAcuityR || "—", " · OS: ", latest.visualAcuityL || "—")), React.createElement("div", {
      style: {
        background: C.card,
        borderRadius: 9,
        padding: 9
      }
    }, React.createElement("div", {
      style: {
        color: C.muted,
        fontSize: 10
      }
    }, "IOP"), React.createElement("div", {
      style: {
        color: C.teal,
        fontWeight: 700,
        fontSize: 12
      }
    }, "OD: ", latest.iopR || "—", " · OS: ", latest.iopL || "—"))));
  })(), curPatient.emergencyContact && React.createElement("div", {
    style: {
      background: C.danger + "11",
      border: `1px solid ${C.danger}33`,
      borderRadius: 12,
      padding: 12
    }
  }, React.createElement(SecHead, {
    icon: "🆘",
    label: "جهة الطوارئ",
    color: C.danger
  }), React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 13
    }
  }, curPatient.emergencyContact)), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr",
      gap: 10
    }
  }, [["🩺", exams.length, "Examination"], [" 🗓", visits.length, "زيارة"], ["💰", totalSpent.toLocaleString(), "ج.م"]].map(([ico, val, lbl], i) => React.createElement("div", {
    key: i,
    style: {
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      padding: "12px 8px",
      textAlign: "center"
    }
  }, React.createElement("div", {
    style: {
      fontSize: 16,
      marginBottom: 4
    }
  }, ico), React.createElement("div", {
    style: {
      color: C.accent,
      fontSize: 18,
      fontWeight: 800
    }
  }, val), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10
    }
  }, lbl))))), tab === "visits" && React.createElement("div", null, React.createElement(InjectionsSection, {
    patient: patient
  }), React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 14
    }
  }, React.createElement("span", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 14
    }
  }, "سجل الزيارات (", visits.length, ")"), React.createElement(Btn, {
    small: true,
    onClick: () => setModal("addVisit")
  }, "+ زيارة جديدة")), visits.length === 0 && React.createElement("div", {
    style: {
      color: C.muted,
      textAlign: "center",
      padding: 40,
      fontSize: 13
    }
  }, "لا توجد زيارات مسجلة بعد"), visits.map(v => React.createElement("div", {
    key: v.id,
    style: {
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 16,
      padding: 14,
      marginBottom: 12
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 10
    }
  }, React.createElement("div", null, React.createElement("div", {
    style: {
      color: C.accent,
      fontWeight: 700,
      fontSize: 13
    }
  }, v.date), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11
    }
  }, v.doctor, " · ", v.type)), React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      alignItems: "center"
    }
  }, React.createElement(Tag, {
    label: v.paid ? "مدفوع" : "غير مدفوع",
    color: v.paid ? C.success : C.danger
  }))), v.complaint && React.createElement("div", {
    style: {
      background: C.bg,
      borderRadius: 10,
      padding: 10,
      marginBottom: 8
    }
  }, React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10,
      marginBottom: 3
    }
  }, "الشكوى"), React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 12
    }
  }, v.complaint)), v.result && React.createElement("div", {
    style: {
      background: C.success + "11",
      border: `1px solid ${C.success}33`,
      borderRadius: 10,
      padding: 10,
      marginBottom: 8
    }
  }, React.createElement("div", {
    style: {
      color: C.success,
      fontSize: 10,
      marginBottom: 3
    }
  }, "نتيجة الزيارة"), React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 12
    }
  }, v.result)), React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 8
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      alignItems: "center"
    }
  }, React.createElement("span", {
    style: {
      color: C.gold,
      fontWeight: 700,
      fontSize: 13
    }
  }, "💰 ", Number(v.cost || 0).toLocaleString(), " ج.م"), v.nextVisit && React.createElement("span", {
    style: {
      color: C.teal,
      fontSize: 11
    }
  }, "📅 ", v.nextVisit)), React.createElement("div", {
    style: {
      display: "flex",
      gap: 6
    }
  }, React.createElement("div", {
    onClick: () => setModal({
      editVisit: v
    }),
    style: {
      background: C.accent + "22",
      borderRadius: 8,
      padding: "5px 10px",
      color: C.accent,
      fontSize: 11,
      cursor: "pointer"
    }
  }, "✏"), React.createElement("div", {
    onClick: () => setDelTarget({
      type: "visit",
      id: v.id
    }),
    style: {
      background: C.danger + "22",
      borderRadius: 8,
      padding: "5px 10px",
      color: C.danger,
      fontSize: 11,
      cursor: "pointer"
    }
  }, "🗑"))), v.notes && React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11,
      marginTop: 8,
      background: C.border,
      borderRadius: 8,
      padding: "6px 10px"
    }
  }, v.notes))), visits.length > 0 && React.createElement("div", {
    style: {
      background: `linear-gradient(135deg,${C.gold}22,${C.gold}11)`,
      border: `1px solid ${C.gold}44`,
      borderRadius: 12,
      padding: "12px 16px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center"
    }
  }, React.createElement("span", {
    style: {
      color: C.muted,
      fontSize: 13
    }
  }, "إجمالي المدفوع"), React.createElement("span", {
    style: {
      color: C.gold,
      fontWeight: 800,
      fontSize: 16
    }
  }, totalSpent.toLocaleString(), " ج.م"))), tab === "compare" && React.createElement("div", null, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 800,
      fontSize: 14,
      marginBottom: 10
    }
  }, "📊 مقارنة القياسات بين الزيارات"), (() => {
    const rows = [...exams].filter(e => e.visualAcuityR || e.visualAcuityL || e.iopR || e.iopL).sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
    if (!rows.length) return React.createElement("div", {
      style: {
        color: C.muted,
        textAlign: "center",
        padding: 40
      }
    }, "لا توجد قياسات كافية للمقارنة");
    return React.createElement("div", {
      style: {
        overflowX: "auto",
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 14
      }
    }, React.createElement("table", {
      style: {
        width: "100%",
        borderCollapse: "collapse",
        fontSize: 10
      }
    }, React.createElement("thead", null, React.createElement("tr", null, ["التاريخ", "VA OD", "VA OS", "IOP OD", "IOP OS", "التشخيص"].map(h => React.createElement("th", {
      key: h,
      style: {
        padding: 9,
        color: C.accent,
        borderBottom: `1px solid ${C.border}`,
        whiteSpace: "nowrap"
      }
    }, h)))), React.createElement("tbody", null, rows.map((e, i) => React.createElement("tr", {
      key: e.id || i
    }, [e.date || "—", e.visualAcuityR || "—", e.visualAcuityL || "—", e.iopR || "—", e.iopL || "—", e.diagnosis || "—"].map((v, j) => React.createElement("td", {
      key: j,
      style: {
        padding: 8,
        color: j === 5 ? C.gold : C.text,
        borderBottom: `1px solid ${C.border}33`,
        whiteSpace: "nowrap"
      }
    }, v)))))));
  })()), tab === "exams" && React.createElement("div", null, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 14
    }
  }, React.createElement("span", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 14
    }
  }, "شيت الفحص (", exams.length, ")"), React.createElement(Btn, {
    small: true,
    onClick: () => setModal("addExam")
  }, "+ فحص جديد")), exams.length === 0 && React.createElement("div", {
    style: {
      color: C.muted,
      textAlign: "center",
      padding: 40,
      fontSize: 13
    }
  }, "No Examinations recorded"), exams.map(ex => React.createElement("div", {
    key: ex.id,
    style: {
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 16,
      padding: 14,
      marginBottom: 12
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10
    }
  }, React.createElement("div", null, React.createElement("div", {
    style: {
      color: C.accent,
      fontWeight: 700,
      fontSize: 13
    }
  }, ex.date), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11
    }
  }, ex.doctor)), React.createElement("div", {
    style: {
      display: "flex",
      gap: 6
    }
  }, React.createElement("div", {
    onClick: () => setModal({
      editExam: ex
    }),
    style: {
      background: C.accent + "22",
      borderRadius: 8,
      padding: "5px 10px",
      color: C.accent,
      fontSize: 11,
      cursor: "pointer"
    }
  }, "✏"), React.createElement("div", {
    onClick: () => setDelTarget({
      type: "exam",
      id: ex.id
    }),
    style: {
      background: C.danger + "22",
      borderRadius: 8,
      padding: "5px 10px",
      color: C.danger,
      fontSize: 11,
      cursor: "pointer"
    }
  }, "🗑"))), ex.chiefComplaint && React.createElement("div", {
    style: {
      background: C.bg,
      borderRadius: 10,
      padding: 10,
      marginBottom: 8
    }
  }, React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10,
      marginBottom: 3
    }
  }, "الشكوى"), React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 12
    }
  }, ex.chiefComplaint)), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 8
    }
  }, [["حدة إبصار ي", ex.visualAcuityR || "-"], ["حدة إبصار ش", ex.visualAcuityL || "-"], ["ضغط العين ي", ex.iopR ? ex.iopR + " mmHg" : "-"], ["ضغط العين ش", ex.iopL ? ex.iopL + " mmHg" : "-"]].map(([k, v]) => React.createElement("div", {
    key: k,
    style: {
      background: C.bg,
      borderRadius: 8,
      padding: "8px 10px"
    }
  }, React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10
    }
  }, k), React.createElement("div", {
    style: {
      color: C.teal,
      fontWeight: 700,
      fontSize: 14
    }
  }, v)))), ex.diagnosis && React.createElement("div", {
    style: {
      background: C.gold + "11",
      border: `1px solid ${C.gold}33`,
      borderRadius: 10,
      padding: 10,
      marginTop: 8
    }
  }, React.createElement("div", {
    style: {
      color: C.gold,
      fontSize: 11,
      fontWeight: 700,
      marginBottom: 3
    }
  }, "التشخيص"), React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 12
    }
  }, ex.diagnosis))))), tab === "requests" && React.createElement("div", null, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12
    }
  }, React.createElement("div", null, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 800,
      fontSize: 14
    }
  }, "🧪 Investigation Order"), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10,
      marginTop: 3
    }
  }, "إنشاء الطلب مباشرة من ملف المريض")), requests.length > 0 && React.createElement("span", {
    style: {
      background: C.gold + "22",
      color: C.gold,
      borderRadius: 8,
      padding: "4px 9px",
      fontSize: 10,
      fontWeight: 700
    }
  }, requests.length, " طلب")), React.createElement("div", {
    style: {
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 14,
      padding: 12,
      marginBottom: 14
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      gap: 7,
      alignItems: "center",
      marginBottom: 10
    }
  }, React.createElement("span", {
    style: {
      color: C.muted,
      fontSize: 11
    }
  }, "العين الافتراضية"), [["OU", "كلتا العينين"], ["OD", "اليمنى"], ["OS", "اليسرى"]].map(([v, l]) => React.createElement("button", {
    key: v,
    onClick: () => setRequestEye(v),
    style: {
      background: requestEye === v ? C.accent + "22" : "transparent",
      border: `1px solid ${requestEye === v ? C.accent : C.border}`,
      borderRadius: 8,
      padding: "5px 9px",
      color: requestEye === v ? C.accent : C.muted,
      fontSize: 10,
      fontWeight: 700
    }
  }, v))), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 8
    }
  }, allRequestTests.map(t => {
    const on = !!requestTests[t.id];
    const eye = requestTests[t.id] || requestEye;
    return React.createElement("div", {
      key: t.id,
      onClick: () => toggleRequestTest(t.id),
      style: {
        background: on ? C.accent + "12" : C.bg,
        border: `1px solid ${on ? C.accent : C.border}`,
        borderRadius: 10,
        padding: "9px 10px",
        cursor: "pointer",
        position: "relative"
      }
    }, React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 7
      }
    }, React.createElement("span", {
      style: {
        width: 18,
        height: 18,
        borderRadius: 5,
        border: `2px solid ${on ? C.accent : C.border}`,
        background: on ? C.accent : "transparent",
        color: C.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 10,
        fontWeight: 900
      }
    }, on ? "✓" : ""), React.createElement("span", {
      style: {
        color: C.text,
        fontWeight: 700,
        fontSize: 11
      }
    }, t.name)), React.createElement("div", {
      style: {
        color: C.muted,
        fontSize: 9,
        marginTop: 3,
        paddingRight: 25
      }
    }, t.name_ar), on && React.createElement("button", {
      onClick: e => {
        e.stopPropagation();
        cycleRequestEye(t.id);
      },
      style: {
        position: "absolute",
        left: 7,
        bottom: 7,
        background: C.teal + "22",
        border: `1px solid ${C.teal}44`,
        borderRadius: 6,
        color: C.teal,
        fontSize: 9,
        fontWeight: 800,
        padding: "2px 6px"
      }
    }, eye));
  })), React.createElement("textarea", {
    value: requestNotes,
    onChange: e => setRequestNotes(e.target.value),
    rows: 3,
    placeholder: "ملاحظات / سبب طلب الفحص / تعليمات خاصة...",
    style: {
      ...inp(),
      resize: "none",
      marginTop: 12,
      fontSize: 11
    }
  }), React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginTop: 10
    }
  }, React.createElement(Btn, {
    full: true,
    onClick: savePatientRadiologyRequest
  }, "🧪 Save Investigation Order"), React.createElement(Btn, {
    outline: true,
    onClick: () => {
      const html = getRadiologyHTML(requestTests, curPatient, requestNotes, primaryDoctor, allRequestTests, clinic);
      if (Object.keys(requestTests).length) printDoc(html);else alert("اختر الفحوصات أولاً");
    }
  }, "🖨️ طباعة")), requestSaved && React.createElement("div", {
    style: {
      marginTop: 9,
      background: C.success + "11",
      border: `1px solid ${C.success}33`,
      borderRadius: 9,
      padding: 8,
      color: C.success,
      fontSize: 11,
      fontWeight: 700
    }
  }, "✓ Investigation Order saved and linked to patient file")), requests.length > 0 && React.createElement("div", null, React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11,
      fontWeight: 700,
      marginBottom: 8
    }
  }, "الطلبات السابقة"), requests.slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))).map(r => React.createElement("div", {
    key: r.id,
    style: {
      background: C.card,
      border: `1px solid ${C.gold}33`,
      borderRadius: 12,
      padding: 11,
      marginBottom: 8
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      gap: 8
    }
  }, React.createElement("div", {
    style: {
      color: C.gold,
      fontWeight: 800,
      fontSize: 12
    }
  }, "🧪 Investigation Order"), React.createElement("span", {
    style: {
      color: C.muted,
      fontSize: 10
    }
  }, r.date, " · ", r.time || "")), React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 11,
      lineHeight: 1.8,
      marginTop: 6
    }
  }, (r.requestedTests || []).map(t => React.createElement("span", {
    key: t.id,
    style: {
      display: "inline-block",
      background: C.bg,
      border: `1px solid ${C.border}`,
      borderRadius: 7,
      padding: "3px 7px",
      margin: "2px 3px"
    }
  }, t.name, " · ", t.eye || "OU"))), r.notes && React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10,
      marginTop: 5
    }
  }, "📝 ", r.notes), React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 8
    }
  }, React.createElement("span", {
    style: {
      color: C.teal,
      fontSize: 10
    }
  }, "✓ محفوظ في الملف"), React.createElement("button", {
    onClick: () => printDoc(getRadiologyHTML(Object.fromEntries((r.requestedTests || []).map(t => [t.id, t.eye || "OU"])), curPatient, r.notes, primaryDoctor, allRequestTests, clinic)),
    style: {
      background: C.accent + "22",
      border: "none",
      borderRadius: 7,
      padding: "5px 9px",
      color: C.accent,
      fontSize: 10,
      fontWeight: 700
    }
  }, "🖨️ إعادة طباعة"))))), requests.length === 0 && React.createElement("div", {
    style: {
      color: C.muted,
      textAlign: "center",
      padding: 20,
      fontSize: 11
    }
  }, "No previous Investigation Orders for this patient"), imagingOrders.length > 0 && React.createElement("div", {
    style: {
      marginTop: 16
    }
  }, React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11,
      fontWeight: 700,
      marginBottom: 8
    }
  }, "حالة تنفيذ الطلبات"), imagingOrders.slice().sort((a, b) => String(b.date + b.time).localeCompare(String(a.date + a.time))).map(o => React.createElement("div", {
    key: o.id,
    style: {
      background: C.card,
      border: `1px solid ${o.status === "reported" ? C.success : C.border}`,
      borderRadius: 12,
      padding: 11,
      marginBottom: 8
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      gap: 8
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 800,
      fontSize: 11
    }
  }, "🩻 ", o.id), React.createElement(Tag, {
    label: IMAGING_ORDER_STATUSES[o.status] || o.status,
    color: o.status === "reported" ? C.success : o.status === "completed" ? C.teal : o.status === "cancelled" ? C.danger : C.gold
  })), React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 10,
      lineHeight: 1.7,
      marginTop: 5
    }
  }, (o.tests || []).map(t => React.createElement("span", {
    key: t.id,
    style: {
      display: "inline-block",
      margin: "2px 3px",
      background: C.bg,
      border: `1px solid ${C.border}`,
      borderRadius: 6,
      padding: "2px 6px"
    }
  }, t.name, " · ", t.eye || "OU"))), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 9,
      marginTop: 4
    }
  }, o.date, " · ", o.doctor || ""))))), tab === "treatment" && React.createElement("div", null, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 14,
      marginBottom: 14
    }
  }, "خطة العلاج"), exams.filter(e => e.treatmentPlan).length === 0 && React.createElement("div", {
    style: {
      color: C.muted,
      textAlign: "center",
      padding: 40,
      fontSize: 13
    }
  }, "أضف فحصاً يتضمن خطة علاج"), exams.filter(e => e.treatmentPlan).map(ex => React.createElement("div", {
    key: ex.id,
    style: {
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 16,
      padding: 14,
      marginBottom: 12
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      marginBottom: 12
    }
  }, React.createElement("span", {
    style: {
      color: C.accent,
      fontWeight: 700,
      fontSize: 13
    }
  }, ex.date), React.createElement("span", {
    style: {
      color: C.muted,
      fontSize: 11
    }
  }, ex.doctor)), React.createElement("div", {
    style: {
      background: C.success + "11",
      border: `1px solid ${C.success}33`,
      borderRadius: 12,
      padding: 12,
      marginBottom: 10
    }
  }, React.createElement(SecHead, {
    icon: "💊",
    label: "خطة العلاج",
    color: C.success
  }), React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 13,
      lineHeight: 1.8,
      whiteSpace: "pre-wrap"
    }
  }, ex.treatmentPlan)), ex.followUp && React.createElement("div", {
    style: {
      background: C.teal + "11",
      border: `1px solid ${C.teal}33`,
      borderRadius: 10,
      padding: 10,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8
    }
  }, React.createElement("span", {
    style: {
      color: C.muted,
      fontSize: 12
    }
  }, "موعد المتابعة"), React.createElement("span", {
    style: {
      color: C.teal,
      fontWeight: 700,
      fontSize: 13
    }
  }, "📅 ", ex.followUp)), ex.anteriorSegment && React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 6,
      marginTop: 8
    }
  }, React.createElement("div", {
    style: {
      background: C.bg,
      borderRadius: 10,
      padding: 10
    }
  }, React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10,
      marginBottom: 3
    }
  }, "القطعة الأمامية"), React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 12
    }
  }, ex.anteriorSegment)), ex.posteriorSegment && React.createElement("div", {
    style: {
      background: C.bg,
      borderRadius: 10,
      padding: 10
    }
  }, React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10,
      marginBottom: 3
    }
  }, "القطعة الخلفية"), React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 12
    }
  }, ex.posteriorSegment))), ex.notes && React.createElement("div", {
    style: {
      background: C.border,
      borderRadius: 10,
      padding: 10,
      marginTop: 8
    }
  }, React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10,
      marginBottom: 3
    }
  }, "ملاحظات"), React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 12
    }
  }, ex.notes))))), tab === "rx" && React.createElement("div", null, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 14
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 14
    }
  }, "الوصفات (", rxList.length, ")"), React.createElement("div", {
    onClick: () => setModal("addRx"),
    style: {
      background: `linear-gradient(135deg,${C.accent},${C.teal})`,
      borderRadius: 10,
      padding: "7px 14px",
      color: C.bg,
      fontSize: 12,
      fontWeight: 700,
      cursor: "pointer"
    }
  }, "+ وصفة جديدة")), rxList.length === 0 && React.createElement("div", {
    style: {
      color: C.muted,
      textAlign: "center",
      padding: 40,
      fontSize: 13
    }
  }, "لا توجد وصفات لهذا المريض"), rxList.map(rx => React.createElement("div", {
    key: rx.id,
    style: {
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 16,
      padding: 14,
      marginBottom: 12
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10
    }
  }, React.createElement("div", {
    style: {
      color: C.accent,
      fontWeight: 700,
      fontSize: 13
    }
  }, rx.date, " · ", rx.eye), React.createElement("div", {
    style: {
      display: "flex",
      gap: 6
    }
  }, React.createElement("div", {
    onClick: () => setModal({
      editRx: rx
    }),
    style: {
      background: C.accent + "22",
      borderRadius: 8,
      padding: "5px 10px",
      color: C.accent,
      fontSize: 11,
      cursor: "pointer",
      fontWeight: 600
    }
  }, "✏ تعديل"), React.createElement("div", {
    onClick: () => {
      if (window.confirm("نقل هذه الوصفة إلى سلة المحذوفات؟")) {
        trashPut("iapp_prescriptions", rx, "روشتة");
        logAudit("حذف روشتة", (rx.date || "") + " · " + (curPatient && curPatient.name || ""));
        const updated = (allRx || []).filter(r => r.id !== rx.id);
        if (onSaveRx) onSaveRx(updated);
      }
    },
    style: {
      background: C.danger + "22",
      borderRadius: 8,
      padding: "5px 10px",
      color: C.danger,
      fontSize: 11,
      cursor: "pointer",
      fontWeight: 600
    }
  }, "🗑"))), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 8,
      marginBottom: 8
    }
  }, [["SPH يمنى", rx.sphR], ["CYL يمنى", rx.cylR], ["AXIS يمنى", rx.axisR], ["SPH يسرى", rx.sphL], ["CYL يسرى", rx.cylL], ["AXIS يسرى", rx.axisL]].map(([k, v]) => React.createElement("div", {
    key: k,
    style: {
      background: C.bg,
      borderRadius: 8,
      padding: "6px 10px"
    }
  }, React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10
    }
  }, k), React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 600,
      fontSize: 13
    }
  }, v || "-")))), rx.add && rx.add !== "0.00" && React.createElement("div", {
    style: {
      background: C.teal + "11",
      borderRadius: 8,
      padding: "6px 10px",
      marginBottom: 8
    }
  }, React.createElement("span", {
    style: {
      color: C.muted,
      fontSize: 11
    }
  }, "ADD: "), React.createElement("span", {
    style: {
      color: C.teal,
      fontWeight: 700
    }
  }, rx.add), rx.ipd && React.createElement(React.Fragment, null, React.createElement("span", {
    style: {
      color: C.muted,
      fontSize: 11,
      marginRight: 12
    }
  }, "IPD: "), React.createElement("span", {
    style: {
      color: C.teal,
      fontWeight: 700
    }
  }, rx.ipd))), rx.medicines && React.createElement("div", {
    style: {
      background: C.gold + "11",
      border: `1px solid ${C.gold}33`,
      borderRadius: 10,
      padding: 10,
      marginBottom: 8
    }
  }, React.createElement("div", {
    style: {
      color: C.gold,
      fontSize: 11,
      fontWeight: 700,
      marginBottom: 3
    }
  }, "💊 الأدوية"), React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 12,
      whiteSpace: "pre-line"
    }
  }, rx.medicines)), rx.notes && React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11,
      marginBottom: 8,
      fontStyle: "italic"
    }
  }, rx.notes), React.createElement("div", {
    onClick: () => setModal({
      printRx: rx
    }),
    style: {
      background: C.purple + "22",
      borderRadius: 8,
      padding: "7px 0",
      color: C.purple,
      fontSize: 11,
      fontWeight: 700,
      cursor: "pointer",
      textAlign: "center"
    }
  }, "🖨️ طباعة الوصفة / كشف النظارة")))), tab === "images" && React.createElement("div", null, React.createElement("div", {
    style: {
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      padding: 10,
      marginBottom: 12
    }
  }, React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 8
    }
  }, React.createElement(Field, {
    label: "نوع الصورة"
  }, React.createElement("select", {
    style: inp(),
    value: imageType,
    onChange: e => setImageType(e.target.value)
  }, ["OCT", "OCTA", "Fundus Photography", "FFA", "Optos UWF", "Visual Field", "Pentacam", "B-Scan", "UBM", "Other"].map(x => React.createElement("option", {
    key: x
  }, x)))), React.createElement(Field, {
    label: "العين"
  }, React.createElement("select", {
    style: inp(),
    value: imageEye,
    onChange: e => setImageEye(e.target.value)
  }, React.createElement("option", {
    value: "OU"
  }, "OU — كلتا العينين"), React.createElement("option", {
    value: "OD"
  }, "OD — اليمنى"), React.createElement("option", {
    value: "OS"
  }, "OS — اليسرى")))), React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      overflowX: "auto",
      marginTop: 6
    }
  }, ["الكل", "OCT", "OCTA", "Fundus Photography", "FFA", "Optos UWF", "Visual Field", "Pentacam", "B-Scan", "UBM", "Other"].map(x => React.createElement("button", {
    key: x,
    onClick: () => setImageFilter(x),
    style: {
      whiteSpace: "nowrap",
      background: imageFilter === x ? C.accent + "22" : "transparent",
      border: `1px solid ${imageFilter === x ? C.accent : C.border}`,
      borderRadius: 8,
      padding: "5px 8px",
      color: imageFilter === x ? C.accent : C.muted,
      fontSize: 10,
      cursor: "pointer"
    }
  }, x)))), React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 14
    }
  }, React.createElement("span", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 14
    }
  }, "الإشعاعات والصور (", images.length, ")"), React.createElement("label", {
    style: {
      background: uploadProgress ? C.muted : `linear-gradient(135deg,${C.accent},${C.teal})`,
      borderRadius: 10,
      padding: "7px 14px",
      color: C.bg,
      fontSize: 12,
      fontWeight: 700,
      cursor: uploadProgress ? "not-allowed" : "pointer",
      pointerEvents: uploadProgress ? "none" : "auto"
    }
  }, "📎 رفع صورة", React.createElement("input", {
    type: "file",
    accept: "image/*",
    multiple: true,
    onChange: handleImgUpload,
    style: {
      display: "none"
    },
    disabled: !!uploadProgress
  }))), uploadProgress && React.createElement("div", {
    style: {
      background: C.card,
      border: `1px solid ${C.accent}44`,
      borderRadius: 12,
      padding: "12px 14px",
      marginBottom: 14
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      marginBottom: 8
    }
  }, React.createElement("span", {
    style: {
      color: C.accent,
      fontSize: 12,
      fontWeight: 600
    }
  }, "⬆ جاري الرفع..."), React.createElement("span", {
    style: {
      color: C.muted,
      fontSize: 11
    }
  }, uploadProgress.name.slice(0, 25))), React.createElement("div", {
    style: {
      background: C.border,
      borderRadius: 99,
      height: 6,
      overflow: "hidden"
    }
  }, React.createElement("div", {
    style: {
      background: `linear-gradient(90deg,${C.accent},${C.teal})`,
      width: uploadProgress.pct + "%",
      height: "100%",
      borderRadius: 99,
      transition: "width 0.3s"
    }
  }))), imgError && React.createElement("div", {
    style: {
      background: C.danger + "11",
      border: `1px solid ${C.danger}44`,
      borderRadius: 10,
      padding: "10px 14px",
      marginBottom: 12,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center"
    }
  }, React.createElement("span", {
    style: {
      color: C.danger,
      fontSize: 12
    }
  }, "⚠ ", imgError), React.createElement("span", {
    onClick: () => setImgError(null),
    style: {
      color: C.danger,
      cursor: "pointer",
      fontSize: 18
    }
  }, "×")), imgLoading && images.length === 0 && React.createElement("div", {
    style: {
      textAlign: "center",
      padding: "40px 20px"
    }
  }, React.createElement("div", {
    style: {
      fontSize: 32,
      marginBottom: 10
    }
  }, "⏳"), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 13
    }
  }, "جاري التحميل من السيرفر...")), !imgLoading && images.length === 0 && !uploadProgress && React.createElement("div", {
    style: {
      textAlign: "center",
      padding: "40px 20px"
    }
  }, React.createElement("img", {
    src: XRAY_ICON,
    style: {
      width: 72,
      height: 72,
      margin: "0 auto 12px",
      display: "block",
      opacity: 0.7
    }
  }), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 13,
      marginBottom: 6
    }
  }, "لا توجد إشعاعات مرفوعة بعد"), React.createElement("div", {
    style: {
      color: C.border,
      fontSize: 11
    }
  }, "اضغط \"رفع صورة\" لإضافة إشعاعات أو صور الفحص")), React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, images.filter(img => imageFilter === "الكل" || img.type === imageFilter).map(img => React.createElement("div", {
    key: img.id,
    style: {
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 16,
      overflow: "hidden"
    }
  }, img.src ? React.createElement("div", {
    onClick: () => setViewImg(img),
    style: {
      cursor: "pointer",
      position: "relative"
    }
  }, React.createElement("img", {
    src: img.src,
    alt: img.name,
    style: {
      width: "100%",
      maxHeight: 200,
      objectFit: "cover",
      display: "block"
    }
  }), React.createElement("div", {
    style: {
      position: "absolute",
      top: 8,
      left: 8,
      background: "rgba(0,0,0,0.6)",
      borderRadius: 8,
      padding: "3px 10px",
      color: "#fff",
      fontSize: 10
    }
  }, "🔍 عرض كامل"), React.createElement("div", {
    style: {
      position: "absolute",
      top: 8,
      right: 8,
      background: C.accent + "cc",
      borderRadius: 8,
      padding: "3px 10px",
      color: C.bg,
      fontSize: 10,
      fontWeight: 700
    }
  }, img.date)) : React.createElement("div", {
    style: {
      height: 80,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: C.border + "33"
    }
  }, React.createElement("span", {
    style: {
      color: C.muted,
      fontSize: 11
    }
  }, "🩻 ", img.name)), React.createElement("div", {
    style: {
      padding: "10px 12px"
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 12,
      fontWeight: 600,
      marginBottom: 6,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  }, img.name), React.createElement("textarea", {
    value: img.notes || "",
    onChange: e => updateImgNotes(img.id, e.target.value),
    onBlur: e => updateImgNotes(img.id, e.target.value),
    placeholder: "ملاحظات (نوع الفحص، النتيجة...)",
    rows: 2,
    style: {
      ...inp(),
      resize: "none",
      fontSize: 11,
      marginBottom: 8
    }
  }), React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, img.src && React.createElement("div", {
    onClick: () => setViewImg(img),
    style: {
      flex: 1,
      background: C.teal + "22",
      borderRadius: 8,
      padding: "7px 0",
      color: C.teal,
      fontSize: 11,
      fontWeight: 700,
      cursor: "pointer",
      textAlign: "center"
    }
  }, "🔍 عرض"), img.src && React.createElement("div", {
    onClick: () => analyzeImage(img),
    style: {
      flex: 1,
      background: C.purple + "22",
      borderRadius: 8,
      padding: "7px 0",
      color: C.purple,
      fontSize: 11,
      fontWeight: 700,
      cursor: "pointer",
      textAlign: "center"
    }
  }, aiAnalysis[img.id]?.loading ? "⏳ جاري التحليل..." : "🤖 تحليل AI"), React.createElement("div", {
    onClick: () => {
      if (window.confirm("حذف الصورة من القائمة؟")) delImage(img.id);
    },
    style: {
      flex: img.src ? 0 : 1,
      background: C.danger + "22",
      borderRadius: 8,
      padding: "7px 12px",
      color: C.danger,
      fontSize: 11,
      cursor: "pointer",
      textAlign: "center"
    }
  }, "🗑 حذف")), aiAnalysis[img.id]?.result && React.createElement("div", {
    style: {
      marginTop: 10,
      background: `linear-gradient(135deg,${C.purple}15,${C.accent}10)`,
      border: `1px solid ${C.purple}44`,
      borderRadius: 12,
      padding: 12
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      marginBottom: 8
    }
  }, React.createElement("div", {
    style: {
      width: 22,
      height: 22,
      borderRadius: 6,
      background: `linear-gradient(135deg,${C.purple},${C.accent})`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 11
    }
  }, "🤖"), React.createElement("span", {
    style: {
      color: C.purple,
      fontWeight: 700,
      fontSize: 12
    }
  }, "تحليل الذكاء الاصطناعي"), React.createElement("span", {
    style: {
      marginRight: "auto",
      background: C.purple + "22",
      color: C.purple,
      borderRadius: 6,
      padding: "1px 7px",
      fontSize: 9,
      fontWeight: 700
    }
  }, "للمساعدة فقط")), React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 12,
      lineHeight: 1.7,
      whiteSpace: "pre-wrap"
    }
  }, aiAnalysis[img.id].result), React.createElement("div", {
    onClick: () => setAiAnalysis(prev => ({
      ...prev,
      [img.id]: null
    })),
    style: {
      marginTop: 8,
      color: C.muted,
      fontSize: 10,
      cursor: "pointer",
      textAlign: "left"
    }
  }, "✕ إغلاق التحليل")), aiAnalysis[img.id]?.error && React.createElement("div", {
    style: {
      marginTop: 8,
      background: C.danger + "11",
      border: `1px solid ${C.danger}33`,
      borderRadius: 10,
      padding: "8px 12px",
      color: C.danger,
      fontSize: 11
    }
  }, aiAnalysis[img.id].error))))), images.length > 0 && React.createElement("div", {
    style: {
      background: C.accent + "11",
      border: `1px solid ${C.accent}22`,
      borderRadius: 10,
      padding: "10px 14px",
      marginTop: 8,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center"
    }
  }, React.createElement("span", {
    style: {
      color: C.muted,
      fontSize: 11
    }
  }, "☁ محفوظة على Cloudinary"), React.createElement("span", {
    style: {
      color: C.accent,
      fontSize: 11,
      fontWeight: 700
    }
  }, images.length, " صورة")))), viewImg && React.createElement("div", {
    style: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.96)",
      zIndex: 600,
      display: "flex",
      flexDirection: "column"
    },
    onClick: () => setViewImg(null)
  }, React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "12px 16px",
      background: "rgba(0,0,0,0.6)"
    }
  }, React.createElement("div", null, React.createElement("div", {
    style: {
      color: "#fff",
      fontWeight: 700,
      fontSize: 13
    }
  }, viewImg.name), React.createElement("div", {
    style: {
      color: "#aaa",
      fontSize: 11
    }
  }, viewImg.date)), React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      alignItems: "center"
    }
  }, React.createElement("a", {
    href: viewImg.src,
    download: viewImg.name,
    onClick: e => e.stopPropagation(),
    style: {
      background: C.accent + "33",
      borderRadius: 8,
      padding: "6px 12px",
      color: C.accent,
      fontSize: 11,
      fontWeight: 700,
      textDecoration: "none"
    }
  }, "⬇ تحميل"), React.createElement("span", {
    onClick: () => setViewImg(null),
    style: {
      color: "#fff",
      fontSize: 28,
      cursor: "pointer",
      lineHeight: 1,
      padding: "0 4px"
    }
  }, "×"))), React.createElement("div", {
    style: {
      flex: 1,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 8,
      overflow: "auto"
    },
    onClick: () => setViewImg(null)
  }, React.createElement("img", {
    src: viewImg.src,
    alt: viewImg.name,
    style: {
      maxWidth: "100%",
      maxHeight: "100%",
      objectFit: "contain",
      borderRadius: 8
    }
  })), viewImg.notes && React.createElement("div", {
    style: {
      padding: "10px 16px",
      background: "rgba(0,0,0,0.7)",
      color: "#ccc",
      fontSize: 12,
      textAlign: "right"
    }
  }, "📝 ", viewImg.notes)), modal === "editPatient" && React.createElement(Modal, {
    title: "تعديل الملف الطبي",
    onClose: () => setModal(null)
  }, React.createElement(PatientEditForm, {
    patient: curPatient,
    onSave: handlePatientSave,
    onClose: () => setModal(null)
  })), modal === "addRx" && React.createElement(Modal, {
    title: "وصفة جديدة",
    onClose: () => setModal(null)
  }, React.createElement(RxForm, {
    patients: [curPatient],
    doctorNames: doctorNames,
    onSave: rx => {
      const updated = [...(allRx || []), {
        ...rx,
        id: Date.now(),
        patientId: curPatient.id,
        patient: curPatient.name
      }];
      if (onSaveRx) onSaveRx(updated);
      setModal(null);
    },
    onClose: () => setModal(null)
  })), modal && modal.editRx && React.createElement(Modal, {
    title: "تعديل الوصفة",
    onClose: () => setModal(null)
  }, React.createElement(RxForm, {
    patients: [curPatient],
    doctorNames: doctorNames,
    initial: modal.editRx,
    onSave: rx => {
      const updated = (allRx || []).map(r => r.id === rx.id ? {
        ...rx,
        patientId: curPatient.id,
        patient: curPatient.name
      } : r);
      if (onSaveRx) onSaveRx(updated);
      setModal(null);
    },
    onClose: () => setModal(null)
  })), modal === "addVisit" && React.createElement(Modal, {
    title: "زيارة جديدة",
    onClose: () => setModal(null)
  }, React.createElement(VisitForm, {
    doctorNames: doctorNames,
    prices: prices,
    patientId: curPatient.id,
    onSave: v => {
      onSaveVisit(v);
      setModal(null);
    },
    onClose: () => setModal(null)
  })), modal && modal.editVisit && React.createElement(Modal, {
    title: "تعديل الزيارة",
    onClose: () => setModal(null)
  }, React.createElement(VisitForm, {
    doctorNames: doctorNames,
    prices: prices,
    initial: modal.editVisit,
    patientId: curPatient.id,
    onSave: v => {
      onSaveVisit(v);
      setModal(null);
    },
    onClose: () => setModal(null)
  })), modal === "addExam" && React.createElement(Modal, {
    title: "فحص جديد",
    onClose: () => setModal(null)
  }, React.createElement(ExamForm, {
    doctorNames: doctorNames,
    patientId: curPatient.id,
    onSave: e => {
      onSaveExam(e);
      setModal(null);
    },
    onClose: () => setModal(null)
  })), modal && modal.editExam && React.createElement(Modal, {
    title: "تعديل الفحص",
    onClose: () => setModal(null)
  }, React.createElement(ExamForm, {
    doctorNames: doctorNames,
    initial: modal.editExam,
    patientId: curPatient.id,
    onSave: e => {
      onSaveExam(e);
      setModal(null);
    },
    onClose: () => setModal(null)
  })), modal && modal.printRx && React.createElement(PrintModal, {
    rx: modal.printRx,
    patient: curPatient,
    primaryDoctor: primaryDoctor,
    clinic: {},
    onClose: () => setModal(null)
  }), delTarget && React.createElement(Confirm, {
    msg: `هل تريد حذف هذا ${delTarget.type === "visit" ? "السجل" : "الفحص"} نهائياً؟`,
    onOk: () => {
      delTarget.type === "visit" ? onDelVisit(delTarget.id) : onDelExam(delTarget.id);
      setDelTarget(null);
    },
    onNo: () => setDelTarget(null)
  }));
}
function PatientForm({
  initial,
  onSave,
  onClose
}) {
  const blank = {
    name: "",
    age: "",
    phone: "",
    gender: "ذكر",
    bloodType: "O+",
    address: "",
    lastVisit: localISO(),
    condition: "",
    status: "مكتمل",
    history: "",
    allergies: "",
    occupation: "",
    emergencyContact: ""
  };
  const [f, setF] = useState(initial ? {
    ...initial
  } : blank);
  const s = k => e => setF(v => ({
    ...v,
    [k]: e.target.value
  }));
  return React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, React.createElement(Field, {
    label: "الاسم الكامل"
  }, React.createElement("input", {
    style: inp(),
    value: f.name,
    onChange: s("name"),
    placeholder: "اسم المريض"
  })), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10
    }
  }, React.createElement(Field, {
    label: "العمر"
  }, React.createElement("input", {
    style: inp(),
    type: "number",
    value: f.age,
    onChange: s("age"),
    placeholder: "سنة"
  })), React.createElement(Field, {
    label: "الجنس"
  }, React.createElement("select", {
    style: inp(),
    value: f.gender,
    onChange: s("gender")
  }, ["ذكر", "أنثى"].map(g => React.createElement("option", {
    key: g
  }, g))))), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10
    }
  }, React.createElement(Field, {
    label: "الهاتف"
  }, React.createElement("input", {
    style: inp(),
    value: f.phone,
    onChange: s("phone"),
    placeholder: "01xxxxxxxxx"
  })), React.createElement(Field, {
    label: "فصيلة الدم"
  }, React.createElement("select", {
    style: inp(),
    value: f.bloodType,
    onChange: s("bloodType")
  }, ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map(b => React.createElement("option", {
    key: b
  }, b))))), React.createElement(Field, {
    label: "العنوان"
  }, React.createElement("input", {
    style: inp(),
    value: f.address,
    onChange: s("address"),
    placeholder: "المدينة"
  })), React.createElement(Field, {
    label: "التشخيص"
  }, React.createElement("input", {
    style: inp(),
    value: f.condition,
    onChange: s("condition"),
    placeholder: "قصر نظر، ماء أبيض..."
  })), React.createElement(Field, {
    label: "التاريخ المرضي"
  }, React.createElement("input", {
    style: inp(),
    value: f.history || "",
    onChange: s("history"),
    placeholder: "سكري، ضغط..."
  })), React.createElement(Field, {
    label: "الحساسية للأدوية"
  }, React.createElement("input", {
    style: inp(),
    value: f.allergies || "",
    onChange: s("allergies"),
    placeholder: "بنسلين، سلفا..."
  })), React.createElement(Field, {
    label: "آخر زيارة"
  }, React.createElement("input", {
    style: inp(),
    type: "date",
    value: f.lastVisit,
    onChange: s("lastVisit")
  })), React.createElement(Field, {
    label: "الحالة"
  }, React.createElement("select", {
    style: inp(),
    value: f.status,
    onChange: s("status")
  }, ["مكتمل", "متابعة", "طارئ"].map(x => React.createElement("option", {
    key: x
  }, x)))), React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      marginTop: 8
    }
  }, React.createElement(Btn, {
    outline: true,
    full: true,
    onClick: onClose
  }, "إلغاء"), React.createElement(Btn, {
    full: true,
    onClick: () => f.name && onSave({
      ...f,
      age: Number(f.age)
    })
  }, "حفظ")));
}
function Patients({
  patients,
  setPatients,
  exams,
  setExams,
  prescriptions,
  setRx,
  visits,
  setVisits,
  doctorNames = [],
  primaryDoctor,
  prices = [],
  clinic,
  initOpenId,
  initNewName,
  onInitDone,
  session,
  customTests = []
}) {
  const [search, setSearch] = useState(initNewName || "");
  const [modal, setModal] = useState(null);
  const [openFile, setOpenFile] = useState(null);
  const sorted = [...patients].sort((a, b) => (b.id || 0) - (a.id || 0));
  const q = String(search || "").trim();
  const qn = normArabic(q),
    qd = q.replace(/\D/g, "");
  const filtered = !q ? sorted : sorted.filter(p => normArabic(p.name).includes(qn) || normArabic(p.condition).includes(qn) || String(p.patientCode || "").toUpperCase().includes(q.toUpperCase()) || !!qd && String(p.patientCode || "").replace(/\D/g, "").includes(qd) || !!qd && normPhone(p.phone).includes(qd));
  const isNewToday = p => p.id && Date.now() - p.id < 86400000;
  useEffect(() => {
    if (initOpenId) {
      setOpenFile(initOpenId);
      if (onInitDone) onInitDone();
    } else if (initNewName) {
      setSearch(initNewName);
      if (onInitDone) onInitDone();
    }
  }, []);
  const updP = f => setPatients(patients.map(p => p.id === f.id ? f : p));
  const addP = f => {
    const newP = {
      ...f,
      id: Date.now(),
      patientCode: genCode(patients)
    };
    setPatients([newP, ...patients]);
  };
  const delP = async id => {
    const rec = patients.find(p => p.id === id);
    await trashPut("iapp_patients", rec, "مريض: " + (rec && rec.name || id));
    setPatients(patients.filter(p => p.id !== id));
    logAudit("حذف مريض", rec && rec.patientCode + " · " + rec.name || id);
  };
  // Phase 30: every clinical examination must belong to a visit/encounter.
  // Keep a legacy visit shadow record for backward-compatible UI/counts, while
  // the Core visit remains the source of truth for the clinical relationship.
  const ensureLegacyVisitShadow = async ({ patientId, date, doctor, type, complaint, notes, coreVisitId = null, shadowId = null }) => {
    if (!patientId) return null;
    const pid = Number(patientId);
    const day = String(date || localISO()).slice(0, 10);
    const doc = String(doctor || "").trim();
    // Phase 33 fix (M1): only reuse a same-day visit by patient+date when the doctor
    // actually matches (or both sides are genuinely blank) — matching on "either side
    // is blank" could silently attach an examination to an unrelated visit.
    const existing = (coreVisitId && visits.find(v => String(v._coreId || "") === String(coreVisitId))) ||
      (shadowId && visits.find(v => String(v.id) === String(shadowId))) ||
      visits.find(v => Number(v.patientId) === pid && String(v.date || "").slice(0, 10) === day &&
        ((!doc && !String(v.doctor || "").trim()) || (!!doc && String(v.doctor || "").trim() === doc)));
    const rec = existing ? {
      ...existing,
      patientId: pid,
      date: existing.date || day,
      doctor: existing.doctor || doc,
      type: existing.type || type || "clinic",
      complaint: existing.complaint || complaint || "",
      notes: existing.notes || notes || "",
      _coreId: coreVisitId || existing?._coreId || null,
      _autoFromExamination: true
    } : {
      id: shadowId || `core-visit:${coreVisitId || Date.now()}`,
      patientId: pid,
      date: day,
      type: type || "clinic",
      doctor: doc,
      complaint: complaint || "",
      result: "",
      notes: notes || "زيارة تلقائية مرتبطة بالفحص",
      cost: 0,
      paid: false,
      nextVisit: "",
      _coreId: coreVisitId || null,
      _autoFromExamination: true
    };
    const next = existing ? visits.map(v => v.id === existing.id ? rec : v) : [...visits, rec];
    await setVisits(next);
    return rec;
  };

  const saveExam = async f => {
    const ex = exams.find(e => e.id === f.id);
    const next = ex ? exams.map(e => e.id === f.id ? f : e) : [...exams, f];
    const legacyResult = await setExams(next);
    let coreSynced = false;
    let coreError = null;
    // Phase 33 fix (H1/M4): resolve the Core visit id first, then write the legacy
    // visit shadow exactly ONCE below. Calling ensureLegacyVisitShadow twice (before
    // and after the Core sync) read `visits` from a stale closure both times, so the
    // second call could silently discard a concurrent update to the same array
    // (lost-update race) — and it always cost a second, unnecessary sync round-trip.
    let visitId = null;
    try {
      const sb = getSB();
      if (sb && !offlineNow()) {
        const { data: syncedVisitId, error } = await iappRpc(sb, "iapp_sync_examination_core", {
          p_exam: f,
          p_patient_code: patients.find(p => p.id === f.patientId)?.patientCode || ""
        });
        if (error) throw error;
        coreSynced = true;

        // Phase 18: use the visit id returned by the Core write-through RPC.
        // This avoids an extra read and keeps diagnosis/treatment/follow-up linked to the same visit.
        const legacyVisitId = `exam:${f.id}`;
        visitId = syncedVisitId || null;
        if (!visitId) visitId = (await sb.from("iapp_visits_core").select("id").eq("legacy_id", legacyVisitId).maybeSingle()).data?.id || null;
        if (visitId) {
          if (String(f.diagnosis || "").trim()) {
            const { error: e1 } = await iappRpc(sb, "iapp_create_diagnosis_core", {
              p_visit_id: visitId, p_diagnosis: String(f.diagnosis).trim(), p_laterality: null,
              p_is_primary: true, p_status: "active", p_notes: null
            });
            if (e1) throw e1;
          }
          if (String(f.treatmentPlan || "").trim()) {
            const { error: e2 } = await iappRpc(sb, "iapp_create_treatment_core", {
              p_visit_id: visitId, p_treatment: String(f.treatmentPlan).trim(), p_eye: null,
              p_instructions: null, p_notes: null
            });
            if (e2) throw e2;
          }
        }
        if (String(f.followUp || "").trim()) {
          const { error: e3 } = await iappRpc(sb, "iapp_create_followup_core", {
            p_patient_id: Number(f.patientId), p_followup_date: String(f.followUp).slice(0, 10),
            p_visit_id: visitId, p_reason: "متابعة", p_notes: null, p_status: "planned",
            p_doctor_name: f.doctor || ""
          });
          if (e3) throw e3;
        }
      } else {
        coreError = "offline";
      }
    } catch (e) {
      coreError = e?.message || String(e);
      console.warn("[core examination sync]", e);
    }
    // Phase 30: an examination itself establishes a clinical encounter locally,
    // even if Core/Supabase is temporarily unavailable — written once, with whichever
    // coreVisitId we ended up resolving (or null if Core sync didn't happen).
    await ensureLegacyVisitShadow({
      patientId: f.patientId, date: f.date, doctor: f.doctor, type: f.type || "clinic",
      complaint: f.chiefComplaint || f.complaint || "", notes: f.notes || "",
      coreVisitId: visitId,
      shadowId: `exam-visit:${f.id}`
    });
    if (!coreSynced && coreError && legacyResult?.queued !== true) {
      console.warn("Examination saved in legacy store; Core sync pending", coreError);
    }
    return { legacyResult, coreSynced, coreError };
  };
  const saveRadiologyRequest = async rec => {
    const remote = await sbGet("iapp_exams");
    const base = Array.isArray(remote) ? remote : exams;
    const next = base.some(e => e.id === rec.id) ? base.map(e => e.id === rec.id ? rec : e) : [...base, rec];
    await setExams(next);
    // Investigation requests are clinical events too: create/link a visit when possible.
    try {
      const sb = getSB();
      if (sb && !offlineNow() && rec.patientId) {
        let visitId = rec.coreVisitId || null;
        if (!visitId) {
          const { data, error } = await createClinicalVisitCore(sb, {
            p_patient_id: Number(rec.patientId),
            p_appointment_id: null,
            p_doctor_name: rec.doctor || primaryDoctor?.name || "",
            p_visit_date: String(rec.date || localISO()).slice(0, 10),
            p_visit_type: "investigation",
            p_chief_complaint: rec.complaint || "",
            p_clinical_summary: "طلب فحص/أشعة",
            p_notes: rec.notes || "",
            p_status: "completed"
          }, `radiology:${rec.id}`);
          if (error) throw error;
          visitId = data || null;
        }
        if (visitId) await ensureLegacyVisitShadow({
          patientId: rec.patientId,
          date: rec.date || localISO(),
          doctor: rec.doctor || primaryDoctor?.name || "",
          type: "investigation",
          complaint: rec.complaint || "",
          notes: rec.notes || "طلب فحص/أشعة",
          coreVisitId: visitId,
          shadowId: `radiology-visit:${rec.id}`
        });
      }
    } catch (e) {
      console.warn("[clinical visit for investigation]", e?.message || e);
    }
  };
  const delExam = async id => {
    const rec = exams.find(e => e.id === id);
    await trashPut("iapp_exams", rec, "فحص/طلب أشعة");
    setExams(exams.filter(e => e.id !== id));
    logAudit("حذف فحص", rec && rec.date || id);
  };
  const saveVisit = async f => {
    const ex = visits.find(v => v.id === f.id);
    const next = ex ? visits.map(v => v.id === f.id ? f : v) : [...visits, f];
    setVisits(next);
    try {
      const sb = getSB();
      if (sb && !offlineNow()) {
        const patient = patients.find(p => p.id === f.patientId);
        const { error } = await iappRpc(sb, "iapp_sync_visit_core", {
          p_visit: f, p_patient_code: patient?.patientCode || ""
        });
        if (error) throw error;
      }
    } catch (e) {
      console.warn("[core visit sync]", e?.message || e);
    }
  };
  const saveRx = async updated => {
    const old = prescriptions || [];
    const changed = (updated || []).find(r => {
      const prev = old.find(x => x.id === r.id);
      return !prev || JSON.stringify(prev) !== JSON.stringify(r);
    });
    const legacyResult = await setRx(updated || []);
    if (changed && !offlineNow()) {
      try {
        const sb = getSB();
        if (sb) {
          let coreVisitId = changed._coreVisitId || null;
          if (!coreVisitId) {
            const { data: visitId, error: visitError } = await createClinicalVisitCore(sb, {
              p_patient_id: Number(changed.patientId),
              p_appointment_id: null,
              p_doctor_name: changed.doctor || primaryDoctor?.name || "",
              p_visit_date: String(changed.date || localISO()).slice(0, 10),
              p_visit_type: "prescription",
              p_chief_complaint: "",
              p_clinical_summary: "Prescription",
              p_notes: changed.notes || "",
              p_status: "completed"
            }, `rx:${changed.id}`);
            if (visitError) throw visitError;
            coreVisitId = visitId || null;
          }
          if (coreVisitId) {
            await ensureLegacyVisitShadow({
              patientId: changed.patientId,
              date: changed.date || localISO(),
              doctor: changed.doctor || primaryDoctor?.name || "",
              type: "prescription",
              complaint: "",
              notes: changed.notes || "روشتة مرتبطة بالزيارة",
              coreVisitId,
              shadowId: `rx-visit:${changed.id}`
            });
          }
          const { error } = await iappRpc(sb, "iapp_create_prescription_core", rxCoreParams(changed, coreVisitId, localISO()));
          if (error) console.warn("[core prescription sync]", error);
        }
      } catch (e) {
        console.warn("[core prescription sync]", e);
      }
    }
    return legacyResult;
  };
  const delVisit = async id => {
    const rec = visits.find(v => v.id === id);
    await trashPut("iapp_visits", rec, "زيارة");
    setVisits(visits.filter(v => v.id !== id));
    logAudit("حذف زيارة", rec && rec.date + " · " + (rec.patient || "") || id);
  };
  if (openFile) {
    const p = patients.find(p => p.id === openFile);
    if (!p) {
      setOpenFile(null);
      return null;
    }
    return React.createElement(PatientFile, {
      patient: p,
      allExams: exams,
      allRx: prescriptions,
      allVisits: visits,
      onClose: () => setOpenFile(null),
      onUpdatePatient: f => {
        updP(f);
      },
      onSaveExam: saveExam,
      onDelExam: delExam,
      onSaveVisit: saveVisit,
      onDelVisit: delVisit,
      onSaveRx: updated => {
        saveRx(updated);
      },
      onSaveRadiologyRequest: saveRadiologyRequest,
      doctorNames: doctorNames,
      primaryDoctor: primaryDoctor,
      prices: prices,
      clinic: clinic,
      customTests: customTests
    });
  }
  return React.createElement("div", {
    style: {
      padding: "16px 16px 90px"
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 16
    }
  }, React.createElement("span", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 16
    }
  }, "المرضى (", patients.length, ")"), React.createElement(Btn, {
    small: true,
    onClick: () => setModal("add")
  }, "+ مريض جديد")), React.createElement("div", {
    style: {
      background: C.card,
      border: `1px solid ${search ? C.accent : C.border}`,
      borderRadius: 12,
      padding: "10px 14px",
      marginBottom: 16,
      display: "flex",
      alignItems: "center",
      gap: 8,
      transition: "border 0.2s"
    }
  }, React.createElement("span", {
    style: {
      color: C.accent
    }
  }, "🔍"), React.createElement("input", {
    autoFocus: !!initNewName,
    value: search,
    onChange: e => setSearch(e.target.value),
    placeholder: "ابحث بالاسم أو التشخيص أو رقم الملف...",
    style: {
      background: "none",
      border: "none",
      outline: "none",
      color: C.text,
      fontSize: 13,
      flex: 1,
      direction: "rtl",
      fontFamily: "inherit"
    }
  }), search && React.createElement("span", {
    onClick: () => setSearch(""),
    style: {
      color: C.muted,
      cursor: "pointer",
      fontSize: 18,
      lineHeight: 1
    }
  }, "×")), search && filtered.length === 0 && React.createElement("div", {
    style: {
      background: C.gold + "11",
      border: `1px solid ${C.gold}33`,
      borderRadius: 14,
      padding: "14px 16px",
      marginBottom: 14,
      display: "flex",
      alignItems: "center",
      gap: 10
    }
  }, React.createElement("span", {
    style: {
      fontSize: 20
    }
  }, "👤"), React.createElement("div", {
    style: {
      flex: 1
    }
  }, React.createElement("div", {
    style: {
      color: C.gold,
      fontWeight: 700,
      fontSize: 13
    }
  }, "\"", search, "\" غير موجود في قاعدة البيانات"), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11,
      marginTop: 2
    }
  }, "هل تريد إضافته كمريض جديد؟")), React.createElement(Btn, {
    small: true,
    color: C.gold,
    onClick: () => setModal({
      addNew: search
    })
  }, "+ إضافة")), filtered.map(p => React.createElement("div", {
    key: p.id,
    style: {
      background: C.card,
      border: `1px solid ${isNewToday(p) ? C.teal + "66" : C.border}`,
      borderRadius: 16,
      padding: 14,
      marginBottom: 10,
      position: "relative"
    }
  }, isNewToday(p) && React.createElement("span", {
    style: {
      position: "absolute",
      top: 10,
      left: 10,
      background: C.teal,
      color: C.bg,
      borderRadius: 6,
      padding: "1px 7px",
      fontSize: 9,
      fontWeight: 800
    }
  }, "جديد"), React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      marginBottom: 10
    }
  }, React.createElement("div", {
    style: {
      width: 44,
      height: 44,
      borderRadius: "50%",
      background: `linear-gradient(135deg,${C.accent}33,${C.teal}33)`,
      border: `2px solid ${isNewToday(p) ? C.teal : C.accent}44`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: C.accent,
      fontWeight: 800,
      fontSize: 16
    }
  }, (p.name || "?")[0]), React.createElement("div", {
    style: {
      flex: 1
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 14
    }
  }, p.name), React.createElement("span", {
    style: {
      background: C.accent + "22",
      color: C.accent,
      borderRadius: 6,
      padding: "1px 7px",
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 1
    }
  }, p.patientCode || "—")), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11
    }
  }, p.age, " سنة · ", p.condition || "—")), React.createElement(Tag, {
    label: p.status,
    color: SC[p.status] || C.muted
  })), React.createElement("div", {
    style: {
      display: "flex",
      gap: 6
    }
  }, React.createElement("div", {
    onClick: () => setOpenFile(p.id),
    style: {
      background: C.teal + "22",
      borderRadius: 8,
      padding: "7px 0",
      color: C.teal,
      fontSize: 11,
      fontWeight: 700,
      cursor: "pointer",
      flex: 1,
      textAlign: "center"
    }
  }, "📂 الملف الكامل"), React.createElement("div", {
    onClick: () => setModal({
      edit: p
    }),
    style: {
      background: C.accent + "22",
      borderRadius: 8,
      padding: "7px 12px",
      color: C.accent,
      fontSize: 11,
      cursor: "pointer"
    }
  }, "✏"), session && session.role === "admin" && React.createElement("div", {
    onClick: () => setModal({
      del: p.id
    }),
    style: {
      background: C.danger + "22",
      borderRadius: 8,
      padding: "7px 10px",
      color: C.danger,
      fontSize: 11,
      cursor: "pointer"
    }
  }, "🗑")))), filtered.length === 0 && React.createElement("div", {
    style: {
      color: C.muted,
      textAlign: "center",
      padding: 30,
      fontSize: 13
    }
  }, "لا توجد نتائج"), (modal === "add" || modal && modal.addNew) && React.createElement(Modal, {
    title: "مريض جديد",
    onClose: () => setModal(null)
  }, React.createElement(PatientForm, {
    initial: modal && modal.addNew ? {
      name: modal.addNew
    } : null,
    onSave: f => {
      addP(f);
      setModal(null);
      if (onInitDone) onInitDone();
    },
    onClose: () => setModal(null)
  })), modal && modal.edit && React.createElement(Modal, {
    title: "تعديل بيانات المريض",
    onClose: () => setModal(null)
  }, React.createElement(PatientForm, {
    initial: modal.edit,
    onSave: f => {
      updP(f);
      setModal(null);
    },
    onClose: () => setModal(null)
  })), modal && modal.del && React.createElement(Confirm, {
    msg: "حذف هذا المريض نهائياً؟",
    onOk: () => {
      delP(modal.del);
      setModal(null);
    },
    onNo: () => setModal(null)
  }));
}
function AptForm({
  initial,
  onSave,
  onClose,
  doctorNames = ["د. عبدالستار", "د. سلمى", "د. ليلى"],
  appointments = []
}) {
  const blank = {
    patient: "",
    date: localISO(),
    time: "09:00",
    type: "",
    doctor: "د. عبدالستار",
    clinic: CLINICS[0].v
  };
  const [f, setF] = useState(initial ? {
    ...blank,
    ...initial
  } : blank);
  const [err, setErr] = useState("");
  const s = k => e => setF(v => ({
    ...v,
    [k]: e.target.value
  }));
  const trySave = () => {
    if (!f.patient) return;
    const conflict = appointments.some(a => a.id !== f.id && a.doctor === f.doctor && a.time === f.time && (a.date || localISO()) === (f.date || localISO()));
    if (conflict) {
      setErr("⚠ يوجد موعد آخر لنفس الطبيب في هذا التاريخ والوقت");
      return;
    }
    setErr("");
    onSave(f);
  };
  return React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, React.createElement(Field, {
    label: "اسم المريض"
  }, React.createElement("input", {
    style: inp(),
    value: f.patient,
    onChange: s("patient"),
    placeholder: "اسم المريض"
  })), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10
    }
  }, React.createElement(Field, {
    label: "التاريخ"
  }, React.createElement("input", {
    style: inp(),
    type: "date",
    value: f.date,
    onChange: s("date")
  })), React.createElement(Field, {
    label: "الوقت"
  }, React.createElement("input", {
    style: inp(),
    type: "time",
    value: f.time,
    onChange: s("time")
  }))), React.createElement(Field, {
    label: "العيادة"
  }, React.createElement("select", {
    style: inp(),
    value: f.clinic,
    onChange: s("clinic")
  }, CLINICS.map(c => React.createElement("option", {
    key: c.v,
    value: c.v
  }, c.l)))), React.createElement(Field, {
    label: "نوع الكشف"
  }, React.createElement("input", {
    style: inp(),
    value: f.type,
    onChange: s("type"),
    placeholder: "فحص روتيني..."
  })), React.createElement(Field, {
    label: "الطبيب"
  }, React.createElement("select", {
    style: inp(),
    value: f.doctor,
    onChange: s("doctor")
  }, doctorNames.map(d => React.createElement("option", {
    key: d
  }, d)))), err && React.createElement("div", {
    style: {
      background: C.danger + "22",
      border: `1px solid ${C.danger}44`,
      borderRadius: 10,
      padding: "9px 12px",
      color: C.danger,
      fontSize: 12,
      textAlign: "center"
    }
  }, err), React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      marginTop: 8
    }
  }, React.createElement(Btn, {
    outline: true,
    full: true,
    onClick: onClose
  }, "إلغاء"), React.createElement(Btn, {
    full: true,
    onClick: trySave
  }, "حفظ")));
}
function Appointments({
  appointments,
  setAppointments,
  doctorNames = [],
  patients = [],
  onPatientClick,
  session
}) {
  const [filter, setFilter] = useState("الكل");
  const [modal, setModal] = useState(null);
  const DOCS = ["الكل", ...doctorNames];
  const filtered = filter === "الكل" ? appointments : appointments.filter(a => a.doctor === filter);
  const latestApts = async () => {
    const remote = await sbGet("iapp_appointments");
    return Array.isArray(remote) ? remote : appointments;
  };
  const add = async f => {
    const base = await latestApts();
    setAppointments([...base, {
      ...f,
      id: Date.now()
    }]);
  };
  const edit = async f => {
    const base = await latestApts();
    setAppointments(base.map(a => a.id === f.id ? f : a));
  };
  const del = async id => {
    const base = await latestApts();
    const rec = base.find(a => a.id === id);
    await trashPut("iapp_appointments", rec, "موعد");
    logAudit("حذف موعد", rec && rec.date + " " + (rec.time || "") + " · " + (rec.patient || "") || id);
    setAppointments(base.filter(a => a.id !== id));
  };
  const confirm = async id => {
    const base = await latestApts();
    setAppointments(base.map(a => a.id === id ? {
      ...a,
      confirmed: !a.confirmed
    } : a));
  };
  return React.createElement("div", {
    style: {
      padding: "16px 16px 90px"
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 16
    }
  }, React.createElement("span", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 16
    }
  }, "المواعيد (", appointments.length, ")"), React.createElement(Btn, {
    small: true,
    onClick: () => setModal("add")
  }, "+ موعد جديد")), React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginBottom: 16,
      overflowX: "auto",
      paddingBottom: 4
    }
  }, DOCS.map(d => React.createElement("button", {
    key: d,
    onClick: () => setFilter(d),
    style: {
      background: filter === d ? `linear-gradient(135deg,${C.accent},${C.teal})` : C.card,
      border: `1px solid ${filter === d ? "transparent" : C.border}`,
      borderRadius: 20,
      padding: "6px 14px",
      color: filter === d ? C.bg : C.muted,
      fontSize: 11,
      fontWeight: 600,
      cursor: "pointer",
      whiteSpace: "nowrap",
      fontFamily: "inherit"
    }
  }, d))), filtered.map(a => React.createElement("div", {
    key: a.id,
    style: {
      background: C.card,
      border: `1px solid ${a.fromPatient ? C.gold : C.border}`,
      borderRadius: 14,
      padding: "12px 14px",
      display: "flex",
      alignItems: "center",
      gap: 12,
      marginBottom: 8
    }
  }, React.createElement("div", {
    style: {
      textAlign: "center",
      minWidth: 48
    }
  }, React.createElement("div", {
    style: {
      color: C.accent,
      fontSize: 14,
      fontWeight: 800
    }
  }, a.time), a.date && React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 9
    }
  }, a.date)), React.createElement("div", {
    style: {
      width: 2,
      height: 40,
      background: C.accent + "55",
      borderRadius: 1
    }
  }), React.createElement("div", {
    style: {
      flex: 1
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6
    }
  }, React.createElement("div", {
    onClick: () => {
      const p = patients.find(x => x.name === a.patient || a.patientId && x.id === a.patientId);
      if (onPatientClick) onPatientClick(a.patient, p || null);
    },
    style: {
      color: C.accent,
      fontWeight: 600,
      fontSize: 13,
      cursor: "pointer",
      textDecoration: "underline"
    }
  }, a.patient), a.fromPatient && React.createElement("span", {
    style: {
      background: C.gold + "22",
      color: C.gold,
      borderRadius: 6,
      padding: "1px 6px",
      fontSize: 9,
      fontWeight: 700
    }
  }, "طلب المريض")), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11,
      marginTop: 2
    }
  }, a.type), a.phone && React.createElement("div", {
    style: {
      color: C.accent,
      fontSize: 11,
      marginTop: 2
    }
  }, "📞 ", a.phone), React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      marginTop: 6
    }
  }, React.createElement("span", {
    style: {
      background: C.border,
      borderRadius: 6,
      padding: "2px 8px",
      color: C.muted,
      fontSize: 10
    }
  }, a.doctor), React.createElement("span", {
    style: {
      background: C.teal + "22",
      borderRadius: 6,
      padding: "2px 8px",
      color: C.teal,
      fontSize: 10
    }
  }, "📍 ", clinicLabel(a.clinic)))), React.createElement("div", {
    style: {
      display: "flex",
      gap: 6
    }
  }, React.createElement("div", {
    onClick: () => confirm(a.id),
    style: {
      width: 32,
      height: 32,
      borderRadius: 10,
      background: a.confirmed ? C.success + "33" : C.card,
      border: `1px solid ${a.confirmed ? C.success : C.border}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      overflow: "hidden",
      flexShrink: 0
    }
  }, React.createElement("span", {
    style: {
      fontSize: 14,
      lineHeight: 1,
      color: a.confirmed ? C.success : C.muted
    }
  }, "✓")), a.phone && React.createElement("a", {
    href: `https://wa.me/2${a.phone.replace(/^0/, "")}?text=${encodeURIComponent("تذكير بموعدك في " + clinicLabel(a.clinic) + " يوم " + (a.date || "") + " الساعة " + a.time)}`,
    target: "_blank",
    style: {
      width: 32,
      height: 32,
      borderRadius: 10,
      background: "#25D36622",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      textDecoration: "none",
      overflow: "hidden",
      flexShrink: 0
    }
  }, React.createElement("span", {
    style: {
      fontSize: 14,
      lineHeight: 1
    }
  }, "📅")), React.createElement("div", {
    onClick: () => setModal({
      edit: a
    }),
    style: {
      width: 32,
      height: 32,
      borderRadius: 10,
      background: C.accent + "22",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      overflow: "hidden",
      flexShrink: 0
    }
  }, React.createElement("span", {
    style: {
      fontSize: 14,
      lineHeight: 1
    }
  }, "✏")), session && session.role === "admin" && React.createElement("div", {
    onClick: () => setModal({
      del: a.id
    }),
    style: {
      width: 32,
      height: 32,
      borderRadius: 10,
      background: C.danger + "22",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      overflow: "hidden",
      flexShrink: 0
    }
  }, React.createElement("span", {
    style: {
      fontSize: 13,
      lineHeight: 1,
      color: C.danger
    }
  }, "🗑"))))), filtered.length === 0 && React.createElement("div", {
    style: {
      color: C.muted,
      textAlign: "center",
      padding: 30,
      fontSize: 13
    }
  }, "لا توجد مواعيد"), modal === "add" && React.createElement(Modal, {
    title: "موعد جديد",
    onClose: () => setModal(null)
  }, React.createElement(AptForm, {
    doctorNames: doctorNames,
    appointments: appointments,
    onSave: f => {
      add(f);
      setModal(null);
    },
    onClose: () => setModal(null)
  })), modal && modal.edit && React.createElement(Modal, {
    title: "تعديل الموعد",
    onClose: () => setModal(null)
  }, React.createElement(AptForm, {
    doctorNames: doctorNames,
    appointments: appointments,
    initial: modal.edit,
    onSave: f => {
      edit(f);
      setModal(null);
    },
    onClose: () => setModal(null)
  })), modal && modal.del && React.createElement(Confirm, {
    msg: "حذف هذا الموعد؟",
    onOk: () => {
      del(modal.del);
      setModal(null);
    },
    onNo: () => setModal(null)
  }));
}
function whenPrintReady(doc, cb) {
  let done = false;
  const go = () => {
    if (!done) {
      done = true;
      cb();
    }
  };
  const started = Date.now();
  const poll = () => {
    if (done) return;
    try {
      const links = [...doc.querySelectorAll('link[rel="stylesheet"]')];
      const cssReady = links.every(l => l.sheet);
      if (cssReady || Date.now() - started > 2000) {
        const fams = (doc.body && doc.body.dataset.fonts || "").split(",").filter(Boolean);
        Promise.all(fams.map(f => doc.fonts.load("16px '" + f + "'").catch(() => {})).concat(fams.map(f => doc.fonts.load("700 16px '" + f + "'").catch(() => {})))).then(() => doc.fonts.ready).then(() => setTimeout(go, 120)).catch(go);
        return;
      }
    } catch (e) {
      go();
      return;
    }
    setTimeout(poll, 120);
  };
  setTimeout(poll, 50);
  setTimeout(go, 3500);
}
function printDoc(html) {
  let win = null;
  try {
    win = window.open("", "_blank");
  } catch (e) {
    win = null;
  }
  if (win && win.document) {
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    whenPrintReady(win.document, () => {
      try {
        win.print();
      } catch (e) {
        printViaIframe(html);
      }
    });
    return;
  }
  printViaIframe(html);
}
function printViaIframe(html) {
  const old = document.getElementById("__print_iframe__");
  if (old) old.remove();
  const iframe = document.createElement("iframe");
  iframe.id = "__print_iframe__";
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "0",
    height: "0",
    border: "0",
    visibility: "hidden"
  });
  document.body.appendChild(iframe);
  let printed = false;
  const triggerPrint = () => {
    if (printed) return;
    printed = true;
    try {
      const fw = iframe.contentWindow;
      fw.focus();
      fw.print();
    } catch (e) {
      alert("تعذر فتح نافذة الطباعة على هذا الجهاز");
    }
    setTimeout(() => {
      try {
        iframe.remove();
      } catch (e) {}
    }, 60000);
  };
  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
  whenPrintReady(doc, triggerPrint);
}
const getRxHTML = safeTemplate(_getRxHTMLRaw);
const SAKR_LOGO_FULL = window.SAKR_LOGO_FULL || "";
const SAKR_LOGO_MARK = window.SAKR_LOGO_MARK || "";
const RX_PAD = {
  doctor: "د/ عبد الستار سالم صقر",
  lines: ["عضو الجمعية الرمدية المصرية", "إستشاري طب وجراحة العيون"],
  branches: [{
    name: "دمنهور",
    addr: "شارع الجمهورية برج المنتزة بجوار حديقة الجمهورية",
    hours: "يومياً من ٨ م : ١٠ م",
    phone: "01096806570"
  }, {
    name: "الرحمانية",
    addr: "شارع أحمد محمود أمام مسجد الربيعي",
    hours: "السبت والإثنين والأربعاء ٤ م إلى ٦ م",
    phone: "01111480137"
  }],
  extraPhones: ["045 3333313", "01007818980"]
};
function _getRxHTMLRaw(rx, patient, docName, clinic) {
  const p = patient || {};
  const cl = clinic || {};
  const isOwner = !docName || /عبد\s?الستار/.test(docName);
  const doctor = isOwner ? RX_PAD.doctor : docName;
  const lines = isOwner ? RX_PAD.lines : ["طب وجراحة العيون"];
  const d = rx.date ? new Date(rx.date) : null;
  const dateTxt = d && !isNaN(d) ? d.toLocaleDateString("ar-EG", {
    day: "numeric",
    month: "numeric",
    year: "numeric"
  }) : "";
  const meds = (rx.medicines || "").split("\n").map(s => s.trim()).filter(Boolean);
  const custom = cl.logo && /^data:image\//.test(cl.logo) ? cl.logo : "";
  const sealLogo = custom || SAKR_LOGO_FULL;
  const wmLogo = custom || SAKR_LOGO_MARK;
  const medRows = meds.map((line, i) => {
    const parts = line.split(/\s[-–—]\s?|[-–—](?=\s*[؀-ۿ\d])/);
    const name = (parts[0] || "").trim();
    const dose = parts.slice(1).join(" - ").trim();
    return `<div class="med"><div class="nm"><span class="i">${i + 1}.</span>${name}</div>${dose ? `<div class="ds" dir="rtl">${dose}</div>` : ""}</div>`;
  }).join("");
  const pin = `<svg viewBox="0 0 24 24" width="13" height="13"><path fill="#2f6fa8" d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5Z"/></svg>`;
  const clock = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#2f6fa8" stroke-width="2.2"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M4 5l3-2M20 5l-3-2"/></svg>`;
  const tel = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#2c4458" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8.5 7.5c.5-.5 1.2-.4 1.5.1l1 1.6c.3.5.2 1-.2 1.4l-.6.5c.5 1.2 1.4 2.1 2.6 2.6l.5-.6c.4-.4 1-.5 1.4-.2l1.6 1c.5.3.6 1 .1 1.5l-.7.7c-.7.7-1.8.9-2.7.4-2.3-1.1-4.1-2.9-5.2-5.2-.4-.9-.3-2 .4-2.7Z"/></svg>`;
  return `<!DOCTYPE html><html dir="rtl" lang="ar">
<head><meta charset="UTF-8"><title>روشتة — ${p.name || rx.patient || ""}</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=block">
<style>
  /* No page size is forced: the prescription is printed at its real A5 size (148×210mm),
     anchored to the TOP-LEFT corner of whatever paper is selected, never scaled or centered.
     So pre-cut A5 sheets fed against the left guide print correctly. */
  @page{margin:0}
  *{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  html,body{background:#fff;direction:ltr;margin:0;padding:0}
  /* Andalus when installed (Windows), otherwise Amiri — the closest free Arabic face */
  body{font-family:'Andalus','Amiri',Tahoma,serif;color:#2c4458}
  .page{direction:rtl;width:148mm;min-height:209mm;margin:0;padding:7mm 7mm 6mm;display:flex;flex-direction:column;position:relative;overflow:hidden}

  .top{position:relative;height:40mm}
  .band{position:absolute;top:0;right:0;left:22mm;height:24mm;background:#3d5569;border-radius:1mm;color:#fff;padding:4mm 7mm 0 0}
  .band .dn{font-size:25px;font-weight:700;line-height:1.3}
  .band .ln{font-size:14px;margin-top:1mm;opacity:.95;line-height:1.35}
  .band .ln+.ln{margin-top:0}
  .seal{position:absolute;left:0;top:-2mm;width:36mm;height:36mm;border-radius:50%;background:#fff;padding:2.2mm}
  .seal .in{width:100%;height:100%;border-radius:50%;background:#b8d3ea;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden}
  .seal .in img{width:76%;height:76%;object-fit:contain;margin-top:1mm}
  .seal .t1{font-size:8.5px;font-weight:800;color:#3d5569;letter-spacing:.4px;margin-top:1mm;font-family:Arial,sans-serif}
  .seal .t2{font-size:4.6px;font-weight:700;color:#3d5569;font-family:Arial,sans-serif}
  .arc{position:absolute;left:1mm;top:2mm;width:34mm;height:36.5mm;border-radius:50%;border-bottom:1.2mm solid #3d5569;opacity:.85}

  .fields{margin:-12mm 0 0 40mm;padding-right:6mm;font-size:17px;font-weight:700;color:#2c4458}
  .fields .row{display:flex;align-items:baseline;gap:2mm;margin-bottom:3mm}
  .fields .v{flex:1;border-bottom:1.5px dotted #6b7f90;font-weight:700;font-size:16px;min-height:5mm;padding:0 1mm}

  .rx{font-family:Georgia,'Times New Roman',serif;font-size:30px;font-weight:700;color:#3d5569;direction:ltr;text-align:left;margin:4mm 0 2mm 3mm;line-height:1}
  .rx span{font-size:18px}
  .meds{direction:ltr;text-align:left;flex:1;padding:0 4mm;position:relative;z-index:1}
  .med{padding:2.4mm 0;page-break-inside:avoid}
  .med .nm{font-family:Arial,'Segoe UI',sans-serif;font-size:15px;font-weight:700;color:#1b2b3a}
  .med .i{font-family:Arial,sans-serif;color:#6b7f90;font-weight:700;margin-right:2mm;font-size:13px}
  .med .ds{font-size:15px;color:#3f5263;margin-top:1.2mm;padding-left:6mm;text-align:left}
  .notes{position:relative;z-index:1;margin:2mm 4mm 3mm;font-size:15px;line-height:1.8;white-space:pre-line;color:#2c4458}

  .wm{position:absolute;left:50%;top:56%;transform:translate(-50%,-50%);width:82mm;height:82mm;opacity:.09;pointer-events:none;z-index:0}
  .wm img{width:100%;height:100%;object-fit:contain;filter:grayscale(.6);mix-blend-mode:multiply}

  .foot{position:relative;z-index:1;background:#b8d3ea;border-radius:9mm;padding:3mm 8mm 2.6mm;font-size:14.5px;font-weight:700;color:#2c4458;line-height:1.55}
  .foot .l{display:flex;align-items:center;gap:1.6mm;white-space:nowrap;line-height:1.45}
  .foot .l b{color:#2f6fa8}
  .foot .r2{display:flex;justify-content:space-between;align-items:center;margin-bottom:1mm}
  .foot .ph{display:flex;align-items:center;gap:1.4mm;font-family:Arial,sans-serif;font-weight:800;letter-spacing:.3px}
  .foot .ex{display:flex;justify-content:center;gap:14mm;font-family:Arial,sans-serif;font-weight:800;margin-top:.6mm;letter-spacing:.3px}
  @media screen{body{background:#e9eef2;padding:10px}.page{background:#fff;box-shadow:0 2px 12px #0002}}
  @media print{html,body{width:auto;height:auto}.page{break-after:avoid}}
</style></head>
<body data-fonts="Amiri">
<div class="page">
  <div class="wm"><img src="${wmLogo}" alt=""></div>

  <div class="top">
    <div class="band">
      <div class="dn">${doctor}</div>
      ${lines.map(l => `<div class="ln">${l}</div>`).join("")}
    </div>
    <div class="arc"></div>
    <div class="seal"><div class="in"><img src="${sealLogo}" alt=""></div></div>
  </div>

  <div class="fields">
    <div class="row"><span>الاسم :</span><span class="v">${p.name || rx.patient || ""}</span></div>
    <div class="row"><span>التاريخ :</span><span class="v">${dateTxt}</span>${p.age ? `<span style="margin-right:3mm">السن :</span><span class="v" style="flex:0 0 14mm">${p.age}</span>` : ""}</div>
  </div>

  <div class="rx">R<span>x</span></div>
  <div class="meds">${medRows}</div>
  ${rx.notes ? `<div class="notes">${rx.notes}</div>` : ""}

  <div class="foot">
    ${RX_PAD.branches.map(b => `
      <div class="l">${pin}<b>${b.name} :</b> ${b.addr}</div>
      <div class="r2"><div class="l">${clock}${b.hours}</div><div class="ph">${tel}<span dir="ltr">${b.phone}</span></div></div>`).join("")}
    <div class="ex">${RX_PAD.extraPhones.map(x => `<span dir="ltr">${x}</span>`).join("")}</div>
  </div>
</div></body></html>`;
}
const getGlassesHTML = safeTemplate(_getGlassesHTMLRaw);
function _getGlassesHTMLRaw(rx, patient, docName, clinic) {
  const p = patient || {};
  const cl = clinic || {};
  const SEED_CLINIC = {
    address: "دمنهور - برج المنتزه بجوار حديقة الجمهورية | الرحمانية - ش أحمد محمود بجوار فرع we",
    phone: "دمنهور: 0453333313 | الرحمانية: 01111480137"
  };
  const address = cl.address || SEED_CLINIC.address;
  const phone = cl.phone || SEED_CLINIC.phone;
  const date = new Date(rx.date).toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  return `<!DOCTYPE html><html lang="en">
<head><meta charset="UTF-8"><title>Glasses Prescription</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:Arial,sans-serif;background:#fff;color:#111;overflow-x:hidden;}
  .page{width:100%;max-width:200mm;margin:0 auto;padding:4mm 3mm;}
  .header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #00C2FF;padding-bottom:6px;margin-bottom:8px;flex-wrap:wrap;gap:4px;}
  .clinic{font-size:12px;font-weight:800;color:#00C2FF;direction:rtl;}
  .sub{font-size:8px;color:#666;margin-top:2px;direction:rtl;}
  .badge{background:#00C2FF;color:#fff;padding:3px 8px;border-radius:12px;font-size:9px;font-weight:700;white-space:nowrap;}
  .patient-row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;direction:rtl;}
  .pinfo{font-size:9px;color:#555;}
  .pinfo b{color:#111;}
  .tbl-wrap{border:1.5px solid #aaa;border-radius:8px;overflow:hidden;margin-bottom:8px;}
  table{width:100%;border-collapse:collapse;table-layout:fixed;direction:ltr;}
  th,td{border:1px solid #aaa;text-align:center;padding:0;overflow:hidden;}
  .th-group{background:#fff;color:#111;font-weight:700;font-size:11px;padding:4px 2px;}
  .th-sub{background:#fff;color:#111;font-weight:400;font-size:9px;padding:3px 2px;}
  .th-ipd{background:#fff;color:#111;font-weight:700;font-size:10px;padding:4px 2px;vertical-align:middle;}
  .td-label{background:#f5f5f5;font-weight:600;font-size:9px;color:#333;padding:6px 4px;text-align:left;width:50px;}
  .td-val{font-size:10px;font-weight:600;padding:6px 2px;height:28px;}
  .footer{display:flex;justify-content:space-between;align-items:flex-end;padding-top:6px;border-top:1px solid #ddd;direction:rtl;flex-wrap:wrap;gap:4px;}
  .sig-line{width:100px;border-top:1px solid #333;text-align:center;padding-top:3px;font-size:8px;color:#555;}
  @media print{.page{margin:0;width:100%;}}





</style></head>
<body>
<div class="page"><div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:80px;font-weight:900;color:#00C2FF;opacity:0.05;pointer-events:none;z-index:0;letter-spacing:8px;font-family:Georgia,serif;white-space:nowrap;">I App</div>
  <div class="header">
    <div>
      <div class="clinic">&#128065; عيادة ${docName}</div>
      <div class="sub">استشاري طب وجراحة العيون والليزر</div>
    </div>
    <div class="badge">Glasses Prescription</div>
  </div>

  <div class="patient-row">
    <div class="pinfo">المريض: <b>${p.name || rx.patient || "—"}</b></div>
    <div class="pinfo">رقم الملف: <b>${p.patientCode || "—"}</b></div>
    <div class="pinfo">العمر: <b>${p.age ? p.age + " سنة" : "—"}</b></div>
    <div class="pinfo">Date: <b>${date}</b></div>
  </div>

  <div class="tbl-wrap">
    <table>
      <thead>
        <tr>
          <td class="td-label" rowspan="2" style="border:1px solid #aaa;background:#f5f5f5;"></td>
          <th class="th-group" colspan="3" style="border-bottom:1px solid #aaa;">OD · Right</th>
          <th class="th-group" colspan="3" style="border-bottom:1px solid #aaa;">OS · Left</th>
          <th class="th-ipd" rowspan="2" style="width:52px;">I.P.D</th>
        </tr>
        <tr>
          <th class="th-sub">SPH.</th>
          <th class="th-sub">CYL.</th>
          <th class="th-sub">AX.</th>
          <th class="th-sub">SPH.</th>
          <th class="th-sub">CYL.</th>
          <th class="th-sub">AX.</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="td-label">Distance</td>
          <td class="td-val">${rx.sphR || ""}</td>
          <td class="td-val">${rx.cylR || ""}</td>
          <td class="td-val">${rx.axisR || ""}</td>
          <td class="td-val">${rx.sphL || ""}</td>
          <td class="td-val">${rx.cylL || ""}</td>
          <td class="td-val">${rx.axisL || ""}</td>
          <td class="td-val" rowspan="2">${rx.ipd || ""}</td>
        </tr>
        <tr>
          <td class="td-label">Reading</td>
          <td class="td-val"></td>
          <td class="td-val"></td>
          <td class="td-val"></td>
          <td class="td-val"></td>
          <td class="td-val"></td>
          <td class="td-val"></td>
        </tr>
      </tbody>
    </table>
  </div>

  ${rx.add ? `<div style="font-size:11px;color:#333;margin-bottom:8px;direction:rtl;">ADD: <b>${rx.add}</b></div>` : ""}
  ${rx.notes ? `<div style="font-size:10px;color:#444;background:#f8f8f8;border-radius:5px;padding:6px 8px;margin-bottom:8px;direction:rtl;">&#128221; ${rx.notes}</div>` : ""}

  <div class="footer">
    <div style="font-size:9px;color:#555;line-height:1.8;direction:rtl;">
      ${address ? `<div>&#128205; ${address}</div>` : ""}
      ${phone ? `<div>&#128222; ${phone}</div>` : ""}
    </div>
    <div class="sig-line">${docName}</div>
  </div>
</div></body></html>`;
}
function PrintModal({
  rx,
  patient,
  onClose,
  primaryDoctor,
  clinic
}) {
  const docName = primaryDoctor && primaryDoctor.name || "د. عبدالستار صقر";
  const p = patient || {};
  return React.createElement(Modal, {
    title: "🖨️ اختر نوع الطباعة",
    onClose: onClose
  }, React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, React.createElement("div", {
    style: {
      background: C.bg,
      border: `1px solid ${C.border}`,
      borderRadius: 10,
      padding: 12
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 13,
      marginBottom: 4
    }
  }, rx.patient), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11
    }
  }, rx.date, " · ", rx.eye)), React.createElement("div", {
    onClick: () => {
      printDoc(getGlassesHTML(rx, p, docName, clinic));
    },
    style: {
      background: C.accent + "11",
      border: `2px solid ${C.accent}`,
      borderRadius: 14,
      padding: 16,
      cursor: "pointer"
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12
    }
  }, React.createElement("div", {
    style: {
      fontSize: 28
    }
  }, "👓"), React.createElement("div", null, React.createElement("div", {
    style: {
      color: C.accent,
      fontWeight: 700,
      fontSize: 14
    }
  }, "كشف النظارة"), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11,
      marginTop: 2
    }
  }, "جدول Right / Left — SPH · CYL · AX · ADD · IPD"))), React.createElement("div", {
    style: {
      marginTop: 12,
      background: C.bg,
      borderRadius: 8,
      padding: 10,
      direction: "ltr"
    }
  }, React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "60px 1fr 1fr 1fr 1fr 1fr 1fr",
      gap: 4,
      fontSize: 10
    }
  }, React.createElement("div", null), ["SPH", "CYL", "AX", "SPH", "CYL", "AX"].map((h, i) => React.createElement("div", {
    key: i,
    style: {
      background: C.accent,
      color: C.bg,
      borderRadius: 4,
      padding: "2px 4px",
      textAlign: "center",
      fontWeight: 700
    }
  }, h)), ["Distance", "Reading"].map(row => [React.createElement("div", {
    key: row,
    style: {
      color: C.muted,
      fontSize: 9,
      display: "flex",
      alignItems: "center"
    }
  }, row), ...["sphR", "cylR", "axisR", "sphL", "cylL", "axisL"].map((k, i) => React.createElement("div", {
    key: k + i,
    style: {
      background: C.border,
      borderRadius: 4,
      padding: "3px 4px",
      textAlign: "center",
      color: C.text,
      fontWeight: 600
    }
  }, row === "Distance" ? rx[k] || "" : ""))]))), React.createElement("div", {
    style: {
      color: C.accent,
      fontWeight: 700,
      fontSize: 12,
      textAlign: "center",
      marginTop: 10
    }
  }, "اضغط للطباعة →")), React.createElement("div", {
    onClick: () => {
      printDoc(getRxHTML(rx, p, docName, clinic));
    },
    style: {
      background: C.gold + "11",
      border: `2px solid ${C.gold}`,
      borderRadius: 14,
      padding: 16,
      cursor: "pointer"
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12
    }
  }, React.createElement("div", {
    style: {
      fontSize: 28
    }
  }, "💊"), React.createElement("div", null, React.createElement("div", {
    style: {
      color: C.gold,
      fontWeight: 700,
      fontSize: 14
    }
  }, "روشتة الأدوية"), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11,
      marginTop: 2
    }
  }, "قائمة الأدوية والجرعات"))), rx.medicines && React.createElement("div", {
    style: {
      marginTop: 10,
      background: C.bg,
      borderRadius: 8,
      padding: 10
    }
  }, rx.medicines.split("\n").filter(Boolean).slice(0, 3).map((m, i) => React.createElement("div", {
    key: i,
    style: {
      color: C.text,
      fontSize: 11,
      marginBottom: 4,
      display: "flex",
      gap: 6
    }
  }, React.createElement("span", {
    style: {
      background: C.gold,
      color: C.bg,
      borderRadius: "50%",
      width: 16,
      height: 16,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 9,
      fontWeight: 800,
      flexShrink: 0
    }
  }, i + 1), React.createElement("span", null, m))), rx.medicines.split("\n").filter(Boolean).length > 3 && React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10
    }
  }, "+", rx.medicines.split("\n").filter(Boolean).length - 3, " أدوية أخرى...")), React.createElement("div", {
    style: {
      color: C.gold,
      fontWeight: 700,
      fontSize: 12,
      textAlign: "center",
      marginTop: 10
    }
  }, "اضغط للطباعة →")), React.createElement(Btn, {
    outline: true,
    full: true,
    onClick: onClose
  }, "إغلاق")));
}
const DEFAULT_DRUGS = ["Vigamox ED", "Optipred ED", "Tobradex ED", "Tobradex EO", "Dexaflox ED", "Cyanaro ED", "Solofresh ED", "Timolol 0.5% ED", "Tobramycin ED", "Prednisolone ED", "Moxifloxacin ED", "Dorzolamide ED", "Latanoprost ED", "Ketorolac ED", "Cyclopentolate ED", "Tropicamide ED", "Atropine ED", "Tetracycline EO", "Vitamins A&E cap"];
function loadDrugs() {
  try {
    const custom = JSON.parse(localStorage.getItem("iapp_custom_drugs") || "[]");
    const all = [...DEFAULT_DRUGS];
    custom.forEach(d => {
      if (!all.includes(d)) all.push(d);
    });
    return all;
  } catch {
    return [...DEFAULT_DRUGS];
  }
}
function saveDrug(name) {
  try {
    const custom = JSON.parse(localStorage.getItem("iapp_custom_drugs") || "[]");
    if (!custom.includes(name) && !DEFAULT_DRUGS.includes(name)) {
      custom.push(name);
      localStorage.setItem("iapp_custom_drugs", JSON.stringify(custom));
    }
  } catch {}
}
function deleteDrug(name) {
  try {
    const custom = JSON.parse(localStorage.getItem("iapp_custom_drugs") || "[]");
    localStorage.setItem("iapp_custom_drugs", JSON.stringify(custom.filter(d => d !== name)));
  } catch {}
}
const DOSE_OPTIONS = ["مرة يومياً", "مرتين يومياً", "3 مرات يومياً", "4 مرات يومياً", "كل 4 ساعات", "كل 6 ساعات", "عند اللزوم", "قبل النوم"];
const SPH_OPTIONS = (() => {
  const opts = [];
  for (let i = 80; i >= -80; i--) {
    const v = i / 4;
    opts.push((v >= 0 ? "+" : "") + v.toFixed(2));
  }
  return opts;
})();
const CYL_OPTIONS = (() => {
  const opts = [];
  for (let i = 0; i <= 24; i++) {
    const v = -(i / 4);
    opts.push(v === 0 ? "0.00" : v.toFixed(2));
  }
  return opts;
})();
const AXIS_OPTIONS = Array.from({
  length: 181
}, (_, i) => String(i));
function MedicinesStep({
  medicines,
  onChange
}) {
  const parse = () => {
    if (!medicines) return [];
    return medicines.split("\n").filter(Boolean).map(line => {
      const dash = line.indexOf(" - ");
      if (dash > -1) return {
        name: line.slice(0, dash).trim(),
        dose: line.slice(dash + 3).trim()
      };
      return {
        name: line.trim(),
        dose: ""
      };
    });
  };
  const [meds, setMeds] = useState(parse);
  const [drugList, setDrugList] = useState(loadDrugs);
  const [templates, setTemplates] = useState(loadRxTemplates);
  useEffect(() => {
    (async () => {
      const t = await refreshRxTemplates();
      setTemplates(t);
    })();
  }, []);
  const [showSugg, setShowSugg] = useState(null);
  const [newDrug, setNewDrug] = useState("");
  const [addingNew, setAddingNew] = useState(false);
  const save = list => {
    setMeds(list);
    onChange(list.map(m => m.name + (m.dose ? " - " + m.dose : "")).join("\n"));
  };
  const addMed = () => save([...meds, {
    name: "",
    dose: ""
  }]);
  const update = (i, k, v) => {
    const n = [...meds];
    n[i] = {
      ...n[i],
      [k]: v
    };
    save(n);
  };
  const remove = i => save(meds.filter((_, idx) => idx !== i));
  const handleAddNewDrug = () => {
    const name = newDrug.trim();
    if (!name) return;
    saveDrug(name);
    const updated = loadDrugs();
    setDrugList(updated);
    setNewDrug("");
    setAddingNew(false);
  };
  const handleDeleteDrug = drugName => {
    if (DEFAULT_DRUGS.includes(drugName)) {
      alert("لا يمكن حذف الأدوية الأصلية");
      return;
    }
    if (!window.confirm("حذف " + drugName + " من القائمة؟")) return;
    deleteDrug(drugName);
    setDrugList(loadDrugs());
  };
  return React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 10
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 4
    }
  }, React.createElement("span", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 13
    }
  }, "💊 الأدوية الموصوفة"), React.createElement("div", {
    style: {
      display: "flex",
      gap: 6
    }
  }, React.createElement(Btn, {
    small: true,
    color: C.teal,
    onClick: () => setAddingNew(v => !v)
  }, "+ صنف جديد"), React.createElement(Btn, {
    small: true,
    onClick: addMed
  }, "+ إضافة"))), React.createElement("div", {
    style: {
      background: C.bg,
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      padding: 10
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: templates.length ? 8 : 0
    }
  }, React.createElement("span", {
    style: {
      color: C.muted,
      fontSize: 11,
      fontWeight: 700
    }
  }, "⚡ قوالب جاهزة"), React.createElement("span", {
    onClick: async () => {
      const txt = meds.filter(m => m.name).map(m => m.name + (m.dose ? " - " + m.dose : "")).join("\n");
      if (!txt) {
        alert("أضف الأدوية أولاً ثم احفظها كقالب");
        return;
      }
      const name = window.prompt("اسم القالب (مثال: ما بعد المياه البيضاء)");
      if (!name || !name.trim()) return;
      const next = await addRxTemplate({
        name: name.trim(),
        medicines: txt
      });
      if (next) setTemplates(next);else alert("❌ تعذر حفظ القالب");
    },
    style: {
      color: C.teal,
      fontSize: 11,
      cursor: "pointer",
      background: C.teal + "22",
      borderRadius: 8,
      padding: "3px 9px"
    }
  }, "💾 حفظ الحالي كقالب")), templates.length === 0 ? React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11,
      marginTop: 6
    }
  }, "لا توجد قوالب بعد — اكتب روشتة ثم احفظها كقالب لاستخدامها لاحقاً") : React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      flexWrap: "wrap"
    }
  }, templates.map(t => React.createElement("span", {
    key: t.id,
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      background: C.gold + "18",
      border: `1px solid ${C.gold}44`,
      borderRadius: 9,
      padding: "5px 9px"
    }
  }, React.createElement("span", {
    onClick: () => {
      const add = (t.medicines || "").split("\n").filter(Boolean).map(line => {
        const d = line.indexOf(" - ");
        return d > -1 ? {
          name: line.slice(0, d).trim(),
          dose: line.slice(d + 3).trim()
        } : {
          name: line.trim(),
          dose: ""
        };
      });
      save([...meds.filter(m => m.name), ...add]);
    },
    style: {
      color: C.gold,
      fontSize: 11,
      fontWeight: 700,
      cursor: "pointer"
    }
  }, t.name), React.createElement("span", {
    onClick: async () => {
      if (!window.confirm("حذف القالب «" + t.name + "»؟")) return;
      const next = await deleteRxTemplate(t.id);
      if (next) setTemplates(next);
    },
    style: {
      color: C.danger,
      fontSize: 12,
      cursor: "pointer"
    }
  }, "×"))))), addingNew && React.createElement("div", {
    style: {
      background: C.teal + "11",
      border: "1px solid " + C.teal + "44",
      borderRadius: 12,
      padding: 12,
      display: "flex",
      gap: 8,
      alignItems: "center"
    }
  }, React.createElement("input", {
    autoFocus: true,
    value: newDrug,
    onChange: e => setNewDrug(e.target.value),
    onKeyDown: e => e.key === "Enter" && handleAddNewDrug(),
    placeholder: "اسم الدواء الجديد...",
    style: {
      ...inp(),
      flex: 1,
      fontSize: 12
    }
  }), React.createElement(Btn, {
    small: true,
    color: C.teal,
    onClick: handleAddNewDrug
  }, "حفظ"), React.createElement("span", {
    onClick: () => setAddingNew(false),
    style: {
      color: C.muted,
      fontSize: 20,
      cursor: "pointer"
    }
  }, "×")), meds.length === 0 && React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 12,
      textAlign: "center",
      padding: 20,
      background: C.card,
      borderRadius: 10
    }
  }, "اضغط \"+ إضافة\" لإضافة الأدوية"), meds.map((m, i) => React.createElement("div", {
    key: i,
    style: {
      background: C.card,
      border: "1px solid " + C.border,
      borderRadius: 12,
      padding: 12
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginBottom: 8,
      alignItems: "center"
    }
  }, React.createElement("div", {
    style: {
      width: 24,
      height: 24,
      borderRadius: 6,
      background: C.gold,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 11,
      fontWeight: 800,
      color: C.bg,
      flexShrink: 0
    }
  }, i + 1), React.createElement("div", {
    style: {
      flex: 1
    }
  }, React.createElement("select", {
    style: {
      ...inp(),
      fontSize: 12
    },
    value: m.name,
    onChange: e => update(i, "name", e.target.value)
  }, React.createElement("option", {
    value: ""
  }, "-- اختر دواء --"), drugList.map(d => React.createElement("option", {
    key: d,
    value: d
  }, d)))), React.createElement("div", {
    onClick: () => remove(i),
    style: {
      color: C.danger,
      fontSize: 20,
      cursor: "pointer",
      flexShrink: 0,
      paddingRight: 4
    }
  }, "×")), React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      flexWrap: "wrap"
    }
  }, DOSE_OPTIONS.map(d => React.createElement("div", {
    key: d,
    onClick: () => update(i, "dose", d),
    style: {
      background: m.dose === d ? C.teal + "22" : C.bg,
      border: "1px solid " + (m.dose === d ? C.teal : C.border),
      borderRadius: 8,
      padding: "4px 10px",
      fontSize: 10,
      color: m.dose === d ? C.teal : C.muted,
      cursor: "pointer",
      fontWeight: m.dose === d ? 700 : 400
    }
  }, d))), m.dose && React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11,
      marginTop: 6
    }
  }, "📋 ", m.name, " - ", m.dose))));
}
function RxForm({
  initial,
  patients,
  onSave,
  onClose,
  doctorNames = ["د. عبدالستار", "د. سلمى", "د. ليلى"]
}) {
  const autoPatient = patients && patients.length === 1 ? patients[0] : null;
  const blank = {
    patient: autoPatient && autoPatient.name || "",
    patientId: autoPatient && autoPatient.id || null,
    eye: "كلتا العينين",
    sphR: "",
    cylR: "",
    axisR: "",
    sphL: "",
    cylL: "",
    axisL: "",
    add: "",
    medicines: "",
    notes: "",
    date: localISO()
  };
  const [f, setF] = useState(initial ? {
    ...initial
  } : blank);
  const [step, setStep] = useState(autoPatient && !initial ? 1 : 0);
  const [errors, setErrors] = useState({});
  const s = k => e => setF(v => ({
    ...v,
    [k]: e.target.value
  }));
  const needR = f.eye === "العين اليمنى" || f.eye === "كلتا العينين";
  const needL = f.eye === "العين اليسرى" || f.eye === "كلتا العينين";
  const validate = () => {
    const e = {};
    if (needR && f.cylR && !f.axisR) e.axisR = "مطلوب عند وجود CYL";
    if (needL && f.cylL && !f.axisL) e.axisL = "مطلوب عند وجود CYL";
    setErrors(e);
    return Object.keys(e).length === 0;
  };
  const handleNext = () => {
    if (step === 0 && !f.patient) return;
    if (step === 1 && !validate()) return;
    setStep(p => p + 1);
  };
  const handleSave = () => {
    if (!validate()) {
      setStep(1);
      return;
    }
    onSave(f);
  };
  return React.createElement("div", null, autoPatient && React.createElement("div", {
    style: {
      background: C.accent + "22",
      border: "1px solid " + C.accent + "44",
      borderRadius: 10,
      padding: "8px 14px",
      marginBottom: 12,
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  }, React.createElement("span", {
    style: {
      fontSize: 16
    }
  }, "👤"), React.createElement("span", {
    style: {
      color: C.accent,
      fontWeight: 700,
      fontSize: 13
    }
  }, autoPatient.name), React.createElement("span", {
    style: {
      color: C.muted,
      fontSize: 11,
      marginRight: "auto"
    }
  }, autoPatient.patientCode || "")), React.createElement("div", {
    style: {
      display: "flex",
      marginBottom: 18,
      background: C.card,
      borderRadius: 12,
      padding: 4
    }
  }, (autoPatient ? ["قياسات النظر", "الأدوية"] : ["المريض", "قياسات النظر", "الأدوية"]).map((st, i) => {
    const realStep = autoPatient ? i + 1 : i;
    return React.createElement("div", {
      key: i,
      onClick: () => setStep(realStep),
      style: {
        flex: 1,
        textAlign: "center",
        padding: "8px 4px",
        background: step === realStep ? "linear-gradient(135deg," + C.accent + "," + C.teal + ")" : "transparent",
        borderRadius: 9,
        cursor: "pointer",
        color: step === realStep ? C.bg : C.muted,
        fontSize: 11,
        fontWeight: 700
      }
    }, st);
  })), step === 0 && React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, React.createElement(Field, {
    label: "المريض"
  }, React.createElement("select", {
    style: inp(),
    value: f.patientId || "",
    onChange: e => {
      const p = patients.find(p => p.id === Number(e.target.value));
      setF(v => ({
        ...v,
        patientId: Number(e.target.value),
        patient: p && p.name || ""
      }));
    }
  }, React.createElement("option", {
    value: ""
  }, "اختر مريض"), patients.map(p => React.createElement("option", {
    key: p.id,
    value: p.id
  }, p.name)))), patients.length === 0 && React.createElement("div", {
    style: {
      color: C.gold,
      fontSize: 12,
      textAlign: "center",
      padding: "8px",
      background: C.gold + "11",
      borderRadius: 8
    }
  }, "⚠️ لا يوجد مرضى — أضف مريضاً أولاً من شاشة المرضى"), React.createElement(Field, {
    label: "تاريخ الوصفة"
  }, React.createElement("input", {
    style: inp(),
    type: "date",
    value: f.date,
    onChange: s("date")
  })), React.createElement(Field, {
    label: "العين المعالجة"
  }, React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, ["العين اليمنى", "العين اليسرى", "كلتا العينين"].map(opt => React.createElement("div", {
    key: opt,
    onClick: () => setF(v => ({
      ...v,
      eye: opt
    })),
    style: {
      flex: 1,
      textAlign: "center",
      padding: "9px 4px",
      background: f.eye === opt ? C.accent + "22" : C.card,
      border: `1px solid ${f.eye === opt ? C.accent : C.border}`,
      borderRadius: 10,
      cursor: "pointer",
      color: f.eye === opt ? C.accent : C.muted,
      fontSize: 10,
      fontWeight: 600
    }
  }, opt)))), React.createElement(Field, {
    label: "ملاحظات"
  }, React.createElement("textarea", {
    style: {
      ...inp(),
      resize: "none"
    },
    rows: 2,
    value: f.notes,
    onChange: s("notes"),
    placeholder: "ملاحظات..."
  }))), step === 1 && React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, [["اليمنى", "R", needR], ["اليسرى", "L", needL]].map(([lbl, side, needed]) => React.createElement("div", {
    key: side,
    style: {
      background: C.card,
      border: `1px solid ${needed ? C.border : C.border + "55"}`,
      borderRadius: 14,
      padding: 14,
      opacity: needed ? 1 : 0.45
    }
  }, React.createElement("div", {
    style: {
      color: C.accent,
      fontWeight: 700,
      fontSize: 13,
      marginBottom: 12
    }
  }, "👁 العين ", lbl, " ", !needed && React.createElement("span", {
    style: {
      color: C.muted,
      fontSize: 10,
      fontWeight: 400
    }
  }, "(غير مختارة)")), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr",
      gap: 8
    }
  }, React.createElement("div", null, React.createElement("label", {
    style: {
      color: C.muted,
      fontSize: 11,
      display: "block",
      marginBottom: 5
    }
  }, "SPH"), React.createElement("select", {
    disabled: !needed,
    style: {
      ...inp({
        textAlign: "center",
        padding: "8px 4px",
        fontSize: 13
      })
    },
    value: f["sph" + side] || "+0.00",
    onChange: e => {
      setF(v => ({
        ...v,
        ["sph" + side]: e.target.value
      }));
    }
  }, SPH_OPTIONS.map(o => React.createElement("option", {
    key: o,
    value: o
  }, o)))), React.createElement("div", null, React.createElement("label", {
    style: {
      color: C.muted,
      fontSize: 11,
      display: "block",
      marginBottom: 5
    }
  }, "CYL"), React.createElement("select", {
    disabled: !needed,
    style: {
      ...inp({
        textAlign: "center",
        padding: "8px 4px",
        fontSize: 13
      })
    },
    value: f["cyl" + side] || "0.00",
    onChange: e => {
      const cylVal = e.target.value;
      setF(v => ({
        ...v,
        ["cyl" + side]: cylVal
      }));
      if (cylVal === "0.00") setErrors(v => ({
        ...v,
        ["axis" + side]: undefined
      }));
    }
  }, CYL_OPTIONS.map(o => React.createElement("option", {
    key: o,
    value: o
  }, o)))), React.createElement("div", null, React.createElement("label", {
    style: {
      color: errors["axis" + side] ? C.danger : C.muted,
      fontSize: 11,
      display: "block",
      marginBottom: 5,
      fontWeight: "700"
    }
  }, "AXIS ", f["cyl" + side] && f["cyl" + side] !== "0.00" && React.createElement("span", {
    style: {
      color: C.danger
    }
  }, "*")), React.createElement("select", {
    disabled: !needed,
    style: {
      ...inp({
        textAlign: "center",
        padding: "8px 4px",
        fontSize: 13,
        border: `1px solid ${errors["axis" + side] ? C.danger : C.border}`,
        background: errors["axis" + side] ? C.danger + "11" : C.bg
      })
    },
    value: f["axis" + side] || "0",
    onChange: e => {
      setF(v => ({
        ...v,
        ["axis" + side]: e.target.value
      }));
      setErrors(v => ({
        ...v,
        ["axis" + side]: undefined
      }));
    }
  }, AXIS_OPTIONS.map(o => React.createElement("option", {
    key: o,
    value: o
  }, o, "°"))), errors["axis" + side] && React.createElement("div", {
    style: {
      color: C.danger,
      fontSize: 9,
      marginTop: 3
    }
  }, "⚠ مطلوب مع CYL"))))), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10
    }
  }, React.createElement(Field, {
    label: "ADD (الإضافة)"
  }, React.createElement("select", {
    style: inp({
      textAlign: "center"
    }),
    value: f.add || "0.00",
    onChange: s("add")
  }, ["0.00", "0.25", "0.50", "0.75", "1.00", "1.25", "1.50", "1.75", "2.00", "2.25", "2.50", "2.75", "3.00", "3.25", "3.50"].map(o => React.createElement("option", {
    key: o,
    value: o
  }, "+", o)))), React.createElement(Field, {
    label: "I.P.D (mm)"
  }, React.createElement("select", {
    style: {
      ...inp(),
      textAlign: "center"
    },
    value: f.ipd || "62",
    onChange: s("ipd")
  }, Array.from({
    length: Math.round((75 - 50) / 0.5) + 1
  }, (_, i) => (50 + i * 0.5).toFixed(1)).map(v => React.createElement("option", {
    key: v,
    value: v
  }, v))))), (errors.axisR || errors.axisL) && React.createElement("div", {
    style: {
      background: C.danger + "11",
      border: `1px solid ${C.danger}44`,
      borderRadius: 10,
      padding: "10px 14px",
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  }, React.createElement("span", {
    style: {
      fontSize: 16
    }
  }, "⚠️"), React.createElement("span", {
    style: {
      color: C.danger,
      fontSize: 12,
      fontWeight: 600
    }
  }, "عند إدخال CYL يجب إدخال AXIS للعين ", errors.axisR && errors.axisL ? "كلتيهما" : errors.axisR ? "اليمنى" : "اليسرى"))), step === 2 && React.createElement(MedicinesStep, {
    medicines: f.medicines,
    onChange: val => setF(v => ({
      ...v,
      medicines: val
    }))
  }), React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      marginTop: 20
    }
  }, step > 0 && React.createElement(Btn, {
    outline: true,
    onClick: () => setStep(p => p - 1)
  }, "السابق"), step < 2 ? React.createElement(Btn, {
    full: true,
    onClick: handleNext
  }, "التالي →") : React.createElement(React.Fragment, null, React.createElement(Btn, {
    outline: true,
    full: true,
    onClick: onClose
  }, "إلغاء"), React.createElement(Btn, {
    full: true,
    onClick: handleSave
  }, "✓ حفظ"))));
}
function Prescriptions({
  prescriptions,
  setRx,
  patients,
  doctorNames = [],
  primaryDoctor,
  clinic
}) {
  const [modal, setModal] = useState(null);
  const [viewRx, setViewRx] = useState(null);
  const [printRx, setPrintRx] = useState(null);
  const add = f => setRx([...prescriptions, {
    ...f,
    id: Date.now()
  }]);
  const edit = f => setRx(prescriptions.map(r => r.id === f.id ? f : r));
  const del = async id => {
    const rec = prescriptions.find(r => r.id === id);
    await trashPut("iapp_prescriptions", rec, "روشتة");
    setRx(prescriptions.filter(r => r.id !== id));
    logAudit("حذف روشتة", rec && rec.date + " · " + (rec.patient || "") || id);
  };
  const getPatient = rx => patients.find(p => p.id === rx.patientId || p.name === rx.patient);
  return React.createElement("div", {
    style: {
      padding: "16px 16px 90px"
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 16
    }
  }, React.createElement("span", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 16
    }
  }, "الوصفات (", prescriptions.length, ")"), React.createElement(Btn, {
    small: true,
    onClick: () => setModal("add")
  }, "+ وصفة جديدة")), prescriptions.map(rx => React.createElement("div", {
    key: rx.id,
    style: {
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 16,
      padding: 14,
      marginBottom: 10
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      marginBottom: 10
    }
  }, React.createElement("div", {
    style: {
      width: 40,
      height: 40,
      borderRadius: 10,
      background: C.teal + "22",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 18
    }
  }, "🔬"), React.createElement("div", {
    style: {
      flex: 1
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 14
    }
  }, rx.patient), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11
    }
  }, rx.date, " · ", rx.eye))), React.createElement("div", {
    style: {
      display: "flex",
      gap: 6
    }
  }, React.createElement("div", {
    onClick: () => setViewRx(rx),
    style: {
      background: C.teal + "22",
      borderRadius: 8,
      padding: "6px 0",
      color: C.teal,
      fontSize: 11,
      fontWeight: 600,
      cursor: "pointer",
      flex: 1,
      textAlign: "center"
    }
  }, "عرض"), React.createElement("div", {
    onClick: () => setPrintRx(rx),
    style: {
      background: C.purple + "22",
      borderRadius: 8,
      padding: "6px 10px",
      color: C.purple,
      fontSize: 11,
      fontWeight: 600,
      cursor: "pointer"
    }
  }, "🖨️"), React.createElement("div", {
    onClick: () => setModal({
      edit: rx
    }),
    style: {
      background: C.accent + "22",
      borderRadius: 8,
      padding: "6px 10px",
      color: C.accent,
      fontSize: 11,
      cursor: "pointer"
    }
  }, "✏"), React.createElement("div", {
    onClick: () => setModal({
      del: rx.id
    }),
    style: {
      background: C.danger + "22",
      borderRadius: 8,
      padding: "6px 10px",
      color: C.danger,
      fontSize: 11,
      cursor: "pointer"
    }
  }, "🗑")))), prescriptions.length === 0 && React.createElement("div", {
    style: {
      color: C.muted,
      textAlign: "center",
      padding: 30,
      fontSize: 13
    }
  }, "لا توجد وصفات"), viewRx && React.createElement(Modal, {
    title: `وصفة: ${viewRx.patient}`,
    onClose: () => setViewRx(null)
  }, React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 10
    }
  }, [["اليمنى", viewRx.sphR, viewRx.cylR, viewRx.axisR], ["اليسرى", viewRx.sphL, viewRx.cylL, viewRx.axisL]].map(([eye, sph, cyl, axis]) => React.createElement("div", {
    key: eye,
    style: {
      background: C.bg,
      borderRadius: 10,
      padding: 12
    }
  }, React.createElement("div", {
    style: {
      color: C.teal,
      fontWeight: 600,
      marginBottom: 6
    }
  }, "العين ", eye), React.createElement("div", {
    style: {
      display: "flex",
      gap: 16
    }
  }, React.createElement("span", {
    style: {
      color: C.muted,
      fontSize: 12
    }
  }, "SPH: ", React.createElement("b", {
    style: {
      color: C.text
    }
  }, sph || "-")), React.createElement("span", {
    style: {
      color: C.muted,
      fontSize: 12
    }
  }, "CYL: ", React.createElement("b", {
    style: {
      color: C.text
    }
  }, cyl || "-")), React.createElement("span", {
    style: {
      color: C.muted,
      fontSize: 12
    }
  }, "AXIS: ", React.createElement("b", {
    style: {
      color: C.text
    }
  }, axis || "-"))))), viewRx.add && React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 12
    }
  }, "ADD: ", React.createElement("b", {
    style: {
      color: C.text
    }
  }, viewRx.add)), viewRx.medicines && React.createElement("div", {
    style: {
      background: C.gold + "11",
      borderRadius: 10,
      padding: 12
    }
  }, React.createElement("div", {
    style: {
      color: C.gold,
      fontWeight: 700,
      fontSize: 12,
      marginBottom: 4
    }
  }, "الأدوية"), React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 12,
      whiteSpace: "pre-wrap"
    }
  }, viewRx.medicines)), viewRx.notes && React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 12,
      background: C.card,
      borderRadius: 10,
      padding: 10
    }
  }, viewRx.notes), React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, React.createElement(Btn, {
    full: true,
    onClick: () => setViewRx(null)
  }, "إغلاق"), React.createElement(Btn, {
    full: true,
    color: C.purple,
    onClick: () => {
      setViewRx(null);
      setPrintRx(viewRx);
    }
  }, "🖨️ طباعة")))), modal === "add" && React.createElement(Modal, {
    title: "وصفة جديدة",
    onClose: () => setModal(null)
  }, React.createElement(RxForm, {
    doctorNames: doctorNames,
    patients: patients,
    onSave: f => {
      add(f);
      setModal(null);
    },
    onClose: () => setModal(null)
  })), modal && modal.edit && React.createElement(Modal, {
    title: "تعديل الوصفة",
    onClose: () => setModal(null)
  }, React.createElement(RxForm, {
    doctorNames: doctorNames,
    patients: patients,
    initial: modal.edit,
    onSave: f => {
      edit(f);
      setModal(null);
    },
    onClose: () => setModal(null)
  })), modal && modal.del && React.createElement(Confirm, {
    msg: "حذف هذه الوصفة؟",
    onOk: () => {
      del(modal.del);
      setModal(null);
    },
    onNo: () => setModal(null)
  }), printRx && React.createElement(PrintModal, {
    rx: printRx,
    patient: getPatient(printRx),
    primaryDoctor: primaryDoctor,
    clinic: clinic,
    onClose: () => setPrintRx(null)
  }));
}
const DEFAULT_TESTS = [{
  id: "oct",
  name: "OCT",
  name_ar: "تصوير الشبكية المقطعي",
  cat: "شبكية"
}, {
  id: "ffa",
  name: "FFA",
  name_ar: "تصوير الأوعية بالفلوريسين",
  cat: "شبكية"
}, {
  id: "optos",
  name: "Optos",
  name_ar: "تصوير قاع العين الواسع",
  cat: "شبكية"
}, {
  id: "octa",
  name: "OCT Angio",
  name_ar: "أنجيوغرافيا OCT",
  cat: "شبكية"
}, {
  id: "vf",
  name: "Visual Field",
  name_ar: "مجال الإبصار",
  cat: "جلوكوما"
}, {
  id: "penta",
  name: "Pentacam",
  name_ar: "خريطة القرنية",
  cat: "قرنية"
}, {
  id: "topo",
  name: "Topography",
  name_ar: "طبوغرافيا القرنية",
  cat: "قرنية"
}, {
  id: "pachy",
  name: "Pachymetry",
  name_ar: "قياس سماكة القرنية",
  cat: "قرنية"
}, {
  id: "bio",
  name: "Biometry",
  name_ar: "قياسات ما قبل الجراحة",
  cat: "جراحة"
}, {
  id: "echo",
  name: "B-Scan",
  name_ar: "سونار العين",
  cat: "أخرى"
}, {
  id: "erg",
  name: "ERG",
  name_ar: "كهربية الشبكية",
  cat: "أخرى"
}, {
  id: "ep",
  name: "VEP",
  name_ar: "استجابة القشرة البصرية",
  cat: "أخرى"
}];
const CAT_COLORS = {
  "شبكية": C.accent,
  "جلوكوما": C.teal,
  "قرنية": C.gold,
  "جراحة": C.purple,
  "أخرى": C.muted,
  "مخصص": C.success
};
const getRadiologyHTML = safeTemplate(_getRadiologyHTMLRaw);
function _getRadiologyHTMLRaw(selected, patient, notes, primary, allTests, clinic) {
  const docName = primary && primary.name || "د. عبدالستار صقر";
  const cl = clinic || {};
  const address = cl.address || "دمنهور - برج المنتزه بجوار حديقة الجمهورية | الرحمانية - ش أحمد محمود بجوار فرع we";
  const phone = cl.phone || "دمنهور: 0453333313 | الرحمانية: 01111480137";
  const date = new Date().toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  const EYE_AR = {
    OU: "كلتا العينين",
    OD: "العين اليمنى",
    OS: "العين اليسرى"
  };
  const EYE_EN = {
    OU: "OU",
    OD: "OD",
    OS: "OS"
  };
  const grouped = {};
  Object.keys(selected).forEach(id => {
    const t = allTests.find(x => x.id === id);
    if (!t) return;
    if (!grouped[t.cat]) grouped[t.cat] = [];
    grouped[t.cat].push({
      ...t,
      eye: selected[id]
    });
  });
  const p = patient || {};
  const totalCount = Object.keys(selected).length;
  return `<!DOCTYPE html><html dir="rtl" lang="ar">
<head><meta charset="UTF-8"><title>طلب فحوصات</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;background:#fff;color:#111;direction:rtl;}
  .page{width:210mm;min-height:160mm;margin:0 auto;padding:14mm 15mm;}
  .header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #00C2FF;padding-bottom:12px;margin-bottom:16px;}
  .clinic{font-size:18px;font-weight:800;color:#00C2FF;}
  .sub{font-size:11px;color:#555;margin-top:3px;}
  .badge{background:#00C2FF;color:#fff;padding:6px 16px;border-radius:20px;font-size:13px;font-weight:700;}
  .patient-row{display:flex;gap:20px;margin-bottom:14px;padding:10px 14px;background:#f0f9ff;border-radius:8px;flex-wrap:wrap;}
  .pinfo{font-size:11px;color:#555;}
  .pinfo span{font-weight:700;color:#111;margin-right:4px;}
  .section{margin-bottom:12px;}
  .cat-title{font-size:12px;font-weight:700;color:#00C2FF;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #e0f4ff;}
  .tests-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
  .test-item{display:flex;align-items:center;gap:10px;padding:8px 12px;border:1.5px solid #d0eaff;border-radius:8px;background:#f8fbff;}
  .checkbox{width:18px;height:18px;border:2px solid #00C2FF;border-radius:4px;background:#00C2FF;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
  .check{color:#fff;font-size:12px;font-weight:800;}
  .test-name{font-size:13px;font-weight:700;color:#111;}
  .test-ar{font-size:10px;color:#555;margin-top:1px;}
  .eye-badge{margin-right:auto;background:#e8f4ff;border:1px solid #b0d8ff;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700;color:#0066aa;direction:ltr;}
  .notes-box{background:#fffbf0;border:1.5px solid #FFB830;border-radius:8px;padding:10px 14px;margin-top:14px;}
  .notes-title{font-size:11px;font-weight:700;color:#c07800;margin-bottom:4px;}
  .footer{margin-top:16px;display:flex;justify-content:space-between;align-items:flex-end;border-top:1px solid #eee;padding-top:12px;}
  .sig{text-align:center;}
  .sig-line{border-top:1px solid #333;width:140px;margin:0 auto 4px;}
  .sig-name{font-size:11px;color:#444;}
  .total-badge{background:#00C2FF22;border:1px solid #00C2FF44;border-radius:10px;padding:6px 14px;font-size:12px;color:#00C2FF;font-weight:700;}
  @media print{.page{padding:8mm;position:relative;overflow:hidden;}}
</style></head>
<body>
<div class="page"><div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:80px;font-weight:900;color:#00C2FF;opacity:0.05;pointer-events:none;z-index:0;letter-spacing:8px;font-family:Georgia,serif;white-space:nowrap;">I App</div>
  <div class="header">
    <div>
      <div class="clinic">👁 عيادة ${docName}</div>
      <div class="sub">استشاري طب وجراحة العيون والليزر</div>
    </div>
    <div class="badge">🩻 طلب فحوصات وإشعاعات</div>
  </div>
  <div class="patient-row">
    <div class="pinfo">المريض: <span>${p.name || "—"}</span></div>
    <div class="pinfo">رقم الملف: <span>${p.patientCode || "—"}</span></div>
    <div class="pinfo">العمر: <span>${p.age ? p.age + " سنة" : "—"}</span></div>
    <div class="pinfo">التاريخ: <span>${date}</span></div>
    ${p.phone ? `<div class="pinfo">الهاتف: <span>${p.phone}</span></div>` : ""}
  </div>
  ${Object.entries(grouped).map(([cat, tests]) => `
  <div class="section">
    <div class="cat-title">${cat}</div>
    <div class="tests-grid">
      ${tests.map(t => `
      <div class="test-item">
        <div class="checkbox"><div class="check">✓</div></div>
        <div style="flex:1">
          <div class="test-name">${t.name}</div>
          <div class="test-ar">${t.name_ar}</div>
        </div>
        <div class="eye-badge">${EYE_EN[t.eye] || t.eye || "OU"}</div>
      </div>`).join("")}
    </div>
  </div>`).join("")}
  ${notes ? `<div class="notes-box"><div class="notes-title">📝 ملاحظات وتعليمات:</div><div style="font-size:12px;color:#333;line-height:1.7">${notes}</div></div>` : ""}
  <div class="footer">
    <div class="total-badge">Total investigations ordered: ${totalCount}</div>
    <div style="font-size:9px;color:#555;text-align:right;line-height:1.8;">
      ${address ? `<div>📍 ${address}</div>` : ""}
      ${phone ? `<div>📞 ${phone}</div>` : ""}
    </div>
    <div class="sig">
      <div class="sig-line"></div>
      <div class="sig-name">${docName}</div>
    </div>
  </div>
</div></body></html>`;
}
function Radiology({
  patients,
  customTests,
  setCustomTests,
  setExams,
  primary,
  clinic
}) {
  const allTests = [...DEFAULT_TESTS, ...customTests.map(t => ({
    ...t,
    cat: "مخصص"
  }))];
  const cats = [...new Set(allTests.map(t => t.cat))];
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patientSearch, setPatientSearch] = useState("");
  const [showPatientList, setShowPatientList] = useState(false);
  const [selected, setSelected] = useState({});
  const [notes, setNotes] = useState("");
  const [addModal, setAddModal] = useState(false);
  const [newTest, setNewTest] = useState({
    name: "",
    name_ar: ""
  });
  const [printed, setPrinted] = useState(false);
  const [filterCat, setFilterCat] = useState("الكل");
  const [search, setSearch] = useState("");
  const selectedIds = Object.keys(selected);
  const isSelected = id => id in selected;
  const getEye = id => selected[id] || "OU";
  const toggle = id => setSelected(s => {
    if (id in s) {
      const n = {
        ...s
      };
      delete n[id];
      return n;
    }
    return {
      ...s,
      [id]: "OU"
    };
  });
  const cycleEye = (e, id) => {
    e.stopPropagation();
    setSelected(s => {
      if (!(id in s)) return s;
      const next = EYE_CYCLE[s[id]] || "OU";
      return {
        ...s,
        [id]: next
      };
    });
  };
  const selectAll = cat => {
    const ids = allTests.filter(t => t.cat === cat).map(t => t.id);
    const allIn = ids.every(id => isSelected(id));
    setSelected(s => {
      const n = {
        ...s
      };
      if (allIn) {
        ids.forEach(id => delete n[id]);
      } else {
        ids.forEach(id => {
          if (!(id in n)) n[id] = "OU";
        });
      }
      return n;
    });
  };
  const addCustom = () => {
    if (!newTest.name) return;
    const t = {
      id: "custom_" + Date.now(),
      name: newTest.name,
      name_ar: newTest.name_ar || newTest.name
    };
    setCustomTests([...customTests, t]);
    setSelected(s => ({
      ...s,
      [t.id]: "OU"
    }));
    setNewTest({
      name: "",
      name_ar: ""
    });
    setAddModal(false);
  };
  const delCustom = id => {
    setCustomTests(customTests.filter(t => t.id !== id));
    setSelected(s => {
      const n = {
        ...s
      };
      delete n[id];
      return n;
    });
  };
  const EYE_LABEL = {
    OU: "كلتا العينين",
    OD: "العين اليمنى",
    OS: "العين اليسرى"
  };
  const EYE_SHORT = {
    OU: "OU",
    OD: "OD",
    OS: "OS"
  };
  const EYE_COLOR = {
    OU: C.teal,
    OD: C.accent,
    OS: C.gold
  };
  const EYE_CYCLE = {
    OU: "OD",
    OD: "OS",
    OS: "OU"
  };
  const saveRequest = async () => {
    if (selectedIds.length === 0) {
      alert("اختر فحصاً واحداً على الأقل");
      return;
    }
    if (!selectedPatient) {
      alert("اختر المريض أولاً لحفظ طلب الفحوصات");
      return;
    }
    const tests = selectedIds.map(id => {
      const t = allTests.find(x => x.id === id);
      return t ? {
        id: t.id,
        name: t.name,
        name_ar: t.name_ar,
        category: t.cat,
        eye: selected[id] || "OU"
      } : null;
    }).filter(Boolean);
    const remote = await sbGet("iapp_exams");
    const base = Array.isArray(remote) ? remote : [];
    const rec = {
      id: Date.now(),
      patientId: selectedPatient.id,
      patient: selectedPatient.name,
      date: localISO(),
      time: new Date().toTimeString().slice(0, 5),
      doctor: primary && primary.name || "",
      testType: "طلب فحوصات",
      requestedTests: tests,
      notes: notes || "",
      status: "requested"
    };
    await setExams([...base, rec]);
    setPrinted(true);
    setTimeout(() => setPrinted(false), 3000);
  };
  const doPrint = () => {
    if (selectedIds.length === 0) return;
    const html = getRadiologyHTML(selected, selectedPatient, notes, primary, allTests, clinic);
    printDoc(html);
  };
  const visibleTests = allTests.filter(t => (filterCat === "الكل" || t.cat === filterCat) && (t.name.toLowerCase().includes(search.toLowerCase()) || t.name_ar.includes(search)));
  return React.createElement("div", {
    style: {
      padding: "16px 16px 90px"
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 16
    }
  }, React.createElement("div", null, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 16
    }
  }, "🔬 Investigations & Imaging"), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11,
      marginTop: 2
    }
  }, selectedIds.length, " فحص محدد")), React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, React.createElement(Btn, {
    small: true,
    color: C.purple,
    onClick: () => setAddModal(true)
  }, "+ إضافة"), React.createElement(Btn, {
    small: true,
    color: C.accent,
    onClick: saveRequest
  }, "💾 حفظ الطلب"), React.createElement(Btn, {
    small: true,
    color: C.success,
    onClick: doPrint
  }, "🖨️ طباعة"))), React.createElement("div", {
    style: {
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      padding: 12,
      marginBottom: 14,
      position: "relative"
    }
  }, React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11,
      marginBottom: 6
    }
  }, "المريض (اختياري للطباعة)"), selectedPatient ? React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  }, React.createElement("div", {
    style: {
      flex: 1,
      background: C.accent + "22",
      border: `1px solid ${C.accent}`,
      borderRadius: 8,
      padding: "8px 12px"
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 13
    }
  }, selectedPatient.name), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10
    }
  }, selectedPatient.patientCode, " · ", selectedPatient.phone)), React.createElement("div", {
    onClick: () => {
      setSelectedPatient(null);
      setPatientSearch("");
    },
    style: {
      color: C.danger,
      fontSize: 20,
      cursor: "pointer",
      padding: "0 6px"
    }
  }, "×")) : React.createElement("div", {
    style: {
      position: "relative"
    }
  }, React.createElement("input", {
    value: patientSearch,
    onChange: e => {
      setPatientSearch(e.target.value);
      setShowPatientList(true);
    },
    onFocus: () => setShowPatientList(true),
    onBlur: () => setTimeout(() => setShowPatientList(false), 200),
    placeholder: "ابحث بالاسم أو رقم الملف...",
    style: {
      ...inp(),
      paddingRight: 36
    }
  }), React.createElement("span", {
    style: {
      position: "absolute",
      right: 10,
      top: "50%",
      transform: "translateY(-50%)",
      color: C.accent,
      fontSize: 14
    }
  }, "🔍"), showPatientList && React.createElement("div", {
    style: {
      position: "absolute",
      top: "100%",
      right: 0,
      left: 0,
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: 10,
      zIndex: 200,
      maxHeight: 180,
      overflowY: "auto",
      marginTop: 4
    }
  }, patients.filter(p => !patientSearch || (p.name || "").includes(patientSearch) || (p.patientCode || "").includes(patientSearch) || (p.phone || "").includes(patientSearch)).slice(0, 8).map(p => React.createElement("div", {
    key: p.id,
    onMouseDown: () => {
      setSelectedPatient(p);
      setPatientSearch("");
      setShowPatientList(false);
    },
    style: {
      padding: "10px 14px",
      borderBottom: `1px solid ${C.border}33`,
      cursor: "pointer"
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 13,
      fontWeight: 600
    }
  }, p.name), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10
    }
  }, p.patientCode, " · ", p.phone))), patients.filter(p => !patientSearch || (p.name || "").includes(patientSearch) || (p.patientCode || "").includes(patientSearch)).length === 0 && React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 12,
      padding: "10px 14px",
      textAlign: "center"
    }
  }, "لا توجد نتائج")))), React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginBottom: 14
    }
  }, [["OU", C.teal], ["OD", C.accent], ["OS", C.gold]].map(([k, col]) => React.createElement("div", {
    key: k,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 5,
      background: col + "15",
      border: `1px solid ${col}44`,
      borderRadius: 8,
      padding: "4px 10px"
    }
  }, React.createElement("div", {
    style: {
      width: 22,
      height: 18,
      borderRadius: 5,
      background: col,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 9,
      fontWeight: 800,
      color: "#fff",
      letterSpacing: -0.5
    }
  }, k)))), React.createElement("div", {
    style: {
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      padding: "8px 14px",
      marginBottom: 12,
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  }, React.createElement("span", {
    style: {
      color: C.accent
    }
  }, "🔍"), React.createElement("input", {
    value: search,
    onChange: e => setSearch(e.target.value),
    placeholder: "ابحث عن فحص...",
    style: {
      background: "none",
      border: "none",
      outline: "none",
      color: C.text,
      fontSize: 13,
      flex: 1,
      direction: "rtl",
      fontFamily: "inherit"
    }
  })), React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginBottom: 16,
      overflowX: "auto",
      paddingBottom: 4
    }
  }, ["الكل", ...cats].map(cat => React.createElement("button", {
    key: cat,
    onClick: () => setFilterCat(cat),
    style: {
      background: filterCat === cat ? `linear-gradient(135deg,${CAT_COLORS[cat] || C.accent},${C.teal})` : C.card,
      border: `1px solid ${filterCat === cat ? "transparent" : C.border}`,
      borderRadius: 20,
      padding: "5px 14px",
      color: filterCat === cat ? C.bg : C.muted,
      fontSize: 11,
      fontWeight: 600,
      cursor: "pointer",
      whiteSpace: "nowrap",
      fontFamily: "inherit"
    }
  }, cat))), (filterCat === "الكل" ? cats : [filterCat]).map(cat => {
    const testsInCat = visibleTests.filter(t => t.cat === cat);
    if (testsInCat.length === 0) return null;
    const catColor = CAT_COLORS[cat] || C.accent;
    const allCatSel = testsInCat.every(t => isSelected(t.id));
    return React.createElement("div", {
      key: cat,
      style: {
        marginBottom: 16
      }
    }, React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 10
      }
    }, React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 8
      }
    }, React.createElement("div", {
      style: {
        width: 10,
        height: 10,
        borderRadius: "50%",
        background: catColor
      }
    }), React.createElement("span", {
      style: {
        color: catColor,
        fontWeight: 700,
        fontSize: 13
      }
    }, cat), React.createElement("span", {
      style: {
        color: C.muted,
        fontSize: 11
      }
    }, "(", testsInCat.filter(t => isSelected(t.id)).length, "/", testsInCat.length, ")")), React.createElement("div", {
      onClick: () => selectAll(cat),
      style: {
        color: catColor,
        fontSize: 11,
        cursor: "pointer",
        background: catColor + "22",
        borderRadius: 8,
        padding: "3px 10px",
        fontWeight: 600
      }
    }, allCatSel ? "إلغاء الكل" : "تحديد الكل")), React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 8
      }
    }, testsInCat.map(t => {
      const sel = isSelected(t.id);
      const eye = getEye(t.id);
      const eyeCol = EYE_COLOR[eye];
      return React.createElement("div", {
        key: t.id,
        style: {
          background: sel ? catColor + "15" : C.card,
          border: `2px solid ${sel ? catColor : C.border}`,
          borderRadius: 14,
          padding: "12px 14px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          transition: "all 0.15s"
        }
      }, React.createElement("div", {
        onClick: () => toggle(t.id),
        style: {
          width: 26,
          height: 26,
          borderRadius: 8,
          background: sel ? catColor : "transparent",
          border: `2px solid ${sel ? catColor : C.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          cursor: "pointer",
          transition: "all 0.15s"
        }
      }, sel && React.createElement("span", {
        style: {
          color: C.bg,
          fontSize: 14,
          fontWeight: 800
        }
      }, "✓")), React.createElement("div", {
        style: {
          flex: 1,
          cursor: "pointer"
        },
        onClick: () => toggle(t.id)
      }, React.createElement("div", {
        style: {
          color: C.text,
          fontWeight: 700,
          fontSize: 14
        }
      }, t.name), React.createElement("div", {
        style: {
          color: C.muted,
          fontSize: 11,
          marginTop: 2
        }
      }, t.name_ar)), sel && React.createElement("div", {
        onClick: e => cycleEye(e, t.id),
        style: {
          display: "flex",
          alignItems: "center",
          gap: 5,
          background: EYE_COLOR[eye] + "22",
          border: `1.5px solid ${EYE_COLOR[eye]}`,
          borderRadius: 10,
          padding: "5px 10px",
          cursor: "pointer",
          flexShrink: 0
        }
      }, React.createElement("div", {
        style: {
          background: EYE_COLOR[eye],
          color: "#fff",
          borderRadius: 5,
          padding: "1px 6px",
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: 0.5
        }
      }, EYE_SHORT[eye] || eye), React.createElement("span", {
        style: {
          color: EYE_COLOR[eye],
          fontSize: 10,
          opacity: 0.7
        }
      }, "↻")), t.cat === "مخصص" && React.createElement("div", {
        onClick: e => {
          e.stopPropagation();
          delCustom(t.id);
        },
        style: {
          color: C.danger,
          fontSize: 18,
          cursor: "pointer",
          padding: "2px 6px",
          flexShrink: 0
        }
      }, "×"));
    })));
  }), React.createElement("div", {
    style: {
      marginTop: 4
    }
  }, React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11,
      marginBottom: 6
    }
  }, "ملاحظات للطلب"), React.createElement("textarea", {
    value: notes,
    onChange: e => setNotes(e.target.value),
    rows: 3,
    placeholder: "تعليمات خاصة، صيام، ...",
    style: {
      ...inp(),
      resize: "none"
    }
  })), selectedIds.length > 0 && React.createElement("div", {
    style: {
      position: "fixed",
      bottom: 70,
      left: 0,
      right: 0,
      maxWidth: 480,
      margin: "0 auto",
      background: C.surface,
      borderTop: `1px solid ${C.border}`,
      padding: "10px 16px",
      zIndex: 150,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between"
    }
  }, React.createElement("div", null, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 13
    }
  }, selectedIds.length, " فحص محدد"), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10,
      marginTop: 2
    }
  }, selectedIds.map(id => {
    const t = allTests.find(t => t.id === id);
    return t ? `${t.name}·${selected[id] || "OU"}` : "";
  }).filter(Boolean).join("  "))), React.createElement(Btn, {
    small: true,
    onClick: () => setSelected({})
  }, "مسح")), printed && React.createElement("div", {
    style: {
      position: "fixed",
      top: 80,
      left: "50%",
      transform: "translateX(-50%)",
      background: C.success,
      color: C.bg,
      borderRadius: 12,
      padding: "10px 20px",
      fontWeight: 700,
      fontSize: 13,
      zIndex: 500
    }
  }, "✓ تم فتح نافذة الطباعة"), addModal && React.createElement("div", {
    style: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.8)",
      zIndex: 400,
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "center"
    },
    onClick: () => setAddModal(false)
  }, React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      background: C.surface,
      borderRadius: "20px 20px 0 0",
      padding: "20px 16px 40px",
      width: "100%",
      maxWidth: 480,
      border: `1px solid ${C.border}`
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 16
    }
  }, React.createElement("span", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 15
    }
  }, "إضافة فحص مخصص"), React.createElement("span", {
    onClick: () => setAddModal(false),
    style: {
      color: C.muted,
      fontSize: 26,
      cursor: "pointer"
    }
  }, "×")), React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, React.createElement(Field, {
    label: "اسم الفحص (إنجليزي / اختصار)"
  }, React.createElement("input", {
    style: inp(),
    value: newTest.name,
    onChange: e => setNewTest(v => ({
      ...v,
      name: e.target.value
    })),
    placeholder: "مثال: HRT"
  })), React.createElement(Field, {
    label: "الاسم بالعربي"
  }, React.createElement("input", {
    style: inp(),
    value: newTest.name_ar,
    onChange: e => setNewTest(v => ({
      ...v,
      name_ar: e.target.value
    })),
    placeholder: "مثال: تصوير القرص البصري"
  })), React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      marginTop: 4
    }
  }, React.createElement(Btn, {
    outline: true,
    full: true,
    onClick: () => setAddModal(false)
  }, "إلغاء"), React.createElement(Btn, {
    full: true,
    onClick: addCustom
  }, "✓ إضافة وتحديد"))))));
}
const PRICE_ICONS = ["👁", "💬", "🔍", "👓", "🔵", "⚡", "🏥", "💉", "📋", "🩺", "💊", "🔬", "🧪", "📊", "🩻"];
function PriceForm({
  initial,
  onSave,
  onClose
}) {
  const blank = {
    name: "",
    price: "",
    icon: "👁"
  };
  const [f, setF] = useState(initial ? {
    ...initial
  } : blank);
  const s = k => e => setF(v => ({
    ...v,
    [k]: e.target.value
  }));
  return React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, React.createElement(Field, {
    label: "اسم الخدمة"
  }, React.createElement("input", {
    style: inp(),
    value: f.name,
    onChange: s("name"),
    placeholder: "كشف روتيني، استشارة..."
  })), React.createElement(Field, {
    label: "السعر (ج.م)"
  }, React.createElement("input", {
    style: inp({
      textAlign: "center",
      fontSize: 18,
      fontWeight: 700,
      color: C.gold
    }),
    type: "number",
    value: f.price,
    onChange: s("price"),
    placeholder: "0"
  })), React.createElement(Field, {
    label: "الأيقونة"
  }, React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: 8
    }
  }, PRICE_ICONS.map(ico => React.createElement("div", {
    key: ico,
    onClick: () => setF(v => ({
      ...v,
      icon: ico
    })),
    style: {
      width: 40,
      height: 40,
      borderRadius: 10,
      background: f.icon === ico ? C.gold + "33" : C.bg,
      border: `2px solid ${f.icon === ico ? C.gold : C.border}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 20,
      cursor: "pointer"
    }
  }, ico)))), React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      marginTop: 8
    }
  }, React.createElement(Btn, {
    outline: true,
    full: true,
    onClick: onClose
  }, "إلغاء"), React.createElement(Btn, {
    full: true,
    onClick: () => f.name && f.price && onSave(f)
  }, "حفظ")));
}
function DoctorForm({
  initial,
  onSave,
  onClose
}) {
  const blank = {
    name: "",
    short: "",
    title: "طبيب عيون",
    initial: "",
    isPrimary: false
  };
  const [f, setF] = useState(initial ? {
    ...initial
  } : blank);
  const s = k => e => setF(v => ({
    ...v,
    [k]: e.target.value
  }));
  const handleName = e => {
    const name = e.target.value;
    const parts = name.replace("د.", "").trim().split(" ");
    const ini = parts[0] && parts[0][0] || "";
    const short = name.includes("د.") ? name.split(" ").slice(0, 2).join(" ") : "د. " + parts[0];
    setF(v => ({
      ...v,
      name,
      initial: v.initial || ini,
      short: v.short || short
    }));
  };
  return React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, React.createElement(Field, {
    label: "الاسم الكامل"
  }, React.createElement("input", {
    style: inp(),
    value: f.name,
    onChange: handleName,
    placeholder: "د. محمد أحمد"
  })), React.createElement(Field, {
    label: "الاسم المختصر (يظهر في القوائم)"
  }, React.createElement("input", {
    style: inp(),
    value: f.short,
    onChange: s("short"),
    placeholder: "د. محمد"
  })), React.createElement(Field, {
    label: "اللقب / التخصص"
  }, React.createElement("input", {
    style: inp(),
    value: f.title,
    onChange: s("title"),
    placeholder: "طبيب عيون"
  })), React.createElement(Field, {
    label: "الحرف الأول (للصورة الرمزية)"
  }, React.createElement("input", {
    style: {
      ...inp(),
      textAlign: "center"
    },
    value: f.initial,
    onChange: s("initial"),
    placeholder: "م",
    maxLength: 1
  })), React.createElement("div", {
    onClick: () => setF(v => ({
      ...v,
      isPrimary: !v.isPrimary
    })),
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      background: C.card,
      border: `1px solid ${f.isPrimary ? C.gold : C.border}`,
      borderRadius: 10,
      padding: "10px 14px",
      cursor: "pointer"
    }
  }, React.createElement("div", {
    style: {
      width: 20,
      height: 20,
      borderRadius: 6,
      background: f.isPrimary ? C.gold : C.bg,
      border: `2px solid ${f.isPrimary ? C.gold : C.border}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 12,
      color: C.bg,
      fontWeight: 700
    }
  }, f.isPrimary ? "✓" : ""), React.createElement("span", {
    style: {
      color: f.isPrimary ? C.gold : C.muted,
      fontSize: 13,
      fontWeight: 600
    }
  }, "الطبيب الرئيسي للعيادة")), React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      marginTop: 8
    }
  }, React.createElement(Btn, {
    outline: true,
    full: true,
    onClick: onClose
  }, "إلغاء"), React.createElement(Btn, {
    full: true,
    onClick: () => f.name && f.short && onSave(f)
  }, "حفظ")));
}
const getAccountingReportHTML = safeTemplate(_getAccountingReportHTMLRaw);
function _getAccountingReportHTMLRaw(fromDate, toDate, label, revenue, expenseList, clinic, primary) {
  const docName = primary && primary.name || "د. عبدالستار صقر";
  const totalExp = expenseList.reduce((s, e) => s + Number(e.amount || 0), 0);
  const net = revenue - totalExp;
  return `<!DOCTYPE html><html dir="rtl" lang="ar">
<head><meta charset="UTF-8"><title>تقرير محاسبي</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;color:#111;direction:rtl;font-size:12px;}
  .page{width:210mm;margin:0 auto;padding:12mm;}
  .header{border-bottom:3px solid #00C2FF;padding-bottom:10px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;}
  .clinic{font-size:18px;font-weight:800;color:#00C2FF;}
  .date{font-size:12px;color:#555;margin-top:3px;}
  .stats{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px;}
  .stat{background:#f0f9ff;border:1px solid #cce;border-radius:8px;padding:10px;text-align:center;}
  .stat-val{font-size:22px;font-weight:800;color:#00C2FF;}
  .stat-lbl{font-size:10px;color:#555;margin-top:2px;}
  table{width:100%;border-collapse:collapse;margin-bottom:14px;}
  th{background:#00C2FF;color:#fff;padding:7px 10px;font-size:11px;text-align:right;}
  td{border:1px solid #ddd;padding:7px 10px;font-size:11px;}
  tr:nth-child(even) td{background:#f8f8f8;}
  .footer{margin-top:14px;border-top:2px solid #00C2FF;padding-top:10px;font-size:10px;color:#555;display:flex;justify-content:space-between;}
  h3{font-size:13px;color:#00C2FF;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #e0f4ff;}
  @media print{.page{padding:8mm;position:relative;overflow:hidden;}}
</style></head>
<body>
<div class="page"><div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:80px;font-weight:900;color:#00C2FF;opacity:0.05;pointer-events:none;z-index:0;letter-spacing:8px;font-family:Georgia,serif;white-space:nowrap;">I App</div>
  <div class="header">
    <div><div class="clinic">👁 عيادة ${docName}</div><div class="date">${label}</div></div>
    <div style="text-align:left;font-size:11px;color:#555;">تقرير محاسبي</div>
  </div>
  <div class="stats">
    <div class="stat"><div class="stat-val" style="color:#00aa66;">${revenue.toLocaleString()}</div><div class="stat-lbl">الإيرادات (ج.م)</div></div>
    <div class="stat"><div class="stat-val" style="color:#cc3300;">${totalExp.toLocaleString()}</div><div class="stat-lbl">المصروفات (ج.م)</div></div>
    <div class="stat"><div class="stat-val" style="color:${net >= 0 ? '#00aa66' : '#cc3300'};">${net.toLocaleString()}</div><div class="stat-lbl">صافي الربح (ج.م)</div></div>
  </div>
  ${expenseList.length > 0 ? `<h3>سجل المصروفات</h3>
  <table><tr><th>#</th><th>التاريخ</th><th>البند</th><th>المبلغ</th><th>ملاحظات</th></tr>
  ${expenseList.map((e, i) => `<tr><td>${i + 1}</td><td>${e.date}</td><td>${e.category}</td><td>${Number(e.amount || 0).toLocaleString()} ج.م</td><td>${e.notes || "—"}</td></tr>`).join("")}
  </table>` : `<div style="color:#777;text-align:center;padding:20px;">لا توجد مصروفات مسجلة في هذه الفترة</div>`}
  <div class="footer"><div>I App · تقرير محاسبي مبدئي</div><div>تم الإنشاء: ${new Date().toLocaleString("ar-EG")}</div></div>
</div>
</body></html>`;
}
function ExpenseForm({
  initial,
  onSave,
  onClose
}) {
  const blank = {
    date: localISO(),
    category: EXP_CATS[0][0],
    amount: "",
    notes: "",
    clinic: ""
  };
  const [f, setF] = useState(initial || blank);
  const s = k => e => setF(v => ({
    ...v,
    [k]: e.target.value
  }));
  const valid = f.amount && Number(f.amount) > 0 && f.date;
  return React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, React.createElement(Field, {
    label: "التاريخ"
  }, React.createElement("input", {
    style: inp(),
    type: "date",
    value: f.date,
    onChange: s("date")
  })), React.createElement(Field, {
    label: "البند"
  }, React.createElement("select", {
    style: inp(),
    value: f.category,
    onChange: s("category")
  }, EXP_CATS.map(([name, icon]) => React.createElement("option", {
    key: name,
    value: name
  }, icon, " ", name)))), React.createElement(Field, {
    label: "العيادة (اختياري)"
  }, React.createElement("select", {
    style: inp(),
    value: f.clinic || "",
    onChange: s("clinic")
  }, React.createElement("option", {
    value: ""
  }, "عام / كل العيادات"), CLINICS.map(c => React.createElement("option", {
    key: c.v,
    value: c.v
  }, c.l)))), React.createElement(Field, {
    label: "المبلغ (ج.م)"
  }, React.createElement("input", {
    style: inp({
      textAlign: "center"
    }),
    type: "number",
    value: f.amount,
    onChange: s("amount"),
    placeholder: "0"
  })), React.createElement(Field, {
    label: "ملاحظات"
  }, React.createElement("input", {
    style: inp(),
    value: f.notes,
    onChange: s("notes"),
    placeholder: "اختياري"
  })), React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      marginTop: 8
    }
  }, React.createElement(Btn, {
    outline: true,
    full: true,
    onClick: onClose
  }, "إلغاء"), React.createElement(Btn, {
    full: true,
    color: C.danger,
    onClick: () => valid && onSave({
      ...f,
      id: f.id || Date.now()
    })
  }, initial ? "✓ حفظ التعديل" : "✓ إضافة المصروف")));
}
function RecurringExpenseForm({
  initial,
  onSave,
  onClose
}) {
  const blank = {
    category: EXP_CATS[0][0],
    amount: "",
    notes: "",
    clinic: ""
  };
  const [f, setF] = useState(initial || blank);
  const s = k => e => setF(v => ({
    ...v,
    [k]: e.target.value
  }));
  const valid = f.amount && Number(f.amount) > 0;
  return React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, React.createElement(Field, {
    label: "البند"
  }, React.createElement("select", {
    style: inp(),
    value: f.category,
    onChange: s("category")
  }, EXP_CATS.map(([name, icon]) => React.createElement("option", {
    key: name,
    value: name
  }, icon, " ", name)))), React.createElement(Field, {
    label: "العيادة (اختياري)"
  }, React.createElement("select", {
    style: inp(),
    value: f.clinic || "",
    onChange: s("clinic")
  }, React.createElement("option", {
    value: ""
  }, "عام / كل العيادات"), CLINICS.map(c => React.createElement("option", {
    key: c.v,
    value: c.v
  }, c.l)))), React.createElement(Field, {
    label: "المبلغ الشهري (ج.م)"
  }, React.createElement("input", {
    style: inp({
      textAlign: "center"
    }),
    type: "number",
    value: f.amount,
    onChange: s("amount"),
    placeholder: "0"
  })), React.createElement(Field, {
    label: "ملاحظات"
  }, React.createElement("input", {
    style: inp(),
    value: f.notes,
    onChange: s("notes"),
    placeholder: "اختياري"
  })), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11
    }
  }, "سيُضاف هذا المصروف تلقائياً أول كل شهر."), React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      marginTop: 8
    }
  }, React.createElement(Btn, {
    outline: true,
    full: true,
    onClick: onClose
  }, "إلغاء"), React.createElement(Btn, {
    full: true,
    color: C.purple,
    onClick: () => valid && onSave({
      ...f,
      id: f.id || Date.now()
    })
  }, initial ? "✓ حفظ التعديل" : "✓ إضافة مصروف ثابت")));
}
function Accounting({
  visits,
  expenses,
  setExpenses,
  recurringExpenses,
  setRecurringExpenses,
  doctors,
  clinic
}) {
  const [period, setPeriod] = useState("month");
  const [clinicFilter, setClinicFilter] = useState("");
  const [modal, setModal] = useState(null);
  const [delId, setDelId] = useState(null);
  const [recModal, setRecModal] = useState(null);
  const [delRecId, setDelRecId] = useState(null);
  const todayStr = localISO();
  const monthStr = todayStr.slice(0, 7);
  const primary = doctors.find(d => d.isPrimary) || doctors[0] || {};
  useEffect(() => {
    if (!recurringExpenses || recurringExpenses.length === 0) return;
    const missing = recurringExpenses.filter(t => !expenses.some(e => e.recurringId === t.id && (e.date || "").startsWith(monthStr)));
    if (missing.length > 0) {
      const newOnes = missing.map(t => ({
        id: Date.now() + Math.random(),
        date: todayStr,
        category: t.category,
        amount: t.amount,
        notes: (t.notes ? t.notes + " · " : "") + "مصروف شهري ثابت",
        clinic: t.clinic || "",
        recurringId: t.id
      }));
      setExpenses([...expenses, ...newOnes]);
    }
  }, [monthStr]);
  const inPeriod = d => period === "all" ? true : period === "today" ? d === todayStr : (d || "").startsWith(monthStr);
  const inClinic = c => !clinicFilter || c === clinicFilter;
  const periodVisits = visits.filter(v => inPeriod(v.date) && inClinic(v.clinic));
  const periodExpenses = expenses.filter(e => inPeriod(e.date) && inClinic(e.clinic)).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const revenue = periodVisits.reduce((s, v) => s + (v.paid ? Number(v.cost || 0) : 0), 0);
  const totalExp = periodExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const net = revenue - totalExp;
  const label = period === "today" ? "اليوم" : period === "month" ? "هذا الشهر" : "كل الفترة";
  const addExp = f => setExpenses([...expenses, f]);
  const editExp = f => setExpenses(expenses.map(e => e.id === f.id ? f : e));
  const delExp = id => setExpenses(expenses.filter(e => e.id !== id));
  const addRec = f => setRecurringExpenses([...recurringExpenses, f]);
  const editRec = f => setRecurringExpenses(recurringExpenses.map(r => r.id === f.id ? f : r));
  const delRec = id => setRecurringExpenses(recurringExpenses.filter(r => r.id !== id));
  const doPrint = () => {
    const dateLabel = period === "today" ? new Date().toLocaleDateString("ar-EG", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    }) : period === "month" ? `شهر ${monthStr}` : "كل الفترة";
    printDoc(getAccountingReportHTML(null, null, dateLabel, revenue, periodExpenses, clinic, primary));
  };
  return React.createElement("div", {
    style: {
      padding: "16px 16px 90px"
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 14
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 16
    }
  }, "💰 المحاسبة"), React.createElement("div", {
    onClick: doPrint,
    style: {
      color: C.accent,
      fontSize: 11,
      cursor: "pointer",
      background: C.accent + "22",
      borderRadius: 8,
      padding: "6px 10px"
    }
  }, "🖨 طباعة تقرير")), React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginBottom: 10
    }
  }, [["today", "اليوم"], ["month", "هذا الشهر"], ["all", "الكل"]].map(([id, lbl]) => React.createElement("div", {
    key: id,
    onClick: () => setPeriod(id),
    style: {
      flex: 1,
      textAlign: "center",
      padding: "8px 6px",
      borderRadius: 10,
      cursor: "pointer",
      fontSize: 12,
      fontWeight: 700,
      background: period === id ? C.accent : C.card,
      color: period === id ? C.bg : C.muted,
      border: `1px solid ${period === id ? C.accent : C.border}`
    }
  }, lbl))), React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      marginBottom: 16,
      overflowX: "auto",
      paddingBottom: 2
    }
  }, CLINIC_FILTERS.map(c => React.createElement("div", {
    key: c.v,
    onClick: () => setClinicFilter(c.v),
    style: {
      flexShrink: 0,
      textAlign: "center",
      padding: "6px 12px",
      borderRadius: 8,
      cursor: "pointer",
      fontSize: 11,
      fontWeight: 600,
      whiteSpace: "nowrap",
      background: clinicFilter === c.v ? C.teal + "33" : "transparent",
      color: clinicFilter === c.v ? C.teal : C.muted,
      border: `1px solid ${clinicFilter === c.v ? C.teal : C.border}`
    }
  }, c.v === "" ? "🏥 " : "📍 ", c.l))), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10,
      marginBottom: 10
    }
  }, React.createElement("div", {
    style: {
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 14,
      padding: 14
    }
  }, React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11,
      marginBottom: 6
    }
  }, "💹 الإيرادات — ", label), React.createElement("div", {
    style: {
      color: C.success,
      fontWeight: 800,
      fontSize: 20
    }
  }, revenue.toLocaleString(), " ", React.createElement("span", {
    style: {
      fontSize: 11,
      fontWeight: 400
    }
  }, "ج.م"))), React.createElement("div", {
    style: {
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 14,
      padding: 14
    }
  }, React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11,
      marginBottom: 6
    }
  }, "📉 المصروفات — ", label), React.createElement("div", {
    style: {
      color: C.danger,
      fontWeight: 800,
      fontSize: 20
    }
  }, totalExp.toLocaleString(), " ", React.createElement("span", {
    style: {
      fontSize: 11,
      fontWeight: 400
    }
  }, "ج.م")))), React.createElement("div", {
    style: {
      background: `linear-gradient(135deg,${net >= 0 ? C.success : C.danger}22,${C.card})`,
      border: `1px solid ${net >= 0 ? C.success : C.danger}44`,
      borderRadius: 14,
      padding: 16,
      marginBottom: 20,
      textAlign: "center"
    }
  }, React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 12,
      marginBottom: 6
    }
  }, "📊 صافي الربح — ", label), React.createElement("div", {
    style: {
      color: net >= 0 ? C.success : C.danger,
      fontWeight: 800,
      fontSize: 26
    }
  }, net.toLocaleString(), " ج.م")), React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 13,
      marginBottom: 10
    }
  }, "📊 مقارنة العيادات — ", label), CLINICS.map(c => {
    const rev = visits.filter(v => inPeriod(v.date) && v.clinic === c.v).reduce((s, v) => s + (v.paid ? Number(v.cost || 0) : 0), 0);
    const exp = expenses.filter(e => inPeriod(e.date) && e.clinic === c.v).reduce((s, e) => s + Number(e.amount || 0), 0);
    const cNet = rev - exp;
    return React.createElement("div", {
      key: c.v,
      style: {
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: "10px 14px",
        marginBottom: 8
      }
    }, React.createElement("div", {
      style: {
        color: C.text,
        fontWeight: 700,
        fontSize: 12,
        marginBottom: 6
      }
    }, "📍 ", c.l), React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        fontSize: 11
      }
    }, React.createElement("span", {
      style: {
        color: C.success
      }
    }, "إيراد: ", rev.toLocaleString()), React.createElement("span", {
      style: {
        color: C.danger
      }
    }, "مصروف: ", exp.toLocaleString()), React.createElement("span", {
      style: {
        color: cNet >= 0 ? C.success : C.danger,
        fontWeight: 700
      }
    }, "صافي: ", cNet.toLocaleString())));
  }), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10,
      marginBottom: 16
    }
  }, "* عمليات بدون عيادة محددة لا تظهر في هذه المقارنة."), React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 13
    }
  }, "📌 مصروفات شهرية ثابتة (", (recurringExpenses || []).length, ")"), React.createElement(Btn, {
    small: true,
    color: C.purple,
    onClick: () => setRecModal("add")
  }, "+ إضافة")), (recurringExpenses || []).length === 0 && React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 12,
      textAlign: "center",
      padding: 16,
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      marginBottom: 16
    }
  }, "لا توجد مصروفات شهرية ثابتة"), (recurringExpenses || []).map(r => React.createElement("div", {
    key: r.id,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "10px 12px",
      background: C.card,
      border: `1px solid ${C.purple}33`,
      borderRadius: 12,
      marginBottom: 6
    }
  }, React.createElement("div", {
    style: {
      flex: 1
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 12,
      fontWeight: 600
    }
  }, r.category, r.clinic ? " · " + clinicLabel(r.clinic) : ""), r.notes && React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10
    }
  }, r.notes)), React.createElement("div", {
    style: {
      color: C.purple,
      fontWeight: 700,
      fontSize: 13
    }
  }, Number(r.amount || 0).toLocaleString(), " ج.م/شهر"), React.createElement("div", {
    onClick: () => setRecModal({
      edit: r
    }),
    style: {
      background: C.accent + "22",
      borderRadius: 8,
      padding: "5px 8px",
      color: C.accent,
      fontSize: 11,
      cursor: "pointer"
    }
  }, "✏"), React.createElement("div", {
    onClick: () => setDelRecId(r.id),
    style: {
      background: C.danger + "22",
      borderRadius: 8,
      padding: "5px 8px",
      color: C.danger,
      fontSize: 11,
      cursor: "pointer"
    }
  }, "🗑"))), React.createElement("div", {
    style: {
      marginBottom: 16
    }
  }), React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 13
    }
  }, "🧾 سجل المصروفات (", periodExpenses.length, ")"), React.createElement(Btn, {
    small: true,
    color: C.danger,
    onClick: () => setModal("add")
  }, "+ إضافة مصروف")), periodExpenses.length === 0 && React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 12,
      textAlign: "center",
      padding: 24,
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 14
    }
  }, "لا توجد مصروفات في هذه الفترة"), periodExpenses.map(e => {
    const cat = EXP_CATS.find(c => c[0] === e.category);
    return React.createElement("div", {
      key: e.id,
      style: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "12px",
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        marginBottom: 8
      }
    }, React.createElement("div", {
      style: {
        width: 36,
        height: 36,
        borderRadius: 10,
        background: C.danger + "22",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 16
      }
    }, cat && cat[1] || "📦"), React.createElement("div", {
      style: {
        flex: 1
      }
    }, React.createElement("div", {
      style: {
        color: C.text,
        fontSize: 13,
        fontWeight: 600
      }
    }, e.category, e.clinic ? " · " + clinicLabel(e.clinic) : ""), React.createElement("div", {
      style: {
        color: C.muted,
        fontSize: 11
      }
    }, e.date, e.notes ? ` · ${e.notes}` : "")), React.createElement("div", {
      style: {
        color: C.danger,
        fontWeight: 800,
        fontSize: 14
      }
    }, Number(e.amount || 0).toLocaleString(), " ج.م"), React.createElement("div", {
      onClick: () => setModal({
        edit: e
      }),
      style: {
        background: C.accent + "22",
        borderRadius: 8,
        padding: "5px 8px",
        color: C.accent,
        fontSize: 11,
        cursor: "pointer"
      }
    }, "✏"), React.createElement("div", {
      onClick: () => setDelId(e.id),
      style: {
        background: C.danger + "22",
        borderRadius: 8,
        padding: "5px 8px",
        color: C.danger,
        fontSize: 11,
        cursor: "pointer"
      }
    }, "🗑"));
  }), modal === "add" && React.createElement(Modal, {
    title: "إضافة مصروف جديد",
    onClose: () => setModal(null)
  }, React.createElement(ExpenseForm, {
    onSave: f => {
      addExp(f);
      setModal(null);
    },
    onClose: () => setModal(null)
  })), modal && modal.edit && React.createElement(Modal, {
    title: "تعديل المصروف",
    onClose: () => setModal(null)
  }, React.createElement(ExpenseForm, {
    initial: modal.edit,
    onSave: f => {
      editExp(f);
      setModal(null);
    },
    onClose: () => setModal(null)
  })), delId && React.createElement(Confirm, {
    msg: "حذف هذا المصروف؟",
    onOk: () => {
      delExp(delId);
      setDelId(null);
    },
    onNo: () => setDelId(null)
  }), recModal === "add" && React.createElement(Modal, {
    title: "إضافة مصروف شهري ثابت",
    onClose: () => setRecModal(null)
  }, React.createElement(RecurringExpenseForm, {
    onSave: f => {
      addRec(f);
      setRecModal(null);
    },
    onClose: () => setRecModal(null)
  })), recModal && recModal.edit && React.createElement(Modal, {
    title: "تعديل المصروف الشهري",
    onClose: () => setRecModal(null)
  }, React.createElement(RecurringExpenseForm, {
    initial: recModal.edit,
    onSave: f => {
      editRec(f);
      setRecModal(null);
    },
    onClose: () => setRecModal(null)
  })), delRecId && React.createElement(Confirm, {
    msg: "حذف هذا المصروف الشهري الثابت؟ (لن يؤثر على المصروفات المُنشأة مسبقاً)",
    onOk: () => {
      delRec(delRecId);
      setDelRecId(null);
    },
    onNo: () => setDelRecId(null)
  }));
}
function UserForm({
  initial,
  onSave,
  onClose,
  error
}) {
  const blank = {
    email: "",
    name: "",
    role: "employee"
  };
  const [f, setF] = useState(initial ? {
    ...initial,
    email: initial.email || initial.username || ""
  } : blank);
  const s = k => e => setF(v => ({
    ...v,
    [k]: e.target.value
  }));
  const [saving, setSaving] = useState(false);
  const valid = String(f.email || "").includes("@") && f.name.trim() && !saving;
  return React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, React.createElement(Field, {
    label: "الاسم"
  }, React.createElement("input", {
    style: inp(),
    value: f.name,
    onChange: s("name"),
    placeholder: "اسم المستخدم الكامل"
  })), React.createElement(Field, {
    label: "البريد الإلكتروني (للدخول)"
  }, React.createElement("input", {
    type: "email",
    style: {
      ...inp(),
      direction: "ltr",
      textAlign: "left"
    },
    value: f.email,
    onChange: s("email"),
    placeholder: "name@sakr.clinic"
  })), React.createElement("div", {
    style: {
      background: C.gold + "11",
      border: `1px solid ${C.gold}33`,
      borderRadius: 10,
      padding: "9px 12px",
      color: C.gold,
      fontSize: 11,
      lineHeight: 1.7
    }
  }, "كلمة المرور تُنشأ من Supabase ← Authentication ← Users. هنا تحدد الصلاحية فقط."), React.createElement(Field, {
    label: "الصلاحية"
  }, React.createElement("select", {
    style: inp(),
    value: f.role,
    onChange: s("role")
  }, React.createElement("option", {
    value: "admin"
  }, "مدير — صلاحية كاملة (يشمل المحاسبة)"), React.createElement("option", {
    value: "doctor"
  }, "طبيب — واجهة الطبيب بدون إدارة المستخدمين"), React.createElement("option", {
    value: "secretary"
  }, "سكرتارية — إدارة المواعيد والانتظار والتحصيل"), React.createElement("option", {
    value: "employee"
  }, "موظف — واجهة السكرتارية"))), error && React.createElement("div", {
    style: {
      background: C.danger + "22",
      border: `1px solid ${C.danger}44`,
      borderRadius: 10,
      padding: "9px 12px",
      color: C.danger,
      fontSize: 12,
      textAlign: "center"
    }
  }, error), React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      marginTop: 8
    }
  }, React.createElement(Btn, {
    outline: true,
    full: true,
    onClick: onClose
  }, "إلغاء"), React.createElement(Btn, {
    full: true,
    color: C.purple,
    onClick: async () => {
      if (!valid) return;
      setSaving(true);
      try {
        await onSave({
          ...f,
          id: f.id || Date.now()
        });
      } finally {
        setSaving(false);
      }
    }
  }, saving ? "⏳ جاري الحفظ..." : initial ? "✓ حفظ التعديل" : "✓ إضافة مستخدم")));
}
const MERGE_KEYS = ["iapp_visits", "iapp_exams", "iapp_prescriptions", "iapp_appointments", "iapp_injections", "iapp_imaging_studies", "iapp_imaging_orders"];
function findDuplicatePatients(patients) {
  const groups = {};
  (patients || []).forEach(p => {
    const phone = normPhone(p.phone);
    const key = phone ? "p:" + phone : "n:" + normArabic(p.name);
    if (!normArabic(p.name) && !phone) return;
    (groups[key] = groups[key] || []).push(p);
  });
  return Object.values(groups).filter(g => g.length > 1).map(g => [...g].sort((a, b) => (a.id || 0) - (b.id || 0)));
}
async function mergePatients(keep, drop) {
  for (const key of MERGE_KEYS) {
    const cur = await sbGet(key);
    if (!Array.isArray(cur) || !cur.length) continue;
    const touched = cur.some(r => r && r.patientId === drop.id);
    if (!touched) continue;
    await sbMutate(key, list => list.map(r => r && r.patientId === drop.id ? {
      ...r,
      patientId: keep.id,
      patient: keep.name
    } : r));
  }
  await trashPut("iapp_patients", drop, "مريض مدمج: " + (drop.name || ""));
  const res = await sbMutate("iapp_patients", list => list.filter(p => p.id !== drop.id));
  await logAudit("دمج ملفين", (drop.patientCode || drop.id) + " ← " + (keep.patientCode || keep.id) + " · " + (keep.name || ""));
  return res.ok;
}
function DataTools({
  isAdmin
}) {
  const [open, setOpen] = useState("");
  const [backups, setBackups] = useState(null);
  const [trash, setTrash] = useState(null);
  const [audit, setAudit] = useState(null);
  const [dups, setDups] = useState(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null);
  if (!isAdmin) return null;
  const note = (text, err) => {
    setMsg({
      text,
      err
    });
    setTimeout(() => setMsg(null), 4000);
  };
  const fmt = ts => {
    try {
      return new Date(ts).toLocaleString("ar-EG", {
        dateStyle: "short",
        timeStyle: "short"
      });
    } catch {
      return "";
    }
  };
  const mb = n => n >= 1048576 ? (n / 1048576).toFixed(1) + " م.ب" : Math.round(n / 1024) + " ك.ب";
  const load = async which => {
    setOpen(o => o === which ? "" : which);
    if (open === which) return;
    setBusy(which);
    try {
      if (which === "backups") {
        const v = await sbGet(BACKUP_KEY);
        setBackups(Array.isArray(v) ? v : []);
      }
      if (which === "trash") {
        const v = await sbGet(TRASH_KEY);
        setTrash(Array.isArray(v) ? v : []);
      }
      if (which === "audit") {
        const v = await sbGet(AUDIT_KEY);
        setAudit(Array.isArray(v) ? v : []);
      }
      if (which === "dups") {
        const v = await sbGet("iapp_patients");
        setDups(findDuplicatePatients(Array.isArray(v) ? v : []));
      }
    } catch (e) {
      note("تعذر تحميل البيانات — تحقق من الاتصال", true);
    }
    setBusy("");
  };
  const importFile = async e => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (!window.confirm("سيتم استبدال البيانات الحالية بمحتوى الملف على كل الأجهزة. سيتم حفظ نسخة من البيانات الحالية أولاً. هل تريد المتابعة؟")) return;
    setBusy("import");
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await restoreSnapshot(data, file.name);
      setBusy("");
      if (!res.ok) {
        note(res.error || "تعذرت الاستعادة", true);
        return;
      }
      alert("✅ تمت الاستعادة (" + res.count + " مجموعة بيانات). سيتم إعادة تشغيل البرنامج.");
      location.reload();
    } catch (err) {
      setBusy("");
      note("الملف غير صالح: " + (err.message || err), true);
    }
  };
  const restoreBackup = async b => {
    if (!window.confirm("استعادة نسخة " + fmt(b.at) + "؟ سيتم استبدال البيانات الحالية على كل الأجهزة.")) return;
    setBusy("restore");
    const res = await restoreSnapshot(b.data, "نسخة " + fmt(b.at));
    setBusy("");
    if (!res.ok) {
      note(res.error || "تعذرت الاستعادة", true);
      return;
    }
    alert("✅ تمت الاستعادة. سيتم إعادة تشغيل البرنامج.");
    location.reload();
  };
  const downloadBackup = b => {
    try {
      const blob = new Blob([JSON.stringify(b.data, null, 2)], {
        type: "application/json"
      });
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = "iapp-backup-" + localISO(new Date(b.at)) + ".json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    } catch (e) {
      note("تعذر التحميل", true);
    }
  };
  const makeBackup = async () => {
    setBusy("make");
    const ok = await saveAutoBackup("يدوي");
    setBusy("");
    note(ok ? "✅ تم حفظ نسخة جديدة" : "تعذر حفظ النسخة", !ok);
    if (ok) {
      const v = await sbGet(BACKUP_KEY);
      setBackups(Array.isArray(v) ? v : []);
    }
  };
  const doRestoreTrash = async t => {
    setBusy("t" + t.id);
    const ok = await trashRestore(t);
    setBusy("");
    if (ok) {
      setTrash(list => (list || []).filter(x => x.id !== t.id));
      note("✅ تمت الاستعادة");
    } else note("تعذرت الاستعادة", true);
  };
  const doDropTrash = async t => {
    if (!window.confirm("حذف نهائي؟ لا يمكن التراجع بعد ذلك.")) return;
    await trashDrop(t.id);
    setTrash(list => (list || []).filter(x => x.id !== t.id));
    logAudit("حذف نهائي من سلة المحذوفات", t.label || t.storeKey);
  };
  const Row = ({
    icon,
    title,
    sub,
    badge,
    which
  }) => React.createElement("div", {
    onClick: () => load(which),
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "13px 14px",
      background: C.card,
      border: `1px solid ${open === which ? C.accent + "66" : C.border}`,
      borderRadius: 12,
      marginBottom: 8,
      cursor: "pointer"
    }
  }, React.createElement("div", {
    style: {
      width: 34,
      height: 34,
      borderRadius: 10,
      background: C.accent + "22",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 16
    }
  }, icon), React.createElement("div", {
    style: {
      flex: 1
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 13
    }
  }, title), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11
    }
  }, sub)), busy === which ? React.createElement("span", {
    style: {
      color: C.muted,
      fontSize: 12
    }
  }, "⏳") : React.createElement("span", {
    style: {
      color: C.accent,
      fontSize: 12
    }
  }, open === which ? "▲" : "▼"));
  const box = {
    background: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    padding: "10px 12px",
    marginBottom: 10,
    maxHeight: 320,
    overflowY: "auto"
  };
  const line = {
    borderBottom: `1px solid ${C.border}55`,
    padding: "9px 0"
  };
  const btn = (color, onClick, children) => React.createElement("span", {
    onClick: onClick,
    style: {
      background: color + "22",
      border: `1px solid ${color}55`,
      color,
      borderRadius: 8,
      padding: "4px 10px",
      fontSize: 11,
      cursor: "pointer",
      marginLeft: 6
    }
  }, children);
  return React.createElement("div", {
    style: {
      marginBottom: 16
    }
  }, msg && React.createElement("div", {
    style: {
      background: (msg.err ? C.danger : C.success) + "22",
      border: `1px solid ${msg.err ? C.danger : C.success}44`,
      color: msg.err ? C.danger : C.success,
      borderRadius: 10,
      padding: "9px 12px",
      fontSize: 12,
      textAlign: "center",
      marginBottom: 8
    }
  }, msg.text), React.createElement("label", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "13px 14px",
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      marginBottom: 8,
      cursor: "pointer"
    }
  }, React.createElement("div", {
    style: {
      width: 34,
      height: 34,
      borderRadius: 10,
      background: C.gold + "33",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 16
    }
  }, "♻️"), React.createElement("div", {
    style: {
      flex: 1
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 13
    }
  }, "استعادة نسخة احتياطية من ملف"), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11
    }
  }, busy === "import" ? "جاري الاستعادة..." : "اختر ملف JSON سبق تصديره")), React.createElement("div", {
    style: {
      color: C.gold,
      fontSize: 12
    }
  }, "⬆"), React.createElement("input", {
    type: "file",
    accept: "application/json,.json",
    style: {
      display: "none"
    },
    onChange: importFile
  })), React.createElement(Row, {
    icon: "🗂",
    title: "النسخ الاحتياطية التلقائية",
    sub: "نسخة يومية تُحفظ تلقائياً — تُحفظ آخر 5 نسخ",
    which: "backups"
  }), open === "backups" && React.createElement("div", {
    style: box
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8
    }
  }, React.createElement("span", {
    style: {
      color: C.muted,
      fontSize: 11
    }
  }, (backups || []).length, " نسخة"), React.createElement("span", {
    onClick: makeBackup,
    style: {
      color: C.teal,
      fontSize: 11,
      cursor: "pointer",
      background: C.teal + "22",
      borderRadius: 8,
      padding: "4px 10px"
    }
  }, busy === "make" ? "⏳" : "+ نسخة الآن")), (backups || []).length === 0 && React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 12,
      textAlign: "center",
      padding: "10px 0"
    }
  }, "لا توجد نسخ بعد"), (backups || []).map(b => React.createElement("div", {
    key: b.id,
    style: {
      ...line,
      display: "flex",
      alignItems: "center",
      gap: 8,
      flexWrap: "wrap"
    }
  }, React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 150
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 12
    }
  }, fmt(b.at)), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10
    }
  }, b.reason || "تلقائي", " · ", mb(b.size || 0), " · ", b.by || "—")), btn(C.teal, () => downloadBackup(b), "⬇ تحميل"), btn(C.gold, () => restoreBackup(b), busy === "restore" ? "⏳" : "♻️ استعادة")))), React.createElement(Row, {
    icon: "🗑",
    title: "سلة المحذوفات",
    sub: "يمكن استرجاع المحذوف خلال " + TRASH_DAYS + " يوماً",
    which: "trash"
  }), open === "trash" && React.createElement("div", {
    style: box
  }, (trash || []).length === 0 && React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 12,
      textAlign: "center",
      padding: "10px 0"
    }
  }, "السلة فارغة"), (trash || []).map(t => React.createElement("div", {
    key: t.id,
    style: {
      ...line,
      display: "flex",
      alignItems: "center",
      gap: 8,
      flexWrap: "wrap"
    }
  }, React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 150
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 12
    }
  }, t.label || t.storeKey), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10
    }
  }, fmt(t.deletedAt), " · حذفه ", t.by || "—", t.record && t.record._imageDropped ? " · بدون الصورة" : "")), btn(C.success, () => doRestoreTrash(t), busy === "t" + t.id ? "⏳" : "↩ استرجاع"), btn(C.danger, () => doDropTrash(t), "✕ نهائي")))), React.createElement(Row, {
    icon: "👯",
    title: "ملفات مكررة",
    sub: "مرضى بنفس الرقم أو نفس الاسم — يمكن دمجهم في ملف واحد",
    which: "dups"
  }), open === "dups" && React.createElement("div", {
    style: box
  }, (dups || []).length === 0 && React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 12,
      textAlign: "center",
      padding: "10px 0"
    }
  }, "لا توجد ملفات مكررة 👌"), (dups || []).map((g, i) => React.createElement("div", {
    key: i,
    style: {
      ...line
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 12,
      fontWeight: 700,
      marginBottom: 4
    }
  }, g[0].name), g.map((p, idx) => React.createElement("div", {
    key: p.id,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      flexWrap: "wrap",
      marginBottom: 4
    }
  }, React.createElement("span", {
    style: {
      color: C.muted,
      fontSize: 11,
      flex: 1,
      minWidth: 140
    }
  }, p.patientCode || "—", " · ", p.phone || "بدون رقم", " · ", p.name, idx === 0 ? " (الأساسي)" : ""), idx > 0 && btn(C.gold, async () => {
    if (!window.confirm("دمج ملف " + (p.patientCode || "") + " داخل " + (g[0].patientCode || "") + "؟ كل الزيارات والروشتات هتنتقل للملف الأساسي.")) return;
    setBusy("m" + p.id);
    const ok = await mergePatients(g[0], p);
    setBusy("");
    if (ok) {
      setDups(list => list.map(x => x.filter(y => y.id !== p.id)).filter(x => x.length > 1));
      note("✅ تم الدمج");
    } else note("تعذر الدمج", true);
  }, busy === "m" + p.id ? "⏳" : "⇦ دمج في الأساسي")))))), React.createElement(Row, {
    icon: "📜",
    title: "سجل العمليات",
    sub: "من قام بأي تعديل ومتى",
    which: "audit"
  }), open === "audit" && React.createElement("div", {
    style: box
  }, (audit || []).length === 0 && React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 12,
      textAlign: "center",
      padding: "10px 0"
    }
  }, "لا توجد عمليات مسجلة بعد"), (audit || []).slice(0, 200).map(a => React.createElement("div", {
    key: a.id,
    style: line
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 12
    }
  }, a.action, a.details ? " — " + a.details : ""), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10
    }
  }, fmt(a.ts), " · ", a.by || "—", a.role ? " (" + (ROLE_LABEL[a.role] || a.role) + ")" : "")))));
}
function Settings({
  patients,
  appointments,
  prescriptions,
  exams,
  visits,
  doctors,
  setDoctors,
  prices,
  setPrices,
  clinic,
  setClinic,
  onReset,
  users,
  setUsers,
  session,
  onLogout
}) {
  const [confirm, setConfirm] = useState(false);
  const [modal, setModal] = useState(null);
  const [delDoc, setDelDoc] = useState(null);
  const [priceModal, setPriceModal] = useState(null);
  const [editClinic, setEditClinic] = useState(false);
  const [clinicForm, setClinicForm] = useState({
    ...clinic
  });
  const [userModal, setUserModal] = useState(null);
  const [delUser, setDelUser] = useState(null);
  const [userErr, setUserErr] = useState("");
  const [pwModal, setPwModal] = useState(false);
  const [pwForm, setPwForm] = useState({
    old: "",
    new1: "",
    new2: ""
  });
  const [pwMsg, setPwMsg] = useState(null);
  const totalRev = visits.reduce((s, v) => s + (v.paid ? Number(v.cost || 0) : 0), 0);
  const primary = doctors.find(d => d.isPrimary) || doctors[0] || {};
  const isAdmin = session && session.role === "admin";
  const addDoc = f => setDoctors([...doctors, {
    ...f,
    id: Date.now()
  }]);
  const editDoc = f => setDoctors(doctors.map(d => d.id === f.id ? f : d));
  const delDocFn = id => setDoctors(doctors.filter(d => d.id !== id));
  const setPrimary = id => setDoctors(doctors.map(d => ({
    ...d,
    isPrimary: d.id === id
  })));
  const addPrice = f => setPrices([...prices, {
    ...f,
    id: Date.now()
  }]);
  const editPrice = f => setPrices(prices.map(p => p.id === f.id ? f : p));
  const delPrice = id => setPrices(prices.filter(p => p.id !== id));
  const sameName = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
  const adminCount = list => list.filter(u => u.role === "admin").length;
  const addUser = async f => {
    const cur = getUsers();
    const mail = emailKey(f.email);
    if (cur.some(u => emailKey(u.email) === mail || sameName(u.username, mail))) {
      setUserErr("❌ هذا البريد مضاف بالفعل");
      return;
    }
    const rec = {
      id: newId(),
      email: mail,
      username: mail,
      name: f.name.trim(),
      role: f.role
    };
    setUsers([...getUsers(), rec]);
    setUserErr("");
    setUserModal(null);
    logAudit("إضافة مستخدم", mail + " · " + (ROLE_LABEL[rec.role] || rec.role));
  };
  const editUser = async f => {
    const cur = getUsers();
    const mail = emailKey(f.email);
    if (cur.some(u => u.id !== f.id && emailKey(u.email) === mail)) {
      setUserErr("❌ هذا البريد مضاف بالفعل");
      return;
    }
    const prev = cur.find(u => u.id === f.id);
    if (!prev) {
      setUserErr("❌ المستخدم غير موجود");
      return;
    }
    if (prev.role === "admin" && f.role !== "admin" && adminCount(cur) <= 1) {
      setUserErr("❌ لا يمكن إلغاء صلاحية آخر مدير في النظام");
      return;
    }
    const rec = {
      ...prev,
      email: mail,
      username: mail,
      name: f.name.trim(),
      role: f.role
    };
    delete rec.pw;
    delete rec.password;
    delete rec.mustChange;
    setUsers(getUsers().map(u => u.id === f.id ? rec : u));
    setUserErr("");
    setUserModal(null);
    logAudit("تعديل مستخدم", mail + " · " + (ROLE_LABEL[rec.role] || rec.role));
  };
  const delUserFn = id => {
    logAudit("حذف مستخدم", String(id));
    const cur = getUsers();
    const target = cur.find(u => u.id === id);
    if (!target || id === session.id) return;
    if (target.role === "admin" && adminCount(cur) <= 1) {
      alert("لا يمكن حذف آخر مدير في النظام");
      return;
    }
    setUsers(cur.filter(u => u.id !== id));
  };
  const handleChangePassword = async () => {
    if (pwForm.new1.length < MIN_PW_LEN) {
      setPwMsg({
        err: "❌ يجب أن تكون كلمة المرور الجديدة " + MIN_PW_LEN + " أحرف على الأقل"
      });
      return;
    }
    if (pwForm.new1 !== pwForm.new2) {
      setPwMsg({
        err: "❌ كلمتا المرور الجديدتان غير متطابقتين"
      });
      return;
    }
    const email = session.email || "";
    const sb = getSB();
    if (!sb || !email) {
      setPwMsg({
        err: "❌ تعذر الاتصال بالخادم"
      });
      return;
    }
    const chk = await sb.auth.signInWithPassword({
      email,
      password: pwForm.old
    });
    if (chk.error) {
      setPwMsg({
        err: "❌ كلمة المرور الحالية غير صحيحة"
      });
      return;
    }
    const upd = await sb.auth.updateUser({
      password: pwForm.new1
    });
    if (upd.error) {
      setPwMsg({
        err: "❌ " + (upd.error.message || "تعذر تغيير كلمة المرور")
      });
      return;
    }
    setPwMsg({
      ok: "✅ تم تغيير كلمة المرور بنجاح"
    });
    logAudit("تغيير كلمة المرور الشخصية", "");
    setPwForm({
      old: "",
      new1: "",
      new2: ""
    });
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
        if (k && k.indexOf("iapp_") === 0 && !["iapp_session", "iapp_unified_session", GUARD_KEY].includes(k)) {
          try {
            data[k] = JSON.parse(localStorage.getItem(k));
          } catch {
            data[k] = localStorage.getItem(k);
          }
        }
      }
      data._exportedAt = new Date().toISOString();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json"
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "iapp-backup-" + localISO() + ".json";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    } catch (e) {
      alert("فشل التصدير: " + e.message);
    }
  };
  return React.createElement("div", {
    style: {
      padding: "16px 16px 90px"
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 16,
      marginBottom: 16
    }
  }, "الإعدادات"), React.createElement("div", {
    style: {
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 14,
      padding: 14,
      marginBottom: 16
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 13
    }
  }, "🏥 بيانات العيادة"), React.createElement("div", {
    onClick: () => {
      setClinicForm({
        ...clinic
      });
      setEditClinic(true);
    },
    style: {
      color: C.accent,
      fontSize: 11,
      cursor: "pointer",
      background: C.accent + "22",
      borderRadius: 8,
      padding: "4px 10px"
    }
  }, "✏ تعديل")), React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 8
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between"
    }
  }, React.createElement("span", {
    style: {
      color: C.muted,
      fontSize: 12
    }
  }, "📍 العنوان"), React.createElement("span", {
    style: {
      color: C.text,
      fontSize: 12,
      fontWeight: 600
    }
  }, clinic.address || "لم يُضف بعد")), React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between"
    }
  }, React.createElement("span", {
    style: {
      color: C.muted,
      fontSize: 12
    }
  }, "📞 رقم التواصل"), React.createElement("span", {
    style: {
      color: C.text,
      fontSize: 12,
      fontWeight: 600
    }
  }, clinic.phone || "لم يُضف بعد")))), React.createElement("div", {
    style: {
      background: `linear-gradient(135deg,${C.accent}22,${C.teal}11)`,
      border: `1px solid ${C.accent}33`,
      borderRadius: 16,
      padding: "16px 14px",
      marginBottom: 16,
      display: "flex",
      alignItems: "center",
      gap: 12
    }
  }, React.createElement("div", {
    style: {
      width: 54,
      height: 54,
      borderRadius: "50%",
      background: `linear-gradient(135deg,${C.accent},${C.teal})`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 22,
      fontWeight: 800,
      color: C.bg
    }
  }, primary.initial || "د"), React.createElement("div", {
    style: {
      flex: 1
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 15
    }
  }, primary.name || "د. عبدالستار صقر"), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11
    }
  }, primary.title || "طبيب عيون · رئيس القسم")), React.createElement("div", {
    onClick: () => setModal({
      edit: primary
    }),
    style: {
      color: C.accent,
      fontSize: 11,
      cursor: "pointer",
      background: C.accent + "22",
      borderRadius: 8,
      padding: "5px 10px"
    }
  }, "✏ تعديل")), React.createElement("div", {
    style: {
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 14,
      padding: 14,
      marginBottom: 16
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 14
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 13
    }
  }, "👨‍⚕️ فريق الأطباء (", doctors.length, ")"), React.createElement(Btn, {
    small: true,
    onClick: () => setModal("add")
  }, "+ إضافة طبيب")), doctors.map(d => React.createElement("div", {
    key: d.id,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "10px 0",
      borderBottom: `1px solid ${C.border}33`
    }
  }, React.createElement("div", {
    style: {
      width: 38,
      height: 38,
      borderRadius: "50%",
      background: d.isPrimary ? `linear-gradient(135deg,${C.accent},${C.teal})` : C.border,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 15,
      fontWeight: 800,
      color: d.isPrimary ? C.bg : C.muted
    }
  }, d.initial || "د"), React.createElement("div", {
    style: {
      flex: 1
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 13,
      fontWeight: 600
    }
  }, d.name), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11
    }
  }, d.title)), React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      alignItems: "center"
    }
  }, d.isPrimary ? React.createElement("span", {
    style: {
      background: C.gold + "22",
      color: C.gold,
      borderRadius: 8,
      padding: "2px 8px",
      fontSize: 10,
      fontWeight: 700
    }
  }, "رئيسي") : React.createElement("div", {
    onClick: () => setPrimary(d.id),
    style: {
      background: C.muted + "22",
      borderRadius: 8,
      padding: "3px 8px",
      color: C.muted,
      fontSize: 10,
      cursor: "pointer"
    }
  }, "تعيين رئيسي"), React.createElement("div", {
    onClick: () => setModal({
      edit: d
    }),
    style: {
      background: C.accent + "22",
      borderRadius: 8,
      padding: "5px 8px",
      color: C.accent,
      fontSize: 11,
      cursor: "pointer"
    }
  }, "✏"), !d.isPrimary && isAdmin && React.createElement("div", {
    onClick: () => setDelDoc(d.id),
    style: {
      background: C.danger + "22",
      borderRadius: 8,
      padding: "5px 8px",
      color: C.danger,
      fontSize: 11,
      cursor: "pointer"
    }
  }, "🗑"))))), React.createElement("div", {
    style: {
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 14,
      padding: 14,
      marginBottom: 16
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 14
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 13
    }
  }, "💰 أسعار الخدمات"), React.createElement(Btn, {
    small: true,
    color: C.gold,
    onClick: () => setPriceModal("add")
  }, "+ إضافة خدمة")), prices.map(p => React.createElement("div", {
    key: p.id,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "10px 0",
      borderBottom: `1px solid ${C.border}22`
    }
  }, React.createElement("div", {
    style: {
      width: 36,
      height: 36,
      borderRadius: 10,
      background: C.gold + "22",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 18
    }
  }, p.icon || "💊"), React.createElement("div", {
    style: {
      flex: 1
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 13,
      fontWeight: 600
    }
  }, p.name)), React.createElement("div", {
    style: {
      color: C.gold,
      fontWeight: 800,
      fontSize: 14,
      marginLeft: 8
    }
  }, Number(p.price).toLocaleString(), " ج.م"), React.createElement("div", {
    onClick: () => setPriceModal({
      edit: p
    }),
    style: {
      background: C.accent + "22",
      borderRadius: 8,
      padding: "5px 8px",
      color: C.accent,
      fontSize: 11,
      cursor: "pointer"
    }
  }, "✏"), React.createElement("div", {
    onClick: () => setPriceModal({
      del: p.id
    }),
    style: {
      background: C.danger + "22",
      borderRadius: 8,
      padding: "5px 8px",
      color: C.danger,
      fontSize: 11,
      cursor: "pointer"
    }
  }, "🗑"))), prices.length === 0 && React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 12,
      textAlign: "center",
      padding: 16
    }
  }, "لا توجد أسعار مضافة")), React.createElement("div", {
    style: {
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 14,
      padding: 14,
      marginBottom: 16
    }
  }, React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11,
      fontWeight: 700,
      marginBottom: 12
    }
  }, "ملخص قاعدة البيانات"), [["👥 المرضى", patients.length], ["📋 المواعيد", appointments.length], ["🗓 الزيارات", visits.length], ["🔬 الوصفات", prescriptions.length], ["🩺 Examinations", exams.length], ["💰 الإيرادات", totalRev.toLocaleString() + " ج.م"]].map(([lbl, val]) => React.createElement("div", {
    key: lbl,
    style: {
      display: "flex",
      justifyContent: "space-between",
      marginBottom: 8
    }
  }, React.createElement("span", {
    style: {
      color: C.muted,
      fontSize: 13
    }
  }, lbl), React.createElement("span", {
    style: {
      color: C.accent,
      fontWeight: 700,
      fontSize: 13
    }
  }, val)))), [["🏥", "I App للعيون", "بيانات العيادة"], ["🕐", "ساعات العمل", "8ص - 8م"], ["💾", "النسخ الاحتياطي", "محفوظ تلقائياً"]].map(([icon, lbl, sub], i) => React.createElement("div", {
    key: i,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "13px 14px",
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      marginBottom: 8
    }
  }, React.createElement("div", {
    style: {
      width: 34,
      height: 34,
      borderRadius: 10,
      background: C.border,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 16
    }
  }, icon), React.createElement("div", null, React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 13
    }
  }, lbl), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11
    }
  }, sub)))), isAdmin && React.createElement("div", {
    style: {
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 14,
      padding: 14,
      marginBottom: 16
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 14
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 13
    }
  }, "🔐 حسابات المستخدمين (", users.length, ")"), React.createElement(Btn, {
    small: true,
    color: C.purple,
    onClick: () => {
      setUserErr("");
      setUserModal("add");
    }
  }, "+ إضافة مستخدم")), users.map(u => React.createElement("div", {
    key: u.id,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "10px 0",
      borderBottom: `1px solid ${C.border}33`
    }
  }, React.createElement("div", {
    style: {
      width: 38,
      height: 38,
      borderRadius: "50%",
      background: u.role === "admin" ? `linear-gradient(135deg,${C.purple},${C.accent})` : C.border,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 15,
      fontWeight: 800,
      color: u.role === "admin" ? C.bg : C.muted
    }
  }, (u.name || u.username || "?")[0]), React.createElement("div", {
    style: {
      flex: 1
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 13,
      fontWeight: 600
    }
  }, u.name, " ", u.id === session.id && React.createElement("span", {
    style: {
      color: C.muted,
      fontSize: 10
    }
  }, "(أنت)")), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11,
      direction: "ltr",
      display: "inline-block"
    }
  }, u.email || u.username, " · ", ROLE_LABEL[u.role] || u.role)), React.createElement("div", {
    onClick: () => {
      setUserErr("");
      setUserModal({
        edit: u
      });
    },
    style: {
      background: C.accent + "22",
      borderRadius: 8,
      padding: "5px 8px",
      color: C.accent,
      fontSize: 11,
      cursor: "pointer"
    }
  }, "✏"), u.id !== session.id && React.createElement("div", {
    onClick: () => setDelUser(u.id),
    style: {
      background: C.danger + "22",
      borderRadius: 8,
      padding: "5px 8px",
      color: C.danger,
      fontSize: 11,
      cursor: "pointer"
    }
  }, "🗑")))), React.createElement("div", {
    onClick: () => setPwModal(true),
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "13px 14px",
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      marginBottom: 8,
      cursor: "pointer"
    }
  }, React.createElement("div", {
    style: {
      width: 34,
      height: 34,
      borderRadius: 10,
      background: C.purple + "33",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 16
    }
  }, "🔒"), React.createElement("div", {
    style: {
      flex: 1
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 13
    }
  }, "تغيير كلمة المرور"), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11
    }
  }, "لحسابك الحالي: ", session && session.username)), React.createElement("div", {
    style: {
      color: C.purple,
      fontSize: 12
    }
  }, "←")), React.createElement("div", {
    onClick: handleExportBackup,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "13px 14px",
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      marginBottom: 8,
      cursor: "pointer"
    }
  }, React.createElement("div", {
    style: {
      width: 34,
      height: 34,
      borderRadius: 10,
      background: C.teal + "33",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 16
    }
  }, "💾"), React.createElement("div", {
    style: {
      flex: 1
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 13
    }
  }, "تصدير نسخة احتياطية"), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11
    }
  }, "حفظ كل بيانات العيادة كملف JSON")), React.createElement("div", {
    style: {
      color: C.teal,
      fontSize: 12
    }
  }, "⬇")), React.createElement(DataTools, {
    isAdmin: isAdmin
  }), onLogout && React.createElement("div", {
    onClick: onLogout,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "13px 14px",
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      marginBottom: 8,
      cursor: "pointer"
    }
  }, React.createElement("div", {
    style: {
      width: 34,
      height: 34,
      borderRadius: 10,
      background: C.danger + "33",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 16
    }
  }, "⏻"), React.createElement("div", {
    style: {
      flex: 1
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 13
    }
  }, "تسجيل الخروج"))), isAdmin && React.createElement("div", {
    onClick: () => setConfirm(true),
    style: {
      background: C.danger + "11",
      border: `1px solid ${C.danger}33`,
      borderRadius: 14,
      padding: "13px 14px",
      display: "flex",
      alignItems: "center",
      gap: 12,
      cursor: "pointer",
      marginTop: 12
    }
  }, React.createElement("span", {
    style: {
      fontSize: 18
    }
  }, "🔄"), React.createElement("span", {
    style: {
      color: C.danger,
      fontWeight: 600,
      fontSize: 13
    }
  }, "إعادة تعيين البيانات الأولية")), editClinic && React.createElement(Modal, {
    title: "تعديل بيانات العيادة",
    onClose: () => setEditClinic(false)
  }, React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, React.createElement(Field, {
    label: "عنوان العيادة"
  }, React.createElement("input", {
    style: inp(),
    value: clinicForm.address || "",
    onChange: e => setClinicForm(f => ({
      ...f,
      address: e.target.value
    })),
    placeholder: "مثال: القاهرة - مصر الجديدة - شارع..."
  })), React.createElement(Field, {
    label: "رقم التواصل / الهاتف"
  }, React.createElement("input", {
    style: inp(),
    value: clinicForm.phone || "",
    onChange: e => setClinicForm(f => ({
      ...f,
      phone: e.target.value
    })),
    placeholder: "مثال: 01234567890"
  })), React.createElement(Field, {
    label: "شعار العيادة (يظهر في الروشتة والعلامة المائية)"
  }, React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10
    }
  }, clinicForm.logo && React.createElement("img", {
    src: clinicForm.logo,
    alt: "",
    style: {
      width: 52,
      height: 52,
      borderRadius: "50%",
      objectFit: "cover",
      background: "#fff"
    }
  }), React.createElement("label", {
    style: {
      flex: 1,
      textAlign: "center",
      background: C.accent + "22",
      color: C.accent,
      border: `1px dashed ${C.accent}66`,
      borderRadius: 10,
      padding: "10px 8px",
      fontSize: 12,
      cursor: "pointer"
    }
  }, clinicForm.logo ? "تغيير الشعار" : "رفع صورة الشعار", React.createElement("input", {
    type: "file",
    accept: "image/*",
    style: {
      display: "none"
    },
    onChange: e => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, 500 / Math.max(img.width, img.height));
        const cv = document.createElement("canvas");
        cv.width = Math.round(img.width * k);
        cv.height = Math.round(img.height * k);
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        setClinicForm(f => ({
          ...f,
          logo: cv.toDataURL("image/png")
        }));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        alert("تعذر قراءة الصورة");
      };
      img.src = url;
      e.target.value = "";
    }
  })), clinicForm.logo && React.createElement("span", {
    onClick: () => setClinicForm(f => ({
      ...f,
      logo: ""
    })),
    style: {
      color: C.danger,
      fontSize: 11,
      cursor: "pointer"
    }
  }, "حذف"))), React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      marginTop: 8
    }
  }, React.createElement(Btn, {
    outline: true,
    full: true,
    onClick: () => setEditClinic(false)
  }, "إلغاء"), React.createElement(Btn, {
    full: true,
    onClick: () => {
      setClinic({
        ...clinic,
        ...clinicForm
      });
      setEditClinic(false);
    }
  }, "✓ حفظ")))), modal === "add" && React.createElement(Modal, {
    title: "إضافة طبيب جديد",
    onClose: () => setModal(null)
  }, React.createElement(DoctorForm, {
    onSave: f => {
      addDoc(f);
      setModal(null);
    },
    onClose: () => setModal(null)
  })), modal && modal.edit && React.createElement(Modal, {
    title: "تعديل بيانات الطبيب",
    onClose: () => setModal(null)
  }, React.createElement(DoctorForm, {
    initial: modal.edit,
    onSave: f => {
      editDoc(f);
      setModal(null);
    },
    onClose: () => setModal(null)
  })), delDoc && React.createElement(Confirm, {
    msg: "حذف هذا الطبيب من القائمة؟",
    onOk: () => {
      delDocFn(delDoc);
      setDelDoc(null);
    },
    onNo: () => setDelDoc(null)
  }), priceModal === "add" && React.createElement(Modal, {
    title: "إضافة خدمة جديدة",
    onClose: () => setPriceModal(null)
  }, React.createElement(PriceForm, {
    onSave: f => {
      addPrice(f);
      setPriceModal(null);
    },
    onClose: () => setPriceModal(null)
  })), priceModal && priceModal.edit && React.createElement(Modal, {
    title: "تعديل سعر الخدمة",
    onClose: () => setPriceModal(null)
  }, React.createElement(PriceForm, {
    initial: priceModal.edit,
    onSave: f => {
      editPrice(f);
      setPriceModal(null);
    },
    onClose: () => setPriceModal(null)
  })), priceModal && priceModal.del && React.createElement(Confirm, {
    msg: "حذف هذه الخدمة من قائمة الأسعار؟",
    onOk: () => {
      delPrice(priceModal.del);
      setPriceModal(null);
    },
    onNo: () => setPriceModal(null)
  }), userModal === "add" && React.createElement(Modal, {
    title: "إضافة مستخدم جديد",
    onClose: () => setUserModal(null)
  }, React.createElement(UserForm, {
    error: userErr,
    onSave: addUser,
    onClose: () => setUserModal(null)
  })), userModal && userModal.edit && React.createElement(Modal, {
    title: "تعديل بيانات المستخدم",
    onClose: () => setUserModal(null)
  }, React.createElement(UserForm, {
    initial: userModal.edit,
    error: userErr,
    onSave: editUser,
    onClose: () => setUserModal(null)
  })), delUser && React.createElement(Confirm, {
    msg: "حذف هذا المستخدم؟ لن يستطيع تسجيل الدخول بعد الحذف.",
    onOk: () => {
      delUserFn(delUser);
      setDelUser(null);
    },
    onNo: () => setDelUser(null)
  }), pwModal && React.createElement(Modal, {
    title: "🔒 تغيير كلمة المرور",
    onClose: () => {
      setPwModal(false);
      setPwForm({
        old: "",
        new1: "",
        new2: ""
      });
      setPwMsg(null);
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, React.createElement(Field, {
    label: "كلمة المرور الحالية"
  }, React.createElement("input", {
    style: {
      ...inp(),
      direction: "ltr",
      textAlign: "center"
    },
    type: "password",
    value: pwForm.old,
    onChange: e => setPwForm(f => ({
      ...f,
      old: e.target.value
    }))
  })), React.createElement(Field, {
    label: "كلمة المرور الجديدة"
  }, React.createElement("input", {
    style: {
      ...inp(),
      direction: "ltr",
      textAlign: "center"
    },
    type: "password",
    value: pwForm.new1,
    onChange: e => setPwForm(f => ({
      ...f,
      new1: e.target.value
    }))
  })), React.createElement(Field, {
    label: "تأكيد كلمة المرور الجديدة"
  }, React.createElement("input", {
    style: {
      ...inp(),
      direction: "ltr",
      textAlign: "center"
    },
    type: "password",
    value: pwForm.new2,
    onChange: e => setPwForm(f => ({
      ...f,
      new2: e.target.value
    }))
  })), pwMsg && React.createElement("div", {
    style: {
      background: pwMsg.err ? C.danger + "22" : C.success + "22",
      border: `1px solid ${pwMsg.err ? C.danger : C.success}44`,
      borderRadius: 10,
      padding: "10px 14px",
      color: pwMsg.err ? C.danger : C.success,
      fontSize: 13,
      textAlign: "center"
    }
  }, pwMsg.err || pwMsg.ok), React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      marginTop: 4
    }
  }, React.createElement(Btn, {
    outline: true,
    full: true,
    onClick: () => {
      setPwModal(false);
      setPwForm({
        old: "",
        new1: "",
        new2: ""
      });
      setPwMsg(null);
    }
  }, "إلغاء"), React.createElement(Btn, {
    full: true,
    color: C.purple,
    onClick: handleChangePassword
  }, "✓ تغيير كلمة المرور")))), confirm && React.createElement(Confirm, {
    msg: "سيتم حذف جميع البيانات. هل أنت متأكد؟",
    onOk: async () => {
      await saveAutoBackup("قبل حذف كل البيانات");
      await logAudit("حذف كل البيانات", "");
      onReset();
      setConfirm(false);
    },
    onNo: () => setConfirm(false)
  }));
}
const IMAGING_TYPES = [{
  id: "oct",
  name: "OCT",
  icon: "🧬",
  hint: "Macular / RNFL / ONH"
}, {
  id: "octa",
  name: "OCT Angio",
  icon: "🩸",
  hint: "OCTA / WF-OCTA"
}, {
  id: "ffa",
  name: "FFA",
  icon: "💉",
  hint: "Fluorescein angiography"
}, {
  id: "fundus",
  name: "Fundus Photography",
  icon: "📷",
  hint: "Color / Red-free / UWF"
}, {
  id: "pentacam",
  name: "Pentacam",
  icon: "🔵",
  hint: "Corneal tomography"
}, {
  id: "erg",
  name: "ERG",
  icon: "📈",
  hint: "Electroretinography"
}, {
  id: "vf",
  name: "Visual Field",
  icon: "◉",
  hint: "Perimetry"
}, {
  id: "optos",
  name: "Optos",
  icon: "🌐",
  hint: "Ultra-widefield"
}, {
  id: "other",
  name: "Other",
  icon: "📄",
  hint: "Other imaging / test"
}];
const IMAGING_EYES = [{
  v: "OU",
  l: "OU — كلتا العينين"
}, {
  v: "OD",
  l: "OD — اليمنى"
}, {
  v: "OS",
  l: "OS — اليسرى"
}];
const IMAGING_REPORT_TEMPLATES = {
  oct: `Vitreomacular Interface:\nFoveal Contour:\nCentral Foveal Thickness OD:\nCentral Foveal Thickness OS:\nRetinal Layers:\nChoroid:\nImpression:`,
  octa: `Scan / Area:\nSuperficial Plexus:\nDeep Plexus:\nFAZ:\nNon-perfusion / Capillary Dropout:\nNeovascularization:\nImpression:`,
  ffa: `Arm-Retina Circulation:\nArterial Filling:\nVenous Emptying:\nCapillary Dropout:\nFAZ:\nLeakage / Staining / Blockage:\nImpression:`,
  fundus: `OD:\nOS:\nDisc:\nMacula:\nVessels:\nPeripheral Retina:\nImpression:`,
  pentacam: `Anterior Corneal Surface:\nPosterior Elevation:\nKeratometry:\nPachymetry:\nAstigmatism:\nImpression:`,
  erg: `Protocol:\nOD Response:\nOS Response:\nAmplitude:\nImplicit Time:\nImpression:`,
  vf: `Test Strategy:\nReliability Indices:\nMD / PSD:\nCentral Field:\nOD:\nOS:\nImpression:`,
  optos: `OD:\nOS:\nMacula:\nDisc:\nVessels:\nPeripheral Retina / 360°:\nImpression:`,
  other: `Findings:\nImpression:`
};
const IMAGING_ORDER_STATUSES = {
  requested: "مطلوب",
  scheduled: "مجدول",
  in_progress: "جارٍ التنفيذ",
  completed: "تم التنفيذ",
  reported: "تم التقرير",
  cancelled: "ملغى"
};
const localDateStr = () => {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};
const localTimeStr = () => {
  const d = new Date();
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
};
const imagingTypeName = id => (IMAGING_TYPES.find(x => x.id === id) || {}).name || id || "";
function ImagingCenter({
  patients,
  primary,
  clinic
}) {
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patientSearch, setPatientSearch] = useState("");
  const [type, setType] = useState("oct");
  const [eye, setEye] = useState("OU");
  const [notes, setNotes] = useState("");
  const [report, setReport] = useState(IMAGING_REPORT_TEMPLATES.oct);
  const [files, setFiles] = useState([]);
  const [studies, setStudies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState(null);
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedOrderTest, setSelectedOrderTest] = useState(null);
  // Phase 33 fix (H2): if iapp_create_investigation_workflow_order succeeds but the
  // following iapp_create_imaging_study fails, remember the order it already created
  // so a retry reuses it instead of creating a duplicate Core investigation/imaging order.
  const [pendingCoreOrder, setPendingCoreOrder] = useState(() => {
    try {
      const raw = localStorage.getItem("iapp_pending_core_imaging_order");
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  });
  const loadStudies = useCallback(async () => {
    setLoading(true);
    const remote = await sbGet("iapp_imaging_studies");
    const legacy = await sbGet("iapp_imaging");
    const list = Array.isArray(remote) ? remote : Array.isArray(legacy) ? legacy : [];
    setStudies(list);
    const ord = await sbGet("iapp_imaging_orders");
    setOrders(Array.isArray(ord) ? ord : []);
    setLoading(false);
  }, []);
  const advanceOrder = async (order, nextStatus) => {
    const remote = await sbGet("iapp_imaging_orders");
    const base = Array.isArray(remote) ? remote : orders;
    const next = base.map(o => o.id === order.id ? {
      ...o,
      status: nextStatus,
      lastUpdatedAt: new Date().toISOString()
    } : o);
    await sbSet("iapp_imaging_orders", next);
    setOrders(next);
    if (selectedOrder?.id === order.id) setSelectedOrder({
      ...order,
      status: nextStatus
    });
  };
  useEffect(() => {
    loadStudies();
    const sb = getSB();
    let ch = null;
    try {
      ch = sb.channel("iapp_imaging_center").on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "iapp_store",
        filter: "key=eq.iapp_imaging"
      }, p => {
        if (Array.isArray(p?.new?.value)) setStudies(p.new.value);
      }).subscribe();
    } catch {}
    return () => {
      if (ch) {
        try {
          sb.removeChannel(ch);
        } catch {}
      }
    };
  }, [loadStudies]);
  useEffect(() => {
    setReport(IMAGING_REPORT_TEMPLATES[type] || "");
  }, [type]);
  const patientResults = patients.filter(p => {
    const q = patientSearch.trim().toLowerCase();
    if (!q) return true;
    return String(p.name || "").toLowerCase().includes(q) || String(p.patientCode || "").toLowerCase().includes(q) || String(p.phone || "").includes(q);
  }).slice(0, 8);
  const uploadFile = async (file, studyId) => {
    const form = new FormData();
    form.append("file", file);
    form.append("upload_preset", "iapp_clinic");
    form.append("folder", "iapp/patient_" + (selectedPatient?.id || "unassigned") + "/imaging");
    setProgress({
      name: file.name,
      pct: 20
    });
    const resource = file.type === "application/pdf" ? "raw/upload" : file.type.startsWith("video/") ? "video/upload" : "image/upload";
    const res = await fetch("https://api.cloudinary.com/v1_1/daihhusnc/" + resource, {
      method: "POST",
      body: form
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || "Cloudinary upload failed");
    setProgress({
      name: file.name,
      pct: 100
    });
    return {
      id: data.public_id || studyId + "-" + Date.now(),
      public_id: data.public_id || "",
      name: file.name,
      src: data.secure_url || "",
      resource_type: data.resource_type || "image"
    };
  };
  const saveStudy = async () => {
    if (!selectedPatient) {
      alert("اختر المريض أولاً");
      return;
    }
    if (!files.length && !report.trim() && !notes.trim()) {
      alert("أضف صورة/ملف أو تقريراً أو ملاحظات");
      return;
    }
    setUploading(true);
    setProgress(null);
    try {
      const id = "IMG-" + Date.now();
      const uploaded = [];
      for (const f of files) uploaded.push(await uploadFile(f, id));
      const now = {
        date: localDateStr(),
        time: localTimeStr()
      };
      const chosenTest = selectedOrder?.tests?.find(t => t.id === selectedOrderTest) || selectedOrder?.tests?.[0] || null;
      const finalType = chosenTest ? IMAGING_TYPES.find(x => x.name === chosenTest.name || x.id === chosenTest.id)?.id || type : type;
      const finalEye = chosenTest?.eye || eye;
      let coreWorkflow = null;
      let coreStudyId = null;
      let coreVisitId = null;
      let coreSyncError = null;
      try {
        const sb = getSB();
        if (sb && !offlineNow()) {
          const selectedCoreOrderId = selectedOrder?.coreInvestigationOrderId || selectedOrder?.investigationOrderId || null;
          if (selectedCoreOrderId) {
            coreVisitId = selectedOrder?.coreVisitId || null;
            const { data, error } = await iappRpc(sb, "iapp_create_imaging_study", imagingStudyRpcParams({ orderId: selectedCoreOrderId, typeName: imagingTypeName(finalType), modality: finalType, eye: finalEye, uploaded, report, notes, metadata: { patient_id: selectedPatient.id, order_id: selectedOrder?.id || null } }));
            if (error) throw error;
            coreStudyId = data || null;
          } else if (pendingCoreOrder && pendingCoreOrder.patientId === selectedPatient.id) {
            // Phase 33 fix (H2): a previous attempt already created the Core
            // investigation/imaging order but failed before the study was recorded —
            // reuse it instead of creating a duplicate order on retry.
            coreWorkflow = pendingCoreOrder.coreWorkflow;
            coreVisitId = pendingCoreOrder.coreVisitId;
            const { data: studyId, error: studyError } = await iappRpc(sb, "iapp_create_imaging_study", imagingStudyRpcParams({ orderId: pendingCoreOrder.investigationOrderId, typeName: imagingTypeName(finalType), modality: finalType, eye: finalEye, uploaded, report, notes, metadata: { patient_id: selectedPatient.id, legacy_imaging_id: id } }));
            if (studyError) throw studyError;
            coreStudyId = studyId || null;
          } else {
            const { data, error } = await iappRpc(sb, "iapp_create_investigation_workflow_order", imagingSingleOrderParams({ patientId: selectedPatient.id, typeName: imagingTypeName(finalType), type: finalType, eye: finalEye, doctorName: primary?.name, notes, sourceLegacyId: id }));
            if (error) throw error;
            coreWorkflow = data || null;
            coreVisitId = data?.visit_id || null;
            // Phase 33 fix (H2): remember the order we just created BEFORE attempting
            // the study write, so a failure below doesn't leave it invisible to a retry
            // (which would otherwise create yet another duplicate order).
            const nextPendingCoreOrder = {
              patientId: selectedPatient.id,
              investigationOrderId: data?.investigation_order_id || null,
              coreWorkflow: data || null,
              coreVisitId: data?.visit_id || null
            };
            setPendingCoreOrder(nextPendingCoreOrder);
            try {
              localStorage.setItem("iapp_pending_core_imaging_order", JSON.stringify(nextPendingCoreOrder));
            } catch (_) {}
            const { data: studyId, error: studyError } = await iappRpc(sb, "iapp_create_imaging_study", imagingStudyRpcParams({ orderId: data?.investigation_order_id, typeName: imagingTypeName(finalType), modality: finalType, eye: finalEye, uploaded, report, notes, metadata: { patient_id: selectedPatient.id, legacy_imaging_id: id } }));
            if (studyError) throw studyError;
            coreStudyId = studyId || null;
          }
        } else {
          coreSyncError = "offline";
        }
      } catch (e) {
        coreSyncError = e?.message || String(e);
        console.warn("[core imaging sync]", e);
      }
      const rec = {
        id,
        patientId: selectedPatient.id,
        patient: selectedPatient.name,
        patientCode: selectedPatient.patientCode || "",
        date: now.date,
        time: now.time,
        doctor: primary && primary.name || "",
        type: finalType,
        typeName: imagingTypeName(finalType),
        eye: finalEye,
        files: uploaded,
        notes: notes.trim(),
        report: report.trim(),
        status: report.trim() ? "reported" : "completed",
        orderId: selectedOrder?.id || null,
        orderTestId: chosenTest?.id || null,
        coreVisitId,
        coreInvestigationOrderId: coreWorkflow?.investigation_order_id || selectedOrder?.coreInvestigationOrderId || null,
        coreImagingOrderId: coreWorkflow?.imaging_order_id || selectedOrder?.coreImagingOrderId || null,
        coreImagingStudyId: coreStudyId,
        coreSyncError,
        createdAt: new Date().toISOString()
      };
      const remoteStudies = await sbGet("iapp_imaging_studies");
      const studyBase = Array.isArray(remoteStudies) ? remoteStudies : [];
      await sbSet("iapp_imaging_studies", [rec, ...studyBase]);
      const old = await sbGet("iapp_imaging");
      await sbSet("iapp_imaging", [rec, ...(Array.isArray(old) ? old : [])]);
      const metaKey = "iapp_imgmeta_" + selectedPatient.id;
      const oldMeta = await sbGet(metaKey);
      const metaBase = Array.isArray(oldMeta) ? oldMeta : [];
      const newMeta = uploaded.map(f => ({
        id: f.id,
        public_id: f.public_id,
        name: f.name,
        date: now.date,
        time: now.time,
        src: f.src,
        notes: notes.trim(),
        type: imagingTypeName(finalType),
        eye: finalEye,
        examId: id
      }));
      await sbSet(metaKey, [...newMeta, ...metaBase]);
      const remoteExams = await sbGet("iapp_exams");
      const examBase = Array.isArray(remoteExams) ? remoteExams : [];
      const examRec = {
        id: "EX-" + id,
        patientId: selectedPatient.id,
        date: now.date,
        time: now.time,
        doctor: primary && primary.name || "",
        testType: imagingTypeName(finalType),
        eye: finalEye,
        report: report.trim(),
        notes: notes.trim(),
        status: "completed",
        imagingStudyId: id,
        imagingOrderId: selectedOrder?.id || null,
        files: uploaded
      };
      await sbSet("iapp_exams", [examRec, ...examBase]);
      if (selectedOrder) {
        const remoteOrders = await sbGet("iapp_imaging_orders");
        const orderBase = Array.isArray(remoteOrders) ? remoteOrders : orders;
        const nextOrders = orderBase.map(o => o.id === selectedOrder.id ? {
          ...o,
          status: report.trim() ? "reported" : "completed",
          completedAt: new Date().toISOString(),
          completedStudyId: id
        } : o);
        await sbSet("iapp_imaging_orders", nextOrders);
        setOrders(nextOrders);
      }
      setStudies(prev => [rec, ...prev]);
      setSelectedOrder(null);
      setSelectedOrderTest(null);
      setFiles([]);
      setNotes("");
      setReport(IMAGING_REPORT_TEMPLATES[type] || "");
      setProgress(null);
      // Phase 34 hardening: keep the Core order retry guard when Core sync failed.
      // The guard is persisted so a page refresh cannot cause a duplicate workflow order.
      if (!coreSyncError) {
        setPendingCoreOrder(null);
        try { localStorage.removeItem("iapp_pending_core_imaging_order"); } catch (_) {}
      }
      if (coreSyncError && coreSyncError !== "offline") {
        alert("✓ تم حفظ الفحص محليًا وربطه بملف المريض، لكن مزامنته مع Core فشلت (" + coreSyncError + "). سيتم عرضه في السجل المحلي، ويُنصح بمراجعته لاحقًا.");
      } else if (coreSyncError === "offline") {
        alert("✓ تم حفظ الفحص محليًا. الجهاز غير متصل حاليًا، وستتم مزامنته مع Core عند توفر الاتصال.");
      } else {
        alert("✓ تم تنفيذ الفحص وربطه بطلب الأشعة وملف المريض");
      }
    } catch (e) {
      alert("فشل حفظ الفحص: " + e.message);
    } finally {
      setUploading(false);
    }
  };
  const deleteStudy = async id => {
    if (!confirm("حذف سجل الفحص من التطبيق؟ سيتم الاحتفاظ بالملفات على Cloudinary حتى يتم حذفها من الخادم بشكل آمن.")) return;
    const remote = await sbGet("iapp_imaging_studies");
    const base = Array.isArray(remote) ? remote : studies;
    const target = base.find(x => x.id === id);
    const next = base.filter(x => x.id !== id);
    await trashPut("iapp_imaging_studies", target, "فحص صور");
    logAudit("حذف فحص صور", target && (target.patient || "") + " · " + (target.type || "") || id);
    await sbSet("iapp_imaging_studies", next);
    const old = await sbGet("iapp_imaging");
    if (Array.isArray(old)) await sbSet("iapp_imaging", old.filter(x => x.id !== id));
    if (target?.orderId) {
      const ord = await sbGet("iapp_imaging_orders");
      if (Array.isArray(ord)) await sbSet("iapp_imaging_orders", ord.map(o => o.id === target.orderId ? {
        ...o,
        status: "cancelled",
        cancelledAt: new Date().toISOString()
      } : o));
    }
    setStudies(next);
    setView(null);
    loadStudies();
  };
  const filtered = studies.filter(x => (filter === "all" || x.type === filter) && (!search || String(x.patient || "").includes(search) || String(x.patientCode || "").includes(search))).sort((a, b) => String(b.date + b.time).localeCompare(String(a.date + a.time)));
  return React.createElement("div", {
    style: {
      padding: "16px 16px 90px"
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 14
    }
  }, React.createElement("div", null, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 800,
      fontSize: 16
    }
  }, "🖼️ Imaging Center"), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11,
      marginTop: 3
    }
  }, "OCT · OCTA · FFA · Fundus · Pentacam · ERG · VF · Optos")), React.createElement("span", {
    style: {
      background: C.accent + "22",
      color: C.accent,
      borderRadius: 9,
      padding: "5px 8px",
      fontSize: 10,
      fontWeight: 700
    }
  }, studies.length, " سجل")), React.createElement("div", {
    style: {
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 16,
      padding: 14,
      marginBottom: 14
    }
  }, React.createElement(SecHead, {
    icon: "👤",
    label: "اختيار المريض"
  }), selectedPatient ? React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  }, React.createElement("div", {
    style: {
      flex: 1,
      background: C.accent + "11",
      border: `1px solid ${C.accent}55`,
      borderRadius: 10,
      padding: "9px 12px"
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 13
    }
  }, selectedPatient.name), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10
    }
  }, selectedPatient.patientCode, " · ", selectedPatient.phone)), React.createElement("button", {
    onClick: () => setSelectedPatient(null),
    style: {
      background: C.danger + "22",
      border: "none",
      borderRadius: 8,
      color: C.danger,
      fontSize: 18,
      padding: "6px 10px"
    }
  }, "×")) : React.createElement("div", {
    style: {
      position: "relative"
    }
  }, React.createElement("input", {
    value: patientSearch,
    onChange: e => setPatientSearch(e.target.value),
    placeholder: "ابحث بالاسم أو رقم الملف...",
    style: inp()
  }), patientSearch && React.createElement("div", {
    style: {
      position: "absolute",
      zIndex: 20,
      left: 0,
      right: 0,
      top: 48,
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: 10,
      maxHeight: 220,
      overflowY: "auto"
    }
  }, patientResults.map(p => React.createElement("div", {
    key: p.id,
    onClick: () => {
      setSelectedPatient(p);
      setPatientSearch("");
    },
    style: {
      padding: "10px 12px",
      borderBottom: `1px solid ${C.border}33`,
      cursor: "pointer"
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 12,
      fontWeight: 700
    }
  }, p.name), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10
    }
  }, p.patientCode || "—", " · ", p.phone || "")))))), selectedPatient && orders.filter(o => o.patientId === selectedPatient.id && !['reported', 'cancelled'].includes(o.status)).length > 0 && React.createElement("div", {
    style: {
      background: C.card,
      border: `1px solid ${C.gold}44`,
      borderRadius: 16,
      padding: 14,
      marginBottom: 14
    }
  }, React.createElement(SecHead, {
    icon: "🩻",
    label: "طلبات معلقة لهذا المريض"
  }), React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 7
    }
  }, orders.filter(o => o.patientId === selectedPatient.id && !['reported', 'cancelled'].includes(o.status)).map(o => React.createElement("div", {
    key: o.id,
    style: {
      border: `1px solid ${selectedOrder?.id === o.id ? C.accent : C.border}`,
      background: selectedOrder?.id === o.id ? C.accent + "12" : C.bg,
      borderRadius: 10,
      padding: 9
    }
  }, React.createElement("div", {
    onClick: () => {
      setSelectedOrder(o);
      setSelectedOrderTest(o.tests?.[0]?.id || null);
      const first = o.tests?.[0];
      if (first) {
        const t = IMAGING_TYPES.find(x => x.name === first.name || x.id === first.id);
        if (t) setType(t.id);
        setEye(first.eye || "OU");
      }
      setNotes(o.notes || "");
    },
    style: {
      cursor: "pointer"
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between"
    }
  }, React.createElement("span", {
    style: {
      color: C.text,
      fontSize: 11,
      fontWeight: 700
    }
  }, o.id), React.createElement(Tag, {
    label: IMAGING_ORDER_STATUSES[o.status] || o.status,
    color: o.status === "requested" ? C.gold : C.teal
  })), React.createElement("div", {
    style: {
      display: "flex",
      gap: 5,
      flexWrap: "wrap",
      marginTop: 5
    }
  }, (o.tests || []).map(t => React.createElement("button", {
    key: t.id,
    onClick: e => {
      e.stopPropagation();
      setSelectedOrder(o);
      setSelectedOrderTest(t.id);
      const tt = IMAGING_TYPES.find(x => x.name === t.name || x.id === t.id);
      if (tt) setType(tt.id);
      setEye(t.eye || "OU");
      setNotes(o.notes || "");
    },
    style: {
      background: selectedOrderTest === t.id && selectedOrder?.id === o.id ? C.accent + "22" : C.bg,
      border: `1px solid ${selectedOrderTest === t.id && selectedOrder?.id === o.id ? C.accent : C.border}`,
      borderRadius: 6,
      color: C.muted,
      fontSize: 9,
      padding: "3px 6px"
    }
  }, t.name, " · ", t.eye || "OU")))), React.createElement("div", {
    style: {
      display: "flex",
      gap: 5,
      marginTop: 7
    }
  }, o.status === "requested" && React.createElement("button", {
    onClick: () => advanceOrder(o, "scheduled"),
    style: {
      flex: 1,
      background: C.gold + "18",
      border: `1px solid ${C.gold}44`,
      borderRadius: 7,
      color: C.gold,
      fontSize: 9,
      padding: 5
    }
  }, "📅 جدولة"), o.status === "scheduled" && React.createElement("button", {
    onClick: () => advanceOrder(o, "in_progress"),
    style: {
      flex: 1,
      background: C.teal + "18",
      border: `1px solid ${C.teal}44`,
      borderRadius: 7,
      color: C.teal,
      fontSize: 9,
      padding: 5
    }
  }, "▶ بدء التنفيذ"), o.status === "in_progress" && React.createElement("span", {
    style: {
      flex: 1,
      textAlign: "center",
      color: C.teal,
      fontSize: 9,
      padding: 5
    }
  }, "جارٍ التنفيذ — احفظ النتيجة بعد الانتهاء")))))), React.createElement("div", {
    style: {
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 16,
      padding: 14,
      marginBottom: 14
    }
  }, React.createElement(SecHead, {
    icon: "🔬",
    label: "نوع الفحص"
  }), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 8
    }
  }, IMAGING_TYPES.map(t => React.createElement("div", {
    key: t.id,
    onClick: () => setType(t.id),
    style: {
      border: `1px solid ${type === t.id ? C.accent : C.border}`,
      background: type === t.id ? C.accent + "15" : C.bg,
      borderRadius: 10,
      padding: "9px 10px",
      cursor: "pointer"
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 7
    }
  }, React.createElement("span", null, t.icon), React.createElement("span", {
    style: {
      color: type === t.id ? C.accent : C.text,
      fontWeight: 700,
      fontSize: 12
    }
  }, t.name)), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 9,
      marginTop: 3
    }
  }, t.hint)))), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10,
      marginTop: 12
    }
  }, React.createElement(Field, {
    label: "العين"
  }, React.createElement("select", {
    style: inp(),
    value: eye,
    onChange: e => setEye(e.target.value)
  }, IMAGING_EYES.map(x => React.createElement("option", {
    key: x.v,
    value: x.v
  }, x.l)))), React.createElement(Field, {
    label: "التاريخ"
  }, React.createElement("input", {
    style: inp(),
    type: "date",
    value: localDateStr(),
    readOnly: true
  })))), React.createElement("div", {
    style: {
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 16,
      padding: 14,
      marginBottom: 14
    }
  }, React.createElement(SecHead, {
    icon: "☁️",
    label: "رفع الصور / الملفات"
  }), React.createElement("label", {
    style: {
      display: "block",
      border: `1px dashed ${C.accent}66`,
      borderRadius: 12,
      padding: 18,
      textAlign: "center",
      cursor: "pointer",
      background: C.accent + "08"
    }
  }, React.createElement("input", {
    type: "file",
    accept: "image/*,.pdf",
    multiple: true,
    style: {
      display: "none"
    },
    onChange: e => {
      setFiles(Array.from(e.target.files || []));
      e.target.value = "";
    }
  }), React.createElement("div", {
    style: {
      fontSize: 25
    }
  }, "📤"), React.createElement("div", {
    style: {
      color: C.accent,
      fontWeight: 700,
      fontSize: 12
    }
  }, "اختيار صور / ملفات الفحص"), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10,
      marginTop: 3
    }
  }, "يمكن اختيار أكثر من ملف")), files.length > 0 && React.createElement("div", {
    style: {
      marginTop: 10
    }
  }, files.map((f, i) => React.createElement("div", {
    key: i,
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      background: C.bg,
      borderRadius: 8,
      padding: "7px 9px",
      marginBottom: 5
    }
  }, React.createElement("span", {
    style: {
      color: C.text,
      fontSize: 10,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  }, f.name), React.createElement("span", {
    style: {
      color: C.muted,
      fontSize: 9
    }
  }, Math.round(f.size / 1024), " KB")))), progress && React.createElement("div", {
    style: {
      marginTop: 8,
      color: C.accent,
      fontSize: 10
    }
  }, "⏫ ", progress.name, " · ", progress.pct, "%")), React.createElement("div", {
    style: {
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 16,
      padding: 14,
      marginBottom: 14
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8
    }
  }, React.createElement(SecHead, {
    icon: "📝",
    label: "التقرير"
  }), React.createElement("button", {
    onClick: () => setReport(IMAGING_REPORT_TEMPLATES[type] || ""),
    style: {
      background: C.purple + "22",
      border: `1px solid ${C.purple}33`,
      borderRadius: 8,
      color: C.purple,
      fontSize: 10,
      padding: "5px 8px"
    }
  }, "↻ قالب")), React.createElement("textarea", {
    value: report,
    onChange: e => setReport(e.target.value),
    rows: 9,
    style: {
      ...inp(),
      resize: "vertical",
      direction: "ltr",
      textAlign: "left",
      lineHeight: 1.7
    }
  }), React.createElement(Field, {
    label: "ملاحظات إضافية"
  }, React.createElement("textarea", {
    value: notes,
    onChange: e => setNotes(e.target.value),
    rows: 3,
    style: {
      ...inp(),
      resize: "none"
    },
    placeholder: "ملاحظات الطبيب أو الفني..."
  })), React.createElement(Btn, {
    full: true,
    onClick: saveStudy
  }, uploading ? "⏳ جاري الرفع والحفظ..." : "💾 حفظ الفحص والتقرير")), React.createElement("div", {
    style: {
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 16,
      padding: 14
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10
    }
  }, React.createElement(SecHead, {
    icon: "🗂️",
    label: "السجل"
  }), React.createElement("button", {
    onClick: loadStudies,
    style: {
      background: "transparent",
      border: `1px solid ${C.border}`,
      borderRadius: 8,
      color: C.muted,
      padding: "5px 8px"
    }
  }, "🔄")), React.createElement("input", {
    value: search,
    onChange: e => setSearch(e.target.value),
    placeholder: "بحث في السجل...",
    style: {
      ...inp(),
      marginBottom: 8
    }
  }), React.createElement("div", {
    style: {
      display: "flex",
      gap: 5,
      overflowX: "auto",
      marginBottom: 10
    }
  }, [{
    id: "all",
    l: "الكل"
  }, ...IMAGING_TYPES.map(t => ({
    id: t.id,
    l: t.name
  }))].map(x => React.createElement("button", {
    key: x.id,
    onClick: () => setFilter(x.id),
    style: {
      background: filter === x.id ? C.accent + "22" : "transparent",
      border: `1px solid ${filter === x.id ? C.accent : C.border}`,
      borderRadius: 8,
      color: filter === x.id ? C.accent : C.muted,
      padding: "5px 8px",
      fontSize: 9,
      whiteSpace: "nowrap"
    }
  }, x.l))), loading ? React.createElement("div", {
    style: {
      padding: 25,
      textAlign: "center",
      color: C.muted
    }
  }, "⏳ جاري التحميل...") : filtered.length === 0 ? React.createElement("div", {
    style: {
      padding: 25,
      textAlign: "center",
      color: C.muted
    }
  }, "No investigations saved") : filtered.slice(0, 30).map(x => React.createElement("div", {
    key: x.id,
    onClick: () => setView(x),
    style: {
      background: C.bg,
      border: `1px solid ${C.border}`,
      borderRadius: 11,
      padding: 10,
      marginBottom: 7,
      cursor: "pointer"
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      gap: 8
    }
  }, React.createElement("div", null, React.createElement("span", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 12
    }
  }, x.patient), React.createElement("span", {
    style: {
      color: C.muted,
      fontSize: 9
    }
  }, " · ", x.patientCode)), React.createElement(Tag, {
    label: x.status === "reported" ? "تم التقرير" : "بدون تقرير",
    color: x.status === "reported" ? C.success : C.gold
  })), React.createElement("div", {
    style: {
      color: C.accent,
      fontSize: 10,
      marginTop: 4
    }
  }, x.typeName, " · ", x.eye, " · ", x.date, " ", x.time), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 9,
      marginTop: 3
    }
  }, x.files?.length || 0, " ملف · ", x.doctor || "")))), view && React.createElement(Modal, {
    title: "📄 " + view.typeName + " — " + view.patient,
    onClose: () => setView(null)
  }, React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 10
    }
  }, React.createElement("div", {
    style: {
      background: C.bg,
      borderRadius: 10,
      padding: 10,
      color: C.muted,
      fontSize: 11
    }
  }, view.date, " ", view.time, " · ", view.eye, " · ", view.doctor), view.files?.map((f, i) => React.createElement("div", {
    key: i,
    style: {
      border: `1px solid ${C.border}`,
      borderRadius: 10,
      padding: 8
    }
  }, f.src && f.resource_type !== "raw" && f.resource_type !== "video" ? React.createElement("img", {
    src: f.src,
    style: {
      width: "100%",
      maxHeight: 260,
      objectFit: "contain",
      background: "#000",
      borderRadius: 8
    }
  }) : React.createElement("a", {
    href: f.src,
    target: "_blank",
    rel: "noreferrer",
    style: {
      display: "block",
      padding: 18,
      textAlign: "center",
      background: C.bg,
      borderRadius: 8,
      color: C.accent,
      fontWeight: 700,
      fontSize: 11
    }
  }, "📄 فتح الملف"), React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 10,
      marginTop: 5
    }
  }, f.name))), view.report && React.createElement("div", {
    style: {
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 10,
      padding: 10
    }
  }, React.createElement("div", {
    style: {
      color: C.gold,
      fontWeight: 700,
      fontSize: 11,
      marginBottom: 6
    }
  }, "التقرير"), React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 11,
      lineHeight: 1.8,
      whiteSpace: "pre-wrap",
      direction: "ltr",
      textAlign: "left"
    }
  }, view.report)), view.notes && React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11,
      whiteSpace: "pre-wrap"
    }
  }, "📝 ", view.notes), React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, React.createElement(Btn, {
    outline: true,
    full: true,
    onClick: () => printDoc(`<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>${view.typeName}</title><style>body{font-family:Arial;padding:20px}img{max-width:100%;max-height:500px}pre{white-space:pre-wrap;line-height:1.7}</style></head><body><h2>${view.typeName}</h2><p>${view.patient} · ${view.patientCode || ""} · ${view.date}</p>${(view.files || []).map(f => f.src && f.resource_type !== "raw" ? `<img src="${f.src}"/>` : f.src ? `<p><a href="${f.src}">فتح الملف: ${f.name || "file"}</a></p>` : "").join("")}<h3>Report</h3><pre>${view.report || ""}</pre><p>${view.notes || ""}</p></body></html>`)
  }, "🖨️ طباعة"), React.createElement(Btn, {
    danger: true,
    full: true,
    onClick: () => deleteStudy(view.id)
  }, "🗑 حذف السجل")))));
}
function App() {
  const [session, setSession] = useState(() => {
    try {
      const p = localStorage.getItem("iapp_session");
      if (p) return JSON.parse(p);
    } catch {}
    try {
      return JSON.parse(sessionStorage.getItem("iapp_session"));
    } catch {
      return null;
    }
  });
  const [users, setUsersState] = useState(() => getUsers());
  const setUsers = list => {
    saveUsers(list);
    setUsersState(list);
  };
  const [tab, setTab] = useState("dashboard");
  const [patOpenId, setPatOpenId] = useState(null);
  const [patNewName, setPatNewName] = useState("");
  const [showAlerts, setShowAlerts] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [alertsShown, setAlertsShown] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState(null);
  const showToast = msg => {
    setToast(msg);
  };
  useEffect(() => {
    const openSettings = () => setTab("settings");
    window.addEventListener("iapp-open-settings", openSettings);
    return () => window.removeEventListener("iapp-open-settings", openSettings);
  }, []);
  const [patients, setRawP, pR] = useDB("iapp_patients", SEED.patients);
  const [appointments, setRawA, aR, refreshAppointments] = useDB("iapp_appointments", SEED.appointments);
  const [prescriptions, setRawRx, rR] = useDB("iapp_prescriptions", SEED.prescriptions);
  const [exams, setRawE, eR] = useDB("iapp_exams", SEED.exams);
  const [visits, setRawV, vR] = useDB("iapp_visits", SEED.visits);
  const [doctors, setRawD, dR] = useDB("iapp_doctors", SEED.doctors);
  const [prices, setRawPr, prR] = useDB("iapp_prices", SEED.prices);
  const [customTests, setRawCT, ctR] = useDB("iapp_custom_tests", SEED.customTests);
  const [clinic, setRawCl, clR] = useDB("iapp_clinic", SEED.clinic);
  const [expenses, setRawEx, exR] = useDB("iapp_expenses", SEED.expenses);
  const [recurringExpenses, setRawRE, reR] = useDB("iapp_recurring_expenses", SEED.recurringExpenses);
  useEffect(() => {
    if (!session) return;
    refreshAppointments();
    const iv = setInterval(refreshAppointments, 5000);
    return () => clearInterval(iv);
  }, [session, refreshAppointments]);
  const withSync = fn => async v => {
    setSyncing(true);
    const ok = await fn(v);
    setTimeout(() => setSyncing(false), 1200);
    // لا نعرض Toast البرتقالي عند فشل المزامنة؛ حالة المزامنة نفسها تظهر في شريط الحالة.
    // وبذلك لا تُفهم كل مشكلة مزامنة على أنها "Offline".
    if (ok === false) {
      refreshPending();
    } else {
      showToast("تم الحفظ والمزامنة");
    }
  };
  const setPatients = withSync(setRawP);
  const setAppointments = withSync(setRawA);
  const updateSharedAppointment = async apt => {
    const remote = await sbGet("iapp_appointments");
    const base = Array.isArray(remote) ? remote : appointments;
    const next = base.some(a => a.id === apt.id) ? base.map(a => a.id === apt.id ? apt : a) : [...base, apt];
    await setAppointments(next);
  };
  const setRx = withSync(setRawRx);
  const setExams = withSync(setRawE);
  const setVisits = withSync(setRawV);
  const setDoctors = withSync(setRawD);
  const setPrices = withSync(setRawPr);
  const setCustomTests = withSync(setRawCT);
  const setClinic = withSync(setRawCl);
  const setExpenses = withSync(setRawEx);
  const setRecurringExpenses = withSync(setRawRE);
  const primary = doctors.find(d => d.isPrimary) || doctors[0] || {
    name: "د. عبدالستار صقر",
    short: "د. عبدالستار",
    initial: "ع"
  };
  const doctorNames = doctors.map(d => d.short);
  const reset = () => {
    setRawP(SEED.patients);
    setRawA(SEED.appointments);
    setRawRx(SEED.prescriptions);
    setRawE(SEED.exams);
    setRawV(SEED.visits);
    setRawD(SEED.doctors);
    setRawPr(SEED.prices);
    setRawCT(SEED.customTests);
    setRawCl(SEED.clinic);
    setRawEx(SEED.expenses);
    setRawRE(SEED.recurringExpenses);
  };
  useEffect(() => {
    if (!alertsShown && session) {
      setAlertsShown(true);
      setTimeout(() => setShowAlerts(true), 800);
    }
  }, [session]);
  const handleLogin = (u, remember) => {
    const s = {
      id: u.id,
      username: u.username,
      name: u.name,
      role: u.role
    };
    if (remember) {
      try {
        localStorage.setItem("iapp_session", JSON.stringify(s));
      } catch {}
    } else {
      try {
        sessionStorage.setItem("iapp_session", JSON.stringify(s));
      } catch {}
    }
    setSession(s);
  };
  const handleLogout = () => {
    try {
      localStorage.removeItem("iapp_session");
    } catch {}
    try {
      sessionStorage.removeItem("iapp_session");
    } catch {}
    setSession(null);
    setTab("dashboard");
    try {
      if (window.__iappUnifiedLogout) window.__iappUnifiedLogout();
    } catch {}
  };
  if (!session) return React.createElement(LoginScreen, {
    onLogin: handleLogin
  });
  const effectiveTab = tab === "accounting" && session.role !== "admin" ? "dashboard" : tab;
  if (!pR || !aR || !rR || !eR || !vR || !dR || !prR || !ctR || !clR || !exR || !reR) return React.createElement("div", {
    style: {
      minHeight: "100vh",
      background: C.bg,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      direction: "rtl",
      fontFamily: "'Segoe UI','Tahoma',Arial,sans-serif"
    }
  }, React.createElement("div", {
    style: {
      textAlign: "center"
    }
  }, React.createElement("div", {
    style: {
      fontSize: 40,
      marginBottom: 16
    }
  }, "👁"), React.createElement("div", {
    style: {
      color: C.accent,
      fontSize: 16,
      fontWeight: 700
    }
  }, "I App"), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 13,
      marginTop: 8
    }
  }, "جاري التحميل...")));
  const screens = {
    dashboard: React.createElement(Dashboard, {
      patients: patients,
      appointments: appointments,
      visits: visits,
      primary: primary,
      clinic: clinic,
      onDailyReport: () => {
        const html = getDailyReportHTML(localISO(), patients, visits, appointments, primary, clinic);
        printDoc(html);
      },
      onPatientClick: (name, p) => {
        if (p && p.id) {
          setPatOpenId(p.id);
        } else {
          setPatNewName(name);
        }
        setTab("patients");
      }
    }),
    patients: React.createElement(Patients, {
      patients: patients,
      setPatients: setPatients,
      initOpenId: patOpenId,
      initNewName: patNewName,
      onInitDone: () => {
        setPatOpenId(null);
        setPatNewName("");
      },
      exams: exams,
      setExams: setExams,
      prescriptions: prescriptions,
      setRx: setRx,
      visits: visits,
      setVisits: setVisits,
      doctorNames: doctorNames,
      primaryDoctor: primary,
      prices: prices,
      clinic: clinic,
      session: session,
      customTests: customTests
    }),
    appointments: React.createElement(Appointments, {
      appointments: appointments,
      setAppointments: setAppointments,
      doctorNames: doctorNames,
      patients: patients,
      session: session,
      onPatientClick: (name, p) => {
        if (p && p.id) {
          setPatOpenId(p.id);
        } else {
          setPatNewName(name);
        }
        setTab("patients");
      }
    }),
    waiting: React.createElement(WaitingRoom, {
      apts: appointments,
      today: localISO(),
      onUpdateApt: updateSharedAppointment,
      onCollect: () => {},
      doctorNames: doctorNames
    }),
    prescriptions: React.createElement(Prescriptions, {
      prescriptions: prescriptions,
      setRx: setRx,
      patients: patients,
      doctorNames: doctorNames,
      primaryDoctor: primary,
      clinic: clinic
    }),
    radiology: React.createElement(Radiology, {
      patients: patients,
      customTests: customTests,
      setCustomTests: setCustomTests,
      setExams: setExams,
      primary: primary,
      clinic: clinic
    }),
    imaging: React.createElement(ImagingCenter, {
      patients: patients,
      primary: primary,
      clinic: clinic
    }),
    accounting: React.createElement(Accounting, {
      visits: visits,
      expenses: expenses,
      setExpenses: setExpenses,
      recurringExpenses: recurringExpenses,
      setRecurringExpenses: setRecurringExpenses,
      doctors: doctors,
      clinic: clinic
    }),
    settings: React.createElement(Settings, {
      patients: patients,
      appointments: appointments,
      prescriptions: prescriptions,
      exams: exams,
      visits: visits,
      doctors: doctors,
      setDoctors: setDoctors,
      prices: prices,
      setPrices: setPrices,
      clinic: clinic,
      setClinic: setClinic,
      onReset: reset,
      users: users,
      setUsers: setUsers,
      session: session,
      onLogout: handleLogout
    })
  };
  return React.createElement("div", {
    style: {
      minHeight: "100vh",
      background: "#000",
      display: "flex",
      justifyContent: "center",
      alignItems: "flex-start"
    }
  }, React.createElement("div", {
    style: {
      width: "100%",
      maxWidth: 480,
      minHeight: "100vh",
      background: C.bg,
      direction: "rtl",
      fontFamily: "'Segoe UI','Tahoma',Arial,sans-serif",
      position: "relative",
      overflowX: "hidden"
    }
  }, React.createElement(TopBar, {
    primary: primary,
    onSearch: () => setShowSearch(true),
    syncing: syncing,
    session: session,
    onLogout: handleLogout
  }), React.createElement("div", {
    style: {
      overflowY: "auto",
      maxHeight: "calc(100vh - 128px)",
      animation: "slideUp 0.25s ease"
    }
  }, screens[effectiveTab]), React.createElement(BottomNav, {
    active: effectiveTab,
    setActive: setTab,
    role: session.role
  }), showAlerts && React.createElement(FollowUpCentre, {
    visits: visits,
    patients: patients,
    onPatientClick: id => {
      setPatOpenId(id);
      setTab("patients");
    },
    onClose: () => setShowAlerts(false)
  }), showSearch && React.createElement(GlobalSearch, {
    patients: patients,
    prescriptions: prescriptions,
    appointments: appointments,
    onNavigate: (t, id) => {
      if (t === "patients" && id) {
        setPatOpenId(id);
      }
      setTab(t);
      setShowSearch(false);
    },
    onClose: () => setShowSearch(false)
  }), toast && React.createElement(Toast, {
    msg: toast,
    onDone: () => setToast(null)
  })));
}
const PATIENT_CLINICS = [{
  id: "damnhour",
  name: "عيادة دمنهور",
  address: "برج المنتزه بجوار حديقة الجمهورية",
  phone: "0453333313",
  icon: "🏥",
  days: [0, 1, 3, 4, 6],
  dayNames: ["الأحد", "الاثنين", "الأربعاء", "الخميس", "السبت"],
  sessions: [{
    slots: ["20:00", "20:30", "21:00", "21:30", "22:00"]
  }]
}, {
  id: "rahmania",
  name: "عيادة الرحمانية",
  address: "ش أحمد محمود بجوار فرع we",
  phone: "01111480137",
  icon: "🏨",
  days: [6, 1, 3],
  dayNames: ["السبت", "الاثنين", "الأربعاء"],
  sessions: [{
    slots: ["16:00", "16:30", "17:00", "17:30", "18:00"]
  }]
}, {
  id: "center",
  name: "مركز دمنهور للعيون",
  address: "دمنهور",
  phone: "0453333313",
  icon: "👁",
  schedule: {
    0: {
      slots: ["13:00", "13:30", "14:00", "14:30", "15:00", "15:30"]
    },
    1: {
      slots: ["13:00", "13:30", "14:00", "14:30", "15:00", "15:30"]
    },
    2: {
      slots: ["15:00", "15:30", "16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30"]
    },
    4: {
      slots: ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30"]
    }
  },
  dayNames: ["الأحد", "الاثنين", "الثلاثاء", "الخميس"]
}];
const CLINIC_CODE = {
  "عيادة دمنهور": "دمنهور",
  "عيادة الرحمانية": "الرحمانية",
  "مركز دمنهور للعيون": "مركز دمنهور للعيون"
};
const SHORT_TO_NAME = {
  "دمنهور": "عيادة دمنهور",
  "الرحمانية": "عيادة الرحمانية",
  "مركز دمنهور للعيون": "مركز دمنهور للعيون"
};
const clinicDisplay = v => SHORT_TO_NAME[v] || v || "";
function getAvailableDates(c) {
  const dates = [];
  const now = new Date();
  for (let i = 1; i <= 30; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const dow = d.getDay();
    const ok = c.days ? c.days.includes(dow) : c.schedule && c.schedule[dow] !== undefined;
    if (ok) dates.push({
      date: localISO(d),
      dayName: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"][dow],
      dayOfWeek: dow
    });
  }
  return dates;
}
function getSlots(c, dow) {
  if (c.sessions) return c.sessions[0].slots;
  if (c.schedule) return c.schedule[dow]?.slots || [];
  return [];
}
function BookingForm({
  patient,
  bookForm,
  setBookForm,
  booking,
  onBook,
  slotsVersion
}) {
  const [step, setStep] = useState(patient.isGuest ? 1 : 2);
  const [selClinic, setSelClinic] = useState(null);
  const [availDates, setAvailDates] = useState([]);
  const [selDate, setSelDate] = useState(null);
  const [taken, setTaken] = useState({});
  const [slotsLoading, setSlotsLoading] = useState(false);
  useEffect(() => {
    if (!selClinic || !selDate) return;
    let alive = true;
    setSlotsLoading(true);
    (async () => {
      const code = CLINIC_CODE[selClinic.name] || selClinic.name;
      const m = {};
      try {
        const sb = getSB();
        if (sb) {
          const {
            data
          } = await sb.from(SLOTS_VIEW).select("time,taken").eq("clinic", code).eq("date", selDate.date);
          if (Array.isArray(data)) data.forEach(r => {
            m[r.time] = Number(r.taken) || 1;
          });
        }
      } catch (e) {}
      if (!alive) return;
      setTaken(m);
      setSlotsLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [selClinic, selDate, slotsVersion]);
  useEffect(() => {
    if (step >= 5 && !bookForm.time) setStep(4);
  }, [bookForm.time]);
  const s = k => e => setBookForm(v => ({
    ...v,
    [k]: e.target.value
  }));
  const selClinicFn = c => {
    setSelClinic(c);
    setBookForm(v => ({
      ...v,
      clinic: c.name,
      date: "",
      time: ""
    }));
    setAvailDates(getAvailableDates(c));
    setSelDate(null);
    setStep(3);
  };
  const selDateFn = d => {
    setSelDate(d);
    setBookForm(v => ({
      ...v,
      date: d.date,
      time: ""
    }));
    setStep(4);
  };
  const selTimeFn = t => {
    setBookForm(v => ({
      ...v,
      time: t
    }));
    setStep(5);
  };
  const steps = patient.isGuest ? ["بياناتك", "العيادة", "التاريخ", "الوقت", "تأكيد"] : ["العيادة", "التاريخ", "الوقت", "تأكيد"];
  const currentStep = patient.isGuest ? step - 1 : step - 2;
  return React.createElement("div", null, React.createElement("div", {
    style: {
      display: "flex",
      gap: 4,
      marginBottom: 18,
      alignItems: "center"
    }
  }, steps.map((l, i) => React.createElement(React.Fragment, {
    key: i
  }, React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 3
    }
  }, React.createElement("div", {
    style: {
      width: 24,
      height: 24,
      borderRadius: "50%",
      background: i < currentStep ? C.success : i === currentStep ? C.accent : C.border,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 10,
      fontWeight: 700,
      color: i <= currentStep ? C.bg : C.muted,
      transition: "all 0.3s"
    }
  }, i < currentStep ? "✓" : i + 1), React.createElement("div", {
    style: {
      color: i === currentStep ? C.accent : C.muted,
      fontSize: 8,
      whiteSpace: "nowrap"
    }
  }, l)), i < steps.length - 1 && React.createElement("div", {
    style: {
      flex: 1,
      height: 2,
      background: i < currentStep ? C.success : C.border,
      borderRadius: 1,
      marginBottom: 14,
      transition: "all 0.3s"
    }
  })))), patient.isGuest && step === 1 && React.createElement("div", {
    style: {
      background: C.surface,
      borderRadius: 16,
      padding: 16,
      border: "1px solid " + C.border,
      marginBottom: 14
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 14,
      marginBottom: 14
    }
  }, "👤 بياناتك أولاً"), React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, React.createElement("div", null, React.createElement("label", {
    style: {
      color: C.muted,
      fontSize: 11,
      display: "block",
      marginBottom: 5
    }
  }, "الاسم الكامل"), React.createElement("input", {
    style: inp(),
    value: bookForm.newName || "",
    onChange: e => setBookForm(v => ({
      ...v,
      newName: e.target.value
    })),
    placeholder: "اكتب اسمك كاملاً"
  })), React.createElement("div", null, React.createElement("label", {
    style: {
      color: C.muted,
      fontSize: 11,
      display: "block",
      marginBottom: 5
    }
  }, "رقم الهاتف"), React.createElement("input", {
    style: inp(),
    value: bookForm.newPhone || "",
    onChange: e => setBookForm(v => ({
      ...v,
      newPhone: e.target.value
    })),
    placeholder: "01xxxxxxxxx",
    type: "tel",
    inputMode: "tel"
  }))), React.createElement("button", {
    onClick: () => {
      if (!bookForm.newName?.trim()) {
        alert("اكتب اسمك الكامل");
        return;
      }
      if (!bookForm.newPhone?.trim() || bookForm.newPhone.length < 10) {
        alert("اكتب رقم هاتف صحيح (10 أرقام على الأقل)");
        return;
      }
      setStep(2);
    },
    style: {
      width: "100%",
      marginTop: 14,
      background: `linear-gradient(135deg,${C.accent},${C.teal})`,
      border: "none",
      borderRadius: 12,
      padding: 13,
      color: C.bg,
      fontWeight: 700,
      fontSize: 14,
      cursor: "pointer",
      fontFamily: "inherit",
      boxShadow: "0 4px 16px " + C.accent + "44"
    }
  }, "التالي ← اختيار العيادة")), patient.isGuest && step > 1 && React.createElement("div", {
    style: {
      background: C.card,
      border: "1px solid " + C.success + "44",
      borderRadius: 12,
      padding: "10px 14px",
      marginBottom: 12,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center"
    }
  }, React.createElement("div", null, React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 12,
      fontWeight: 600
    }
  }, "👤 ", bookForm.newName), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11
    }
  }, "📞 ", bookForm.newPhone)), React.createElement("span", {
    onClick: () => setStep(1),
    style: {
      color: C.accent,
      fontSize: 11,
      cursor: "pointer",
      background: C.accent + "22",
      padding: "3px 10px",
      borderRadius: 8
    }
  }, "تغيير")), step >= 2 && React.createElement("div", {
    style: {
      marginBottom: 14
    }
  }, React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 12,
      marginBottom: 10,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center"
    }
  }, React.createElement("span", {
    style: {
      color: step === 2 ? C.accent : C.muted,
      fontWeight: step === 2 ? 700 : 400
    }
  }, "🏥 اختر مكان الكشف"), step > 2 && React.createElement("span", {
    onClick: () => {
      setStep(2);
      setSelDate(null);
      setBookForm(v => ({
        ...v,
        date: "",
        time: ""
      }));
    },
    style: {
      color: C.accent,
      cursor: "pointer",
      fontSize: 11,
      background: C.accent + "22",
      padding: "3px 10px",
      borderRadius: 8
    }
  }, "تغيير")), step === 2 ? React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 10
    }
  }, PATIENT_CLINICS.map(c => React.createElement("div", {
    key: c.id,
    onClick: () => selClinicFn(c),
    style: {
      background: C.card,
      border: "1px solid " + C.border,
      borderRadius: 16,
      padding: 16,
      cursor: "pointer"
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12
    }
  }, React.createElement("div", {
    style: {
      width: 48,
      height: 48,
      borderRadius: 14,
      background: C.accent + "22",
      border: "1px solid " + C.accent + "33",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 24,
      flexShrink: 0
    }
  }, c.icon), React.createElement("div", {
    style: {
      flex: 1
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 14
    }
  }, c.name), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11,
      marginTop: 2
    }
  }, "📍 ", c.address), React.createElement("div", {
    style: {
      color: C.accent,
      fontSize: 11,
      marginTop: 2
    }
  }, "📅 ", c.dayNames?.join(" · ")), React.createElement("a", {
    href: "tel:" + c.phone,
    onClick: e => e.stopPropagation(),
    style: {
      color: C.teal,
      fontSize: 11,
      textDecoration: "none",
      display: "block",
      marginTop: 2
    }
  }, "📞 ", c.phone)), React.createElement("div", {
    style: {
      width: 32,
      height: 32,
      borderRadius: 10,
      background: C.accent + "22",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: C.accent,
      fontSize: 18,
      flexShrink: 0
    }
  }, "←"))))) : React.createElement("div", {
    style: {
      background: C.card,
      border: "1px solid " + C.success + "44",
      borderRadius: 14,
      padding: "12px 16px",
      display: "flex",
      alignItems: "center",
      gap: 12
    }
  }, React.createElement("span", {
    style: {
      fontSize: 22
    }
  }, selClinic?.icon), React.createElement("div", null, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 13
    }
  }, selClinic?.name), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11
    }
  }, "📍 ", selClinic?.address)), React.createElement("span", {
    style: {
      marginRight: "auto",
      color: C.success,
      fontSize: 16
    }
  }, "✓"))), step >= 3 && React.createElement("div", {
    style: {
      marginBottom: 14
    }
  }, React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 12,
      marginBottom: 10,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center"
    }
  }, React.createElement("span", {
    style: {
      color: step === 3 ? C.accent : C.muted,
      fontWeight: step === 3 ? 700 : 400
    }
  }, "📅 اختر التاريخ"), step > 3 && React.createElement("span", {
    onClick: () => {
      setStep(3);
      setBookForm(v => ({
        ...v,
        time: ""
      }));
    },
    style: {
      color: C.accent,
      cursor: "pointer",
      fontSize: 11,
      background: C.accent + "22",
      padding: "3px 10px",
      borderRadius: 8
    }
  }, "تغيير")), step === 3 ? React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      overflowX: "auto",
      paddingBottom: 8
    }
  }, availDates.slice(0, 14).map(d => React.createElement("div", {
    key: d.date,
    onClick: () => selDateFn(d),
    style: {
      flexShrink: 0,
      background: C.card,
      border: "1px solid " + C.border,
      borderRadius: 14,
      padding: "12px 14px",
      cursor: "pointer",
      textAlign: "center",
      minWidth: 76
    }
  }, React.createElement("div", {
    style: {
      color: C.accent,
      fontSize: 10,
      marginBottom: 4
    }
  }, d.dayName), React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 13
    }
  }, d.date.slice(5))))) : React.createElement("div", {
    style: {
      background: C.card,
      border: "1px solid " + C.success + "44",
      borderRadius: 14,
      padding: "12px 16px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between"
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 13
    }
  }, "📅 ", selDate?.dayName, " · ", bookForm.date), React.createElement("span", {
    style: {
      color: C.success,
      fontSize: 16
    }
  }, "✓"))), step >= 4 && React.createElement("div", {
    style: {
      marginBottom: 14
    }
  }, React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 12,
      marginBottom: 10,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center"
    }
  }, React.createElement("span", {
    style: {
      color: step === 4 ? C.accent : C.muted,
      fontWeight: step === 4 ? 700 : 400
    }
  }, "⏰ اختر الوقت"), step > 4 && React.createElement("span", {
    onClick: () => setStep(4),
    style: {
      color: C.accent,
      cursor: "pointer",
      fontSize: 11,
      background: C.accent + "22",
      padding: "3px 10px",
      borderRadius: 8
    }
  }, "تغيير")), step === 4 ? React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr",
      gap: 8
    }
  }, slotsLoading && React.createElement("div", {
    style: {
      gridColumn: "1 / -1",
      color: C.muted,
      fontSize: 11,
      textAlign: "center"
    }
  }, "⏳ جاري تحميل المواعيد المتاحة..."), getSlots(selClinic, selDate?.dayOfWeek).map(t => {
    const full = (taken[t] || 0) >= SLOT_CAPACITY;
    return React.createElement("div", {
      key: t,
      onClick: () => !full && !slotsLoading && selTimeFn(t),
      style: {
        background: full ? C.bg : C.card,
        border: "1px solid " + C.border,
        borderRadius: 12,
        padding: "12px 8px",
        textAlign: "center",
        cursor: full ? "not-allowed" : "pointer",
        color: full ? C.muted : C.text,
        fontWeight: 700,
        fontSize: 14,
        opacity: full ? 0.45 : 1
      }
    }, t, full && React.createElement("div", {
      style: {
        fontSize: 9,
        fontWeight: 600,
        marginTop: 2
      }
    }, "محجوز"));
  })) : React.createElement("div", {
    style: {
      background: C.card,
      border: "1px solid " + C.success + "44",
      borderRadius: 14,
      padding: "12px 16px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between"
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 13
    }
  }, "⏰ ", bookForm.time), React.createElement("span", {
    style: {
      color: C.success,
      fontSize: 16
    }
  }, "✓"))), step >= 5 && React.createElement("div", {
    style: {
      background: C.surface,
      borderRadius: 16,
      padding: 16,
      border: "1px solid " + C.border,
      marginBottom: 14
    }
  }, React.createElement("div", {
    style: {
      marginBottom: 12
    }
  }, React.createElement("label", {
    style: {
      color: C.muted,
      fontSize: 11,
      display: "block",
      marginBottom: 6
    }
  }, "🔬 نوع الكشف"), React.createElement("select", {
    style: inp(),
    value: bookForm.type,
    onChange: s("type")
  }, ["فحص روتيني", "متابعة", "استشارة", "قياس نظر", "فحص شبكية"].map(t => React.createElement("option", {
    key: t
  }, t)))), React.createElement("div", {
    style: {
      marginBottom: 14
    }
  }, React.createElement("label", {
    style: {
      color: C.muted,
      fontSize: 11,
      display: "block",
      marginBottom: 6
    }
  }, "📝 ملاحظات (اختياري)"), React.createElement("textarea", {
    style: {
      ...inp(),
      minHeight: 55,
      resize: "none"
    },
    value: bookForm.notes || "",
    onChange: s("notes"),
    placeholder: "أي أعراض أو ملاحظات للطبيب..."
  })), React.createElement("div", {
    style: {
      background: C.bg,
      borderRadius: 12,
      padding: 12,
      marginBottom: 14,
      border: "1px solid " + C.border
    }
  }, React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11,
      fontWeight: 700,
      marginBottom: 8
    }
  }, "📋 ملخص الحجز"), [["🏥", bookForm.clinic], ["📅", bookForm.date], ["⏰", bookForm.time], ["🔬", bookForm.type], ...(patient.isGuest ? [["👤", bookForm.newName], ["📞", bookForm.newPhone]] : [])].filter(([, v]) => v).map(([icon, val]) => React.createElement("div", {
    key: icon,
    style: {
      display: "flex",
      gap: 10,
      marginBottom: 5,
      alignItems: "center"
    }
  }, React.createElement("span", {
    style: {
      fontSize: 14
    }
  }, icon), React.createElement("span", {
    style: {
      color: C.text,
      fontSize: 12
    }
  }, val)))), React.createElement("button", {
    onClick: onBook,
    disabled: booking,
    style: {
      width: "100%",
      background: booking ? "#1a2840" : `linear-gradient(135deg,${C.accent},${C.teal})`,
      border: "none",
      borderRadius: 14,
      padding: 14,
      color: C.bg,
      fontWeight: 800,
      fontSize: 15,
      cursor: "pointer",
      fontFamily: "inherit",
      opacity: booking ? 0.7 : 1,
      boxShadow: booking ? "none" : "0 4px 20px " + C.accent + "44"
    }
  }, booking ? "⏳ جاري الإرسال..." : "📅 تأكيد الحجز")));
}
function RatingPrompt({
  visit,
  patient,
  onDone
}) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState(false);
  const submit = async () => {
    const ratings = (await sbGet("iapp_ratings")) || [];
    ratings.push({
      id: Date.now(),
      patientId: patient.id,
      patient: patient.name,
      visitId: visit.id,
      rating,
      comment,
      date: localISO()
    });
    await sbSet("iapp_ratings", ratings);
    setSent(true);
    setTimeout(onDone, 1800);
  };
  if (sent) return React.createElement("div", {
    style: {
      textAlign: "center",
      padding: "30px 20px"
    }
  }, React.createElement("div", {
    style: {
      fontSize: 48,
      marginBottom: 12
    }
  }, "🌟"), React.createElement("div", {
    style: {
      color: C.success,
      fontWeight: 800,
      fontSize: 18
    }
  }, "شكراً على تقييمك!"));
  return React.createElement("div", null, React.createElement("div", {
    style: {
      textAlign: "center",
      marginBottom: 20
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 15,
      marginBottom: 6
    }
  }, "كيف كانت تجربتك؟"), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 12
    }
  }, "زيارة ", visit.date)), React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "center",
      gap: 12,
      marginBottom: 20
    }
  }, [1, 2, 3, 4, 5].map(n => React.createElement("div", {
    key: n,
    onClick: () => setRating(n),
    style: {
      fontSize: 36,
      cursor: "pointer",
      opacity: n <= rating ? 1 : 0.3,
      transition: "all 0.15s",
      transform: n <= rating ? "scale(1.1)" : "scale(1)"
    }
  }, "⭐"))), React.createElement("textarea", {
    style: {
      ...inp(),
      minHeight: 70,
      resize: "none",
      marginBottom: 14
    },
    value: comment,
    onChange: e => setComment(e.target.value),
    placeholder: "أي ملاحظات أو اقتراحات؟ (اختياري)"
  }), React.createElement("div", {
    style: {
      display: "flex",
      gap: 10
    }
  }, React.createElement("button", {
    onClick: onDone,
    style: {
      flex: 1,
      background: "transparent",
      border: "1px solid " + C.border,
      borderRadius: 10,
      padding: 10,
      color: C.muted,
      fontWeight: 700,
      fontSize: 13,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, "لاحقاً"), React.createElement("button", {
    onClick: submit,
    disabled: !rating,
    style: {
      flex: 2,
      background: rating ? `linear-gradient(135deg,${C.gold},${C.accent})` : "transparent",
      border: "1px solid " + (rating ? C.gold : C.border),
      borderRadius: 10,
      padding: 10,
      color: rating ? C.bg : C.muted,
      fontWeight: 700,
      fontSize: 13,
      cursor: rating ? "pointer" : "default",
      fontFamily: "inherit"
    }
  }, "إرسال التقييم ✓")));
}
function PatientApp({
  patient,
  onLogout
}) {
  const [tab, setTab] = useState(patient.isGuest ? "book" : "home");
  const [appointments, setAppointments] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [exams, setExams] = useState([]);
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [bookForm, setBookForm] = useState({
    clinic: "",
    date: "",
    time: "",
    type: "فحص روتيني",
    notes: "",
    isNew: patient.isGuest,
    newName: "",
    newPhone: ""
  });
  const [booking, setBooking] = useState(false);
  const [bookDone, setBookDone] = useState(false);
  const [ratingTarget, setRatingTarget] = useState(null);
  const [slotsVersion, setSlotsVersion] = useState(0);
  const bookingLock = useRef(false);
  const today = localISO();
  const isMyApt = x => {
    if (patient.isGuest || patient.id == null) return false;
    if (x.patientId != null) return x.patientId === patient.id;
    return normArabic(x.patient) === normArabic(patient.name) && !!patient.phone && normPhone(x.phone) === normPhone(patient.phone);
  };
  useEffect(() => {
    (async () => {
      const [a, rx, ex, v] = await Promise.all([sbGet("iapp_appointments"), sbGet("iapp_prescriptions"), sbGet("iapp_exams"), sbGet("iapp_visits")]);
      if (a) setAppointments(a.filter(isMyApt));
      if (rx) setPrescriptions(rx.filter(x => x.patientId === patient.id));
      if (ex) setExams(ex.filter(x => x.patientId === patient.id));
      if (v) {
        const pv = v.filter(x => x.patientId === patient.id);
        setVisits(pv);
        const unrated = pv.find(x => {
          const d = new Date(x.date);
          const diff = (Date.now() - d.getTime()) / (1000 * 3600 * 24);
          return diff <= 3 && !x.rated;
        });
        if (unrated && !patient.isGuest) setTimeout(() => setRatingTarget(unrated), 1500);
      }
      setLoading(false);
    })();
    const iv = setInterval(async () => {
      const a = await sbGet("iapp_appointments");
      if (a) setAppointments(a.filter(isMyApt));
    }, 20000);
    return () => clearInterval(iv);
  }, []);
  const upcomingApts = appointments.filter(a => a.date >= today && isActiveApt(a)).sort((a, b) => a.date.localeCompare(b.date));
  const pastApts = appointments.filter(a => a.date < today).sort((a, b) => b.date.localeCompare(a.date));
  const doBook = async () => {
    if (!bookForm.clinic) {
      alert("اختر المكان");
      return;
    }
    if (!bookForm.date) {
      alert("اختر التاريخ");
      return;
    }
    if (!bookForm.time) {
      alert("اختر الوقت");
      return;
    }
    if (!bookForm.newName?.trim()) {
      alert("اكتب اسمك");
      return;
    }
    if (!bookForm.newPhone?.trim()) {
      alert("اكتب رقم هاتفك");
      return;
    }
    if (bookingLock.current) return;
    bookingLock.current = true;
    setBooking(true);
    try {
      const sb = getSB();
      if (!sb) throw new Error("offline");
      const row = {
        patient_name: bookForm.newName.trim(),
        phone: normPhone(bookForm.newPhone),
        clinic: CLINIC_CODE[bookForm.clinic] || bookForm.clinic,
        date: bookForm.date,
        time: bookForm.time,
        visit_type: bookForm.type || "فحص روتيني",
        note: (bookForm.notes || "").slice(0, 300)
      };
      const {
        error
      } = await sb.from(BOOKING_TABLE).insert(row);
      if (error) {
        if (/duplicate|unique/i.test(error.message || "")) {
          alert("⚠ هذا الموعد تم حجزه للتو — اختر وقتاً آخر من فضلك");
          setBookForm(v => ({
            ...v,
            time: ""
          }));
          setSlotsVersion(x => x + 1);
        } else {
          alert("❌ تعذر إرسال الطلب — تأكد من الاتصال بالإنترنت ثم حاول مرة أخرى");
        }
      } else {
        setBookDone(true);
      }
    } catch (e) {
      alert("❌ تعذر إرسال الطلب — تأكد من الاتصال بالإنترنت ثم حاول مرة أخرى");
    } finally {
      bookingLock.current = false;
      setBooking(false);
    }
  };
  const markVisitRated = async visitId => {
    await sbMutate("iapp_visits", v => v.map(x => x.id === visitId ? {
      ...x,
      rated: true
    } : x));
    setRatingTarget(null);
  };
  const TABS = patient.isGuest ? [{
    id: "book",
    label: "احجز",
    icon: "➕"
  }] : [{
    id: "home",
    label: "الرئيسية",
    icon: "🏠"
  }, {
    id: "book",
    label: "احجز",
    icon: "➕"
  }, {
    id: "apts",
    label: "مواعيدي",
    icon: "📅"
  }, {
    id: "rx",
    label: "روشتاتي",
    icon: "💊"
  }, {
    id: "exams",
    label: "My Investigations",
    icon: "🔬"
  }];
  const nextApt = upcomingApts[0];
  const isAptSoon = nextApt && (() => {
    const h = (new Date(nextApt.date + "T" + (nextApt.time || "00:00")) - new Date()) / (1000 * 3600);
    return h >= 0 && h < 24;
  })();
  return React.createElement("div", {
    style: {
      height: "100%",
      background: C.bg,
      direction: "rtl",
      display: "flex",
      flexDirection: "column"
    }
  }, React.createElement("div", {
    style: {
      background: `linear-gradient(135deg,${C.surface},${C.surface2})`,
      borderBottom: "1px solid " + C.border,
      padding: "0 16px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      height: 60,
      flexShrink: 0
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10
    }
  }, React.createElement("div", {
    style: {
      width: 38,
      height: 38,
      borderRadius: "50%",
      background: `linear-gradient(135deg,${C.accent},${C.teal})`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontWeight: 800,
      color: C.bg,
      fontSize: 15
    }
  }, patient.isGuest ? "🆕" : patient.name?.charAt(0)), React.createElement("div", null, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 13
    }
  }, patient.isGuest ? "مريض جديد" : patient.name), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10
    }
  }, patient.isGuest ? "احجز موعدك الأول" : patient.patientCode))), React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      alignItems: "center"
    }
  }, isAptSoon && React.createElement("span", {
    style: {
      background: C.gold + "22",
      color: C.gold,
      borderRadius: 8,
      padding: "3px 8px",
      fontSize: 10,
      fontWeight: 700,
      animation: "pulse 2s infinite"
    }
  }, "⏰ موعد قريب"), React.createElement("button", {
    onClick: onLogout,
    style: {
      background: "transparent",
      border: "1px solid " + C.border,
      borderRadius: 8,
      padding: "6px 12px",
      color: C.muted,
      fontSize: 11,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, "خروج"))), React.createElement("div", {
    style: {
      flex: 1,
      overflowY: "auto",
      padding: "16px 16px 0"
    }
  }, loading && React.createElement("div", {
    style: {
      color: C.muted,
      textAlign: "center",
      padding: 40,
      fontSize: 13
    }
  }, "⏳ جاري التحميل..."), !loading && tab === "home" && React.createElement("div", {
    style: {
      animation: "slideUp 0.25s ease"
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 800,
      fontSize: 18,
      marginBottom: 2
    }
  }, "أهلاً ", patient.name?.split(" ")[0], " 👋"), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 12,
      marginBottom: 20
    }
  }, "عيادة د. عبدالستار صقر"), nextApt && React.createElement("div", {
    style: {
      background: isAptSoon ? `linear-gradient(135deg,${C.gold}22,${C.accent}11)` : `linear-gradient(135deg,${C.accent}22,${C.teal}11)`,
      border: "1px solid " + (isAptSoon ? C.gold : C.accent) + "44",
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
      animation: isAptSoon ? "pulse 2.5s infinite" : "none"
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start"
    }
  }, React.createElement("div", null, React.createElement("div", {
    style: {
      color: isAptSoon ? C.gold : C.accent,
      fontWeight: 700,
      fontSize: 12,
      marginBottom: 6
    }
  }, isAptSoon ? "⏰ موعدك قريب جداً!" : "📅 موعدك القادم"), React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 800,
      fontSize: 16
    }
  }, nextApt.date), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 13,
      marginTop: 4
    }
  }, nextApt.time, " · ", nextApt.type), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 12,
      marginTop: 2
    }
  }, "🏥 ", clinicDisplay(nextApt.clinic) || nextApt.doctor)), React.createElement("div", {
    style: {
      textAlign: "center"
    }
  }, nextApt.confirmed ? React.createElement("div", {
    style: {
      background: C.success + "22",
      border: "1px solid " + C.success + "44",
      borderRadius: 10,
      padding: "6px 12px",
      color: C.success,
      fontSize: 12,
      fontWeight: 700
    }
  }, "✓ مؤكد") : React.createElement("div", {
    style: {
      background: C.gold + "22",
      border: "1px solid " + C.gold + "44",
      borderRadius: 10,
      padding: "6px 12px",
      color: C.gold,
      fontSize: 11,
      fontWeight: 700
    }
  }, "⏳ بانتظار التأكيد")))), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10,
      marginBottom: 16
    }
  }, [{
    icon: "📅",
    label: "مواعيد قادمة",
    val: upcomingApts.length,
    color: C.accent,
    action: () => setTab("apts")
  }, {
    icon: "💊",
    label: "روشتات",
    val: prescriptions.length,
    color: C.teal,
    action: () => setTab("rx")
  }, {
    icon: "🔬",
    label: "فحوصات",
    val: exams.length,
    color: C.gold,
    action: () => setTab("exams")
  }, {
    icon: "🗓",
    label: "زيارات سابقة",
    val: pastApts.length,
    color: C.muted,
    action: () => setTab("apts")
  }].map((s, i) => React.createElement("div", {
    key: i,
    onClick: s.action,
    style: {
      background: C.card,
      borderRadius: 14,
      padding: "14px",
      border: "1px solid " + C.border,
      cursor: "pointer"
    }
  }, React.createElement("div", {
    style: {
      fontSize: 22,
      marginBottom: 6
    }
  }, s.icon), React.createElement("div", {
    style: {
      color: s.color,
      fontSize: 22,
      fontWeight: 800
    }
  }, s.val), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11
    }
  }, s.label)))), React.createElement("div", {
    onClick: () => setTab("book"),
    style: {
      background: `linear-gradient(135deg,${C.accent}22,${C.teal}11)`,
      border: "1px solid " + C.accent + "44",
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      gap: 14
    }
  }, React.createElement("div", {
    style: {
      width: 46,
      height: 46,
      borderRadius: 14,
      background: `linear-gradient(135deg,${C.accent},${C.teal})`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 22
    }
  }, "➕"), React.createElement("div", null, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 14
    }
  }, "احجز موعد جديد"), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 12,
      marginTop: 2
    }
  }, "اختر المكان والوقت المناسب لك")), React.createElement("div", {
    style: {
      color: C.accent,
      fontSize: 18,
      marginRight: "auto"
    }
  }, "←")), React.createElement("div", {
    style: {
      background: C.card,
      borderRadius: 14,
      padding: 14,
      border: "1px solid " + C.border,
      marginBottom: 16
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 13,
      marginBottom: 12
    }
  }, "📞 تواصل معنا"), PATIENT_CLINICS.map(c => React.createElement("div", {
    key: c.id,
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10,
      paddingBottom: 10,
      borderBottom: "1px solid " + C.border + "66"
    }
  }, React.createElement("div", null, React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 12,
      fontWeight: 600
    }
  }, c.icon, " ", c.name), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11
    }
  }, "📍 ", c.address)), React.createElement("div", {
    style: {
      display: "flex",
      gap: 6
    }
  }, React.createElement("a", {
    href: "tel:" + c.phone,
    style: {
      background: C.teal + "22",
      border: "1px solid " + C.teal + "33",
      borderRadius: 8,
      padding: "5px 10px",
      color: C.teal,
      fontSize: 12,
      textDecoration: "none"
    }
  }, "📞"), React.createElement("a", {
    href: "https://wa.me/2" + c.phone.replace(/^0/, ""),
    target: "_blank",
    style: {
      background: "#25D36622",
      border: "1px solid #25D36633",
      borderRadius: 8,
      padding: "5px 10px",
      color: "#25D366",
      fontSize: 12,
      textDecoration: "none"
    }
  }, "💬")))))), !loading && tab === "book" && React.createElement("div", {
    style: {
      animation: "slideUp 0.25s ease"
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 16,
      marginBottom: 4
    }
  }, "➕ احجز موعد"), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 12,
      marginBottom: 16
    }
  }, "اختر المكان والوقت المناسب"), bookDone ? React.createElement("div", {
    style: {
      background: C.success + "22",
      border: "1px solid " + C.success,
      borderRadius: 16,
      padding: "30px 20px",
      textAlign: "center",
      animation: "slideUp 0.3s ease"
    }
  }, React.createElement("div", {
    style: {
      fontSize: 52,
      marginBottom: 12
    }
  }, "✅"), React.createElement("div", {
    style: {
      color: C.success,
      fontWeight: 800,
      fontSize: 18,
      marginBottom: 8
    }
  }, "تم إرسال طلب الحجز!"), React.createElement("div", {
    style: {
      background: C.bg,
      borderRadius: 12,
      padding: 14,
      marginBottom: 16,
      textAlign: "right"
    }
  }, [["📍", bookForm.clinic], ["📅", bookForm.date], ["⏰", bookForm.time], ["🔬", bookForm.type]].map(([icon, val]) => React.createElement("div", {
    key: icon,
    style: {
      display: "flex",
      gap: 8,
      marginBottom: 6
    }
  }, React.createElement("span", null, icon), React.createElement("span", {
    style: {
      color: C.text,
      fontSize: 13
    }
  }, val)))), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 12,
      marginBottom: 20
    }
  }, "سيتم التواصل معك لتأكيد الموعد"), React.createElement("button", {
    onClick: () => {
      setBookDone(false);
      setBookForm({
        clinic: "",
        date: "",
        time: "",
        type: "فحص روتيني",
        notes: "",
        isNew: patient.isGuest,
        newName: "",
        newPhone: ""
      });
    },
    style: {
      background: `linear-gradient(135deg,${C.accent},${C.teal})`,
      border: "none",
      borderRadius: 10,
      padding: "10px 24px",
      color: C.bg,
      fontWeight: 700,
      fontSize: 13,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, "حجز موعد آخر")) : React.createElement(BookingForm, {
    patient: patient,
    bookForm: bookForm,
    setBookForm: setBookForm,
    booking: booking,
    onBook: doBook,
    slotsVersion: slotsVersion
  })), !loading && tab === "apts" && React.createElement("div", {
    style: {
      animation: "slideUp 0.25s ease"
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 16,
      marginBottom: 16
    }
  }, "📅 مواعيدي"), upcomingApts.length > 0 && React.createElement(React.Fragment, null, React.createElement("div", {
    style: {
      color: C.accent,
      fontSize: 12,
      fontWeight: 700,
      marginBottom: 10
    }
  }, "القادمة"), upcomingApts.map(a => React.createElement("div", {
    key: a.id,
    style: {
      background: C.card,
      border: "1px solid " + (a.confirmed ? C.success : C.accent) + "44",
      borderRadius: 16,
      padding: "14px",
      marginBottom: 10,
      borderRight: "3px solid " + (a.confirmed ? C.success : C.accent)
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 8
    }
  }, React.createElement("div", null, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 14
    }
  }, a.date), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 12,
      marginTop: 2
    }
  }, a.type), a.clinic && React.createElement("div", {
    style: {
      color: C.teal,
      fontSize: 11,
      marginTop: 2
    }
  }, "🏥 ", clinicDisplay(a.clinic))), React.createElement("div", {
    style: {
      textAlign: "center"
    }
  }, React.createElement("div", {
    style: {
      color: C.accent,
      fontSize: 18,
      fontWeight: 800
    }
  }, a.time), a.confirmed ? React.createElement("div", {
    style: {
      color: C.success,
      fontSize: 10,
      fontWeight: 700
    }
  }, "✓ مؤكد") : React.createElement("div", {
    style: {
      color: C.gold,
      fontSize: 10
    }
  }, "⏳ بانتظار التأكيد"))), a.notes && React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11
    }
  }, "📝 ", a.notes)))), pastApts.length > 0 && React.createElement(React.Fragment, null, React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 12,
      fontWeight: 700,
      marginTop: 16,
      marginBottom: 10
    }
  }, "السابقة"), pastApts.map(a => React.createElement("div", {
    key: a.id,
    style: {
      background: C.card,
      border: "1px solid " + C.border,
      borderRadius: 14,
      padding: "12px 14px",
      marginBottom: 8,
      opacity: 0.75
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between"
    }
  }, React.createElement("div", null, React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 13
    }
  }, a.date), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11
    }
  }, a.type)), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 14,
      fontWeight: 700
    }
  }, a.time))))), appointments.length === 0 && React.createElement("div", {
    style: {
      color: C.muted,
      textAlign: "center",
      padding: 40
    }
  }, "لا توجد مواعيد")), !loading && tab === "rx" && React.createElement("div", {
    style: {
      animation: "slideUp 0.25s ease"
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 16,
      marginBottom: 16
    }
  }, "💊 روشتاتي (", prescriptions.length, ")"), prescriptions.length === 0 && React.createElement("div", {
    style: {
      color: C.muted,
      textAlign: "center",
      padding: 40
    }
  }, "لا توجد روشتات بعد"), prescriptions.map(rx => React.createElement("div", {
    key: rx.id,
    style: {
      background: C.card,
      border: "1px solid " + C.border,
      borderRadius: 16,
      padding: 16,
      marginBottom: 14
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12
    }
  }, React.createElement("div", {
    style: {
      color: C.accent,
      fontWeight: 700,
      fontSize: 14
    }
  }, rx.date), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11,
      background: C.bg,
      padding: "4px 10px",
      borderRadius: 8
    }
  }, rx.eye)), React.createElement("div", {
    style: {
      background: C.bg,
      borderRadius: 10,
      padding: 10,
      marginBottom: 12,
      border: "1px solid " + C.border
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 11,
      fontWeight: 700,
      marginBottom: 8
    }
  }, "👓 كشف النظارة"), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr 1fr",
      gap: 6,
      fontSize: 10,
      textAlign: "center"
    }
  }, React.createElement("div", {
    style: {
      color: C.muted
    }
  }, "العين"), React.createElement("div", {
    style: {
      color: C.muted
    }
  }, "SPH"), React.createElement("div", {
    style: {
      color: C.muted
    }
  }, "CYL"), React.createElement("div", {
    style: {
      color: C.muted
    }
  }, "AX"), React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700
    }
  }, "يمنى"), React.createElement("div", {
    style: {
      color: C.text
    }
  }, rx.sphR || "-"), React.createElement("div", {
    style: {
      color: C.text
    }
  }, rx.cylR || "-"), React.createElement("div", {
    style: {
      color: C.text
    }
  }, rx.axisR || "-"), React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700
    }
  }, "يسرى"), React.createElement("div", {
    style: {
      color: C.text
    }
  }, rx.sphL || "-"), React.createElement("div", {
    style: {
      color: C.text
    }
  }, rx.cylL || "-"), React.createElement("div", {
    style: {
      color: C.text
    }
  }, rx.axisL || "-")), rx.add && React.createElement("div", {
    style: {
      color: C.gold,
      fontSize: 11,
      marginTop: 8
    }
  }, "ADD: ", rx.add)), rx.medicines && React.createElement("div", {
    style: {
      background: C.teal + "11",
      borderRadius: 10,
      padding: 10,
      border: "1px solid " + C.teal + "33"
    }
  }, React.createElement("div", {
    style: {
      color: C.teal,
      fontSize: 11,
      fontWeight: 700,
      marginBottom: 6
    }
  }, "💊 الأدوية"), rx.medicines.split("\n").filter(Boolean).map((m, i) => React.createElement("div", {
    key: i,
    style: {
      color: C.text,
      fontSize: 12,
      marginBottom: 4
    }
  }, "• ", m))), rx.notes && React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11,
      marginTop: 10
    }
  }, "📝 ", rx.notes)))), !loading && tab === "exams" && React.createElement("div", {
    style: {
      animation: "slideUp 0.25s ease"
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 16,
      marginBottom: 16
    }
  }, "🔬 نتائج My Investigations (", exams.length, ")"), exams.length === 0 && React.createElement("div", {
    style: {
      color: C.muted,
      textAlign: "center",
      padding: 40
    }
  }, "No investigations yet"), exams.map(ex => React.createElement("div", {
    key: ex.id,
    style: {
      background: C.card,
      border: "1px solid " + C.border,
      borderRadius: 16,
      padding: 16,
      marginBottom: 14
    }
  }, React.createElement("div", {
    style: {
      color: C.accent,
      fontWeight: 700,
      fontSize: 14,
      marginBottom: 12
    }
  }, ex.date, " · ", ex.doctor), ex.chiefComplaint && React.createElement("div", {
    style: {
      marginBottom: 10
    }
  }, React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11,
      marginBottom: 4
    }
  }, "الشكوى"), React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 13
    }
  }, ex.chiefComplaint)), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 8,
      marginBottom: 10
    }
  }, [["حدة الإبصار يمنى", ex.visualAcuityR], ["حدة الإبصار يسرى", ex.visualAcuityL], ["ضغط العين يمنى", ex.iopR], ["ضغط العين يسرى", ex.iopL]].filter(([, v]) => v).map(([l, v]) => React.createElement("div", {
    key: l,
    style: {
      background: C.bg,
      borderRadius: 8,
      padding: "8px"
    }
  }, React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10
    }
  }, l), React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 13
    }
  }, v)))), ex.diagnosis && React.createElement("div", {
    style: {
      background: C.accent + "11",
      borderRadius: 10,
      padding: 10,
      border: "1px solid " + C.accent + "33",
      marginBottom: 8
    }
  }, React.createElement("div", {
    style: {
      color: C.accent,
      fontSize: 11,
      fontWeight: 700,
      marginBottom: 4
    }
  }, "التشخيص"), React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 13
    }
  }, ex.diagnosis)), ex.treatmentPlan && React.createElement("div", {
    style: {
      marginTop: 8
    }
  }, React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11,
      marginBottom: 4
    }
  }, "خطة العلاج"), React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 12
    }
  }, ex.treatmentPlan)), ex.followUp && React.createElement("div", {
    style: {
      color: C.gold,
      fontSize: 11,
      marginTop: 8
    }
  }, "📅 موعد المتابعة: ", ex.followUp)))), React.createElement("div", {
    style: {
      height: 80
    }
  })), React.createElement("div", {
    style: {
      background: C.surface,
      borderTop: "1px solid " + C.border,
      display: "flex",
      justifyContent: "space-around",
      padding: "8px 0 20px",
      flexShrink: 0
    }
  }, TABS.map(t => React.createElement("div", {
    key: t.id,
    onClick: () => setTab(t.id),
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 3,
      cursor: "pointer",
      padding: "4px 12px",
      borderRadius: 10,
      background: tab === t.id ? C.accent + "22" : "transparent"
    }
  }, React.createElement("div", {
    style: {
      fontSize: 20,
      filter: tab === t.id ? "drop-shadow(0 0 6px " + C.accent + ")" : "none",
      transform: tab === t.id ? "scale(1.15)" : "scale(1)",
      transition: "all 0.2s"
    }
  }, t.icon), React.createElement("div", {
    style: {
      color: tab === t.id ? C.accent : C.muted,
      fontSize: 9,
      fontWeight: tab === t.id ? 700 : 400
    }
  }, t.label)))), ratingTarget && React.createElement(Modal, {
    title: "⭐ قيّم زيارتك",
    onClose: () => setRatingTarget(null)
  }, React.createElement(RatingPrompt, {
    visit: ratingTarget,
    patient: patient,
    onDone: () => markVisitRated(ratingTarget.id)
  })), toast && React.createElement(Toast, {
    msg: toast.msg,
    color: toast.color,
    onDone: () => setToast(null)
  }));
}
const CLINICS_LIST = ["دمنهور", "الرحمانية", "مركز دمنهور للعيون"];
const CLINIC_LABELS = {
  "دمنهور": "عيادة دمنهور",
  "الرحمانية": "عيادة الرحمانية",
  "مركز دمنهور للعيون": "مركز دمنهور للعيون"
};
function SecretaryAptForm({
  initial,
  patients,
  appointments = [],
  prices = [],
  onSave,
  onClose
}) {
  const blank = {
    patient: "",
    patientId: null,
    phone: "",
    time: "09:00",
    date: localISO(),
    type: "فحص روتيني",
    doctor: "د. عبدالستار",
    clinic: "دمنهور",
    cost: "",
    paid: false,
    notes: ""
  };
  const [mode, setMode] = useState(initial?.patientId ? "existing" : "new");
  const [f, setF] = useState(initial ? {
    ...blank,
    ...initial
  } : blank);
  const [costTouched, setCostTouched] = useState(!!(initial && initial.cost));
  const [err, setErr] = useState("");
  const s = k => e => setF(v => ({
    ...v,
    [k]: e.target.value
  }));
  const matchPrice = t => prices.find(p => p.name === t || p.name.includes(t) || t.includes(p.name));
  const setType = e => {
    const t = e.target.value;
    const m = matchPrice(t);
    setF(v => ({
      ...v,
      type: t,
      cost: !costTouched && m ? m.price : v.cost
    }));
  };
  return React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 8
    }
  }, React.createElement("div", {
    onClick: () => {
      setMode("new");
      setF(v => ({
        ...v,
        patient: "",
        patientId: null,
        phone: ""
      }));
    },
    style: {
      padding: "10px",
      borderRadius: 10,
      border: "2px solid " + (mode === "new" ? C.accent : C.border),
      background: mode === "new" ? C.accent + "22" : C.card,
      textAlign: "center",
      cursor: "pointer",
      color: mode === "new" ? C.accent : C.muted,
      fontSize: 12,
      fontWeight: 700
    }
  }, "👤 مريض جديد"), React.createElement("div", {
    onClick: () => {
      setMode("existing");
      setF(v => ({
        ...v,
        patient: "",
        patientId: null
      }));
    },
    style: {
      padding: "10px",
      borderRadius: 10,
      border: "2px solid " + (mode === "existing" ? C.teal : C.border),
      background: mode === "existing" ? C.teal + "22" : C.card,
      textAlign: "center",
      cursor: "pointer",
      color: mode === "existing" ? C.teal : C.muted,
      fontSize: 12,
      fontWeight: 700
    }
  }, "📋 مريض مسجل")), mode === "new" ? React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 10
    }
  }, React.createElement("div", null, React.createElement("label", {
    style: {
      color: C.muted,
      fontSize: 11,
      display: "block",
      marginBottom: 4
    }
  }, "اسم المريض"), React.createElement("input", {
    style: inp(),
    value: f.patient,
    onChange: s("patient"),
    placeholder: "اسم المريض الجديد"
  })), React.createElement("div", null, React.createElement("label", {
    style: {
      color: C.muted,
      fontSize: 11,
      display: "block",
      marginBottom: 4
    }
  }, "الهاتف"), React.createElement("input", {
    style: inp(),
    value: f.phone || "",
    onChange: s("phone"),
    placeholder: "01xxxxxxxxx",
    type: "tel"
  }))) : React.createElement("div", null, React.createElement("label", {
    style: {
      color: C.muted,
      fontSize: 11,
      display: "block",
      marginBottom: 4
    }
  }, "اختر مريض مسجل"), React.createElement("select", {
    style: inp(),
    value: f.patientId || "",
    onChange: e => {
      const p = patients.find(p => p.id === Number(e.target.value));
      if (p) setF(v => ({
        ...v,
        patientId: p.id,
        patient: p.name,
        phone: p.phone || ""
      }));
    }
  }, React.createElement("option", {
    value: ""
  }, "— اختر مريض —"), patients.map(p => React.createElement("option", {
    key: p.id,
    value: p.id
  }, p.name, " - ", p.patientCode)))), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10
    }
  }, React.createElement("div", null, React.createElement("label", {
    style: {
      color: C.muted,
      fontSize: 11,
      display: "block",
      marginBottom: 4
    }
  }, "التاريخ"), React.createElement("input", {
    style: inp(),
    type: "date",
    value: f.date,
    onChange: s("date")
  })), React.createElement("div", null, React.createElement("label", {
    style: {
      color: C.muted,
      fontSize: 11,
      display: "block",
      marginBottom: 4
    }
  }, "الوقت"), React.createElement("input", {
    style: inp(),
    type: "time",
    value: f.time,
    onChange: s("time")
  }))), React.createElement("div", null, React.createElement("label", {
    style: {
      color: C.muted,
      fontSize: 11,
      display: "block",
      marginBottom: 4
    }
  }, "العيادة"), React.createElement("select", {
    style: inp(),
    value: f.clinic || "دمنهور",
    onChange: s("clinic")
  }, CLINICS_LIST.map(c => React.createElement("option", {
    key: c,
    value: c
  }, clinicLabel(c))))), React.createElement("div", null, React.createElement("label", {
    style: {
      color: C.muted,
      fontSize: 11,
      display: "block",
      marginBottom: 4
    }
  }, "نوع الموعد"), React.createElement("select", {
    style: inp(),
    value: f.type,
    onChange: setType
  }, ["فحص روتيني", "متابعة", "استشارة", "قياس نظر", "فحص شبكية", "عملية"].map(t => React.createElement("option", {
    key: t
  }, t)))), React.createElement("div", null, React.createElement("label", {
    style: {
      color: C.muted,
      fontSize: 11,
      display: "block",
      marginBottom: 4
    }
  }, "الطبيب"), React.createElement("input", {
    style: inp(),
    value: f.doctor,
    onChange: s("doctor")
  })), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10
    }
  }, React.createElement("div", null, React.createElement("label", {
    style: {
      color: C.muted,
      fontSize: 11,
      display: "block",
      marginBottom: 4
    }
  }, "قيمة الكشف (ج.م)"), React.createElement("input", {
    style: inp(),
    type: "number",
    value: f.cost || "",
    onChange: e => {
      setCostTouched(true);
      setF(v => ({
        ...v,
        cost: e.target.value
      }));
    },
    placeholder: "0"
  })), React.createElement("div", {
    onClick: () => setF(v => ({
      ...v,
      paid: !v.paid
    })),
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      background: C.card,
      border: "1px solid " + (f.paid ? C.success : C.border),
      borderRadius: 10,
      padding: "0 12px",
      cursor: "pointer",
      marginTop: 19
    }
  }, React.createElement("div", {
    style: {
      width: 18,
      height: 18,
      borderRadius: 5,
      background: f.paid ? C.success : C.bg,
      border: "2px solid " + (f.paid ? C.success : C.border),
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 11,
      color: C.bg,
      fontWeight: 700
    }
  }, f.paid ? "✓" : ""), React.createElement("span", {
    style: {
      color: f.paid ? C.success : C.muted,
      fontSize: 12,
      fontWeight: 600
    }
  }, "تم التحصيل"))), React.createElement("div", null, React.createElement("label", {
    style: {
      color: C.muted,
      fontSize: 11,
      display: "block",
      marginBottom: 4
    }
  }, "ملاحظات"), React.createElement("textarea", {
    style: {
      ...inp(),
      minHeight: 55,
      resize: "none"
    },
    value: f.notes || "",
    onChange: s("notes")
  })), err && React.createElement("div", {
    style: {
      background: C.danger + "22",
      border: "1px solid " + C.danger + "44",
      borderRadius: 10,
      padding: "9px 12px",
      color: C.danger,
      fontSize: 12,
      textAlign: "center"
    }
  }, err), React.createElement("div", {
    style: {
      display: "flex",
      gap: 10
    }
  }, React.createElement("button", {
    onClick: onClose,
    style: {
      flex: 1,
      background: "transparent",
      border: "1px solid " + C.border,
      borderRadius: 10,
      padding: 11,
      color: C.muted,
      fontWeight: 700,
      fontSize: 13,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, "إلغاء"), React.createElement("button", {
    onClick: () => {
      if (!f.patient.trim()) {
        setErr("اكتب اسم المريض");
        return;
      }
      const conflict = appointments.some(a => a.id !== f.id && a.doctor === f.doctor && a.date === f.date && a.time === f.time);
      if (conflict) {
        setErr("⚠ يوجد موعد آخر لنفس الطبيب في هذا التاريخ والوقت");
        return;
      }
      setErr("");
      onSave({
        ...f,
        id: f.id || Date.now()
      });
    },
    style: {
      flex: 2,
      background: "linear-gradient(135deg," + C.accent + "," + C.teal + ")",
      border: "none",
      borderRadius: 10,
      padding: 11,
      color: C.bg,
      fontWeight: 700,
      fontSize: 13,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, "✓ حفظ الموعد")));
}
function CollectModal({
  apt,
  prices = [],
  onSave,
  onClose
}) {
  const matched = prices.find(p => p.name === apt.type || p.name.includes(apt.type) || (apt.type || "").includes(p.name));
  const [cost, setCost] = useState(apt.cost || (matched ? matched.price : ""));
  const [paid, setPaid] = useState(!!apt.paid);
  return React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 13,
      fontWeight: 700
    }
  }, apt.patient), React.createElement("div", null, React.createElement("label", {
    style: {
      color: C.muted,
      fontSize: 11,
      display: "block",
      marginBottom: 4
    }
  }, "قيمة الكشف (ج.م)"), React.createElement("input", {
    style: {
      ...inp(),
      textAlign: "center",
      fontSize: 18,
      fontWeight: 700
    },
    type: "number",
    value: cost,
    onChange: e => setCost(e.target.value),
    placeholder: "0",
    autoFocus: true
  })), React.createElement("div", {
    onClick: () => setPaid(p => !p),
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      background: C.card,
      border: "1px solid " + (paid ? C.success : C.border),
      borderRadius: 10,
      padding: "10px 14px",
      cursor: "pointer"
    }
  }, React.createElement("div", {
    style: {
      width: 20,
      height: 20,
      borderRadius: 6,
      background: paid ? C.success : C.bg,
      border: "2px solid " + (paid ? C.success : C.border),
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 12,
      color: C.bg,
      fontWeight: 700
    }
  }, paid ? "✓" : ""), React.createElement("span", {
    style: {
      color: paid ? C.success : C.muted,
      fontSize: 13,
      fontWeight: 600
    }
  }, "تم تحصيل المبلغ نقداً")), React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      marginTop: 4
    }
  }, React.createElement("button", {
    onClick: onClose,
    style: {
      flex: 1,
      background: "transparent",
      border: "1px solid " + C.border,
      borderRadius: 10,
      padding: 11,
      color: C.muted,
      fontWeight: 700,
      fontSize: 13,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, "إلغاء"), React.createElement("button", {
    onClick: () => onSave(cost, paid),
    style: {
      flex: 2,
      background: "linear-gradient(135deg," + C.gold + ",#e0951f)",
      border: "none",
      borderRadius: 10,
      padding: 11,
      color: C.bg,
      fontWeight: 700,
      fontSize: 13,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, "💰 حفظ التحصيل")));
}
let _callCh = null,
  _callReady = null;
function callChannel() {
  const sb = getSB();
  if (!sb) return null;
  if (!_callCh) {
    _callCh = sb.channel("iapp_queue_calls", {
      config: {
        broadcast: {
          self: false
        }
      }
    });
    _callReady = new Promise(res => {
      try {
        _callCh.subscribe(st => {
          if (st === "SUBSCRIBED") res(true);
        });
      } catch (e) {
        res(false);
      }
    });
  }
  return _callCh;
}
async function broadcastCall(a, repeat) {
  const ch = callChannel();
  if (!ch) return;
  await Promise.race([_callReady, new Promise(r => setTimeout(r, 2500))]);
  try {
    await ch.send({
      type: "broadcast",
      event: "call",
      payload: {
        id: a.id,
        calledAt: a.calledAt || "",
        repeat: repeat || "",
        patient: a.patient || "",
        clinic: a.clinic || "",
        doctor: a.doctor || ""
      }
    });
  } catch (e) {}
}
function WaitingRoom({
  apts,
  today,
  onUpdateApt,
  onCollect,
  doctorNames = []
}) {
  useEffect(() => {
    callChannel();
  }, []);
  const callPatient = a => {
    const upd = {
      ...a,
      waitStatus: "called",
      calledAt: Date.now()
    };
    onUpdateApt(upd);
    broadcastCall(upd);
  };
  const recallPatient = a => broadcastCall(a, Date.now());
  const priorityKey = "iapp_priority_doctor_" + today;
  const [priorityDoctor, setPriorityDoctor] = useState(() => {
    try {
      return localStorage.getItem(priorityKey) || "";
    } catch {
      return "";
    }
  });
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  const bookedToday = [...new Set(apts.filter(a => a.date === today && a.doctor).map(a => a.doctor))];
  const priorityOptions = doctorNames.filter(d => bookedToday.includes(d));
  const setPriority = d => {
    setPriorityDoctor(d);
    try {
      if (d) localStorage.setItem(priorityKey, d);else localStorage.removeItem(priorityKey);
    } catch {}
  };
  const todayApts = apts.filter(a => a.date === today).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  const waiting = todayApts.filter(a => a.waitStatus === "waiting");
  const called = todayApts.filter(a => a.waitStatus === "called");
  const inRoom = todayApts.filter(a => a.waitStatus === "in");
  const done = todayApts.filter(a => a.waitStatus === "done");
  const postponed = todayApts.filter(a => a.waitStatus === "postponed");
  const noShow = todayApts.filter(a => a.waitStatus === "no-show");
  const pending = todayApts.filter(a => !a.waitStatus);
  const priorityWaiting = waiting.filter(a => priorityDoctor && a.doctor === priorityDoctor);
  const otherWaiting = waiting.filter(a => !priorityDoctor || a.doctor !== priorityDoctor);
  const orderedWaiting = [...priorityWaiting, ...otherWaiting];
  const PayBadge = ({
    a
  }) => a.cost ? React.createElement("span", {
    onClick: () => onCollect(a),
    style: {
      background: (a.paid ? C.success : C.danger) + "22",
      color: a.paid ? C.success : C.danger,
      borderRadius: 6,
      padding: "2px 7px",
      fontSize: 9,
      fontWeight: 700,
      cursor: "pointer"
    }
  }, a.paid ? "✓ مدفوع" : "غير مدفوع", " ", a.cost, "ج") : React.createElement("span", {
    onClick: () => onCollect(a),
    style: {
      background: C.gold + "22",
      color: C.gold,
      borderRadius: 6,
      padding: "2px 7px",
      fontSize: 9,
      fontWeight: 700,
      cursor: "pointer"
    }
  }, "💰 تحصيل");
  const durations = done.filter(a => a.inAt && a.doneAt).map(a => a.doneAt - a.inAt).filter(d => d > 0 && d < 3 * 3600 * 1000);
  const avgDurationMin = durations.length ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length / 60000) : 15;
  const fmtWait = mins => mins < 60 ? mins + " د" : Math.floor(mins / 60) + "س " + mins % 60 + "د";
  return React.createElement("div", {
    style: {
      padding: "12px 16px 100px",
      animation: "slideUp 0.25s ease"
    }
  }, React.createElement("div", {
    style: {
      background: C.card,
      border: `1px solid ${priorityDoctor ? C.accent : C.border}`,
      borderRadius: 12,
      padding: "10px 12px",
      marginBottom: 12
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginBottom: 6
    }
  }, React.createElement("span", {
    style: {
      fontSize: 16
    }
  }, "👨‍⚕️"), React.createElement("div", {
    style: {
      flex: 1,
      color: C.text,
      fontWeight: 800,
      fontSize: 12
    }
  }, "طبيب اليوم / صاحب الأولوية"), priorityDoctor && React.createElement("span", {
    style: {
      background: C.accent + "22",
      color: C.accent,
      borderRadius: 8,
      padding: "2px 7px",
      fontSize: 9,
      fontWeight: 700
    }
  }, "أولوية")), React.createElement("select", {
    value: priorityDoctor,
    onChange: e => setPriority(e.target.value),
    style: {
      ...inp(),
      padding: "8px 10px",
      fontSize: 12
    }
  }, React.createElement("option", {
    value: ""
  }, "بدون أولوية محددة"), priorityOptions.map(d => React.createElement("option", {
    key: d,
    value: d
  }, d))), priorityDoctor && React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 9,
      marginTop: 5
    }
  }, "حالات هذا الطبيب تظهر أولاً في قائمة الانتظار، بينما حالات الأطباء الآخرين تظل في الانتظار."), priorityOptions.length === 0 && React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 9,
      marginTop: 5
    }
  }, "لا يوجد طبيب آخر مسجل له موعد اليوم.")), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(6,1fr)",
      gap: 6,
      marginBottom: 16
    }
  }, [{
    l: "ينتظر",
    v: waiting.length,
    c: C.gold
  }, {
    l: "في العيادة",
    v: inRoom.length,
    c: C.accent
  }, {
    l: "انتهى",
    v: done.length,
    c: C.success
  }, {
    l: "مؤجل",
    v: postponed.length,
    c: C.purple
  }, {
    l: "لم يصل",
    v: pending.length,
    c: C.muted
  }, {
    l: "لم يحضر",
    v: noShow.length,
    c: C.danger
  }].map((s, i) => React.createElement("div", {
    key: i,
    style: {
      background: C.card,
      borderRadius: 10,
      padding: "10px 2px",
      textAlign: "center",
      border: "1px solid " + C.border
    }
  }, React.createElement("div", {
    style: {
      color: s.c,
      fontSize: 18,
      fontWeight: 800
    }
  }, s.v), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 8
    }
  }, s.l)))), durations.length > 0 && React.createElement("div", {
    style: {
      textAlign: "center",
      color: C.muted,
      fontSize: 11,
      marginBottom: 12
    }
  }, "⏱ متوسط وقت الكشف: ", React.createElement("span", {
    style: {
      color: C.accent,
      fontWeight: 700
    }
  }, avgDurationMin, " دقيقة")), called.length > 0 && called.map(a => React.createElement("div", {
    key: a.id,
    style: {
      background: `linear-gradient(135deg,${C.gold}25,${C.accent}12)`,
      border: "2px solid " + C.gold,
      borderRadius: 14,
      padding: "12px 14px",
      marginBottom: 10
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10
    }
  }, React.createElement("div", {
    style: {
      fontSize: 24
    }
  }, "📣"), React.createElement("div", {
    style: {
      flex: 1
    }
  }, React.createElement("div", {
    style: {
      color: C.gold,
      fontWeight: 900,
      fontSize: 15
    }
  }, "تم استدعاء المريض"), React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 14
    }
  }, a.patient), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10
    }
  }, a.doctor || "", " · ", clinicLabel(a.clinic))), React.createElement("button", {
    onClick: () => recallPatient(a),
    title: "إعادة النداء على كل الشاشات",
    style: {
      background: C.gold + "22",
      border: "1px solid " + C.gold + "55",
      borderRadius: 9,
      padding: "8px 10px",
      color: C.gold,
      fontSize: 11,
      fontWeight: 800,
      cursor: "pointer",
      fontFamily: "inherit",
      marginLeft: 6
    }
  }, "🔁 إعادة النداء"), React.createElement("button", {
    onClick: () => onUpdateApt({
      ...a,
      waitStatus: "in",
      inAt: Date.now()
    }),
    style: {
      background: `linear-gradient(135deg,${C.accent},${C.teal})`,
      border: "none",
      borderRadius: 9,
      padding: "8px 12px",
      color: C.bg,
      fontSize: 11,
      fontWeight: 800,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, "بدء الكشف")))), inRoom.map(a => React.createElement("div", {
    key: a.id,
    style: {
      background: `linear-gradient(135deg,${C.accent}22,${C.teal}11)`,
      border: "2px solid " + C.accent,
      borderRadius: 14,
      padding: "12px 14px",
      marginBottom: 10
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginBottom: 8
    }
  }, React.createElement("span", {
    style: {
      fontSize: 18
    }
  }, "🩺"), React.createElement("div", {
    style: {
      flex: 1
    }
  }, React.createElement("div", {
    style: {
      color: C.accent,
      fontWeight: 800,
      fontSize: 14
    }
  }, a.patient), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11
    }
  }, "في العيادة الآن · ", a.time, " · ", clinicLabel(a.clinic)))), React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      flexWrap: "wrap",
      alignItems: "center"
    }
  }, React.createElement("button", {
    onClick: () => onUpdateApt({
      ...a,
      waitStatus: "done",
      doneAt: Date.now()
    }),
    style: {
      background: C.success + "22",
      border: "1px solid " + C.success + "44",
      borderRadius: 8,
      padding: "6px 12px",
      color: C.success,
      fontSize: 11,
      fontWeight: 700,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, "✓ انتهى الكشف"), React.createElement("button", {
    onClick: () => onUpdateApt({
      ...a,
      waitStatus: "waiting"
    }),
    style: {
      background: C.gold + "22",
      border: "1px solid " + C.gold + "44",
      borderRadius: 8,
      padding: "6px 12px",
      color: C.gold,
      fontSize: 11,
      fontWeight: 700,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, "↩ رجوع للانتظار"), React.createElement(PayBadge, {
    a: a
  })))), waiting.length > 0 && React.createElement(React.Fragment, null, React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11,
      fontWeight: 700,
      marginBottom: 8
    }
  }, "⏳ قائمة الانتظار"), orderedWaiting.map((a, idx) => React.createElement("div", {
    key: a.id,
    style: {
      background: C.card,
      border: "1px solid " + C.gold + "44",
      borderRadius: 14,
      padding: "10px 14px",
      marginBottom: 8,
      display: "flex",
      alignItems: "center",
      gap: 10,
      flexWrap: "wrap"
    }
  }, React.createElement("div", {
    style: {
      width: 28,
      height: 28,
      borderRadius: "50%",
      background: C.gold + "22",
      border: "1px solid " + C.gold + "44",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: C.gold,
      fontWeight: 800,
      fontSize: 13
    }
  }, idx + 1), React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 100
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 13
    }
  }, a.patient), React.createElement("div", {
    style: {
      display: "flex",
      gap: 5,
      alignItems: "center",
      flexWrap: "wrap",
      color: C.muted,
      fontSize: 11
    }
  }, a.doctor && React.createElement("span", {
    style: {
      background: a.doctor === priorityDoctor ? C.accent + "22" : C.border,
      color: a.doctor === priorityDoctor ? C.accent : C.muted,
      borderRadius: 6,
      padding: "2px 6px",
      fontWeight: a.doctor === priorityDoctor ? 700 : 500
    }
  }, a.doctor, a.doctor === priorityDoctor ? " · أولوية" : ""), React.createElement("span", null, a.type, " · ", a.time, " · ", clinicLabel(a.clinic), " · ⏱ ~", fmtWait(Math.max(0, Math.round((clock - (a.arrivedAt || Date.now())) / 60000)) || (idx + (inRoom.length ? 1 : 0)) * avgDurationMin))), a.phone && React.createElement("a", {
    href: "tel:" + a.phone,
    style: {
      color: C.accent,
      fontSize: 11,
      textDecoration: "none"
    }
  }, "📞 ", a.phone), React.createElement("div", {
    style: {
      marginTop: 4
    }
  }, React.createElement(PayBadge, {
    a: a
  }))), React.createElement("div", {
    style: {
      display: "flex",
      gap: 6
    }
  }, inRoom.length === 0 && called.length === 0 && idx === 0 && React.createElement("button", {
    onClick: () => callPatient(a),
    style: {
      background: `linear-gradient(135deg,${C.gold},#e0951f)`,
      border: "none",
      borderRadius: 8,
      padding: "6px 10px",
      color: C.bg,
      fontSize: 11,
      fontWeight: 800,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, "📣 استدعاء"), React.createElement("button", {
    onClick: () => onUpdateApt({
      ...a,
      waitStatus: "postponed"
    }),
    title: "تأجيل",
    style: {
      background: C.purple + "22",
      border: "1px solid " + C.purple + "33",
      borderRadius: 8,
      padding: "6px 8px",
      color: C.purple,
      fontSize: 11,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, "⏸"), React.createElement("button", {
    onClick: () => onUpdateApt({
      ...a,
      waitStatus: "no-show",
      noShowAt: Date.now()
    }),
    title: "لم يحضر",
    style: {
      background: C.danger + "22",
      border: "1px solid " + C.danger + "33",
      borderRadius: 8,
      padding: "6px 8px",
      color: C.danger,
      fontSize: 11,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, "لم يحضر"), React.createElement("button", {
    onClick: () => onUpdateApt({
      ...a,
      waitStatus: undefined
    }),
    title: "إلغاء الوصول",
    style: {
      background: C.danger + "22",
      border: "1px solid " + C.danger + "33",
      borderRadius: 8,
      padding: "6px 8px",
      color: C.danger,
      fontSize: 11,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, "✕"))))), pending.length > 0 && React.createElement(React.Fragment, null, React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11,
      fontWeight: 700,
      marginBottom: 8,
      marginTop: 12
    }
  }, "📋 لم يصلوا بعد"), pending.map(a => React.createElement("div", {
    key: a.id,
    style: {
      background: C.card,
      border: "1px solid " + C.border,
      borderRadius: 12,
      padding: "10px 14px",
      marginBottom: 6,
      display: "flex",
      alignItems: "center",
      gap: 10,
      flexWrap: "wrap"
    }
  }, React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 100
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 13,
      fontWeight: 600
    }
  }, a.patient), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11
    }
  }, a.time, " · ", a.type, " · ", clinicLabel(a.clinic))), React.createElement("div", {
    style: {
      display: "flex",
      gap: 6
    }
  }, React.createElement("button", {
    onClick: () => onUpdateApt({
      ...a,
      waitStatus: "waiting"
    }),
    style: {
      background: C.gold + "22",
      border: "1px solid " + C.gold + "33",
      borderRadius: 8,
      padding: "6px 10px",
      color: C.gold,
      fontSize: 11,
      fontWeight: 700,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, "وصل ✓"), React.createElement("button", {
    onClick: () => onUpdateApt({
      ...a,
      waitStatus: "postponed"
    }),
    title: "تأجيل",
    style: {
      background: C.purple + "22",
      border: "1px solid " + C.purple + "33",
      borderRadius: 8,
      padding: "6px 8px",
      color: C.purple,
      fontSize: 11,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, "⏸"))))), postponed.length > 0 && React.createElement(React.Fragment, null, React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11,
      fontWeight: 700,
      marginBottom: 8,
      marginTop: 12
    }
  }, "⏸ تم تأجيلهم"), postponed.map(a => React.createElement("div", {
    key: a.id,
    style: {
      background: C.card,
      border: "1px solid " + C.purple + "44",
      borderRadius: 12,
      padding: "10px 14px",
      marginBottom: 6,
      display: "flex",
      alignItems: "center",
      gap: 10,
      flexWrap: "wrap"
    }
  }, React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 100
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 13,
      fontWeight: 600
    }
  }, a.patient), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11
    }
  }, a.time, " · ", a.type, " · ", clinicLabel(a.clinic))), React.createElement("button", {
    onClick: () => onUpdateApt({
      ...a,
      waitStatus: "waiting"
    }),
    style: {
      background: C.gold + "22",
      border: "1px solid " + C.gold + "33",
      borderRadius: 8,
      padding: "6px 10px",
      color: C.gold,
      fontSize: 11,
      fontWeight: 700,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, "🔁 إعادة للانتظار")))), noShow.length > 0 && React.createElement(React.Fragment, null, React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11,
      fontWeight: 700,
      marginBottom: 8,
      marginTop: 12
    }
  }, "🚫 لم يحضروا"), noShow.map(a => React.createElement("div", {
    key: a.id,
    style: {
      background: C.card,
      border: "1px solid " + C.danger + "33",
      borderRadius: 12,
      padding: "10px 14px",
      marginBottom: 6,
      display: "flex",
      alignItems: "center",
      gap: 10
    }
  }, React.createElement("div", {
    style: {
      flex: 1,
      color: C.muted,
      fontSize: 12
    }
  }, a.patient, " · ", a.time, " · ", a.doctor || ""), React.createElement("button", {
    onClick: () => onUpdateApt({
      ...a,
      waitStatus: "waiting",
      noShowAt: undefined
    }),
    style: {
      background: C.gold + "22",
      border: "1px solid " + C.gold + "33",
      borderRadius: 8,
      padding: "6px 10px",
      color: C.gold,
      fontSize: 11,
      fontWeight: 700,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, "إعادة للانتظار")))), done.length > 0 && React.createElement(React.Fragment, null, React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11,
      fontWeight: 700,
      marginBottom: 8,
      marginTop: 12
    }
  }, "✅ انتهوا اليوم"), done.map(a => React.createElement("div", {
    key: a.id,
    style: {
      background: C.card,
      border: "1px solid " + C.border,
      borderRadius: 12,
      padding: "10px 14px",
      marginBottom: 6,
      opacity: 0.75,
      display: "flex",
      alignItems: "center",
      gap: 10,
      flexWrap: "wrap"
    }
  }, React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 100,
      color: C.muted,
      fontSize: 12
    }
  }, a.patient, " · ", a.time), React.createElement(PayBadge, {
    a: a
  })))), todayApts.length === 0 && React.createElement("div", {
    style: {
      color: C.muted,
      textAlign: "center",
      padding: 40,
      fontSize: 13
    }
  }, "لا توجد مواعيد اليوم"));
}
function SecretaryApp() {
  const [session, setSession] = useState(() => {
    try {
      const p = localStorage.getItem("iapp_session");
      if (p) return JSON.parse(p);
    } catch {}
    try {
      return JSON.parse(sessionStorage.getItem("iapp_session"));
    } catch {
      return null;
    }
  });
  const [tab, setTab] = useState("apts");
  const [showReminders, setShowReminders] = useState(false);
  const [requests, setRequests] = useState([]);
  const [reqBusy, setReqBusy] = useState(null);
  const [apts, setAptsState] = useState([]);
  const [patients, setPatients] = useState([]);
  const [prices, setPrices] = useState([]);
  const [modal, setModal] = useState(null);
  const [collectApt, setCollectApt] = useState(null);
  const [filterDate, setFilterDate] = useState(localISO());
  const [filterClinic, setFilterClinic] = useState("");
  const [search, setSearch] = useState("");
  const [filterFromPatient, setFilterFromPatient] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const today = localISO();
  const secSt = useSyncStatus();
  const loadRequests = async () => {
    try {
      const sb = getSB();
      if (!sb) return;
      const {
        data,
        error
      } = await sb.from(BOOKING_TABLE).select("*").eq("status", "pending").order("created_at", {
        ascending: true
      });
      if (!error && Array.isArray(data)) setRequests(data);
    } catch (e) {}
  };
  const loadData = async () => {
    const [a, p, pr] = await Promise.all([sbGet("iapp_appointments"), sbGet("iapp_patients"), sbGet("iapp_prices")]);
    const ld = k => {
      try {
        return JSON.parse(localStorage.getItem(k));
      } catch {
        return null;
      }
    };
    const A = a || ld("iapp_appointments"),
      P = p || ld("iapp_patients"),
      PR = pr || ld("iapp_prices");
    if (Array.isArray(A)) setAptsState(A);
    if (Array.isArray(P)) setPatients(P);
    if (Array.isArray(PR)) setPrices(PR);
    setLoading(false);
    loadRequests();
  };
  const acceptRequest = async r => {
    setReqBusy(r.id);
    const apt = {
      id: newId(),
      patientId: null,
      patient: r.patient_name,
      phone: r.phone || "",
      date: r.date,
      time: r.time,
      type: r.visit_type || "فحص روتيني",
      notes: r.note || "",
      doctor: "د. عبدالستار",
      clinic: r.clinic,
      confirmed: true,
      fromPatient: true
    };
    const ok = await mutateApts(list => aptConflict(list, apt) ? {
      abort: "⚠ يوجد موعد آخر لنفس الطبيب في هذا الوقت"
    } : [...list, apt], list => list.some(a => a.id === apt.id), "تم تأكيد الطلب");
    if (ok) {
      try {
        await getSB().from(BOOKING_TABLE).update({
          status: "accepted"
        }).eq("id", r.id);
      } catch (e) {}
      setRequests(list => list.filter(x => x.id !== r.id));
      logAudit("قبول طلب حجز", r.patient_name + " · " + r.date + " " + r.time);
    }
    setReqBusy(null);
  };
  const rejectRequest = async r => {
    if (!window.confirm("رفض طلب " + r.patient_name + "؟")) return;
    setReqBusy(r.id);
    try {
      await getSB().from(BOOKING_TABLE).update({
        status: "rejected"
      }).eq("id", r.id);
      setRequests(list => list.filter(x => x.id !== r.id));
      logAudit("رفض طلب حجز", r.patient_name + " · " + r.date + " " + r.time);
    } catch (e) {}
    setReqBusy(null);
  };
  useEffect(() => {
    if (!session) return;
    loadData();
    let channel = null;
    try {
      channel = getSB().channel("iapp_store_changes").on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "iapp_store"
      }, payload => {
        const key = payload.new && payload.new.key || payload.old && payload.old.key;
        if (!key || key === "iapp_appointments" || key === "iapp_patients" || key === "iapp_prices" || key === "iapp_visits") loadData();
      }).subscribe();
    } catch (e) {
      channel = null;
    }
    const iv = setInterval(loadData, 5000);
    return () => {
      clearInterval(iv);
      if (channel) {
        try {
          getSB().removeChannel(channel);
        } catch {}
      }
    };
  }, [session]);
  const mutateApts = async (fn, verify, okMsg) => {
    setSyncing(true);
    const res = await sbMutate("iapp_appointments", fn, verify);
    setSyncing(false);
    if (res.ok) {
      setAptsState(res.data);
      setToast(okMsg || "تم الحفظ");
    } else if (res.error === "offline" || res.error === "conflict") alert("❌ لم يتم الحفظ — تحقق من الاتصال وحاول مرة أخرى");else alert(res.error);
    return res.ok;
  };
  const markReminded = a => mutateApts(list => list.map(x => x.id === a.id ? {
    ...x,
    reminded: localISO()
  } : x), null, "تم تسجيل التذكير");
  const aptConflict = (list, f) => list.some(a => a.id !== f.id && isActiveApt(a) && a.doctor === f.doctor && a.date === f.date && a.time === f.time);
  const addApt = f => mutateApts(list => aptConflict(list, f) ? {
    abort: "⚠ تم حجز نفس الموعد لنفس الطبيب للتو من جهاز آخر"
  } : [...list, f], list => list.some(a => a.id === f.id));
  const editApt = f => mutateApts(list => aptConflict(list, f) ? {
    abort: "⚠ تم حجز نفس الموعد لنفس الطبيب للتو من جهاز آخر"
  } : list.map(a => a.id === f.id ? f : a));
  const deleteApt = async id => {
    const rec = apts.find(x => x.id === id);
    await trashPut("iapp_appointments", rec, "موعد");
    logAudit("حذف موعد", rec && rec.date + " " + (rec.time || "") + " · " + (rec.patient || "") || id);
    return mutateApts(list => list.filter(x => x.id !== id), list => !list.some(x => x.id === id), "تم الحذف");
  };
  const updateApt = apt => mutateApts(list => list.some(a => a.id === apt.id) ? list.map(a => a.id === apt.id ? {
    ...a,
    ...apt
  } : a) : [...list, apt]);
  const pushVisitRecord = async (apt, cost, paid) => {
    const vid = "apt-" + apt.id;
    const rec = {
      id: vid,
      patientId: apt.patientId || null,
      patient: apt.patient,
      date: apt.date,
      type: apt.type || "فحص روتيني",
      doctor: apt.doctor || "",
      clinic: apt.clinic || "",
      complaint: "",
      result: "",
      cost: String(cost || 0),
      paid: !!paid,
      nextVisit: "",
      notes: "تحصيل من السكرتارية · " + clinicLabel(apt.clinic)
    };
    await sbMutate("iapp_visits", visits => visits.some(v => v.id === vid) ? visits.map(v => v.id === vid ? rec : v) : [...visits, rec], list => list.some(v => v.id === vid));
  };
  const handleSaveCollect = async (cost, paid) => {
    const apt = collectApt;
    await updateApt({
      ...apt,
      cost,
      paid
    });
    await pushVisitRecord(apt, cost, paid);
    setCollectApt(null);
    logAudit(paid ? "تحصيل مبلغ" : "تسجيل قيمة كشف", (apt.patient || "") + " · " + cost + " ج.م");
    setToast(paid ? "✓ تم تحصيل " + cost + " ج.م" : "تم حفظ قيمة الكشف");
  };
  const pendingFromPatient = apts.filter(a => a.fromPatient && !a.confirmed).length;
  const waitingCount = apts.filter(a => a.date === today && a.waitStatus === "waiting").length;
  const filtered = apts.filter(a => {
    const dateOk = filterDate ? a.date === filterDate : true;
    const searchOk = search ? a.patient?.includes(search) : true;
    const fromOk = filterFromPatient ? a.fromPatient : true;
    const clinicOk = filterClinic ? a.clinic === filterClinic : true;
    return dateOk && searchOk && fromOk && clinicOk;
  }).sort((a, b) => a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || ""));
  const handleLogin = (u, remember) => {
    const s = {
      id: u.id,
      username: u.username,
      name: u.name,
      role: u.role
    };
    if (remember) {
      try {
        localStorage.setItem("iapp_session", JSON.stringify(s));
      } catch {}
    } else {
      try {
        sessionStorage.setItem("iapp_session", JSON.stringify(s));
      } catch {}
    }
    setSession(s);
  };
  const handleLogout = () => {
    try {
      localStorage.removeItem("iapp_session");
    } catch {}
    try {
      sessionStorage.removeItem("iapp_session");
    } catch {}
    setSession(null);
    try {
      if (window.__iappUnifiedLogout) window.__iappUnifiedLogout();
    } catch {}
  };
  if (!session) return React.createElement(LoginScreen, {
    onLogin: handleLogin
  });
  const Btn = ({
    children,
    onClick,
    color,
    active
  }) => React.createElement("button", {
    onClick: onClick,
    style: {
      background: active ? `linear-gradient(135deg,${color || C.accent},${C.teal})` : color ? color + "22" : "transparent",
      border: "1px solid " + (active ? "transparent" : color || C.border),
      borderRadius: 8,
      padding: "6px 12px",
      color: active ? C.bg : color || C.muted,
      fontSize: 11,
      fontWeight: 600,
      cursor: "pointer",
      fontFamily: "inherit",
      whiteSpace: "nowrap"
    }
  }, children);
  return React.createElement("div", {
    style: {
      height: "100%",
      background: C.bg,
      direction: "rtl",
      display: "flex",
      flexDirection: "column"
    }
  }, React.createElement("div", {
    style: {
      background: `linear-gradient(135deg,${C.surface},${C.surface2})`,
      borderBottom: "1px solid " + C.border,
      padding: "0 16px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      height: 60,
      flexShrink: 0
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  }, React.createElement("div", {
    style: {
      width: 34,
      height: 34,
      borderRadius: 10,
      background: `linear-gradient(135deg,${C.accent},${C.teal})`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 18
    }
  }, "👁"), React.createElement("div", null, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 14
    }
  }, "I App ", React.createElement("span", {
    style: {
      color: C.muted,
      fontWeight: 400,
      fontSize: 11
    }
  }, "· السكرتارية")), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 9,
      display: "flex",
      alignItems: "center",
      gap: 3
    }
  }, React.createElement("span", {
    style: {
      width: 5,
      height: 5,
      borderRadius: "50%",
      background: syncing ? C.gold : C.success,
      display: "inline-block"
    }
  }), syncing || secSt.busy ? syncing && !secSt.offline ? "جاري المزامنة..." : secSt.label : session.name)), pendingFromPatient > 0 && React.createElement("span", {
    style: {
      background: C.gold,
      color: C.bg,
      borderRadius: "50%",
      width: 20,
      height: 20,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 10,
      fontWeight: 800
    }
  }, pendingFromPatient), waitingCount > 0 && React.createElement("span", {
    style: {
      background: C.accent + "22",
      color: C.accent,
      borderRadius: 8,
      padding: "2px 8px",
      fontSize: 10,
      fontWeight: 700
    }
  }, "⏳", waitingCount)), React.createElement("div", {
    style: {
      display: "flex",
      gap: 6
    }
  }, React.createElement("button", {
    onClick: () => setModal("add"),
    style: {
      background: `linear-gradient(135deg,${C.accent},${C.teal})`,
      border: "none",
      borderRadius: 10,
      padding: "8px 12px",
      color: C.bg,
      fontWeight: 700,
      fontSize: 12,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, "+ جديد"), React.createElement(ThemeToggle, null), React.createElement("button", {
    onClick: loadData,
    style: {
      background: "transparent",
      border: "1px solid " + C.border,
      borderRadius: 10,
      padding: "8px 10px",
      color: C.muted,
      fontSize: 14,
      cursor: "pointer"
    }
  }, "🔄"), React.createElement("button", {
    onClick: handleLogout,
    title: "تسجيل الخروج",
    style: {
      background: "transparent",
      border: "1px solid " + C.border,
      borderRadius: 10,
      padding: "8px 10px",
      color: C.danger,
      fontSize: 14,
      cursor: "pointer"
    }
  }, "⏻"))), React.createElement("div", {
    style: {
      background: C.surface,
      borderBottom: "1px solid " + C.border,
      display: "flex",
      flexShrink: 0
    }
  }, [{
    id: "apts",
    icon: "📋",
    label: "المواعيد"
  }, {
    id: "requests",
    icon: "📨",
    label: "طلبات الحجز" + (requests.length ? " (" + requests.length + ")" : "")
  }, {
    id: "waiting",
    icon: "⏳",
    label: "الانتظار"
  }, {
    id: "stats",
    icon: "📊",
    label: "إحصائيات"
  }].map(t => React.createElement("div", {
    key: t.id,
    onClick: () => setTab(t.id),
    style: {
      flex: 1,
      textAlign: "center",
      padding: "9px 4px",
      cursor: "pointer",
      borderBottom: tab === t.id ? "2px solid " + C.accent : "2px solid transparent",
      color: tab === t.id ? C.accent : C.muted,
      fontSize: 10,
      fontWeight: tab === t.id ? 700 : 400,
      transition: "all 0.2s"
    }
  }, React.createElement("div", {
    style: {
      fontSize: 15
    }
  }, t.icon), t.label))), tab === "apts" && React.createElement(React.Fragment, null, React.createElement("div", {
    style: {
      padding: "8px 16px 0",
      background: C.surface,
      flexShrink: 0
    }
  }, React.createElement("button", {
    onClick: () => setShowReminders(true),
    style: {
      width: "100%",
      background: "#25D36618",
      border: "1px solid #25D36655",
      borderRadius: 10,
      padding: "8px 10px",
      color: "#25D366",
      fontSize: 12,
      fontWeight: 800,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, "📲 تذكير مواعيد الغد على واتساب")), React.createElement("div", {
    style: {
      padding: "8px 16px",
      background: C.surface,
      borderBottom: "1px solid " + C.border,
      flexShrink: 0,
      display: "flex",
      gap: 6,
      overflowX: "auto"
    }
  }, React.createElement(Btn, {
    active: filterDate === today && !filterFromPatient && !filterClinic,
    onClick: () => {
      setFilterDate(today);
      setFilterFromPatient(false);
      setFilterClinic("");
    }
  }, "📅 اليوم"), React.createElement(Btn, {
    active: !filterDate && !filterFromPatient && !filterClinic,
    onClick: () => {
      setFilterDate("");
      setFilterFromPatient(false);
      setFilterClinic("");
    }
  }, "📋 الكل"), React.createElement(Btn, {
    active: filterFromPatient,
    color: C.gold,
    onClick: () => {
      setFilterFromPatient(f => !f);
      setFilterDate("");
    }
  }, "⭐ طلبات", pendingFromPatient > 0 ? " (" + pendingFromPatient + ")" : ""), React.createElement("input", {
    type: "date",
    value: filterDate,
    onChange: e => setFilterDate(e.target.value),
    style: {
      ...inp(),
      fontSize: 11,
      padding: "6px 10px",
      minWidth: 130,
      flex: "0 0 auto"
    }
  })), React.createElement("div", {
    style: {
      padding: "6px 16px",
      background: C.surface,
      borderBottom: "1px solid " + C.border,
      flexShrink: 0,
      display: "flex",
      gap: 6,
      overflowX: "auto"
    }
  }, ["الكل", ...CLINICS_LIST].map(c => React.createElement("button", {
    key: c,
    onClick: () => setFilterClinic(c === "الكل" ? "" : c),
    style: {
      background: !filterClinic && c === "الكل" || filterClinic === c ? C.teal + "33" : "transparent",
      border: "1px solid " + (!filterClinic && c === "الكل" || filterClinic === c) ? C.teal : C.border,
      borderRadius: 8,
      padding: "5px 10px",
      color: !filterClinic && c === "الكل" || filterClinic === c ? C.teal : C.muted,
      fontSize: 10,
      fontWeight: 600,
      cursor: "pointer",
      fontFamily: "inherit",
      whiteSpace: "nowrap"
    }
  }, c === "الكل" ? "🏥 الكل" : "📍 " + clinicLabel(c)))), React.createElement("div", {
    style: {
      padding: "6px 16px",
      background: C.surface,
      borderBottom: "1px solid " + C.border,
      flexShrink: 0
    }
  }, React.createElement("input", {
    value: search,
    onChange: e => setSearch(e.target.value),
    placeholder: "🔍 بحث بالاسم...",
    style: {
      ...inp(),
      fontSize: 12,
      padding: "8px 12px"
    }
  })), React.createElement("div", {
    style: {
      padding: "8px 16px",
      display: "flex",
      gap: 8,
      flexShrink: 0
    }
  }, [{
    l: "اليوم",
    v: apts.filter(a => a.date === today).length,
    c: C.accent
  }, {
    l: "معروض",
    v: filtered.length,
    c: C.teal
  }, {
    l: "مؤكد",
    v: filtered.filter(a => a.confirmed).length,
    c: C.success
  }, {
    l: "طلبات",
    v: pendingFromPatient,
    c: C.gold
  }].map((s, i) => React.createElement("div", {
    key: i,
    style: {
      flex: 1,
      background: C.card,
      borderRadius: 10,
      padding: "8px 4px",
      textAlign: "center",
      border: "1px solid " + C.border
    }
  }, React.createElement("div", {
    style: {
      color: s.c,
      fontSize: 17,
      fontWeight: 800
    }
  }, s.v), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 9
    }
  }, s.l)))), React.createElement("div", {
    style: {
      flex: 1,
      overflowY: "auto",
      padding: "0 16px 20px"
    }
  }, loading && React.createElement("div", {
    style: {
      color: C.muted,
      textAlign: "center",
      padding: 40
    }
  }, "⏳ جاري التحميل..."), !loading && filtered.length === 0 && React.createElement("div", {
    style: {
      color: C.muted,
      textAlign: "center",
      padding: 40,
      fontSize: 13
    }
  }, "لا توجد مواعيد"), filtered.map(a => React.createElement("div", {
    key: a.id,
    style: {
      background: C.card,
      border: "1px solid " + (a.fromPatient ? C.gold : a.confirmed ? C.success : C.border),
      borderRadius: 14,
      padding: "12px 14px",
      marginBottom: 10,
      borderRight: "4px solid " + (a.confirmed ? C.success : a.fromPatient ? C.gold : C.accent),
      animation: "slideUp 0.2s ease"
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 8
    }
  }, React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 5,
      flexWrap: "wrap",
      marginBottom: 3
    }
  }, React.createElement("span", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 14
    }
  }, a.patient), a.fromPatient && React.createElement("span", {
    style: {
      background: C.gold + "22",
      color: C.gold,
      borderRadius: 6,
      padding: "1px 6px",
      fontSize: 9,
      fontWeight: 700
    }
  }, "⭐ طلب"), a.waitStatus === "waiting" && React.createElement("span", {
    style: {
      background: C.gold + "22",
      color: C.gold,
      borderRadius: 6,
      padding: "1px 6px",
      fontSize: 9,
      fontWeight: 700
    }
  }, "⏳ ينتظر"), a.waitStatus === "in" && React.createElement("span", {
    style: {
      background: C.accent + "22",
      color: C.accent,
      borderRadius: 6,
      padding: "1px 6px",
      fontSize: 9,
      fontWeight: 700
    }
  }, "🩺 في العيادة"), a.waitStatus === "done" && React.createElement("span", {
    style: {
      background: C.success + "22",
      color: C.success,
      borderRadius: 6,
      padding: "1px 6px",
      fontSize: 9,
      fontWeight: 700
    }
  }, "✓ انتهى"), a.waitStatus === "postponed" && React.createElement("span", {
    style: {
      background: C.purple + "22",
      color: C.purple,
      borderRadius: 6,
      padding: "1px 6px",
      fontSize: 9,
      fontWeight: 700
    }
  }, "⏸ مؤجل")), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11
    }
  }, a.type, " · ", a.doctor), React.createElement("div", {
    style: {
      display: "flex",
      gap: 10,
      marginTop: 2,
      flexWrap: "wrap"
    }
  }, a.phone && React.createElement("a", {
    href: "tel:" + a.phone,
    style: {
      color: C.accent,
      fontSize: 11,
      textDecoration: "none"
    }
  }, "📞 ", a.phone), a.phone && React.createElement("span", {
    onClick: () => {
      waOpen(a.phone, waReminderText(a));
      markReminded(a);
    },
    style: {
      color: "#25D366",
      fontSize: 11,
      cursor: "pointer",
      fontWeight: 700
    }
  }, "💬 تذكير"), a.clinic && React.createElement("span", {
    style: {
      color: C.teal,
      fontSize: 11
    }
  }, "📍 ", clinicLabel(a.clinic)), a.date !== today && React.createElement("span", {
    style: {
      color: C.gold,
      fontSize: 10
    }
  }, "📅 ", a.date))), React.createElement("div", {
    style: {
      background: C.accent + "22",
      borderRadius: 8,
      padding: "4px 10px",
      textAlign: "center",
      flexShrink: 0,
      marginRight: 8
    }
  }, React.createElement("div", {
    style: {
      color: C.accent,
      fontSize: 14,
      fontWeight: 800
    }
  }, a.time), React.createElement("div", {
    onClick: () => setCollectApt(a),
    style: {
      color: a.cost ? a.paid ? C.success : C.danger : C.muted,
      fontSize: 9,
      cursor: "pointer",
      fontWeight: 700,
      marginTop: 2
    }
  }, a.cost ? a.paid ? "✓ " + a.cost + "ج" : "غير مدفوع" : "💰 تحصيل"))), a.notes && React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11,
      marginBottom: 8
    }
  }, "📝 ", a.notes), React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      flexWrap: "wrap"
    }
  }, React.createElement("div", {
    onClick: () => updateApt({
      ...a,
      confirmed: !a.confirmed
    }),
    style: {
      flex: "1 1 60px",
      background: a.confirmed ? C.success + "33" : "transparent",
      border: "1px solid " + (a.confirmed ? C.success : C.border),
      borderRadius: 8,
      padding: "7px 0",
      color: a.confirmed ? C.success : C.muted,
      fontSize: 11,
      fontWeight: 700,
      cursor: "pointer",
      textAlign: "center"
    }
  }, a.confirmed ? "✓ مؤكد" : "تأكيد"), a.date === today && !["waiting", "called", "in", "done"].includes(a.waitStatus) && React.createElement("div", {
    onClick: () => updateApt({
      ...a,
      waitStatus: "waiting",
      arrivedAt: Date.now()
    }),
    style: {
      flex: "1 1 70px",
      background: C.gold + "22",
      border: "1px solid " + C.gold + "44",
      borderRadius: 8,
      padding: "7px 0",
      color: C.gold,
      fontSize: 11,
      fontWeight: 700,
      cursor: "pointer",
      textAlign: "center"
    }
  }, "وصل ✓"), a.phone && React.createElement("a", {
    href: "https://wa.me/2" + a.phone.replace(/^0/, "") + "?text=" + encodeURIComponent("تذكير بموعدك في " + clinicLabel(a.clinic) + " يوم " + a.date + " الساعة " + a.time),
    target: "_blank",
    style: {
      background: "#25D36622",
      border: "1px solid #25D36633",
      borderRadius: 8,
      padding: "7px 12px",
      color: "#25D366",
      fontSize: 14,
      textDecoration: "none",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }
  }, "💬"), a.phone && React.createElement("a", {
    href: "tel:" + a.phone,
    style: {
      background: C.teal + "22",
      border: "1px solid " + C.teal + "33",
      borderRadius: 8,
      padding: "7px 12px",
      color: C.teal,
      fontSize: 14,
      textDecoration: "none",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }
  }, "📞"), React.createElement("div", {
    onClick: () => setModal({
      edit: a
    }),
    style: {
      background: C.accent + "22",
      border: "1px solid " + C.accent + "33",
      borderRadius: 8,
      padding: "7px 12px",
      color: C.accent,
      fontSize: 14,
      cursor: "pointer"
    }
  }, "✏️"), session.role === "admin" && React.createElement("div", {
    onClick: () => {
      if (window.confirm("حذف موعد " + a.patient + "؟")) deleteApt(a.id);
    },
    style: {
      background: C.danger + "22",
      border: "1px solid " + C.danger + "33",
      borderRadius: 8,
      padding: "7px 12px",
      color: C.danger,
      fontSize: 14,
      cursor: "pointer"
    }
  }, "🗑️")))))), showReminders && React.createElement(RemindersModal, {
    apts: apts,
    onClose: () => setShowReminders(false),
    onMark: markReminded
  }), tab === "requests" && React.createElement("div", {
    style: {
      flex: 1,
      overflowY: "auto",
      padding: "14px 16px 90px"
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 15
    }
  }, "📨 طلبات الحجز من المرضى"), React.createElement("span", {
    onClick: loadRequests,
    style: {
      color: C.accent,
      fontSize: 11,
      cursor: "pointer",
      background: C.accent + "22",
      borderRadius: 8,
      padding: "4px 10px"
    }
  }, "↻ تحديث")), requests.length === 0 && React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 13,
      textAlign: "center",
      padding: "30px 0"
    }
  }, "لا توجد طلبات جديدة"), requests.map(r => React.createElement("div", {
    key: r.id,
    style: {
      background: C.card,
      border: "1px solid " + C.gold + "55",
      borderRadius: 14,
      padding: "12px 14px",
      marginBottom: 10
    }
  }, React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      gap: 8,
      flexWrap: "wrap"
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 14
    }
  }, r.patient_name), React.createElement("div", {
    style: {
      color: C.gold,
      fontSize: 12
    }
  }, r.date, " · ", r.time)), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11,
      marginTop: 4
    }
  }, "📍 ", clinicLabel(r.clinic), " · ", r.visit_type || "فحص روتيني"), r.phone && React.createElement("a", {
    href: "tel:" + r.phone,
    style: {
      color: C.accent,
      fontSize: 12,
      textDecoration: "none",
      display: "inline-block",
      marginTop: 4,
      direction: "ltr"
    }
  }, "📞 ", r.phone), r.note && React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 11,
      marginTop: 6,
      background: C.bg,
      borderRadius: 8,
      padding: "6px 9px"
    }
  }, "📝 ", r.note), React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginTop: 10
    }
  }, React.createElement("button", {
    onClick: () => acceptRequest(r),
    disabled: reqBusy === r.id,
    style: {
      flex: 1,
      background: `linear-gradient(135deg,${C.success},${C.teal})`,
      border: "none",
      borderRadius: 9,
      padding: "8px 10px",
      color: C.bg,
      fontSize: 12,
      fontWeight: 800,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, reqBusy === r.id ? "⏳" : "✓ تأكيد وإضافة للمواعيد"), React.createElement("button", {
    onClick: () => rejectRequest(r),
    disabled: reqBusy === r.id,
    style: {
      background: C.danger + "22",
      border: "1px solid " + C.danger + "44",
      borderRadius: 9,
      padding: "8px 12px",
      color: C.danger,
      fontSize: 12,
      fontWeight: 700,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, "✕ رفض"))))), tab === "waiting" && React.createElement("div", {
    style: {
      flex: 1,
      overflowY: "auto"
    }
  }, React.createElement(WaitingRoom, {
    apts: apts,
    today: today,
    onUpdateApt: updateApt,
    onCollect: setCollectApt,
    doctorNames: [...new Set(apts.filter(a => a.date === today && a.doctor).map(a => a.doctor))]
  })), tab === "stats" && React.createElement("div", {
    style: {
      flex: 1,
      overflowY: "auto",
      padding: "16px 16px 80px"
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 700,
      fontSize: 16,
      marginBottom: 16
    }
  }, "📊 إحصائيات"), React.createElement("div", {
    style: {
      background: `linear-gradient(135deg,${C.success}22,${C.card})`,
      border: "1px solid " + C.success + "44",
      borderRadius: 14,
      padding: 14,
      marginBottom: 16,
      textAlign: "center"
    }
  }, React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11,
      marginBottom: 4
    }
  }, "💰 المحصّل اليوم"), React.createElement("div", {
    style: {
      color: C.success,
      fontWeight: 800,
      fontSize: 24
    }
  }, apts.filter(a => a.date === today && a.paid).reduce((s, a) => s + Number(a.cost || 0), 0).toLocaleString(), " ج.م"), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 10,
      marginTop: 2
    }
  }, "غير محصّل: ", apts.filter(a => a.date === today && !a.paid && a.cost).length, " حالة")), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11,
      fontWeight: 700,
      marginBottom: 10
    }
  }, "حسب العيادة"), CLINICS_LIST.map(c => {
    const cnt = apts.filter(a => a.clinic === c).length;
    const todayCnt = apts.filter(a => a.clinic === c && a.date === today).length;
    if (!cnt && !todayCnt) return null;
    return React.createElement("div", {
      key: c,
      style: {
        background: C.card,
        border: "1px solid " + C.border,
        borderRadius: 12,
        padding: "12px 14px",
        marginBottom: 8
      }
    }, React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 8
      }
    }, React.createElement("span", {
      style: {
        color: C.text,
        fontWeight: 700,
        fontSize: 13
      }
    }, "📍 ", clinicLabel(c)), React.createElement("div", {
      style: {
        display: "flex",
        gap: 10
      }
    }, React.createElement("span", {
      style: {
        color: C.teal,
        fontWeight: 700,
        fontSize: 13
      }
    }, todayCnt, " اليوم"), React.createElement("span", {
      style: {
        color: C.muted,
        fontSize: 12
      }
    }, cnt, " إجمالي"))), React.createElement("div", {
      style: {
        background: C.bg,
        borderRadius: 6,
        height: 6,
        overflow: "hidden"
      }
    }, React.createElement("div", {
      style: {
        width: cnt / Math.max(apts.length, 1) * 100 + "%",
        height: "100%",
        background: `linear-gradient(90deg,${C.accent},${C.teal})`,
        borderRadius: 6
      }
    })));
  }), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11,
      fontWeight: 700,
      marginBottom: 10,
      marginTop: 16
    }
  }, "حسب نوع الموعد"), ["فحص روتيني", "متابعة", "استشارة", "قياس نظر", "فحص شبكية", "عملية"].map(t => {
    const cnt = apts.filter(a => a.type === t).length;
    if (!cnt) return null;
    return React.createElement("div", {
      key: t,
      style: {
        background: C.card,
        border: "1px solid " + C.border,
        borderRadius: 10,
        padding: "10px 14px",
        marginBottom: 6,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }
    }, React.createElement("span", {
      style: {
        color: C.text,
        fontSize: 13
      }
    }, t), React.createElement("span", {
      style: {
        color: C.teal,
        fontWeight: 700,
        fontSize: 15
      }
    }, cnt));
  }), React.createElement("div", {
    style: {
      background: C.gold + "11",
      border: "1px solid " + C.gold + "33",
      borderRadius: 14,
      padding: 14,
      marginTop: 16
    }
  }, React.createElement("div", {
    style: {
      color: C.gold,
      fontWeight: 700,
      fontSize: 13,
      marginBottom: 4
    }
  }, "⭐ طلبات المرضى المعلقة"), React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 28,
      fontWeight: 800
    }
  }, pendingFromPatient), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11
    }
  }, "بحاجة للتأكيد"))), modal === "add" && React.createElement(Modal, {
    title: "موعد جديد",
    onClose: () => setModal(null)
  }, React.createElement(SecretaryAptForm, {
    patients: patients,
    appointments: apts,
    prices: prices,
    onSave: async f => {
      if (await addApt(f)) setModal(null);
    },
    onClose: () => setModal(null)
  })), modal?.edit && React.createElement(Modal, {
    title: "تعديل الموعد",
    onClose: () => setModal(null)
  }, React.createElement(SecretaryAptForm, {
    patients: patients,
    appointments: apts,
    prices: prices,
    initial: modal.edit,
    onSave: async f => {
      if (await editApt(f)) setModal(null);
    },
    onClose: () => setModal(null)
  })), collectApt && React.createElement(Modal, {
    title: "💰 تحصيل مبلغ الكشف",
    onClose: () => setCollectApt(null)
  }, React.createElement(CollectModal, {
    apt: collectApt,
    prices: prices,
    onSave: handleSaveCollect,
    onClose: () => setCollectApt(null)
  })), toast && React.createElement(Toast, {
    msg: toast,
    onDone: () => setToast(null)
  }));
}
function UnifiedLogin({
  onLogin
}) {
  const [mode, setMode] = useState("staff");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const choose = m => {
    setMode(PATIENT_FILE_LOGIN ? m : m === "patient" ? "guest" : m);
    setError("");
  };
  const submit = async e => {
    if (e && e.preventDefault) e.preventDefault();
    setError("");
    if (loading) return;
    if (mode === "staff") {
      if (!username.trim() || !password) {
        setError("❌ أدخل البريد الإلكتروني وكلمة المرور");
        return;
      }
      setLoading(true);
      const r = await authenticateStaff(username, password);
      setLoading(false);
      if (!r.user) {
        setError(r.error);
        return;
      }
      setPassword("");
      onLogin({
        kind: "staff",
        user: r.user
      }, remember);
    } else if (mode === "patient") {
      if (!code.trim() || !name.trim()) {
        setError("❌ أدخل رقم الملف والاسم الكامل");
        return;
      }
      const pkey = "patient:" + code.trim().toUpperCase();
      const wait = lockRemaining(pkey);
      if (wait) {
        setError("⏳ محاولات خاطئة كثيرة — حاول بعد " + fmtWait(wait));
        return;
      }
      setLoading(true);
      await ensureKiosk();
      const patients = await sbGet("iapp_patients");
      setLoading(false);
      if (!Array.isArray(patients)) {
        setError(KIOSK_EMAIL ? "❌ تعذر الاتصال بقاعدة البيانات" : "❌ بوابة المريض غير مفعّلة حالياً — تواصل مع العيادة للحجز");
        return;
      }
      const codeKey = code.trim().toUpperCase().replace(/^P-?/, "").replace(/^0+/, "");
      const p = patients.find(x => String(x.patientCode || "").toUpperCase().replace(/^P-?/, "").replace(/^0+/, "") === codeKey && normArabic(x.name) === normArabic(name));
      if (!p) {
        const w = registerLoginFail(pkey);
        setError(w ? "⏳ تم إيقاف الدخول مؤقتاً — حاول بعد " + fmtWait(w) : "❌ رقم الملف أو الاسم غير صحيح");
        return;
      }
      clearLoginFails(pkey);
      onLogin({
        kind: "patient",
        patient: {
          id: p.id,
          name: p.name,
          patientCode: p.patientCode,
          phone: p.phone || ""
        }
      }, remember);
    } else {
      await ensureKiosk();
      onLogin({
        kind: "patient",
        patient: {
          id: null,
          name: "زائر",
          patientCode: null,
          isGuest: true
        }
      }, remember);
    }
  };
  return React.createElement("div", {
    style: {
      minHeight: "100vh",
      background: C.bg,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      direction: "rtl",
      fontFamily: "'Segoe UI','Tahoma',Arial,sans-serif",
      padding: "24px 20px",
      overflowY: "auto"
    }
  }, React.createElement("div", {
    style: {
      width: "100%",
      maxWidth: 430
    }
  }, React.createElement("div", {
    style: {
      textAlign: "center",
      marginBottom: 24
    }
  }, React.createElement("div", {
    style: {
      width: 82,
      height: 82,
      borderRadius: 24,
      background: `linear-gradient(135deg,${C.accent},${C.teal})`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 38,
      margin: "0 auto 14px",
      boxShadow: `0 0 28px ${C.accent}55`
    }
  }, "👁"), React.createElement("div", {
    style: {
      color: C.accent,
      fontWeight: 900,
      fontSize: 28,
      letterSpacing: 1
    }
  }, "I App"), React.createElement("div", {
    style: {
      color: C.text,
      fontSize: 14,
      fontWeight: 600,
      marginTop: 4
    }
  }, "نظام إدارة عيادة العيون"), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11,
      marginTop: 5
    }
  }, "تسجيل دخول موحّد — د. عبدالستار صقر")), React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 8,
      marginBottom: 14
    }
  }, React.createElement("button", {
    onClick: () => choose("staff"),
    style: {
      background: mode === "staff" ? C.accent + "22" : C.card,
      border: "1px solid " + (mode === "staff" ? C.accent : C.border),
      borderRadius: 12,
      padding: "11px 8px",
      color: mode === "staff" ? C.accent : C.muted,
      fontWeight: 800,
      fontFamily: "inherit",
      cursor: "pointer"
    }
  }, "👨‍⚕️ الفريق"), React.createElement("button", {
    onClick: () => choose("patient"),
    style: {
      background: mode !== "staff" ? C.teal + "22" : C.card,
      border: "1px solid " + (mode !== "staff" ? C.teal : C.border),
      borderRadius: 12,
      padding: "11px 8px",
      color: mode !== "staff" ? C.teal : C.muted,
      fontWeight: 800,
      fontFamily: "inherit",
      cursor: "pointer"
    }
  }, "👤 المريض")), React.createElement("div", {
    style: {
      background: "linear-gradient(135deg," + C.card + "," + C.surface + ")",
      border: "1px solid " + C.border,
      borderRadius: 20,
      padding: "20px 18px",
      boxShadow: "0 20px 60px " + (_theme === "dark" ? "#0008" : "#1B2B4A22")
    }
  }, mode === "staff" ? React.createElement("form", {
    onSubmit: submit,
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 800,
      fontSize: 15,
      marginBottom: 2
    }
  }, "دخول الطبيب / السكرتارية"), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 11,
      marginTop: -4
    }
  }, "بالبريد الإلكتروني وكلمة المرور المسجّلين في Supabase"), React.createElement(Field, {
    label: "البريد الإلكتروني"
  }, React.createElement("input", {
    autoFocus: true,
    type: "email",
    autoComplete: "username",
    style: {
      ...inp(),
      background: C.bg2,
      direction: "ltr",
      textAlign: "left"
    },
    value: username,
    onChange: e => {
      setUsername(e.target.value);
      setError("");
    },
    placeholder: "admin@sakr.clinic"
  })), React.createElement(Field, {
    label: "كلمة المرور"
  }, React.createElement("div", {
    style: {
      position: "relative"
    }
  }, React.createElement("input", {
    style: {
      ...inp(),
      background: C.bg2,
      paddingLeft: 40,
      direction: "ltr",
      textAlign: "center"
    },
    type: showPass ? "text" : "password",
    value: password,
    onChange: e => {
      setPassword(e.target.value);
      setError("");
    },
    placeholder: "••••••••"
  }), React.createElement("span", {
    onClick: () => setShowPass(v => !v),
    style: {
      position: "absolute",
      left: 12,
      top: "50%",
      transform: "translateY(-50%)",
      cursor: "pointer",
      color: C.muted
    }
  }, showPass ? "🙈" : "👁"))), React.createElement("div", {
    onClick: () => setRemember(v => !v),
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      cursor: "pointer"
    }
  }, React.createElement("div", {
    style: {
      width: 18,
      height: 18,
      borderRadius: 5,
      background: remember ? C.accent : C.bg,
      border: "2px solid " + (remember ? C.accent : C.border),
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 11,
      color: C.bg,
      fontWeight: 700
    }
  }, remember ? "✓" : ""), React.createElement("span", {
    style: {
      color: C.muted,
      fontSize: 12
    }
  }, "تذكرني على هذا الجهاز")), error && React.createElement("div", {
    style: {
      background: C.danger + "22",
      border: "1px solid " + C.danger + "44",
      borderRadius: 10,
      padding: "9px 12px",
      color: C.danger,
      fontSize: 12,
      textAlign: "center"
    }
  }, error), React.createElement("button", {
    type: "submit",
    disabled: loading,
    style: {
      background: `linear-gradient(135deg,${C.accent},${C.teal})`,
      border: "none",
      borderRadius: 11,
      padding: 13,
      color: C.bg,
      fontWeight: 800,
      fontSize: 14,
      cursor: "pointer",
      fontFamily: "inherit",
      opacity: loading ? .7 : 1
    }
  }, loading ? "⏳ جاري التحقق..." : "تسجيل الدخول ←")) : PATIENT_FILE_LOGIN ? React.createElement("form", {
    onSubmit: submit,
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 800,
      fontSize: 15,
      marginBottom: 2
    }
  }, "دخول المريض"), React.createElement(Field, {
    label: "رقم الملف"
  }, React.createElement("input", {
    autoFocus: true,
    style: {
      ...inp(),
      background: C.bg2,
      direction: "ltr",
      textAlign: "center"
    },
    value: code,
    onChange: e => {
      setCode(e.target.value);
      setError("");
    },
    placeholder: "P-0001"
  })), React.createElement(Field, {
    label: "الاسم الكامل"
  }, React.createElement("input", {
    style: {
      ...inp(),
      background: C.bg2
    },
    value: name,
    onChange: e => {
      setName(e.target.value);
      setError("");
    },
    placeholder: "كما هو مسجل في الملف"
  })), error && React.createElement("div", {
    style: {
      background: C.danger + "22",
      border: "1px solid " + C.danger + "44",
      borderRadius: 10,
      padding: "9px 12px",
      color: C.danger,
      fontSize: 12,
      textAlign: "center"
    }
  }, error), React.createElement("button", {
    type: "submit",
    disabled: loading,
    style: {
      background: `linear-gradient(135deg,${C.teal},${C.accent})`,
      border: "none",
      borderRadius: 11,
      padding: 13,
      color: C.bg,
      fontWeight: 800,
      fontSize: 14,
      cursor: "pointer",
      fontFamily: "inherit",
      opacity: loading ? .7 : 1
    }
  }, loading ? "⏳ جاري التحقق..." : "دخول المريض ←"), React.createElement("button", {
    type: "button",
    onClick: () => {
      setMode("guest");
      setError("");
    },
    style: {
      background: "transparent",
      border: "1px solid " + C.border,
      borderRadius: 11,
      padding: 11,
      color: C.muted,
      fontWeight: 700,
      fontSize: 12,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, "🆕 مريض جديد — حجز بدون حساب")) : null, mode !== "staff" && React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, React.createElement("div", {
    style: {
      color: C.text,
      fontWeight: 800,
      fontSize: 15
    }
  }, "مريض جديد"), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 12,
      lineHeight: 1.7
    }
  }, "يمكنك حجز موعد دون تسجيل ملف مسبق. ستُطلب بياناتك أثناء الحجز."), React.createElement("button", {
    onClick: submit,
    disabled: loading,
    style: {
      background: `linear-gradient(135deg,${C.teal},${C.accent})`,
      border: "none",
      borderRadius: 11,
      padding: 13,
      color: C.bg,
      fontWeight: 800,
      fontSize: 14,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, "متابعة للحجز ←"), PATIENT_FILE_LOGIN && React.createElement("button", {
    onClick: () => choose("patient"),
    style: {
      background: "transparent",
      border: "1px solid " + C.border,
      borderRadius: 11,
      padding: 11,
      color: C.muted,
      fontWeight: 700,
      fontSize: 12,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, "رجوع لدخول المريض"))), React.createElement("div", {
    style: {
      textAlign: "center",
      color: "#40536b",
      fontSize: 10,
      marginTop: 14
    }
  }, "صلاحيات كل مستخدم تحدد الواجهة المتاحة له")));
}
const SESSION_TTL_REMEMBER = 30 * 24 * 3600 * 1000;
const SESSION_TTL_TEMP = 12 * 3600 * 1000;
const STAFF_ROLES = ["admin", "doctor", "secretary", "employee"];
function clearAllSessions() {
  ["iapp_unified_session", "iapp_session"].forEach(k => {
    try {
      localStorage.removeItem(k);
    } catch {}
    try {
      sessionStorage.removeItem(k);
    } catch {}
  });
}
function loadValidSession() {
  let s = null,
    store = null;
  try {
    const l = localStorage.getItem("iapp_unified_session");
    const t = sessionStorage.getItem("iapp_unified_session");
    if (l) {
      s = JSON.parse(l);
      store = localStorage;
    } else if (t) {
      s = JSON.parse(t);
      store = sessionStorage;
    }
  } catch {
    s = null;
  }
  if (!s) return null;
  if (!s.exp || Date.now() > s.exp) {
    clearAllSessions();
    return null;
  }
  if (s.kind === "staff") {
    const u = getUsers().find(x => x.id === s.id) || getUsers().find(x => emailKey(x.email) && emailKey(x.email) === emailKey(s.email));
    if (!u || !STAFF_ROLES.includes(u.role)) {
      clearAllSessions();
      return null;
    }
    const fresh = {
      ...s,
      ...publicUser(u),
      kind: "staff"
    };
    if (fresh.role !== s.role || fresh.name !== s.name || fresh.username !== s.username || fresh.mustChange !== s.mustChange) {
      try {
        store.setItem("iapp_unified_session", JSON.stringify(fresh));
        store.setItem("iapp_session", JSON.stringify({
          id: fresh.id,
          username: fresh.username,
          name: fresh.name,
          role: fresh.role
        }));
      } catch {}
    }
    return fresh;
  }
  if (s.kind === "patient" && s.patient) return s;
  clearAllSessions();
  return null;
}
function ForcePasswordChange({
  user,
  onDone,
  onLogout
}) {
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async e => {
    if (e && e.preventDefault) e.preventDefault();
    if (busy) return;
    if (p1.length < MIN_PW_LEN) {
      setErr("❌ كلمة المرور يجب ألا تقل عن " + MIN_PW_LEN + " أحرف");
      return;
    }
    if (p1 === DEFAULT_ADMIN_PW || p1.toLowerCase() === String(user.username).toLowerCase()) {
      setErr("❌ اختر كلمة مرور غير الافتراضية وغير اسم المستخدم");
      return;
    }
    if (p1 !== p2) {
      setErr("❌ كلمتا المرور غير متطابقتين");
      return;
    }
    setBusy(true);
    const pw = await hashPassword(p1);
    saveUsers(getUsers().map(u => {
      if (u.id !== user.id) return u;
      const {
        password: _x,
        ...r
      } = u;
      return {
        ...r,
        pw,
        mustChange: false
      };
    }));
    setBusy(false);
    onDone();
  };
  return React.createElement("div", {
    style: {
      minHeight: "100vh",
      background: C.bg,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      direction: "rtl",
      fontFamily: "'Segoe UI','Tahoma',Arial,sans-serif",
      padding: "24px 20px"
    }
  }, React.createElement("form", {
    onSubmit: save,
    style: {
      width: "100%",
      maxWidth: 380,
      background: C.card,
      border: "1px solid " + C.border,
      borderRadius: 20,
      padding: "22px 18px",
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, React.createElement("div", {
    style: {
      color: C.gold,
      fontWeight: 800,
      fontSize: 16
    }
  }, "🔒 تغيير كلمة المرور مطلوب"), React.createElement("div", {
    style: {
      color: C.muted,
      fontSize: 12,
      lineHeight: 1.8
    }
  }, "مرحباً ", user.name, ". الحساب يستخدم كلمة مرور افتراضية أو ضعيفة. اختر كلمة مرور جديدة قبل المتابعة لحماية بيانات المرضى."), React.createElement(Field, {
    label: "كلمة المرور الجديدة (" + MIN_PW_LEN + " أحرف على الأقل)"
  }, React.createElement("input", {
    autoFocus: true,
    type: "password",
    style: {
      ...inp(),
      direction: "ltr",
      textAlign: "center"
    },
    value: p1,
    onChange: e => {
      setP1(e.target.value);
      setErr("");
    }
  })), React.createElement(Field, {
    label: "تأكيد كلمة المرور"
  }, React.createElement("input", {
    type: "password",
    style: {
      ...inp(),
      direction: "ltr",
      textAlign: "center"
    },
    value: p2,
    onChange: e => {
      setP2(e.target.value);
      setErr("");
    }
  })), err && React.createElement("div", {
    style: {
      background: C.danger + "22",
      border: "1px solid " + C.danger + "44",
      borderRadius: 10,
      padding: "9px 12px",
      color: C.danger,
      fontSize: 12,
      textAlign: "center"
    }
  }, err), React.createElement("button", {
    type: "submit",
    disabled: busy,
    style: {
      background: `linear-gradient(135deg,${C.accent},${C.teal})`,
      border: "none",
      borderRadius: 11,
      padding: 13,
      color: C.bg,
      fontWeight: 800,
      fontSize: 14,
      cursor: "pointer",
      fontFamily: "inherit",
      opacity: busy ? .7 : 1
    }
  }, busy ? "⏳ جاري الحفظ..." : "حفظ والمتابعة"), React.createElement("button", {
    type: "button",
    onClick: onLogout,
    style: {
      background: "transparent",
      border: "1px solid " + C.border,
      borderRadius: 11,
      padding: 10,
      color: C.muted,
      fontSize: 12,
      cursor: "pointer",
      fontFamily: "inherit"
    }
  }, "تسجيل الخروج")));
}
function UnifiedRouter() {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState(null);
  useEffect(() => {
    (async () => {
      try {
        const auth = await sbSession();
        if (auth && auth.user && auth.user.email && emailKey(auth.user.email) !== emailKey(KIOSK_EMAIL)) {
          const prof = await resolveProfile(auth.user.email);
          if (prof.user) {
            const s = {
              kind: "staff",
              ...prof.user,
              exp: Date.now() + SESSION_TTL_REMEMBER
            };
            try {
              localStorage.setItem("iapp_unified_session", JSON.stringify(s));
              localStorage.setItem("iapp_session", JSON.stringify({
                id: s.id,
                username: s.username,
                name: s.name,
                role: s.role
              }));
            } catch {}
            CURRENT_USER = s;
            setSession(s);
            setReady(true);
            return;
          }
          await sbSignOut();
        }
        const local = loadValidSession();
        setSession(local && local.kind === "patient" ? local : null);
        if (!local || local.kind !== "patient") clearAllSessions();
      } catch (e) {
        console.warn("session check failed", e);
        setSession(null);
      }
      setReady(true);
    })();
  }, []);
  const logout = useCallback(() => {
    clearAllSessions();
    CURRENT_USER = null;
    sbSignOut();
    setSession(null);
  }, []);
  useEffect(() => {
    window.__iappUnifiedLogout = logout;
    return () => {
      try {
        delete window.__iappUnifiedLogout;
      } catch {}
    };
  }, [logout]);
  useEffect(() => {
    if (!ready || !session || session.kind !== "staff") return;
    const t = setTimeout(() => {
      maybeDailyBackup();
    }, 4000);
    return () => clearTimeout(t);
  }, [ready, session && session.id]);
  useEffect(() => {
    if (!ready) return undefined;
    const check = async () => {
      const auth = await sbSession();
      setSession(prev => {
        if (prev && prev.kind === "staff" && !auth) return null;
        const next = loadValidSession();
        if (!next) return prev && prev.kind === "staff" ? prev : null;
        return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
      });
    };
    const iv = setInterval(check, 60000);
    const onVis = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("storage", check);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("storage", check);
    };
  }, [ready]);
  const login = (payload, remember) => {
    if (payload.kind === "staff") {
      CURRENT_USER = publicUser(payload.user);
      logAudit("تسجيل دخول", payload.user.email || payload.user.username || "");
    }
    const store = remember ? localStorage : sessionStorage;
    const exp = Date.now() + (remember ? SESSION_TTL_REMEMBER : SESSION_TTL_TEMP);
    clearAllSessions();
    let s;
    if (payload.kind === "staff") {
      const u = publicUser(payload.user);
      s = {
        kind: "staff",
        ...u,
        exp
      };
      try {
        store.setItem("iapp_session", JSON.stringify({
          id: u.id,
          username: u.username,
          name: u.name,
          role: u.role
        }));
      } catch {}
    } else {
      s = {
        kind: "patient",
        patient: payload.patient,
        exp
      };
    }
    try {
      store.setItem("iapp_unified_session", JSON.stringify(s));
    } catch {}
    setSession(s);
  };
  const invalidRole = !!session && session.kind === "staff" && !STAFF_ROLES.includes(session.role);
  useEffect(() => {
    if (invalidRole) logout();
  }, [invalidRole, logout]);
  if (!ready) return React.createElement("div", {
    style: {
      minHeight: "100vh",
      background: C.bg,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: C.muted,
      fontFamily: "'Segoe UI','Tahoma',Arial,sans-serif"
    }
  }, "⏳");
  if (!session) return React.createElement(UnifiedLogin, {
    onLogin: login
  });
  CURRENT_USER = session.kind === "staff" ? session : null;
  if (session.kind === "patient") return React.createElement(PatientApp, {
    patient: session.patient,
    onLogout: logout
  });
  if (invalidRole) return null;
  if (session.mustChange && !session.email) return React.createElement(ForcePasswordChange, {
    user: session,
    onLogout: logout,
    onDone: () => setSession(loadValidSession())
  });
  if (session.role === "secretary" || session.role === "employee") return React.createElement(SecretaryApp, {
    key: "sec-" + session.id + "-" + session.role
  });
  return React.createElement(App, {
    key: "doc-" + session.id + "-" + session.role
  });
}
class UnifiedErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      error: null
    };
  }
  static getDerivedStateFromError(e) {
    return {
      error: e
    };
  }
  componentDidCatch(e, info) {
    console.error("I App render error:", e, info);
  }
  render() {
    if (this.state.error) return React.createElement("div", {
      style: {
        position: "fixed",
        inset: 0,
        background: C.bg,
        color: C.danger,
        fontFamily: "monospace",
        fontSize: 12,
        padding: 24,
        overflow: "auto",
        direction: "ltr",
        whiteSpace: "pre-wrap"
      }
    }, "⚠ I App — Render Error:\\n\\n", this.state.error.message, "\\n\\n", this.state.error.stack || "");
    return this.props.children;
  }
}
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(ThemeRoot, null));
