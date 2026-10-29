/* Sabathia 홈의 "오늘 하루" 데이터. 앱마다 흩어진 오늘을 한 줄로 모은다.
   - 15577: 앱이 남긴 보고(sabathia.status.plan: 블록 위치·상태, 수업, D-day). 오늘 보고가 없으면 저장된 기록에서 어림
   - 일정: /api/events (연결이 안 되면 일정 앱이 남긴 캐시 sab.cache)
   - 어원 단어: 앱이 남긴 보고(sabathia.status.vocab: 오늘 남은 단어, 영어 시험)
   시각은 모두 자정부터 센 분. 하루 줄은 06:00–24:00 */
(() => {
  'use strict';
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const json = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const parseDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const diffDays = (a, b) => Math.round((parseDay(a) - parseDay(b)) / 864e5);
  const toMin = (hm) => { if (!hm) return null; const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
  const fmt = (m) => pad(Math.floor(m / 60) % 24) + ':' + pad(m % 60);
  const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

  /* ---------- 일정 (서버) ---------- */
  let evCache = null, evAt = 0;
  async function events() {
    if (evCache && Date.now() - evAt < 30000) return evCache;
    const t = new Date();
    const from = ymd(new Date(t.getTime() - 60 * 864e5)), to = ymd(new Date(t.getTime() + 30 * 864e5));
    const base = (json('sab.base') || location.origin).replace(/\/+$/, '');
    const token = json('sab.token') || '';
    let list = null;
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 5000);
      const r = await fetch(`${base}/api/events?from=${from}&to=${to}`, {
        headers: token ? { authorization: 'Bearer ' + token } : {}, cache: 'no-store', signal: ctl.signal,
      });
      clearTimeout(timer);
      if (r.ok) list = (await r.json()).events;
    } catch {}
    if (!list) { const c = json('sab.cache'); list = c && Array.isArray(c.events) ? c.events : []; }
    evCache = list; evAt = Date.now();
    return list;
  }

  /* ---------- 15577 ---------- */
  function plan(t) {
    const r = Sabathia.read('plan');
    if (r && Array.isArray(r.blocks)) return { blocks: r.blocks, fixed: r.fixed || [], dday: r.dday || null };
    // 오늘 15577을 아직 안 열었으면 저장된 기록으로 어림 (수업과 겹칠 때 밀리는 것은 반영하지 않는다)
    const s = json('blockplanner.v1') || {};
    const now = nowMin();
    const blocks = ((s.days && s.days[t]) || []).filter((b) => b.start != null).map((b) => {
      const d = b.review || b.lecture ? b.dur : (b.est || b.dur);
      const e = b.start + (d || 30);
      return { s: b.start, e, t: b.title || '블록', st: b.done ? 'done' : b.runningSince ? 'run' : e <= now ? 'late' : 'wait' };
    });
    const wd = parseDay(t).getDay(), off = (s.schoolOff || []).includes(t);
    const fixed = (s.fixed || []).filter((f) => (f.days || []).includes(wd) && (!f.only || f.only === t)
      && (!f.from || t >= f.from) && (!f.until || t <= f.until) && !(f.skip || []).includes(t) && !(off && f.school))
      .map((f) => ({ s: f.start, e: f.start + f.dur, t: f.school ? `${f.period}교시 ${f.title}` : f.title, meal: !!f.meal, school: !!f.school }));
    return { blocks, fixed, dday: s.dday && s.dday.date ? s.dday : null };
  }

  /* ---------- 어원 단어 ---------- */
  function vocab() {
    const r = Sabathia.read('vocab');
    if (r) return r;
    const s = json('eowon.vocab.v1');
    const e = s && s.set && s.set.exam;
    return { exam: e && e.on && e.date ? { title: '영어 시험', date: e.date, note: '' } : null };
  }

  /* ---------- 모으기 ---------- */
  async function load() {
    const t = ymd(new Date()), now = nowMin();
    const [evs, p, v] = [await events(), plan(t), vocab()];

    // 수업·고정 일정 (식사 제외)
    const fixed = p.fixed.filter((f) => !f.meal).map((f) => ({
      ...f, src: '수업', st: f.e <= now ? 'past' : f.s <= now ? 'now' : 'wait',
    }));

    // 15577 블록: 시간 안에 들어온 블록은 "지금"
    const blocks = p.blocks.map((b) => {
      let st = { done: 'done', run: 'now', late: 'late', next: 'next', wait: 'wait' }[b.st] || 'wait';
      if ((st === 'next' || st === 'wait') && b.s <= now && now < b.e) st = 'now';
      return { s: b.s, e: b.e, t: b.t, src: '15577', st };
    });

    // 일정: 오늘 시각이 있는 것만 줄에 올린다
    const todayEv = evs.filter((e) => e.date === t);
    const timed = todayEv.filter((e) => e.time).map((e) => {
      const s = toMin(e.time), e2 = e.end ? toMin(e.end) : null;
      let st;
      if (e.done) st = 'done';
      else if (e.kind === 'event') st = (e2 ?? s + 1) <= now ? 'past' : s <= now ? 'now' : 'wait';
      else st = s < now ? 'due' : 'wait';
      return { s, e: e2, t: e.title, src: '일정', st, kind: e.kind, mark: !e2 };
    }).sort((a, b) => a.s - b.s);

    // 다음: 지금 이후 가장 먼저 시작하는 것 (끝난 것·완료 제외)
    const all = [...blocks, ...timed, ...fixed];
    const upcoming = all.filter((x) => x.s > now && x.st !== 'done' && x.st !== 'past').sort((a, b) => a.s - b.s);
    const next = upcoming[0] || null;
    if (next) next.st = next.st === 'wait' ? 'next' : next.st;
    const cur = blocks.find((x) => x.st === 'now') || timed.find((x) => x.st === 'now') || fixed.find((x) => x.st === 'now') || null;

    // 지연: 15577의 오늘 끝난 미완료 블록 + 일정의 날짜 지난 할 일·마감
    const late = [
      ...evs.filter((e) => e.kind !== 'event' && !e.done && e.date < t)
        .map((e) => ({ t: e.title, src: '일정', time: `−${diffDays(t, e.date)}D`, days: diffDays(t, e.date) }))
        .sort((a, b) => b.days - a.days),
      ...blocks.filter((b) => b.st === 'late').map((b) => ({ t: b.t, src: '15577', time: '~' + fmt(b.e), days: 0 })),
    ];

    // 오늘 할 일 (지연 → 다음 → 대기 → 완료)
    const RANK = { late: 0, next: 1, now: 1, wait: 2, done: 3 };
    const todo = [
      ...late.map((l) => ({ st: 'late', time: l.days ? l.time : '오늘', t: l.t, meta: l.src })),
      ...todayEv.filter((e) => e.kind !== 'event').map((e) => ({ st: e.done ? 'done' : 'wait', time: e.time || '—', t: e.title, meta: e.kind === 'deadline' ? '일정 · 마감' : '일정', s: toMin(e.time) ?? 9999 })),
      ...blocks.filter((b) => b.st !== 'late').map((b) => ({ st: b.st === 'done' ? 'done' : b.st === 'now' ? 'now' : 'wait', time: fmt(b.s), t: b.t, meta: '15577', s: b.s })),
    ];
    if (v && v.total > v.done) todo.push({ st: 'wait', time: '—', t: `어원 단어 ${v.total - v.done}개`, meta: '어원 단어', s: 9998 });
    const waiting = todo.filter((r) => r.st === 'wait').sort((a, b) => a.s - b.s);
    const nx = waiting.find((r) => r.s >= now && r.s < 9998) || waiting[0];
    if (nx && !todo.some((r) => r.st === 'now')) nx.st = 'next';
    todo.sort((a, b) => RANK[a.st] - RANK[b.st] || (a.s ?? 0) - (b.s ?? 0));
    const doneN = todo.filter((r) => r.st === 'done').length;

    // 다가올 일정 (내일부터 30일)
    const ahead = evs.filter((e) => e.date > t && !e.done).sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''))
      .slice(0, 3).map((e) => ({ date: e.date, t: e.title, time: e.time || '', kind: e.kind }));

    // D-day: 15577의 D-day와 어원 단어의 영어 시험 중 가까운 것
    const dds = [];
    if (p.dday && p.dday.date >= t) dds.push({ title: p.dday.title || 'D-day', date: p.dday.date, note: '' });
    if (v && v.exam && v.exam.date >= t) dds.push(v.exam);
    dds.sort((a, b) => a.date.localeCompare(b.date));
    const dday = dds[0] ? { ...dds[0], left: diffDays(dds[0].date, t) } : null;

    return {
      date: t, now, fmt,
      lanes: [
        { name: '수업', items: fixed },
        { name: '15577', items: blocks, late: blocks.filter((b) => b.st === 'late').length },
        { name: '일정', items: timed },
      ],
      cur, next, late, todo, doneN, ahead, dday,
    };
  }

  window.SabathiaToday = { load, events, fmt };
})();
