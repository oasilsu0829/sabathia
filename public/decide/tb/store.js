// Planner 2.0 — 브라우저 저장. (화면 전용, DOM 없음)
//   15577 기록  localStorage 'blockplanner.v1' — 15577 앱과 같은 자리. 고치면 updatedAt을 올리고,
//              15577 온라인 저장 ID(bp.cloudId)가 있으면 15577과 같은 Firestore 문서에 1.5초 뒤 올린다(updatedAt 최신 쪽이 이김)
//   Planner 문서 localStorage 'sabathia.plan.v1' — 작업·Big 3·수정안·블록 연결. 일정 토큰이 있으면 /api/plan/sync로 기기 간 합친다
import './merge.js';
import { ensureP } from './blocks.js';
import { ensureDoc, PLAN_KEY } from './tasks.js';

const { clean, merge } = globalThis.PlanMerge;
export const P_KEY = 'blockplanner.v1';
const CLOUD_KEY = 'bp.cloudId';
const FS = { projectId: 'p15577', apiKey: 'AIzaSyCMxJrxsFFEh9A9gDmbT4_rda9XLo8JgPE' };
const fsUrl = (id) => `https://firestore.googleapis.com/v1/projects/${FS.projectId}/databases/(default)/documents/planners/${id}?key=${FS.apiKey}`;
const json = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };

// ───────── 15577 ─────────
export function loadP() { const r = json(P_KEY); return r ? ensureP(r) : null; }
export const cloudId = () => { try { const v = localStorage.getItem(CLOUD_KEY); return v && /^[a-z0-9_-]{3,24}$/.test(v) ? v : null; } catch { return null; } };
let cloudT = 0, cloudErr = '';
export const cloudState = () => cloudErr;
async function cloudGet(id) {
  const r = await fetch(fsUrl(id), { cache: 'no-store' });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('15577 온라인 ' + r.status);
  const f = (await r.json()).fields || {};
  return f.data ? JSON.parse(f.data.stringValue) : null;
}
async function cloudPut(id, data) {
  const body = { fields: { data: { stringValue: JSON.stringify(data) }, updatedAt: { integerValue: String(data.updatedAt || 0) } } };
  const r = await fetch(fsUrl(id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('15577 온라인 저장 ' + r.status);
}
/**
 * 15577 온라인 기록이 더 새로우면 받아 온다(15577 cloudPull과 같은 규칙). 받아 왔으면 새 기록을 돌려준다.
 * 이 기기에 15577 기록이 없는데 ID만 있으면, 고치기 전에 반드시 이걸 먼저 불러 온라인 기록을 덮어쓰지 않게 한다.
 */
export async function pullP(local) {
  const id = cloudId();
  if (!id) return null;
  try {
    const r = await cloudGet(id);
    cloudErr = '';
    if (r && (r.updatedAt || 0) > (local?.updatedAt || 0)) {
      try { localStorage.setItem(P_KEY, JSON.stringify(r)); } catch {}
      return ensureP(r);
    }
    if (local && (!r || (local.updatedAt || 0) > (r.updatedAt || 0))) queuePush(local);
  } catch (e) { cloudErr = e.message; }
  return null;
}
function queuePush(P) {
  const id = cloudId();
  if (!id) return;
  clearTimeout(cloudT);
  cloudT = setTimeout(() => cloudPut(id, P).then(() => { cloudErr = ''; }).catch((e) => { cloudErr = e.message; }), 1500);
}
export function saveP(P) {
  P.updatedAt = Date.now();
  try { localStorage.setItem(P_KEY, JSON.stringify(P)); } catch {}
  queuePush(P);
}

// ───────── Planner 문서 ─────────
export function loadDoc() { return ensureDoc(json(PLAN_KEY)); }
let syncT = 0, syncing = false, again = false, syncMsg = '';
export const syncState = () => syncMsg;
export function saveDoc(doc, onMerged) {
  try { localStorage.setItem(PLAN_KEY, JSON.stringify(doc)); } catch {}
  clearTimeout(syncT);
  syncT = setTimeout(() => syncDoc(doc, onMerged), 1500);
}
/** 서버 것과 합친다. 연결이 안 되면(토큰 없음·오프라인) 이 기기에만 둔다 */
export async function syncDoc(doc, onMerged) {
  if (syncing) { again = true; return; }
  syncing = true;
  try {
    const base = (json('sab.base') || location.origin).replace(/\/+$/, '');
    const token = json('sab.token') || '';
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 10000);
    const r = await fetch(base + '/api/plan/sync', {
      method: 'POST', cache: 'no-store', signal: ctl.signal,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
      body: JSON.stringify({ doc: clean(doc) }),
    }).finally(() => clearTimeout(timer));
    if (!r.ok) { syncMsg = r.status === 401 ? '토큰이 없어 이 기기에만 저장' : `동기화 실패 ${r.status}`; return; }
    const j = await r.json();
    const next = merge(clean(doc), clean(j.doc));
    if (JSON.stringify(next) !== JSON.stringify(clean(doc))) {
      for (const p of Object.keys(next)) doc[p] = next[p];
      try { localStorage.setItem(PLAN_KEY, JSON.stringify(doc)); } catch {}
      onMerged && onMerged();
    }
    syncMsg = '';
  } catch { syncMsg = '오프라인 — 이 기기에 저장'; }
  finally {
    syncing = false;
    if (again) { again = false; syncDoc(doc, onMerged); }
  }
}

// ───────── 판단 앱 설정 (읽기만) ─────────
export const readJSON = json;
