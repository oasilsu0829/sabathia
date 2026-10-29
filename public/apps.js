/* Sabathia 앱 목록. 새 앱은 public/<폴더>/ 에 올리고 여기에 한 항목을 더한다.
   code   분류-번호 (디자인 언어 8장)
   dock   홈 맨 아래 독에 둘 때의 짧은 이름. 없으면 독에 넣지 않는다 (독은 앱 3개 + 폰 앱)
   color  홈 아이콘에만 쓰는 고유색 [라이트, 투사]. 앱 화면 안은 바하마 블루·빨강 규칙 그대로
   status 홈 아이콘의 진행률·배지. { pct, badge, meta } 를 돌려준다(Promise 가능).
          null 이면 진행률이 없는 도구라 모양 전체를 고유색으로 채운다
   앱 화면은 Sabathia.report('<id>', {...}) 로 상태를 남기고, 여기서 Sabathia.read('<id>') 로 읽는다 */
(() => {
  'use strict';
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const json = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

  // 15577: 앱이 남긴 보고(끝나지 않은 블록의 끝 시각 포함)로 지연을 센다. 오늘 보고가 없으면 저장된 기록에서 진행률만 계산
  function plan() {
    const r = Sabathia.read('plan');
    if (r) {
      const late = (r.ends || []).filter((e) => e <= nowMin()).length;
      return { pct: r.pct || 0, badge: late, meta: r.n ? `${r.doneN} / ${r.n} 블록` : '블록 없음' };
    }
    const s = json('blockplanner.v1');
    const items = (s && s.days && s.days[ymd(new Date())]) || [];
    let P = 0, D = 0, doneN = 0;
    for (const b of items) {
      const p = b.review || b.lecture ? b.dur : (b.est || b.dur);
      const g = b.done ? 1 : Math.max(0, Math.min(1, b.progress || 0));
      P += p || 0; D += (p || 0) * g; if (b.done) doneN++;
    }
    return { pct: P ? D / P * 100 : 0, badge: 0, meta: items.length ? `${doneN} / ${items.length} 블록` : '블록 없음' };
  }

  // 어원 단어: 오늘 할 단어(복습 + 새 단어) 중 끝낸 비율
  function vocab() {
    const r = Sabathia.read('vocab');
    if (!r) return { pct: 0, badge: 0, meta: '오늘 단어' };
    return { pct: r.pct || 0, badge: 0, meta: r.total ? `${r.done} / ${r.total} 단어` : '오늘 끝' };
  }

  // 일정: 서버(/api/events)에서 오늘 할 일과 지난 미완료를 센다. 연결이 안 되면 일정 앱이 남긴 캐시로
  async function cal() {
    const t = ymd(new Date());
    const events = await SabathiaToday.events();
    const tasks = events.filter((e) => e.kind === 'task' && e.date === t);
    const doneN = tasks.filter((e) => e.done).length;
    const late = events.filter((e) => e.kind !== 'event' && !e.done && e.date < t).length;
    return { pct: tasks.length ? doneN / tasks.length * 100 : 0, badge: late, meta: tasks.length ? `${doneN} / ${tasks.length} 할 일` : '할 일 없음' };
  }

  window.SABATHIA_APPS = [
    { id: 'plan', code: 'PLN-01', name: '15577', dock: '15577', href: '/plan/', color: ['#a35a00', '#f2a33a'], status: plan },
    { id: 'vocab', code: 'VOC-02', name: '어원 단어', dock: '단어', href: '/vocab/', color: ['#5b3fc0', '#a99bff'], status: vocab },
    { id: 'cal', code: 'CAL-03', name: '일정', dock: '일정', href: '/schedule/', color: ['#026395', '#4fb3e0'], status: cal },
    { id: 'pdf', code: 'PDF-04', name: '사진 PDF', href: '/pdf/', color: ['#1f7a4d', '#5fd39a'], status: null },
  ];
})();
