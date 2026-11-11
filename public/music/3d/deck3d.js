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
const YAW_PLAY = -0.355, YAW_END = -0.65;              // 톤암: 판 바깥 홈(반지름 0.56) ~ 안쪽(0.3)
const LIFT_ON = 0, LIFT_UP = 0.05;                     // 톤암 들림(라디안): 판 위(바늘이 판에 닿음) · 옮길 때
const ARM_H = 0.146;                                   // 톤암 관 높이(축 기준 세계 높이)
const HEAD = new THREE.Vector3(-0.165, 0, 0.92);        // 축에서 바늘까지(톤암 관절 좌표)
const RPS = 33.333 / 60;                               // 33⅓ rpm

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
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(-1.5, 3, 1.5); scene.add(key);
  const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 50);

  const deck = new THREE.Group(); scene.add(deck);

  // 받침(본체 밑 두께): AI 모델은 얇은 판이라 하얀 상자를 밑에 댄다
  const plinth = new THREE.Mesh(new RoundedBoxGeometry(1.79, 0.17, 1.46, 4, 0.03), new THREE.MeshStandardMaterial({ color: 0xe9e9e7, roughness: 0.42, metalness: 0.0 }));
  plinth.position.set(0, -0.085 + 0.005, 0); deck.add(plinth);
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
    for (let r = 200; r < 505; r += 2.2) { g.strokeStyle = `rgba(255,255,255,${0.018 + (Math.sin(r * 0.37) + 1) * 0.012})`; g.lineWidth = 1; g.beginPath(); g.arc(m, m, r, 0, 7); g.stroke(); }
    for (const rr of [300, 380, 450]) { g.strokeStyle = 'rgba(0,0,0,.8)'; g.lineWidth = 4; g.beginPath(); g.arc(m, m, rr, 0, 7); g.stroke(); }
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
    g.add(body, top);
    g.userData.R = R; g.userData.mats = [black, top.material];
    return g;
  }

  // 슬리브(앨범 표지)와 클립보드(플레이리스트)
  function coverMat(img) {
    const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
    g.fillStyle = '#2b2b30'; g.fillRect(0, 0, 512, 512); if (img) g.drawImage(img, 0, 0, 512, 512);
    g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 3; g.beginPath(); g.arc(256, 256, 220, 0, 7); g.stroke();
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
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 });
  }
  const side = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.8 });

  // 플래터: 알루미늄 원판(옆면에 스트로브 점 4줄) + 고무 매트 + 가운데 축 + 밑 그림자
  function strobeTexture() {
    const c = document.createElement('canvas'); c.width = 4096; c.height = 128; const g = c.getContext('2d');
    const al = g.createLinearGradient(0, 0, 0, 128); al.addColorStop(0, '#f2f3f5'); al.addColorStop(0.5, '#b9bdc3'); al.addColorStop(1, '#8d9197');
    g.fillStyle = al; g.fillRect(0, 0, 4096, 128);
    [[180, 22], [183, 48], [135, 74], [133, 100]].forEach(([n, y]) => {
      const w = 4096 / n;
      for (let i = 0; i < n; i++) { g.fillStyle = '#2b2d33'; g.fillRect(i * w + w * 0.3, y - 8, w * 0.4, 16); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(i * w + w * 0.3, y - 8, w * 0.4, 3); }
    });
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
  }
  function buildPlatter(node) {
    const H = PL_TOP - PLATE - 0.006;
    const alu = new THREE.MeshStandardMaterial({ color: 0xd9dce0, metalness: 0.85, roughness: 0.32 });
    const sideM = new THREE.MeshStandardMaterial({ map: strobeTexture(), metalness: 0.75, roughness: 0.35 });
    const pl = new THREE.Mesh(new THREE.CylinderGeometry(PL_R, PL_R - 0.006, H, 128, 1), [sideM, alu, alu]);
    pl.position.y = PL_TOP - H / 2; node.add(pl);
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
    const stub = add(new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.17, 16), chrome), 0, ARM_H, -0.1); stub.rotation.x = Math.PI / 2;
    const cw = add(new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.095, 32), satin), 0, ARM_H, -0.165); cw.rotation.x = Math.PI / 2;
    const cwr = add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.014, 32), black), 0, ARM_H, -0.128); cwr.rotation.x = Math.PI / 2;
    // S자 관: 축 → 앞으로 곧게 → 끝에서 안쪽으로 휜다
    const hx = HEAD.x, hz = HEAD.z;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, ARM_H, 0.02), new THREE.Vector3(0.012, ARM_H, 0.3), new THREE.Vector3(0.03, ARM_H - 0.004, 0.55),
      new THREE.Vector3(-0.02, ARM_H - 0.01, 0.74), new THREE.Vector3(hx + 0.035, ARM_H - 0.016, hz - 0.11),
    ]);
    lift.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.016, 16, false), chrome));
    // 헤드셸(관 끝에서 비스듬히) + 카트리지 + 손잡이
    const hs = new THREE.Group(); hs.position.set(hx + 0.035, ARM_H - 0.016, hz - 0.11); hs.rotation.y = -0.38; lift.add(hs);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.013, 0.14), black), 0, 0, 0.07, hs);
    const cart = add(new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.034, 0.064), new THREE.MeshStandardMaterial({ color: 0xc8102e, roughness: 0.45 })), 0, -0.023, 0.085, hs);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.014, 0.026), black), 0, -0.044, 0.1, hs);
    const fl = add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.006, 0.016), chrome), 0.05, 0.006, 0.11, hs); fl.rotation.z = 0.35;
    // 바늘 끝(헤드셸 기준 -0.051)이 판 윗면(REC_Y + 0.004 = 0.078)에 닿도록 ARM_H = 0.078 + 0.016 + 0.051 + 여유
    void cart;
    // 받침대(쉴 때 관이 얹히는 기둥) — 본체에 고정
    const restW = new THREE.Vector3(0.012, 0, 0.45).add(yawNode.position);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, ARM_H - 0.03 - PLATE, 16), satin), restW.x, PLATE + (ARM_H - 0.03 - PLATE) / 2, restW.z, deck);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.012, 0.03), black), restW.x, ARM_H - 0.026, restW.z, deck);
  }

  let parts = null, record = null, label = null, labelKey = '';
  let playing = false, progress = 0, spin = 0, vel = 0, yaw = 0, lift = 0;
  let drop = null; // { t0, slam, sleeve, disc, done }
  let shakeT = -1;

  new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(new URL('./deck.glb', import.meta.url).href, (g) => {
    const root = g.scene;
    // AI 텍스처의 잔주름(노멀맵)이 지저분해 보여 약하게
    root.traverse((o) => { if (o.isMesh) { o.material.side = THREE.FrontSide; o.material.envMapIntensity = 0.9; o.material.normalScale && o.material.normalScale.set(0.3, 0.3); } });
    deck.add(root);
    // 빈 platter 노드는 압축(prune) 때 지워질 수 있어 없으면 만든다
    let platter = root.getObjectByName('platter');
    if (!platter) { platter = new THREE.Group(); platter.name = 'platter'; platter.position.copy(PLATTER); root.add(platter); }
    parts = { platter, yaw: root.getObjectByName('armYaw'), lift: root.getObjectByName('armLift') };
    buildPlatter(parts.platter);
    buildArm(parts.lift, parts.yaw);
    record = makeRecord(); record.position.set(0, REC_Y, 0); parts.platter.add(record);
    applyLabel();
    D.ok = true;
    document.body.classList.add('d3');
    resize();
    loop.last = performance.now(); requestAnimationFrame(loop);
  }, undefined, (e) => { D.ok = false; console.error('deck3d', e); });

  function applyLabel(target = record) {
    const L = label, key = L ? [L.name, L.artist, L.img].join('|') : '';
    if (target === record && key === labelKey) return;
    if (target === record) labelKey = key;
    drawRecord(target.userData.R, L, null);
    loadImg(L && L.img).then((img) => { if (img && (target !== record || labelKey === key)) drawRecord(target.userData.R, L, img); });
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
    vel += (target - vel) * Math.min(1, dt * (target ? 2.6 : 1.6));
    spin -= vel * dt;
    parts.platter.rotation.y = spin;
    // 톤암: 판을 가는 중엔 쉼 자리, 재생 중이면 곡 진행에 따라 안쪽으로. 움직이는 동안엔 들려 있다
    const yawT = playing && !busy ? lerp(YAW_PLAY, YAW_END, clamp01(progress)) : 0;
    const far = Math.abs(yawT - yaw) > 0.012;
    // 들림: 옮길 땐 LIFT_UP, 판 위에선 LIFT_ON(판 높이만큼), 쉴 땐 0
    const liftT = far ? LIFT_UP : yawT !== 0 ? LIFT_ON : 0;
    lift += (liftT - lift) * Math.min(1, dt * 7);
    if (!far || lift > LIFT_UP * 0.85) yaw += (yawT - yaw) * Math.min(1, dt * (far ? 3.2 : 1.5));
    parts.yaw.rotation.y = yaw;
    parts.lift.rotation.x = -lift;
    if (drop) stepDrop(now);
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

  D.drop = async (a, slam) => {
    if (drop) { scene.remove(drop.sleeve); if (!drop.handed) scene.remove(drop.disc); drop = null; }
    const img = await Promise.race([loadImg(a.img), new Promise((r) => setTimeout(() => r(null), 250))]);
    const disc = makeRecord();
    const L = { name: a.name, artist: a.artist, img: a.img };
    drawRecord(disc.userData.R, L, img); if (!img) loadImg(a.img).then((im) => im && drawRecord(disc.userData.R, L, im));
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(slam ? 1.24 : 1.26, slam ? 1.3 : 1.26, slam ? 0.03 : 0.012), slam ? [side, side, side, side, clipMat(a, img), side] : [side, side, side, side, coverMat(img), side]);
    scene.add(sleeve); scene.add(disc); sleeve.visible = false; disc.visible = false;
    // 옛 판: 플래터에서 떼어 장면에 두고 사라지게
    let old = null;
    if (record) { old = record; const wpos = new THREE.Vector3(); old.getWorldPosition(wpos); old.parent.remove(old); old.position.copy(wpos); scene.add(old); record = null; }
    label = L;
    drop = { t0: performance.now(), slam: !!slam, sleeve, disc, old, handed: false, key: [L.name, L.artist, L.img].join('|') };
  };
  D.setPlaying = (on, prog) => { playing = !!on; if (Number.isFinite(prog)) progress = prog; };
  D.setLabel = (L) => { label = L; if (!drop && record) applyLabel(); };
  D.shake = () => { shakeT = performance.now(); };
  D._dbg = () => ({ scene, parts, record, cam });
}
