// 플래너 데이터 해석: 시간 블록 → 예상 소요 시간, 제목 → 과목/종류, 텍스트 붙여넣기 파서,
// 외부(기존 플래너) JSON 어댑터.
import { parseHM, addDays, toDateStr } from './time.js';

const SUBJECT_WORDS = {
  math: ['수학', '수1', '수2', '수상', '수하', '미적', '기하', '확통', '쎈', '블랙라벨', 'math'],
  korean: ['국어', '문학', '독서', '비문학', '언매', '화작', '문법', 'korean'],
  english: ['영어', '영단어', '단어', 'voca', '보카', '리딩', '듣기', '영문법', 'english'],
  science: ['과학', '물리', '화학', '생명', '생물', '지구과학', '통과', 'science'],
};

const KIND_WORDS = [
  ['performance', ['수행']],
  ['homework', ['숙제', '과제', 'hw']],
  ['review', ['복습', '오답', '정리노트', '개념정리']],
  ['exam_prep', ['시험', '기출', '내신', '모의고사', '시험공부']],
  ['project', ['프로젝트', '개발', '제작', '아티팩트', '앱', 'project']],
];

export function detectSubject(title = '') {
  const t = title.toLowerCase();
  for (const [key, words] of Object.entries(SUBJECT_WORDS)) {
    if (words.some((w) => t.includes(w))) return key;
  }
  return 'other';
}

export function detectKind(title = '', subject = detectSubject(title)) {
  const t = title.toLowerCase();
  for (const [kind, words] of KIND_WORDS) {
    if (words.some((w) => t.includes(w))) return kind;
  }
  // 집 공부의 대부분이 학원 숙제이므로, 과목이 보이면 숙제로 본다.
  return subject !== 'other' ? 'homework' : 'other';
}

/** 시간 블록 길이(분). 블록이 자정을 넘어가면 다음 날로 계산한다. */
export function blockMinutes(start, end) {
  const s = parseHM(start);
  let e = parseHM(end);
  if (s == null || e == null) return null;
  if (e <= s) e += 1440;
  return e - s;
}

/** 플래너 블록의 시간 = 사용자의 예상 완료 소요 시간 */
export function estimateOf(task) {
  const fromBlock = blockMinutes(task.start, task.end);
  if (fromBlock != null) return fromBlock;
  return Number(task.estimateMin) || 0;
}

/** 남은 필요 시간. 완료면 0. 진행 중이어도 경과 시간을 임의로 빼지 않는다. */
export function remainingOf(task) {
  if (task.status === 'done') return 0;
  if (task.remainingMin != null && task.remainingMin !== '') return Math.max(0, Number(task.remainingMin));
  return estimateOf(task);
}

