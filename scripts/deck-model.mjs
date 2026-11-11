// 사용: npm i @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 meshoptimizer sharp 후
//   node scripts/deck-model.mjs base_basic_pbr.glb public/music/3d/deck.glb
// 좌표 상수(PLATE, PC, PR, PIV, ARM, LOGOS, FLAT_R)는 원본 모델에 맞춰 잰 값이다. 모델을 바꾸면 다시 잴 것
// 플래터는 AI 것이 울퉁불퉁해서 버리고(빈 노드 platter만 남김) deck3d.js가 새로 만든다. 플래터 둘레 비탈은 평평하게 펴서 판 색으로 칠한다
// AI 턴테이블 모델 손보기: 로고 지우기 · 뒤쪽 쓰레기 지우기 · 플래터/톤암 떼어 관절 노드로 · 가볍게
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, textureCompress, meshopt, prune, dedup } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
await MeshoptSimplifier.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const src = await io.read(process.argv[2] || 'base_basic_pbr.glb');
const sp = src.getRoot().listMeshes()[0].listPrimitives()[0];
const P = sp.getAttribute('POSITION').getArray().slice(), N = sp.getAttribute('NORMAL').getArray().slice(), UV = sp.getAttribute('TEXCOORD_0').getArray();
const I = sp.getIndices().getArray();
const mat0 = sp.getMaterial();
const FLAT_R = 0.745, PLATE = 0.024, PC = [-0.18, 0.755], PR = 0.636, PIV = [0.645, 1.12];

