// 잼 배경(2026-11-12 사용자 요청): 어둑한 망망대해 위 낚싯배. 카세트 라디오는 갑판 위 나무 생선 상자에 놓여 있다
// - 하늘: 해 진 뒤 남은 빛(지평선만 희미하게 따뜻함) + 별 + 달. 바다: 물결 셰이더(사인파 4개, 달빛 반짝임, 먼 곳은 안개)
// - 배: 갑판 널, 뱃전(양옆·뒤), 밧줄 사리, 등불(따뜻한 점광원, 깜빡임). 바다·하늘이 천천히 기울고 오르내린다(배가 흔들리는 느낌)
// - 음표: 재생 중 스피커에서 ♪ ♫ 가 피어올라 흔들리며 사라진다
// - 분위기(2026-11-12 사용자 요청 'Loan Shark 느낌'): 탁한 초록빛 밤바다 · 짙은 안개 · 흐린 달. 화면은 boombox.js가 낮은 해상도로 그려 픽셀이 보이게(PS1 느낌)
// - 황제펭귄: 갑판 오른쪽. 음악에 맞춰 까딱, 곡을 넣을 때 폴짝 + 날개 퍼덕(peng.act)
// buildSea(THREE, { scene, r, R, key, floor, hub, FZ, tex }) → { update(now, dt, playing), lantern, peng: { act(), head() } }
export function buildSea(THREE, o) {
  const { scene, r, R, key, floor, hub, FZ, tex } = o;
  const std = (x) => new THREE.MeshStandardMaterial(x);
  const SKY = { zen: new THREE.Color('#030505'), up: new THREE.Color('#070c0c'), hor: new THREE.Color('#172120'), glow: new THREE.Color('#2b2a25'), low: new THREE.Color('#060a0a') };
  const moonDir = new THREE.Vector3(0.55, 0.32, -1).normalize();

  // 어둑하게: 반사 환경을 줄이고 빛을 달빛(차갑게) + 등불(따뜻하게)로
  r.toneMappingExposure = 0.92;
  scene.environmentIntensity = 0.32;
  scene.fog = new THREE.FogExp2(new THREE.Color('#0c1312'), 0.02);
  key.color.set('#b4c2b8'); key.intensity = 0.6; key.position.set(-2.5, 4.5, 3.5);
  const rim = new THREE.DirectionalLight('#7e9a92', 0.8); rim.position.set(3, 2.5, -6); scene.add(rim);
  scene.add(new THREE.HemisphereLight('#2a3550', '#1a1410', 0.35));
  floor.visible = false;

  const W = new THREE.Group(); scene.add(W); // 바다·하늘(배가 흔들리면 이쪽이 기운다)

  // ---- 하늘 ----
  const skyGLSL = `
    vec3 skyCol(vec3 d) {
      float y = d.y;
      vec3 c = mix(${v(SKY.hor)}, ${v(SKY.up)}, smoothstep(0.0, 0.25, y));
      c = mix(c, ${v(SKY.zen)}, smoothstep(0.25, 0.8, y));
      c += ${v(SKY.glow)} * exp(-abs(y) * 22.0) * 0.7;           // 지평선에 남은 빛
      c = mix(c, ${v(SKY.low)}, smoothstep(0.0, -0.06, y));
      float m = max(dot(d, moonD), 0.0);
      c += vec3(0.62, 0.66, 0.6) * (pow(m, 700.0) * 1.6 + pow(m, 40.0) * 0.1 + pow(m, 6.0) * 0.035); // 흐린 달 + 달무리
      return c;
    }`;
  function v(c) { return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`; }
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
    uniforms: { moonD: { value: moonDir } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform vec3 moonD; varying vec3 vW; ${skyGLSL} void main(){ vec3 d = normalize(vW - cameraPosition); gl_FragColor = vec4(skyCol(d), 1.0); }`,
  }));
  sky.renderOrder = -2; W.add(sky);
  // 별
  {
    const n = 700, p = new Float32Array(n * 3), s = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * Math.PI * 2, y = 0.08 + Math.pow(Math.random(), 0.7) * 0.92, rr = Math.sqrt(1 - y * y);
      p.set([Math.cos(u) * rr * 280, y * 280, Math.sin(u) * rr * 280], i * 3); s[i] = Math.random();
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('s', new THREE.BufferAttribute(s, 1));
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, toneMapped: false, uniforms: { t: { value: 0 }, px: { value: 1 } },
      vertexShader: 'attribute float s; uniform float t; uniform float px; varying float a; void main(){ a = (0.25 + 0.75 * s) * (0.7 + 0.3 * sin(t * (1.0 + s * 3.0) + s * 40.0)); vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = (1.0 + s * 1.6) * px; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying float a; void main(){ vec2 q = gl_PointCoord - 0.5; float d = length(q); if (d > 0.5) discard; gl_FragColor = vec4(vec3(0.8,0.85,0.8), a * 0.45 * (1.0 - d * 2.0)); }' });
    const pts = new THREE.Points(g, m); pts.renderOrder = -1; W.add(pts); W.userData.stars = m;
  }

  // ---- 바다 ----
  const seaY = -2.35;
  const sg = new THREE.PlaneGeometry(260, 260, 160, 160); sg.rotateX(-Math.PI / 2);
  const sea = new THREE.Mesh(sg, new THREE.ShaderMaterial({
    fog: false, toneMapped: false,
    uniforms: { t: { value: 0 }, moonD: { value: moonDir }, lamp: { value: new THREE.Vector3(-2.1, -1.2, 0.6) } },
    vertexShader: `uniform float t; varying vec3 vW; varying vec3 vN;
      // 물결 = 사인파 합. 높이와 기울기(법선)를 같이 구한다(면이 각져 보이지 않게)
      vec3 g = vec3(0.0);
      void wave(vec2 p, vec2 d, float k, float sp, float a){ d = normalize(d); float ph = dot(p, d) * k + t * sp; g.x += sin(ph) * a; g.yz += d * cos(ph) * a * k; }
      void main(){ vec3 p = position;
        float fall = 1.0 / (1.0 + length(p.xz) * 0.006);
        wave(p.xz, vec2(1.0,0.3), 0.32, 0.9, 0.22); wave(p.xz, vec2(-0.4,1.0), 0.55, 1.3, 0.11); wave(p.xz, vec2(0.7,-0.8), 1.3, 2.1, 0.035); wave(p.xz, vec2(-1.0,-0.2), 2.4, 2.9, 0.016);
        p.y += g.x * fall;
        vN = normalize(mat3(modelMatrix) * normalize(vec3(-g.y * fall, 1.0, -g.z * fall)));
        vec4 w = modelMatrix * vec4(p,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float t; uniform vec3 moonD; uniform vec3 lamp; varying vec3 vW; varying vec3 vN; ${skyGLSL}
      void main(){
        vec3 n = normalize(vN);
        vec3 vd = normalize(cameraPosition - vW);
        float fr = 0.03 + 0.97 * pow(1.0 - max(dot(n, vd), 0.0), 5.0);
        vec3 rd = reflect(-vd, n); rd.y = abs(rd.y);
        vec3 c = mix(vec3(0.010, 0.030, 0.026), skyCol(rd) * 1.1, fr * 0.9);
        float sp = max(dot(reflect(-vd, n), moonD), 0.0);
        c += vec3(0.7, 0.74, 0.66) * (pow(sp, 200.0) * 1.3 + pow(sp, 24.0) * 0.05);       // 달빛 길
        float ld = length(vW.xz - lamp.xz); c += vec3(1.0, 0.6, 0.3) * 0.18 * exp(-ld * 0.45) * fr * 4.0; // 등불이 물에 비침
        float dist = length(vW - cameraPosition);
        c = mix(c, vec3(0.047, 0.075, 0.07), 1.0 - exp(-dist * 0.03)); // 먼 바다는 안개 속으로
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  sea.position.y = seaY; W.add(sea);

  // ---- 배: 갑판 · 뱃전 · 상자 · 밧줄 · 등불 ----
  const B = new THREE.Group(); scene.add(B);
  const wood = (base, dark, w = 512, h = 128, seed = 1) => tex(w, h, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 90; i++) { g.strokeStyle = `rgba(${dark},${0.08 + rnd() * 0.22})`; g.lineWidth = 0.6 + rnd() * 1.8; g.beginPath(); const y = rnd() * h; g.moveTo(0, y); for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x / 70 + i) * 3 + (rnd() - 0.5) * 2); g.stroke(); }
    for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(${dark},.35)`; g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 6 + rnd() * 8, 3 + rnd() * 3, 0, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,.05)'; for (let i = 0; i < 300; i++) g.fillRect(rnd() * w, rnd() * h, 2, 1);
  });
  const deckM = std({ map: wood('#4a3a2c', '20,12,6', 1024, 128, 3), roughness: 0.85 });
  const hullM = std({ map: wood('#2e4a52', '8,18,20', 512, 128, 7), roughness: 0.8 });
  const railM = std({ map: wood('#b9b2a2', '60,50,40', 512, 64, 9), roughness: 0.75 });
  const crateM = std({ map: wood('#7a5a3a', '40,22,10', 512, 96, 11), roughness: 0.8 });
  const crateD = std({ map: wood('#5e4329', '30,16,6', 512, 96, 13), roughness: 0.85 });
  const box = (w, h, d, m, x, y, z, p = B) => { const k = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); k.position.set(x, y, z); k.castShadow = true; k.receiveShadow = true; p.add(k); return k; };
  const CT = -0.87, CH2 = 1.05, deckY = CT - CH2; // 상자 윗면 = 라디오 바닥
  // 갑판 널(앞뒤 방향)
  for (let i = -9; i <= 9; i++) box(0.36, 0.06, 18, deckM, i * 0.38, deckY - 0.03, 4.5).rotation.y = (i % 3) * 0.002;
  // 뱃전: 뒤(바다 쪽) + 양옆, 위에 흰 난간
  const BY = deckY + 0.55;
  box(7.4, 1.1, 0.14, hullM, 0, deckY + 0.5, -2.6); box(7.6, 0.08, 0.3, railM, 0, BY + 0.5, -2.6);
  for (const sx of [-1, 1]) { box(0.14, 1.1, 16, hullM, sx * 3.7, deckY + 0.5, 5.4); box(0.3, 0.08, 16, railM, sx * 3.7, BY + 0.5, 5.4); }
  for (let i = -3; i <= 3; i++) box(0.08, 1.12, 0.08, railM, i * 1.2, deckY + 0.5, -2.5); // 뒤 뱃전 기둥
  // 생선 상자: 널 3줄 · 모서리 기둥 · 윗면 널
  const C = new THREE.Group(); C.position.set(0, deckY, 0); B.add(C);
  const CW = 2.7, CD = 1.25;
  for (let k = 0; k < 3; k++) {
    const y = 0.17 + k * 0.34;
    box(CW, 0.28, 0.05, crateM, 0, y, CD / 2, C); box(CW, 0.28, 0.05, crateM, 0, y, -CD / 2, C);
    box(0.05, 0.28, CD, crateM, CW / 2, y, 0, C); box(0.05, 0.28, CD, crateM, -CW / 2, y, 0, C);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.09, CH2, 0.09, crateD, sx * (CW / 2 - 0.02), CH2 / 2, sz * (CD / 2 - 0.02), C);
  for (let k = 0; k < 6; k++) { const s = box(CW + 0.04, 0.045, CD / 6 - 0.015, crateM, 0, CH2 - 0.02, -CD / 2 + CD / 12 + k * CD / 6, C); s.rotation.x = (k % 2 ? 1 : -1) * 0.004; }
  // 상자 앞면 스텐실(번호)
  const sten = tex(512, 128, (g) => { g.clearRect(0, 0, 512, 128); g.fillStyle = 'rgba(230,222,200,.55)'; g.font = '700 70px "JetBrains Mono", monospace'; g.fillText('No.7  ⚓', 40, 92); });
  const sm = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.22), new THREE.MeshStandardMaterial({ map: sten, transparent: true, roughness: 0.9 })); sm.position.set(-0.55, 0.52, CD / 2 + 0.028); C.add(sm);
  // 밧줄 사리(오른쪽 갑판)
  const rope = std({ color: '#8a7a5c', roughness: 0.95 });
  for (let i = 0; i < 5; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.42 - i * 0.03, 0.045, 10, 40), rope); t.rotation.x = Math.PI / 2; t.position.set(-2.75, deckY + 0.05 + i * 0.075, -1.2); t.castShadow = t.receiveShadow = true; B.add(t); }
  // 등불(왼쪽 갑판): 받침 · 유리 · 불빛
  const L = new THREE.Group(); L.position.set(-2.05, deckY, 0.55); B.add(L);
  const iron = std({ color: '#2a2622', metalness: 0.6, roughness: 0.5 });
  box(0.36, 0.06, 0.36, iron, 0, 0.03, 0, L); box(0.3, 0.05, 0.3, iron, 0, 0.66, 0, L);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.025, 0.62, 0.025, iron, sx * 0.13, 0.35, sz * 0.13, L);
  const glassL = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.5, 24), new THREE.MeshPhysicalMaterial({ color: '#ffd9a0', transparent: true, opacity: 0.35, roughness: 0.1, emissive: '#ff9a40', emissiveIntensity: 0.6 })); glassL.position.y = 0.36; L.add(glassL);
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), new THREE.MeshBasicMaterial({ color: '#ffd38a' })); flame.scale.y = 1.6; flame.position.y = 0.34; L.add(flame);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.012, 8, 24), iron); ring.position.y = 0.76; L.add(ring);
  const lantern = new THREE.PointLight('#ffae5c', 7, 9, 1.6); lantern.position.set(0, 0.4, 0); L.add(lantern);
  // 등불 빛무리
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 2, 64, 64, 64); gr.addColorStop(0, 'rgba(255,190,110,.9)'); gr.addColorStop(0.25, 'rgba(255,150,70,.25)'); gr.addColorStop(1, 'rgba(255,120,40,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.set(1.3, 1.3, 1); halo.position.y = 0.38; L.add(halo);

  // ---- 황제펭귄(갑판 오른쪽): 음악에 맞춰 까딱이고, 혼자 있을 때 곡을 골라 넣는다(act) ----
  const P = new THREE.Group(); P.position.set(2.05, deckY, 0.55); P.rotation.y = -0.6; B.add(P);
  const pm = (c, rgh = 0.55) => std({ color: c, roughness: rgh });
  const blk = pm('#12161d', 0.45), wht = pm('#ece4d2', 0.7), ylw = pm('#f0cf7a', 0.6), org = pm('#ef9a35', 0.5), feetM = pm('#3b2c22', 0.8);
  const sph = (rr, m, sx, sy, sz, x, y, z, parent) => { const k = new THREE.Mesh(new THREE.SphereGeometry(rr, 20, 14), m); k.scale.set(sx, sy, sz); k.position.set(x, y, z); k.castShadow = true; k.receiveShadow = true; (parent || P).add(k); return k; };
  const body = new THREE.Group(); P.add(body);
  sph(0.5, blk, 1, 1.75, 0.86, 0, 0.86, 0, body);
  sph(0.47, wht, 0.86, 1.62, 0.62, 0, 0.8, 0.17, body);
  sph(0.3, ylw, 0.95, 0.55, 0.5, 0, 1.3, 0.27, body);
  const head = new THREE.Group(); head.position.set(0, 1.66, 0.02); body.add(head);
  sph(0.3, blk, 1, 1, 1.05, 0, 0, 0, head);
  for (const sx of [-1, 1]) {
    sph(0.12, org, 0.45, 1.15, 0.8, sx * 0.25, -0.1, 0.07, head).rotation.z = sx * 0.3;
    const eye = sph(0.028, pm('#050505', 0.15), 1, 1, 0.7, sx * 0.13, 0.07, 0.26, head); eye.material.metalness = 0.3;
    sph(0.009, new THREE.MeshBasicMaterial({ color: '#ffffff' }), 1, 1, 1, sx * 0.13 + 0.008, 0.08, 0.285, head);
  }
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.34, 14), blk); beak.rotation.x = Math.PI / 2 + 0.25; beak.position.set(0, -0.04, 0.4); head.add(beak);
  const bstripe = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.2, 10), org); bstripe.rotation.x = Math.PI / 2 + 0.25; bstripe.position.set(0, -0.075, 0.33); head.add(bstripe);
  const fl = [];
  for (const sx of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(sx * 0.44, 1.32, 0); body.add(piv);
    const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.62, 6, 12), blk); f.scale.set(1, 1, 0.35); f.position.y = -0.38; f.castShadow = true; piv.add(f);
    piv.rotation.z = sx * 0.18; piv.userData.sx = sx; fl.push(piv);
  }
  for (const sx of [-1, 1]) sph(0.11, feetM, 1, 0.35, 1.5, sx * 0.16, 0.035, 0.22, P);
  let actT = -1e9;
  const headW = new THREE.Vector3();
  const peng = {
    act() { actT = performance.now(); },
    head() { head.getWorldPosition(headW); return headW; },
    update(now, t, playing) {
      const k = (now - actT) / 1700, acting = k >= 0 && k < 1;
      const beat = Math.abs(Math.sin(t * Math.PI * 1.9));
      body.rotation.z = Math.sin(t * 0.9) * 0.03 + (playing ? Math.sin(t * Math.PI * 0.95) * 0.06 : 0);
      body.position.y = (playing ? beat * 0.035 : 0) + (acting ? Math.sin(Math.PI * Math.min(1, k * 2)) * 0.32 : 0);
      body.scale.y = 1 + Math.sin(t * 2.1) * 0.008;
      head.rotation.y = acting ? 0.55 : Math.sin(t * 0.27) * 0.45 + (playing ? 0 : 0.15);
      head.rotation.x = playing ? -0.05 + Math.sin(t * Math.PI * 1.9) * 0.09 : Math.sin(t * 0.5) * 0.04;
      for (const f of fl) {
        const sx = f.userData.sx;
        f.rotation.z = sx * (0.18 + (acting ? 0.9 * Math.abs(Math.sin(k * Math.PI * 6)) : playing ? 0.12 + beat * 0.12 : 0.02 * Math.sin(t * 1.3)));
      }
    },
  };

  // ---- 음표 ----
  const glyphs = ['♪', '♫', '♬', '♩'].map((ch) => tex(128, 128, (g) => {
    g.clearRect(0, 0, 128, 128); g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '700 92px "Noto Sans KR", "Segoe UI Symbol", serif';
    g.shadowColor = 'rgba(255,214,150,.9)'; g.shadowBlur = 18; g.fillStyle = '#fff4dc'; g.fillText(ch, 64, 66); g.shadowBlur = 0; g.fillText(ch, 64, 66);
  }));
  const notes = [];
  for (let i = 0; i < 26; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glyphs[i % 4], transparent: true, depthWrite: false, opacity: 0 })); s.visible = false; scene.add(s); notes.push({ s, life: 0 }); }
  const origin = new THREE.Vector3();
  let nextNote = 0;
  function emit(now) {
    const n = notes.find((x) => x.life <= 0); if (!n) return;
    hub.getWorldPosition(origin);
    const a = Math.random() * Math.PI * 2, rr = 0.1 + Math.random() * 0.32;
    n.p0 = origin.clone().add(new THREE.Vector3(Math.cos(a) * rr, Math.sin(a) * rr, 0.08));
    n.v = new THREE.Vector3((Math.random() - 0.3) * 0.35, 0.45 + Math.random() * 0.35, 0.25 + Math.random() * 0.3);
    n.sway = 0.6 + Math.random() * 1.2; n.ph = Math.random() * 6; n.t0 = now; n.dur = 2600 + Math.random() * 1600; n.life = 1;
    n.size = 0.17 + Math.random() * 0.12; n.s.material.map = glyphs[(Math.random() * 4) | 0]; n.s.material.rotation = (Math.random() - 0.5) * 0.5; n.s.visible = true;
  }

  const still = matchMedia('(prefers-reduced-motion: reduce)');
  function update(now, dt, playing) {
    const t = now / 1000;
    sea.material.uniforms.t.value = t; W.userData.stars.uniforms.t.value = t; W.userData.stars.uniforms.px.value = r.getPixelRatio();
    // 배 흔들림: 바다·하늘을 기울여서(카메라는 배에 있다)
    if (!still.matches) { W.rotation.z = Math.sin(t * 0.42) * 0.022 + Math.sin(t * 0.17) * 0.01; W.rotation.x = Math.sin(t * 0.31 + 1) * 0.012; W.position.y = Math.sin(t * 0.55) * 0.12; }
    // 등불 깜빡임
    const f = 0.85 + 0.1 * Math.sin(t * 9.3) * Math.sin(t * 4.1) + 0.05 * Math.sin(t * 23.0);
    lantern.intensity = 7 * f; flame.scale.set(1, 1.6 * (0.92 + 0.12 * f), 1); halo.material.opacity = 0.75 + 0.25 * f;
    peng.update(now, t, playing);
    // 음표
    if (playing && !still.matches && now > nextNote) { emit(now); nextNote = now + 280 + Math.random() * 520; }
    for (const n of notes) {
      if (n.life <= 0) continue;
      const k = (now - n.t0) / n.dur; if (k >= 1) { n.life = 0; n.s.visible = false; continue; }
      const e = k;
      n.s.position.set(n.p0.x + n.v.x * e * 2.2 + Math.sin(t * n.sway + n.ph) * 0.12 * e, n.p0.y + n.v.y * e * 2.4, n.p0.z + n.v.z * e * 1.6);
      const sz = n.size * (0.6 + Math.min(1, k * 4) * 0.4 + k * 0.4); n.s.scale.set(sz, sz, 1);
      n.s.material.opacity = Math.min(1, k * 6) * (1 - Math.pow(k, 1.6)) * 0.95;
    }
  }
  return { update, lantern, peng, busy: () => notes.some((n) => n.life > 0) };
}
