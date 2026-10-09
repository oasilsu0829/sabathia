import { encrypt, b64u } from '../src/webpush.js';
import ece from 'http_ece';
import crypto from 'node:crypto';
const ua = crypto.createECDH('prime256v1'); ua.generateKeys();
const auth = crypto.randomBytes(16);
const body = await encrypt('{"title":"hi 안녕"}', b64u.enc(ua.getPublicKey()), b64u.enc(auth));
const out = ece.decrypt(Buffer.from(body), { version: 'aes128gcm', privateKey: ua, authSecret: auth });
console.log('decrypted:', out.toString());
