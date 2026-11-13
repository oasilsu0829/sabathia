// 음악 API 검증(계정별 크레이트 · 잼 손님 대기열): node test/music-api.mjs
// D1은 node:sqlite로, Spotify /me는 가짜 fetch로 흉내 낸다
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { musicApi } from '../src/music.js';
import { ensureTables } from '../src/util.js';

const db = new DatabaseSync(':memory:');
const stmt = (sql, args = []) => ({
  bind: (...a) => stmt(sql, a),
  first: async () => db.prepare(sql).get(...args) ?? null,
  all: async () => ({ results: db.prepare(sql).all(...args) }),
  run: async () => db.prepare(sql).run(...args),
});
const env = { DB: { prepare: (sql) => stmt(sql), batch: async (L) => { for (const s of L) await s.run(); } } };
await ensureTables(env);

const USERS = { 'tok-me': { id: 'me', display_name: '나' }, 'tok-fr': { id: 'friend', display_name: '친구' } };
globalThis.fetch = async (url, opt) => {
  assert.equal(String(url), 'https://api.spotify.com/v1/me');
  const u = USERS[(opt.headers.Authorization || '').slice(7)];
  return u ? new Response(JSON.stringify(u)) : new Response('{}', { status: 401 });
};
const call = async (method, path, body, tk) => {
  const h = { 'Content-Type': 'application/json' }; if (tk) h['X-Spotify'] = tk;
  const r = await musicApi(new Request('https://x' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), env, path.split('?')[0]);
  return { status: r.status, j: await r.json() };
};
const A = (id, name) => ({ id, name, artist: 'x', n: 10 });
const doc = (crates) => ({ v: 1, crates });

// 예전(공유) 문서
db.prepare("INSERT INTO settings (k, v) VALUES ('music', ?)").run(JSON.stringify(doc({ 'c-main': { id: 'c-main', name: '내 크레이트', u: 5, albums: [A('4aawyAB9vmqN3uQ7FjRGTy', 'old')] } })));

// 로그인 없으면 동기화 안 됨
assert.equal((await call('POST', '/api/music/sync', { doc: doc({}) })).status, 401);
// 처음 동기화한 계정(나)이 예전 문서를 가져간다
let r = await call('POST', '/api/music/sync', { doc: doc({}) }, 'tok-me');
assert.equal(r.status, 200); assert.equal(r.j.claimed, true); assert.equal(r.j.doc.crates['c-main'].albums.length, 1);
// 친구는 빈 문서에서 시작하고, 친구가 담은 것은 내 문서에 안 섞인다
r = await call('POST', '/api/music/sync', { doc: doc({ 'c-f': { id: 'c-f', name: '친구', u: 9, albums: [A('1A2GTWGtFfWp7KSQTwWOyo', 'f')] } }) }, 'tok-fr');
assert.equal(r.j.claimed, false); assert.ok(!r.j.doc.crates['c-main']); assert.ok(r.j.doc.crates['c-f']);
r = await call('POST', '/api/music/sync', { doc: doc({}) }, 'tok-me');
assert.ok(!r.j.doc.crates['c-f']); assert.equal(r.j.claimed, false);
assert.equal((await call('POST', '/api/music/sync', { doc: doc({}) }, 'bad')).status, 401);

// 잼: 열린 잼 없음 → 손님 넣기 거절
assert.equal((await call('GET', '/api/music/jam')).j.jam, null);
assert.equal((await call('POST', '/api/music/jam/add', { pid: 'abcdefghij12', q: 'x' })).status, 409);
// 호스트(나)가 잼을 연다
assert.equal((await call('PUT', '/api/music/jam', { pid: 'abcdefghij12', name: 'JAM 11.13', list: [{ t: 'A', a: 'B' }], cur: 0 }, 'tok-me')).status, 200);
let g = (await call('GET', '/api/music/jam')).j.jam;
assert.equal(g.host, '나'); assert.equal(g.list.length, 1); assert.ok(!('hostId' in g));
// 손님(로그인 없음): 이름으로, 링크로
assert.equal((await call('POST', '/api/music/jam/add', { pid: 'abcdefghij12', q: '밤양갱 비비', by: '민수' })).status, 200);
assert.equal((await call('POST', '/api/music/jam/add', { pid: 'abcdefghij12', uris: ['spotify:track:4uLU6hMCjMI75M1A2tKUQC', 'evil'], label: 'L' })).status, 200);
assert.equal((await call('POST', '/api/music/jam/add', { pid: 'abcdefghij12', uris: ['evil'] })).status, 400);
g = (await call('GET', '/api/music/jam')).j.jam;
assert.deepEqual(g.wait.map((x) => x.by), ['민수', '손님']);
// 대기열은 호스트만 가져간다
assert.deepEqual((await call('GET', '/api/music/jam/q', null, 'tok-fr')).j.items, []);
const q = (await call('GET', '/api/music/jam/q', null, 'tok-me')).j.items;
assert.equal(q.length, 2); assert.equal(q[0].q, '밤양갱 비비'); assert.deepEqual(q[1].uris, ['spotify:track:4uLU6hMCjMI75M1A2tKUQC']);
await call('POST', '/api/music/jam/done', { ids: [q[0].id] }, 'tok-fr'); // 남은 못 지운다
assert.equal((await call('GET', '/api/music/jam/q', null, 'tok-me')).j.items.length, 2);
await call('POST', '/api/music/jam/done', { ids: q.map((x) => x.id) }, 'tok-me');
assert.equal((await call('GET', '/api/music/jam')).j.jam.wait.length, 0);
// 끝: 남이 끄면 안 꺼지고, 호스트가 끄면 꺼진다
await call('DELETE', '/api/music/jam?pid=abcdefghij12', null, 'tok-fr');
assert.ok((await call('GET', '/api/music/jam')).j.jam);
await call('DELETE', '/api/music/jam?pid=abcdefghij12', null, 'tok-me');
assert.equal((await call('GET', '/api/music/jam')).j.jam, null);
console.log('music api ok');