let seq = 0;
export function uid(prefix = 't') {
  seq = (seq + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}${seq}`;
}

export function makeTask(partial) {
  const title = (partial.title ?? '').trim();
  const subject = partial.subject ?? detectSubject(title);
  const kind = partial.kind ?? detectKind(title, subject);
  return {
    id: partial.id ?? uid(),
    title,
    subject,
    kind,
    date: partial.date ?? null,
    start: partial.start ?? null,
    end: partial.end ?? null,
    estimateMin: partial.estimateMin ?? null,
    remainingMin: partial.remainingMin ?? null,
    deadline: partial.deadline ?? null,
    deadlineTime: partial.deadlineTime ?? null,
    status: partial.status ?? 'todo',
    examRelated: partial.examRelated ?? false,
    value: partial.value ?? 2,
    usage: partial.usage ?? 2,
    createdAt: partial.createdAt ?? Date.now(),
    completedAt: partial.completedAt ?? null,
    ackAt: partial.ackAt ?? null,
  };
}

// ───────────────────────── 텍스트 붙여넣기 파서 ─────────────────────────

/** "19", "19:30", "19시", "19시30분", "7:5" → 분 */
function parseLooseTime(s) {
  const m = /^(\d{1,2})(?:[:시]\s*(\d{1,2})?\s*분?)?$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = m[2] ? Number(m[2]) : 0;
  if (h > 30 || mi > 59) return null;
  return h * 60 + mi;
}

const hm = (mins) => `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

/** 월/일 → 기준일과 가장 가까운 연도의 날짜 */
function resolveMD(month, day, baseDate) {
  const baseYear = Number(baseDate.slice(0, 4));
  const candidates = [baseYear - 1, baseYear, baseYear + 1].map(
    (y) => `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  );
  const baseMs = new Date(baseDate).getTime();
  candidates.sort((a, b) => Math.abs(new Date(a) - baseMs) - Math.abs(new Date(b) - baseMs));
  return candidates[0];
}

const RANGE_RE = /(\d{1,2}(?:[:시]\s*\d{0,2}\s*분?)?)\s*(?:-|–|—|~|〜)\s*(\d{1,2}(?:[:시]\s*\d{0,2}\s*분?)?)/;

/**
 * 기존 플래너의 텍스트를 작업 목록으로 변환한다.
 * 지원 예:
 *   11/20 (목)              ← 날짜 헤더
 *   19:00-21:00 수학 숙제
 *   21~22 국어 숙제 마감 11/21
 *   [x] 22:00-22:30 영어 단어
 *   수학 오답 정리 40분
 */
export function parsePlannerText(text, baseDate) {
  let current = baseDate;
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line) continue;

    // 날짜 헤더: "11/20", "2026-11-20", "11월 20일" 등이 줄의 전부일 때
    const header = /^(?:(\d{4})-(\d{1,2})-(\d{1,2})|(\d{1,2})\s*[/.월]\s*(\d{1,2})\s*일?)\s*(?:\(.\)|[월화수목금토일]요?일?)?\s*:?$/.exec(line);
    if (header) {
      current = header[1]
        ? `${header[1]}-${header[2].padStart(2, '0')}-${header[3].padStart(2, '0')}`
        : resolveMD(Number(header[4]), Number(header[5]), baseDate);
      continue;
    }

    let status = 'todo';
    const check = /^(?:\[(x|X|v|V|✓|✔)\]|✓|✔|☑|✅)\s*/.exec(line);
    if (check) {
      status = 'done';
      line = line.slice(check[0].length);
    }
    line = line.replace(/^(?:\[\s?\]|☐|-|\*|•)\s*/, '');
    if (/\s(완료|끝)$/.test(line)) {
      status = 'done';
      line = line.replace(/\s(완료|끝)$/, '');
    }

    // 마감
    let deadline = null;
    const dl = /(?:마감|due|제출)\s*:?\s*(\d{1,2})\s*[/.]\s*(\d{1,2})|(\d{1,2})\s*[/.]\s*(\d{1,2})\s*까지|(오늘|내일|모레)\s*(?:까지|마감)/.exec(line);
    if (dl) {
      if (dl[5]) deadline = addDays(current, { 오늘: 0, 내일: 1, 모레: 2 }[dl[5]]);
      else deadline = resolveMD(Number(dl[1] ?? dl[3]), Number(dl[2] ?? dl[4]), current);
      line = (line.slice(0, dl.index) + line.slice(dl.index + dl[0].length)).replace(/[()]\s*[()]/g, '');
    }

    let start = null;
    let end = null;
    let estimateMin = null;
    const r = RANGE_RE.exec(line);
    if (r) {
      const s = parseLooseTime(r[1]);
      const e = parseLooseTime(r[2]);
      if (s != null && e != null) {
        start = hm(s);
        end = hm(e);
        line = (line.slice(0, r.index) + line.slice(r.index + r[0].length)).trim();
      }
    }
    if (!start) {
      const d = /(\d+)\s*시간(?:\s*(\d+)\s*분)?|(\d+)\s*분/.exec(line);
      if (d) {
        estimateMin = d[3] ? Number(d[3]) : Number(d[1]) * 60 + Number(d[2] ?? 0);
        line = (line.slice(0, d.index) + line.slice(d.index + d[0].length)).trim();
      }
    }

    const title = line.replace(/\s{2,}/g, ' ').replace(/^[:\-–\s]+|[:\-–\s]+$/g, '').trim();
    if (!title) continue;
    if (!start && !estimateMin) continue; // 시간 정보가 없으면 작업으로 보지 않는다
    out.push(makeTask({ title, date: current, start, end, estimateMin, deadline, status }));
  }
  return out;
}

// ───────────────────────── 외부 JSON 어댑터 ─────────────────────────

const pick = (o, keys) => keys.map((k) => o?.[k]).find((v) => v != null && v !== '');

function normTime(v) {
  if (v == null) return null;
  if (typeof v === 'number') return hm(v);
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(11, 16);
  const t = parseLooseTime(s);
  return t == null ? null : hm(t);
}

function normDate(v) {
  if (v == null) return null;
  if (typeof v === 'number') return toDateStr(v);
  const s = String(v);
  const m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null;
}

/**
 * 기존 Sabathia(또는 다른 플래너)의 내보내기 JSON을 받아들이는 어댑터.
 * 키 이름이 조금 달라도 읽을 수 있게 흔한 별칭을 허용한다.
 */
export function adaptExternalTasks(input) {
  const list = Array.isArray(input) ? input : pick(input, ['tasks', 'items', 'planner', 'blocks', 'todos']) ?? [];
  return list
    .map((o) => {
      const title = pick(o, ['title', 'name', 'task', 'text', 'content']);
      if (!title) return null;
      const startRaw = pick(o, ['start', 'startTime', 'from', 'begin']);
      const date = normDate(pick(o, ['date', 'day', 'plannedDate'])) ?? normDate(startRaw);
      const done = pick(o, ['done', 'completed', 'isDone', 'checked']);
      return makeTask({
        title: String(title),
        subject: pick(o, ['subject']) in SUBJECT_WORDS ? o.subject : undefined,
        kind: o.kind,
        date,
        start: normTime(startRaw),
        end: normTime(pick(o, ['end', 'endTime', 'to', 'finish'])),
        estimateMin: Number(pick(o, ['estimateMin', 'minutes', 'duration'])) || null,
        deadline: normDate(pick(o, ['deadline', 'due', 'dueDate'])),
        status: done === true || o.status === 'done' ? 'done' : 'todo',
      });
    })
    .filter(Boolean);
}
