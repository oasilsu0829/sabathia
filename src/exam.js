// 시험대비 API (/api/exam) — /exam/ 앱이 기기 사이에 계획·오답을 맞춘다.
// 문서 하나를 D1 settings 테이블의 k = 'exam' 한 줄에 둔다. 합치기는 화면과 같은 코드(public/exam/merge.js).
import '../public/exam/merge.js';
import { json, httpError, readBody } from './util.js';

const { clean, merge } = globalThis.ExamMerge;
const MAX_BYTES = 500000;

async function load(env) {
  const row = await env.DB.prepare("SELECT v FROM settings WHERE k = 'exam'").first();
  let doc = null;
  try { doc = row ? JSON.parse(row.v) : null; } catch {}
  return clean(doc);
}

export async function examApi(req, env, path) {
  try {
    const m = req.method;
    if (path === '/api/exam' && m === 'GET') return json({ doc: await load(env) });

    // 기기가 가진 문서를 보내면 서버 것과 합쳐 저장하고, 합친 문서를 돌려준다
    if (path === '/api/exam/sync' && m === 'POST') {
      const body = await readBody(req);
      if (!body || typeof body.doc !== 'object' || !body.doc) throw httpError(400, 'doc이 필요합니다');
      const now = Date.now();
      const next = merge(clean(await load(env), now), clean(body.doc, now));
      const text = JSON.stringify(next);
      if (text.length > MAX_BYTES) throw httpError(413, '시험대비 기록이 너무 큽니다. 끝낸 오답을 지워 주세요');
      await env.DB.prepare("INSERT INTO settings (k, v) VALUES ('exam', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(text).run();
      return json({ doc: next });
    }
    throw httpError(404, '없는 주소입니다');
  } catch (err) {
    return json({ error: err.message || String(err) }, err.status || 400);
  }
}
