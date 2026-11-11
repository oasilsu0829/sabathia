/* 음악 앱 3D 턴테이블 (MUS-09).
   deck.glb = AI로 만든 턴테이블을 손본 것: 노드 base(본체) · platter(돌아가는 원판) · armYaw(톤암 좌우 관절) > armLift(톤암 들림 관절)
   만든 법: 로고 지우기, 뒤쪽 뭉개진 면 지우기, 플래터·톤암 떼어 관절 원점으로 옮기기, 면 22%로 줄이기, 텍스처 1024 webp, meshopt 압축
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
const REC_R = 0.555, REC_Y = 0.094;                    // 판 반지름·높이(테두리 위에 얹힌다)
const YAW_PLAY = -0.42, YAW_END = -0.6;                // 톤암: 판 바깥 홈 ~ 안쪽
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
    // 원기둥 윗면 UV가 좌우로 뒤집혀 있어 글자가 거울처럼 보인다 → 뒤집어 준다
    t.wrapS = THREE.RepeatWrapping; t.center.set(0.5, 0.5); t.repeat.set(-1, 1);
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
  function makeRecord() {
    const R = recordTexture();
    const top = new THREE.MeshPhysicalMaterial({ map: R.t, roughness: 0.55, metalness: 0.0, clearcoat: 0.35, clearcoatRoughness: 0.35, envMapIntensity: 0.35 });
    const side = new THREE.MeshStandardMaterial({ color: 0x0b0b0e, roughness: 0.4 });
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(REC_R, REC_R, 0.008, 96), [side, top, side]);
    mesh.userData.R = R;
    return mesh;
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

  let parts = null, record = null, label = null, labelKey = '';
  let playing = false, progress = 0, spin = 0, vel = 0, yaw = 0, lift = 0;
  let drop = null; // { t0, slam, sleeve, disc, done }
  let shakeT = -1;

  new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(new URL('./deck.glb', import.meta.url).href, (g) => {
    const root = g.scene;
    root.traverse((o) => { if (o.isMesh) { o.material.side = THREE.FrontSide; o.material.envMapIntensity = 0.9; } });
    deck.add(root);
    parts = { platter: root.getObjectByName('platter'), yaw: root.getObjectByName('armYaw'), lift: root.getObjectByName('armLift') };
    record = makeRecord(); record.position.set(0, REC_Y, 0); parts.platter.add(record);
    applyLabel();
    D.ok = true;
    document.body.classList.add('d3');
    resize();
    loop.last = performance.now(); requestAnimationFrame(loop);
  }, undefined, () => { D.ok = false; });

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
    const liftT = far ? 1 : 0;
    lift += (liftT - lift) * Math.min(1, dt * 7);
    if (!far || lift > 0.85) yaw += (yawT - yaw) * Math.min(1, dt * (far ? 3.2 : 1.5));
    parts.yaw.rotation.y = yaw;
    parts.lift.rotation.x = -0.045 * lift;
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
    const d = drop, T = d.slam ? 1900 : 3000, t = (now - d.t0) / T;
    const P = PLATTER, wp = (x, y, z) => new THREE.Vector3(P.x + x, y, P.z + z);
    if (d.old) { const k = seg(t, 0, d.slam ? 0.3 : 0.12); d.old.position.y = REC_Y + easeIn(k) * (d.slam ? 0 : 0.5); d.old.material.forEach((m) => { m.transparent = true; m.opacity = 1 - k; }); if (k >= 1) { d.old.parent && d.old.parent.remove(d.old); d.old = null; } }
    if (!d.slam) {
      const s = d.sleeve, disc = d.disc;
      // 슬리브: 오른쪽 위에서 들어와 플래터 위 높이 0.55에 머물다 오른쪽으로 빠짐
      const inK = easeOut(seg(t, 0, 0.16)), outK = easeIn(seg(t, 0.5, 0.7));
      s.position.copy(wp(lerp(1.6, 0.35, inK) + outK * 1.3, 0.55 + outK * 0.2, lerp(-0.4, -0.12, inK)));
      s.rotation.set(-Math.PI / 2 + 0.25, 0, lerp(0.5, -0.06, inK) + outK * 0.4);
      s.visible = t < 0.72;
      // 판: 슬리브 속에서 왼쪽으로 빠져나옴 → 플래터 위로 → 내려앉음
      const pullK = ease(seg(t, 0.16, 0.44)), toK = ease(seg(t, 0.44, 0.76)), downK = easeIn(seg(t, 0.76, 0.84));
      const sx = s.position.x - P.x, sz = s.position.z - P.z;
      const px = lerp(sx, sx - 0.75, pullK), pz = sz;
      disc.position.copy(wp(lerp(px, 0, toK), lerp(lerp(0.538, 0.6, pullK), REC_Y + 0.12, toK) - downK * 0.12, lerp(pz, 0, toK)));
      disc.rotation.set(lerp(-Math.PI / 2 + 0.25 + Math.PI / 2, 0, toK), lerp(0, -Math.PI * 2, ease(seg(t, 0.16, 0.84))), 0);
      disc.visible = t >= 0.16;
    } else {
      const c = d.sleeve, disc = d.disc;
      const fall = seg(t, 0.07, 0.34), bounce = seg(t, 0.34, 0.47), flick = easeIn(seg(t, 0.55, 0.72));
      const y = t < 0.34 ? lerp(2.2, 0.14, easeIn(fall)) : 0.14 + Math.sin(bounce * Math.PI) * 0.07;
      c.position.copy(wp(lerp(-0.9, 0, easeIn(fall)) + flick * 2.2, y + flick * 0.25, lerp(-0.6, 0.02, easeIn(fall)) + flick * 0.3));
      c.rotation.set(-Math.PI / 2 + lerp(-0.9, 0, fall), 0, lerp(-0.7, -0.07, fall) - Math.sin(bounce * Math.PI) * 0.04 + flick * 0.9);
      c.visible = t < 0.74 && t > 0.0;
      disc.visible = t >= 0.34; disc.position.copy(wp(0, REC_Y, 0)); disc.rotation.set(0, lerp(0, -Math.PI * 2, ease(seg(t, 0.34, 0.76))), 0);
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
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(slam ? 1.14 : 1.16, slam ? 1.18 : 1.16, slam ? 0.03 : 0.012), slam ? [side, side, side, side, clipMat(a, img), side] : [side, side, side, side, coverMat(img), side]);
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
}
