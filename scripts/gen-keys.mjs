// VAPID 키 + 앱 토큰 생성
import { webcrypto as c } from 'node:crypto';
const b64u = (b) => Buffer.from(b).toString('base64url');
const kp = await c.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const pub = b64u(await c.subtle.exportKey('raw', kp.publicKey));
const { kty, crv, x, y, d } = await c.subtle.exportKey('jwk', kp.privateKey);
console.log('VAPID_PUBLIC=' + pub);
console.log('VAPID_PRIVATE_JWK=' + JSON.stringify({ kty, crv, x, y, d }));
console.log('APP_TOKEN=' + b64u(c.getRandomValues(new Uint8Array(24))));