// ---- 1. 로고: 굴곡은 평평하게, 그림은 주변 색으로 덮기
const LOGOS = [
  { x0: -0.89, x1: -0.44, y0: 1.345, y1: 1.44, z: PLATE, col: 'plate' },
  { x0: 0.26, x1: 0.6, y0: 0.06, y1: 0.13, z: PLATE, col: 'plate' },
];
const inLogo = (x, y) => LOGOS.find((L) => x >= L.x0 && x <= L.x1 && y >= L.y0 && y <= L.y1);
const inMatLogo = (x, y) => Math.hypot(x - PC[0], y - PC[1]) < 0.2;
for (let i = 0; i < P.length; i += 3) {
  const L = inLogo(P[i], P[i + 1]);
  if (L && P[i + 2] > 0) { P[i + 2] = L.z; N[i] = 0; N[i + 1] = 0; N[i + 2] = 1; }
}
async function rawTex(t) { const { data, info } = await sharp(Buffer.from(t.getImage())).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, W: info.width, H: info.height }; }
const texC = mat0.getBaseColorTexture(), texN = mat0.getNormalTexture(), texMR = mat0.getMetallicRoughnessTexture();
const C = await rawTex(texC), NM = await rawTex(texN), MR = await rawTex(texMR);
// 영역 안 앞면 삼각형들의 텍스처 색 중앙값
function sampleAt(T, x, y, r = 0.05) {
  const cs = [];
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3; if (Math.hypot(P[a] - x, P[a + 1] - y) > r || N[a + 2] < 0.95) continue;
    const u = (UV[I[t] * 2] + UV[I[t + 1] * 2] + UV[I[t + 2] * 2]) / 3, v = (UV[I[t] * 2 + 1] + UV[I[t + 1] * 2 + 1] + UV[I[t + 2] * 2 + 1]) / 3;
    const o = (Math.min(T.H - 1, Math.floor(v * T.H)) * T.W + Math.min(T.W - 1, Math.floor(u * T.W))) * 4;
    cs.push([T.data[o], T.data[o + 1], T.data[o + 2]]);
  }
  const med = (k) => cs.map((c) => c[k]).sort((a, b) => a - b)[cs.length >> 1];
  return [med(0), med(1), med(2), 255];
}
// 판 전체(높이 PLATE 근처 앞면)에서 밝은 쪽 70% 색 = 하얀 판 색
function plateSample(T) {
  const cs = [];
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3; if (Math.abs(P[a + 2] - PLATE) > 0.003 || N[a + 2] < 0.97) continue;
    const x = P[a], y = P[a + 1]; if (Math.hypot(x - PC[0], y - PC[1]) < 0.7 || x > 0.35 || y > 1.3) continue;
    const u = (UV[I[t] * 2] + UV[I[t + 1] * 2] + UV[I[t + 2] * 2]) / 3, v = (UV[I[t] * 2 + 1] + UV[I[t + 1] * 2 + 1] + UV[I[t + 2] * 2 + 1]) / 3;
    const o = (Math.min(T.H - 1, Math.floor(v * T.H)) * T.W + Math.min(T.W - 1, Math.floor(u * T.W))) * 4;
    cs.push([T.data[o], T.data[o + 1], T.data[o + 2]]);
  }
  cs.sort((a, b) => a[0] + a[1] + a[2] - b[0] - b[1] - b[2]);
  const c = cs[Math.floor(cs.length * 0.7)] || [220, 220, 220]; console.log('plate samples', cs.length, cs[cs.length >> 1], c);
  return [c[0], c[1], c[2], 255];
}
const plateCol = plateSample(C), plateMR = plateSample(MR);
const matCol = sampleAt(C, -0.18, 0.33), matMR = sampleAt(MR, -0.18, 0.33);
console.log('plate', plateCol, 'mat', matCol);
function fillTri(T, t, col) {
  const pts = [0, 1, 2].map((j) => [UV[I[t + j] * 2] * T.W, UV[I[t + j] * 2 + 1] * T.H]);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.floor(Math.min(...xs)) - 1, Math.ceil(Math.max(...xs)) + 1, Math.floor(Math.min(...ys)) - 1, Math.ceil(Math.max(...ys)) + 1];
  const [A, B, Cc] = pts, den = (B[1] - Cc[1]) * (A[0] - Cc[0]) + (Cc[0] - B[0]) * (A[1] - Cc[1]);
  for (let y = Math.max(0, y0); y <= Math.min(T.H - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(T.W - 1, x1); x++) {
    const px = x + 0.5, py = y + 0.5;
    const w1 = ((B[1] - Cc[1]) * (px - Cc[0]) + (Cc[0] - B[0]) * (py - Cc[1])) / den;
    const w2 = ((Cc[1] - A[1]) * (px - Cc[0]) + (A[0] - Cc[0]) * (py - Cc[1])) / den;
    const e = -0.15; if (w1 < e || w2 < e || 1 - w1 - w2 < e) continue;
    const o = (y * T.W + x) * 4; T.data[o] = col[0]; T.data[o + 1] = col[1]; T.data[o + 2] = col[2]; T.data[o + 3] = 255;
  }
}
const ARM = [[0.645, 1.40, 0.055], [0.645, 1.12, 0.07], [0.648, 0.95, 0.03], [0.665, 0.62, 0.028], [0.62, 0.45, 0.028], [0.58, 0.38, 0.035], [0.53, 0.30, 0.05], [0.48, 0.20, 0.055]];
function armDist(x, y) { let m = 1e9; for (let i = 0; i < ARM.length - 1; i++) { const [ax, ay, ar] = ARM[i], [bx, by, br] = ARM[i + 1]; const dx = bx - ax, dy = by - ay; let t = ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy); t = Math.max(0, Math.min(1, t)); const r = ar + (br - ar) * t; m = Math.min(m, Math.hypot(x - ax - dx * t, y - ay - dy * t) - r); } return m; }
const cent = (t) => [0, 1, 2].map((k) => (P[I[t] * 3 + k] + P[I[t + 1] * 3 + k] + P[I[t + 2] * 3 + k]) / 3);
for (let t = 0; t < I.length; t += 3) {
  const [x, y, z] = cent(t);
  if (z < 0) continue;
  if (Math.hypot(x - PC[0], y - PC[1]) < FLAT_R) { fillTri(C, t, plateCol); fillTri(NM, t, [128, 128, 255]); fillTri(MR, t, plateMR); }
  else if (inLogo(x, y)) { fillTri(C, t, plateCol); fillTri(NM, t, [128, 128, 255]); fillTri(MR, t, plateMR); }
  else if (armDist(x, y) < 0.012 && Math.hypot(x - PIV[0], y - PIV[1]) > 0.13 && z <= 0.034) { fillTri(C, t, plateCol); fillTri(NM, t, [128, 128, 255]); fillTri(MR, t, plateMR); for (let j = 0; j < 3; j++) { const v = I[t + j] * 3; P[v + 2] = PLATE; N[v] = 0; N[v + 1] = 0; N[v + 2] = 1; } }
  else if (inMatLogo(x, y) && z < 0.08) { fillTri(C, t, matCol); fillTri(NM, t, [128, 128, 255]); fillTri(MR, t, matMR); }
}
for (let i = 0; i < P.length; i += 3) if (Math.hypot(P[i] - PC[0], P[i + 1] - PC[1]) < FLAT_R && P[i + 2] > -0.012) { P[i + 2] = PLATE; N[i] = 0; N[i + 1] = 0; N[i + 2] = 1; }
for (let i = 0; i < P.length; i += 3) if (inMatLogo(P[i], P[i + 1]) && P[i + 2] > 0) { P[i + 2] = 0.04; N[i] = 0; N[i + 1] = 0; N[i + 2] = 1; }

