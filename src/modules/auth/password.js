// Password hashing for ForcePasswordChange (Phase 8, final batch). Exact
// copy of the legacy runtime's hashPassword and its private PBKDF2-SHA256
// helpers (public/legacy/app-runtime.js). Uses WebCrypto's SubtleCrypto when
// available and falls back to a pure-JS implementation otherwise -- same
// choice, same iteration count, same output shape as legacy.
//
// Not ported: verifyPassword and migrateUsers, the only other consumers of
// this cryptography in legacy, had zero remaining callers there (confirmed
// by exhaustive grep) -- Supabase Auth has owned sign-in since long before
// this batch. Porting unreachable code would just be new dead code here.

export const PW_ITER = 30000;
export const DEFAULT_ADMIN_PW = 'admin123';

const _SHA_K = (() => {
  const k = [];
  let n = 2;
  while (k.length < 64) {
    let p = true;
    for (let i = 2; i * i <= n; i++) if (n % i === 0) { p = false; break; }
    if (p) k.push((Math.cbrt(n) % 1 * 4294967296) >>> 0);
    n++;
  }
  return k;
})();
const _SHA_H0 = (() => {
  const h = [];
  let n = 2;
  while (h.length < 8) {
    let p = true;
    for (let i = 2; i * i <= n; i++) if (n % i === 0) { p = false; break; }
    if (p) h.push((Math.sqrt(n) % 1 * 4294967296) >>> 0);
    n++;
  }
  return h;
})();

function _sha256(bytes) {
  const l = bytes.length, bitLen = l * 8;
  const total = ((l + 9 + 63) >> 6) << 6;
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
      const a = W[i - 15], b = W[i - 2];
      const s0 = (a >>> 7 | a << 25) ^ (a >>> 18 | a << 14) ^ (a >>> 3);
      const s1 = (b >>> 17 | b << 15) ^ (b >>> 19 | b << 13) ^ (b >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = (e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^ (e >>> 25 | e << 7);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + _SHA_K[i] + W[i]) >>> 0;
      const S0 = (a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^ (a >>> 22 | a << 10);
      const mj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + mj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
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
  const ipad = k.map(x => x ^ 0x36), opad = k.map(x => x ^ 0x5c);
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

async function _pbkdf2(pw, salt, iter) {
  const pwBytes = new TextEncoder().encode(pw);
  try {
    const subtle = window.crypto && window.crypto.subtle;
    if (subtle) {
      const key = await subtle.importKey('raw', pwBytes, 'PBKDF2', false, ['deriveBits']);
      const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256);
      return new Uint8Array(bits);
    }
  } catch (e) {
    console.warn('WebCrypto PBKDF2 unavailable, using JS fallback');
  }
  await new Promise(r => setTimeout(r, 0));
  return _pbkdf2JS(pwBytes, salt, iter);
}

export async function hashPassword(pw) {
  const salt = new Uint8Array(16);
  window.crypto.getRandomValues(salt);
  const hash = await _pbkdf2(pw, salt, PW_ITER);
  return { algo: 'pbkdf2-sha256', iter: PW_ITER, salt: _b64(salt), hash: _b64(hash) };
}
