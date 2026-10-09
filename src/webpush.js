// Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID) — WebCrypto only, 외부 라이브러리 없음
const te = new TextEncoder();

export const b64u = {
  enc(buf) {
    const b = new Uint8Array(buf);
    let s = '';
    for (const c of b) s += String.fromCharCode(c);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  dec(str) {
    const s = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
    return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  },
};

const concat = (...arrs) => {
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let i = 0;
  for (const a of arrs) { out.set(a, i); i += a.length; }
  return out;
};

async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

// VAPID JWT (ES256)
async function vapidAuth(endpoint, pub, privJwk, subject) {
  const aud = new URL(endpoint).origin;
  const header = b64u.enc(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u.enc(te.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const key = await crypto.subtle.importKey('jwk', privJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${b64u.enc(sig)}, k=${pub}`;
}

// 페이로드 암호화 (aes128gcm)
export async function encrypt(payload, p256dh, auth) {
  const uaPub = b64u.dec(p256dh);
  const authSecret = b64u.dec(auth);

  const as = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));

  const prkKey = await hmac(authSecret, ecdh);
  const ikm = await hmac(prkKey, concat(te.encode('WebPush: info\0'), uaPub, asPub, new Uint8Array([1])));

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(te.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(te.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);

  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const plain = concat(te.encode(payload), new Uint8Array([2]));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, plain));

  const rs = new Uint8Array([0, 0, 16, 0]); // 4096
  return concat(salt, rs, new Uint8Array([asPub.length]), asPub, cipher);
}

// sub: { endpoint, p256dh, auth }  →  Response status
export async function sendPush(sub, data, env) {
  const body = await encrypt(JSON.stringify(data), sub.p256dh, sub.auth);
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuth(sub.endpoint, env.VAPID_PUBLIC, JSON.parse(env.VAPID_PRIVATE_JWK), env.VAPID_SUBJECT || 'mailto:admin@example.com'),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'high',
    },
    body,
  });
  return res.status;
}
