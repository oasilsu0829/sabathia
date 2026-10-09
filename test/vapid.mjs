import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { sendPush, b64u } from '../src/webpush.js';

const env = Object.fromEntries(fs.readFileSync('.dev.vars', 'utf8').trim().split('\n')
  .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const ua = crypto.createECDH('prime256v1'); ua.generateKeys();

const srv = http.createServer((req, res) => {
  const [, t, k] = req.headers.authorization.match(/t=([^,]+), k=(.+)/);
  const [h, c, s] = t.split('.');
  const raw = b64u.dec(k);
  const pub = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u.enc(raw.slice(1, 33)), y: b64u.enc(raw.slice(33)) }, format: 'jwk' });
  const ok = crypto.verify('sha256', Buffer.from(`${h}.${c}`), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(b64u.dec(s)));
  console.log('JWT valid:', ok, JSON.parse(Buffer.from(c, 'base64url')).aud);
  res.writeHead(201).end(); srv.close();
}).listen(9999, async () => {
  console.log('status', await sendPush({ endpoint: 'http://localhost:9999/x', p256dh: b64u.enc(ua.getPublicKey()), auth: b64u.enc(crypto.randomBytes(16)) }, { title: 't' }, env));
});
