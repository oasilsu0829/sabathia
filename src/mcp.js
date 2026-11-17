// AI 연결용 MCP 서버 (/mcp) — Claude·ChatGPT 같은 AI가 Sabathia 일정을 읽고 고칠 수 있게 한다.
// MCP Streamable HTTP의 상태 없는 형태: POST 한 번에 JSON-RPC 한 개(또는 배열)를 받고 JSON으로 답한다.
// 토큰: Authorization: Bearer <API_TOKEN>, 또는 헤더를 못 넣는 클라이언트(claude.ai 커스텀 커넥터 등)는 /mcp/<API_TOKEN>.
// 실제 처리는 /api/events 와 같은 코드(eventsApi)를 거치므로 검사·저장 규칙이 같다.
import { eventsApi } from './events.js';

const PROTOCOL = '2025-06-18';
const SUPPORTED = new Set(['2024-11-05', '2025-03-26', '2025-06-18']);

const EVENT_FIELDS = {
  title: { type: 'string', description: '제목 (필수, 200자 이내)' },
  date: { type: 'string', description: '날짜 YYYY-MM-DD (한국 날짜)' },
  time: { type: 'string', description: '시작 시각 HH:MM, 24시간제 한국 시각. 하루 종일이면 생략' },
  end: { type: 'string', description: '끝 시각 HH:MM. time이 있을 때만' },
  kind: { type: 'string', enum: ['event', 'task', 'deadline'], description: 'event 약속·수업, task 할 일, deadline 마감. 기본 event' },
  cat: { type: 'string', enum: ['', 'report', 'school', 'academy', 'none'], description: '묶음: report 보고서 제출, school 학교 수행, academy 학원 수행, none 묶지 않음. 비우면 앱이 제목으로 짐작' },
  done: { type: 'boolean', description: '끝냈는지' },
  note: { type: 'string', description: '메모 (500자 이내)' },
};

