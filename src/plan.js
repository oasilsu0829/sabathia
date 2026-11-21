// Planner 2.0 API (/api/plan) — 판단 WS 플래너가 기기 사이에 작업·Big 3·수정안·블록 연결을 맞춘다.
// 문서 하나를 D1 settings 테이블의 k = 'plan' 한 줄에 둔다. 합치기는 화면과 같은 코드(public/decide/tb/merge.js). 15577 블록 자체는 15577 온라인 저장이 맡는다.
import '../public/decide/tb/merge.js';
import { json, httpError, readBody } from './util.js';

const { clean, merge } = globalThis.PlanMerge;
const MAX_BYTES = 500000;

async function load(env) {
  const row = await env.DB.prepare("SELECT v FROM settings WHERE k = 'plan'").first();
  let doc = null;
  try { doc = row ? JSON.parse(row.v) : null; } catch {}
  return clean(doc);
}

export async function planApi(req, env, path) {
  try {
    const m = req.method;
    if (path === '/api/plan' && m === 'GET') return json({ doc: await load(env) });

    // 기기가 가진 문서를 보내면 서버 것과 합쳐 저장하고, 합친 문서를 돌려준다
    if (path === '/api/plan/sync' && m === 'POST') {
      const body = await readBody(req);
      if (!body || typeof body.doc !== 'object' || !body.doc) throw httpError(400, 'doc이 필요합니다');
      const now = Date.now();
      const next = merge(clean(await load(env), now), clean(body.doc, now));
      const text = JSON.stringify(next);
      if (text.length > MAX_BYTES) throw httpError(413, '플래너 기록이 너무 큽니다');
      await env.DB.prepare("INSERT INTO settings (k, v) VALUES ('plan', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(text).run();
      return json({ doc: next });
    }
    throw httpError(404, '없는 주소입니다');
  } catch (err) {
    return json({ error: err.message || String(err) }, err.status || 400);
  }
}
