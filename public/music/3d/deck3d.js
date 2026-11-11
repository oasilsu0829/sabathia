/* 음악 앱 3D 턴테이블 (MUS-09).
   deck.glb = AI로 만든 턴테이블을 손본 것(scripts/deck-model.mjs): 노드 base(본체) · platter(빈 노드 = 회전축) · armYaw(톤암 좌우 관절) > armLift(톤암 들림 관절)
   만든 법: 로고 지우기, 뒤쪽 뭉개진 면 지우기, 플래터 둘레 비탈 펴기, 톤암 떼어 관절 원점으로 옮기기, 면 22%로 줄이기, 텍스처 1024 webp, meshopt 압축
   플래터(알루미늄 + 옆면 스트로브 점 4줄) · 고무 매트 · 축 · 판은 여기서 코드로 만든다(AI 플래터는 울퉁불퉁해서 버림)
   좌표: +Y 위, +Z 화면 앞. 판 지름 1.77 × 1.44
   바깥(index.html)에서 쓰는 것: window.Deck3D = { ok, setPlaying(bool, progress), setLabel({name, artist, img}), drop(a, slam), shake() }
   WebGL이 안 되면 ok = false 로 두고 예전 CSS 턴테이블을 그대로 쓴다 */
import * as THREE from 'three';
import { GLTFLoader } from './loaders/GLTFLoader.js';
import { MeshoptDecoder } from './libs/meshopt_decoder.module.js';
import { RoomEnvironment } from './environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from './geometries/RoundedBoxGeometry.js';

const host = document.getElementById('deck3d');
const D = (window.Deck3D = { ok: false });
const PLATTER = new THREE.Vector3(-0.18, 0, -0.035);   // 플래터 중심(세계 좌표)
const PLATE = 0.024;                                   // 본체 윗면 높이
const PL_R = 0.645, PL_TOP = 0.066;                    // 플래터 반지름·윗면
const MAT_R = 0.62, MAT_TOP = PL_TOP + 0.004;          // 고무 매트
const REC_R = 0.6, REC_Y = MAT_TOP + 0.004;            // 판(12인치) 반지름·가운데 높이
const LIFT_ON = 0, LIFT_UP = 0.05;                     // 톤암 들림(라디안): 판 위(바늘이 판에 닿음) · 옮길 때
const ARM_H = 0.15;                                   // 톤암 관 높이(축 기준 세계 높이)
const HEAD = new THREE.Vector3(-0.165, 0, 0.92);        // 축에서 바늘까지(톤암 관절 좌표)
const RPS = 33.333 / 60;                               // 33⅓ rpm
const GO_PX = 491, GI_PX = 222;                        // 판 그림(1024px)에서 소리 홈 바깥·안쪽 반지름
const GO_R = REC_R * GO_PX / 512, GI_R = REC_R * GI_PX / 512;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
} catch { renderer = null; }

if (renderer && host) start();