// ---- 2. 삼각형 나누기: 뒤쪽 쓰레기 / 플래터 / 톤암 / 본체
const groups = { base: [], platter: [], arm: [] };
let dropped = 0;
for (let t = 0; t < I.length; t += 3) {
  const zs = [0, 1, 2].map((j) => P[I[t + j] * 3 + 2]);
  if (Math.max(...zs) < -0.012) { dropped++; continue; }
  const [x, y, z] = cent(t);
  const nearPiv = Math.hypot(x - PIV[0], y - PIV[1]) < 0.09;
  if (armDist(x, y) < 0 && z > (nearPiv ? 0.1 : 0.034)) { groups.arm.push(t); continue; }
  if (Math.hypot(x - PC[0], y - PC[1]) < PR) { dropped++; continue; } // 플래터는 deck3d.js가 새로 만든다
  groups.base.push(t);
}
console.log('tris', I.length / 3, 'dropped', dropped, Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length])));

// ---- 3. 새 문서: 세계 좌표 X=x, Y=z(위), Z=-(y-0.72)(앞이 +Z)
const toW = (x, y, z) => [x, z, -(y - 0.72)];
const PCW = toW(PC[0], PC[1], 0), PIVW = toW(PIV[0], PIV[1], 0);
const out = new Document(); out.createBuffer();
const tex = async (T, name, mime) => out.createTexture(name).setImage(await sharp(T.data, { raw: { width: T.W, height: T.H, channels: 4 } }).png().toBuffer()).setMimeType('image/png');
const mat = out.createMaterial('deck').setBaseColorTexture(await tex(C, 'color')).setNormalTexture(await tex(NM, 'normal')).setMetallicRoughnessTexture(await tex(MR, 'mr')).setMetallicFactor(mat0.getMetallicFactor()).setRoughnessFactor(mat0.getRoughnessFactor()).setDoubleSided(true);
function build(name, tris, origin) {
  const map = new Map(), pos = [], nor = [], uv = [], idx = [];
  for (const t of tris) for (let j = 0; j < 3; j++) {
    const v = I[t + j]; let k = map.get(v);
    if (k === undefined) { k = map.size; map.set(v, k); const w = toW(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); pos.push(w[0] - origin[0], w[1] - origin[1], w[2] - origin[2]); const n = toW(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]); nor.push(n[0], n[1], n[2]); uv.push(UV[v * 2], UV[v * 2 + 1]); }
    idx.push(k);
  }
  const acc = (a, type) => out.createAccessor().setArray(a).setType(type);
  const prim = out.createPrimitive().setAttribute('POSITION', acc(new Float32Array(pos), 'VEC3')).setAttribute('NORMAL', acc(new Float32Array(nor), 'VEC3')).setAttribute('TEXCOORD_0', acc(new Float32Array(uv), 'VEC2')).setIndices(acc(new Uint32Array(idx), 'SCALAR')).setMaterial(mat);
  return out.createMesh(name).addPrimitive(prim);
}
const root = out.createNode('deck');
root.addChild(out.createNode('base').setMesh(build('base', groups.base, [0, 0, 0])));
root.addChild(out.createNode('platter').setTranslation(PCW));
const yaw = out.createNode('armYaw').setTranslation(PIVW), lift = out.createNode('armLift');
lift.setMesh(build('arm', groups.arm, PIVW)); yaw.addChild(lift); root.addChild(yaw);
out.createScene('deck').addChild(root);
await io.write('deck-raw.glb', out);
await out.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.22, error: 0.0006, lockBorder: true }), dedup(), prune(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 82 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(process.argv[3] || 'deck.glb', out);
