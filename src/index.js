import { eventsApi } from './events.js';
import { notifyApi, tick } from './notify.js';
import { projectsApi } from './projects.js';
import { json, authorized, ensureTables } from './util.js';

export default {
  async fetch(req, env) {
    const path = new URL(req.url).pathname;
    if (!path.startsWith('/api/')) return env.ASSETS.fetch(req);

    // 푸시 공개 키는 누구나 읽어도 된다(구독할 때 브라우저가 쓴다)
    if (path === '/api/vapid') return json({ key: env.VAPID_PUBLIC || '' });

    // 그 밖의 /api/* 는 Worker에 API_TOKEN 비밀값이 있으면 Bearer 토큰이 필요하다
    if (!authorized(req, env)) return json({ error: '토큰이 맞지 않습니다' }, 401);
    try {
      await ensureTables(env);
    } catch (err) {
      return json({ error: err.message || String(err) }, 500);
    }
    if (path === '/api/events' || path.startsWith('/api/events/')) return eventsApi(req, env, path);
    if (path === '/api/projects' || path.startsWith('/api/projects/')) return projectsApi(req, env, path);
    return notifyApi(req, env, path);
  },

  // 1분마다 실행: 일정 시작 전 알림, 아침 요약, 전날 저녁 마감 알림, 반복 알림, 한 번짜리 리마인더
  async scheduled(_event, env) {
    await tick(env);
  },
};