const TOOLS = [
  {
    name: 'list_events',
    title: '일정 목록',
    description: '기간 안의 일정·할 일·마감을 날짜순으로 돌려준다. 날짜는 한국 날짜(YYYY-MM-DD). 둘 다 비우면 전부.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: '시작 날짜 YYYY-MM-DD (포함)' },
        to: { type: 'string', description: '끝 날짜 YYYY-MM-DD (포함)' },
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'get_event',
    title: '일정 하나',
    description: 'id로 일정 하나를 돌려준다.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'add_events',
    title: '일정 추가',
    description: '일정을 1~200개 추가한다. 같은 id가 이미 있으면 그 일정을 고친다(중복 없음). id를 비우면 서버가 만든다. source를 비우면 "AI"로 적는다.',
    inputSchema: {
      type: 'object',
      properties: {
        events: {
          type: 'array', minItems: 1, maxItems: 200,
          items: {
            type: 'object',
            properties: { id: { type: 'string', description: '영문·숫자·_.- 64자 이내 (선택)' }, ...EVENT_FIELDS, source: { type: 'string' } },
            required: ['title', 'date'],
          },
        },
      },
      required: ['events'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'update_event',
    title: '일정 고치기',
    description: 'id로 일정을 찾아 준 칸만 바꾼다(끝냄 표시는 done: true). 시각을 지우려면 time에 빈 문자열.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, ...EVENT_FIELDS }, required: ['id'] },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'delete_event',
    title: '일정 지우기',
    description: 'id로 일정을 지운다. 되돌릴 수 없다.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
];

const INSTRUCTIONS = [
  'Sabathia는 한 학생의 개인 일정 앱이다. 모든 날짜·시각은 한국 시각(UTC+9).',
  '오늘 일정을 물으면 list_events에 오늘 날짜를 from·to로 넣는다.',
  '"내일 4시 반 동아리 회의"처럼 말하면 add_events로 넣고, 넣은 내용을 짧게 알려 준다.',
  '할 일은 kind task, 제출·마감은 kind deadline. 지우기 전에는 사용자에게 확인한다.',
].join('\n');

const rpcResult = (id, result) => ({ jsonrpc: '2.0', id, result });
const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

export async function mcpApi(req, env) {
  if (req.method === 'GET') {
    // 서버가 먼저 보내는 스트림은 쓰지 않는다
    return new Response('이 MCP 서버는 POST만 받습니다', { status: 405, headers: { Allow: 'POST' } });
  }
  if (req.method === 'DELETE') return new Response(null, { status: 204 });
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });

  let msg;
  try {
    msg = await req.json();
  } catch {
    return reply(rpcError(null, -32700, 'JSON을 읽을 수 없습니다'));
  }
  const batch = Array.isArray(msg);
  const out = [];
  for (const m of batch ? msg : [msg]) {
    const r = await handle(m, req, env);
    if (r) out.push(r);
  }
  if (!out.length) return new Response(null, { status: 202 });
  return reply(batch ? out : out[0]);
}

function reply(body) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function handle(m, req, env) {
  if (!m || typeof m !== 'object' || m.jsonrpc !== '2.0' || typeof m.method !== 'string') {
    return rpcError(m && m.id, -32600, '잘못된 JSON-RPC 요청입니다');
  }
  const isNote = m.id === undefined;
  if (isNote) return null; // notifications/initialized 등은 답하지 않는다
  const p = m.params || {};
  switch (m.method) {
    case 'initialize':
      return rpcResult(m.id, {
        protocolVersion: SUPPORTED.has(p.protocolVersion) ? p.protocolVersion : PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'sabathia-schedule', title: 'Sabathia 일정', version: '1.0.0' },
        instructions: INSTRUCTIONS,
      });
    case 'ping':
      return rpcResult(m.id, {});
    case 'tools/list':
      return rpcResult(m.id, { tools: TOOLS });
    case 'tools/call':
      return rpcResult(m.id, await callTool(p.name, p.arguments || {}, req, env));
    case 'resources/list':
      return rpcResult(m.id, { resources: [] });
    case 'prompts/list':
      return rpcResult(m.id, { prompts: [] });
    default:
      return rpcError(m.id, -32601, `지원하지 않는 메서드: ${m.method}`);
  }
}

// 도구 호출 → /api/events 요청으로 바꿔 같은 코드로 처리
async function callTool(name, a, req, env) {
  const base = new URL(req.url).origin + '/api/events';
  const enc = (s) => encodeURIComponent(String(s ?? ''));
  let method = 'GET', url = base, body;
  switch (name) {
    case 'list_events': {
      const q = new URLSearchParams();
      if (a.from) q.set('from', String(a.from));
      if (a.to) q.set('to', String(a.to));
      url = base + (q.toString() ? '?' + q : '');
      break;
    }
    case 'get_event':
      url = `${base}/${enc(a.id)}`;
      break;
    case 'add_events': {
      const list = Array.isArray(a.events) ? a.events : a.title ? [a] : [];
      method = 'POST';
      body = list.map((e) => ({ ...e, source: e && e.source ? e.source : 'AI' }));
      break;
    }
    case 'update_event': {
      const { id, ...rest } = a;
      if (rest.time === '') rest.time = null;
      if (rest.end === '') rest.end = null;
      method = 'PATCH';
      url = `${base}/${enc(id)}`;
      body = rest;
      break;
    }
    case 'delete_event':
      method = 'DELETE';
      url = `${base}/${enc(a.id)}`;
      break;
    default:
      return toolError(`없는 도구: ${name}`);
  }
  if ((name === 'get_event' || name === 'update_event' || name === 'delete_event') && !a.id) return toolError('id가 필요합니다');
  const sub = new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const res = await eventsApi(sub, env, new URL(url).pathname);
  const data = await res.json();
  if (!res.ok) return toolError(data.error || `오류 ${res.status}`);
  return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data };
}

const toolError = (text) => ({ content: [{ type: 'text', text }], isError: true });