function start() {
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  // 실제 그림자(판·톤암·본체가 책상에 떨어뜨리는 그림자)
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(-1.5, 3, 1.5); scene.add(key);
  key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0006; key.shadow.normalBias = 0.01; key.shadow.radius = 5;
  Object.assign(key.shadow.camera, { left: -1.6, right: 1.6, top: 1.6, bottom: -1.6, near: 0.5, far: 7 });
  // 밤 조명: 방 불을 끄고 스트로브 등 · 판 위 따뜻한 조명만(night 0→1로 서서히)
  let night = 0, nightT = 0;
  const spot = new THREE.SpotLight(0xffd8a8, 0, 3.2, 0.42, 0.65, 1.4); spot.position.set(-0.35, 1.9, 0.55);
  spot.target.position.set(-0.18, 0, -0.035); scene.add(spot, spot.target);
  const armLamp = new THREE.PointLight(0xfff1d6, 0, 0.45, 2); armLamp.position.set(0.5, 0.2, 0.42); scene.add(armLamp);
  const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 50);

  const deck = new THREE.Group(); scene.add(deck);

  // 헤어라인 결(브러시드 알루미늄): 가로로 가는 줄을 촘촘히
  function brushed() {
    const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
    g.fillStyle = '#c9ccd1'; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 2600; i++) { const y = Math.random() * 512, v = 180 + Math.random() * 70 | 0; g.fillStyle = `rgba(${v},${v + 2},${v + 5},${0.12 + Math.random() * 0.2})`; g.fillRect(Math.random() * 512 - 200, y, 120 + Math.random() * 500, 0.6 + Math.random()); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 1); return t;
  }
  const brush = brushed();
  // 받침(본체 밑 두께): AI 모델은 얇은 판이라 상자를 밑에 댄다. 하이엔드 느낌으로 헤어라인 알루미늄
  const plinth = new THREE.Mesh(new RoundedBoxGeometry(1.79, 0.17, 1.46, 4, 0.03), new THREE.MeshPhysicalMaterial({ color: 0xdfe2e6, map: brush, metalness: 0.82, roughness: 0.34, clearcoat: 0.2 }));
  plinth.position.set(0, -0.085 + 0.005, 0); plinth.castShadow = true; plinth.receiveShadow = true; deck.add(plinth);
  // 앞면 각인: 글자가 파인 것처럼(어두운 글자 + 아래 밝은 테)
  {
    const c = document.createElement('canvas'); c.width = 2048; c.height = 128; const g = c.getContext('2d');
    const eng = (txt, x, align, size, sp) => {
      g.font = `600 ${size}px "Space Grotesk", "JetBrains Mono", sans-serif`; g.textAlign = align; g.textBaseline = 'middle';
      if ('letterSpacing' in g) g.letterSpacing = sp + 'px';
      g.fillStyle = 'rgba(255,255,255,.75)'; g.fillText(txt, x, 66);
      g.fillStyle = 'rgba(40,42,48,.78)'; g.fillText(txt, x, 63);
    };
    eng('SABATHIA', 90, 'left', 54, 14);
    eng('DIRECT DRIVE TURNTABLE', 520, 'left', 26, 8);
    eng('33⅓ · 45 RPM', 1958, 'right', 30, 8);
    g.fillStyle = 'rgba(40,42,48,.35)'; g.fillRect(470, 46, 2, 36);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.106), new THREE.MeshStandardMaterial({ map: t, transparent: true, metalness: 0.6, roughness: 0.4 }));
    face.position.set(0, -0.08, 0.7305); deck.add(face);
  }
  // 책상에 떨어지는 그림자만 그리는 바닥(배경은 비친다)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({ opacity: 0.22 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.166; floor.receiveShadow = true; deck.add(floor);
  // 바닥 그림자
  const sh = document.createElement('canvas'); sh.width = sh.height = 128;
  const sg = sh.getContext('2d'), gr = sg.createRadialGradient(64, 64, 10, 64, 64, 64);
  gr.addColorStop(0, 'rgba(0,0,0,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); sg.fillStyle = gr; sg.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sh), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = -0.19; deck.add(shadow);

  // 판(레코드): 홈 무늬 + 가운데 라벨을 캔버스 하나에 그린다
  function recordTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 1024;
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return { c, t };
  }
  function drawRecord(R, L, img) {
    const g = R.c.getContext('2d'), S = 1024, m = S / 2;
    g.clearRect(0, 0, S, S);
    g.fillStyle = '#0b0b0e'; g.beginPath(); g.arc(m, m, m, 0, 7); g.fill();
    // 소리 홈(GO_PX ~ GI_PX). 곡 사이 무음 홈은 실제 곡 길이 비율 자리에 매끈한 띠로
    for (let r = GI_PX; r < GO_PX; r += 2.2) { g.strokeStyle = `rgba(255,255,255,${0.02 + (Math.sin(r * 0.37) + 1) * 0.013})`; g.lineWidth = 1; g.beginPath(); g.arc(m, m, r, 0, 7); g.stroke(); }
    const gaps = (L && L.tracks) || [];
    for (const f of gaps) {
      const r = GO_PX - f * (GO_PX - GI_PX);
      g.strokeStyle = '#050507'; g.lineWidth = 7; g.beginPath(); g.arc(m, m, r, 0, 7); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.09)'; g.lineWidth = 2; g.beginPath(); g.arc(m, m, r + 1.5, 0, 7); g.stroke();
    }
    g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 8; g.beginPath(); g.arc(m, m, GO_PX + 7, 0, 7); g.stroke(); // 들어가는 홈
    const LR = 188;
    g.save(); g.beginPath(); g.arc(m, m, LR, 0, 7); g.clip();
    if (img) { g.drawImage(img, m - LR, m - LR, LR * 2, LR * 2); g.fillStyle = 'rgba(0,0,0,.38)'; g.fillRect(0, 0, S, S); }
    else { g.fillStyle = '#f4f4f5'; g.fillRect(0, 0, S, S); }
    g.restore();
    g.strokeStyle = 'rgba(200,200,205,.9)'; g.lineWidth = 4; g.beginPath(); g.arc(m, m, LR, 0, 7); g.stroke();
    g.fillStyle = img ? '#fff' : '#111827'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '700 22px "JetBrains Mono", monospace'; g.fillText('SABATHIA', m, m - 92);
    g.font = '700 40px "Space Grotesk", "Noto Sans KR", sans-serif';
    const name = ((L && L.name) || 'NO RECORD').toUpperCase(), lines = wrap(g, name, 300).slice(0, 2);
    lines.forEach((s, i) => g.fillText(s, m, m - 40 + i * 44));
    g.font = '500 24px "JetBrains Mono", "Noto Sans KR", monospace'; g.globalAlpha = 0.8;
    g.fillText(clip(g, (L && L.artist) || '', 300), m, m + 58 + (lines.length - 1) * 20); g.globalAlpha = 1;
    g.fillStyle = '#d4d4d8'; g.beginPath(); g.arc(m, m + 118, 13, 0, 7); g.fill(); g.fillStyle = '#27272a'; g.beginPath(); g.arc(m, m + 118, 5, 0, 7); g.fill();
    R.t.needsUpdate = true;
  }
  function wrap(g, s, w) { const out = []; let cur = ''; for (const word of s.split(/\s+/)) { const t = cur ? cur + ' ' + word : word; if (g.measureText(t).width > w && cur) { out.push(cur); cur = word; } else cur = t; } if (cur) out.push(cur); return out.map((x) => clip(g, x, w)); }
  function clip(g, s, w) { if (g.measureText(s).width <= w) return s; while (s.length > 1 && g.measureText(s + '…').width > w) s = s.slice(0, -1); return s + '…'; }
  const imgCache = new Map();
  function loadImg(url) {
    if (!url) return Promise.resolve(null);
    if (!imgCache.has(url)) imgCache.set(url, new Promise((res) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => res(null); i.src = url; }));
    return imgCache.get(url);
  }
  // 판 = 검은 원기둥(옆·밑) + 윗면 원판(일반 UV라 라벨 글자가 똑바로 보인다)
  function makeRecord() {
    const R = recordTexture();
    const black = new THREE.MeshStandardMaterial({ color: 0x0b0b0e, roughness: 0.45 });
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(REC_R, REC_R, 0.008, 128), black);
    const top = new THREE.Mesh(new THREE.CircleGeometry(REC_R, 128), new THREE.MeshPhysicalMaterial({ map: R.t, roughness: 0.55, metalness: 0.0, clearcoat: 0.35, clearcoatRoughness: 0.35, envMapIntensity: 0.35 }));
    top.rotation.x = -Math.PI / 2; top.position.y = 0.0042;
    body.castShadow = true; top.receiveShadow = true;
    g.add(body, top);
    g.userData.R = R; g.userData.mats = [black, top.material];
    return g;
  }

  // 슬리브(앨범 표지)와 클립보드(플레이리스트)
  // 낡음 w(0~1, 많이 들을수록): 링 자국 진하게 · 모서리 하얗게 닳음 · 긁힘
  function wearOn(g, W, H, w, seed) {
    if (!w) return;
    let x = seed || 7; const rnd = () => ((x = (x * 16807) % 2147483647) / 2147483647);
    g.save();
    g.strokeStyle = `rgba(255,252,245,${0.1 + w * 0.45})`; g.lineWidth = 3 + w * 9; g.beginPath(); g.arc(W / 2, H / 2, W * 0.43, 0, 7); g.stroke();
    const eg = (x0, y0, x1, y1) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, `rgba(255,250,240,${w * 0.7})`); gr.addColorStop(1, 'rgba(255,250,240,0)'); return gr; };
    const e = 10 + w * 26;
    g.fillStyle = eg(0, 0, e, 0); g.fillRect(0, 0, e, H); g.fillStyle = eg(W, 0, W - e, 0); g.fillRect(W - e, 0, e, H);
    g.fillStyle = eg(0, 0, 0, e); g.fillRect(0, 0, W, e); g.fillStyle = eg(0, H, 0, H - e); g.fillRect(0, H - e, W, e);
    g.strokeStyle = `rgba(255,255,255,${w * 0.35})`; g.lineWidth = 1.5;
    for (let i = 0; i < w * 40; i++) { const a = rnd() * W, b = rnd() * H, l = 10 + rnd() * 50, t = rnd() * 6.28; g.beginPath(); g.moveTo(a, b); g.lineTo(a + Math.cos(t) * l, b + Math.sin(t) * l); g.stroke(); }
    g.restore();
  }
  const wearOf = (a) => Math.min(1, ((a && a.p) || 0) / 20);
  const seedOf = (a) => [...String((a && a.id) || 'x')].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 2147483647, 7) || 7;
  function coverMat(img, a) {
    const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
    g.fillStyle = '#2b2b30'; g.fillRect(0, 0, 512, 512); if (img) g.drawImage(img, 0, 0, 512, 512);
    g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 3; g.beginPath(); g.arc(256, 256, 220, 0, 7); g.stroke();
    wearOn(g, 512, 512, wearOf(a), seedOf(a));
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 });
  }
  function clipMat(a, img) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 512; const g = c.getContext('2d');
    const bgd = g.createLinearGradient(0, 0, 512, 512); bgd.addColorStop(0, '#a3723f'); bgd.addColorStop(1, '#77502a');
    g.fillStyle = bgd; g.beginPath(); g.roundRect(0, 0, 512, 512, 26); g.fill();
    g.fillStyle = '#fbfaf5'; g.fillRect(40, 36, 432, 450);
    g.strokeStyle = '#d7e1ee'; g.lineWidth = 2; for (let y = 120; y < 480; y += 34) { g.beginPath(); g.moveTo(40, y); g.lineTo(472, y); g.stroke(); }
    g.strokeStyle = 'rgba(230,0,18,.35)'; g.beginPath(); g.moveTo(66, 36); g.lineTo(66, 486); g.stroke();
    if (img) { g.save(); g.translate(400, 120); g.rotate(0.05); g.drawImage(img, -50, -50, 100, 100); g.restore(); }
    g.fillStyle = '#1f2430'; g.font = '700 38px "Space Grotesk", "Noto Sans KR", sans-serif'; g.textBaseline = 'top';
    wrap(g, a.name || '플레이리스트', 290).slice(0, 2).forEach((s, i) => g.fillText(s, 80, 80 + i * 42));
    g.fillStyle = '#6b7280'; g.font = '500 22px "JetBrains Mono", monospace'; g.fillText(clip(g, [a.artist, a.n ? a.n + '곡' : ''].filter(Boolean).join(' · '), 290), 80, 172);
    g.fillStyle = '#b9c0cb'; [0.78, 0.62, 0.84, 0.55, 0.7, 0.48, 0.66].forEach((w, i) => g.fillRect(80, 232 + i * 34, 360 * w, 9));
    const cg = g.createLinearGradient(0, 0, 0, 64); cg.addColorStop(0, '#fafafa'); cg.addColorStop(0.5, '#a1a1aa'); cg.addColorStop(1, '#e4e4e7');
    g.fillStyle = cg; g.beginPath(); g.roundRect(170, 0, 172, 62, 14); g.fill();
    // 많이 튼 플레이리스트: 커피 자국
    const w = wearOf(a);
    if (w > 0.25) { g.strokeStyle = `rgba(120,72,30,${0.15 + w * 0.3})`; g.lineWidth = 8; g.beginPath(); g.arc(360, 380, 62, 0.3, 5.9); g.stroke(); g.fillStyle = `rgba(120,72,30,${w * 0.08})`; g.beginPath(); g.arc(360, 380, 58, 0, 7); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 });
  }
  const side = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.8 });

  // 플래터: 알루미늄 원판(옆면에 스트로브 점 4줄) + 고무 매트 + 가운데 축 + 밑 그림자
  // 스트로브 점: 오디오테크니카·테크닉스 플래터 테두리의 땡땡이 4줄(50/60Hz × 33/45). 비스듬한 테두리라 위에서도 보인다
  function strobeTexture() {
    const c = document.createElement('canvas'); c.width = 4096; c.height = 256; const g = c.getContext('2d');
    const al = g.createLinearGradient(0, 0, 0, 256); al.addColorStop(0, '#9da1a8'); al.addColorStop(0.5, '#7d8188'); al.addColorStop(1, '#6a6e75');
    g.fillStyle = al; g.fillRect(0, 0, 4096, 256);
    [[118, 38], [121, 96], [90, 154], [88, 212]].forEach(([n, y]) => {
      const w = 4096 / n, dw = w * 0.5, dh = 34;
      for (let i = 0; i < n; i++) {
        const x = i * w + (w - dw) / 2;
        g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(x + 2, y - dh / 2 + 3, dw, dh);
        const dg = g.createLinearGradient(0, y - dh / 2, 0, y + dh / 2); dg.addColorStop(0, '#ffffff'); dg.addColorStop(0.55, '#e4e6ea'); dg.addColorStop(1, '#b8bcc2');
        g.fillStyle = dg; g.fillRect(x, y - dh / 2, dw, dh);
      }
    });
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
  }
  function buildPlatter(node) {
    const H = PL_TOP - PLATE - 0.006;
    const alu = new THREE.MeshStandardMaterial({ color: 0xd9dce0, metalness: 0.85, roughness: 0.32 });
    const sideM = new THREE.MeshStandardMaterial({ map: strobeTexture(), metalness: 0.75, roughness: 0.35 });
    // 옆면을 바깥으로 벌려(위 0.645 → 아래 0.69) 땡땡이 테두리가 위에서 보이게
    const pl = new THREE.Mesh(new THREE.CylinderGeometry(PL_R, PL_R + 0.045, H, 160, 1), [sideM, alu, alu]);
    pl.position.y = PL_TOP - H / 2; node.add(pl);
    // 스트로브 등(앞 왼쪽 본체 위, 빨간 불이 땡땡이를 비춘다)
    const lampAt = new THREE.Vector3(-0.726, 0, 0.688).multiplyScalar(0.79).add(PLATTER);
    const lampBody = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.05, 24), new THREE.MeshStandardMaterial({ color: 0xe9e9e7, roughness: 0.4 }));
    lampBody.position.set(lampAt.x, PLATE + 0.025, lampAt.z); deck.add(lampBody);
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.016, 16, 12), new THREE.MeshStandardMaterial({ color: 0xff3a2a, emissive: 0xff2010, emissiveIntensity: 1.6 }));
    lens.position.set(lampAt.x + 0.018, PLATE + 0.04, lampAt.z - 0.017); deck.add(lens);
    const glow = new THREE.PointLight(0xff3020, 0.35, 0.5, 2); glow.position.set(lampAt.x + 0.03, PLATE + 0.05, lampAt.z - 0.03); deck.add(glow); D._glow = glow;
    const lip = new THREE.Mesh(new THREE.TorusGeometry(PL_R - 0.003, 0.004, 8, 128), alu); lip.rotation.x = Math.PI / 2; lip.position.y = PL_TOP - 0.001; node.add(lip);
    const mat = new THREE.Mesh(new THREE.CylinderGeometry(MAT_R, MAT_R, 0.004, 128), new THREE.MeshStandardMaterial({ color: 0x1c1d21, roughness: 0.95 }));
    mat.position.y = PL_TOP + 0.002; node.add(mat);
    const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.04, 24), new THREE.MeshStandardMaterial({ color: 0xe6e8ea, metalness: 0.95, roughness: 0.2 }));
    spindle.position.y = REC_Y + 0.02; node.add(spindle);
    // 본체 위 접지 그림자(돌지 않게 deck에 붙인다)
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    const rg = g.createRadialGradient(128, 128, 100, 128, 128, 128); rg.addColorStop(0, 'rgba(0,0,0,.42)'); rg.addColorStop(0.85, 'rgba(0,0,0,.12)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 256, 256);
    const shd = new THREE.Mesh(new THREE.PlaneGeometry(PL_R * 2.3, PL_R * 2.3), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    shd.rotation.x = -Math.PI / 2; shd.position.set(PLATTER.x, PLATE + 0.0015, PLATTER.z); deck.add(shd);
  }

  // 톤암: AI 톤암은 납작한 부조라 비스듬히 보면 휘어 보여서 숨기고 코드로 새로 만든다(S자 관 · 기둥 · 무게추 · 헤드셸 · 카트리지 · 받침대)
  function buildArm(lift, yawNode) {
    // armLift 노드 자체가 AI 톤암 메시라 visible을 끄면 자식(새 톤암)까지 숨는다 → 재질만 안 보이게
    lift.traverse((o) => { if (o.isMesh) o.material = new THREE.MeshBasicMaterial({ visible: false }); });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xe8eaed, metalness: 0.95, roughness: 0.18 });
    const satin = new THREE.MeshStandardMaterial({ color: 0xcfd2d6, metalness: 0.8, roughness: 0.38 });
    const black = new THREE.MeshStandardMaterial({ color: 0x1d1f24, metalness: 0.2, roughness: 0.55 });
    const add = (m, x, y, z, parent = lift) => { m.position.set(x, y, z); parent.add(m); return m; };
    // 기둥(돌지 않는 받침 위, 톤암과 같이 돈다)
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.03, 32), satin), 0, 0.105, 0, yawNode);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, ARM_H - 0.1, 24), chrome), 0, 0.1 + (ARM_H - 0.1) / 2, 0, yawNode);
    // 짐벌(수평 고리)
    const gim = add(new THREE.Mesh(new THREE.TorusGeometry(0.044, 0.011, 12, 32), satin), 0, ARM_H, 0); gim.rotation.y = Math.PI / 2;
    add(new THREE.Mesh(new THREE.SphereGeometry(0.026, 16, 12), chrome), 0, ARM_H, 0);
    // 뒤쪽 축대와 무게추
    const stub = add(new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.17, 16), chrome), 0, ARM_H, -0.1); stub.rotation.x = Math.PI / 2;
    const cw = add(new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.095, 32), satin), 0, ARM_H, -0.165); cw.rotation.x = Math.PI / 2;
    const cwr = add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.014, 32), black), 0, ARM_H, -0.128); cwr.rotation.x = Math.PI / 2;
    // S자 관: 축 → 앞으로 곧게 → 끝에서 안쪽으로 휜다
    const hx = HEAD.x, hz = HEAD.z;
    // S자: 축에서 곧게 나와 → 가운데에서 바깥(+x)으로 살짝 부풀고 → 앞쪽에서 판 안쪽으로 크게 휘었다가 → 끝에서 다시 펴져 헤드셸에 붙는다
    const end = new THREE.Vector3(hx + 0.04, ARM_H - 0.016, hz - 0.125);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, ARM_H, 0.03), new THREE.Vector3(0.004, ARM_H, 0.22), new THREE.Vector3(0.026, ARM_H - 0.002, 0.42),
      new THREE.Vector3(0.022, ARM_H - 0.005, 0.56), new THREE.Vector3(-0.03, ARM_H - 0.009, 0.68), new THREE.Vector3(-0.09, ARM_H - 0.013, 0.74),
      new THREE.Vector3(end.x + 0.012, end.y, end.z - 0.03), end,
    ], false, 'centripetal');
    lift.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 96, 0.021, 18, false), chrome));
    // 헤드셸(관 끝에서 비스듬히) + 카트리지 + 손잡이
    const hs = new THREE.Group(); hs.position.copy(end); hs.rotation.y = -0.4; lift.add(hs);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.084, 0.015, 0.155), black), 0, 0, 0.075, hs);
    const cart = add(new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.036, 0.07), new THREE.MeshStandardMaterial({ color: 0xc8102e, roughness: 0.45 })), 0, -0.025, 0.092, hs);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.014, 0.028), black), 0, -0.047, 0.108, hs);
    const fl = add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.006, 0.016), chrome), 0.05, 0.006, 0.11, hs); fl.rotation.z = 0.35;
    // 바늘 끝(헤드셸 기준 -0.054)이 판 윗면(REC_Y + 0.004 = 0.078)에 닿도록 ARM_H = 0.078 + 0.016 + 0.054 + 여유
    void cart;
    // 받침대(쉴 때 관이 얹히는 기둥) — 본체에 고정
    const restW = new THREE.Vector3(0.012, 0, 0.45).add(yawNode.position);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, ARM_H - 0.03 - PLATE, 16), satin), restW.x, PLATE + (ARM_H - 0.03 - PLATE) / 2, restW.z, deck);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.012, 0.03), black), restW.x, ARM_H - 0.026, restW.z, deck);
  }

  let parts = null, record = null, label = null, labelKey = '';
  let playing = false, progress = 0, spin = 0, vel = 0, yaw = 0, lift = 0;
  let drop = null; // { t0, slam, sleeve, disc, done }
  let grab = null;  // { phi, spin0, t, last, v } 판을 손으로 잡은 상태
  let shakeT = -1;

  new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(new URL('./deck.glb', import.meta.url).href, (g) => {
    const root = g.scene;
    // AI 텍스처의 잔주름(노멀맵)이 지저분해 보여 약하게
    // 본체 윗판도 은색 금속 느낌으로(인쇄된 버튼·글자는 텍스처 그대로)
    root.traverse((o) => { if (o.isMesh) { const m = o.material; m.side = THREE.FrontSide; m.envMapIntensity = 1; m.normalScale && m.normalScale.set(0.3, 0.3); m.metalnessMap = null; m.metalness = 0.55; m.roughness = 0.36; m.color && m.color.set(0xd9dce1); o.receiveShadow = true; } });
    deck.add(root);
    // 빈 platter 노드는 압축(prune) 때 지워질 수 있어 없으면 만든다
    let platter = root.getObjectByName('platter');
    if (!platter) { platter = new THREE.Group(); platter.name = 'platter'; platter.position.copy(PLATTER); root.add(platter); }
    parts = { platter, yaw: root.getObjectByName('armYaw'), lift: root.getObjectByName('armLift') };
    buildPlatter(parts.platter);
    buildArm(parts.lift, parts.yaw);
    record = makeRecord(); record.position.set(0, REC_Y, 0); parts.platter.add(record);
    // 그림자: 판·플래터·톤암이 드리우고, 본체·매트가 받는다
    [parts.platter, parts.yaw, parts.lift].forEach((n) => n.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }));
    deck.traverse((o) => { if (o.isMesh && o.parent === deck && o !== floor && !o.material.transparent) o.castShadow = true; });
    applyLabel();
    D.ok = true;
    document.body.classList.add('d3');
    resize();
    loop.last = performance.now(); requestAnimationFrame(loop);
  }, undefined, (e) => { D.ok = false; console.error('deck3d', e); });

  function applyLabel(target = record) {
    const L = label, key = L ? [L.name, L.artist, L.img, (L.tracks || []).map((f) => f.toFixed(3)).join(',')].join('|') : '';
    if (target === record && key === labelKey) return;
    if (target === record) labelKey = key;
    drawRecord(target.userData.R, L, null);
    loadImg(L && L.img).then((img) => { if (img && (target !== record || labelKey === key)) drawRecord(target.userData.R, L, img); });
  }

  // 바늘 끝이 판 중심에서 반지름 r에 오는 톤암 각(이분법). 각이 작아질수록(음수 쪽) 안쪽으로 간다
  function yawFor(r) {
    const piv = parts.yaw.position;
    const rad = (th) => { const c = Math.cos(th), s2 = Math.sin(th); const x = piv.x + HEAD.x * c + HEAD.z * s2, z = piv.z - HEAD.x * s2 + HEAD.z * c; return Math.hypot(x - PLATTER.x, z - PLATTER.z); };
    let lo = -1.2, hi = 0;
    for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (rad(mid) > r) hi = mid; else lo = mid; }
    return (lo + hi) / 2;
  }

  function resize() {
    const w = host.clientWidth || 1, h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    cam.aspect = w / h;
    // 판 전체(1.8 × 1.5)가 들어오게 거리를 맞춘다. 위에서 비스듬히(약 62도) 내려다본다
    const fitW = 1.95 / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * cam.aspect), fitH = 1.75 / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    const dist = Math.max(fitW, fitH);
    const el = THREE.MathUtils.degToRad(62);
    cam.position.set(0, Math.sin(el) * dist, Math.cos(el) * dist);
    cam.lookAt(0, -0.02, 0.02);
    cam.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host);

  // 판 잡기: 판을 누르면 멈추고, 돌리는 만큼 판이 따라 돈다(스크래치 소리). 놓으면 모터가 다시 돌린다
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  function recordAngle(e) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, cam);
    plane.constant = -(REC_Y + 0.004 + deck.position.y);
    if (!ray.ray.intersectPlane(plane, hit)) return null;
    const dx = hit.x - PLATTER.x, dz = hit.z - PLATTER.z, d = Math.hypot(dx, dz);
    return { phi: Math.atan2(dz, dx), d };
  }
  const el = renderer.domElement;
  el.style.touchAction = 'none';
  el.addEventListener('pointerdown', (e) => {
    if (!parts || drop || !record) return;
    const a = recordAngle(e); if (!a || a.d > REC_R || a.d < 0.04) return;
    e.preventDefault(); el.setPointerCapture(e.pointerId);
    grab = { phi: a.phi, spin0: spin, t: performance.now(), last: performance.now(), v: 0 };
    el.style.cursor = 'grabbing';
    D.onScratch && D.onScratch('start');
  });
  el.addEventListener('pointermove', (e) => {
    if (!grab) { const a = parts && recordAngle(e); el.style.cursor = a && a.d < REC_R && a.d > 0.04 && !drop ? 'grab' : ''; return; }
    const a = recordAngle(e); if (!a) return;
    let dphi = a.phi - grab.phi; if (dphi > Math.PI) dphi -= 2 * Math.PI; if (dphi < -Math.PI) dphi += 2 * Math.PI;
    grab.phi = a.phi;
    const now = performance.now(), dts = Math.max(0.008, (now - grab.last) / 1000); grab.last = now;
    spin -= dphi; // 점의 각이 φ면 돌린 뒤 각은 φ - spin 쪽이라 반대로 더한다
    grab.v = grab.v * 0.6 + (-dphi / dts) * 0.4;
    D.onScratch && D.onScratch('move', grab.v / (RPS * Math.PI * 2)); // 1 = 정상 속도, 음수 = 거꾸로
  });
  const release = () => {
    if (!grab) return;
    // 앞으로 돈 각(시계 방향이 앞) → 초. 한 바퀴 = 1.8초(33⅓ rpm)
    const sec = (-(spin - grab.spin0)) / (Math.PI * 2) * (60 / 33.333);
    const held = (performance.now() - grab.t) / 1000;
    vel = Math.max(0, grab.v * 0.5);
    grab = null; el.style.cursor = '';
    D.onScratch && D.onScratch('end', sec, held);
  };
  el.addEventListener('pointerup', release); el.addEventListener('pointercancel', release);

  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
  const easeIn = (t) => t * t * t, easeOut = (t) => 1 - (1 - t) ** 3;
  const lerp = THREE.MathUtils.lerp, clamp01 = (t) => Math.min(1, Math.max(0, t));
  const seg = (t, a, b) => clamp01((t - a) / (b - a));

  function loop(now) {
    const dt = Math.min(0.05, (now - loop.last) / 1000); loop.last = now;
    if (!parts) return;
    const busy = !!drop;
    // 플래터: 재생 중이면 33⅓ rpm까지 0.8초에 올라가고, 멈추면 천천히 선다
    const target = playing && !busy ? RPS * Math.PI * 2 : 0;
    if (!grab) { vel += (target - vel) * Math.min(1, dt * (target ? 2.6 : 1.6)); spin -= vel * dt; }
    parts.platter.rotation.y = spin;
    // 톤암: 판을 가는 중엔 쉼 자리, 재생 중이면 곡 진행에 따라 안쪽으로. 움직이는 동안엔 들려 있다
    const yawT = playing && !busy && !grab ? yawFor(GO_R - clamp01(progress) * (GO_R - GI_R)) : grab ? yaw : playing && !busy ? yaw : 0;
    const far = Math.abs(yawT - yaw) > 0.012;
    // 들림: 옮길 땐 LIFT_UP, 판 위에선 LIFT_ON(판 높이만큼), 쉴 땐 0
    const liftT = far ? LIFT_UP : yawT !== 0 ? LIFT_ON : 0;
    lift += (liftT - lift) * Math.min(1, dt * 7);
    if (!far || lift > LIFT_UP * 0.85) yaw += (yawT - yaw) * Math.min(1, dt * (far ? 3.2 : 1.5));
    parts.yaw.rotation.y = yaw;
    parts.lift.rotation.x = -lift;
    if (drop) stepDrop(now);
    night += (nightT - night) * Math.min(1, dt * 2.2);
    scene.environmentIntensity = lerp(1, 0.1, night);
    key.intensity = lerp(1.1, 0.06, night);
    spot.intensity = lerp(0, 3.2, night); spot.color.lerp(tintC, Math.min(1, dt * 1.5));
    armLamp.intensity = lerp(0, 0.5, night);
    if (D._glow) { D._glow.intensity = lerp(0.35, 1.6, night); D._glow.distance = lerp(0.5, 1.1, night); }
    renderer.toneMappingExposure = lerp(1.05, 1.25, night);
    // 쾅 흔들림
    if (shakeT >= 0) {
      const t = (now - shakeT) / 380;
      if (t >= 1) { deck.position.set(0, 0, 0); deck.rotation.z = 0; shakeT = -1; }
      else { const a = (1 - t) * (1 - t); deck.position.set(Math.sin(t * 60) * 0.018 * a, -Math.abs(Math.sin(t * 30)) * 0.012 * a, Math.cos(t * 47) * 0.012 * a); deck.rotation.z = Math.sin(t * 41) * 0.006 * a; }
    }
    renderer.render(scene, cam);
    requestAnimationFrame(loop);
  }

  // ---------- 판 갈아 끼우기 ----------
  // 앨범(3초): 옛 판이 들려 사라짐 → 슬리브가 들어와 판을 꺼냄 → 슬리브는 빠지고 판이 플래터 위로 와서 2.52초에 내려앉음
  // 플레이리스트(1.9초): 클립보드가 위에서 날아와 0.646초에 쾅 → 튐 → 옆으로 걷어내면 밑에 새 판
  function stepDrop(now) {
    const d = drop, T = d.slam ? 1900 : 3000, t = (D._at != null ? D._at : now - d.t0) / T; // D._at: 화면 확인용으로 시점 고정(ms)
    const P = PLATTER, wp = (x, y, z) => new THREE.Vector3(P.x + x, y, P.z + z);
    if (d.old) { const k = seg(t, 0, d.slam ? 0.3 : 0.12); d.old.position.y = REC_Y + easeIn(k) * (d.slam ? 0 : 0.5); d.old.userData.mats.forEach((m) => { m.transparent = true; m.opacity = 1 - k; }); if (k >= 1) { d.old.parent && d.old.parent.remove(d.old); d.old = null; } }
    if (!d.slam) {
      const s = d.sleeve, disc = d.disc;
      // 슬리브: 오른쪽 위에서 들어와 플래터 위 높이 0.55에 머물다 오른쪽으로 빠짐
      const inK = easeOut(seg(t, 0, 0.16)), outK = easeIn(seg(t, 0.5, 0.7));
      s.position.copy(wp(lerp(1.6, 0.4, inK) + outK * 1.3, 0.34 + outK * 0.12, lerp(-0.1, 0.02, inK)));
      s.rotation.set(-Math.PI / 2 + 0.25, 0, lerp(0.5, -0.06, inK) + outK * 0.4);
      s.visible = t < 0.72;
      // 판: 슬리브 속에서 왼쪽으로 빠져나옴 → 플래터 위로 → 내려앉음
      const pullK = ease(seg(t, 0.16, 0.44)), toK = ease(seg(t, 0.44, 0.76)), downK = easeIn(seg(t, 0.76, 0.84));
      const sx = s.position.x - P.x, sz = s.position.z - P.z;
      const px = lerp(sx, sx - 0.75, pullK), pz = sz;
      // 판을 플래터에 붙인 뒤(handed)엔 더 건드리지 않는다. 플래터 안 좌표에 세계 좌표를 넣으면 판이 한쪽으로 쏠려 돈다
      if (!d.handed) {
        disc.position.copy(wp(lerp(px, 0, toK), lerp(lerp(0.328, 0.38, pullK), REC_Y + 0.12, toK) - downK * 0.12, lerp(pz, 0, toK)));
        disc.rotation.set(lerp(-Math.PI / 2 + 0.25 + Math.PI / 2, 0, toK), lerp(0, -Math.PI * 2, ease(seg(t, 0.16, 0.84))), 0);
        disc.visible = t >= 0.16;
      }
    } else {
      const c = d.sleeve, disc = d.disc;
      const fall = seg(t, 0.07, 0.34), bounce = seg(t, 0.34, 0.47), flick = easeIn(seg(t, 0.55, 0.72));
      const y = t < 0.34 ? lerp(2.2, 0.14, easeIn(fall)) : 0.14 + Math.sin(bounce * Math.PI) * 0.07;
      c.position.copy(wp(lerp(-0.9, 0, easeIn(fall)) + flick * 2.2, y + flick * 0.25, lerp(-0.6, 0.02, easeIn(fall)) + flick * 0.3));
      c.rotation.set(-Math.PI / 2 + lerp(-0.9, 0, fall), 0, lerp(-0.7, -0.07, fall) - Math.sin(bounce * Math.PI) * 0.04 + flick * 0.9);
      c.visible = t < 0.74 && t > 0.0;
      if (!d.handed) { disc.visible = t >= 0.34; disc.position.copy(wp(0, REC_Y, 0)); disc.rotation.set(0, lerp(0, -Math.PI * 2, ease(seg(t, 0.34, 0.76))), 0); }
    }
    // 내려앉는 순간: 새 판을 플래터에 붙인다(회전은 지금 플래터 각도 기준 0)
    const hand = d.slam ? 0.76 : 0.84;
    if (t >= hand && !d.handed) {
      d.handed = true;
      const disc = d.disc; scene.remove(disc);
      if (record && record.parent) record.parent.remove(record);
      const ry = disc.rotation.y - parts.platter.rotation.y;
      record = disc; record.position.set(0, REC_Y, 0); record.rotation.set(0, ry, 0); parts.platter.add(record);
      labelKey = d.key; vel = 0;
    }
    if (t >= 1) { scene.remove(d.sleeve); drop = null; }
  }

  // 판 갈기 준비 중(표지 그림을 기다리는 동안)에는 플래터 위 옛 판 라벨을 바꾸지 않는다
  let preparing = 0;
  D.drop = async (a, slam) => {
    const my = ++preparing;
    if (drop) { scene.remove(drop.sleeve); if (!drop.handed) scene.remove(drop.disc); drop = null; }
    const img = await Promise.race([loadImg(a.img), new Promise((r) => setTimeout(() => r(null), 250))]);
    if (my !== preparing) return; // 그 사이 다른 판으로 또 바뀜
    const disc = makeRecord();
    const L = { name: a.name, artist: a.artist, img: a.img };
    drawRecord(disc.userData.R, L, img); if (!img) loadImg(a.img).then((im) => im && drawRecord(disc.userData.R, L, im));
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(slam ? 1.24 : 1.26, slam ? 1.3 : 1.26, slam ? 0.03 : 0.012), slam ? [side, side, side, side, clipMat(a, img), side] : [side, side, side, side, coverMat(img, a), side]);
    scene.add(sleeve); scene.add(disc); sleeve.visible = false; disc.visible = false;
    // 옛 판: 플래터에서 떼어 장면에 두고 사라지게
    let old = null;
    if (record) { old = record; const wpos = new THREE.Vector3(); old.getWorldPosition(wpos); old.parent.remove(old); old.position.copy(wpos); scene.add(old); record = null; }
    label = L;
    drop = { t0: performance.now(), slam: !!slam, sleeve, disc, old, handed: false, key: [L.name, L.artist, L.img, ''].join('|') };
    preparing = 0;
  };
  D.setPlaying = (on, prog) => { playing = !!on; if (Number.isFinite(prog)) progress = prog; };
  D.setNight = (on) => { nightT = on ? 1 : 0; };
  // 앨범 대표색: 밤 조명이 그 색을 조금 머금는다
  const warm = new THREE.Color(0xffd8a8), tintC = new THREE.Color(0xffd8a8);
  D.setTint = (hex) => { tintC.copy(warm).lerp(new THREE.Color(hex || '#ffd8a8'), 0.45); };
  D.grabbing = () => !!grab;
  D.setLabel = (L) => { label = L; if (!drop && !preparing && record) applyLabel(); };
  D.shake = () => { shakeT = performance.now(); };
  D._dbg = () => ({ scene, parts, record, cam });
}
